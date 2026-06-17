import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { getQualityScale } from '../render-quality';
import { resolveNativeSidewindDriftTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { clamp01, createSeededRandom, getParticleBudget, hasReducedMotion, mix } from './cong-particle-primitives';
import { createCueEventState } from './cue-event-state';

/* ── Native Sidewind Drift ───────────────────────────────────
   Sparse motes carried laterally on gusting noise-wind across a
   dim luminous horizon band. Three parallax depth tiers — near
   motes draw as fast bright streaks, far ones as slow dim dots —
   decorrelate as gusts move through. Sections lift the wind,
   shear its direction, and warm the near tier; bass onsets send
   a visible gust front across the field from the windward edge.
──────────────────────────────────────────────────────────────── */

const EDGE_MARGIN = 30;
const TIER_COUNT = 3;

interface GustFront {
  progress: number;
  life: number;
  age: number;
  strength: number;
  active: boolean;
}

export function createNativeSidewindDrift(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let capacity = 0;
  let mx: Float32Array | null = null;
  let my: Float32Array | null = null;
  let mDepth: Float32Array | null = null;
  let mSeed: Float32Array | null = null;
  let horizonCanvas: HTMLCanvasElement | null = null;
  let horizonCtx: CanvasRenderingContext2D | null = null;
  let horizonParity = 0;
  let cue = createCueEventState();
  let random = createSeededRandom(33781);
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let tuning = resolveNativeSidewindDriftTuning();
  let sectionCueCount = 0;
  // Persistent 0..1 progression base — never decays, so the wind, streaks,
  // and horizon all sit permanently higher with each section.
  let sectionProgress = 0;
  let windLift = 0;
  let windLiftTarget = 0;
  let windAngle = 0;
  let windAngleTarget = 0;
  let activeFraction = 0.6;
  let activeFractionTarget = 0.6;
  let warmTurn = 0;
  let warmTurnTarget = 0;
  let gustAmpLift = 0;
  let gustAmpLiftTarget = 0;
  let horizonGlow = 0;
  let horizonGlowTarget = 0;
  let streakLenLift = 0;
  let streakLenLiftTarget = 0;
  let sparkle = 0;
  let onsetCooldown = 0;
  const bandGust = new Float32Array(TIER_COUNT);
  const front: GustFront = { progress: 0, life: 2.5, age: 0, strength: 0, active: false };

  function buildMotes(): void {
    capacity = getParticleBudget(tuning.moteCount, w);
    mx = new Float32Array(capacity);
    my = new Float32Array(capacity);
    mDepth = new Float32Array(capacity);
    mSeed = new Float32Array(capacity);
    for (let index = 0; index < capacity; index += 1) {
      mx[index] = random() * w;
      // Bias distribution toward the horizon band so the frame reads as a
      // landscape rather than uniform static.
      const pull = random();
      const spread = (random() - 0.5) * 2;
      my[index] = clamp01(tuning.horizonY + spread * (0.18 + pull * 0.5)) * h;
      mDepth[index] = random();
      mSeed[index] = random() * 1000;
    }
  }

  function buildHorizonCanvas(): void {
    horizonCanvas = document.createElement('canvas');
    horizonCanvas.width = Math.max(64, Math.round(w / 4));
    horizonCanvas.height = 64;
    horizonCtx = horizonCanvas.getContext('2d');
    renderHorizon();
  }

  function renderHorizon(): void {
    if (!horizonCanvas || !horizonCtx) return;
    const hw = horizonCanvas.width;
    const hh = horizonCanvas.height;
    horizonCtx.clearRect(0, 0, hw, hh);

    const [dr, dg, db] = palette.dotColor;
    const [ar, ag, ab] = palette.accentGlow;
    const tint = clamp01(0.32 + curParams.glow * 0.3 + horizonGlow * 0.3);
    const [hr, hg, hb] = cue.mixMistColor([
      Math.round(mix(dr, ar, tint)),
      Math.round(mix(dg, ag, tint)),
      Math.round(mix(db, ab, tint)),
    ], 7.3);
    const bandAlpha = tuning.horizonAlpha * (0.6 + curParams.density * 0.4 + curAudio.mids * 0.6 + sectionProgress * 0.8 + horizonGlow * 1.2);

    const gradient = horizonCtx.createLinearGradient(0, 0, 0, hh);
    gradient.addColorStop(0, `rgba(${hr},${hg},${hb},0)`);
    gradient.addColorStop(0.55, `rgba(${hr},${hg},${hb},${clamp01(bandAlpha)})`);
    gradient.addColorStop(1, `rgba(${hr},${hg},${hb},0)`);
    horizonCtx.fillStyle = gradient;
    horizonCtx.fillRect(0, 0, hw, hh);

    // One low-amplitude undulation line keeps the band reading as terrain.
    horizonCtx.strokeStyle = `rgba(${hr},${hg},${hb},${clamp01(bandAlpha * 1.6)})`;
    horizonCtx.lineWidth = 1;
    horizonCtx.beginPath();
    for (let x = 0; x <= hw; x += 3) {
      const y = hh * 0.55 + (q.noise(x * 0.02, time * 0.04, 17.7) - 0.5) * hh * 0.3;
      if (x === 0) horizonCtx.moveTo(x, y);
      else horizonCtx.lineTo(x, y);
    }
    horizonCtx.stroke();
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveNativeSidewindDriftTuning(_tuning);
      time = 0;
      horizonParity = 0;
      sectionCueCount = 0;
      sectionProgress = 0;
      windLift = 0;
      windLiftTarget = 0;
      windAngle = (tuning.windAngleDeg * Math.PI) / 180;
      windAngleTarget = windAngle;
      activeFraction = 0.6;
      activeFractionTarget = 0.6;
      warmTurn = 0;
      warmTurnTarget = 0;
      gustAmpLift = 0;
      gustAmpLiftTarget = 0;
      horizonGlow = 0;
      horizonGlowTarget = 0;
      streakLenLift = 0;
      streakLenLiftTarget = 0;
      sparkle = 0;
      onsetCooldown = 0;
      front.active = false;
      random = createSeededRandom(33781 + Math.round(w * 3 + h));
      cue = createCueEventState();
      buildMotes();
      buildHorizonCanvas();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);

      const damp = 1 - Math.pow(0.001, dt);
      windLift = mix(windLift, windLiftTarget, damp);
      warmTurn = mix(warmTurn, warmTurnTarget, damp);
      gustAmpLift = mix(gustAmpLift, gustAmpLiftTarget, damp);
      horizonGlow = mix(horizonGlow, horizonGlowTarget, damp);
      streakLenLift = mix(streakLenLift, streakLenLiftTarget, damp);
      activeFraction = mix(activeFraction, activeFractionTarget, damp * 0.5);
      // The wind direction turn is slower than the other lifts so an angle
      // shear reads as a smooth front moving through, never a snap.
      windAngle = mix(windAngle, windAngleTarget, 1 - Math.pow(0.05, dt * 0.4));
      windLiftTarget = Math.max(0, windLiftTarget - dt * 0.035);
      warmTurnTarget = Math.max(0, warmTurnTarget - dt * 0.03);
      gustAmpLiftTarget = Math.max(0, gustAmpLiftTarget - dt * 0.03);
      horizonGlowTarget = Math.max(0, horizonGlowTarget - dt * 0.03);
      streakLenLiftTarget = Math.max(0, streakLenLiftTarget - dt * 0.035);
      sparkle = Math.max(0, sparkle - dt * 1.4);

      if (hasReducedMotion()) return;
      if (!mx || !my || !mDepth || !mSeed) return;
      time += dt;
      onsetCooldown = Math.max(0, onsetCooldown - dt);

      const gustAmp = tuning.gustAmp * (1 + sectionProgress * 0.5 + gustAmpLift * 0.8);
      for (let tier = 0; tier < TIER_COUNT; tier += 1) {
        const gust = q.noise(time * tuning.gustSpeed, tier * 13.7, 5.1);
        bandGust[tier] = 0.6 + (gust - 0.5) * 2 * gustAmp * (1 + curAudio.bass * 0.5);
      }

      if ((audio.bassOnset ?? 0) > 0.55 && onsetCooldown <= 0 && !front.active) {
        front.active = true;
        front.age = 0;
        front.life = 2.2 + random() * 0.8;
        front.progress = 0;
        front.strength = 0.5 + audio.bass * 0.6;
        onsetCooldown = 1.2;
      }
      if (front.active) {
        front.age += dt;
        front.progress = front.age / front.life;
        if (front.age >= front.life) front.active = false;
      }
      if ((audio.highOnset ?? 0) > 0.6) sparkle = Math.min(1, sparkle + 0.5);

      const dirX = Math.cos(windAngle);
      const dirY = Math.sin(windAngle);
      const speedScale = (0.6 + curParams.drift * 0.7 + sectionProgress * 0.4 + windLift * 0.7 + audio.energy * 0.35 + cue.motion * 0.25);
      const windward = dirX >= 0 ? 0 : w;
      const frontX = front.active ? mix(windward, w - windward, front.progress) : -1;

      const active = Math.round(capacity * clamp01(activeFraction));
      for (let index = 0; index < active; index += 1) {
        const depth = mDepth[index];
        const tier = Math.min(TIER_COUNT - 1, Math.floor(depth * TIER_COUNT));
        let speed = tuning.windBase * (0.3 + Math.pow(depth, 1.5) * 2.7) * bandGust[tier] * speedScale;
        if (front.active) {
          const span = (mx[index] - frontX) / (w * 0.1);
          speed *= 1 + Math.exp(-span * span) * front.strength * 1.6;
        }
        const sway = (q.noise(mSeed[index], time * 0.3, 2.2) - 0.5) * 14 * (0.4 + depth);
        mx[index] += dirX * speed * dt;
        my[index] += dirY * speed * dt + sway * dt;

        if (mx[index] > w + EDGE_MARGIN) mx[index] = -EDGE_MARGIN;
        if (mx[index] < -EDGE_MARGIN) mx[index] = w + EDGE_MARGIN;
        if (my[index] > h + EDGE_MARGIN) my[index] = -EDGE_MARGIN;
        if (my[index] < -EDGE_MARGIN) my[index] = h + EDGE_MARGIN;
      }
    },

    draw(_q, ctx) {
      if (!mx || !my || !mDepth || !mSeed || !horizonCanvas) return;

      const [br, bg, bb] = palette.bgDark;
      ctx.fillStyle = `rgba(${br},${bg},${bb},${tuning.fillAlpha})`;
      ctx.fillRect(0, 0, w, h);

      // Horizon band re-renders at third rate; composite is per-frame.
      horizonParity = (horizonParity + 1) % 3;
      if (horizonParity === 0 && !hasReducedMotion()) renderHorizon();
      const bandHeight = h * 0.22 * (1 + horizonGlow * 0.3);
      const bandY = h * tuning.horizonY - bandHeight / 2;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(horizonCanvas, 0, 0, horizonCanvas.width, horizonCanvas.height, 0, bandY, w, bandHeight);
      ctx.restore();

      const [dr, dg, db] = palette.dotColor;
      const [ar, ag, ab] = palette.accentGlow;
      const [wr, wg, wb] = palette.accentWarm;
      const dirX = Math.cos(windAngle);
      const dirY = Math.sin(windAngle);
      const streakLen = tuning.streakLength * (1 + sectionProgress * 0.5 + streakLenLift * 0.8 + curParams.shimmer * 0.2);
      const drawCount = Math.round(capacity * clamp01(activeFraction) * getQualityScale());

      for (let tier = 0; tier < TIER_COUNT; tier += 1) {
        const tierDepth = (tier + 0.5) / TIER_COUNT;
        const fullPath = new Path2D();
        const dimPath = new Path2D();
        let hasFull = false;
        let hasDim = false;

        for (let index = 0; index < drawCount; index += 1) {
          const depth = mDepth[index];
          if (Math.min(TIER_COUNT - 1, Math.floor(depth * TIER_COUNT)) !== tier) continue;
          const x = mx[index];
          const y = my[index];
          const factors = computeExclusion(x, y, curExclusion);
          if (factors.alpha < 0.25) continue;

          const len = Math.max(1.4, streakLen * Math.pow(depth, 1.4) * bandGust[tier]);
          const path = factors.alpha < 0.85 ? dimPath : fullPath;
          path.moveTo(x, y);
          path.lineTo(x - dirX * len, y - dirY * len);
          if (factors.alpha < 0.85) hasDim = true;
          else hasFull = true;
        }

        const warmTint = warmTurn * (tier === TIER_COUNT - 1 ? 0.4 : 0.1);
        const tint = clamp01(0.2 + tierDepth * 0.5 + curParams.glow * 0.3);
        const [sr, sg, sb] = cue.mixParticleColor([
          Math.round(mix(mix(dr, ar, tint), wr, warmTint)),
          Math.round(mix(mix(dg, ag, tint), wg, warmTint)),
          Math.round(mix(mix(db, ab, tint), wb, warmTint)),
        ], tier * 31.7);
        let alpha = tuning.moteAlpha
          * (0.4 + tierDepth * 0.7 + curParams.density * 0.4 + sectionProgress * 0.3 + curAudio.highs * 0.3 * tierDepth + cue.densityProgress(tier * 5.1) * 0.4);
        if (tier === TIER_COUNT - 1) alpha *= 1 + sparkle * 0.9;
        if (front.active) alpha *= 1 + 0.25 * front.strength * Math.sin(Math.PI * clamp01(front.progress));
        alpha = clamp01(alpha);

        ctx.lineCap = 'round';
        ctx.lineWidth = 0.7 + tierDepth * 1.3;
        if (hasFull) {
          ctx.strokeStyle = `rgba(${sr},${sg},${sb},${alpha})`;
          ctx.stroke(fullPath);
        }
        if (hasDim) {
          ctx.strokeStyle = `rgba(${sr},${sg},${sb},${alpha * 0.35})`;
          ctx.stroke(dimPath);
        }
        // Near tier gets a wide whisper-glow pass for soft depth.
        if (tier === TIER_COUNT - 1 && hasFull) {
          ctx.strokeStyle = `rgba(${sr},${sg},${sb},${alpha * 0.18})`;
          ctx.lineWidth = 3.4;
          ctx.stroke(fullPath);
        }
      }
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      const intensity = clamp01(event.intensity ?? 0.5);
      if (event.type === 'section-cue') {
        sectionCueCount = Math.max(sectionCueCount + 1, event.sectionIndex ?? 0);
        sectionProgress = Math.min(1, sectionCueCount / 5);
        const step = sectionProgress;
        windLiftTarget = Math.max(windLiftTarget, 0.18 + step * 0.42 + intensity * 0.14);
        activeFractionTarget = Math.min(1, 0.6 + step * 0.4);
        if (sectionCueCount >= 2) {
          const shear = (10 + step * 6) * (Math.PI / 180) * (sectionCueCount % 2 === 0 ? 1 : -1);
          windAngleTarget = (tuning.windAngleDeg * Math.PI) / 180 + shear;
          warmTurnTarget = Math.max(warmTurnTarget, 0.24 + step * 0.4);
        }
        if (sectionCueCount >= 3) {
          gustAmpLiftTarget = Math.max(gustAmpLiftTarget, 0.3 + step * 0.5);
          horizonGlowTarget = Math.max(horizonGlowTarget, 0.26 + step * 0.5);
          streakLenLiftTarget = Math.max(streakLenLiftTarget, 0.24 + step * 0.5);
        }
      }
      if (event.type === 'density-surge' || event.type === 'grain-bloom') {
        activeFractionTarget = Math.min(1, activeFractionTarget + 0.1 + intensity * 0.16);
        windLiftTarget = Math.max(windLiftTarget, 0.24 + intensity * 0.3);
      }
      if (event.type === 'motion-drift' || event.type === 'veil-sweep') {
        windLiftTarget = Math.max(windLiftTarget, 0.34 + intensity * 0.44);
        gustAmpLiftTarget = Math.max(gustAmpLiftTarget, 0.2 + intensity * 0.3);
      }
      if (event.type === 'color-morph' || event.type === 'palette-morph') {
        warmTurnTarget = Math.max(warmTurnTarget, 0.3 + intensity * 0.5);
        horizonGlowTarget = Math.max(horizonGlowTarget, 0.2 + intensity * 0.3);
      }
      if (event.type === 'glow-pulse' || event.type === 'spark-burst' || event.type === 'bloom-flash') {
        sparkle = Math.min(1, sparkle + 0.3 + intensity * 0.4);
        horizonGlowTarget = Math.max(horizonGlowTarget, 0.24 + intensity * 0.36);
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildMotes();
      buildHorizonCanvas();
    },

    destroy() {
      mx = null;
      my = null;
      mDepth = null;
      mSeed = null;
      horizonCanvas = null;
      horizonCtx = null;
    },
  };
}
