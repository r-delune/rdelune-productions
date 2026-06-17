import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { resolveCongContourLinesTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';
import { hasReducedMotion } from './cong-particle-primitives';

interface ContourBand {
  baseY: number;
  amp: number;
  freq: number;
  speed: number;
  alpha: number;
  lineWidth: number;
  seed: number;
  tint: number;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function createCongContourLines(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let bands: ContourBand[] = [];
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let tuning = resolveCongContourLinesTuning();
  let cue = createCueEventState();
  let sectionCueCount = 0;
  let densityLift = 0;
  let densityLiftTarget = 0;
  let ampLift = 0;
  let ampLiftTarget = 0;
  let widthLift = 0;
  let widthLiftTarget = 0;
  let warmTurn = 0;
  let warmTurnTarget = 0;
  let ridgeGlow = 0;
  let ridgeGlowTarget = 0;

  function buildBands() {
    bands = [];
    for (let index = 0; index < tuning.bandCount; index += 1) {
      const depth = index / Math.max(tuning.bandCount - 1, 1);
      bands.push({
        baseY: h * (0.08 + depth * 0.84),
        amp: 18 + (1 - depth) * 52,
        freq: 0.0018 + depth * 0.0034,
        speed: 0.08 + depth * 0.2,
        alpha: 0.018 + depth * 0.05,
        lineWidth: 0.8 + (1 - depth) * 2,
        seed: Math.random() * 1000,
        tint: depth,
      });
    }
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveCongContourLinesTuning(_tuning);
      time = 0;
      cue = createCueEventState();
      sectionCueCount = 0;
      densityLift = 0;
      densityLiftTarget = 0;
      ampLift = 0;
      ampLiftTarget = 0;
      widthLift = 0;
      widthLiftTarget = 0;
      warmTurn = 0;
      warmTurnTarget = 0;
      ridgeGlow = 0;
      ridgeGlowTarget = 0;
      buildBands();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);

      const damp = 1 - Math.pow(0.001, dt);
      densityLift = mix(densityLift, densityLiftTarget, damp);
      ampLift = mix(ampLift, ampLiftTarget, damp);
      widthLift = mix(widthLift, widthLiftTarget, damp);
      warmTurn = mix(warmTurn, warmTurnTarget, damp);
      ridgeGlow = mix(ridgeGlow, ridgeGlowTarget, damp);
      densityLiftTarget = Math.max(0, densityLiftTarget - dt * 0.045);
      ampLiftTarget = Math.max(0, ampLiftTarget - dt * 0.04);
      widthLiftTarget = Math.max(0, widthLiftTarget - dt * 0.05);
      warmTurnTarget = Math.max(0, warmTurnTarget - dt * 0.04);
      ridgeGlowTarget = Math.max(0, ridgeGlowTarget - dt * 0.05);

      if (hasReducedMotion()) return;

      time += dt * (0.22 + params.drift * 0.8 + audio.energy * 0.14 + cue.motion * 0.18 + ampLift * 0.06);
    },

    draw(_q, ctx) {
      const [br, bg, bb] = palette.bgDark;
      ctx.fillStyle = `rgba(${br},${bg},${bb},${tuning.fillAlpha})`;
      ctx.fillRect(0, 0, w, h);

      const [ar, ag, ab] = palette.accentGlow;
      const [wr, wg, wb] = palette.accentWarm;
      const [dr, dg, db] = palette.dotColor;
      const ampScale = 0.7 + curParams.turbulence * 1.6 + curAudio.bass * 0.4 + ampLift * 0.84;

      for (let index = 0; index < bands.length; index += 1) {
        const band = bands[index];
        const tint = band.tint * 0.35 + curParams.glow * 0.45 + curAudio.highs * 0.2 + ridgeGlow * 0.2;
        const warmTint = warmTurn * (0.1 + band.tint * 0.16);
        const [red, green, blue] = cue.mixRidgeColor([
          Math.round(mix(mix(dr, ar, tint), wr, warmTint)),
          Math.round(mix(mix(dg, ag, tint), wg, warmTint)),
          Math.round(mix(mix(db, ab, tint), wb, warmTint)),
        ], band.seed);
        const densityStep = cue.densityProgress(band.seed);
        const baseAlpha = band.alpha * (0.55 + curParams.density * 0.9 + curParams.shimmer * 0.2 + densityLift * 0.72 + ridgeGlow * 0.42) * Math.max(0, Math.min(1, 1 + densityStep * 0.58));

        ctx.strokeStyle = `rgba(${red},${green},${blue},${baseAlpha})`;
        ctx.lineWidth = band.lineWidth * (1 + widthLift * 0.76 + cue.sizeProgress(band.seed) * 0.42);
        ctx.beginPath();

        let started = false;
        for (let x = -80; x <= w + 80; x += tuning.xStep) {
          const noise = q.noise(
            x * band.freq + band.seed,
            time * band.speed + band.seed,
            100 / (0.3 + curAudio.bass + band.tint),
          );
          const swing = Math.sin(x * 0.004 + time * (0.8 + band.speed) + band.seed) * (4 + curAudio.mids * 10);
          let y = band.baseY + (noise - 0.5) * band.amp * ampScale + swing;

          const exclusion = computeExclusion(x, y, curExclusion);
          y = band.baseY + (y - band.baseY) * exclusion.motion;

          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.stroke();
      }

      if (curParams.glow > tuning.accentGlowThreshold || curAudio.transient > tuning.accentTransientThreshold || ridgeGlow > 0.05) {
        const accentY = h * (0.42 + Math.sin(time * 0.7) * 0.18);
        const accent = ctx.createLinearGradient(0, accentY, w, accentY);
        accent.addColorStop(0, `rgba(${ar},${ag},${ab},0)`);
        accent.addColorStop(0.45, `rgba(${ar},${ag},${ab},${0.012 + curParams.glow * 0.04 + curAudio.transient * 0.06 + ridgeGlow * 0.08})`);
        accent.addColorStop(0.55, `rgba(${ar},${ag},${ab},${0.02 + curParams.glow * 0.05 + curAudio.transient * 0.08 + ridgeGlow * 0.11})`);
        accent.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
        ctx.fillStyle = accent;
        ctx.fillRect(0, accentY - 80, w, 160);
      }
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      const intensity = event.intensity ?? 0.5;
      if (event.type === 'section-cue') {
        sectionCueCount += 1;
        const step = Math.min(1, sectionCueCount / 5);
        densityLiftTarget = Math.max(densityLiftTarget, 0.16 + step * 0.42 + intensity * 0.16);
        ampLiftTarget = Math.max(ampLiftTarget, 0.14 + step * 0.36 + intensity * 0.18);
        ridgeGlowTarget = Math.max(ridgeGlowTarget, 0.16 + step * 0.5);
      }
      if (event.type === 'density-surge' || event.type === 'grain-bloom') {
        densityLiftTarget = Math.max(densityLiftTarget, 0.44 + intensity * 0.42);
        widthLiftTarget = Math.max(widthLiftTarget, 0.18 + intensity * 0.34);
      }
      if (event.type === 'motion-drift' || event.type === 'veil-sweep') {
        ampLiftTarget = Math.max(ampLiftTarget, 0.34 + intensity * 0.48);
      }
      if (event.type === 'color-morph' || event.type === 'palette-morph') {
        warmTurnTarget = Math.max(warmTurnTarget, 0.32 + intensity * 0.5);
        ridgeGlowTarget = Math.max(ridgeGlowTarget, 0.28 + intensity * 0.44);
      }
      if (event.type === 'glow-pulse' || event.type === 'spark-burst' || event.type === 'bloom-flash') {
        ridgeGlowTarget = Math.max(ridgeGlowTarget, 0.38 + intensity * 0.5);
        widthLiftTarget = Math.max(widthLiftTarget, 0.22 + intensity * 0.3);
      }
      time += 0.05 + intensity * 0.06;
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildBands();
    },

    destroy() {
      bands = [];
    },
  };
}
