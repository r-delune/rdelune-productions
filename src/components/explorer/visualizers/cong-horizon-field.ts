/*
 * Techniques: Perlin flow motes provide organic foreground drift; domain-warped
 * ridge bands form a low landscape; horizontal reflection makes the horizon read
 * as still water; layered depth preserves a cinematic wide composition.
 *
 * Concept: A cold mist horizon hangs above dark water, barely luminous at rest.
 * Song sections gradually reveal nearer ridges and mirrored lights until musical
 * peaks turn the distant line into a broad, breathing afterglow.
 *
 * Interactions: bass widens the reflection and halo, mids define ridge/filament
 * weight, highs sparkle across motes, transients release filaments and bloom.
 * Growth, density, turbulence, glow, drift, shimmer, hue shift, and impulse each
 * shape a separate part of the atmospheric progression.
 */

import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { resolveCongHorizonFieldTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';
import {
  buildParticles,
  clamp01,
  createLowResVectorField,
  createSeededRandom,
  drawBurstGlows,
  getSoftParticleColor,
  hasReducedMotion,
  mix,
  moveFlowParticle,
  pushBurst,
  updateBursts,
  type CongBurst,
  type CongParticle,
  type LowResVectorField,
} from './cong-particle-primitives';

type Rgb = [number, number, number];

interface HorizonRidge {
  depth: number;
  seed: number;
  amplitude: number;
  speed: number;
}

interface HorizonFilament {
  x: number;
  width: number;
  age: number;
  life: number;
  strength: number;
  seed: number;
}

function seededUnit(value: number): number {
  const unit = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return unit - Math.floor(unit);
}

function shiftRgb(base: Rgb, hueShift: number): Rgb {
  if (Math.abs(hueShift) < 0.01) return base;
  const [r, g, b] = base.map((channel) => channel / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) * 0.5;
  let hue = 0;
  let saturation = 0;

  if (delta > 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = hue * 60 + (hue < 0 ? 360 : 0);
  }

  hue = (hue + hueShift + 360) % 360;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - chroma * 0.5;
  let channels: [number, number, number];
  if (hue < 60) channels = [chroma, x, 0];
  else if (hue < 120) channels = [x, chroma, 0];
  else if (hue < 180) channels = [0, chroma, x];
  else if (hue < 240) channels = [0, x, chroma];
  else if (hue < 300) channels = [x, 0, chroma];
  else channels = [chroma, 0, x];

  return channels.map((channel) => Math.round(clamp01(channel + m) * 255)) as Rgb;
}

export function createCongHorizonField(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let random = createSeededRandom(41393);
  let particles: CongParticle[] = [];
  let ridges: HorizonRidge[] = [];
  let filaments: HorizonFilament[] = [];
  let bursts: CongBurst[] = [];
  let tuning = resolveCongHorizonFieldTuning();
  let cue = createCueEventState();
  let flowField: LowResVectorField = createLowResVectorField(76);
  let params: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let audio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let exclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let growth = 0.06;
  let growthTarget = 0.06;
  let sectionCueCount = 0;
  let eventFlash = 0;

  function baseHorizonY(): number {
    return h * tuning.horizonY;
  }

  function currentHorizonY(): number {
    return baseHorizonY()
      + Math.sin(time * 0.24) * h * 0.008
      - audio.bass * h * 0.012;
  }

  function placeParticle(particle: CongParticle): void {
    const horizon = baseHorizonY();
    particle.x = random() * w;
    particle.y = horizon - h * (0.025 + random() * (0.09 + particle.depth * 0.3));
    particle.vx = (random() - 0.5) * 0.8;
    particle.vy = (random() - 0.5) * 0.65;
    particle.phase = random() * Math.PI * 2;
  }

  function buildScene(): void {
    random = createSeededRandom(41393 + Math.round(w * 0.47 + h * 0.19));
    particles = buildParticles(tuning.particleCount, w, h, 31391);
    flowField.resize(w, h);
    for (const particle of particles) placeParticle(particle);
    ridges = Array.from({ length: tuning.ridgeCount }, (_, index) => {
      const depth = index / Math.max(1, tuning.ridgeCount - 1);
      return {
        depth,
        seed: random() * 1000 + index * 37,
        amplitude: h * (0.007 + depth * 0.042),
        speed: 0.026 + depth * 0.055,
      };
    });
    filaments = [];
    bursts = [];
  }

  function addFilament(intensity: number): void {
    if (filaments.length >= tuning.filamentLimit) filaments.shift();
    filaments.push({
      x: w * (0.16 + random() * 0.68),
      width: w * (0.08 + random() * 0.2 + intensity * 0.1),
      age: 0,
      life: 0.8 + intensity * 1.5,
      strength: 0.18 + intensity * 0.56,
      seed: random() * 1000,
    });
  }

  function drawHalo(ctx: CanvasRenderingContext2D, horizon: number, accent: Rgb, warm: Rgb): void {
    const focal = computeExclusion(w * 0.5, horizon, exclusion);
    const width = w * (0.34 + growth * 0.17 + audio.bass * 0.1 + cue.bloom * 0.08);
    const height = h * (0.055 + growth * 0.08 + audio.bass * 0.06);
    const alpha = tuning.haloAlpha
      * (0.4 + params.glow * 0.7 + growth * 0.72 + audio.energy * 0.36 + cue.bloom * 0.82 + eventFlash * 0.38)
      * focal.alpha;
    const haloColor = cue.mixCenterColor(accent);
    const gradient = ctx.createRadialGradient(w * 0.5, horizon, 0, w * 0.5, horizon, width);
    gradient.addColorStop(0, `rgba(${haloColor[0]},${haloColor[1]},${haloColor[2]},${alpha})`);
    gradient.addColorStop(0.32, `rgba(${warm[0]},${warm[1]},${warm[2]},${alpha * 0.22})`);
    gradient.addColorStop(1, `rgba(${haloColor[0]},${haloColor[1]},${haloColor[2]},0)`);
    ctx.save();
    ctx.translate(w * 0.5, horizon);
    ctx.scale(1, height / Math.max(width, 1));
    ctx.translate(-w * 0.5, -horizon);
    ctx.fillStyle = gradient;
    ctx.fillRect(w * 0.5 - width, horizon - width, width * 2, width * 2);
    ctx.restore();
  }

  function ridgePoint(ridge: HorizonRidge, x: number, horizon: number): number {
    const warpX = q.noise(
      x * tuning.warpScale + ridge.seed,
      time * ridge.speed,
      ridge.depth * 11,
    );
    const warpY = q.noise(
      ridge.seed + warpX * 2.7,
      x * tuning.warpScale * 0.7,
      time * ridge.speed + 31,
    );
    const amplitude = ridge.amplitude
      * (0.66 + params.turbulence * 0.72 + growth * 0.42 + audio.bass * 0.32);
    const distance = h * (0.018 + ridge.depth * 0.16) * (0.72 + growth * 0.38);
    return horizon - distance
      - (warpY - 0.5) * h * tuning.warpStrength * (0.52 + ridge.depth * 0.68)
      + Math.sin(x * 0.006 + ridge.seed + time * ridge.speed) * amplitude;
  }

  function drawRidges(ctx: CanvasRenderingContext2D, horizon: number, dot: Rgb, accent: Rgb): void {
    const visibleDepth = 0.25 + growth * 0.6 + params.density * 0.32 + cue.motion * 0.16;
    const step = Math.max(14, Math.round(w / 66));
    ctx.lineCap = 'round';

    for (const ridge of ridges) {
      if (ridge.depth > visibleDepth && seededUnit(ridge.seed) > growth * 0.8 + params.density * 0.35) continue;
      const tint = clamp01(0.18 + ridge.depth * 0.48 + params.glow * 0.22 + audio.mids * 0.2);
      const base: Rgb = [
        Math.round(mix(dot[0], accent[0], tint)),
        Math.round(mix(dot[1], accent[1], tint)),
        Math.round(mix(dot[2], accent[2], tint)),
      ];
      const color = cue.mixRidgeColor(base, ridge.seed);
      const alpha = (0.022 + ridge.depth * 0.048 + growth * 0.04 + params.density * 0.026 + audio.mids * 0.036 + cue.grain * 0.025)
        * clamp01(1 + cue.densityProgress(ridge.seed) * 0.52);
      const width = 0.42 + ridge.depth * 1.25 + audio.mids * 0.9 + growth * 0.44;

      for (let x = -step; x < w + step; x += step) {
        const nextX = x + step;
        const y = ridgePoint(ridge, x, horizon);
        const nextY = ridgePoint(ridge, nextX, horizon);
        const factors = computeExclusion((x + nextX) * 0.5, (y + nextY) * 0.5, exclusion);
        if (factors.contrast < 0.36) continue;
        ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha * factors.alpha})`;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(nextX, nextY);
        ctx.stroke();

        const reflectedY = horizon + (horizon - y) * (1.04 + audio.bass * 0.1);
        const reflectedNextY = horizon + (horizon - nextY) * (1.04 + audio.bass * 0.1);
        const reflectedFactors = computeExclusion((x + nextX) * 0.5, (reflectedY + reflectedNextY) * 0.5, exclusion);
        ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha * tuning.mirrorAlpha * reflectedFactors.alpha})`;
        ctx.beginPath();
        ctx.moveTo(x, reflectedY);
        ctx.lineTo(nextX, reflectedNextY);
        ctx.stroke();
      }
    }
  }

  function drawMist(ctx: CanvasRenderingContext2D, horizon: number, accent: Rgb): void {
    ctx.globalCompositeOperation = 'screen';
    const rows = 3 + Math.round(growth * 3);
    for (let row = 0; row < rows; row += 1) {
      const seed = 700 + row * 41;
      const color = cue.mixMistColor(accent, seed);
      for (let index = 0; index < 8; index += 1) {
        const x = w * ((index - 0.5) / 7);
        const drift = (q.noise(seed, index * 0.22, time * 0.03) - 0.5) * w * 0.22;
        const y = horizon - h * (0.014 + row * 0.026) + (q.noise(index, seed, time * 0.045) - 0.5) * h * 0.035;
        const factors = computeExclusion(x + drift, y, exclusion);
        const radius = w * (0.09 + row * 0.024 + growth * 0.016);
        const alpha = (0.005 + params.density * 0.009 + params.glow * 0.012 + growth * 0.011 + cue.grain * 0.012)
          * factors.alpha;
        const fog = ctx.createRadialGradient(x + drift, y, 0, x + drift, y, radius);
        fog.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},${alpha})`);
        fog.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
        ctx.fillStyle = fog;
        ctx.beginPath();
        ctx.ellipse(x + drift, y, radius, h * (0.022 + row * 0.009 + growth * 0.012), 0, 0, Math.PI * 2);
        ctx.fill();

        const reflectedY = horizon + (horizon - y) * (1.05 + audio.bass * 0.08);
        const reflectedFactors = computeExclusion(x + drift, reflectedY, exclusion);
        const reflectedAlpha = alpha * tuning.mirrorAlpha * reflectedFactors.alpha;
        const reflectedFog = ctx.createRadialGradient(x + drift, reflectedY, 0, x + drift, reflectedY, radius);
        reflectedFog.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},${reflectedAlpha})`);
        reflectedFog.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
        ctx.fillStyle = reflectedFog;
        ctx.beginPath();
        ctx.ellipse(x + drift, reflectedY, radius * 1.04, h * (0.018 + row * 0.008 + growth * 0.01), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawFilaments(ctx: CanvasRenderingContext2D, horizon: number, warm: Rgb): void {
    for (const filament of filaments) {
      const progress = clamp01(filament.age / filament.life);
      const alpha = (1 - progress) * filament.strength
        * (0.08 + params.impulse * 0.1 + audio.mids * 0.1 + eventFlash * 0.06);
      const color = cue.mixForegroundColor(warm, filament.seed);
      const start = filament.x - filament.width * 0.5;
      const segments = 11;
      for (let index = 0; index < segments; index += 1) {
        const x1 = start + filament.width * (index / segments);
        const x2 = start + filament.width * ((index + 1) / segments);
        const curve1 = (q.noise(filament.seed, index * 0.16, time * 0.1) - 0.5) * h * (0.02 + params.turbulence * 0.018);
        const curve2 = (q.noise(filament.seed, (index + 1) * 0.16, time * 0.1) - 0.5) * h * (0.02 + params.turbulence * 0.018);
        const y1 = horizon - h * 0.014 - curve1;
        const y2 = horizon - h * 0.014 - curve2;
        const factors = computeExclusion((x1 + x2) * 0.5, (y1 + y2) * 0.5, exclusion);
        ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha * factors.alpha})`;
        ctx.lineWidth = 0.7 + filament.strength * 1.5 + audio.transient * 1.2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        const reflectionFactors = computeExclusion((x1 + x2) * 0.5, horizon + h * 0.014 + (curve1 + curve2) * 0.5, exclusion);
        ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha * tuning.mirrorAlpha * reflectionFactors.alpha})`;
        ctx.beginPath();
        ctx.moveTo(x1, horizon + h * 0.014 + curve1);
        ctx.lineTo(x2, horizon + h * 0.014 + curve2);
        ctx.stroke();
      }
    }
  }

  function drawParticles(ctx: CanvasRenderingContext2D, horizon: number): void {
    const reveal = clamp01(0.1 + params.density * 0.42 + growth * 0.62 + cue.motion * 0.1);
    for (const particle of particles) {
      if (seededUnit(particle.seed * 3.1) > reveal) continue;
      const base = shiftRgb(getSoftParticleColor(particle, palette, params, audio), params.hueShift);
      const color = cue.mixParticleColor(base, particle.seed);
      const shimmer = q.noise(particle.seed * 0.09, time * 0.19, 0);
      const size = particle.size * (0.34 + particle.depth * 0.6 + params.shimmer * 0.28 + cue.sizeProgress(particle.seed) * 0.3);
      const alpha = (0.014 + particle.depth * 0.047 + params.density * 0.03 + audio.highs * 0.028 + growth * 0.018)
        * (0.52 + shimmer * (0.3 + params.shimmer * 0.3));
      const factors = computeExclusion(particle.x, particle.y, exclusion);
      if (factors.contrast >= 0.36) {
        ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha * factors.alpha})`;
        ctx.beginPath();
        ctx.ellipse(particle.x, particle.y, size * (1.3 + particle.depth * 0.5), size, particle.angle, 0, Math.PI * 2);
        ctx.fill();
      }
      const reflectionY = horizon + (horizon - particle.y) * (1.04 + audio.bass * 0.12);
      const reflectedFactors = computeExclusion(particle.x, reflectionY, exclusion);
      if (reflectedFactors.contrast < 0.36) continue;
      ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha * tuning.mirrorAlpha * reflectedFactors.alpha})`;
      ctx.beginPath();
      ctx.ellipse(particle.x, reflectionY, size * (1.7 + particle.depth * 0.4), size * 0.62, -particle.angle, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveCongHorizonFieldTuning(_tuning);
      time = 0;
      growth = 0.06;
      growthTarget = 0.06;
      sectionCueCount = 0;
      eventFlash = 0;
      cue = createCueEventState();
      buildScene();
    },

    update(dt, nextParams, nextAudio, nextExclusion) {
      params = nextParams;
      audio = nextAudio;
      exclusion = nextExclusion;
      cue.update(dt);
      growth = mix(growth, growthTarget, 1 - Math.pow(0.001, dt));

      if (hasReducedMotion()) return;

      eventFlash = Math.max(0, eventFlash - dt * 1.55);
      time += dt * (0.22 + params.drift * 0.72 + audio.energy * 0.3 + cue.motion * 0.26);
      updateBursts(bursts, dt);
      for (let index = filaments.length - 1; index >= 0; index -= 1) {
        filaments[index].age += dt;
        if (filaments[index].age >= filaments[index].life) filaments.splice(index, 1);
      }

      const horizon = baseHorizonY();
      const flowScale = tuning.flowScale * (0.72 + params.turbulence * 0.86 + growth * 0.16);
      const speedScale = tuning.speed * (0.34 + params.drift * 0.82 + audio.energy * 0.34 + cue.motion * 0.25);
      const driftX = (2 + audio.bass * 12 + growth * 7) * (0.62 + params.drift);
      flowField.refresh(q, time, flowScale, { seed: 23.7 });
      for (const particle of particles) {
        moveFlowParticle(particle, q, dt, w, h, time, flowScale, speedScale, driftX, flowField);
        if (particle.y > horizon - h * 0.008 || particle.y < h * 0.07) placeParticle(particle);
      }

      if (audio.transient > 0.23 && random() < 0.08 + audio.transient * 0.24) {
        addFilament(audio.transient + params.impulse * 0.25);
        pushBurst(bursts, w * (0.2 + random() * 0.6), currentHorizonY(), audio.transient, tuning.maxBursts);
      }
    },

    draw(_q, ctx) {
      const background = cue.mixBackgroundColor(shiftRgb(palette.bgDark, params.hueShift * 0.28));
      const accent = shiftRgb(palette.accentGlow, params.hueShift);
      const warm = shiftRgb(palette.accentWarm, params.hueShift);
      const dot = shiftRgb(palette.dotColor, params.hueShift);
      const horizon = currentHorizonY();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(${background[0]},${background[1]},${background[2]},${tuning.trailAlpha})`;
      ctx.fillRect(0, 0, w, h);
      drawHalo(ctx, horizon, accent, warm);
      drawMist(ctx, horizon, accent);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawRidges(ctx, horizon, dot, accent);
      drawFilaments(ctx, horizon, warm);
      drawParticles(ctx, horizon);
      drawBurstGlows(ctx, bursts, palette, exclusion);
      ctx.restore();
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      eventFlash = Math.min(1, eventFlash + event.intensity * (0.34 + params.impulse * 0.36));
      if (event.type === 'section-cue') {
        sectionCueCount += 1;
        growthTarget = Math.max(growthTarget, Math.min(1, 0.1 + sectionCueCount * 0.18));
      }
      if (event.type === 'density-surge' || event.type === 'motion-drift' || event.type === 'storm-release') {
        growthTarget = Math.max(growthTarget, 0.38 + event.intensity * 0.48);
      }
      if (event.type === 'glow-pulse' || event.type === 'bloom-flash' || event.type === 'grain-bloom') {
        growthTarget = Math.max(growthTarget, 0.22 + event.intensity * 0.38);
      }
      pushBurst(bursts, w * (0.18 + random() * 0.64), currentHorizonY(), event.intensity + params.impulse * 0.22, tuning.maxBursts);
      if (event.intensity > 0.2) addFilament(event.intensity + params.impulse * 0.28);
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      buildScene();
    },

    destroy() {
      particles = [];
      ridges = [];
      filaments = [];
      bursts = [];
      flowField.destroy();
    },
  };
}
