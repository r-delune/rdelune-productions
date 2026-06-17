/* ── organic-drift Visualizer ────────────────────────────────
   Silk orbs drifting on Perlin noise paths + a Perlin flow-field
   particle layer with gentle orb attraction.

   Moody continuous color evolution:
   - colorTime accumulator drives slow hue drift (±18° over ~25s)
   - Each orb breathes warm↔cool at its own phase offset
   - Trail alpha breathes between cinematic (sparse) and energetic (dense)
   - Particles shift dotColor → accentGlow as they age
   - Orbs rendered with 'screen' blend for additive luminosity
   - Subtle vignette keeps visual depth without clutter

   Music reactivity (AudioSignal, no Web Audio API):
   - energy  → orb breathe scale, particle speed, particle radius
   - bass    → orb pulse intensity, flow attraction
   - beatPulse → orb alpha pulse
   - playing → intensity gate (0.25 paused, 1.0 playing)
──────────────────────────────────────────────────────────────── */

import type { Palette } from '../palette';
import type { Visualizer, VisualParams, VisualEvent, ExclusionRect } from '../visualizer';
import type { AudioSignal } from '../audio-signal';

const TWO_PI = Math.PI * 2;

const ORB_NOISE_RATE  = 0.015;    // noise-space units/sec for orb drift
const ORB_SPEED       = 22;       // max orb drift pixels/sec
const BREATHE_RATE    = 4.2;      // radius lerp speed (dimensionless, ~frames)
const FIELD_SCALE     = 0.0028;   // particle flow-field spatial frequency
const FIELD_RATE      = 0.3;      // flow-field time evolution rate (noise-space/sec)
const TRAIL_BASE      = 0.042;    // bg-fill alpha base — lower = longer ghost trails
const HUE_DRIFT_RATE  = 0.04;     // radians/sec for global hue oscillation
const ORB_WARM_RATE   = 0.06;     // radians/sec for per-orb warm/cool breathing

type Rgb = [number, number, number];

// ── Color utilities ──────────────────────────────────────────

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Mix two RGB tuples. t=0 → a, t=1 → b */
function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const s = clamp01(t);
  return [
    Math.round(a[0] + (b[0] - a[0]) * s),
    Math.round(a[1] + (b[1] - a[1]) * s),
    Math.round(a[2] + (b[2] - a[2]) * s),
  ];
}

/** Shift the hue of an RGB tuple by `degrees` (can be negative). */
function shiftHue(base: Rgb, degrees: number): Rgb {
  const [r0, g0, b0] = base.map((v) => v / 255);
  const max = Math.max(r0, g0, b0);
  const min = Math.min(r0, g0, b0);
  const light = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  let sat = 0;
  if (delta > 0) {
    sat = delta / (1 - Math.abs(2 * light - 1));
    if (max === r0) hue = ((g0 - b0) / delta) % 6;
    else if (max === g0) hue = (b0 - r0) / delta + 2;
    else hue = (r0 - g0) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  hue = (hue + degrees + 360) % 360;
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - chroma / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60)       [r, g, b] = [chroma, x, 0];
  else if (hue < 120) [r, g, b] = [x, chroma, 0];
  else if (hue < 180) [r, g, b] = [0, chroma, x];
  else if (hue < 240) [r, g, b] = [0, x, chroma];
  else if (hue < 300) [r, g, b] = [x, 0, chroma];
  else                [r, g, b] = [chroma, 0, x];
  return [
    Math.round(clamp01(r + m) * 255),
    Math.round(clamp01(g + m) * 255),
    Math.round(clamp01(b + m) * 255),
  ];
}

function rgba(c: Rgb, a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
}

// ── Types ────────────────────────────────────────────────────

interface Orb {
  nx: number; ny: number;
  x: number;  y: number;
  baseRadius: number;
  currentRadius: number;
  index: number;           // used to stagger per-orb color breathing phase
}

interface DriftParticle {
  x: number;  y: number;
  age: number; maxAge: number;  // seconds
  speed: number;
  colorSeed: number;             // 0-1, stagger color timing slightly per particle
}

// ── Factory ──────────────────────────────────────────────────

export function createOrganicDrift(): Visualizer {
  let q: any;
  let w = 0, h = 0;
  let palette: Palette;
  let isMobile = false;

  let orbs: Orb[] = [];
  let particles: DriftParticle[] = [];
  let orbCount    = 6;
  let particleMax = 200;

  // Time accumulators — both in seconds
  let noiseTime  = 0;   // drives all Perlin calls
  let colorTime  = 0;   // drives hue drift & orb breathing (decoupled so we can tune independently)
  let intensity  = 0;   // smoothed gate [0.25–1.0]

  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };

  // Vignette gradient — rebuilt on resize
  let vignetteGrad: CanvasGradient | null = null;

  function buildVignette(ctx: CanvasRenderingContext2D): void {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const r  = Math.max(w, h) * 0.72;
    vignetteGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    vignetteGrad.addColorStop(0,   rgba(palette.bgDark, 0));
    vignetteGrad.addColorStop(0.6, rgba(palette.bgDark, 0.04));
    vignetteGrad.addColorStop(1,   rgba(palette.bgDark, 0.18));
  }

  function initOrbs(): void {
    orbs = [];
    const minDim     = Math.min(w, h);
    const baseRadius = minDim * (isMobile ? 0.22 : 0.18);
    for (let i = 0; i < orbCount; i++) {
      orbs.push({
        nx:            Math.random() * 1000,
        ny:            Math.random() * 1000 + 500,
        x:             w * 0.1 + Math.random() * w * 0.8,
        y:             h * 0.1 + Math.random() * h * 0.8,
        baseRadius,
        currentRadius: baseRadius,
        index:         i,
      });
    }
  }

  function initParticles(): void {
    particles = [];
    for (let i = 0; i < particleMax; i++) {
      const maxAge = 6 + Math.random() * 10;
      particles.push({
        x:         Math.random() * w,
        y:         Math.random() * h,
        age:       Math.random() * maxAge,   // warm-start at random phase
        maxAge,
        speed:     0.4 + Math.random() * 0.9,
        colorSeed: Math.random(),
      });
    }
  }

  // ── Visualizer interface ─────────────────────────────────────

  return {
    setup(_q, _w, _h, _palette, _tuning, _context) {
      q           = _q;
      w           = _w;
      h           = _h;
      palette     = _palette;
      isMobile    = w < 768;
      orbCount    = isMobile ? 3 : 6;
      particleMax = isMobile ? 50 : 200;
      noiseTime   = 0;
      colorTime   = 0;
      intensity   = 0;
      vignetteGrad = null;
      initOrbs();
      initParticles();
    },

    update(dt, _params, audio, _exclusion) {
      curAudio   = audio;
      noiseTime += dt;
      colorTime += dt;

      // Smooth intensity gate
      const targetGate = (audio.playing ?? 1) > 0.5 ? 1.0 : 0.25;
      intensity += (targetGate - intensity) * (1 - Math.pow(0.01, dt));

      const energy    = audio.energy ?? 0;
      const bass      = audio.bass   ?? 0;
      const beatPulse = audio.beatPulse ?? 0.5;

      // ── Orb physics ─────────────────────────────────────────
      for (const orb of orbs) {
        const vx = (q.noise(orb.nx + noiseTime * ORB_NOISE_RATE, orb.ny) * 2 - 1) * ORB_SPEED;
        const vy = (q.noise(orb.nx, orb.ny + noiseTime * ORB_NOISE_RATE) * 2 - 1) * ORB_SPEED;
        orb.x += vx * dt * intensity;
        orb.y += vy * dt * intensity;

        // Soft wrap
        const pad = orb.baseRadius;
        if (orb.x < -pad)    orb.x += w + pad * 2;
        if (orb.x > w + pad) orb.x -= w + pad * 2;
        if (orb.y < -pad)    orb.y += h + pad * 2;
        if (orb.y > h + pad) orb.y -= h + pad * 2;

        // Breathe radius toward energy target
        const target = orb.baseRadius * (1 + energy * 0.55 + bass * 0.30 + beatPulse * 0.10 * intensity);
        orb.currentRadius += (target - orb.currentRadius) * (1 - Math.pow(1 - BREATHE_RATE / 60, dt * 60));
      }

      // ── Particle physics ─────────────────────────────────────
      for (const p of particles) {
        p.age += dt;

        if (p.age > p.maxAge) {
          p.x         = Math.random() * w;
          p.y         = Math.random() * h;
          p.age       = 0;
          p.maxAge    = 6 + Math.random() * 10;
          p.speed     = 0.4 + Math.random() * 0.9;
          p.colorSeed = Math.random();
          continue;
        }

        // Perlin flow field direction
        const noiseAngle = q.noise(
          p.x * FIELD_SCALE,
          p.y * FIELD_SCALE,
          noiseTime * FIELD_RATE,
        ) * TWO_PI * 4;

        // Gentle orb attraction toward nearest
        let minDist2 = Infinity;
        let nearOrb: Orb | null = null;
        for (const orb of orbs) {
          const dx = orb.x - p.x;
          const dy = orb.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < minDist2) { minDist2 = d2; nearOrb = orb; }
        }

        let moveAngle = noiseAngle;
        if (nearOrb) {
          const threshold = nearOrb.currentRadius * 3;
          if (minDist2 < threshold * threshold) {
            const dx       = nearOrb.x - p.x;
            const dy       = nearOrb.y - p.y;
            const orbAngle = Math.atan2(dy, dx);
            const blend    = 0.04 + bass * 0.04;
            moveAngle = Math.atan2(
              Math.sin(noiseAngle) * (1 - blend) + Math.sin(orbAngle) * blend,
              Math.cos(noiseAngle) * (1 - blend) + Math.cos(orbAngle) * blend,
            );
          }
        }

        const spd = p.speed * 40 * (1 + energy * 0.65) * intensity;
        p.x += Math.cos(moveAngle) * spd * dt;
        p.y += Math.sin(moveAngle) * spd * dt;

        p.x = ((p.x % w) + w) % w;
        p.y = ((p.y % h) + h) % h;
      }
    },

    draw(_q, ctx) {
      const energy    = curAudio.energy    ?? 0;
      const beatPulse = curAudio.beatPulse ?? 0.5;

      // Build vignette on first draw (ctx not available in setup)
      if (!vignetteGrad) buildVignette(ctx);

      // ── Step 1: Trail fade — breathing alpha ────────────────
      const trailAlpha = TRAIL_BASE + Math.sin(colorTime * 0.08) * 0.012 + energy * 0.02;
      const [br, bg, bb] = palette.bgDark;
      ctx.fillStyle = `rgba(${br},${bg},${bb},${trailAlpha.toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);

      // Global hue shift — slowly oscillates ±18° over ~25s
      const hShift = Math.sin(colorTime * HUE_DRIFT_RATE) * 18;

      // ── Step 2: Orbs — screen blend for additive luminosity ─
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const orb of orbs) {
        const r = Math.max(1, orb.currentRadius);

        // Per-orb warm/cool breathing — each orb at its own phase
        const warmBias  = 0.5 + 0.5 * Math.sin(colorTime * ORB_WARM_RATE + orb.index * 1.3);
        const innerBase = mixRgb(palette.accentWarm, palette.accentGlow, warmBias);
        const innerColor = shiftHue(innerBase, hShift);
        const outerColor = shiftHue(palette.accentGlow, hShift * 0.5);

        const peakAlpha = (0.14 + beatPulse * 0.06) * intensity;
        const midAlpha  = 0.045 * intensity;

        try {
          const grd = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, r);
          grd.addColorStop(0,   rgba(innerColor, peakAlpha));
          grd.addColorStop(0.35, rgba(innerColor, midAlpha));
          grd.addColorStop(0.7, rgba(outerColor, midAlpha * 0.5));
          grd.addColorStop(1,   rgba(outerColor, 0));
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(orb.x, orb.y, r, 0, TWO_PI);
          ctx.fill();
        } catch {
          // Skip on degenerate radius during resize
        }
      }
      ctx.restore();

      // ── Step 3: Particles — color shifts with age ───────────
      const shiftedAccent = shiftHue(palette.accentGlow, hShift);
      const particleR = 1.2 + energy * 0.6;

      for (const p of particles) {
        const ageFraction = p.age / p.maxAge;
        const lifeFade    = 1 - ageFraction;
        const alpha       = lifeFade * (0.38 + energy * 0.28) * intensity;
        if (alpha < 0.005) continue;

        // Color: dotColor when young → shiftedAccent when old, with per-particle stagger
        const colorT   = ageFraction * 0.45 + p.colorSeed * 0.08;
        const color    = mixRgb(palette.dotColor, shiftedAccent, clamp01(colorT));

        ctx.fillStyle = rgba(color, alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, particleR * lifeFade + 0.4, 0, TWO_PI);
        ctx.fill();
      }

      // ── Step 4: Vignette — depth and focus ──────────────────
      if (vignetteGrad) {
        ctx.fillStyle = vignetteGrad;
        ctx.fillRect(0, 0, w, h);
      }
    },

    onEvent(_event: VisualEvent) {
      // Ambient visualizer — no discrete event responses needed
    },

    resize(_w, _h) {
      w           = _w;
      h           = _h;
      isMobile    = w < 768;
      orbCount    = isMobile ? 3 : 6;
      particleMax = isMobile ? 50 : 200;
      vignetteGrad = null; // rebuilt on next draw

      const minDim  = Math.min(w, h);
      const newBase = minDim * (isMobile ? 0.22 : 0.18);
      for (const orb of orbs) {
        orb.baseRadius    = newBase;
        orb.currentRadius = Math.min(orb.currentRadius, newBase * 2);
      }
      if (particles.length > particleMax) particles.length = particleMax;
    },

    destroy() {
      orbs         = [];
      particles    = [];
      vignetteGrad = null;
    },
  };
}
