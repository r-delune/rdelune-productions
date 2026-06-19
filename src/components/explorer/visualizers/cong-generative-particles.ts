import type { AudioSignal } from '../audio-signal';
import { computeExclusion } from '../exclusion';
import type { Palette } from '../palette';
import { resolveCongGenerativeParticlesTuning } from '../tuning';
import type { CongGenerativeParticleOverlay, CongGenerativeParticlesTuning } from '../tuning';
import type { CongGenerativeParticleRenderer } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer } from '../visualizer';
import { createCueEventState } from './cue-event-state';
import { clamp01, createSeededRandom, mix } from './cong-particle-primitives';

interface EngineParticle {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  depth: number;
  lane: 0 | 1;
  size: number;
  speed: number;
  seed: number;
  life: number;
}

interface EngineBurst {
  x: number;
  y: number;
  age: number;
  life: number;
  strength: number;
}

interface FlowCell {
  x: number;
  y: number;
}

interface BounceLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  vx1: number;
  vy1: number;
  vx2: number;
  vy2: number;
  phase: number;
}

const FLOW_CELL_SIZE = 42;
const TWO_PI = Math.PI * 2;

function reducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function setComposite(ctx: CanvasRenderingContext2D, mode: GlobalCompositeOperation): void {
  ctx.globalCompositeOperation = mode;
}

function blendModeToComposite(mode: CongGenerativeParticlesTuning['blendMode']): GlobalCompositeOperation {
  if (mode === 'lighter') return 'lighter';
  if (mode === 'screen') return 'screen';
  return 'source-over';
}

export function createCongGenerativeParticles(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let time = 0;
  let frame = 0;
  let particles: EngineParticle[] = [];
  let bursts: EngineBurst[] = [];
  let bounceLines: BounceLine[] = [];
  let random = createSeededRandom(1);
  let flowCols = 1;
  let flowRows = 1;
  let flowField: FlowCell[] = [];
  let trailBuffer: any = null;
  let trailCtx: CanvasRenderingContext2D | null = null;
  let curParams: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let curAudio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let curExclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 100 };
  let tuning = resolveCongGenerativeParticlesTuning();
  let particleRelease = 1;
  let releaseActive = false;
  let releaseDuration = 1;
  let releaseMode: 'all-at-once' | 'one-by-one' = 'one-by-one';
  let particleColorTarget: [number, number, number] | null = null;
  let particleColorProgress = 0;
  let particleColorDuration = 1;
  let particleColorStagger = false;
  let centerColorTarget: [number, number, number] | null = null;
  let centerColorProgress = 0;
  let centerColorDuration = 1;
  let centerScale = 0.82;
  let centerScaleFrom = 0.82;
  let centerScaleTarget = 0.82;
  let centerAlphaBoost = 0;
  let centerAlphaBoostFrom = 0;
  let centerAlphaBoostTarget = 0;
  let centerMorphProgress = 1;
  let centerMorphDuration = 1;
  let particleScale = 0.52;
  let particleScaleFrom = 0.52;
  let particleScaleTarget = 0.52;
  let particleAlphaBoost = 0;
  let particleAlphaBoostFrom = 0;
  let particleAlphaBoostTarget = 0;
  let particleStrokeBoost = 0;
  let particleStrokeBoostFrom = 0;
  let particleStrokeBoostTarget = 0;
  let particleMorphProgress = 1;
  let particleMorphDuration = 1;
  let particleSwellProgress = 1;
  let particleSwellDuration = 1;
  let particleSwellStrength = 0;
  let flowSurge = 0;
  let coverageProgress = 0;
  let coverageBoost = 0;
  let cueParticleChaos = 0;
  let sectionLevel = 0;
  let sectionLevelTarget = 0;
  let cue = createCueEventState();
  let rendererSequence: readonly CongGenerativeParticleRenderer[] = [];
  let activeRenderer: CongGenerativeParticleRenderer = 'points';
  // Evolution
  let intraPhaseProgress = 0;
  let globalDensityAccrual = 0;
  let overlayUnlockLevel = 0;
  let rendererFlushBoost = 0;
  // Crescendo
  let crescendoExplosion = 0;
  // Per-particle contrasting color burst (warm tint on ~18% subset)

  function smoothstep(value: number): number {
    const t = clamp01(value);
    return t * t * (3 - 2 * t);
  }

  function seededUnit(value: number): number {
    const x = Math.sin(value * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  function resetEventState() {
    particleRelease = tuning.releaseOnCue ? (tuning.initialParticleAlpha ?? 0) : 1;
    releaseActive = false;
    releaseDuration = Math.max(0.12, (tuning.releaseDurationMs ?? 1800) / 1000);
    releaseMode = tuning.releaseMode ?? 'one-by-one';
    particleColorTarget = null;
    particleColorProgress = 0;
    particleColorDuration = 1;
    particleColorStagger = false;
    centerColorTarget = null;
    centerColorProgress = 0;
    centerColorDuration = 1;
    centerScale = 0.82;
    centerScaleFrom = centerScale;
    centerScaleTarget = centerScale;
    centerAlphaBoost = 0;
    centerAlphaBoostFrom = centerAlphaBoost;
    centerAlphaBoostTarget = centerAlphaBoost;
    centerMorphProgress = 1;
    centerMorphDuration = 1;
    particleScale = 0.52;
    particleScaleFrom = particleScale;
    particleScaleTarget = particleScale;
    particleAlphaBoost = 0;
    particleAlphaBoostFrom = particleAlphaBoost;
    particleAlphaBoostTarget = particleAlphaBoost;
    particleStrokeBoost = 0;
    particleStrokeBoostFrom = particleStrokeBoost;
    particleStrokeBoostTarget = particleStrokeBoost;
    particleMorphProgress = 1;
    particleMorphDuration = 1;
    particleSwellProgress = 1;
    particleSwellDuration = 1;
    particleSwellStrength = 0;
    flowSurge = 0;
    coverageProgress = tuning.emitter === 'left-edge' ? 0.18 : 1;
    coverageBoost = 0;
    cueParticleChaos = 0;
    sectionLevel = 0;
    sectionLevelTarget = 0;
    intraPhaseProgress = 0;
    globalDensityAccrual = 0;
    overlayUnlockLevel = 0;
    rendererFlushBoost = 0;
    crescendoExplosion = 0;
  }

  function buildRendererSequence(initial: CongGenerativeParticleRenderer): readonly CongGenerativeParticleRenderer[] {
    if (tuning.lockRendererCycle) return [initial];
    const modes: readonly CongGenerativeParticleRenderer[] = ['points', 'streaks', 'cloud-puffs', 'rays', 'chords', 'mirrored-points'];
    const start = Math.max(0, modes.indexOf(initial));
    return [...modes.slice(start), ...modes.slice(0, start)];
  }

  function shiftRgb(base: [number, number, number], hueShift = 0, saturation = 1, brightness = 1): [number, number, number] {
    const [r0, g0, b0] = base.map((value) => value / 255);
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

    hue = (hue + hueShift + 360) % 360;
    sat = clamp01(sat * saturation);
    const nextLight = clamp01(light * brightness);
    const chroma = (1 - Math.abs(2 * nextLight - 1)) * sat;
    const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = nextLight - chroma / 2;
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

  function applyColorMix(base: [number, number, number], target: [number, number, number] | null, progress: number): [number, number, number] {
    if (!target) return base;
    const t = smoothstep(progress);
    return [
      Math.round(mix(base[0], target[0], t)),
      Math.round(mix(base[1], target[1], t)),
      Math.round(mix(base[2], target[2], t)),
    ];
  }

  function setCenterMorph(scale: number, alphaBoost: number, duration: number): void {
    centerScaleFrom = centerScale;
    centerScaleTarget = scale;
    centerAlphaBoostFrom = centerAlphaBoost;
    centerAlphaBoostTarget = alphaBoost;
    centerMorphProgress = 0;
    centerMorphDuration = Math.max(0.12, duration);
  }

  function setParticleMorph(scale: number, alphaBoost: number, strokeBoost: number, duration: number): void {
    particleScaleFrom = particleScale;
    particleScaleTarget = scale;
    particleAlphaBoostFrom = particleAlphaBoost;
    particleAlphaBoostTarget = alphaBoost;
    particleStrokeBoostFrom = particleStrokeBoost;
    particleStrokeBoostTarget = strokeBoost;
    particleMorphProgress = 0;
    particleMorphDuration = Math.max(0.12, duration);
  }

  function triggerParticleSwell(strength: number, duration: number): void {
    particleSwellProgress = 0;
    particleSwellDuration = Math.max(0.24, duration);
    particleSwellStrength = Math.max(particleSwellStrength, strength);
  }

  function particleColorMixProgress(particle: EngineParticle): number {
    if (!particleColorTarget) return 0;
    if (!particleColorStagger) return particleColorProgress;
    const threshold = seededUnit(particle.seed + 211.5) * 0.72;
    return smoothstep((particleColorProgress - threshold) / 0.28);
  }

  function particleCueSwell(particle: EngineParticle): number {
    if (particleSwellProgress >= 1 || particleSwellStrength <= 0) return 0;
    const threshold = seededUnit(particle.seed + 419.7) * 0.68;
    const localProgress = (particleSwellProgress - threshold) / 0.32;
    const rise = smoothstep(localProgress);
    const fall = 1 - smoothstep(localProgress - 0.8);
    return rise * fall * particleSwellStrength;
  }

  function centerPosition(): { x: number; y: number } {
    return {
      x: w * (tuning.centerX + Math.sin(time * 0.12) * 0.035),
      y: h * (tuning.centerY + Math.cos(time * 0.1) * 0.03),
    };
  }

  function centerDepthMask(x: number, y: number): { alpha: number; scale: number; glow: number } {
    const radius = tuning.centerOcclusionRadius ?? 0;
    const strength = tuning.centerOcclusionStrength ?? 0;
    if (radius <= 0 || strength <= 0) return { alpha: 1, scale: 1, glow: 0 };

    const center = centerPosition();
    const rx = Math.max(1, Math.max(w, h) * radius * centerScale);
    const ry = Math.max(1, rx * 0.62);
    const dx = (x - center.x) / rx;
    const dy = (y - center.y) / ry;
    const inside = 1 - clamp01(Math.sqrt(dx * dx + dy * dy));
    if (inside <= 0) return { alpha: 1, scale: 1, glow: 0 };

    const mask = smoothstep(inside);
    return {
      alpha: 1 - mask * strength * 0.86,
      scale: 1 - mask * strength * 0.38,
      glow: mask * strength,
    };
  }

  function applyParticleColorMix(base: [number, number, number], particle: EngineParticle): [number, number, number] {
    return cue.mixParticleColor(applyColorMix(base, particleColorTarget, particleColorMixProgress(particle)), particle.seed);
  }

  function applyParticleJitter(color: [number, number, number], particle: EngineParticle): [number, number, number] {
    const range = (tuning.particleColorJitter ?? 0) * (0.45 + particle.depth * 0.75 + cueParticleChaos * 1.2);
    if (range <= 0) return color;
    const tonal = (seededUnit(particle.seed + 11.3) - 0.5) * range;
    const warmth = (seededUnit(particle.seed + 31.7) - 0.5) * range * 0.32;
    const coolness = (seededUnit(particle.seed + 61.1) - 0.5) * range * 0.16;
    const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
    return [
      clampChannel(color[0] + tonal + warmth),
      clampChannel(color[1] + tonal * 0.88 + warmth * 0.38),
      clampChannel(color[2] + tonal * 0.72 + coolness),
    ];
  }

  function createTrailBuffer() {
    trailBuffer = q.createGraphics(w, h);
    trailBuffer.pixelDensity(1);
    trailCtx = trailBuffer.drawingContext as CanvasRenderingContext2D;
    const [br, bg, bb] = palette.bgDark;
    trailCtx.fillStyle = `rgb(${br},${bg},${bb})`;
    trailCtx.fillRect(0, 0, w, h);
  }

  function seedQ5Noise() {
    q.noiseSeed?.(tuning.seed);
    q.noiseDetail?.(tuning.noiseOctaves, tuning.noiseFalloff);
  }

  function buildFlowField() {
    flowCols = Math.max(2, Math.ceil(w / FLOW_CELL_SIZE) + 1);
    flowRows = Math.max(2, Math.ceil(h / FLOW_CELL_SIZE) + 1);
    flowField = Array.from({ length: flowCols * flowRows }, () => ({ x: 1, y: 0 }));
  }

  function updateFlowField(force = false) {
    if (!force && frame % 3 !== 0) return;

    const z = tuning.seed * 0.001 + time * (0.06 + curParams.drift * 0.04 + flowSurge * 0.055);
    for (let row = 0; row < flowRows; row += 1) {
      for (let col = 0; col < flowCols; col += 1) {
        const index = row * flowCols + col;
        const nx = col * FLOW_CELL_SIZE * tuning.fieldScale;
        const ny = row * FLOW_CELL_SIZE * tuning.fieldScale;
        const n1 = q.noise(nx, ny, z);
        const n2 = q.noise(nx + 19.7, ny - 8.3, z + 5.1);
        const angle = tuning.field === 'landscape-dual-flow'
          ? (n1 * Math.PI * (1.55 + flowSurge * 0.45) + (row % 2 === 0 ? -0.28 : 0.2))
          : tuning.field === 'vertical-sway'
            ? Math.PI * 0.5 + (n1 - 0.5) * 1.1
            : tuning.field === 'orbital-fall'
              ? n1 * Math.PI * 2 + Math.PI * 0.18
              : (n1 - n2) * Math.PI * 3.4;
        flowField[index].x = Math.cos(angle);
        flowField[index].y = Math.sin(angle);
      }
    }
  }

  function sampleFlow(x: number, y: number): FlowCell {
    const col = Math.max(0, Math.min(flowCols - 1, Math.floor(x / FLOW_CELL_SIZE)));
    const row = Math.max(0, Math.min(flowRows - 1, Math.floor(y / FLOW_CELL_SIZE)));
    return flowField[row * flowCols + col] ?? flowField[0];
  }

  function resetParticle(particle: EngineParticle, index: number, initial = false) {
    const lane = index % 2 === 0 ? 0 : 1;
    const depth = initial ? random() : Math.max(0.05, particle.depth);
    particle.lane = lane;
    particle.depth = depth;
    particle.size = tuning.pointSize * (0.55 + depth * 1.55);
    particle.speed = tuning.speed * (0.45 + depth * 1.15);
    particle.seed = tuning.seed + index * 0.173 + random() * 10;
    particle.life = 0;

    if (tuning.emitter === 'left-edge') {
      const spread = tuning.leftEntrySpread ?? 0.76;
      const centerBias = tuning.field === 'landscape-dual-flow' ? tuning.centerY : 0.5;
      const coverage = clamp01(coverageProgress + coverageBoost);
      const canSeedInside = !initial && coverage > 0.45 && random() < coverage * 0.56;
      particle.x = initial
        ? -20 + random() * w * mix(0.42, 0.96, coverage)
        : canSeedInside
          ? random() * w * coverage
          : -30 - random() * w * 0.18;
      particle.y = h * (centerBias + (random() - 0.5) * spread);
    } else if (tuning.emitter === 'orbital-cloud') {
      particle.angle = random() * TWO_PI;
      particle.radius = Math.max(w, h) * (0.06 + Math.pow(depth, 0.78) * 0.38);
      particle.x = w * tuning.centerX + Math.cos(particle.angle) * particle.radius;
      particle.y = h * tuning.centerY + Math.sin(particle.angle) * particle.radius * 0.42 - random() * h * 0.36;
    } else if (tuning.emitter === 'top-bottom') {
      particle.x = w * (0.02 + random() * 0.96);
      particle.y = lane === 0 ? -20 - random() * h * 0.2 : h + 20 + random() * h * 0.2;
    } else if (tuning.emitter === 'center-burst') {
      const angle = random() * Math.PI * 2;
      const radius = Math.min(w, h) * random() * 0.24;
      particle.x = w * tuning.centerX + Math.cos(angle) * radius;
      particle.y = h * tuning.centerY + Math.sin(angle) * radius;
      particle.angle = angle;
      particle.radius = radius;
    } else {
      particle.x = random() * w;
      particle.y = random() * h;
    }

    particle.px = particle.x;
    particle.py = particle.y;
    particle.vx = tuning.emitter === 'left-edge' ? 0.55 + random() * 0.45 : random() - 0.5;
    particle.vy = random() - 0.5;
  }

  function buildParticles() {
    random = createSeededRandom(tuning.seed);
    particles = Array.from({ length: tuning.particleCount }, (_, index) => {
      const particle: EngineParticle = {
        x: 0,
        y: 0,
        px: 0,
        py: 0,
        vx: 0,
        vy: 0,
        angle: random() * Math.PI * 2,
        radius: Math.min(w, h) * (0.08 + random() * 0.4),
        depth: random(),
        lane: index % 2 === 0 ? 0 : 1,
        size: 1,
        speed: tuning.speed,
        seed: tuning.seed + index,
        life: 0,
      };
      resetParticle(particle, index, true);
      return particle;
    });
  }

  function buildBounceLines() {
    const count = tuning.overlays.includes('bouncing-lines')
      ? Math.max(2, Math.min(5, Math.round(2 + tuning.overlayAlpha * 20)))
      : 0;

    bounceLines = Array.from({ length: count }, (_, index) => {
      const speed = 16 + random() * 28 + index * 4;
      return {
        x1: w * (0.12 + random() * 0.46),
        y1: h * (0.16 + random() * 0.56),
        x2: w * (0.28 + random() * 0.54),
        y2: h * (0.18 + random() * 0.58),
        vx1: (random() < 0.5 ? -1 : 1) * speed,
        vy1: (random() < 0.5 ? -1 : 1) * (speed * (0.62 + random() * 0.5)),
        vx2: (random() < 0.5 ? -1 : 1) * (speed * (0.74 + random() * 0.5)),
        vy2: (random() < 0.5 ? -1 : 1) * (speed * (0.55 + random() * 0.65)),
        phase: random() * TWO_PI,
      };
    });
  }

  function hasOverlay(overlay: CongGenerativeParticleOverlay): boolean {
    return tuning.overlays.includes(overlay);
  }

  function addBurst(x: number, y: number, intensity: number) {
    if (bursts.length >= tuning.maxBursts) bursts.shift();
    bursts.push({
      x,
      y,
      age: 0,
      life: 0.8 + intensity * 0.8,
      strength: 0.2 + intensity * 0.48,
    });
  }

  function updateBounceLine(line: BounceLine, dt: number) {
    const speed = 0.35 + curParams.drift * 0.8 + curAudio.energy * 0.5;
    line.x1 += line.vx1 * dt * speed;
    line.y1 += line.vy1 * dt * speed;
    line.x2 += line.vx2 * dt * speed;
    line.y2 += line.vy2 * dt * speed;
    line.phase += dt * (0.45 + curAudio.mids * 0.7);

    if (line.x1 < 0 || line.x1 > w) line.vx1 *= -1;
    if (line.y1 < 0 || line.y1 > h) line.vy1 *= -1;
    if (line.x2 < 0 || line.x2 > w) line.vx2 *= -1;
    if (line.y2 < 0 || line.y2 > h) line.vy2 *= -1;

    line.x1 = Math.max(0, Math.min(w, line.x1));
    line.y1 = Math.max(0, Math.min(h, line.y1));
    line.x2 = Math.max(0, Math.min(w, line.x2));
    line.y2 = Math.max(0, Math.min(h, line.y2));
  }

  function updateParticle(particle: EngineParticle, index: number, dt: number) {
    particle.px = particle.x;
    particle.py = particle.y;
    particle.life += dt;

    const coverage = tuning.emitter === 'left-edge' ? clamp01(coverageProgress + coverageBoost) : 1;
    const speed = particle.speed * (0.38 + curParams.drift * 0.86 + curAudio.energy * 0.32 + curAudio.bass * 0.28 + flowSurge * 0.42 + coverage * 0.14);
    const centerX = w * (tuning.centerX + Math.sin(time * 0.17) * 0.035 + curAudio.bass * 0.018);
    const centerY = h * (tuning.centerY + Math.cos(time * 0.13) * 0.03 - curAudio.mids * 0.012);

    if (tuning.field === 'orbital-fall') {
      particle.angle += dt * (0.14 + particle.depth * 0.62) * (0.7 + curParams.drift + curAudio.energy * 0.25);
      const noiseWobble = (q.noise(particle.seed, time * 0.16, particle.depth * 3) - 0.5) * Math.min(w, h) * tuning.fieldStrength * 0.08;
      const radius = particle.radius * (0.82 + curParams.density * 0.34 + curAudio.bass * 0.16) + noiseWobble;
      const sceneBiasX = tuning.emitter === 'orbital-cloud'
        ? Math.sin(particle.seed * 0.71) * w * 0.22
        : Math.sin(particle.seed * 0.51) * w * 0.08;
      const sceneBiasY = tuning.emitter === 'orbital-cloud'
        ? Math.cos(particle.seed * 0.63) * h * 0.16
        : Math.cos(particle.seed * 0.47) * h * 0.06;
      const fall = tuning.mode === 'cloud-again'
        ? (((time * speed * 0.16) + particle.seed * 2.7) % (h + 180)) - (h + 180) * 0.5
        : 0;
      particle.x = centerX + sceneBiasX + Math.cos(particle.angle + particle.seed * 0.01) * radius;
      particle.y = centerY + sceneBiasY + Math.sin(particle.angle * 0.82 + particle.seed * 0.02) * radius * tuning.laneSeparation + fall;
    } else if (tuning.field === 'vertical-sway') {
      const direction = particle.lane === 0 ? 1 : -1;
      particle.y += direction * speed * dt;
      particle.x += Math.sin(time * (0.6 + particle.depth) + particle.seed + particle.y * 0.006) * tuning.fieldStrength * 34 * dt;
    } else {
      const flow = sampleFlow(particle.x, particle.y);
      const laneBias = tuning.field === 'landscape-dual-flow'
        ? (particle.lane === 0 ? -0.22 : 0.2)
        : 0;
      const angle = Math.atan2(flow.y, flow.x) + laneBias;
      const targetY = tuning.field === 'landscape-dual-flow'
        ? h * (tuning.centerY + (particle.lane === 0 ? -0.13 : 0.13) * tuning.laneSeparation)
        : particle.y;
      const verticalPull = tuning.field === 'landscape-dual-flow'
        ? (targetY - particle.y) * ((tuning.verticalPullStrength ?? 0.18) + flowSurge * 0.08)
        : 0;
      particle.vx += (Math.max(0.18, Math.cos(angle)) * tuning.fieldStrength - particle.vx) * 0.08;
      particle.vy += (Math.sin(angle) * tuning.fieldStrength + verticalPull / Math.max(speed, 1) - particle.vy) * 0.08;
      particle.x += (particle.vx * speed + (tuning.emitter === 'left-edge' ? speed * (0.68 + flowSurge * 0.16 + coverage * 0.24) : 0)) * dt;
      particle.y += particle.vy * speed * dt;
    }

    const offscreen = particle.x < -80 || particle.x > w + 80 || particle.y < -100 || particle.y > h + 100;
    if (offscreen) resetParticle(particle, index);
  }

  function particleColor(particle: EngineParticle): [number, number, number] {
    const [dr, dg, db] = palette.dotColor;
    const [ar, ag, ab] = palette.accentGlow;
    const [wr, wg, wb] = palette.accentWarm;

    if (tuning.mode === 'landscape-og') {
      const yellow = 160 + particle.depth * 80 + curAudio.highs * 20;
      if (particle.lane === 0) {
        return applyParticleJitter(applyParticleColorMix([
          Math.round(yellow),
          Math.round(yellow * 0.88),
          Math.round(mix(db, ab, 0.38)),
        ], particle), particle);
      }
      return applyParticleJitter(applyParticleColorMix([
        Math.round(yellow),
        Math.round(mix(88, wg, 0.35 + curAudio.mids * 0.2)),
        Math.round(mix(10, wb, 0.3)),
      ], particle), particle);
    }

    if (tuning.mode === 'storm' || tuning.mode === 'chord-storm') {
      const tint = clamp01(0.24 + particle.depth * 0.42 + curParams.glow * 0.28);
      return applyParticleJitter(applyParticleColorMix([
        Math.round(mix(dr, wr, tint)),
        Math.round(mix(dg, wg, tint)),
        Math.round(mix(db, wb, tint)),
      ], particle), particle);
    }

    const tint = clamp01(0.2 + particle.depth * 0.5 + curParams.glow * 0.3 + curAudio.highs * 0.2 + sectionLevel * 0.22);
    return applyParticleJitter(applyParticleColorMix([
      Math.round(mix(dr, ar, tint)),
      Math.round(mix(dg, ag, tint)),
      Math.round(mix(db, ab, tint)),
    ], particle), particle);
  }

  function particleReleaseAlpha(particle: EngineParticle): number {
    if (!tuning.releaseOnCue) return 1;
    const initialAlpha = clamp01(tuning.initialParticleAlpha ?? 0.3);
    if (releaseMode === 'all-at-once') {
      return initialAlpha + (1 - initialAlpha) * smoothstep(particleRelease);
    }

    const threshold = seededUnit(particle.seed) * 0.72;
    const reveal = smoothstep((particleRelease - threshold) / 0.28);
    return initialAlpha + (1 - initialAlpha) * reveal;
  }

  function drawParticle(ctx: CanvasRenderingContext2D, particle: EngineParticle, mirror = false) {
    const y = mirror ? h - particle.y : particle.y;
    const factors = computeExclusion(particle.x, y, curExclusion);
    if (factors.density < 0.26 && particle.depth > 0.58) return;

    const [r, g, b] = particleColor(particle);
    const depthMask = centerDepthMask(particle.x, y);
    const cueSwell = particleCueSwell(particle);
    const eventDensity = cue.densityProgress(particle.seed);
    if (eventDensity < -0.05 && particle.depth > 0.52 + eventDensity * 0.42) return;
    const alpha = (0.018 + particle.depth * 0.075 + curParams.density * 0.055 + curAudio.energy * 0.025 + particleAlphaBoost + cueSwell * 0.028 + sectionLevel * 0.024)
      * tuning.particleAlpha
      * factors.alpha
      * particleReleaseAlpha(particle)
      * depthMask.alpha
      * clamp01(1 + eventDensity * 0.72)
      * (mirror ? 0.52 : 1);
    const sizeJitter = 1 + (seededUnit(particle.seed + 107.9) - 0.5) * (tuning.particleSizeJitter ?? 0) * (1 + cueParticleChaos);
    const intraRamp = smoothstep(intraPhaseProgress);
    const size = particle.size
      * particleScale
      * Math.max(0.2, sizeJitter)
      * (1 + cueSwell * 0.62)
      * (1 + cue.sizeProgress(particle.seed) * 0.46)
      * depthMask.scale
      * (0.8 + curParams.shimmer * 0.36 + curAudio.transient * 0.35)
      * (1 + intraRamp * sectionLevel * 0.22);
    const lineworkAlpha = tuning.lineworkAlpha ?? 1;

    if (activeRenderer === 'cloud-puffs') {
      const gradient = ctx.createRadialGradient(particle.x, y, 0, particle.x, y, size * 5.2);
      gradient.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.76})`);
      gradient.addColorStop(0.55, `rgba(${r},${g},${b},${alpha * 0.22})`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(particle.x, y, size * 4.8, size * 2.4, particle.angle * 0.2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (lineworkAlpha > 0 && (activeRenderer === 'streaks' || activeRenderer === 'rays' || activeRenderer === 'chords')) {
      const dx = particle.x - particle.px;
      const dy = y - (mirror ? h - particle.py : particle.py);
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * lineworkAlpha * (1 - depthMask.glow * 0.52)})`;
      ctx.lineWidth = Math.max(0.6, size * 0.65);
      ctx.beginPath();
      ctx.moveTo(particle.px, mirror ? h - particle.py : particle.py);
      ctx.lineTo(particle.x + dx * tuning.streakLength * 0.08, y + dy * tuning.streakLength * 0.08);
      ctx.stroke();
    }

    ctx.fillStyle = `rgba(${r},${g},${b},${alpha * (0.78 + depthMask.glow * 0.26)})`;
    ctx.beginPath();
    ctx.ellipse(particle.x, y, size * 1.2, size, particle.angle * 0.2, 0, Math.PI * 2);
    ctx.fill();

    const particleStrokeAlpha = (tuning.particleStrokeAlpha ?? 0) + particleStrokeBoost;
    if (particleStrokeAlpha > 0 && alpha > 0.001) {
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * particleStrokeAlpha})`;
      ctx.lineWidth = Math.max(0.45, size * 0.18);
      ctx.stroke();
    }
  }

  function drawGridRays(ctx: CanvasRenderingContext2D) {
    const lineworkAlpha = tuning.lineworkAlpha ?? 1;
    if (lineworkAlpha <= 0) return;
    const [ar, ag, ab] = palette.accentGlow;
    const [wr, wg, wb] = palette.accentWarm;
    const centerX = w * tuning.centerX;
    const centerY = h * tuning.centerY;

    ctx.save();
    ctx.lineWidth = 1;
    for (let index = 0; index < 12; index += 1) {
      const x = w * (0.08 + index * 0.075 + Math.sin(time * 0.2 + index) * 0.012);
      const factors = computeExclusion(x, centerY, curExclusion);
      ctx.strokeStyle = `rgba(${wr},${wg},${wb},${tuning.overlayAlpha * lineworkAlpha * (0.34 + curAudio.mids * 0.32) * factors.alpha})`;
      ctx.beginPath();
      ctx.moveTo(x, h * 0.08);
      ctx.lineTo(centerX + Math.sin(time * 0.17 + index) * 36, centerY);
      ctx.stroke();
    }

    for (let row = 0; row < 4; row += 1) {
      const y = h * (0.2 + row * 0.16 + Math.cos(time * 0.12 + row) * 0.01);
      const factors = computeExclusion(centerX, y, curExclusion);
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},${tuning.overlayAlpha * lineworkAlpha * 0.16 * factors.alpha})`;
      ctx.beginPath();
      ctx.moveTo(w * 0.06, y);
      ctx.lineTo(w * 0.78, y + Math.sin(time * 0.18 + row) * 24);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRandomChords(ctx: CanvasRenderingContext2D) {
    const lineworkAlpha = tuning.lineworkAlpha ?? 1;
    if (lineworkAlpha <= 0) return;
    const [ar, ag, ab] = palette.accentGlow;
    const [wr, wg, wb] = palette.accentWarm;
    const centerX = w * tuning.centerX;
    const centerY = h * tuning.centerY;

    ctx.save();
    ctx.lineWidth = 0.9 + curAudio.transient * 1.6;
    for (let index = 0; index < 7; index += 1) {
      const a = time * 0.18 + index * 1.7 + tuning.seed * 0.0007;
      const b = a + 1.1 + Math.sin(time * 0.23 + index) * 0.7;
      const radius = Math.min(w, h) * (0.14 + index * 0.035 + curAudio.bass * 0.035);
      const x1 = centerX + Math.cos(a) * radius;
      const y1 = centerY + Math.sin(a) * radius * 0.62;
      const x2 = centerX + Math.cos(b) * radius;
      const y2 = centerY + Math.sin(b) * radius * 0.62;
      const factors = computeExclusion((x1 + x2) * 0.5, (y1 + y2) * 0.5, curExclusion);
      ctx.strokeStyle = `rgba(${index % 2 ? wr : ar},${index % 2 ? wg : ag},${index % 2 ? wb : ab},${tuning.overlayAlpha * lineworkAlpha * (0.42 + curParams.impulse + curAudio.transient * 0.7) * factors.alpha})`;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBouncingLines(ctx: CanvasRenderingContext2D) {
    const lineworkAlpha = tuning.lineworkAlpha ?? 1;
    if (lineworkAlpha <= 0) return;
    const [ar, ag, ab] = palette.accentGlow;
    const [wr, wg, wb] = palette.accentWarm;

    ctx.save();
    for (let index = 0; index < bounceLines.length; index += 1) {
      const line = bounceLines[index];
      const mx = (line.x1 + line.x2) * 0.5;
      const my = (line.y1 + line.y2) * 0.5;
      const factors = computeExclusion(mx, my, curExclusion);
      const alpha = tuning.overlayAlpha * lineworkAlpha * (0.36 + curAudio.mids * 0.35 + Math.sin(line.phase) * 0.12) * factors.alpha;
      ctx.strokeStyle = `rgba(${index % 2 ? wr : ar},${index % 2 ? wg : ag},${index % 2 ? wb : ab},${alpha})`;
      ctx.lineWidth = 0.8 + curAudio.highs * 1.4;
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y1);
      ctx.quadraticCurveTo(mx + Math.sin(line.phase) * 42, my + Math.cos(line.phase * 0.8) * 34, line.x2, line.y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBursts(ctx: CanvasRenderingContext2D) {
    const [ar, ag, ab] = palette.accentGlow;
    for (let index = bursts.length - 1; index >= 0; index -= 1) {
      const burst = bursts[index];
      const progress = clamp01(burst.age / burst.life);
      const factors = computeExclusion(burst.x, burst.y, curExclusion);
      const radius = Math.max(w, h) * (0.08 + burst.strength * 0.16) * (1 + progress * 1.4);
      const alpha = (1 - progress) * burst.strength * factors.alpha;
      const glow = ctx.createRadialGradient(burst.x, burst.y, 0, burst.x, burst.y, radius);
      glow.addColorStop(0, `rgba(${ar},${ag},${ab},${alpha * 0.14})`);
      glow.addColorStop(0.5, `rgba(${ar},${ag},${ab},${alpha * 0.03})`);
      glow.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(burst.x - radius, burst.y - radius, radius * 2, radius * 2);
    }
  }

  function drawOverlays(ctx: CanvasRenderingContext2D) {
    if (hasOverlay('grid-rays') || activeRenderer === 'rays' || tuning.mode === 'galaxy') drawGridRays(ctx);
    if (hasOverlay('random-chords') || activeRenderer === 'chords' || tuning.mode === 'chord-storm') drawRandomChords(ctx);
    if (hasOverlay('bouncing-lines')) drawBouncingLines(ctx);
    drawBursts(ctx);
  }

  function drawHalo(ctx: CanvasRenderingContext2D, layer: 'background' | 'foreground' = 'background') {
    const [ar, ag, ab] = palette.accentGlow;
    const [wr, wg, wb] = palette.accentWarm;
    const [cr, cg, cb] = applyColorMix([ar, ag, ab], centerColorTarget, centerColorProgress);
    const centerAlpha = tuning.centerFormAlpha ?? tuning.overlayAlpha;
    const { x, y } = centerPosition();
    const isTopBottomStorm = tuning.mode === 'storm' && tuning.emitter === 'top-bottom';
    const haloRadius = tuning.centerHaloRadius ?? (tuning.mode === 'cloud-again' ? 0.34 : 0.24);
    const radius = Math.max(w, h) * haloRadius * centerScale;
    const haloAlpha = Math.min(0.42, centerAlpha + centerAlphaBoost + curParams.glow * 0.05 + curAudio.energy * 0.032);
    const previousComposite = ctx.globalCompositeOperation;
    if (centerColorTarget || layer === 'foreground') setComposite(ctx, 'source-over');

    if (isTopBottomStorm) {
      if (layer === 'background') {
        const edgeAlpha = haloAlpha * 0.32 + curAudio.bass * 0.01;
        const edgeGlow = ctx.createLinearGradient(0, 0, 0, h);
        edgeGlow.addColorStop(0, `rgba(${cr},${cg},${cb},${edgeAlpha})`);
        edgeGlow.addColorStop(0.18, `rgba(${cr},${cg},${cb},0)`);
        edgeGlow.addColorStop(0.82, `rgba(${wr},${wg},${wb},0)`);
        edgeGlow.addColorStop(1, `rgba(${wr},${wg},${wb},${edgeAlpha * 0.86})`);
        ctx.fillStyle = edgeGlow;
        ctx.fillRect(0, 0, w, h);
      } else if (centerAlpha > 0) {
        const collisionWidth = Math.max(16, h * (0.034 + curAudio.bass * 0.01));
        const collisionY = h * (tuning.centerY + Math.sin(time * 0.11) * 0.018);
        const collision = ctx.createLinearGradient(0, collisionY - collisionWidth, 0, collisionY + collisionWidth);
        collision.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
        collision.addColorStop(0.5, `rgba(${wr},${wg},${wb},${Math.min(0.14, haloAlpha * 0.46)})`);
        collision.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = collision;
        ctx.fillRect(0, collisionY - collisionWidth, w, collisionWidth * 2);

        const seamAlpha = Math.min(0.08, centerAlpha * 0.36 + centerAlphaBoost * 0.12 + curAudio.transient * 0.025);
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${seamAlpha})`;
        ctx.lineWidth = Math.max(0.7, Math.min(1.4, h * 0.0012));
        ctx.beginPath();
        for (let index = 0; index <= 10; index += 1) {
          const px = (index / 10) * w;
          const py = collisionY + Math.sin(time * 0.32 + index * 0.84) * h * 0.006;
          if (index === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      setComposite(ctx, previousComposite);
      return;
    }

    if (layer === 'background') {
      const halo = ctx.createRadialGradient(x, y, 0, x, y, radius);
      halo.addColorStop(0, `rgba(${cr},${cg},${cb},${haloAlpha * 0.58})`);
      halo.addColorStop(0.58, `rgba(${wr},${wg},${wb},${tuning.overlayAlpha * 0.22 + curAudio.bass * 0.014})`);
      halo.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
      setComposite(ctx, previousComposite);
      return;
    }

    if (centerAlpha > 0) {
      const coreBaseRadius = tuning.centerCoreRadius ?? 0.055;
      const coreAlpha = tuning.centerCoreAlpha ?? centerAlpha * 0.42;
      const coreRadius = Math.min(w, h) * (coreBaseRadius * centerScale + curParams.glow * 0.012 + curAudio.bass * 0.008);
      const core = ctx.createRadialGradient(x, y, 0, x, y, coreRadius * 3.2);
      core.addColorStop(0, `rgba(${cr},${cg},${cb},${Math.min(0.38, coreAlpha + centerAlphaBoost * 0.72 + curAudio.energy * 0.028)})`);
      core.addColorStop(0.32, `rgba(${cr},${cg},${cb},${coreAlpha * 0.62 + centerAlphaBoost * 0.34})`);
      core.addColorStop(0.68, `rgba(${wr},${wg},${wb},${coreAlpha * 0.18})`);
      core.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.ellipse(x, y, coreRadius * 2.4, coreRadius * 1.55, Math.sin(time * 0.18) * 0.22, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${Math.min(0.24, coreAlpha * 0.62 + centerAlphaBoost * 0.24)})`;
      ctx.lineWidth = Math.max(0.8, coreRadius * 0.08);
      ctx.beginPath();
      ctx.ellipse(x, y, coreRadius * 2.2, coreRadius * 1.42, Math.sin(time * 0.18) * 0.22, 0, Math.PI * 2);
      ctx.stroke();
    }
    setComposite(ctx, previousComposite);
  }

  return {
    setup(_q, _w, _h, _palette, _tuning) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      tuning = resolveCongGenerativeParticlesTuning(_tuning);
      rendererSequence = buildRendererSequence(tuning.renderer);
      activeRenderer = rendererSequence[0] ?? tuning.renderer;
      time = 0;
      frame = 0;
      bursts = [];
      cue = createCueEventState();
      resetEventState();
      seedQ5Noise();
      createTrailBuffer();
      buildFlowField();
      updateFlowField(true);
      buildParticles();
      buildBounceLines();
    },

    update(dt, params, audio, exclusion) {
      curParams = params;
      curAudio = audio;
      curExclusion = exclusion;
      cue.update(dt);
      if (reducedMotion()) return;

      frame += 1;
      time += dt * (0.34 + params.drift * 0.78 + audio.energy * 0.18);
      updateFlowField();
      cueParticleChaos = Math.max(0, cueParticleChaos - dt * 0.55);
      sectionLevel = sectionLevel + (sectionLevelTarget - sectionLevel) * (1 - Math.pow(0.25, dt));
      flowSurge *= Math.exp(-dt * 0.72);
      // Evolution
      intraPhaseProgress = Math.min(1, intraPhaseProgress + dt / 12);
      globalDensityAccrual = Math.min(1, globalDensityAccrual + dt * 0.006);
      overlayUnlockLevel = mix(overlayUnlockLevel, smoothstep(sectionLevel * 1.2 - 0.3), 1 - Math.pow(0.25, dt));
      rendererFlushBoost = Math.max(0, rendererFlushBoost - dt * 1.2);
      // Crescendo
      crescendoExplosion *= Math.exp(-dt / 3.0);
      const growthSeconds = tuning.coverageGrowthSeconds ?? 0;
      if (growthSeconds > 0 && tuning.emitter === 'left-edge') {
        coverageProgress = Math.min(1, coverageProgress + dt / growthSeconds);
        coverageBoost *= Math.exp(-dt * 0.18);
      }
      if (particleSwellProgress < 1) {
        particleSwellProgress = Math.min(1, particleSwellProgress + dt / particleSwellDuration);
        if (particleSwellProgress >= 1) particleSwellStrength = 0;
      }
      if (releaseActive) {
        particleRelease = Math.min(1, particleRelease + dt / releaseDuration);
        if (particleRelease >= 1) releaseActive = false;
      }
      if (particleColorTarget) particleColorProgress = Math.min(1, particleColorProgress + dt / particleColorDuration);
      if (centerColorTarget) centerColorProgress = Math.min(1, centerColorProgress + dt / centerColorDuration);
      if (centerMorphProgress < 1) {
        centerMorphProgress = Math.min(1, centerMorphProgress + dt / centerMorphDuration);
        const eased = smoothstep(centerMorphProgress);
        centerScale = mix(centerScaleFrom, centerScaleTarget, eased);
        centerAlphaBoost = mix(centerAlphaBoostFrom, centerAlphaBoostTarget, eased);
      }
      if (particleMorphProgress < 1) {
        particleMorphProgress = Math.min(1, particleMorphProgress + dt / particleMorphDuration);
        const eased = smoothstep(particleMorphProgress);
        particleScale = mix(particleScaleFrom, particleScaleTarget, eased);
        particleAlphaBoost = mix(particleAlphaBoostFrom, particleAlphaBoostTarget, eased);
        particleStrokeBoost = mix(particleStrokeBoostFrom, particleStrokeBoostTarget, eased);
      }

      for (let index = 0; index < particles.length; index += 1) {
        updateParticle(particles[index], index, dt);
      }

      for (let index = bursts.length - 1; index >= 0; index -= 1) {
        bursts[index].age += dt;
        if (bursts[index].age >= bursts[index].life) bursts.splice(index, 1);
      }

      if (hasOverlay('bouncing-lines')) {
        for (let index = 0; index < bounceLines.length; index += 1) {
          updateBounceLine(bounceLines[index], dt);
        }
      }

      if (audio.transient > 0.32 && random() < audio.transient * 0.16) {
        addBurst(w * (tuning.centerX + (random() - 0.5) * 0.24), h * (tuning.centerY + (random() - 0.5) * 0.24), audio.transient);
      }
    },

    draw(_q, ctx) {
      if (!trailCtx) return;
      const [br, bg, bb] = palette.bgDark;

      trailCtx.save();
      setComposite(trailCtx, 'source-over');
      if (tuning.feedbackBlur > 0) {
        trailCtx.filter = `blur(${tuning.feedbackBlur}px)`;
        trailCtx.drawImage(trailBuffer.canvas, 0, 0, w, h);
        trailCtx.filter = 'none';
      }
      trailCtx.fillStyle = `rgba(${br},${bg},${bb},${tuning.trailAlpha + rendererFlushBoost * 0.12})`;
      trailCtx.fillRect(0, 0, w, h);
      setComposite(trailCtx, blendModeToComposite(tuning.blendMode));
      drawHalo(trailCtx, 'background');

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        if (activeRenderer === 'mirrored-points') {
          drawParticle(trailCtx, particle);
          drawParticle(trailCtx, particle, true);
        } else {
          drawParticle(trailCtx, particle);
        }
      }

      drawHalo(trailCtx, 'foreground');
      if (overlayUnlockLevel > 0.02) {
        trailCtx.globalAlpha = overlayUnlockLevel;
        drawOverlays(trailCtx);
        trailCtx.globalAlpha = 1;
      }
      trailCtx.restore();

      ctx.drawImage(trailBuffer.canvas, 0, 0, w, h);

      // Crescendo: radial glow from center using screen blend
      if (crescendoExplosion > 0.02) {
        const [ar, ag, ab] = palette.accentGlow;
        const cx = w * tuning.centerX;
        const cy = h * tuning.centerY;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * crescendoExplosion * 0.62);
        grad.addColorStop(0, `rgba(${ar},${ag},${ab},${crescendoExplosion * 0.18})`);
        grad.addColorStop(0.4, `rgba(${ar},${ag},${ab},${crescendoExplosion * 0.06})`);
        grad.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    },

    onEvent(event: VisualEvent) {
      cue.handle(event, palette);
      if (event.type === 'section-cue') {
        const modeIndex = Math.max(0, event.sectionIndex ?? 1) % Math.max(rendererSequence.length, 1);
        const nextRenderer = rendererSequence[modeIndex] ?? activeRenderer;
        if (nextRenderer !== activeRenderer) rendererFlushBoost = 1;
        activeRenderer = nextRenderer;
        intraPhaseProgress = 0;
        const duration = Math.max(0.24, (event.durationMs ?? 2600) / 1000);
        setParticleMorph(
          Math.max(particleScale, 0.82 + event.intensity * 0.34),
          0.028 + event.intensity * 0.045,
          particleStrokeBoost + event.intensity * 0.012,
          duration,
        );
        triggerParticleSwell(0.42 + event.intensity * 0.22, duration);
        cueParticleChaos = Math.min(1, cueParticleChaos + 0.18 + event.intensity * 0.32);
        addBurst(w * tuning.centerX, h * tuning.centerY, 0.42 + event.intensity * 0.4);
        sectionLevelTarget = Math.min(1, (event.sectionIndex ?? 0) / 7);
        // Stagger color wave to accentWarm (or accentGlow for storm mode) on section events
        {
          const [ar2, ag2, ab2] = palette.accentGlow;
          const [wr2, wg2, wb2] = palette.accentWarm;
          const warmTarget: [number, number, number] = tuning.mode === 'storm' || tuning.mode === 'chord-storm'
            ? [ar2, ag2, ab2]
            : [wr2, wg2, wb2];
          particleColorTarget = warmTarget;
          particleColorProgress = 0;
          particleColorDuration = 2.4 + event.intensity * 1.2;
          particleColorStagger = true;
        }
        return;
      }

      if (event.type === 'storm-release') {
        releaseMode = event.releaseMode ?? tuning.releaseMode ?? 'one-by-one';
        releaseDuration = Math.max(0.12, (event.durationMs ?? tuning.releaseDurationMs ?? 1800) / 1000);
        releaseActive = true;
        setParticleMorph(0.84, 0.04 + event.intensity * 0.035, event.intensity * 0.012, releaseDuration);
        triggerParticleSwell(0.3 + event.intensity * 0.22, releaseDuration);
        addBurst(w * tuning.centerX, h * tuning.centerY, event.intensity);
        // Crescendo in late sections
        if (sectionLevel >= 0.7) {
          crescendoExplosion = Math.max(crescendoExplosion, 0.8 + event.intensity * 0.2);
          activeRenderer = 'mirrored-points';
          setParticleMorph(1.8, 0.12, 0.06, 2.4);
          triggerParticleSwell(0.9, 2.4);
          cueParticleChaos = Math.min(1, cueParticleChaos + 0.8);
          addBurst(w * tuning.centerX, h * tuning.centerY, 0.9 + event.intensity * 0.1);
          // Full stagger wave on crescendo
          const [ar2, ag2, ab2] = palette.accentGlow;
          const [wr2, wg2, wb2] = palette.accentWarm;
          const warmTarget: [number, number, number] = tuning.mode === 'storm' || tuning.mode === 'chord-storm'
            ? [ar2, ag2, ab2]
            : [wr2, wg2, wb2];
          particleColorTarget = warmTarget;
          particleColorProgress = 0;
          particleColorDuration = 3.6;
          particleColorStagger = true;
        }
        return;
      }

      if (event.type === 'color-morph' || event.type === 'palette-morph') {
        const [ar, ag, ab] = palette.accentGlow;
        const targetColor = event.color ?? shiftRgb(
          [ar, ag, ab],
          event.palette?.hueShift ?? 0,
          event.palette?.saturation ?? 1,
          event.palette?.brightness ?? 1,
        );
        const duration = Math.max(0.12, (event.durationMs ?? 6200) / 1000);

        if (!event.target || event.target === 'particles' || event.target === 'foreground' || event.target === 'mist' || event.target === 'all') {
          particleColorTarget = targetColor;
          particleColorProgress = 0;
          particleColorDuration = duration;
          particleColorStagger = event.releaseMode !== 'all-at-once';
          setParticleMorph(Math.max(particleScale, 0.96 + event.intensity * 0.3), 0.04 + event.intensity * 0.045, particleStrokeBoost + event.intensity * 0.01, duration);
          triggerParticleSwell(0.18 + event.intensity * 0.18, duration);
          cueParticleChaos = Math.min(1, cueParticleChaos + event.intensity * 0.16);
        }

        if (event.target === 'center' || event.target === 'background' || event.target === 'terrain' || event.target === 'all') {
          centerColorTarget = targetColor;
          centerColorProgress = 0;
          centerColorDuration = duration;
          setCenterMorph(event.target === 'background' ? 0.92 : 1.48, event.target === 'background' ? 0.02 : 0.11, duration);
        }

        addBurst(w * tuning.centerX, h * tuning.centerY, event.intensity);
        return;
      }

      if (event.type === 'focus-shift' && (!event.target || event.target === 'center' || event.target === 'all')) {
        const duration = Math.max(0.12, (event.durationMs ?? 4200) / 1000);
        setCenterMorph(1.1 + event.intensity * 0.35, event.intensity * 0.08, duration);
        triggerParticleSwell(0.16 + event.intensity * 0.14, duration);
      }

      if (event.type === 'motion-drift') {
        const duration = Math.max(0.12, (event.durationMs ?? 5200) / 1000);
        setParticleMorph(1.02 + event.intensity * 0.48, 0.045 + event.intensity * 0.052, 0.01 + event.intensity * 0.026, duration);
        triggerParticleSwell(0.22 + event.intensity * 0.2, duration);
        flowSurge = Math.max(flowSurge, 0.34 + event.intensity * 0.5);
        coverageBoost = Math.max(coverageBoost, (tuning.coverageCueBoost ?? 0.12) * (0.75 + event.intensity));
        cueParticleChaos = Math.min(1, cueParticleChaos + event.intensity * 0.34);
      }

      if (event.type === 'grain-bloom') {
        const duration = Math.max(0.12, (event.durationMs ?? 3600) / 1000);
        setParticleMorph(0.66 + event.intensity * 0.3, event.intensity * 0.025, event.intensity * 0.008, duration);
        triggerParticleSwell(0.14 + event.intensity * 0.16, duration);
      }

      if (event.type === 'density-surge' || event.type === 'glow-pulse' || event.type === 'spark-burst' || event.type === 'bloom-flash') {
        const duration = Math.max(0.16, (event.durationMs ?? 2200) / 1000);
        const isSpark = event.type === 'spark-burst' || event.type === 'bloom-flash';
        setParticleMorph(
          Math.max(particleScale, isSpark ? 1.08 + event.intensity * 0.38 : 0.92 + event.intensity * 0.34),
          (isSpark ? 0.06 : 0.04) + event.intensity * 0.06,
          particleStrokeBoost + event.intensity * 0.018,
          duration,
        );
        triggerParticleSwell(isSpark ? 0.52 + event.intensity * 0.34 : 0.34 + event.intensity * 0.24, duration);
        flowSurge = Math.max(flowSurge, isSpark ? 0.2 + event.intensity * 0.24 : flowSurge);
        coverageBoost = Math.max(coverageBoost, (tuning.coverageCueBoost ?? 0.12) * (isSpark ? 0.74 : 0.5) * event.intensity);
        cueParticleChaos = Math.min(1, cueParticleChaos + event.intensity * (isSpark ? 0.62 : 0.48));
        addBurst(
          w * (tuning.centerX + (random() - 0.5) * 0.24),
          h * (tuning.centerY + (random() - 0.5) * 0.24),
          0.55 + event.intensity * 0.45,
        );
      }

      addBurst(w * (tuning.centerX + (random() - 0.5) * 0.2), h * (tuning.centerY + (random() - 0.5) * 0.22), event.intensity);
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      createTrailBuffer();
      buildFlowField();
      updateFlowField(true);
      buildParticles();
      buildBounceLines();
    },

    destroy() {
      particles = [];
      bursts = [];
      bounceLines = [];
      flowField = [];
      trailBuffer?.remove?.();
      trailBuffer = null;
      trailCtx = null;
    },
  };
}
