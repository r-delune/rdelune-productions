import type { AudioSignal } from '../audio-signal';
import { hsbToRgb, rgbToHsb, type Palette } from '../palette';
import { getQualityScale } from '../render-quality';
import { resolveNativeAttractorDriftTuning } from '../tuning';
import type { VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { clamp01, createSeededRandom, hasReducedMotion, mix } from './cong-particle-primitives';
import { createCueEventState } from './cue-event-state';

/* ── Native Attractor Drift ──────────────────────────────────
   De Jong attractor traces plotted into a slowly fading trail
   buffer — an ink-like structure that continuously morphs as
   its coefficients drift. Bass onsets give the form a small
   shiver; storm-release surges the step count for brighter,
   denser accumulation.
──────────────────────────────────────────────────────────────── */

function shiftedColor(color: [number, number, number], hueShift: number): [number, number, number] {
  if (Math.abs(hueShift) < 0.01) return color;
  const hsb = rgbToHsb(color[0], color[1], color[2]);
  return hsbToRgb(hsb.h + hueShift, hsb.s, hsb.b);
}

export function createNativeAttractorDrift(): Visualizer {
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let ax = 0;
  let ay = 0;
  let coeffA = -2.0;
  let coeffB = -2.3;
  let coeffC = -1.2;
  let coeffD = 2.1;
  let shiver = 0;
  let surge = 0;
  let widthExpansion = 0;
  let heightExpansion = 0;
  let expansionKick = 0;
  let sectionGrowth = 0;
  let trail: HTMLCanvasElement | null = null;
  let trailCtx: CanvasRenderingContext2D | null = null;
  let cue = createCueEventState();
  let random = createSeededRandom(99721);
  let config = {
    stepsPerFrame: 3200,
    fadeAlpha: 0.02,
    coeffDriftSpeed: 0.05,
    pointAlpha: 0.05,
    scale: 0.32,
    warmMix: 0.4,
    widthGrowth: 0.38,
    heightGrowth: 0.32,
    growthSpeed: 1.8,
    onsetGrowth: 0.18,
  };
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };

  function buildTrail(): void {
    trail = document.createElement('canvas');
    trail.width = Math.max(2, w);
    trail.height = Math.max(2, h);
    trailCtx = trail.getContext('2d');
    ax = random() * 2 - 1;
    ay = random() * 2 - 1;
  }

  function driftCoefficients(): void {
    const expansionMotion = (widthExpansion + heightExpansion) * 0.5;
    const speed = config.coeffDriftSpeed * (0.5 + curParams.drift * 0.9 + cue.motion * 0.4 + expansionMotion * 0.34) + shiver * 0.3;
    coeffA = -2.4 + (Math.sin(time * 0.11 * speed * 10 + 0.4) * 0.5 + 0.5) * 1.6;
    coeffB = -2.6 + (Math.sin(time * 0.083 * speed * 10 + 2.1) * 0.5 + 0.5) * 1.5;
    coeffC = -1.8 + (Math.sin(time * 0.097 * speed * 10 + 4.2) * 0.5 + 0.5) * 2.2 + shiver * 0.12;
    coeffD = 1.4 + (Math.sin(time * 0.071 * speed * 10 + 1.3) * 0.5 + 0.5) * 1.4 - shiver * 0.1;
  }

  function updateExpansion(dt: number, audio: AudioSignal): void {
    const playing = clamp01(audio.playing ?? 0);
    const activity = clamp01(audio.activity ?? 0);
    const beatPulse = clamp01(audio.beatPulse ?? 0);
    const bassOnset = clamp01(audio.bassOnset ?? 0);
    const highOnset = clamp01(audio.highOnset ?? 0);
    const onset = Math.max(clamp01(audio.onsetStrength ?? 0), bassOnset * 0.9, highOnset * 0.7);

    expansionKick = Math.max(expansionKick, onset * config.onsetGrowth + beatPulse * config.onsetGrowth * 0.55);
    expansionKick = Math.max(0, expansionKick - dt * 1.9);
    sectionGrowth = Math.max(0, sectionGrowth - dt * 0.055);

    const widthTarget = clamp01(
      playing * (audio.bass * 0.46 + audio.energy * 0.28 + beatPulse * 0.18)
        + activity * 0.18
        + curParams.drift * 0.12
        + sectionGrowth * 0.58
        + expansionKick,
    );
    const heightTarget = clamp01(
      playing * (audio.mids * 0.24 + audio.highs * 0.2 + audio.energy * 0.26 + beatPulse * 0.14)
        + activity * 0.22
        + curParams.turbulence * 0.1
        + sectionGrowth * 0.72
        + expansionKick * 0.82,
    );
    const ease = 1 - Math.exp(-config.growthSpeed * dt);
    widthExpansion = mix(widthExpansion, widthTarget, ease);
    heightExpansion = mix(heightExpansion, heightTarget, ease);
  }

  function plot(): void {
    if (!trailCtx) return;
    const ctx = trailCtx;
    // Fade old traces toward transparency for slow ink-wash persistence.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${config.fadeAlpha * (1 + curParams.turbulence * 0.6)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    const mobileScale = w < 768 ? 0.45 : 1;
    const steps = Math.round(config.stepsPerFrame * mobileScale * getQualityScale() * (1 + surge * 1.4) * (0.7 + curParams.density * 0.5));
    const cx = w * 0.46;
    const cy = h * 0.5;
    const span = Math.min(w, h) * config.scale;
    const widthScale = 1 + widthExpansion * config.widthGrowth + expansionKick * 0.18 + shiver * 0.025;
    const heightScale = 1 + heightExpansion * config.heightGrowth + expansionKick * 0.14 + shiver * 0.02;
    const motionAmount = 0.24 + widthExpansion * 0.48 + heightExpansion * 0.4 + cue.motion * 0.12;
    const rotation = Math.sin(time * 0.16) * 0.045 * motionAmount;
    const driftX = Math.sin(time * 0.19 + 0.7) * w * 0.015 * motionAmount;
    const driftY = Math.cos(time * 0.17 + 1.3) * h * 0.012 * motionAmount;
    const glowTint = cue.mixParticleColor(shiftedColor(palette.accentGlow, curParams.hueShift));
    const warmTint = cue.mixParticleColor(shiftedColor(palette.accentWarm, curParams.hueShift));
    const alpha = clamp01(config.pointAlpha * (0.7 + curParams.glow * 0.5 + surge * 0.4 + curAudio.highs * 0.2));
    const warmThreshold = config.warmMix;

    // Batch points into two color paths — one fill per color instead of
    // thousands of per-point fillStyle/fillRect calls.
    const glowPath = new Path2D();
    const warmPath = new Path2D();
    for (let step = 0; step < steps; step += 1) {
      const nx = Math.sin(coeffA * ay) - Math.cos(coeffB * ax);
      const ny = Math.sin(coeffC * ax) - Math.cos(coeffD * ay);
      ax = nx;
      ay = ny;
      const projectedX = ax * widthScale + ay * rotation;
      const projectedY = ay * heightScale - ax * rotation;
      const px = cx + driftX + projectedX * span * 0.5;
      const py = cy + driftY + projectedY * span * 0.5;
      // Warm accents gather where the orbit folds outward.
      if ((ax * ax + ay * ay) * 0.25 > warmThreshold) warmPath.rect(px, py, 1, 1);
      else glowPath.rect(px, py, 1, 1);
    }
    ctx.fillStyle = `rgba(${glowTint[0]},${glowTint[1]},${glowTint[2]},${alpha})`;
    ctx.fill(glowPath);
    ctx.fillStyle = `rgba(${warmTint[0]},${warmTint[1]},${warmTint[2]},${alpha})`;
    ctx.fill(warmPath);
    ctx.globalCompositeOperation = 'source-over';
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      w = _w;
      h = _h;
      palette = _palette;
      const tuning = resolveNativeAttractorDriftTuning(_tuning);
      config = {
        stepsPerFrame: tuning.stepsPerFrame,
        fadeAlpha: tuning.fadeAlpha,
        coeffDriftSpeed: tuning.coeffDriftSpeed,
        pointAlpha: tuning.pointAlpha,
        scale: tuning.scale,
        warmMix: tuning.warmMix,
        widthGrowth: tuning.widthGrowth,
        heightGrowth: tuning.heightGrowth,
        growthSpeed: tuning.growthSpeed,
        onsetGrowth: tuning.onsetGrowth,
      };
      time = 0;
      shiver = 0;
      surge = 0;
      widthExpansion = 0;
      heightExpansion = 0;
      expansionKick = 0;
      sectionGrowth = 0;
      random = createSeededRandom(99721 + Math.round(w * 0.5 + h));
      cue = createCueEventState();
      buildTrail();
      driftCoefficients();
      // Pre-roll so the form exists on the first visible frame.
      for (let warm = 0; warm < 30; warm += 1) plot();
    },

    update(dt, params, audio) {
      curParams = params;
      curAudio = audio;
      cue.update(dt);
      shiver = Math.max(0, shiver - dt * 1.6);
      surge = Math.max(0, surge - dt * 0.45);
      if ((audio.bassOnset ?? 0) > 0.6) {
        shiver = Math.max(shiver, clamp01(audio.bassOnset ?? 0) * 0.8);
      }
      if (hasReducedMotion()) return;
      updateExpansion(dt, audio);
      time += dt;
      driftCoefficients();
      plot();
    },

    draw(_q, ctx) {
      if (!trail) return;
      ctx.save();
      ctx.globalAlpha = clamp01(0.75 + curParams.glow * 0.2 + cue.bloom * 0.1);
      const cx = w * 0.46;
      const cy = h * 0.5;
      const liveScaleX = 1 + widthExpansion * config.widthGrowth * 0.12;
      const liveScaleY = 1 + heightExpansion * config.heightGrowth * 0.12;
      const liveRotation = Math.sin(time * 0.11) * 0.018 * (widthExpansion + heightExpansion);
      ctx.translate(cx, cy);
      ctx.rotate(liveRotation);
      ctx.scale(liveScaleX, liveScaleY);
      ctx.drawImage(trail, -cx, -cy);
      ctx.restore();
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      const impulse = clamp01(event.intensity);
      if (event.type === 'storm-release' || event.type === 'density-surge') {
        surge = Math.max(surge, impulse);
        sectionGrowth = Math.max(sectionGrowth, impulse * 0.76);
      }
      if (event.type === 'spark-burst' || event.type === 'bloom-flash') {
        shiver = Math.max(shiver, impulse);
        expansionKick = Math.max(expansionKick, impulse * config.onsetGrowth * 1.2);
      }
      if (event.type === 'section-cue') {
        // Nudge the orbit into a new fold without restarting the form.
        shiver = Math.max(shiver, 0.4 + impulse * 0.4);
        surge = Math.max(surge, impulse * 0.5);
        sectionGrowth = Math.max(sectionGrowth, 0.34 + impulse * 0.46);
        expansionKick = Math.max(expansionKick, impulse * config.onsetGrowth * 0.8);
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildTrail();
      for (let warm = 0; warm < 30; warm += 1) plot();
    },

    destroy() {
      trail = null;
      trailCtx = null;
    },
  };
}
