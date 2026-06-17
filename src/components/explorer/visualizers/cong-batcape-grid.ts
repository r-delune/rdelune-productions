import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { resolveCongBatcapeGridTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';
import {
  buildParticles,
  drawSoftParticle,
  hasReducedMotion,
  moveOrbitalParticle,
  type CongParticle,
} from './cong-particle-primitives';

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function seededUnit(value: number): number {
  const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function createCongBatcapeGrid(): Visualizer {
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let phase = 0;
  let sectionCueCount = 0;
  let params: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let audio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let particles: CongParticle[] = [];
  let tuning = resolveCongBatcapeGridTuning();
  let cue = createCueEventState();

  function buildField(): void {
    particles = buildParticles(52, w, h, 47191);
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveCongBatcapeGridTuning(_tuning);
      time = 0;
      phase = 0;
      sectionCueCount = 0;
      cue = createCueEventState();
      buildField();
    },

    update(dt, nextParams, nextAudio, exclusion: ExclusionRect) {
      params = nextParams;
      audio = nextAudio;
      curExclusion = exclusion;
      cue.update(dt);
      time += dt * (0.6 + params.drift * 0.8 + cue.motion * 0.5);
      if (hasReducedMotion()) return;

      const radiusScale = 0.72 + params.density * 0.14 + audio.energy * 0.22;
      const speedScale = 0.42 + params.drift * 0.72 + audio.energy * 0.32;
      for (const particle of particles) {
        moveOrbitalParticle(particle, dt, w * 0.5, h * 0.5, time, radiusScale, speedScale, 0.82);
      }
    },

    draw(_q, ctx) {
      const [br, bg, bb] = cue.mixBackgroundColor(palette.bgDark);
      ctx.fillStyle = `rgba(${br},${bg},${bb},${0.16 + params.density * 0.08})`;
      ctx.fillRect(0, 0, w, h);

      const gridStep = Math.round(tuning.gridSize * (0.7 + params.density * 0.6));
      const rectSize = tuning.rectSize;
      const baseAlpha = tuning.baseAlpha;

      for (let gx = gridStep; gx <= w - gridStep; gx += gridStep) {
        for (let gy = gridStep; gy <= h - gridStep; gy += gridStep) {
          const excl = computeExclusion(gx, gy, curExclusion);
          if (excl.density < 0.15) continue;

          // Per-cell seed for staggered color morphing + flicker
          const seed = seededUnit(gx * 1.3 + gy * 0.7);

          // Phase 3+: flicker per cell via sin(time * speed + seed * TAU)
          let flickerMod = 1;
          if (phase >= 3) {
            const freq = tuning.flickerSpeed * (0.8 + seed * 0.4);
            flickerMod = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(time * freq + seed * Math.PI * 2));
          }

          const rgb = cue.mixParticleColor(palette.dotColor, seed);
          const alpha = clamp01(
            (baseAlpha + audio.energy * baseAlpha * 0.8 + params.glow * baseAlpha * 0.6)
            * flickerMod
            * excl.alpha
          );

          ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
          // NO ctx.stroke() — pure fill (noStroke aesthetic from batcape)
          ctx.fillRect(gx - 1, gy - 1, rectSize, rectSize);
        }
      }

      if (!hasReducedMotion()) {
        for (const particle of particles) {
          const color = cue.mixParticleColor(palette.dotColor, particle.seed);
          drawSoftParticle(ctx, particle, palette, params, audio, curExclusion, 1.45 + audio.energy * 0.55, color);
        }
      }
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      const intensity = clamp01(event.intensity ?? 0.5);
      if (event.type === 'section-cue') {
        sectionCueCount += 1;
        phase = Math.min(3, event.sectionIndex ?? sectionCueCount);
      }
      if (event.type === 'bloom-flash' || event.type === 'spark-burst') {
        void intensity;
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildField();
    },

    destroy() {
      particles = [];
    },
  };
}
