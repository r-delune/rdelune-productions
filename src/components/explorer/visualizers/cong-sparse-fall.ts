import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';

interface FallMark {
  x: number;
  y: number;
  length: number;
  speed: number;
  alpha: number;
  seed: number;
  lane: number;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function seeded(seed: number): number {
  const value = Math.sin(seed * 31.718 + 11.41) * 19341.57;
  return value - Math.floor(value);
}

export function createCongSparseFall(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let burst = 0;
  let cue = createCueEventState();
  let marks: FallMark[] = [];
  let densityLift = 0;
  let densityLiftTarget = 0;
  let speedLift = 0;
  let speedLiftTarget = 0;
  let sizeLift = 0;
  let sizeLiftTarget = 0;
  let sectionCueCount = 0;
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };

  function makeMark(index: number, fromTop = false): FallMark {
    const laneCount = Math.max(9, Math.floor(w / 86));
    const lane = Math.floor(seeded(index * 8.3) * laneCount);
    const laneWidth = w / laneCount;
    return {
      x: lane * laneWidth + laneWidth * (0.18 + seeded(index * 4.1) * 0.64),
      y: fromTop ? -seeded(index * 9.9) * h * 0.35 : seeded(index * 2.9) * h,
      length: 18 + seeded(index * 5.7) * 86,
      speed: 24 + seeded(index * 7.2) * 88,
      alpha: 0.035 + seeded(index * 3.6) * 0.08,
      seed: index,
      lane,
    };
  }

  function rebuild() {
    const count = Math.max(72, Math.floor((w * h) / 12000));
    marks = Array.from({ length: count }, (_, index) => makeMark(index));
  }

  return {
    setup(_q, _w, _h, _palette) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      time = 0;
      burst = 0;
      cue = createCueEventState();
      densityLift = 0;
      densityLiftTarget = 0;
      speedLift = 0;
      speedLiftTarget = 0;
      sizeLift = 0;
      sizeLiftTarget = 0;
      sectionCueCount = 0;
      rebuild();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      burst = Math.max(0, burst - dt * 1.3);
      cue.update(dt);
      densityLift += (densityLiftTarget - densityLift) * Math.min(1, dt * 2.2);
      densityLiftTarget *= Math.exp(-dt * 0.18);
      speedLift += (speedLiftTarget - speedLift) * Math.min(1, dt * 2.4);
      speedLiftTarget *= Math.exp(-dt * 0.28);
      sizeLift += (sizeLiftTarget - sizeLift) * Math.min(1, dt * 2.5);
      sizeLiftTarget *= Math.exp(-dt * 0.34);

      const reduced = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      time += dt * (0.72 + params.drift * 1.4 + audio.energy * 0.45);

      const dropScale = 1 + params.drift * 1.7 + audio.bass * 1.3 + burst * 1.8 + speedLift * 1.35 + cue.motion * 0.8;
      for (let i = 0; i < marks.length; i++) {
        const mark = marks[i];
        mark.y += dt * mark.speed * dropScale;
        mark.x += Math.sin(time * (0.8 + mark.lane * 0.03) + mark.seed) * dt * (6 + params.turbulence * 22);

        if (mark.y - mark.length > h + 40 || mark.x < -80 || mark.x > w + 80) {
          marks[i] = makeMark(mark.seed + marks.length * 13 + Math.floor(time * 10), true);
        }
      }
    },

    draw(_q, ctx) {
      const [br, bg, bb] = cue.mixBackgroundColor(palette.bgDark);
      const [ar, ag, ab] = cue.mixForegroundColor(palette.accentGlow);
      const [dr, dg, db] = palette.dotColor;

      ctx.fillStyle = `rgba(${br},${bg},${bb},${0.11 + cue.focus * 0.025})`;
      ctx.fillRect(0, 0, w, h);

      ctx.lineCap = 'round';
      for (const mark of marks) {
        const densityStep = cue.densityProgress(mark.seed);
        if (seeded(mark.seed * 2.2) > 0.42 + curParams.density * 0.54 + densityLift * 0.28 + densityStep * 0.36) continue;
        if (mark.x > curExclusion.left && mark.x < curExclusion.right &&
            mark.y > curExclusion.top && mark.y - mark.length < curExclusion.bottom) continue;

        const noise = q.noise(mark.seed * 0.03, time * 0.18, mark.lane * 0.07);
        const shimmer = Math.sin(time * 4.2 + mark.seed * 0.2) * 0.5 + 0.5;
        const tint = Math.min(1, noise * 0.28 + curParams.glow * 0.38 + curAudio.highs * 0.28 + burst * 0.22);
        const [r, g, b] = cue.mixParticleColor([
          Math.round(mix(dr, ar, tint)),
          Math.round(mix(dg, ag, tint)),
          Math.round(mix(db, ab, tint)),
        ], mark.seed);
        const alpha = mark.alpha * (0.55 + curParams.density * 1.2 + shimmer * curParams.shimmer * 0.8 + curAudio.mids * 0.75 + densityLift * 0.7 + cue.bloom * 0.35);
        const sway = (q.noise(mark.seed * 0.09, time * 0.38, 4) - 0.5) * (10 + curParams.turbulence * 42);
        const fallLength = mark.length * (0.72 + curAudio.bass * 0.65 + burst * 0.5 + sizeLift * 0.42 + cue.sizeProgress(mark.seed) * 0.36);

        const gradient = ctx.createLinearGradient(mark.x + sway, mark.y - fallLength, mark.x, mark.y);
        gradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
        gradient.addColorStop(0.28, `rgba(${r},${g},${b},${alpha * 0.35})`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},${alpha})`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 0.8 + curParams.shimmer * 1.4 + curAudio.highs * 1.6 + sizeLift * 1.2 + cue.sizeProgress(mark.seed) * 1.1;
        ctx.beginPath();
        ctx.moveTo(mark.x + sway, mark.y - fallLength);
        ctx.lineTo(mark.x, mark.y);
        ctx.stroke();

        if (curParams.glow > 0.18 || burst > 0.05) {
          ctx.fillStyle = `rgba(${ar},${ag},${ab},${alpha * (0.24 + burst * 0.55)})`;
          ctx.fillRect(mark.x - 1, mark.y - 1, 2 + curAudio.highs * 2, 2 + curAudio.highs * 2);
        }
      }

      const topFade = ctx.createLinearGradient(0, 0, 0, h * 0.28);
      topFade.addColorStop(0, `rgba(${ar},${ag},${ab},${0.028 + curParams.glow * 0.035})`);
      topFade.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
      ctx.fillStyle = topFade;
      ctx.fillRect(0, 0, w, h * 0.28);
    },

    onEvent(event: VisualEvent) {
      const intensity = event.intensity ?? 0.5;
      cue.handle(event, palette);
      burst = Math.max(burst, intensity);
      if (event.type === 'section-cue') {
        sectionCueCount += 1;
        const step = Math.min(1, sectionCueCount / 5);
        densityLiftTarget = Math.max(densityLiftTarget, 0.12 + step * 0.32 + intensity * 0.18);
        speedLiftTarget = Math.max(speedLiftTarget, 0.08 + step * 0.24 + intensity * 0.16);
      }
      if (event.type === 'color-morph' || event.type === 'palette-morph') {
        densityLiftTarget = Math.max(densityLiftTarget, 0.22 + intensity * 0.34);
        sizeLiftTarget = Math.max(sizeLiftTarget, 0.16 + intensity * 0.32);
      }
      if (event.type === 'glow-pulse' || event.type === 'spark-burst' || event.type === 'bloom-flash') {
        sizeLiftTarget = Math.max(sizeLiftTarget, 0.26 + intensity * 0.42);
        speedLiftTarget = Math.max(speedLiftTarget, 0.18 + intensity * 0.28);
      }
      if (event.type === 'density-surge' || event.type === 'motion-drift') {
        densityLiftTarget = Math.max(densityLiftTarget, 0.28 + intensity * 0.48);
        speedLiftTarget = Math.max(speedLiftTarget, 0.24 + intensity * 0.38);
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      rebuild();
    },

    destroy() {
      marks = [];
    },
  };
}
