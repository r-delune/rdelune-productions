import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import { applyPaletteTransform, clonePalette, type Palette } from '../palette';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { hasReducedMotion } from './cong-particle-primitives';
import { createCueEventState } from './cue-event-state';

/*
 * Technique: broken chromatic arcs with noise-warped radii, beat-released
 * echo fragments, and slow section-gated halo growth. The echo fragments
 * imply concentric rhythm without becoming diagrammatic full circles.
 */

interface EchoArc {
  age: number;
  life: number;
  seed: number;
  start: number;
  span: number;
  strength: number;
  direction: number;
}

interface CenterParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
  size: number;
  warm: boolean;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(mix(a[0], b[0], t)),
    Math.round(mix(a[1], b[1], t)),
    Math.round(mix(a[2], b[2], t)),
  ];
}

export function createCongChromaticRing(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let shiftedPalette: Palette;
  let time = 0;
  let burst = 0;
  let expandPulse = 0;
  let beatKick = 0;
  let previousBeatPulse = 0;
  let previousTransient = 0;
  let sectionCueCount = 0;
  let cue = createCueEventState();
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let ringRadius = 0;
  let ringSmooth = 0;
  let phase = 0;
  let chromaReveal = 0;
  let growth = 0;
  let growthTarget = 0;
  let orbPresence = 0;
  let orbPresenceTarget = 0;
  let orbGrowth = 0;
  let orbGrowthTarget = 0;
  let echoes: EchoArc[] = [];
  let echoSeed = 0;
  // Evolution
  let sectionAge = 0;
  let sectionEchoBoost = 0;
  let echoLifeMultiplier = 1;
  let rotationMomentum = 0;
  let rotationMomentumTarget = 0;
  let chromaReveal2 = 0;
  let chromaReveal2Target = 0;
  // Crescendo
  let crescendoRing = 0;
  let crescendoWarmRatio = 0.5;
  let crescendoWarmEcho = 0;
  // BPM-sympathetic center particles
  let centerParticles: CenterParticle[] = [];

  function pushEcho(strength: number): void {
    if (echoes.length >= 9) echoes.shift();
    const seed = echoSeed;
    echoSeed += 1;
    echoes.push({
      age: 0,
      life: (0.72 + growth * 0.76 + strength * 0.24) * echoLifeMultiplier,
      seed: seed + 0.37,
      start: time * 0.44 + seed * 1.91,
      span: Math.PI * (0.28 + growth * 0.46 + strength * 0.18),
      strength,
      direction: seed % 2 === 0 ? 1 : -1,
    });
  }

  function strokeOrganicArc(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number,
    start: number,
    span: number,
    seed: number,
    color: [number, number, number],
    alpha: number,
    lineWidth: number,
    deformation = 1,
  ): void {
    if (alpha <= 0.001 || radius <= 0) return;
    const steps = Math.max(10, Math.ceil(Math.abs(span) / (Math.PI / 18)));
    const direction = span < 0 ? -1 : 1;

    for (let index = 0; index < steps; index += 1) {
      const t0 = index / steps;
      const t1 = (index + 1) / steps;
      const angle0 = start + span * t0;
      const angle1 = start + span * t1;
      const ripple0 = (q.noise(seed, t0 * 2.1, time * 0.12) - 0.5) * deformation
        + Math.sin(time * 0.46 + seed * 4.1 + t0 * Math.PI * 3) * deformation * 0.17;
      const ripple1 = (q.noise(seed, t1 * 2.1, time * 0.12) - 0.5) * deformation
        + Math.sin(time * 0.46 + seed * 4.1 + t1 * Math.PI * 3) * deformation * 0.17;
      const r0 = radius + ripple0;
      const r1 = radius + ripple1;
      const x0 = centerX + Math.cos(angle0) * r0;
      const y0 = centerY + Math.sin(angle0) * r0;
      const x1 = centerX + Math.cos(angle1) * r1;
      const y1 = centerY + Math.sin(angle1) * r1;
      const factors = computeExclusion((x0 + x1) * 0.5, (y0 + y1) * 0.5, curExclusion);
      const shimmer = 0.82 + q.noise(seed + 29, t0 * 3.4, time * 0.34) * (0.12 + curParams.shimmer * 0.18 + curAudio.highs * 0.2);

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha * factors.alpha * shimmer})`;
      ctx.lineWidth = lineWidth * (0.76 + factors.contrast * 0.24) * (direction < 0 ? 0.92 : 1);
      ctx.stroke();
    }
  }

  return {
    setup(_q, _w, _h, _palette) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      shiftedPalette = clonePalette(_palette);
      time = 0;
      burst = 0;
      expandPulse = 0;
      beatKick = 0;
      previousBeatPulse = 0;
      previousTransient = 0;
      sectionCueCount = 0;
      cue = createCueEventState();
      ringRadius = Math.min(w, h) * 0.28;
      ringSmooth = ringRadius;
      phase = 0;
      chromaReveal = 0;
      growth = 0;
      growthTarget = 0;
      orbPresence = 0;
      orbPresenceTarget = 0;
      orbGrowth = 0;
      orbGrowthTarget = 0;
      echoes = [];
      echoSeed = 0;
      sectionAge = 0;
      sectionEchoBoost = 0;
      echoLifeMultiplier = 1;
      rotationMomentum = 0;
      rotationMomentumTarget = 0;
      chromaReveal2 = 0;
      chromaReveal2Target = 0;
      crescendoRing = 0;
      crescendoWarmRatio = 0.5;
      crescendoWarmEcho = 0;
      centerParticles = [];
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      applyPaletteTransform(shiftedPalette, palette, { hueShift: params.hueShift });
      cue.update(dt);

      const reduced = hasReducedMotion();
      if (reduced) return;

      burst = Math.max(0, burst - dt * 2.9);
      expandPulse = Math.max(0, expandPulse - dt * 3.1);
      beatKick = Math.max(0, beatKick - dt * 3.8);
      growth = mix(growth, growthTarget, 1 - Math.pow(0.45, dt));
      orbPresence = mix(orbPresence, orbPresenceTarget, 1 - Math.pow(0.001, dt));
      orbGrowth = mix(orbGrowth, orbGrowthTarget, 1 - Math.pow(0.45, dt));
      chromaReveal = mix(chromaReveal, phase >= 2 ? 1 : phase >= 1 ? 0.5 : 0, 1 - Math.pow(0.45, dt));
      // Evolution
      sectionAge += dt;
      sectionEchoBoost = smoothstep(Math.min(1, sectionAge / 8)) * 0.32;
      rotationMomentum = mix(rotationMomentum, rotationMomentumTarget, 1 - Math.pow(0.45, dt));
      chromaReveal2 = mix(chromaReveal2, chromaReveal2Target, 1 - Math.pow(0.45, dt));
      // Crescendo
      crescendoRing *= Math.exp(-dt / 2.4);
      crescendoWarmEcho *= Math.exp(-dt / 2.0);

      const beatPulse = audio.beatPulse ?? 0;
      const beatCrossing = audio.beatPulse !== undefined && beatPulse > 0.72 && previousBeatPulse <= 0.72;
      const fallbackCrossing = audio.beatPulse === undefined && audio.transient > 0.2 && previousTransient <= 0.2;
      if (beatCrossing || fallbackCrossing) {
        const strength = clamp01(Math.max(beatPulse, audio.transient, 0.42) + params.impulse * 0.2);
        pushEcho(strength + sectionEchoBoost * 0.4);
        beatKick = Math.max(beatKick, 0.5 + strength * 0.5);
        expandPulse = Math.max(expandPulse, 0.1 + strength * 0.28);
        // Spawn blurred center particles sympathetic to beat
        const spawnN = Math.min(4, 1 + Math.round(sectionCueCount * 0.5));
        for (let i = 0; i < spawnN; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 18 + Math.random() * 35 * (1 + growth * 1.2);
          if (centerParticles.length >= 60) centerParticles.shift();
          centerParticles.push({
            x: w * 0.5, y: h * 0.5,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            age: 0,
            maxAge: 0.55 + Math.random() * 0.7 * (1 + growth * 0.6),
            size: 2.5 + Math.random() * 4 + beatPulse * 3.5,
            warm: Math.random() < crescendoWarmRatio,
          });
        }
      }
      // Advance center particles
      for (let i = centerParticles.length - 1; i >= 0; i--) {
        const cp = centerParticles[i];
        cp.age += dt;
        cp.vx *= Math.pow(0.15, dt);
        cp.vy *= Math.pow(0.15, dt);
        cp.x += cp.vx * dt;
        cp.y += cp.vy * dt;
        if (cp.age >= cp.maxAge) centerParticles.splice(i, 1);
      }
      previousBeatPulse = beatPulse;
      previousTransient = audio.transient;

      if (audio.transient > 0.15) {
        burst = Math.max(burst, audio.transient * 0.95 + params.impulse * 0.18);
        expandPulse = Math.max(expandPulse, audio.transient * 0.23);
      }

      time += dt * (0.16 + params.drift * 0.72 + audio.energy * 1.72 + beatKick * 0.22);
      const base = Math.min(w, h) * (0.2 + params.density * 0.07 + growth * 0.035);
      ringRadius = base * (1 + audio.bass * 0.34 + beatKick * 0.16 + expandPulse * 0.12);
      ringSmooth += (ringRadius - ringSmooth) * Math.min(1, dt * 6.8);

      for (let index = echoes.length - 1; index >= 0; index -= 1) {
        echoes[index].age += dt;
        if (echoes[index].age >= echoes[index].life) echoes.splice(index, 1);
      }
    },

    draw(_q, ctx) {
      const [br, bg, bb] = cue.mixBackgroundColor(shiftedPalette.bgDark);
      const [ar, ag, ab] = cue.mixForegroundColor(shiftedPalette.accentGlow);
      const [wr, wg, wb] = cue.mixForegroundColor(shiftedPalette.accentWarm);
      const centerX = w / 2;
      const centerY = h / 2;
      const centerFactors = computeExclusion(centerX, centerY, curExclusion);
      const beatPulse = curAudio.beatPulse ?? 0;

      ctx.fillStyle = `rgba(${br},${bg},${bb},${0.1 + cue.focus * 0.03})`;
      ctx.fillRect(0, 0, w, h);

      if (orbPresence > 0.004) {
        const orbColor = cue.mixCenterColor(mixRgb([wr, wg, wb], [ar, ag, ab], clamp01(orbGrowth * 0.72)));
        const glowRadius = Math.min(w, h) * (0.19 + orbGrowth * 0.34 + curAudio.bass * 0.04 + beatKick * 0.025);
        const glowAlpha = (0.025 + curParams.glow * 0.035 + cue.focus * 0.055 + curAudio.energy * 0.018) * orbPresence * centerFactors.alpha;
        const halo = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius);
        halo.addColorStop(0, `rgba(${orbColor[0]},${orbColor[1]},${orbColor[2]},${Math.min(0.15, glowAlpha)})`);
        halo.addColorStop(0.54, `rgba(${orbColor[0]},${orbColor[1]},${orbColor[2]},${glowAlpha * 0.38})`);
        halo.addColorStop(1, `rgba(${orbColor[0]},${orbColor[1]},${orbColor[2]},0)`);
        ctx.fillStyle = halo;
        ctx.fillRect(centerX - glowRadius, centerY - glowRadius, glowRadius * 2, glowRadius * 2);
      }

      const ambientBreath = 1 + Math.sin(time * 0.41) * 0.012 + (q.noise(31, time * 0.09, 0.4) - 0.5) * 0.018;
      const radius = ringSmooth * ambientBreath;
      const rotation = time * (0.24 + curParams.drift * 0.34 + growth * 0.22 + rotationMomentum) + curAudio.mids * 0.34;
      const split = (3 + curParams.turbulence * 9 + burst * 12 + beatKick * 6 + growth * 6) * (Math.PI / 180);
      const span = Math.PI * (0.46 + growth * 0.7) + curAudio.bass * 0.18;
      const lineWidth = 1.2 + curParams.shimmer * 2.2 + curAudio.highs * 2.6 + curAudio.mids * 1.4 + burst * 2.3 + beatKick * 1.7 + cue.bloom * 2;
      const deformation = Math.min(w, h) * (0.004 + curParams.turbulence * 0.014 + burst * 0.008);
      const neutral = cue.mixForegroundColor(shiftedPalette.dotColor);

      // Center particles — blurred dots emitted on beats, radiating outward
      if (centerParticles.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (const cp of centerParticles) {
          const t = cp.age / cp.maxAge;
          const alpha = (1 - t) * (1 - t) * 0.26;
          const r = cp.size * (1 + t * 2.2);
          const [pr, pg, pb] = cp.warm ? [wr, wg, wb] : [ar, ag, ab];
          const grad = ctx.createRadialGradient(cp.x, cp.y, 0, cp.x, cp.y, r);
          grad.addColorStop(0, `rgba(${pr},${pg},${pb},${alpha})`);
          grad.addColorStop(1, `rgba(${pr},${pg},${pb},0)`);
          ctx.fillStyle = grad;
          ctx.fillRect(cp.x - r, cp.y - r, r * 2, r * 2);
        }
        ctx.restore();
      }

      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalCompositeOperation = 'screen';

      for (let index = 0; index < echoes.length; index += 1) {
        const echo = echoes[index];
        const progress = clamp01(echo.age / echo.life);
        const release = 1 - progress;
        const echoRadius = radius * (1.05 + progress * (0.38 + growth * 0.24) + curAudio.bass * 0.06);
        const echoRotation = echo.start + echo.direction * progress * (0.34 + growth * 0.24);
        const echoAlpha = (0.045 + echo.strength * 0.12 + curParams.glow * 0.035) * release * release;
        const echoColor = crescendoWarmEcho > 0.1 ? [wr, wg, wb] as [number, number, number] : (index % 2 === 0 ? [ar, ag, ab] as [number, number, number] : [wr, wg, wb] as [number, number, number]);
        strokeOrganicArc(ctx, centerX, centerY, echoRadius, echoRotation, echo.span, echo.seed, echoColor, echoAlpha, lineWidth * (0.5 + release * 0.46), deformation * (1.3 + progress));
        strokeOrganicArc(ctx, centerX, centerY, echoRadius * 0.985, echoRotation + split * 0.68, -echo.span * 0.36, echo.seed + 13, neutral, echoAlpha * 0.34, lineWidth * 0.36, deformation * 0.8);
      }

      const layerCount = 1 + Math.floor(growth * 2.9);
      for (let layer = 0; layer < layerCount; layer += 1) {
        const layerProgress = layerCount === 1 ? 0 : layer / (layerCount - 1);
        const layerRadius = radius * (1 + (layer - (layerCount - 1) * 0.45) * (0.034 + growth * 0.018));
        const layerRotation = rotation + layer * (0.22 + growth * 0.12);
        const layerSpan = span * (1 - layerProgress * 0.16);
        const layerAlpha = (0.15 + curParams.glow * 0.17 + curAudio.mids * 0.095 + burst * 0.13 + beatPulse * 0.07)
          * (1 - layerProgress * 0.28);

        strokeOrganicArc(ctx, centerX, centerY, layerRadius, layerRotation, layerSpan, 2 + layer, neutral, layerAlpha, lineWidth * 1.08, deformation);
        if (chromaReveal > 0.01) {
          strokeOrganicArc(ctx, centerX, centerY, layerRadius * 1.027, layerRotation - split, layerSpan * 0.96, 18 + layer, [wr, wg, wb], layerAlpha * chromaReveal * 0.84, lineWidth * 0.78, deformation * 1.1);
          strokeOrganicArc(ctx, centerX, centerY, layerRadius * 0.974, layerRotation + split, layerSpan * 0.92, 38 + layer, [ar, ag, ab], layerAlpha * chromaReveal * 0.76, lineWidth * 0.74, deformation * 1.15);
        }
        if (chromaReveal2 > 0.01) {
          strokeOrganicArc(ctx, centerX, centerY, layerRadius * 0.948, layerRotation - split * 1.72, layerSpan * 0.88, 58 + layer, [wr, wg, wb], layerAlpha * chromaReveal2 * 0.48, lineWidth * 0.62, deformation * 1.2);
        }

        strokeOrganicArc(ctx, centerX, centerY, layerRadius, layerRotation + Math.PI, layerSpan * (0.26 + growth * 0.18), 72 + layer, neutral, layerAlpha * (0.22 + growth * 0.26), lineWidth * 0.5, deformation * 0.86);
      }

      if (burst > 0.05 || cue.bloom > 0.05 || beatKick > 0.06) {
        const tipAlpha = clamp01(burst * 0.62 + cue.bloom * 0.46 + beatKick * 0.34) * centerFactors.alpha;
        const tipX = centerX + Math.cos(rotation + span) * radius;
        const tipY = centerY + Math.sin(rotation + span) * radius;
        const tipFactors = computeExclusion(tipX, tipY, curExclusion);
        const tipRadius = 2 + burst * 6 + cue.bloom * 4 + beatKick * 4;
        const tipGlow = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, tipRadius * 3);
        tipGlow.addColorStop(0, `rgba(${wr},${wg},${wb},${tipAlpha * tipFactors.alpha})`);
        tipGlow.addColorStop(1, `rgba(${wr},${wg},${wb},0)`);
        ctx.fillStyle = tipGlow;
        ctx.fillRect(tipX - tipRadius * 3, tipY - tipRadius * 3, tipRadius * 6, tipRadius * 6);
      }

      ctx.restore();

      // Crescendo: extra concentric burst arcs using 'lighter' blend
      if (crescendoRing > 0.1) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        const burstCount = Math.floor(crescendoRing * 3);
        for (let i = 0; i < burstCount; i++) {
          const burstRadius = radius * (1.18 + i * 0.22 + crescendoRing * 0.14);
          const burstAlpha = crescendoRing * 0.06 * (1 - i * 0.28);
          if (burstAlpha > 0.002) {
            strokeOrganicArc(ctx, centerX, centerY, burstRadius, rotation + i * 0.44, span * 0.72, 99 + i, [ar, ag, ab], burstAlpha, lineWidth * 1.4, deformation * 1.6);
          }
        }
        ctx.restore();
      }
    },

    onEvent(event: VisualEvent) {
      const intensity = clamp01(event.intensity ?? 0.5);
      cue.handle(event, palette);
      if (event.type === 'section-cue') {
        phase = Math.max(0, event.sectionIndex ?? sectionCueCount + 1);
        sectionCueCount = Math.max(sectionCueCount, phase);
        sectionAge = 0;
        growthTarget = Math.max(growthTarget, Math.min(1, 0.12 + sectionCueCount * 0.17));
        orbGrowthTarget = Math.max(orbGrowthTarget, Math.min(1, sectionCueCount / 6));
        if (sectionCueCount >= 2) {
          orbPresenceTarget = Math.max(orbPresenceTarget, Math.min(1, 0.28 + (sectionCueCount - 2) * 0.24));
        }
        burst = Math.max(burst, 0.38 + intensity * 0.44);
        expandPulse = Math.max(expandPulse, 0.18 + intensity * 0.3);
        // Evolution
        echoLifeMultiplier = 1 + smoothstep(sectionCueCount / 6) * 0.62;
        rotationMomentumTarget = Math.min(0.44, sectionCueCount * 0.08);
        if (sectionCueCount >= 4) chromaReveal2Target = Math.min(1, (sectionCueCount - 4) * 0.38);
        // Crescendo warm ratio increases with sections
        if (sectionCueCount >= 3) crescendoWarmRatio = Math.min(1, 0.5 + (sectionCueCount - 3) * 0.12);
      }
      if (event.type === 'bloom-flash' || event.type === 'spark-burst' || event.type === 'glow-pulse') {
        burst = Math.max(burst, 0.34 + intensity * 0.54);
        expandPulse = Math.max(expandPulse, 0.12 + intensity * 0.28);
        // Crescendo
        if (sectionCueCount >= 4) {
          crescendoRing = Math.max(crescendoRing, 0.72 + intensity * 0.28);
          for (let i = 0; i < Math.round(3 + intensity * 4); i++) pushEcho(0.8 + intensity * 0.2);
        }
      }
      if (event.type === 'density-surge' || event.type === 'storm-release') {
        growthTarget = Math.max(growthTarget, Math.min(1, 0.42 + intensity * 0.46));
        burst = Math.max(burst, 0.22 + intensity * 0.4);
        // Crescendo
        if (sectionCueCount >= 4) {
          crescendoRing = Math.max(crescendoRing, 0.72 + intensity * 0.28);
          for (let i = 0; i < Math.round(3 + intensity * 4); i++) pushEcho(0.8 + intensity * 0.2);
        }
        if (event.type === 'storm-release' && sectionCueCount >= 4) {
          crescendoWarmRatio = 1.0;
          crescendoWarmEcho = Math.max(crescendoWarmEcho, 0.6 + intensity * 0.4);
        }
      }
      if (event.type === 'motion-drift' || event.type === 'veil-sweep') {
        expandPulse = Math.max(expandPulse, 0.08 + intensity * 0.2);
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      ringRadius = Math.min(w, h) * (0.2 + curParams.density * 0.07 + growth * 0.035);
      ringSmooth = ringRadius;
    },

    destroy() {
      echoes = [];
      centerParticles = [];
    },
  };
}
