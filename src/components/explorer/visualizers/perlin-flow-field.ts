/* ── perlin-flow-field Visualizer ────────────────────────────
   Particles steered by a Perlin noise flow field. Covers the
   full canvas with ambient, organic motion.
   Bass → field chaos, highs → speed, impulse → burst cluster,
   shimmer → trail length, density → active count.
──────────────────────────────────────────────────────────────── */

import type { Palette } from '../palette';
import type { Visualizer, VisualParams, VisualEvent, ExclusionRect } from '../visualizer';
import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import { createCueEventState } from './cue-event-state';

const MAX_PARTICLES = 1100;
const MOBILE_MAX_PARTICLES = 380;
const FIELD_SCALE = 0.0028;   // noise sample frequency
const TWO_PI = Math.PI * 2;
const BAND_HUES = [0, 18, -15, 32] as const;
const BAND_FREQUENCIES = [0.19, 0.14, 0.23, 0.17] as const;
const BAND_PHASES = [0, 1.2, 2.7, 4.1] as const;
const FRESH_PHASE_COUNT = 3;
const FRESH_LIFE_LIMIT = 0.7;

type Rgb = [number, number, number];

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function shiftRgb(base: Rgb, hueShift = 0): Rgb {
  const [r0, g0, b0] = base.map((value) => value / 255);
  const max = Math.max(r0, g0, b0);
  const min = Math.min(r0, g0, b0);
  const light = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  let saturation = 0;

  if (delta > 0) {
    saturation = delta / (1 - Math.abs(2 * light - 1));
    if (max === r0) hue = ((g0 - b0) / delta) % 6;
    else if (max === g0) hue = (b0 - r0) / delta + 2;
    else hue = (r0 - g0) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  hue = (hue + hueShift + 360) % 360;
  const chroma = (1 - Math.abs(2 * light - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - chroma / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) [r, g, b] = [chroma, x, 0];
  else if (hue < 120) [r, g, b] = [x, chroma, 0];
  else if (hue < 180) [r, g, b] = [0, chroma, x];
  else if (hue < 240) [r, g, b] = [0, x, chroma];
  else if (hue < 300) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];

  return [
    Math.round(clamp01(r + m) * 255),
    Math.round(clamp01(g + m) * 255),
    Math.round(clamp01(b + m) * 255),
  ];
}

function mixRgb(base: Rgb, accent: Rgb, amount: number): Rgb {
  return [
    Math.round(base[0] + (accent[0] - base[0]) * amount),
    Math.round(base[1] + (accent[1] - base[1]) * amount),
    Math.round(base[2] + (accent[2] - base[2]) * amount),
  ];
}

function rgba(color: Rgb, alpha: number): string {
  return `rgba(${color[0]},${color[1]},${color[2]},${alpha.toFixed(3)})`;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;    // 0 = newborn, 1 = dead
  maxLife: number; // seconds
  seed: number;    // for color variety
  warm?: boolean;  // when true: draws in accentWarm during crescendo burst
}

export function createPerlinFlowField(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let colorTime = 0;
  let growthTime = 0;
  let isMobile = false;

  let curParams: VisualParams = { turbulence: 0.3, density: 0.5, glow: 0.2, drift: 0.3, hueShift: 0, shimmer: 0.2, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };

  let particles: Particle[] = [];
  let seedOffset = 0;
  let cue = createCueEventState();
  let phase = 0;
  let transientLatch = 0;
  let transientBoost = 0;
  let attractors: Array<{ x: number; y: number; phase: number }> = [];

  let sectionIntensity = 0;
  let sectionIntensityTarget = 0;
  let sunPresence = 0;
  let sunPresenceTarget = 0;
  let sunGrowth = 0;
  let sunGrowthTarget = 0;
  // Evolution
  let sectionAge = 0;
  let noiseEvolution = 0;
  let noiseEvolutionTarget = 0;
  // Crescendo
  let waveCollapseActive = false;
  let waveCollapseAge = 0;
  let waveCollapseStrength = 0;
  let coreBurst = 0;
  // Particle color wave stagger
  let particleColorWave = 0;
  let particleColorWaveDuration = 4.2;

  // Trail canvas — semi-transparent bg overlay
  let trailAlpha = 0.018;

  function effectiveMaxParticles(): number {
    return isMobile ? MOBILE_MAX_PARTICLES : MAX_PARTICLES;
  }

  function particleRadius(p: Particle, baseRadius: number): number {
    const speed = Math.hypot(p.vx, p.vy);
    return baseRadius * (0.75 + speed * 0.18) * (0.85 + (1 - p.life) * 0.3);
  }

  function fillStyleForColor(
    ctx: CanvasRenderingContext2D,
    color: Rgb,
    alpha: number,
    verticalHueGradient: number,
  ): string | CanvasGradient {
    if (verticalHueGradient <= 0) return rgba(color, alpha);

    const verticalShift = 22 * clamp01(verticalHueGradient);
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, rgba(shiftRgb(color, -verticalShift), alpha));
    gradient.addColorStop(1, rgba(shiftRgb(color, verticalShift), alpha));
    return gradient;
  }

  function spawnParticle(): Particle {
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 4.5 + Math.random() * 4.5,
      seed: Math.random() * 500,
    };
  }

  function spawnBurst(count: number, warm = false) {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const permittedCount = isMobile
      ? Math.min(count, Math.max(0, MOBILE_MAX_PARTICLES - particles.length))
      : count;
    for (let i = 0; i < permittedCount; i++) {
      const angle = Math.random() * TWO_PI;
      const radius = Math.random() * 60;
      const speed = 1.5 + Math.random() * 2.5;
      particles.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 2.8 + Math.random() * 2.2,
        seed: Math.random() * 500,
        warm,
      });
    }
  }

  return {
    setup(_q, _w, _h, _palette) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      seedOffset = Math.random() * 600;
      cue = createCueEventState();
      time = 0;
      colorTime = 0;
      growthTime = 0;
      isMobile = w < 768;
      phase = 0;
      transientLatch = 0;
      transientBoost = 0;
      sectionIntensity = 0;
      sectionIntensityTarget = 0;
      sunPresence = 0;
      sunPresenceTarget = 0;
      sunGrowth = 0;
      sunGrowthTarget = 0;
      sectionAge = 0;
      noiseEvolution = 0;
      noiseEvolutionTarget = 0;
      waveCollapseActive = false;
      waveCollapseAge = 0;
      waveCollapseStrength = 0;
      coreBurst = 0;
      attractors = Array.from({ length: 4 }, (_, index) => ({
        x: w * (0.2 + index * 0.2),
        y: h * (0.28 + (index % 2) * 0.34),
        phase: Math.random() * TWO_PI,
      }));

      particles = [];
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);
      transientBoost *= Math.exp(-dt / 0.22);
      if (audio.transient > 0.3 && transientLatch <= 0.3) {
        transientBoost = Math.max(transientBoost, audio.transient);
      }
      transientLatch = audio.transient;

      sectionIntensity = sectionIntensity + (sectionIntensityTarget - sectionIntensity) * (1 - Math.pow(0.25, dt));
      sunPresence = sunPresence + (sunPresenceTarget - sunPresence) * (1 - Math.pow(0.001, dt));
      sunGrowth   = sunGrowth   + (sunGrowthTarget   - sunGrowth)   * (1 - Math.pow(0.45, dt));
      // Evolution
      sectionAge += dt;
      noiseEvolution = noiseEvolution + (noiseEvolutionTarget - noiseEvolution) * (1 - Math.pow(0.25, dt));
      // Crescendo
      coreBurst *= Math.exp(-dt / 1.4);
      if (particleColorWave < 1) particleColorWave = Math.min(1, particleColorWave + dt / particleColorWaveDuration);
      if (waveCollapseActive) {
        waveCollapseAge += dt;
        const t = waveCollapseAge / 1.8;
        const baseSpeed = Math.max(0.15, 0.9 + curParams.drift * 1.2 + (curAudio.bass ?? 0) * 0.6 + (curAudio.highs ?? 0) * 1.4 + (curAudio.energy) * 0.6);
        if (t < 0.45) {
          const pull = waveCollapseStrength * smoothstep(t / 0.45) * 3;
          for (const p of particles) {
            const a = Math.atan2(h * 0.5 - p.y, w * 0.5 - p.x);
            p.vx += Math.cos(a) * pull * dt * baseSpeed;
            p.vy += Math.sin(a) * pull * dt * baseSpeed;
          }
        } else if (t < 1) {
          const burst = waveCollapseStrength * (1 - smoothstep((t - 0.45) / 0.55)) * 5;
          for (const p of particles) {
            const a = Math.atan2(p.y - h * 0.5, p.x - w * 0.5);
            p.vx += Math.cos(a) * burst * dt * baseSpeed;
            p.vy += Math.sin(a) * burst * dt * baseSpeed;
          }
        } else {
          waveCollapseActive = false;
        }
      }

      const reduced = typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      const activity = audio.activity ?? audio.energy;
      const bass = audio.bass ?? 0;
      const highs = audio.highs ?? 0;
      const playing = audio.playing ?? 0;

      time += dt * (0.14 + params.drift * 0.22 + activity * 0.1 + playing * 0.08 + cue.motion * 0.12);
      colorTime += dt;
      // Evolution: trail persistence — lower alpha = longer ghost trails in late sections
      const targetTrail = (phase === 0 ? 0.038 : phase >= 4 ? 0.012 : 0.018) + params.shimmer * 0.02 + cue.sweep * 0.018 + audio.energy * 0.03;
      trailAlpha += (targetTrail - trailAlpha) * (1 - Math.pow(0.25, dt));

      // Target active particle count based on density
      let targetCount: number;
      if (isMobile) {
        targetCount = Math.min(MOBILE_MAX_PARTICLES, Math.round(MOBILE_MAX_PARTICLES * ((phase === 0 ? 0.3 : phase >= 4 ? 0.8 : 0.48) + params.density * 0.18)));
      } else {
        growthTime += dt;
        const growthFactor = Math.min(1, growthTime / 90);
        const sectionRamp = smoothstep(Math.min(1, sectionAge / 16));
        const phaseDensity = 0.12 + sectionIntensity * 0.62 * sectionRamp;
        targetCount = Math.round(MAX_PARTICLES * (phaseDensity + growthFactor * 0.12 + params.density * 0.14));
      }

      // Field strength: bass makes the flow more chaotic
      const fieldStrength = ((phase >= 4 ? 3.6 : 1.8) + bass * 2.4 + params.turbulence * 1.2 + cue.motion * 0.8)
        * (1 + transientBoost * 0.8);
      // Speed: highs increase velocity
      const baseSpeed = Math.max(0.15, 0.9 + params.drift * 1.2 + bass * 0.6 + highs * 1.4 + activity * 0.6);

      if (phase === 2) {
        for (const attractor of attractors) {
          attractor.x += Math.sin(time * 0.08 + attractor.phase) * dt * 4;
          attractor.y += Math.cos(time * 0.07 + attractor.phase) * dt * 4;
        }
      }

      // Update existing particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt / p.maxLife;
        if (p.life >= 1) {
          // Recycle or remove
          if (particles.length > targetCount) {
            particles.splice(i, 1);
          } else {
            Object.assign(p, spawnParticle());
          }
          continue;
        }

        // Flow field angle at particle position — complexity increases with noiseEvolution
        const effectiveFieldScale = FIELD_SCALE * (1 + noiseEvolution * 0.38);
        const angle = q.noise(
          p.x * effectiveFieldScale + seedOffset,
          p.y * effectiveFieldScale + seedOffset,
          time,
        ) * TWO_PI * fieldStrength;

        let ax = Math.cos(angle) * baseSpeed * 0.08;
        let ay = Math.sin(angle) * baseSpeed * 0.08;
        if (phase === 0) {
          ax = baseSpeed * 0.085;
          ay = baseSpeed * 0.038;
        } else if (phase === 1) {
          ax = (p.x < w * 0.5 ? -1 : 1) * baseSpeed * 0.09;
          ay *= 0.65;
        } else if (phase === 2) {
          let nearest = attractors[0];
          let nearestDistance = Infinity;
          for (const attractor of attractors) {
            const distance = Math.hypot(p.x - attractor.x, p.y - attractor.y);
            if (distance < nearestDistance) {
              nearest = attractor;
              nearestDistance = distance;
            }
          }
          const tangent = Math.atan2(p.y - nearest.y, p.x - nearest.x) + Math.PI * 0.5;
          ax = Math.cos(tangent) * baseSpeed * 0.13;
          ay = Math.sin(tangent) * baseSpeed * 0.13;
        } else if (phase === 3) {
          const towardCenter = Math.atan2(h * 0.5 - p.y, w * 0.5 - p.x);
          const pull = 0.08 + clamp01(1 - Math.hypot(w * 0.5 - p.x, h * 0.5 - p.y) / Math.max(w, h)) * 0.16;
          ax = Math.cos(towardCenter) * baseSpeed * pull;
          ay = Math.sin(towardCenter) * baseSpeed * pull;
        }

        p.vx = p.vx * 0.88 + ax;
        p.vy = p.vy * 0.88 + ay;

        const speed = Math.hypot(p.vx, p.vy);
        if (speed > baseSpeed * 1.5) {
          const s = (baseSpeed * 1.5) / speed;
          p.vx *= s;
          p.vy *= s;
        }

        p.x += p.vx;
        p.y += p.vy;

        // Wrap at edges
        if (p.x < -10) p.x += w + 20;
        if (p.x > w + 10) p.x -= w + 20;
        if (p.y < -10) p.y += h + 20;
        if (p.y > h + 10) p.y -= h + 20;
      }

      // Spawn new particles to reach target count
      while (particles.length < targetCount) {
        particles.push(spawnParticle());
      }
    },

    draw(_q, ctx) {
      // Trail fade using semi-transparent bg fill
      const [br, bg, bb] = palette.bgDark;
      ctx.fillStyle = `rgba(${br},${bg},${bb},${trailAlpha.toFixed(4)})`;
      ctx.fillRect(0, 0, w, h);

      const reduced = typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      const activity = curAudio.activity ?? curAudio.energy;
      const glowT = Math.min(1, curParams.glow + cue.focus * 0.5 + activity * 0.2);
      const verticalHueGradient = phase === 0 ? 0 : phase >= 2 ? Math.max(0.62, clamp01(curParams.verticalHueGradient ?? 0)) : 0.3;

      const agedColor = cue.mixParticleColor(palette.dotColor, seedOffset);
      const accentColor = cue.mixCenterColor(palette.accentGlow);

      // Base particle size — thinner as intensity grows (more lines, finer strokes)
      const thinFactor = 1 - sectionIntensity * 0.38;
      const baseRadius = (1.2 + curParams.density * 0.8 + activity * 0.5) * thinFactor;
      const freshAlpha = Math.min(0.72, 0.45 + curParams.density * 0.25 + glowT * 0.2 + cue.bloom * 0.15);

      if (isMobile) {
        const freshColor = mixRgb(cue.mixParticleColor(palette.dotColor, seedOffset), accentColor, glowT);
        ctx.beginPath();
        let freshDrawn = false;
        for (const p of particles) {
          if (p.life > FRESH_LIFE_LIMIT) continue;
          const r = particleRadius(p, baseRadius);
          const excl = computeExclusion(p.x, p.y, curExclusion);
          if (excl.density < 0.1) continue;

          ctx.moveTo(p.x + r, p.y);
          ctx.arc(p.x, p.y, r * excl.density, 0, TWO_PI);
          freshDrawn = true;
        }
        if (freshDrawn) {
          ctx.fillStyle = fillStyleForColor(ctx, freshColor, freshAlpha, verticalHueGradient);
          ctx.fill();
        }
      } else {
        for (let band = 0; band < BAND_HUES.length; band++) {
          const breathingHue = Math.sin(colorTime * BAND_FREQUENCIES[band] + BAND_PHASES[band]) * 4;
          const bandHue = BAND_HUES[band] + breathingHue + (
            phase === 2 ? 26 :
            phase === 3 ? colorTime * 4 :
            phase >= 4  ? colorTime * 18 :
            0
          );

          for (let phase = 0; phase < FRESH_PHASE_COUNT; phase++) {
            const representativeLife = (phase + 0.5) * (FRESH_LIFE_LIMIT / FRESH_PHASE_COUNT);
            const evolvingHue = bandHue + BAND_HUES[band] * 0.12 * (representativeLife * 0.6);
            const bucketSeed = seedOffset + band * 83 + phase * 19;
            const baseColor = mixRgb(cue.mixParticleColor(palette.dotColor, bucketSeed), accentColor, glowT);
            const bucketColor = shiftRgb(baseColor, evolvingHue);

            ctx.beginPath();
            let bucketDrawn = false;
            for (const p of particles) {
              if (p.life > FRESH_LIFE_LIMIT || Math.floor(p.seed) % BAND_HUES.length !== band) continue;
              const particlePhase = Math.min(FRESH_PHASE_COUNT - 1, Math.floor(p.life / (FRESH_LIFE_LIMIT / FRESH_PHASE_COUNT)));
              if (particlePhase !== phase) continue;

              const r = particleRadius(p, baseRadius);
              const excl = computeExclusion(p.x, p.y, curExclusion);
              if (excl.density < 0.1) continue;

              ctx.moveTo(p.x + r, p.y);
              ctx.arc(p.x, p.y, r * excl.density, 0, TWO_PI);
              bucketDrawn = true;
            }
            if (bucketDrawn) {
              ctx.fillStyle = fillStyleForColor(ctx, bucketColor, freshAlpha, verticalHueGradient);
              ctx.fill();
            }
          }
        }
      }

      // Aged particles - dimmer, dotColor.
      ctx.beginPath();
      let agedDrawn = false;
      for (const p of particles) {
        if (p.life <= FRESH_LIFE_LIMIT) continue;
        const fadeOut = Math.max(0, 1 - (p.life - FRESH_LIFE_LIMIT) / (1 - FRESH_LIFE_LIMIT));
        if (fadeOut < 0.01) continue;

        const excl = computeExclusion(p.x, p.y, curExclusion);
        if (excl.density < 0.1) continue;

        const r = particleRadius(p, baseRadius) * 0.7 * fadeOut;
        ctx.moveTo(p.x + r, p.y);
        ctx.arc(p.x, p.y, r * excl.density, 0, TWO_PI);
        agedDrawn = true;
      }
      if (agedDrawn) {
        const agedAlpha = 0.18 + curParams.density * 0.12;
        ctx.fillStyle = rgba(agedColor, Math.min(0.35, agedAlpha));
        ctx.fill();
      }

      // Warm crescendo burst particles — drawn in accentWarm with screen blend
      if (waveCollapseActive || coreBurst > 0.04) {
        const [wr2, wg2, wb2] = palette.accentWarm;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (const p of particles) {
          if (!p.warm) continue;
          const fadeOut = Math.max(0, 1 - p.life);
          if (fadeOut < 0.01) continue;
          const excl = computeExclusion(p.x, p.y, curExclusion);
          if (excl.density < 0.1) continue;
          const r = particleRadius(p, baseRadius) * (1.4 + coreBurst * 0.6);
          const warmAlpha = fadeOut * (0.32 + coreBurst * 0.28) * excl.density;
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.2);
          grad.addColorStop(0, `rgba(${wr2},${wg2},${wb2},${Math.min(0.72, warmAlpha)})`);
          grad.addColorStop(1, `rgba(${wr2},${wg2},${wb2},0)`);
          ctx.fillStyle = grad;
          ctx.fillRect(p.x - r * 2.2, p.y - r * 2.2, r * 4.4, r * 4.4);
        }
        ctx.restore();
      }

      // Particle color wave — one-by-one stagger toward accentWarm on crescendo
      if (particleColorWave > 0.01) {
        const [wr2, wg2, wb2] = palette.accentWarm;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.beginPath();
        let waveDrawn = false;
        for (const p of particles) {
          if (p.life > FRESH_LIFE_LIMIT) continue;
          const threshold = (p.seed % 500) / 500;
          if (particleColorWave <= threshold) continue;
          const waveBlend = Math.min(1, (particleColorWave - threshold) / 0.18);
          if (waveBlend < 0.05) continue;
          const excl = computeExclusion(p.x, p.y, curExclusion);
          if (excl.density < 0.1) continue;
          const r = particleRadius(p, baseRadius) * (1 + waveBlend * 0.4) * excl.density;
          ctx.moveTo(p.x + r, p.y);
          ctx.arc(p.x, p.y, r, 0, TWO_PI);
          waveDrawn = true;
        }
        if (waveDrawn) {
          ctx.fillStyle = rgba([wr2, wg2, wb2], Math.min(0.55, freshAlpha * particleColorWave));
          ctx.fill();
        }
        ctx.restore();
      }

      // Sun orb — emerges at convergence center in section 3+, pulses with BPM
      if (sunPresence > 0.004) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const cx = w * 0.5;
        const cy = h * 0.5;
        const minDim = Math.min(w, h);
        const beatPulse = (curAudio.beatPulse ?? 0) * 0.8 + transientBoost * 0.4;
        const innerR = minDim * (0.028 + sunGrowth * 0.072 + beatPulse * 0.036 + coreBurst * 0.12);
        const outerR = Math.max(innerR * 2, minDim * (0.14 + sunGrowth * 0.34 + curAudio.bass * 0.08 + coreBurst * 0.44));
        const [wr, wg, wb] = palette.accentWarm;
        const [ar, ag, ab] = palette.accentGlow;
        const peakAlpha = sunPresence * (0.22 + sunGrowth * 0.28 + beatPulse * 0.18 + coreBurst * 0.42);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR);
        grad.addColorStop(0,               rgba([wr, wg, wb], Math.min(0.92, peakAlpha * 2.2)));
        grad.addColorStop(innerR / outerR, rgba([wr, wg, wb], peakAlpha));
        grad.addColorStop(0.55,            rgba([ar, ag, ab], peakAlpha * 0.38));
        grad.addColorStop(1,               rgba([ar, ag, ab], 0));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      if ((event.type === 'spark-burst' || event.type === 'bloom-flash') && event.intensity > 0.5) {
        const count = Math.round(40 + event.intensity * 30);
        spawnBurst(isMobile ? Math.round(count * 0.5) : count);
      }
      if (event.type === 'section-cue' && event.intensity > 0.6) {
        const count = Math.round(20 + event.intensity * 20);
        spawnBurst(isMobile ? Math.round(count * 0.5) : count);
      }
      if (event.type === 'section-cue') {
        phase = Math.max(0, event.sectionIndex ?? phase + 1);
        sectionAge = 0;
        sectionIntensityTarget = Math.min(1, phase / 5);
        noiseEvolutionTarget = Math.min(1, phase / 5);
        if (phase >= 3) {
          sunPresenceTarget = Math.min(1, 0.32 + (phase - 3) * 0.34);
          sunGrowthTarget   = Math.min(1, (phase - 3) / 4);
          particleColorWave = 0;
          particleColorWaveDuration = 4.5;
        }
      }
      if (event.type === 'storm-release' && phase >= 4) {
        waveCollapseActive = true;
        waveCollapseStrength = 0.8 + (event.intensity ?? 0.5) * 0.2;
        coreBurst = Math.max(coreBurst, 0.88 + (event.intensity ?? 0.5) * 0.12);
        sunPresenceTarget = 1;
        sunGrowthTarget = 1;
        particleColorWave = 0;
        particleColorWaveDuration = 3.0;
        if (sunGrowth > 0.6) {
          // Sun is already large — skip inward pull, shoot outward immediately in warm colour
          waveCollapseAge = 1.8 * 0.45 + 0.01;
          spawnBurst(isMobile ? 60 : 140, true);
        } else {
          waveCollapseAge = 0;
          spawnBurst(isMobile ? 50 : 120);
        }
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      isMobile = w < 768;
      const maximum = effectiveMaxParticles();
      if (particles.length > maximum) particles.length = maximum;
    },

    destroy() {
      particles.length = 0;
    },
  };
}
