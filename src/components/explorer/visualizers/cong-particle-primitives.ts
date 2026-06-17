import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { getQualityScale } from '../render-quality';
import type { ExclusionRect, VisualParams } from '../visualizer';

export interface CongParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  speed: number;
  depth: number;
  phase: number;
  seed: number;
  angle: number;
  radius: number;
}

export interface CongBurst {
  x: number;
  y: number;
  age: number;
  life: number;
  radius: number;
  strength: number;
}

export interface FlowVector {
  x: number;
  y: number;
}

export interface LowResVectorField {
  resize(width: number, height: number): void;
  refresh(q: any, time: number, flowScale: number, options?: {
    angleMultiplier?: number;
    rowsPerFrame?: number;
    seed?: number;
    timeScale?: number;
  }): void;
  sample(x: number, y: number): FlowVector;
  destroy(): void;
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function hasReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Shared particle budget: encodes the mobile (<768px) halving convention and
 * the adaptive quality scale at setup time. Runtime adaptation continues via
 * the density-target tier in ExplorerCanvas.
 */
export function getParticleBudget(desktopCount: number, width: number): number {
  const mobileFactor = width < 768 ? 0.5 : 1;
  return Math.max(8, Math.round(desktopCount * mobileFactor * getQualityScale()));
}

/* fbm builds its own octave stack, so it must read a SINGLE-octave Perlin
   source. The shared q5 instance runs at noiseDetail(4, 0.5) for flow-field
   lookups, which would compound to octaves*4 evaluations per fbm call — a
   dedicated default-detail generator keeps the cost at octaves*1. */
let fbmNoiseSource: { noise(x: number, y: number, z: number): number } | null = null;

function getFbmNoiseSource(q: any): { noise(x: number, y: number, z: number): number } {
  if (!fbmNoiseSource) {
    const PerlinNoise = typeof window !== 'undefined' ? (window as any).Q5?.PerlinNoise : undefined;
    fbmNoiseSource = PerlinNoise ? new PerlinNoise(11731) : { noise: (x: number, y: number, z: number) => q.noise(x, y, z) };
  }
  return fbmNoiseSource!;
}

/** Fractal Brownian motion over a single-octave Perlin source (0.5 gain, 2 lacunarity). */
export function fbm(q: any, x: number, y: number, z: number, octaves: number): number {
  const source = getFbmNoiseSource(q);
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    value += source.noise(x * frequency, y * frequency, z * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total > 0 ? value / total : 0;
}

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return ((state >>> 0) / 4294967296);
  };
}

export function buildParticles(count: number, width: number, height: number, seed: number): CongParticle[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, (_, index) => {
    const depth = random();
    const angle = random() * Math.PI * 2;
    return {
      x: random() * width,
      y: random() * height,
      vx: Math.cos(angle),
      vy: Math.sin(angle),
      size: 0.7 + depth * 3.8,
      speed: 20 + random() * 90 + depth * 70,
      depth,
      phase: random() * Math.PI * 2,
      seed: random() * 1000 + index * 0.17,
      angle,
      radius: 20 + Math.pow(depth, 0.72) * Math.min(width, height) * 0.48,
    };
  });
}

export function resetFlowParticle(particle: CongParticle, width: number, height: number, random: () => number): void {
  particle.x = random() * width * 1.12 - width * 0.06;
  particle.y = random() * height;
  particle.angle = random() * Math.PI * 2;
  particle.phase = random() * Math.PI * 2;
}

export function createLowResVectorField(cellSize = 72): LowResVectorField {
  let width = 1;
  let height = 1;
  let cols = 2;
  let rows = 2;
  let cursor = 0;
  let ready = false;
  let xValues = new Float32Array(cols * rows);
  let yValues = new Float32Array(cols * rows);

  const rebuild = () => {
    cols = Math.max(2, Math.ceil(width / cellSize) + 1);
    rows = Math.max(2, Math.ceil(height / cellSize) + 1);
    xValues = new Float32Array(cols * rows);
    yValues = new Float32Array(cols * rows);
    for (let index = 0; index < xValues.length; index += 1) {
      xValues[index] = 1;
      yValues[index] = 0;
    }
    cursor = 0;
    ready = false;
  };

  return {
    resize(nextWidth, nextHeight) {
      const normalizedWidth = Math.max(1, Math.round(nextWidth));
      const normalizedHeight = Math.max(1, Math.round(nextHeight));
      if (normalizedWidth === width && normalizedHeight === height) return;
      width = normalizedWidth;
      height = normalizedHeight;
      rebuild();
    },

    refresh(q, time, flowScale, options = {}) {
      const angleMultiplier = options.angleMultiplier ?? Math.PI * 2 * 2.4;
      const rowsPerFrame = ready ? Math.max(1, Math.min(rows, Math.round(options.rowsPerFrame ?? Math.ceil(rows / 3)))) : rows;
      const seed = options.seed ?? 0;
      const timeScale = options.timeScale ?? 0.08;
      const z = seed + time * timeScale;

      for (let step = 0; step < rowsPerFrame; step += 1) {
        const row = cursor;
        for (let col = 0; col < cols; col += 1) {
          const index = row * cols + col;
          const angle = q.noise(col * cellSize * flowScale, row * cellSize * flowScale, z) * angleMultiplier;
          xValues[index] = Math.cos(angle);
          yValues[index] = Math.sin(angle);
        }
        cursor = (cursor + 1) % rows;
      }
      if (!ready && cursor === 0) ready = true;
    },

    sample(x, y) {
      const gx = clamp01(x / Math.max(width, 1)) * (cols - 1);
      const gy = clamp01(y / Math.max(height, 1)) * (rows - 1);
      const x0 = Math.max(0, Math.min(cols - 2, Math.floor(gx)));
      const y0 = Math.max(0, Math.min(rows - 2, Math.floor(gy)));
      const tx = gx - x0;
      const ty = gy - y0;
      const i00 = y0 * cols + x0;
      const i10 = i00 + 1;
      const i01 = i00 + cols;
      const i11 = i01 + 1;
      const vx0 = mix(xValues[i00], xValues[i10], tx);
      const vy0 = mix(yValues[i00], yValues[i10], tx);
      const vx1 = mix(xValues[i01], xValues[i11], tx);
      const vy1 = mix(yValues[i01], yValues[i11], tx);
      return {
        x: mix(vx0, vx1, ty),
        y: mix(vy0, vy1, ty),
      };
    },

    destroy() {
      xValues = new Float32Array(0);
      yValues = new Float32Array(0);
      cols = 2;
      rows = 2;
      ready = false;
    },
  };
}

export function moveFlowParticle(
  particle: CongParticle,
  q: any,
  dt: number,
  width: number,
  height: number,
  time: number,
  flowScale: number,
  speedScale: number,
  driftX: number,
  vectorField?: LowResVectorField,
): void {
  const sampled = vectorField?.sample(particle.x, particle.y);
  const angle = sampled
    ? Math.atan2(sampled.y, sampled.x)
    : q.noise(
      particle.x * flowScale,
      particle.y * flowScale,
      particle.seed + time * 0.08,
    ) * Math.PI * 2 * 2.4;

  particle.vx += (Math.cos(angle) - particle.vx) * 0.08;
  particle.vy += (Math.sin(angle) - particle.vy) * 0.08;
  particle.x += (particle.vx * particle.speed * speedScale + driftX * particle.depth) * dt;
  particle.y += particle.vy * particle.speed * speedScale * dt;

  if (particle.x < -40) particle.x = width + 40;
  if (particle.x > width + 40) particle.x = -40;
  if (particle.y < -40) particle.y = height + 40;
  if (particle.y > height + 40) particle.y = -40;
}

export function moveOrbitalParticle(
  particle: CongParticle,
  dt: number,
  centerX: number,
  centerY: number,
  time: number,
  radiusScale: number,
  speedScale: number,
  verticalScale: number,
): void {
  particle.angle += dt * (0.12 + particle.depth * 0.58) * speedScale;
  const wobble = Math.sin(time * (0.42 + particle.depth * 0.34) + particle.phase) * particle.radius * 0.12;
  const radius = particle.radius * radiusScale + wobble;
  particle.x = centerX + Math.cos(particle.angle + particle.phase * 0.08) * radius;
  particle.y = centerY + Math.sin(particle.angle * 0.82 + particle.phase) * radius * verticalScale;
}

export function moveVerticalParticle(
  particle: CongParticle,
  dt: number,
  width: number,
  height: number,
  time: number,
  speedScale: number,
  sway: number,
): void {
  particle.y += particle.speed * (0.7 + particle.depth * 1.1) * speedScale * dt;
  particle.x += Math.sin(time * (0.5 + particle.depth) + particle.phase + particle.y * 0.004) * sway * dt;

  if (particle.y > height + 40) {
    particle.y = -30;
    particle.x = ((particle.x + width * 0.37) % (width + 80)) - 40;
  }
}

export function pushBurst(bursts: CongBurst[], x: number, y: number, intensity: number, maxBursts: number): void {
  if (bursts.length >= maxBursts) bursts.shift();
  bursts.push({
    x,
    y,
    age: 0,
    life: 0.8 + intensity * 0.9,
    radius: 24 + intensity * 90,
    strength: 0.18 + intensity * 0.46,
  });
}

export function updateBursts(bursts: CongBurst[], dt: number): void {
  for (let index = bursts.length - 1; index >= 0; index -= 1) {
    bursts[index].age += dt;
    if (bursts[index].age >= bursts[index].life) bursts.splice(index, 1);
  }
}

export function drawSoftParticle(
  ctx: CanvasRenderingContext2D,
  particle: CongParticle,
  palette: Palette,
  params: VisualParams,
  audio: AudioSignal,
  exclusion: ExclusionRect,
  alphaScale = 1,
  colorOverride?: [number, number, number],
): void {
  const factors = computeExclusion(particle.x, particle.y, exclusion);
  if (factors.density < 0.24 && particle.depth > 0.62) return;

  const [red, green, blue] = colorOverride ?? getSoftParticleColor(particle, palette, params, audio);
  const beatScale = audio.beatPulse !== undefined ? 1 + audio.beatPulse * 0.14 * params.impulse : 1;
  const size = particle.size * (0.82 + params.shimmer * 0.42 + audio.transient * 0.5) * beatScale;
  const alpha = (0.026 + particle.depth * 0.08 + params.density * 0.06 + audio.energy * 0.03)
    * factors.alpha
    * alphaScale;

  ctx.fillStyle = `rgba(${red},${green},${blue},${alpha})`;
  ctx.beginPath();
  ctx.ellipse(particle.x, particle.y, size * (1.12 + particle.depth * 0.4), size, particle.angle * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

export function getSoftParticleColor(
  particle: CongParticle,
  palette: Palette,
  params: VisualParams,
  audio: AudioSignal,
): [number, number, number] {
  const [dr, dg, db] = palette.dotColor;
  const [ar, ag, ab] = palette.accentGlow;
  const tint = clamp01(0.18 + particle.depth * 0.48 + params.glow * 0.32 + audio.highs * 0.22);
  const red = Math.round(mix(dr, ar, tint));
  const green = Math.round(mix(dg, ag, tint));
  const blue = Math.round(mix(db, ab, tint));
  return [red, green, blue];
}

export function drawMirroredParticle(
  ctx: CanvasRenderingContext2D,
  particle: CongParticle,
  height: number,
  palette: Palette,
  params: VisualParams,
  audio: AudioSignal,
  exclusion: ExclusionRect,
  alphaScale = 1,
): void {
  drawSoftParticle(ctx, particle, palette, params, audio, exclusion, alphaScale);
  const originalY = particle.y;
  particle.y = height - originalY;
  drawSoftParticle(ctx, particle, palette, params, audio, exclusion, alphaScale * 0.58);
  particle.y = originalY;
}

export function drawBurstGlows(ctx: CanvasRenderingContext2D, bursts: CongBurst[], palette: Palette, exclusion: ExclusionRect): void {
  const [ar, ag, ab] = palette.accentGlow;
  const [wr, wg, wb] = palette.accentWarm;

  for (let index = 0; index < bursts.length; index += 1) {
    const burst = bursts[index];
    const progress = clamp01(burst.age / burst.life);
    const factors = computeExclusion(burst.x, burst.y, exclusion);
    const radius = burst.radius * (1.4 + progress * 2.8);
    const red = index % 2 ? wr : ar;
    const green = index % 2 ? wg : ag;
    const blue = index % 2 ? wb : ab;
    const alpha = (1 - progress) * burst.strength * factors.alpha;
    const glow = ctx.createRadialGradient(burst.x, burst.y, 0, burst.x, burst.y, radius);
    glow.addColorStop(0, `rgba(${red},${green},${blue},${alpha * 0.18})`);
    glow.addColorStop(0.42, `rgba(${red},${green},${blue},${alpha * 0.045})`);
    glow.addColorStop(1, `rgba(${red},${green},${blue},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(burst.x - radius, burst.y - radius, radius * 2, radius * 2);
  }
}
