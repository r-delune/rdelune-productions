/* ── tide-lines Visualizer ──────────────────────────────────
   Horizontal sine waves displaced by Perlin noise.
   Creates a layered ocean / tide / breath effect.
──────────────────────────────────────────────────────────────── */

import type { Palette } from '../palette';
import type { Visualizer, VisualParams, VisualEvent, ExclusionRect } from '../visualizer';
import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import { createCueEventState } from './cue-event-state';

/* ── Constants ─────────────────────────────────────────────── */

const WAVE_COUNT = 12;
const X_STEP = 3; // pixels between path points

/* ── Types ─────────────────────────────────────────────────── */

interface Wave {
  baseY: number;      // vertical centre position (fraction of h, 0-1)
  amplitude: number;  // sine wave amplitude
  frequency: number;  // sine wave frequency
  phase: number;      // initial phase offset
  speed: number;      // temporal speed
  noiseFreq: number;  // Perlin noise spatial frequency
  noiseAmp: number;   // Perlin noise amplitude
  alpha: number;      // base line alpha
  lineWidth: number;  // stroke width
}

/* ── Implementation ────────────────────────────────────────── */

export function createTideLines(): Visualizer {
   
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let waves: Wave[] = [];
  let cue = createCueEventState();
  let phase = 0;
  let tideRise = 0;

  // Stored from update()
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };

  function buildWaves() {
    waves = [];
    for (let i = 0; i < WAVE_COUNT; i++) {
      const depth = i / (WAVE_COUNT - 1); // 0 = back, 1 = front
      waves.push({
        baseY: 0.15 + depth * 0.7,                    // spread across 15%-85% of height
        amplitude: 30 + (1 - depth) * 60,              // back waves: larger amplitude
        frequency: 0.003 + depth * 0.004,               // front waves: slightly higher freq
        phase: Math.random() * Math.PI * 2,
        speed: 0.15 + depth * 0.25,                     // front waves: faster
        noiseFreq: 0.001 + depth * 0.002,               // front waves: more perlin detail
        noiseAmp: 20 + (1 - depth) * 40,                // back waves: more perlin displacement
        alpha: 0.022 + depth * 0.06,                     // front waves: slightly brighter
        lineWidth: 1.5 - depth * 0.8,                   // back waves: thicker (further away feel)
      });
    }
  }

  return {
    setup(_q, _w, _h, _palette) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      cue = createCueEventState();
      phase = 0;
      tideRise = 0;
      buildWaves();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);
      tideRise += ((phase >= 4 ? 1 : 0) - tideRise) * Math.min(1, dt / 4);

      const reduced = typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      const activity = curAudio.activity ?? curAudio.energy;
      time += dt * (0.78 + curParams.drift * 0.36 + activity * 0.42 + (curAudio.playing ?? 0) * 0.18 + cue.motion * 0.5);
    },

    draw(_q, ctx) {
      // Trail: semi-transparent background
      const [br, bg, bb] = palette.bgDark;
      ctx.fillStyle = `rgba(${br},${bg},${bb},0.04)`;
      ctx.fillRect(0, 0, w, h);

      const activity = curAudio.activity ?? curAudio.energy;
      const turbulenceScale = 1 + curParams.turbulence * 1.5 + activity * 0.18 + curAudio.bass * 0.22;
      const driftScale = 0.5 + curParams.drift * 1.0 + activity * 0.16 + curAudio.energy * 0.24;

      for (let wi = 0; wi < waves.length; wi++) {
        const visibleCount = phase <= 0 ? 5 : phase === 1 ? 8 : WAVE_COUNT;
        if (wi >= visibleCount) continue;
        const wave = waves[wi];
        const depth = wi / (WAVE_COUNT - 1);

        // Use accent on front waves when glow is high
        const useAccent = (curParams.glow > 0.4 && depth > 0.6) || phase >= 3;
        const seed = wave.phase * 1000;
        const [cr, cg, cb] = cue.mixRidgeColor(useAccent ? palette.accentGlow : palette.dotColor, seed);

        const alpha = wave.alpha * (phase >= 3 ? 1.45 : 1) * (0.5 + curParams.density * 1.0 + activity * 0.16 + curAudio.mids * 0.22 + cue.focus * 0.45) * Math.max(0, Math.min(1, 1 + cue.densityProgress(seed) * 0.56));
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(4)})`;
        ctx.lineWidth = wave.lineWidth * (1 + cue.sizeProgress(seed) * 0.38);
        ctx.beginPath();

        const collisionShift = phase >= 3 ? Math.sin(time * 0.18 + wave.phase) * h * 0.045 : 0;
        const centerY = wave.baseY * h + collisionShift - tideRise * h * 0.2;
        const tWave = time * wave.speed * driftScale;
        const amp = wave.amplitude * turbulenceScale * (phase >= 3 ? 1.4 : 1) * (1 + curAudio.bass * 0.12 + cue.sweep * 0.18);
        const nAmp = wave.noiseAmp * turbulenceScale * (1 + curAudio.highs * 0.1 + cue.motion * 0.2);

        let started = false;

        for (let x = 0; x <= w; x += X_STEP) {
          // Sine component
          const sine = Math.sin(x * wave.frequency + wave.phase + tWave) * amp;
          // Perlin component
          const perlin = (q.noise(x * wave.noiseFreq, tWave * 0.3 + wi * 100) - 0.5) * nAmp * 2;

          let y = centerY + sine + perlin + (phase >= 4 && depth > 0.65 ? (Math.random() - 0.5) * 2 : 0);

          // Exclusion zone: flatten amplitude behind panel
          const excl = computeExclusion(x, y, curExclusion);
          if (excl.alpha < 1) {
            // Lerp toward the baseline (flatten the wave)
            y = centerY + (y - centerY) * excl.motion;
          }

          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.stroke();
      }
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      if (event.type === 'section-cue') phase = Math.max(0, event.sectionIndex ?? phase + 1);
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
    },

    destroy() {
      waves = [];
    },
  };
}
