import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { resolveCongLandscapeSpiralTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';

interface SpiralPulse {
  age: number;
  life: number;
  strength: number;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function createCongLandscapeSpiral(): Visualizer {
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let pulses: SpiralPulse[] = [];
  let transientPulse = 0;
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let tuning = resolveCongLandscapeSpiralTuning();

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveCongLandscapeSpiralTuning(_tuning);
      time = 0;
      pulses = [];
      transientPulse = 0;
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;

      const reduced = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      time += dt * (0.44 + params.drift * 0.95 + audio.energy * 0.24);

      transientPulse = Math.max(0, transientPulse - dt * 2.8);
      if (audio.transient > 0.15) {
        transientPulse = Math.max(transientPulse, audio.transient * 0.95);
      }

      for (let index = pulses.length - 1; index >= 0; index -= 1) {
        pulses[index].age += dt;
        if (pulses[index].age >= pulses[index].life) pulses.splice(index, 1);
      }
    },

    draw(_q, ctx) {
      const [br, bg, bb] = palette.bgDark;
      const [ar, ag, ab] = palette.accentGlow;
      const [wr, wg, wb] = palette.accentWarm;
      const [dr, dg, db] = palette.dotColor;

      ctx.fillStyle = `rgba(${br},${bg},${bb},${tuning.baseFillAlpha})`;
      ctx.fillRect(0, 0, w, h);

      const centerX = w * (tuning.centerX + Math.sin(time * 0.22) * 0.035 + curAudio.bass * 0.03);
      const centerY = h * (tuning.centerY + Math.cos(time * 0.18) * 0.03 - curAudio.mids * 0.025);
      const exclusion = computeExclusion(centerX, centerY, curExclusion);
      const pulseBoost = pulses.reduce((sum, pulse) => sum + (1 - clamp01(pulse.age / pulse.life)) * pulse.strength, 0);

      const halo = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.min(w, h) * (0.42 + transientPulse * 0.18));
      halo.addColorStop(0, `rgba(${ar},${ag},${ab},${(0.06 + curParams.glow * 0.08 + pulseBoost * 0.05 + transientPulse * 0.16) * exclusion.alpha})`);
      halo.addColorStop(0.5, `rgba(${wr},${wg},${wb},${(0.025 + pulseBoost * 0.03 + transientPulse * 0.06) * exclusion.alpha})`);
      halo.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      const maxAngle = Math.PI * 2 * (tuning.maxTurns + curAudio.bass * 3 + pulseBoost * 4 + transientPulse * 2.5);
      const speed = 0.025 + curParams.drift * 0.07 + curAudio.energy * 0.08;

      for (let arm = 0; arm < tuning.armCount; arm += 1) {
        const armOffset = (Math.PI * 2 * arm) / tuning.armCount;
        const tint = arm % 2 === 0 ? [ar, ag, ab] : [wr, wg, wb] as const;
        ctx.strokeStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${(tuning.lineAlpha + transientPulse * 0.14 + pulseBoost * 0.04) * exclusion.alpha})`;
        ctx.lineWidth = 1 + arm * 0.2 + curAudio.highs * 1.4 + transientPulse * 3.2;
        ctx.beginPath();

        let scalar = 10 + arm * 8;
        let started = false;
        for (let angle = 0; angle < maxAngle; angle += speed, scalar += speed * 18) {
          const theta = angle + armOffset + time * (0.8 + arm * 0.12);
          const x = centerX + Math.cos(theta) * scalar;
          const y = centerY + Math.sin(theta) * scalar * (0.78 + curParams.turbulence * 0.18);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      ctx.strokeStyle = `rgba(${dr},${dg},${db},${(tuning.innerAlpha + pulseBoost * 0.08 + transientPulse * 0.1) * exclusion.alpha})`;
      ctx.lineWidth = 1.4 + transientPulse * 2.8;
      ctx.beginPath();
      let scalar = 8 + curAudio.mids * 18;
      let started = false;
      for (let angle = 0; angle < maxAngle * 0.35; angle += speed * 1.4, scalar += speed * 10) {
        const theta = angle + time * 1.2;
        const x = centerX + Math.cos(theta) * scalar;
        const y = centerY + Math.sin(theta) * scalar;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

    },

    onEvent(event) {
      pulses.push({
        age: 0,
        life: 1 + event.intensity * 0.8,
        strength: 0.6 + event.intensity * 0.8,
      });
      if (pulses.length > 5) pulses.shift();
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
    },

    destroy() {
      pulses = [];
    },
  };
}
