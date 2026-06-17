import type { AudioSignal } from '../audio-signal';
import { getCachedArtworkImage, preloadArtworkImage } from '../artwork-cache';
import type { Palette } from '../palette';
import { resolveCongArtworkParticleMangleTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer, VisualizerRuntimeContext } from '../visualizer';

interface MangleParticle {
  sx: number;
  sy: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  depth: number;
  drift: number;
}

interface TearBlock {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  phase: number;
  speed: number;
  depth: number;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setCanvasSize(canvas: HTMLCanvasElement, width: number, height: number) {
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
}

function fillCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / Math.max(sourceWidth, 1), height / Math.max(sourceHeight, 1));
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  ctx.drawImage(image, (width - drawWidth) * 0.5, (height - drawHeight) * 0.5, drawWidth, drawHeight);
}

const ARTWORK_BLEND_SECONDS = 1.4;

export function createCongArtworkParticleMangle(): Visualizer {
  let w = 0;
  let h = 0;
  let palette: Palette;
  let params: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let audio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let exclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 0 };
  let time = 0;
  let seed = 1;
  let destroyed = false;
  let imageLoaded = false;
  let imageFailed = false;
  let artworkBlend = 0;
  let sectionLevel = 0;
  let sectionTarget = 0.08;
  let burst = 0;
  let sourceCanvas: HTMLCanvasElement;
  let feedbackCanvas: HTMLCanvasElement;
  let stableCanvas: HTMLCanvasElement;
  let fallbackCanvas: HTMLCanvasElement;
  let artworkCanvas: HTMLCanvasElement;
  let sourceCtx: CanvasRenderingContext2D;
  let feedbackCtx: CanvasRenderingContext2D;
  let stableCtx: CanvasRenderingContext2D;
  let fallbackCtx: CanvasRenderingContext2D;
  let artworkCtx: CanvasRenderingContext2D;
  let image: HTMLImageElement | null = null;
  let particles: MangleParticle[] = [];
  let tearBlocks: TearBlock[] = [];
  let config = resolveCongArtworkParticleMangleTuning();

  function rebuildParticleField(seedLabel: string) {
    seed = hashString(seedLabel || 'artwork-particle-mangle');
    const random = createRandom(seed);
    particles = [];
    tearBlocks = [];

    const count = Math.max(800, config.particleCount);
    for (let i = 0; i < count; i += 1) {
      const sx = random();
      const sy = random();
      const x = sx * w;
      const y = sy * h;
      const depth = random();
      particles.push({
        sx,
        sy,
        x,
        y,
        tx: x,
        ty: y,
        vx: 0,
        vy: 0,
        size: config.particleSize * (0.42 + depth * 1.35),
        phase: random() * Math.PI * 2,
        depth,
        drift: random() * 2 - 1,
      });
    }

    for (let i = 0; i < config.blockTearCount; i += 1) {
      tearBlocks.push({
        sx: random(),
        sy: random(),
        sw: 0.025 + random() * 0.16,
        sh: 0.018 + random() * 0.12,
        phase: random() * Math.PI * 2,
        speed: 0.18 + random() * 0.85,
        depth: random(),
      });
    }
  }

  function drawFallbackArtwork() {
    const [bgR, bgG, bgB] = palette.bgDark;
    const [midR, midG, midB] = palette.bgMid;
    const [ar, ag, ab] = palette.accentGlow;
    const [wr, wg, wb] = palette.accentWarm;
    const random = createRandom(seed ^ 0xB5297A4D);

    fallbackCtx.clearRect(0, 0, fallbackCanvas.width, fallbackCanvas.height);
    const gradient = fallbackCtx.createRadialGradient(fallbackCanvas.width * 0.38, fallbackCanvas.height * 0.38, 0, fallbackCanvas.width * 0.5, fallbackCanvas.height * 0.52, Math.max(fallbackCanvas.width, fallbackCanvas.height) * 0.72);
    gradient.addColorStop(0, `rgb(${Math.round((ar + midR) * 0.5)},${Math.round((ag + midG) * 0.5)},${Math.round((ab + midB) * 0.5)})`);
    gradient.addColorStop(0.48, `rgb(${midR},${midG},${midB})`);
    gradient.addColorStop(1, `rgb(${bgR},${bgG},${bgB})`);
    fallbackCtx.fillStyle = gradient;
    fallbackCtx.fillRect(0, 0, fallbackCanvas.width, fallbackCanvas.height);

    fallbackCtx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 260; i += 1) {
      const x = random() * fallbackCanvas.width;
      const y = random() * fallbackCanvas.height;
      const width = 4 + random() * fallbackCanvas.width * 0.2;
      const height = 1 + random() * 5;
      fallbackCtx.fillStyle = random() > 0.5
        ? `rgba(${ar},${ag},${ab},${0.02 + random() * 0.08})`
        : `rgba(${wr},${wg},${wb},${0.018 + random() * 0.07})`;
      fallbackCtx.fillRect(x, y, width, height);
    }
    fallbackCtx.globalCompositeOperation = 'source-over';
  }

  function recomposeSource() {
    stableCtx.clearRect(0, 0, stableCanvas.width, stableCanvas.height);
    stableCtx.drawImage(fallbackCanvas, 0, 0, stableCanvas.width, stableCanvas.height);
    if (image && imageLoaded && artworkBlend > 0) {
      stableCtx.save();
      stableCtx.globalAlpha = smoothstep(artworkBlend);
      stableCtx.drawImage(artworkCanvas, 0, 0, stableCanvas.width, stableCanvas.height);
      stableCtx.restore();
    }
    sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    sourceCtx.drawImage(stableCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height);
  }

  function refreshSource() {
    drawFallbackArtwork();
    artworkCtx.clearRect(0, 0, artworkCanvas.width, artworkCanvas.height);
    if (image && imageLoaded) {
      fillCover(artworkCtx, image, image.naturalWidth || 1, image.naturalHeight || 1, artworkCanvas.width, artworkCanvas.height);
    }
    recomposeSource();
  }

  function resizeBuffers(width: number, height: number) {
    setCanvasSize(stableCanvas, width, height);
    setCanvasSize(fallbackCanvas, width, height);
    setCanvasSize(artworkCanvas, width, height);
    setCanvasSize(feedbackCanvas, width, height);
    setCanvasSize(sourceCanvas, config.sampleWidth, config.sampleHeight);
    refreshSource();
    feedbackCtx.clearRect(0, 0, feedbackCanvas.width, feedbackCanvas.height);
    feedbackCtx.drawImage(stableCanvas, 0, 0, feedbackCanvas.width, feedbackCanvas.height);

    for (const particle of particles) {
      particle.tx = particle.sx * w;
      particle.ty = particle.sy * h;
      particle.x = particle.tx;
      particle.y = particle.ty;
    }
  }

  function loadArtwork(context?: VisualizerRuntimeContext, retryWithoutCors = false) {
    imageLoaded = false;
    imageFailed = false;
    artworkBlend = 0;
    image = null;

    const artworkUrl = context?.artworkUrl;
    if (!artworkUrl) {
      imageFailed = true;
      refreshSource();
      return;
    }

    if (!retryWithoutCors) {
      preloadArtworkImage(artworkUrl);
      const cached = getCachedArtworkImage(artworkUrl);
      if (cached) {
        image = cached;
        imageLoaded = true;
        artworkBlend = 1;
        refreshSource();
        feedbackCtx.globalCompositeOperation = 'source-over';
        feedbackCtx.globalAlpha = 1;
        feedbackCtx.drawImage(stableCanvas, 0, 0, w, h);
        return;
      }
    }

    const nextImage = new Image();
    if (!retryWithoutCors) nextImage.crossOrigin = 'anonymous';
    nextImage.decoding = 'async';
    nextImage.onload = () => {
      if (destroyed || image !== nextImage) return;
      imageLoaded = true;
      imageFailed = false;
      refreshSource();
    };
    nextImage.onerror = () => {
      if (destroyed || image !== nextImage) return;
      if (!retryWithoutCors) {
        loadArtwork(context, true);
        return;
      }
      imageLoaded = false;
      imageFailed = true;
      refreshSource();
    };
    image = nextImage;
    nextImage.src = artworkUrl;
  }

  function updateParticles(dt: number, protectStart: number) {
    const mangle = clamp01(sectionLevel * config.sectionEvolution + params.turbulence * 0.28 + audio.energy * 0.32 + burst * 0.44);
    const scatter = config.scatter * (0.12 + mangle + audio.mids * 0.42 + audio.transient * 0.5) + config.transientScatter * burst;
    const centerX = protectStart * (0.42 + Math.sin(time * 0.19) * 0.08);
    const centerY = h * (0.5 + Math.cos(time * 0.16) * 0.1);
    const swirl = config.vortex * (0.18 + sectionLevel * 0.95 + audio.bass * 0.55 + burst * 0.65);

    for (const particle of particles) {
      const baseX = particle.sx * protectStart;
      const baseY = particle.sy * h;
      const dx = baseX - centerX;
      const dy = baseY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy) + 1;
      const angle = Math.atan2(dy, dx) + swirl * (0.35 + particle.depth) + Math.sin(time * 0.22 + particle.phase) * 0.3 * mangle;
      const radial = Math.min(scatter * (0.22 + particle.depth), dist * 0.45 + scatter * 0.4);
      const tear = Math.sin(time * (0.34 + particle.depth * 0.55) + particle.phase) * config.shear * mangle * particle.drift;
      const lane = Math.sin(particle.sy * Math.PI * 18 + time * 0.72 + sectionLevel * 6) * config.shear * (0.12 + audio.bass * 0.42 + burst * 0.4);
      particle.tx = Math.min(protectStart, Math.max(-80, baseX + Math.cos(angle) * radial + tear + lane));
      particle.ty = Math.min(h + 80, Math.max(-80, baseY + Math.sin(angle) * radial + Math.cos(angle * 1.7) * scatter * 0.15));

      const pull = 1 - Math.pow(0.001, dt * (0.42 + particle.depth * 0.8 + params.drift * 0.55));
      particle.vx = mix(particle.vx, (particle.tx - particle.x) * 0.7, pull);
      particle.vy = mix(particle.vy, (particle.ty - particle.y) * 0.7, pull);
      particle.x += particle.vx * dt * 3.1;
      particle.y += particle.vy * dt * 3.1;
    }
  }

  function drawTearBlocks(protectStart: number, mangle: number) {
    const activeBlocks = Math.max(6, Math.round(tearBlocks.length * (0.22 + mangle * 0.72 + audio.transient * 0.35)));
    feedbackCtx.save();
    feedbackCtx.globalCompositeOperation = imageFailed ? 'lighter' : 'screen';
    feedbackCtx.globalAlpha = 0.08 + mangle * 0.2 + burst * 0.16;
    for (let i = 0; i < activeBlocks; i += 1) {
      const block = tearBlocks[(i + Math.floor(time * 5 + sectionLevel * 19)) % tearBlocks.length];
      const sx = Math.floor(block.sx * sourceCanvas.width);
      const sy = Math.floor(block.sy * sourceCanvas.height);
      const sw = Math.max(2, Math.floor(block.sw * sourceCanvas.width));
      const sh = Math.max(2, Math.floor(block.sh * sourceCanvas.height));
      const width = sw * (w / sourceCanvas.width) * (0.6 + mangle * 1.1);
      const height = sh * (h / sourceCanvas.height) * (0.6 + audio.highs * 1.2);
      const x = Math.min(protectStart - width * 0.4, block.sx * protectStart + Math.sin(time * block.speed + block.phase) * config.shear * (0.5 + mangle));
      const y = block.sy * h + Math.cos(time * (block.speed + 0.2) + block.phase) * config.shear * 0.18 * (1 + block.depth);
      feedbackCtx.drawImage(sourceCanvas, sx, sy, sw, sh, x, y, width, height);
    }
    feedbackCtx.restore();
  }

  return {
    setup(_q, _w, _h, _palette, _tuning, context) {
      w = _w;
      h = _h;
      palette = _palette;
      config = resolveCongArtworkParticleMangleTuning(_tuning);
      sourceCanvas = document.createElement('canvas');
      feedbackCanvas = document.createElement('canvas');
      stableCanvas = document.createElement('canvas');
      fallbackCanvas = document.createElement('canvas');
      artworkCanvas = document.createElement('canvas');
      const maybeSourceCtx = sourceCanvas.getContext('2d');
      const maybeFeedbackCtx = feedbackCanvas.getContext('2d');
      const maybeStableCtx = stableCanvas.getContext('2d');
      const maybeFallbackCtx = fallbackCanvas.getContext('2d');
      const maybeArtworkCtx = artworkCanvas.getContext('2d');
      if (!maybeSourceCtx || !maybeFeedbackCtx || !maybeStableCtx || !maybeFallbackCtx || !maybeArtworkCtx) throw new Error('Failed to create particle mangle buffers');
      sourceCtx = maybeSourceCtx;
      feedbackCtx = maybeFeedbackCtx;
      stableCtx = maybeStableCtx;
      fallbackCtx = maybeFallbackCtx;
      artworkCtx = maybeArtworkCtx;
      destroyed = false;
      time = 0;
      artworkBlend = 0;
      sectionLevel = 0;
      sectionTarget = 0.08;
      burst = 0;
      rebuildParticleField(context?.assetSeed ?? `${context?.albumName ?? ''}::${context?.trackTitle ?? ''}`);
      resizeBuffers(w, h);
      loadArtwork(context);
    },

    update(dt, nextParams, nextAudio, nextExclusion) {
      params = nextParams;
      audio = nextAudio;
      exclusion = nextExclusion;
      if (imageLoaded && artworkBlend < 1) {
        artworkBlend = Math.min(1, artworkBlend + dt / ARTWORK_BLEND_SECONDS);
        recomposeSource();
      }
      sectionLevel = mix(sectionLevel, sectionTarget, 1 - Math.pow(0.001, dt));
      burst = mix(burst, 0, 1 - Math.pow(0.0001, dt));

      const reduced = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      time += dt * (0.24 + params.drift * 1.12 + audio.energy * 0.36 + sectionLevel * 0.24);
      const protectStart = Math.max(w * 0.58, Math.min(w, exclusion.left - exclusion.pad * 1.4));
      updateParticles(dt, protectStart);
    },

    draw(_q, ctx) {
      const reduced = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const protectStart = Math.max(w * 0.58, Math.min(w, exclusion.left - exclusion.pad * 1.4));
      const mangle = reduced
        ? 0.04
        : clamp01(sectionLevel * config.sectionEvolution + audio.energy * 0.24 + audio.transient * 0.32 + burst * 0.36 + params.turbulence * 0.18);
      const [bgR, bgG, bgB] = palette.bgDark;

      if (!reduced) {
        feedbackCtx.save();
        feedbackCtx.globalCompositeOperation = 'source-over';
        feedbackCtx.globalAlpha = Math.min(0.36, Math.max(0.055, config.feedbackAlpha + sectionLevel * 0.06));
        feedbackCtx.fillStyle = `rgb(${bgR},${bgG},${bgB})`;
        feedbackCtx.fillRect(0, 0, w, h);
        feedbackCtx.restore();


        feedbackCtx.save();
        feedbackCtx.globalCompositeOperation = imageFailed ? 'screen' : 'lighter';
        feedbackCtx.globalAlpha = 0.22 + params.density * 0.26 + mangle * 0.2;
        for (const particle of particles) {
          const sx = Math.floor(particle.sx * sourceCanvas.width);
          const sy = Math.floor(particle.sy * sourceCanvas.height);
          const sourceSize = particle.depth > 0.66 ? 2 : 1;
          const size = particle.size * (0.7 + mangle * 1.15 + audio.highs * 0.7 + burst * 0.8);
          feedbackCtx.drawImage(sourceCanvas, sx, sy, sourceSize, sourceSize, particle.x, particle.y, size, size);
        }
        feedbackCtx.restore();
      } else {
        feedbackCtx.globalCompositeOperation = 'source-over';
        feedbackCtx.globalAlpha = 1;
        feedbackCtx.drawImage(stableCanvas, 0, 0, w, h);
      }

      ctx.save();
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(feedbackCanvas, 0, 0, w, h);

      const [ar, ag, ab] = palette.accentGlow;
      const [wr, wg, wb] = palette.accentWarm;
      ctx.globalCompositeOperation = 'screen';
      const haze = ctx.createRadialGradient(protectStart * 0.38, h * 0.46, 0, protectStart * 0.42, h * 0.48, Math.max(w, h) * 0.54);
      haze.addColorStop(0, `rgba(${ar},${ag},${ab},${0.018 + mangle * 0.046 + audio.highs * 0.04})`);
      haze.addColorStop(0.55, `rgba(${wr},${wg},${wb},${0.006 + audio.bass * 0.024 + burst * 0.03})`);
      haze.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, protectStart, h);
      ctx.restore();
    },

    onEvent(event: VisualEvent) {
      const intensity = event.intensity ?? 0.55;
      if (event.type === 'section-cue') {
        sectionTarget = clamp01(sectionTarget + 0.18 + intensity * 0.2);
        burst = Math.max(burst, 0.28 + intensity * 0.46);
        return;
      }

      if (event.type === 'density-surge' || event.type === 'spark-burst' || event.type === 'bloom-flash') {
        sectionTarget = clamp01(sectionTarget + 0.1 + intensity * 0.15);
        burst = Math.max(burst, 0.44 + intensity * 0.48);
        return;
      }

      if (event.type === 'motion-drift' || event.type === 'grain-bloom' || event.type === 'veil-sweep') {
        sectionTarget = clamp01(sectionTarget + 0.07 + intensity * 0.1);
        burst = Math.max(burst, 0.22 + intensity * 0.32);
        return;
      }

      if (event.type === 'color-morph' || event.type === 'palette-morph' || event.type === 'focus-shift') {
        burst = Math.max(burst, 0.18 + intensity * 0.24);
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      resizeBuffers(w, h);
    },

    destroy() {
      destroyed = true;
      image = null;
      particles = [];
      tearBlocks = [];
    },
  };
}
