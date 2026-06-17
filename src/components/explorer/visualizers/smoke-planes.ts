/* ── smoke-planes Visualizer ────────────────────────────────
   3-4 layered Perlin noise fields at different scales/speeds.
   Creates a parallax depth / atmospheric smoke effect.
──────────────────────────────────────────────────────────────── */

import type { Palette } from '../palette';
import type { Visualizer, VisualParams, VisualEvent, ExclusionRect } from '../visualizer';
import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import { createCueEventState } from './cue-event-state';

/* ── Layer Config ──────────────────────────────────────────── */

interface LayerDef {
  scale: number;      // noise spatial scale
  speed: number;      // noise temporal speed
  threshold: number;  // noise must exceed this to render
  alpha: number;      // base draw alpha
  gridStep: number;   // sampling grid spacing
  dotSize: number;    // max dot radius
}

const LAYER_DEFS: LayerDef[] = [
  { scale: 0.0015, speed: 0.08,  threshold: 0.48, alpha: 0.035, gridStep: 10, dotSize: 3.5 },
  { scale: 0.003,  speed: 0.12,  threshold: 0.46, alpha: 0.042, gridStep: 8,  dotSize: 2.5 },
  { scale: 0.006,  speed: 0.18,  threshold: 0.44, alpha: 0.050, gridStep: 7,  dotSize: 1.8 },
  { scale: 0.012,  speed: 0.25,  threshold: 0.42, alpha: 0.028, gridStep: 6,  dotSize: 1.2 },
];

/* ── Implementation ────────────────────────────────────────── */

export function createSmokePlanes(): Visualizer {
   
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;

  // Stored from update() for use in draw()
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };

  // Per-layer noise offsets for variety
  let layerOffsets: number[] = [];
  let cue = createCueEventState();
  let phase = 0;
  let reveal = 1;

  return {
    setup(_q, _w, _h, _palette) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      layerOffsets = LAYER_DEFS.map(() => Math.random() * 1000);
      cue = createCueEventState();
      phase = 0;
      reveal = 1;
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);
      reveal = Math.min(4, reveal + dt * 0.9);

      const reduced = typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      const activity = curAudio.activity ?? curAudio.energy;
      time += dt * (0.82 + curParams.drift * 0.32 + activity * 0.48 + (curAudio.playing ?? 0) * 0.22 + cue.motion * 0.42);
    },

    draw(_q, ctx) {
      // Trail: semi-transparent background
      const [br, bg, bb] = palette.bgDark;
      ctx.fillStyle = `rgba(${br},${bg},${bb},0.03)`;
      ctx.fillRect(0, 0, w, h);

      for (let li = 0; li < LAYER_DEFS.length; li++) {
        const activeLayers = phase <= 0 ? 2 : phase === 1 ? 2 : phase === 2 ? 3 : 4;
        if (li >= activeLayers || li >= reveal) continue;
        const layer = LAYER_DEFS[li];
        const offset = layerOffsets[li];

        // Turbulence lowers threshold (more dots appear)
        const activity = curAudio.activity ?? curAudio.energy;
        const thresh = layer.threshold - curParams.turbulence * 0.08 - activity * 0.025 - curAudio.highs * 0.018 - cue.grain * 0.035 - (phase >= 2 ? 0.065 : 0);
        // Drift scales speed
        const reverse = phase >= 3 && li === 3 ? -1 : 1;
        const tScaled = time * layer.speed * reverse * (0.6 + curParams.drift * 0.8 + (phase >= 3 ? 0.52 : 0));
        // Use accent colour on front layers when glow is high
        const useAccent = curParams.glow > 0.3 && li >= 2;

        const [dr, dg, db] = cue.mixMistColor(useAccent ? palette.accentGlow : palette.dotColor, offset);
        const densityStep = cue.densityProgress(offset);
        const baseAlpha = layer.alpha * (0.6 + curParams.density * 0.8 + activity * 0.18 + curAudio.energy * 0.24 + cue.focus * 0.32 + cue.sweep * 0.16) * Math.max(0, Math.min(1, 1 + densityStep * 0.5));

        const step = layer.gridStep;
        const cols = Math.ceil(w / step);
        const rows = Math.ceil(h / step);

        // Batch all dots for this layer into a single path
        const a = Math.min(baseAlpha * (1.5 + cue.sizeProgress(offset) * 0.32), 0.08);
        ctx.fillStyle = `rgba(${dr},${dg},${db},${a.toFixed(4)})`;
        ctx.beginPath();
        let drawn = false;

        for (let row = 0; row < rows; row++) {
          const py = row * step;
          for (let col = 0; col < cols; col++) {
            const px = col * step;

            const n = q.noise(
              px * layer.scale + offset,
              py * layer.scale + offset,
              tScaled,
            );

            if (n < thresh) continue;

            // Exclusion zone — probabilistic density skip
            const excl = computeExclusion(px, py, curExclusion);
            if (excl.density < Math.random()) continue;

            const r = layer.dotSize * (0.6 + (n - thresh) * 2 + cue.bloom * 0.35);

            ctx.moveTo(px + r, py);
            ctx.arc(px, py, r, 0, Math.PI * 2);
            drawn = true;
          }
        }

        if (drawn) ctx.fill();
      }
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      if (event.type === 'section-cue') {
        phase = Math.max(0, event.sectionIndex ?? phase + 1);
        reveal = Math.max(1, Math.min(reveal, phase + 0.05));
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
    },

    destroy() {
      layerOffsets = [];
    },
  };
}
