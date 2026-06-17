import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer, VisualizerRuntimeContext } from '../visualizer';
import { createCueEventState } from './cue-event-state';
import {
  buildParticles,
  createLowResVectorField,
  drawSoftParticle,
  hasReducedMotion,
  moveFlowParticle,
  type CongParticle,
  type LowResVectorField,
} from './cong-particle-primitives';

interface FreezeBlock {
  x: number;
  y: number;
  w: number;
  h: number;
  alpha: number;
  image: HTMLCanvasElement | null;
}

function mix(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

export function createCongVerticalDatamosh(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let phase = 0;
  let phaseMix = 0;
  let transientLatch = 0;
  let params: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let audio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let feedbackCanvas: HTMLCanvasElement;
  let feedbackCtx: CanvasRenderingContext2D;
  let previousCanvas: HTMLCanvasElement;
  let previousCtx: CanvasRenderingContext2D;
  let freezes: FreezeBlock[] = [];
  let particles: CongParticle[] = [];
  let exclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let cue = createCueEventState();
  let bpm = 120;
  let flowField: LowResVectorField = createLowResVectorField(74);

  function phaseValue(values: readonly number[]): number {
    const index = Math.min(phase, values.length - 1);
    const prior = Math.max(0, index - 1);
    return mix(values[prior], values[index], phaseMix);
  }

  function seedFrame(): void {
    const [br, bg, bb] = palette.bgDark;
    const [ar, ag, ab] = palette.accentGlow;
    const gradient = feedbackCtx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, `rgb(${br},${bg},${bb})`);
    gradient.addColorStop(1, `rgba(${ar},${ag},${ab},0.34)`);
    feedbackCtx.fillStyle = gradient;
    feedbackCtx.fillRect(0, 0, w, h);
  }

  function captureFreeze(): void {
    const minSize = phase >= 2 ? 24 : 18;
    const width = Math.min(w, minSize + Math.random() * (phase >= 2 ? 72 : 42));
    const height = Math.min(h, minSize + Math.random() * (phase >= 2 ? 62 : 34));
    const x = Math.floor(Math.random() * Math.max(1, w - width));
    const y = Math.floor(Math.random() * Math.max(1, h - height));
    let image: HTMLCanvasElement | null = null;
    try {
      image = document.createElement('canvas');
      image.width = Math.max(1, Math.round(width));
      image.height = Math.max(1, Math.round(height));
      image.getContext('2d')?.drawImage(previousCanvas, x, y, width, height, 0, 0, width, height);
    } catch {
      image = null;
    }
    freezes.push({ x, y, w: width, h: height, alpha: 0.58 + audio.transient * 0.24, image });
  }

  return {
    setup(_q, _w, _h, _palette, _tuning, context?: VisualizerRuntimeContext) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      bpm = context?.beatGrid?.bpm ?? 120;
      phase = 0;
      phaseMix = 1;
      time = 0;
      transientLatch = 0;
      freezes = [];
      cue = createCueEventState();
      feedbackCanvas = document.createElement('canvas');
      previousCanvas = document.createElement('canvas');
      feedbackCanvas.width = previousCanvas.width = w;
      feedbackCanvas.height = previousCanvas.height = h;
      feedbackCtx = feedbackCanvas.getContext('2d', { willReadFrequently: true })!;
      previousCtx = previousCanvas.getContext('2d', { willReadFrequently: true })!;
      particles = buildParticles(140, w, h, 59027);
      flowField.resize(w, h);
      seedFrame();
      previousCtx.drawImage(feedbackCanvas, 0, 0);
    },

    update(dt, nextParams, nextAudio, nextExclusion: ExclusionRect) {
      params = nextParams;
      audio = nextAudio;
      exclusion = nextExclusion;
      cue.update(dt);
      phaseMix = Math.min(1, phaseMix + dt / 1.5);
      time += dt * (0.22 + params.drift * 0.54 + audio.energy * 0.26);
      transientLatch = audio.transient;
      if (!hasReducedMotion()) {
        const speedScale = 0.16 + params.drift * 0.3 + audio.energy * 0.18;
        flowField.refresh(q, time, 0.0022, { seed: 59.1 });
        for (const particle of particles) {
          moveFlowParticle(particle, q, dt, w, h, time, 0.0022, speedScale, 5 + audio.bass * 12, flowField);
        }
      }
    },

    draw(_q, ctx) {
      previousCtx.clearRect(0, 0, w, h);
      previousCtx.drawImage(feedbackCanvas, 0, 0);
      const [br, bg, bb] = palette.bgDark;
      feedbackCtx.fillStyle = `rgba(${br},${bg},${bb},${0.025 + params.density * 0.018})`;
      feedbackCtx.fillRect(0, 0, w, h);

      const minWidth = phaseValue([4, 8, 16, 18]);
      const maxWidth = phaseValue([8, 20, 60, 60]);
      const beatPulse = 1 + audio.transient * 0.55 + audio.bass * 0.3;
      const displacement = phaseValue([20, 52, 112, 120]) * (0.56 + params.turbulence * 0.44 + audio.bass * 0.25) * beatPulse;
      const count = Math.round(phaseValue([5, 9, 15, 20]) + params.density * 4 + audio.mids * 3);
      feedbackCtx.save();
      feedbackCtx.globalAlpha = 0.26 + phase * 0.1 + audio.energy * 0.12;
      for (let index = 0; index < count; index += 1) {
        const columnWidth = Math.round(mix(minWidth, maxWidth, Math.random()));
        const x = Math.floor(Math.random() * Math.max(1, w - columnWidth));
        const noise = q.noise(x * 0.008, time * 0.24 * (bpm / 120), index * 0.21) - 0.5;
        const signedShift = noise * displacement * (phase >= 3 ? 2 : 1.35);
        feedbackCtx.drawImage(previousCanvas, x, 0, columnWidth, h, x, signedShift, columnWidth, h);
        if (phase >= 1) {
          const fringe = phase >= 3 ? 3 : 2;
          feedbackCtx.globalCompositeOperation = 'screen';
          feedbackCtx.globalAlpha = 0.04 + params.glow * 0.07 + phase * 0.025;
          feedbackCtx.filter = 'hue-rotate(-42deg) saturate(180%)';
          feedbackCtx.drawImage(previousCanvas, x, 0, columnWidth, h, x - fringe, signedShift, columnWidth, h);
          feedbackCtx.filter = phase >= 3 ? 'hue-rotate(112deg) saturate(160%)' : 'hue-rotate(44deg) saturate(180%)';
          feedbackCtx.drawImage(previousCanvas, x, 0, columnWidth, h, x + fringe, signedShift, columnWidth, h);
          feedbackCtx.filter = 'none';
          feedbackCtx.globalCompositeOperation = 'source-over';
          feedbackCtx.globalAlpha = 0.26 + phase * 0.1 + audio.energy * 0.12;
        }
      }
      feedbackCtx.restore();

      if (cue.bloom > 0.01 || cue.focus > 0.01) {
        const [ar, ag, ab] = palette.accentGlow;
        feedbackCtx.save();
        feedbackCtx.globalCompositeOperation = 'screen';
        feedbackCtx.fillStyle = `rgba(${ar},${ag},${ab},${(cue.bloom * 0.18 + cue.focus * 0.09).toFixed(3)})`;
        feedbackCtx.fillRect(0, 0, w, h);
        feedbackCtx.restore();
      }

      ctx.drawImage(feedbackCanvas, 0, 0, w, h);
      if (!hasReducedMotion()) {
        for (const particle of particles) {
          const color = cue.mixParticleColor(palette.dotColor, particle.seed);
          drawSoftParticle(ctx, particle, palette, params, audio, exclusion, 0.86 + audio.energy * 0.42, color);
        }
      }
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      if (event.type !== 'section-cue') return;
      phase = Math.max(0, event.sectionIndex ?? phase + 1);
      phaseMix = 0;
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      feedbackCanvas.width = previousCanvas.width = w;
      feedbackCanvas.height = previousCanvas.height = h;
      seedFrame();
      previousCtx.drawImage(feedbackCanvas, 0, 0);
      freezes = [];
      particles = buildParticles(140, w, h, 59027);
      flowField.resize(w, h);
    },

    destroy() {
      freezes = [];
      particles = [];
      flowField.destroy();
      feedbackCanvas.width = feedbackCanvas.height = 0;
      previousCanvas.width = previousCanvas.height = 0;
    },
  };
}
