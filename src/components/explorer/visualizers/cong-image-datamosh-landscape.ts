import type { AudioSignal } from '../audio-signal';
import { getCachedArtworkImage, preloadArtworkImage } from '../artwork-cache';
import type { Palette } from '../palette';
import type { ExclusionRect, VisualEvent, VisualizerRuntimeContext, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';
import {
  buildParticles,
  clamp01,
  createLowResVectorField,
  drawSoftParticle,
  hasReducedMotion,
  moveFlowParticle,
  type CongParticle,
  type LowResVectorField,
} from './cong-particle-primitives';

function drawCover(ctx: CanvasRenderingContext2D, image: CanvasImageSource, sourceWidth: number, sourceHeight: number, width: number, height: number): void {
  const scale = Math.max(width / Math.max(1, sourceWidth), height / Math.max(1, sourceHeight));
  const scaledWidth = sourceWidth * scale;
  const scaledHeight = sourceHeight * scale;
  ctx.drawImage(image, (width - scaledWidth) * 0.5, (height - scaledHeight) * 0.5, scaledWidth, scaledHeight);
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

const ARTWORK_BLEND_SECONDS = 1.4;

export function createCongImageDatamoshLandscape(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let params: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let audio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let time = 0;
  let frame = 0;
  let sourceCanvas: HTMLCanvasElement;
  let sourceCtx: CanvasRenderingContext2D;
  let fallbackCanvas: HTMLCanvasElement;
  let fallbackCtx: CanvasRenderingContext2D;
  let artworkCanvas: HTMLCanvasElement;
  let artworkCtx: CanvasRenderingContext2D;
  let feedbackCanvas: HTMLCanvasElement;
  let feedbackCtx: CanvasRenderingContext2D;
  let artwork: HTMLImageElement | null = null;
  let artworkUrl: string | undefined;
  let artworkBlend = 0;
  let destroyed = false;
  let pixelReadable = true;
  let previousTransient = 0;
  let revealLift = 0;
  let displacementLift = 0;
  let tintLift = 0;
  let fallbackPresence = 1;
  let particles: CongParticle[] = [];
  let exclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let cue = createCueEventState();
  let bpm = 120;
  let flowField: LowResVectorField = createLowResVectorField(74);

  function paintFallback(ctx: CanvasRenderingContext2D): void {
    const [br, bg, bb] = palette.bgDark;
    const [mr, mg, mb] = palette.bgMid;
    const [ar, ag, ab] = palette.accentGlow;
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, `rgb(${br},${bg},${bb})`);
    gradient.addColorStop(0.52, `rgb(${mr},${mg},${mb})`);
    gradient.addColorStop(1, `rgba(${ar},${ag},${ab},0.28)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  function recomposeSource(): void {
    sourceCtx.clearRect(0, 0, w, h);
    sourceCtx.drawImage(fallbackCanvas, 0, 0);
    if (artwork?.naturalWidth && artwork.naturalHeight && artworkBlend > 0) {
      sourceCtx.save();
      sourceCtx.globalAlpha = smoothstep(artworkBlend);
      sourceCtx.drawImage(artworkCanvas, 0, 0);
      sourceCtx.restore();
    }
  }

  function rebuildSource(resetFeedback: boolean): void {
    fallbackCtx.clearRect(0, 0, w, h);
    paintFallback(fallbackCtx);
    artworkCtx.clearRect(0, 0, w, h);
    if (artwork?.naturalWidth && artwork.naturalHeight) {
      drawCover(artworkCtx, artwork, artwork.naturalWidth, artwork.naturalHeight, w, h);
    }
    recomposeSource();
    if (!resetFeedback) return;
    feedbackCtx.clearRect(0, 0, w, h);
    feedbackCtx.drawImage(sourceCanvas, 0, 0);
    pixelReadable = true;
  }

  function setArtwork(nextArtwork: HTMLImageElement, immediately: boolean): void {
    artwork = nextArtwork;
    artworkBlend = immediately ? 1 : 0;
    rebuildSource(immediately);
    if (!immediately) revealLift = Math.max(revealLift, 0.82);
  }

  function loadArtwork(context?: VisualizerRuntimeContext, retryWithoutCors = false): void {
    artworkUrl = context?.artworkUrl;
    if (!artworkUrl) {
      rebuildSource(false);
      return;
    }
    const expectedUrl = artworkUrl;

    if (!retryWithoutCors) {
      preloadArtworkImage(artworkUrl);
      const cached = getCachedArtworkImage(artworkUrl);
      if (cached) {
        setArtwork(cached, true);
        return;
      }
    }

    const image = new Image();
    if (!retryWithoutCors) image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      if (destroyed || artworkUrl !== expectedUrl) return;
      setArtwork(image, false);
    };
    image.onerror = () => {
      if (destroyed || artworkUrl !== expectedUrl) return;
      if (!retryWithoutCors) loadArtwork(context, true);
    };
    image.src = artworkUrl;
  }

  function drawFeedbackSlices(): void {
    const sliceCount = 2 + Math.floor(audio.bass * 4 + displacementLift * 3);
    feedbackCtx.save();
    feedbackCtx.globalAlpha = 0.14 + audio.bass * 0.12 + displacementLift * 0.08;
    for (let index = 0; index < sliceCount; index += 1) {
      const sliceY = Math.floor(Math.random() * Math.max(1, h - 8));
      const sliceHeight = 2 + Math.floor(Math.random() * 5);
      const shift = (q.noise(sliceY * 0.01, time * 0.3 * (bpm / 120), index) - 0.5)
        * (3 + audio.bass * 12 + displacementLift * 8);
      feedbackCtx.drawImage(feedbackCanvas, 0, sliceY, w, sliceHeight, shift, sliceY, w, sliceHeight);
    }
    feedbackCtx.restore();
  }

  function microSort(): void {
    if (!pixelReadable) return;
    const blockWidth = 5 + Math.floor(audio.highs * 5);
    const blockHeight = Math.min(h, 20 + Math.floor(Math.random() * 40));
    const startX = Math.floor(Math.random() * Math.max(1, w - blockWidth));
    const startY = Math.floor(Math.random() * Math.max(1, h - blockHeight));
    try {
      const image = feedbackCtx.getImageData(startX, startY, blockWidth, blockHeight);
      const pixels = image.data;
      for (let x = 0; x < blockWidth; x += 1) {
        const column: Array<[number, number, number, number, number]> = [];
        for (let y = 0; y < blockHeight; y += 1) {
          const offset = (y * blockWidth + x) * 4;
          column.push([
            pixels[offset] + pixels[offset + 1] + pixels[offset + 2],
            pixels[offset],
            pixels[offset + 1],
            pixels[offset + 2],
            pixels[offset + 3],
          ]);
        }
        column.sort((left, right) => left[0] - right[0]);
        for (let y = 0; y < blockHeight; y += 1) {
          const offset = (y * blockWidth + x) * 4;
          const entry = column[y];
          pixels[offset] = entry[1];
          pixels[offset + 1] = entry[2];
          pixels[offset + 2] = entry[3];
          pixels[offset + 3] = entry[4];
        }
      }
      feedbackCtx.putImageData(image, startX, startY);
    } catch {
      pixelReadable = false;
    }
  }

  function displaceFeedback(): void {
    if (!pixelReadable || hasReducedMotion()) return;
    const sampleStep = 4;
    try {
      const image = feedbackCtx.getImageData(0, 0, w, h);
      const pixels = image.data;
      const output = new Uint8ClampedArray(pixels);
      const drive = audio.energy * 0.3 + displacementLift * 0.55 + params.turbulence * 0.12;
      for (let y = sampleStep; y < h - sampleStep; y += sampleStep) {
        for (let x = sampleStep; x < w - sampleStep; x += sampleStep) {
          const offset = (y * w + x) * 4;
          const brightness = (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 765;
          const intensity = brightness * 0.3 + drive;
          const dx = Math.round((q.noise(x * 0.008, y * 0.008, time * 0.04 * (bpm / 120)) - 0.5) * intensity * 7);
          const dy = Math.round((q.noise(x * 0.008 + 100, y * 0.008, time * 0.04 * (bpm / 120)) - 0.5) * intensity * 5);
          const nextX = Math.max(0, Math.min(w - 1, x + dx));
          const nextY = Math.max(0, Math.min(h - 1, y + dy));
          const nextOffset = (nextY * w + nextX) * 4;
          output[nextOffset] = pixels[offset];
          output[nextOffset + 1] = pixels[offset + 1];
          output[nextOffset + 2] = pixels[offset + 2];
          output[nextOffset + 3] = pixels[offset + 3];
        }
      }
      feedbackCtx.putImageData(new ImageData(output, w, h), 0, 0);
    } catch {
      pixelReadable = false;
    }
  }

  return {
    setup(_q, _w, _h, _palette, _tuning, context) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = w;
      sourceCanvas.height = h;
      sourceCtx = sourceCanvas.getContext('2d')!;
      fallbackCanvas = document.createElement('canvas');
      fallbackCanvas.width = w;
      fallbackCanvas.height = h;
      fallbackCtx = fallbackCanvas.getContext('2d')!;
      artworkCanvas = document.createElement('canvas');
      artworkCanvas.width = w;
      artworkCanvas.height = h;
      artworkCtx = artworkCanvas.getContext('2d')!;
      feedbackCanvas = document.createElement('canvas');
      feedbackCanvas.width = w;
      feedbackCanvas.height = h;
      feedbackCtx = feedbackCanvas.getContext('2d', { willReadFrequently: true })!;
      destroyed = false;
      artwork = null;
      artworkBlend = 0;
      time = 0;
      frame = 0;
      previousTransient = 0;
      revealLift = 0.6;
      displacementLift = 0;
      tintLift = 0;
      fallbackPresence = 1;
      particles = buildParticles(160, w, h, 48071);
      flowField.resize(w, h);
      cue = createCueEventState();
      bpm = context?.beatGrid?.bpm ?? 120;
      paintFallback(fallbackCtx);
      recomposeSource();
      feedbackCtx.drawImage(sourceCanvas, 0, 0);
      loadArtwork(context);
    },

    update(dt, nextParams, nextAudio, nextExclusion: ExclusionRect) {
      params = nextParams;
      audio = nextAudio;
      exclusion = nextExclusion;
      cue.update(dt);
      revealLift *= Math.exp(-dt / 1.1);
      displacementLift *= Math.exp(-dt / 1.4);
      tintLift *= Math.exp(-dt / 2.4);
      if (artwork && artworkBlend < 1) {
        artworkBlend = Math.min(1, artworkBlend + dt / ARTWORK_BLEND_SECONDS);
        recomposeSource();
      }
      time += dt * (0.28 + params.drift * 0.4 + cue.motion * 0.3 + displacementLift * 0.22);
      frame += 1;
      fallbackPresence = artwork ? 1 - smoothstep(artworkBlend) : 1;
      if (!hasReducedMotion() && fallbackPresence > 0.002) {
        const speedScale = 0.14 + params.drift * 0.2 + audio.energy * 0.14;
        flowField.refresh(q, time, 0.002, { seed: 52.4 });
        for (const particle of particles) {
          moveFlowParticle(particle, q, dt, w, h, time, 0.002, speedScale, 4 + audio.bass * 8, flowField);
        }
      }

      const transientCrossing = audio.transient > 0.6 && previousTransient <= 0.6;
      if (transientCrossing) {
        const passes = 2 + Math.floor(audio.transient * 2);
        for (let index = 0; index < passes; index += 1) microSort();
      }
      previousTransient = audio.transient;
    },

    draw(_q, ctx) {
      const [br, bg, bb] = palette.bgDark;
      feedbackCtx.fillStyle = `rgba(${br},${bg},${bb},${0.02 + params.density * 0.02})`;
      feedbackCtx.fillRect(0, 0, w, h);
      drawFeedbackSlices();

      if (revealLift > 0.002) {
        feedbackCtx.save();
        feedbackCtx.globalAlpha = 0.008 + revealLift * 0.11;
        feedbackCtx.drawImage(sourceCanvas, 0, 0);
        feedbackCtx.restore();
      }

      feedbackCtx.save();
      feedbackCtx.globalAlpha = 0.004 + params.glow * 0.008;
      feedbackCtx.drawImage(sourceCanvas, 0, 0);
      feedbackCtx.restore();

      if (tintLift > 0.002 || cue.focus > 0.002) {
        const color = cue.mixBackgroundColor(palette.accentGlow, 19);
        feedbackCtx.save();
        feedbackCtx.globalCompositeOperation = 'screen';
        feedbackCtx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${0.012 + tintLift * 0.06 + cue.focus * 0.03})`;
        feedbackCtx.fillRect(0, 0, w, h);
        feedbackCtx.restore();
      }

      if (frame % 4 === 0) displaceFeedback();
      ctx.drawImage(feedbackCanvas, 0, 0, w, h);
      if (!hasReducedMotion() && fallbackPresence > 0.002) {
        for (const particle of particles) {
          const color = cue.mixParticleColor(palette.dotColor, particle.seed);
          drawSoftParticle(ctx, particle, palette, params, audio, exclusion, fallbackPresence * 0.92, color);
        }
      }
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      const intensity = clamp01(event.intensity);
      if (event.type === 'color-morph' || event.type === 'palette-morph') {
        tintLift = Math.max(tintLift, 0.35 + intensity * 0.65);
      }
      if (event.type === 'section-cue') {
        revealLift = Math.max(revealLift, 0.35 + intensity * 0.65);
      }
      if (event.type === 'density-surge' || event.type === 'motion-drift' || event.type === 'storm-release') {
        displacementLift = Math.max(displacementLift, 0.32 + intensity * 0.68);
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      sourceCanvas.width = w;
      sourceCanvas.height = h;
      fallbackCanvas.width = w;
      fallbackCanvas.height = h;
      artworkCanvas.width = w;
      artworkCanvas.height = h;
      feedbackCanvas.width = w;
      feedbackCanvas.height = h;
      particles = buildParticles(160, w, h, 48071);
      flowField.resize(w, h);
      rebuildSource(true);
    },

    destroy() {
      destroyed = true;
      artwork = null;
      artworkUrl = undefined;
      particles = [];
      sourceCanvas.width = 0;
      sourceCanvas.height = 0;
      fallbackCanvas.width = 0;
      fallbackCanvas.height = 0;
      artworkCanvas.width = 0;
      artworkCanvas.height = 0;
      feedbackCanvas.width = 0;
      feedbackCanvas.height = 0;
      flowField.destroy();
    },
  };
}
