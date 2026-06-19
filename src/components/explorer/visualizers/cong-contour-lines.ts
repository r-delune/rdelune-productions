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
  depth: number;
  lateral: number;
  terrace: boolean;
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
      const perspective = Math.pow(depth, 1.42);
      bands.push({
        baseY: h * (0.14 + perspective * 0.8),
        amp: 8 + depth * 58,
        freq: 0.0014 + depth * 0.0048,
        speed: 0.045 + depth * 0.22,
        alpha: 0.012 + depth * 0.058,
        lineWidth: 0.55 + depth * 2.3,
        seed: Math.random() * 1000,
        tint: depth,
        depth,
        lateral: (Math.random() - 0.5) * 160,
        terrace: index % 4 === 0 && depth > 0.38,
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
      const sectionArc = Math.min(1, sectionCueCount / 5 + densityLift * 0.16 + ridgeGlow * 0.12);
      const revealDepth = 0.46 + sectionArc * 0.62 + curParams.density * 0.08;
      const ampScale = 0.54 + curParams.turbulence * 1.35 + curAudio.bass * 0.52 + ampLift * 0.92 + sectionArc * 0.42;
      const horizonY = h * (0.28 - sectionArc * 0.045 + Math.sin(time * 0.11) * 0.015);
      const wash = ctx.createLinearGradient(0, horizonY - h * 0.12, 0, h);
      wash.addColorStop(0, `rgba(${ar},${ag},${ab},${0.012 + ridgeGlow * 0.025})`);
      wash.addColorStop(0.38, `rgba(${dr},${dg},${db},${0.016 + sectionArc * 0.018})`);
      wash.addColorStop(1, `rgba(${wr},${wg},${wb},${0.008 + warmTurn * 0.02})`);
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, w, h);

      for (let index = 0; index < bands.length; index += 1) {
        const band = bands[index];
        if (band.depth > revealDepth) continue;

        const near = band.depth;
        const tint = band.tint * 0.42 + curParams.glow * 0.38 + curAudio.highs * 0.2 + ridgeGlow * 0.2;
        const warmTint = warmTurn * (0.1 + band.tint * 0.16);
        const [red, green, blue] = cue.mixRidgeColor([
          Math.round(mix(mix(dr, ar, tint), wr, warmTint)),
          Math.round(mix(mix(dg, ag, tint), wg, warmTint)),
          Math.round(mix(mix(db, ab, tint), wb, warmTint)),
        ], band.seed);
        const densityStep = cue.densityProgress(band.seed);
        const depthReveal = Math.max(0, Math.min(1, (revealDepth - band.depth) / 0.18));
        const baseAlpha = band.alpha
          * (0.45 + near * 0.72 + curParams.density * 0.9 + curParams.shimmer * 0.18 + densityLift * 0.72 + ridgeGlow * 0.42)
          * Math.max(0, Math.min(1, 1 + densityStep * 0.58))
          * depthReveal;

        const lineWidth = band.lineWidth * (0.72 + near * 0.7 + widthLift * 0.76 + cue.sizeProgress(band.seed) * 0.42);
        const parallax = (time * (12 + near * 46) + band.lateral + Math.sin(time * 0.16 + band.seed) * 28) * (0.18 + near);
        const crush = 1 - sectionArc * 0.08 * (1 - near);
        const sampleY = (x: number): number => {
          const px = x + parallax;
          const noise = q.noise(
            px * band.freq + band.seed,
            time * band.speed + band.seed,
            sectionArc * 0.7 + 100 / (0.3 + curAudio.bass + band.tint),
          );
          const folded = q.noise(
            px * band.freq * 2.8 + band.seed * 0.31,
            band.depth * 13.7 + time * 0.06,
            8.7,
          );
          const swing = Math.sin(px * (0.0028 + near * 0.002) + time * (0.48 + band.speed) + band.seed) * (3 + curAudio.mids * 14 + sectionArc * 10);
          const faultPull = Math.sin((x / Math.max(w, 1)) * Math.PI * (1.4 + sectionArc * 1.3) + band.seed) * sectionArc * near * 22;
          let y = horizonY * (1 - near) + band.baseY * near * crush + (noise - 0.5) * band.amp * ampScale + (folded - 0.5) * band.amp * 0.28 * sectionArc + swing + faultPull;

          const exclusion = computeExclusion(x, y, curExclusion);
          return band.baseY + (y - band.baseY) * exclusion.motion;
        };

        ctx.strokeStyle = `rgba(${red},${green},${blue},${baseAlpha})`;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();

        let started = false;
        for (let x = -80; x <= w + 80; x += tuning.xStep) {
          const y = sampleY(x);

          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.stroke();

        if (sectionArc > 0.32 && near < 0.58 && index % 3 === 0) {
          const glintCount = 1 + Math.floor(sectionArc * 3);
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = `rgba(${wr},${wg},${wb},${Math.min(0.018 + ridgeGlow * 0.06 + curAudio.highs * 0.035, 0.12)})`;
          for (let glint = 0; glint < glintCount; glint += 1) {
            const frac = q.noise(band.seed, glint * 17.3, 4.1);
            const x = -40 + frac * (w + 80);
            const y = sampleY(x);
            const exclusion = computeExclusion(x, y, curExclusion);
            if (exclusion.density < 0.45) continue;
            const radius = (0.7 + q.noise(glint, band.seed, time * 0.08) * 1.8) * (0.65 + sectionArc);
            ctx.beginPath();
            ctx.arc(x, y - 1.5 - near * 6, radius, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        if (band.terrace && sectionArc > 0.18) {
          const terraceAlpha = baseAlpha * (0.8 + near * 1.4) * Math.min(1, sectionArc * 1.4);
          ctx.fillStyle = `rgba(${red},${green},${blue},${Math.min(terraceAlpha, 0.045)})`;
          ctx.beginPath();
          let fillStarted = false;
          for (let x = -80; x <= w + 80; x += tuning.xStep) {
            const y = sampleY(x);
            if (!fillStarted) {
              ctx.moveTo(x, y);
              fillStarted = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.lineTo(w + 80, h + 80);
          ctx.lineTo(-80, h + 80);
          ctx.closePath();
          ctx.fill();
        }
      }

      if (sectionArc > 0.22 || ampLift > 0.25 || ridgeGlow > 0.1) {
        const seams = 2 + Math.floor(sectionArc * 3);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let seam = 0; seam < seams; seam += 1) {
          const seed = 71 + seam * 113;
          const baseX = w * (0.18 + seam * 0.21 + q.noise(seed, 0, 0) * 0.08 + Math.sin(time * 0.06 + seed) * 0.035);
          const alpha = (0.012 + ridgeGlow * 0.035 + curAudio.transient * 0.04) * Math.min(1, sectionArc * 1.4);
          ctx.strokeStyle = `rgba(${wr},${wg},${wb},${alpha})`;
          ctx.lineWidth = 0.7 + sectionArc * 1.5 + ridgeGlow * 1.2;
          ctx.beginPath();
          let started = false;
          for (let y = h * 0.12; y <= h * 0.98; y += 28) {
            const drift = (q.noise(seed, y * 0.004, time * 0.045) - 0.5) * (40 + sectionArc * 80);
            const x = baseX + drift + Math.sin(y * 0.018 + time * 0.22 + seed) * (8 + sectionArc * 18);
            const exclusion = computeExclusion(x, y, curExclusion);
            const safeX = baseX + (x - baseX) * exclusion.motion;
            if (!started) {
              ctx.moveTo(safeX, y);
              started = true;
            } else {
              ctx.lineTo(safeX, y);
            }
          }
          ctx.stroke();
        }
        ctx.restore();
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
