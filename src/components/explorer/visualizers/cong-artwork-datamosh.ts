import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import { resolveCongArtworkDatamoshTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams, Visualizer, VisualizerRuntimeContext } from '../visualizer';
import { getCachedArtworkImage } from '../artwork-cache';

interface SliceSeed {
  phase: number;
  speed: number;
  amp: number;
  skew: number;
}

interface BlockSeed {
  x: number;
  y: number;
  w: number;
  h: number;
  phase: number;
  amp: number;
  shape: number;
}

interface PixelIsland {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  targetX: number;
  targetY: number;
  driftX: number;
  driftY: number;
  phase: number;
  stagger: number;
  settle: number;
}

interface RainDrop {
  x: number;
  y: number;
  speed: number;
  size: number;
  alpha: number;
  depth: number;
  phase: number;
  stagger: number;
}

interface LeftFlowParticle {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  depth: number;
  seed: number;
  lane: 0 | 1;
  targetX: number;
  targetY: number;
  targetColor: [number, number, number];
  targetBrightness: number;
  targetStagger: number;
}

interface StormParticle {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  direction: 1 | -1;
  depth: number;
  speed: number;
  size: number;
  phase: number;
  seed: number;
  targetX: number;
  targetY: number;
  targetColor: [number, number, number];
  targetBrightness: number;
  targetStagger: number;
}

interface SectionProfile {
  energy: number;
  displacement: number;
  blocks: number;
  channel: number;
  scan: number;
  feedback: number;
  glow: number;
  imageAnchor: number;
  rain: number;
  timeScale: number;
}

interface MoshDirectorProfile {
  feedback: number;
  smear: number;
  blocks: number;
  scanTear: number;
  channelLag: number;
  ghost: number;
  freeze: number;
  compression: number;
  sync: number;
  drift: number;
  vectorWarp: number;
  phase: number;
}

type MoshPassName =
  | 'feedback'
  | 'smear'
  | 'blocks'
  | 'scanTear'
  | 'channelLag'
  | 'ghost'
  | 'freeze'
  | 'compression'
  | 'sync'
  | 'drift'
  | 'vectorWarp'
  | 'pixelSort'
  | 'slitScan'
  | 'ditherDrift';

type MoshArcName = 'rain-first' | 'flow-first' | 'storm-first' | 'fracture-first';
type MoshLayerName = 'rain' | 'flow' | 'storm' | 'fracture';

interface MoshLayerTargets {
  rain: number;
  flow: number;
  storm: number;
  fracture: number;
  reform: number;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function lerpSectionProfile(a: SectionProfile, b: SectionProfile, t: number): SectionProfile {
  return {
    energy:      mix(a.energy,      b.energy,      t),
    displacement: mix(a.displacement, b.displacement, t),
    blocks:      mix(a.blocks,      b.blocks,      t),
    channel:     mix(a.channel,     b.channel,     t),
    scan:        mix(a.scan,        b.scan,        t),
    feedback:    mix(a.feedback,    b.feedback,    t),
    glow:        mix(a.glow,        b.glow,        t),
    imageAnchor: mix(a.imageAnchor, b.imageAnchor, t),
    rain:        mix(a.rain,        b.rain,        t),
    timeScale:   mix(a.timeScale,   b.timeScale,   t),
  };
}

function seededUnit(value: number): number {
  const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(mix(a[0], b[0], t)),
    Math.round(mix(a[1], b[1], t)),
    Math.round(mix(a[2], b[2], t)),
  ];
}

function shiftRgb(
  base: [number, number, number],
  hueShift = 0,
  saturation = 1,
  brightness = 1,
): [number, number, number] {
  const phase = (hueShift / 60) * Math.PI;
  const avg = (base[0] + base[1] + base[2]) / 3;
  const shifted: [number, number, number] = [
    base[0] + Math.sin(phase) * 42,
    base[1] + Math.sin(phase + Math.PI * 0.66) * 42,
    base[2] + Math.sin(phase + Math.PI * 1.33) * 42,
  ];

  return shifted.map((channel) => (
    Math.max(0, Math.min(255, Math.round((avg + (channel - avg) * saturation) * brightness)))
  )) as [number, number, number];
}

function complementRgb(base: [number, number, number], warm: [number, number, number]): [number, number, number] {
  return [
    Math.round(mix(255 - base[0], warm[0], 0.24)),
    Math.round(mix(255 - base[1], warm[1], 0.24)),
    Math.round(mix(255 - base[2], warm[2], 0.24)),
  ];
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fillCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / Math.max(sourceWidth, 1), height / Math.max(sourceHeight, 1));
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  ctx.drawImage(image, (width - drawWidth) * 0.5, (height - drawHeight) * 0.5, drawWidth, drawHeight);
}

function setCanvasSize(canvas: HTMLCanvasElement, width: number, height: number) {
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
}

const ARTWORK_BLEND_SECONDS = 1.4;

export function createCongArtworkDatamosh(): Visualizer {
  let q: any;
  let w = 0;
  let h = 0;
  let palette: Palette;
  let params: VisualParams = { turbulence: 0, density: 0, glow: 0, drift: 0, hueShift: 0, shimmer: 0, impulse: 0 };
  let audio: AudioSignal = { energy: 0, bass: 0, mids: 0, highs: 0, transient: 0 };
  let exclusion: ExclusionRect = { left: 0, right: 0, top: 0, bottom: 0, pad: 0 };
  let time = 0;
  let sectionEnergy = 0;
  let sectionTarget = 0.12;
  let eventBurst = 0;
  let imageLoaded = false;
  let imageFailed = false;
  let artworkBlend = 0;
  let artworkTargetsReady = false;
  let artworkReveal = 0;
  let fallbackPresence = 1;
  let destroyed = false;
  let sourceCanvas: HTMLCanvasElement;
  let feedbackCanvas: HTMLCanvasElement;
  let stableCanvas: HTMLCanvasElement;
  let fallbackCanvas: HTMLCanvasElement;
  let artworkCanvas: HTMLCanvasElement;
  let previousFrameCanvas: HTMLCanvasElement;
  let freezeCanvas: HTMLCanvasElement;
  let compressionCanvas: HTMLCanvasElement;
  let sourceCtx: CanvasRenderingContext2D;
  let feedbackCtx: CanvasRenderingContext2D;
  let stableCtx: CanvasRenderingContext2D;
  let fallbackCtx: CanvasRenderingContext2D;
  let artworkCtx: CanvasRenderingContext2D;
  let previousFrameCtx: CanvasRenderingContext2D;
  let freezeCtx: CanvasRenderingContext2D;
  let compressionCtx: CanvasRenderingContext2D;
  let image: HTMLImageElement | null = null;
  let sliceSeeds: SliceSeed[] = [];
  let blockSeeds: BlockSeed[] = [];
  let pixelIslands: PixelIsland[] = [];
  let rainDrops: RainDrop[] = [];
  let leftFlowParticles: LeftFlowParticle[] = [];
  let stormParticles: StormParticle[] = [];
  let config = resolveCongArtworkDatamoshTuning();
  let seed = 1;
  let sectionCueCount = 0;
  let sectionAge = 0;
  let sectionProgress = 0;
  let sectionDurationEstimate = 18;
  let lastSectionCueTime = 0;
  let sectionSeed = 1;
  let sectionProfile: SectionProfile = getSectionProfile(1);
  let prevSectionProfile: SectionProfile = getSectionProfile(1);
  let lerpedSectionProfile: SectionProfile = getSectionProfile(1);
  let memorySmear = 0;
  let memorySmearTarget = 0;
  let scanBloom = 0;
  let scanBloomTarget = 0;
  let rainPresence = 0;
  let rainPresenceTarget = 0;
  let rainColorProgress = 0;
  let rainColorProgressTarget = 0;
  let eventColorTarget: [number, number, number] | null = null;
  let eventColorProgress = 0;
  let eventColorDuration = 1;
  let eventColorStrength = 0;
  let eventColorStrengthTarget = 0;
  let leftFlowCoverage = 0;
  let leftFlowCoverageTarget = 0;
  let leftFlowEvolution = 0;
  let leftFlowReform = 0;
  let leftFlowReformTarget = 0;
  let leftFlowRandom = createRandom(1);
  let stormPresence = 0;
  let stormPresenceTarget = 0;
  let stormLineFlash = 0;
  let stormReform = 0;
  let stormReformTarget = 0;
  let stormRandom = createRandom(2);
  let arcName: MoshArcName = 'rain-first';
  let arcOrder: MoshLayerName[] = ['rain', 'flow', 'storm', 'fracture'];
  let sectionCountEstimate = 6;
  let roleProgress = 0;
  let layerTargets: MoshLayerTargets = { rain: 0, flow: 0, storm: 0, fracture: 0, reform: 0 };
  let fracturePresence = 0;
  let fracturePresenceTarget = 0;
  let handoffPressure = 0;
  let handoffPressureTarget = 0;
  let moshProfile: MoshDirectorProfile = createMoshDirectorProfile(1);
  // Evolution
  let sectionComplexityBias = 0;
  let sectionComplexityBiasTarget = 0;
  // Crescendo
  let crescendoLift = 0;
  let freezeHold = 0;
  let freezeAge = 0;
  let freezeX = 0;
  let freezeY = 0;
  let freezeW = 0;
  let freezeH = 0;
  let freezeRandom = createRandom(3);

  // Transient detection — rolling average gate so bass only fires on real hits
  let bassRollingAvg = 0;
  let bassTransient = 0;
  let bpm = 120;
  let bpmScale = 1;
  let beatPhase = 0;

  // Pixel sort: onset-gated luminance-run sorting on the low-res source canvas.
  // Bands queue on trigger and sort at most one per frame (no getImageData spikes).
  let lastPixelSortTime = -10;
  let pendingSortBands: { y: number; height: number }[] = [];
  let sortedBands: { y: number; height: number; age: number }[] = [];
  // Slit scan: lazily allocated ring buffer of quarter-res feedback snapshots
  let slitScanRing: HTMLCanvasElement[] = [];
  let slitScanHead = 0;
  let slitScanFilled = 0;
  let lastSlitScanPush = 0;
  // Dither drift: half-rate ordered dither on a sample-res scratch canvas
  let ditherCanvas: HTMLCanvasElement | null = null;
  let ditherCtx: CanvasRenderingContext2D | null = null;
  let ditherPhase = 0;
  let frameParity = 0;

  function getEnabledPasses(): Set<MoshPassName> | null {
    const enabled = config.enabledPasses;
    if (!enabled?.length) return null;
    return new Set(enabled);
  }

  function passEnabled(pass: MoshPassName): boolean {
    const enabled = getEnabledPasses();
    return !enabled || enabled.has(pass);
  }

  function createMoshDirectorProfile(seedValue: number): MoshDirectorProfile {
    const random = createRandom(seedValue ^ 0xD47A5A2B);
    const family = seedValue % 5;
    const profile: MoshDirectorProfile = {
      feedback: 0.68 + random() * 0.38,
      smear: 0.38 + random() * 0.58,
      blocks: 0.28 + random() * 0.68,
      scanTear: 0.3 + random() * 0.64,
      channelLag: 0.24 + random() * 0.62,
      ghost: 0.22 + random() * 0.68,
      freeze: 0.12 + random() * 0.56,
      compression: 0.22 + random() * 0.64,
      sync: 0.18 + random() * 0.7,
      drift: 0.34 + random() * 0.64,
      vectorWarp: 0.22 + random() * 0.72,
      phase: random() * Math.PI * 2,
    };

    if (family === 0) {
      profile.feedback += 0.24;
      profile.ghost += 0.22;
      profile.freeze *= 0.55;
      profile.vectorWarp += 0.12;
    } else if (family === 1) {
      profile.blocks += 0.28;
      profile.scanTear += 0.2;
      profile.compression += 0.18;
      profile.vectorWarp += 0.18;
    } else if (family === 2) {
      profile.smear += 0.24;
      profile.drift += 0.24;
      profile.channelLag += 0.16;
      profile.vectorWarp += 0.26;
    } else if (family === 3) {
      profile.freeze += 0.24;
      profile.sync += 0.28;
      profile.blocks += 0.16;
      profile.vectorWarp += 0.12;
    } else {
      profile.compression += 0.3;
      profile.feedback += 0.16;
      profile.channelLag += 0.18;
      profile.vectorWarp += 0.2;
    }

    return profile;
  }

  function pickArc(seedValue: number): MoshArcName {
    const arcs: readonly MoshArcName[] = ['rain-first', 'flow-first', 'storm-first', 'fracture-first'];
    return arcs[seedValue % arcs.length] ?? 'rain-first';
  }

  function getArcOrder(name: MoshArcName): MoshLayerName[] {
    if (name === 'flow-first') return ['flow', 'rain', 'fracture', 'storm'];
    if (name === 'storm-first') return ['storm', 'fracture', 'rain', 'flow'];
    if (name === 'fracture-first') return ['fracture', 'flow', 'storm', 'rain'];
    return ['rain', 'flow', 'storm', 'fracture'];
  }

  function emptyLayerTargets(): MoshLayerTargets {
    return { rain: 0, flow: 0, storm: 0, fracture: 0, reform: 0 };
  }

  function setLayerValue(targets: MoshLayerTargets, layer: MoshLayerName, value: number): void {
    if (layer === 'rain') targets.rain = value;
    else if (layer === 'flow') targets.flow = value;
    else if (layer === 'storm') targets.storm = value;
    else targets.fracture = value;
  }

  function buildLayerTargets(progress: number): MoshLayerTargets {
    const next = emptyLayerTargets();
    const eased = smoothstep(progress);
    const first = arcOrder[0] ?? 'rain';
    const second = arcOrder[1] ?? 'flow';
    const third = arcOrder[2] ?? 'storm';
    const fourth = arcOrder[3] ?? 'fracture';

    setLayerValue(next, first, clamp01(0.28 + smoothstep((eased - 0.05) / 0.32) * 0.66));
    setLayerValue(next, second, clamp01(smoothstep((eased - 0.18) / 0.36) * 0.88));
    setLayerValue(next, third, clamp01(smoothstep((eased - 0.36) / 0.34) * 0.98));
    setLayerValue(next, fourth, clamp01(smoothstep((eased - 0.54) / 0.3) * 0.92));

    if (progress > 0.58) {
      next.rain = Math.max(next.rain, 0.36 + smoothstep((progress - 0.58) / 0.28) * 0.34);
      next.flow = Math.max(next.flow, 0.42 + smoothstep((progress - 0.5) / 0.32) * 0.38);
      next.storm = Math.max(next.storm, 0.52 + smoothstep((progress - 0.44) / 0.26) * 0.48);
    }

    if (progress > 0.72) {
      next.storm = Math.max(next.storm, 0.88 + smoothstep((progress - 0.72) / 0.14) * 0.12);
    }

    next.fracture = Math.max(next.fracture, smoothstep((progress - 0.22) / 0.46) * 0.34);
    next.reform = smoothstep((progress - 0.74) / 0.22);
    return next;
  }

  function applyLayerTargets(next: MoshLayerTargets, intensity = 0): void {
    layerTargets = next;
    rainPresenceTarget = Math.max(rainPresenceTarget * 0.68, clamp01(next.rain + intensity * 0.16));
    leftFlowCoverageTarget = Math.max(leftFlowCoverageTarget * 0.72, clamp01(next.flow * (config.leftFlowCoverTarget ?? 0.88) + intensity * 0.12));
    stormPresenceTarget = Math.max(stormPresenceTarget * 0.58, clamp01(next.storm + intensity * 0.14));
    fracturePresenceTarget = Math.max(fracturePresenceTarget * 0.72, clamp01(next.fracture + intensity * 0.16));
    leftFlowReformTarget = Math.max(leftFlowReformTarget, (config.leftFlowReformStrength ?? 0.82) * next.reform);
    stormReformTarget = Math.max(stormReformTarget, 0.68 * next.reform);
    memorySmearTarget = Math.max(memorySmearTarget, (config.effectIntensity ?? 0) * (0.1 + next.fracture * 0.34));
    handoffPressureTarget = Math.max(handoffPressureTarget, next.reform);
  }

  function getEventColorMix(): number {
    if (!eventColorTarget) return 0;
    return smoothstep(eventColorProgress / Math.max(0.001, eventColorDuration)) * eventColorStrength;
  }

  function applyEventTint(base: [number, number, number], amount = 1): [number, number, number] {
    const mixAmount = clamp01(getEventColorMix() * amount);
    return eventColorTarget && mixAmount > 0.001 ? mixRgb(base, eventColorTarget, mixAmount) : base;
  }

  function resolveEventColor(event: VisualEvent): [number, number, number] {
    if (event.color) return event.color;
    const [ar, ag, ab] = palette.accentGlow;
    return shiftRgb(
      [ar, ag, ab],
      event.palette?.hueShift ?? 0,
      event.palette?.saturation ?? 1,
      event.palette?.brightness ?? 1,
    );
  }

  function triggerEventColor(event: VisualEvent, strengthScale = 1): void {
    eventColorTarget = resolveEventColor(event);
    eventColorProgress = 0;
    eventColorDuration = Math.max(0.2, (event.durationMs ?? config.rainColorMorphMs ?? 9000) / 1000);
    eventColorStrengthTarget = Math.max(eventColorStrengthTarget, clamp01((0.44 + event.intensity * 0.5) * strengthScale));
  }

  function getSectionProfile(sectionNumber: number): SectionProfile {
    const profiles: SectionProfile[] = [
      { energy: 0.08, displacement: 0.2, blocks: 0.18, channel: 0.16, scan: 0.2, feedback: 0.72, glow: 0.22, imageAnchor: 0.7, rain: 0, timeScale: 0.48 },
      { energy: 0.12, displacement: 0.18, blocks: 0.12, channel: 0.08, scan: 0.12, feedback: 0.74, glow: 0.26, imageAnchor: 0.64, rain: 0, timeScale: 0.55 },
      { energy: 0.3, displacement: 0.5, blocks: 0.44, channel: 0.34, scan: 0.48, feedback: 0.92, glow: 0.42, imageAnchor: 0.42, rain: 0, timeScale: 0.78 },
      { energy: 0.42, displacement: 0.58, blocks: 0.54, channel: 0.38, scan: 0.54, feedback: 1, glow: 0.52, imageAnchor: 0.34, rain: 0.82, timeScale: 0.82 },
      { energy: 0.5, displacement: 0.62, blocks: 0.5, channel: 0.44, scan: 0.58, feedback: 1.08, glow: 0.62, imageAnchor: 0.3, rain: 1, timeScale: 0.86 },
      { energy: 0.66, displacement: 0.86, blocks: 0.82, channel: 0.56, scan: 0.68, feedback: 1.14, glow: 0.72, imageAnchor: 0.22, rain: 0.62, timeScale: 0.96 },
      { energy: 0.78, displacement: 0.72, blocks: 0.72, channel: 0.68, scan: 0.78, feedback: 1.26, glow: 0.86, imageAnchor: 0.18, rain: 0.34, timeScale: 0.9 },
      { energy: 0.36, displacement: 0.38, blocks: 0.34, channel: 0.3, scan: 0.38, feedback: 0.86, glow: 0.52, imageAnchor: 0.46, rain: 0.2, timeScale: 0.54 },
    ];
    return profiles[Math.max(0, Math.min(profiles.length - 1, sectionNumber - 1))];
  }

  function rebuildSeeds(seedLabel: string) {
    seed = hashString(seedLabel || 'artwork-datamosh');
    const random = createRandom(seed);
    sliceSeeds = [];
    blockSeeds = [];
    pixelIslands = [];

    for (let i = 0; i < config.sliceCount; i += 1) {
      sliceSeeds.push({
        phase: random() * Math.PI * 2,
        speed: 0.18 + random() * 0.72,
        amp: 0.35 + random() * 0.9,
        skew: random() * 2 - 1,
      });
    }

    const blockCount = Math.max(18, Math.round(config.sliceCount * 0.82));
    for (let i = 0; i < blockCount; i += 1) {
      const shape = random();
      const shard = shape < 0.34;
      const bar = shape >= 0.34 && shape < 0.68;
      blockSeeds.push({
        x: random(),
        y: random(),
        w: shard ? 0.008 + random() * 0.034 : bar ? 0.045 + random() * 0.18 : 0.02 + random() * 0.09,
        h: shard ? 0.008 + random() * 0.032 : bar ? 0.006 + random() * 0.026 : 0.02 + random() * 0.08,
        phase: random() * Math.PI * 2,
        amp: 0.25 + random() * 0.9,
        shape,
      });
    }

    const islandCount = Math.max(0, Math.round(config.pixelIslandCount ?? 0));
    for (let i = 0; i < islandCount; i += 1) {
      const sw = 0.018 + random() * 0.075;
      const sh = 0.018 + random() * 0.07;
      const sx = Math.min(0.98 - sw, random() * (1 - sw));
      const sy = Math.min(0.98 - sh, random() * (1 - sh));
      const driftDirection = random() > 0.5 ? 1 : -1;
      pixelIslands.push({
        sx,
        sy,
        sw,
        sh,
        targetX: sx + sw * 0.5,
        targetY: sy + sh * 0.5,
        driftX: driftDirection * (0.05 + random() * 0.22),
        driftY: (random() - 0.5) * 0.22,
        phase: random() * Math.PI * 2,
        stagger: random(),
        settle: random(),
      });
    }
  }

  function buildRainDrops() {
    const random = createRandom(seed ^ 0xA511E9B3);
    const count = Math.max(0, Math.round(config.rainParticleCount ?? 0));
    const minSize = config.rainMinSize ?? 0.8;
    const maxSize = Math.max(minSize, config.rainMaxSize ?? 3.8);
    const minAlpha = config.rainMinAlpha ?? 0.045;
    const maxAlpha = Math.max(minAlpha, config.rainMaxAlpha ?? 0.2);
    rainDrops = [];

    for (let i = 0; i < count; i += 1) {
      const depth = random();
      rainDrops.push({
        x: random() * Math.max(w, 1),
        y: random() * Math.max(h, 1),
        speed: (config.rainFallSpeed ?? 140) * (0.42 + depth * 1.15 + random() * 0.38),
        size: mix(minSize, maxSize, Math.pow(depth, 1.35)),
        alpha: mix(minAlpha, maxAlpha, depth),
        depth,
        phase: random() * Math.PI * 2,
        stagger: random(),
      });
    }
  }

  function resetRainDrop(drop: RainDrop, fromTop: boolean) {
    const random = createRandom(seed ^ Math.round(drop.phase * 100000));
    drop.x = random() * Math.max(w, 1);
    drop.y = fromTop ? -20 - random() * Math.max(h, 1) * 0.22 : random() * Math.max(h, 1);
    drop.phase = random() * Math.PI * 2;
  }

  function respawnLeftFlowParticle(particle: LeftFlowParticle, random: () => number, fromLeft = true) {
    particle.x = fromLeft ? -24 - random() * Math.max(w, 1) * 0.18 : random() * Math.max(w, 1) * 0.22;
    particle.y = random() * Math.max(h, 1);
    particle.prevX = particle.x;
    particle.prevY = particle.y;
    particle.seed = random() * 1000;
  }

  function buildLeftFlowParticles() {
    const count = Math.max(0, Math.round(config.leftFlowParticleCount ?? 0));
    const random = createRandom(seed ^ 0x6B7D4A2F);
    leftFlowParticles = [];

    for (let index = 0; index < count; index += 1) {
      const particle: LeftFlowParticle = {
        x: 0,
        y: 0,
        prevX: 0,
        prevY: 0,
        depth: random(),
        seed: random() * 1000,
        lane: index % 2 === 0 ? 0 : 1,
        targetX: random(),
        targetY: random(),
        targetColor: [255, 255, 255],
        targetBrightness: 0.5,
        targetStagger: random(),
      };
      respawnLeftFlowParticle(particle, random, index % 3 !== 0);
      leftFlowParticles.push(particle);
    }
  }

  function respawnStormParticle(particle: StormParticle, random: () => number, fromEdge = true) {
    particle.x = random() * Math.max(w, 1);
    particle.y = fromEdge
      ? particle.direction === 1
        ? -24 - random() * Math.max(h, 1) * 0.18
        : h + 24 + random() * Math.max(h, 1) * 0.18
      : random() * Math.max(h, 1);
    particle.prevX = particle.x;
    particle.prevY = particle.y;
    particle.phase = random() * Math.PI * 2;
    particle.seed = random() * 1000;
  }

  function buildStormParticles() {
    const count = Math.max(0, Math.round(config.stormParticleCount ?? 0));
    const random = createRandom(seed ^ 0x71A2C9E1);
    stormParticles = [];

    for (let index = 0; index < count; index += 1) {
      const depth = random();
      const particle: StormParticle = {
        x: 0,
        y: 0,
        prevX: 0,
        prevY: 0,
        direction: index % 2 === 0 ? 1 : -1,
        depth,
        speed: 18 + random() * 86 + depth * 76,
        size: 0.45 + Math.pow(depth, 1.18) * 2.8,
        phase: random() * Math.PI * 2,
        seed: random() * 1000,
        targetX: random(),
        targetY: random(),
        targetColor: [255, 255, 255],
        targetBrightness: 0.5,
        targetStagger: random(),
      };
      respawnStormParticle(particle, random, index % 5 !== 0);
      stormParticles.push(particle);
    }
  }

  function assignLeftFlowArtworkTargets() {
    if (!leftFlowParticles.length || !sourceCanvas.width || !sourceCanvas.height) return;

    let imageData: ImageData | null = null;
    try {
      imageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    } catch {
      imageData = null;
    }

    const random = createRandom(seed ^ 0xC2B2AE35);
    const data = imageData?.data;
    const sourceWidth = sourceCanvas.width;
    const sourceHeight = sourceCanvas.height;

    for (let index = 0; index < leftFlowParticles.length; index += 1) {
      const particle = leftFlowParticles[index];
      let bestX = random();
      let bestY = random();
      let bestColor: [number, number, number] = palette.accentGlow;
      let bestBrightness = 0.5;
      let bestScore = -1;
      const attempts = data ? 4 : 1;

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const x = random();
        const y = random();
        if (!data) {
          bestX = x;
          bestY = y;
          break;
        }

        const px = Math.max(0, Math.min(sourceWidth - 1, Math.floor(x * sourceWidth)));
        const py = Math.max(0, Math.min(sourceHeight - 1, Math.floor(y * sourceHeight)));
        const offset = (py * sourceWidth + px) * 4;
        const red = data[offset] ?? 0;
        const green = data[offset + 1] ?? 0;
        const blue = data[offset + 2] ?? 0;
        const alpha = (data[offset + 3] ?? 255) / 255;
        const brightness = (red + green + blue) / (255 * 3);
        const contrast = Math.abs(red - green) + Math.abs(green - blue) + Math.abs(blue - red);
        const centerBias = 1 - Math.min(1, Math.hypot(x - 0.46, y - 0.5) / 0.72);
        const score = alpha * (brightness * 0.58 + contrast / 765 * 0.3 + centerBias * 0.26);

        if (score > bestScore) {
          bestScore = score;
          bestX = x;
          bestY = y;
          bestColor = [red, green, blue];
          bestBrightness = brightness;
        }
      }

      particle.targetX = bestX;
      particle.targetY = bestY;
      particle.targetColor = bestColor;
      particle.targetBrightness = bestBrightness;
      particle.targetStagger = random();
    }
  }

  function assignStormArtworkTargets() {
    if (!stormParticles.length || !sourceCanvas.width || !sourceCanvas.height) return;

    let imageData: ImageData | null = null;
    try {
      imageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    } catch {
      imageData = null;
    }

    const random = createRandom(seed ^ 0x89C35D17);
    const data = imageData?.data;
    const sourceWidth = sourceCanvas.width;
    const sourceHeight = sourceCanvas.height;

    for (const particle of stormParticles) {
      let bestX = random();
      let bestY = random();
      let bestColor: [number, number, number] = palette.accentGlow;
      let bestBrightness = 0.5;
      let bestScore = -1;
      const attempts = data ? 5 : 1;

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const x = random();
        const y = random();
        if (!data) {
          bestX = x;
          bestY = y;
          break;
        }

        const px = Math.max(0, Math.min(sourceWidth - 1, Math.floor(x * sourceWidth)));
        const py = Math.max(0, Math.min(sourceHeight - 1, Math.floor(y * sourceHeight)));
        const offset = (py * sourceWidth + px) * 4;
        const red = data[offset] ?? 0;
        const green = data[offset + 1] ?? 0;
        const blue = data[offset + 2] ?? 0;
        const alpha = (data[offset + 3] ?? 255) / 255;
        const brightness = (red + green + blue) / (255 * 3);
        const contrast = Math.abs(red - green) + Math.abs(green - blue) + Math.abs(blue - red);
        const verticalBias = particle.direction === 1 ? 1 - y * 0.28 : 0.72 + y * 0.28;
        const score = alpha * verticalBias * (brightness * 0.42 + contrast / 765 * 0.44 + random() * 0.08);

        if (score > bestScore) {
          bestScore = score;
          bestX = x;
          bestY = y;
          bestColor = [red, green, blue];
          bestBrightness = brightness;
        }
      }

      particle.targetX = bestX;
      particle.targetY = bestY;
      particle.targetColor = bestColor;
      particle.targetBrightness = bestBrightness;
      particle.targetStagger = random();
    }
  }

  function assignPixelIslandTargets() {
    if (!pixelIslands.length || !sourceCanvas.width || !sourceCanvas.height) return;

    let imageData: ImageData | null = null;
    try {
      imageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    } catch {
      imageData = null;
    }

    const random = createRandom(seed ^ 0xB25DF35D);
    const data = imageData?.data;
    const sourceWidth = sourceCanvas.width;
    const sourceHeight = sourceCanvas.height;

    for (const island of pixelIslands) {
      let bestX = island.sx + island.sw * 0.5;
      let bestY = island.sy + island.sh * 0.5;
      let bestScore = -1;

      for (let attempt = 0; attempt < (data ? 5 : 1); attempt += 1) {
        const x = random();
        const y = random();
        if (!data) {
          bestX = x;
          bestY = y;
          break;
        }

        const px = Math.max(0, Math.min(sourceWidth - 1, Math.floor(x * sourceWidth)));
        const py = Math.max(0, Math.min(sourceHeight - 1, Math.floor(y * sourceHeight)));
        const offset = (py * sourceWidth + px) * 4;
        const red = data[offset] ?? 0;
        const green = data[offset + 1] ?? 0;
        const blue = data[offset + 2] ?? 0;
        const alpha = (data[offset + 3] ?? 255) / 255;
        const brightness = (red + green + blue) / (255 * 3);
        const edge = Math.abs(red - green) + Math.abs(green - blue) + Math.abs(blue - red);
        const score = alpha * (brightness * 0.45 + edge / 765 * 0.48 + random() * 0.08);

        if (score > bestScore) {
          bestScore = score;
          bestX = x;
          bestY = y;
        }
      }

      island.targetX = bestX;
      island.targetY = bestY;
      island.settle = random();
    }
  }

  function drawFallbackArtwork() {
    const [bgR, bgG, bgB] = palette.bgDark;
    const [midR, midG, midB] = palette.bgMid;
    const [ar, ag, ab] = palette.accentGlow;
    const [wr, wg, wb] = palette.accentWarm;

    fallbackCtx.clearRect(0, 0, fallbackCanvas.width, fallbackCanvas.height);
    const gradient = fallbackCtx.createLinearGradient(0, 0, fallbackCanvas.width, fallbackCanvas.height);
    gradient.addColorStop(0, `rgb(${bgR},${bgG},${bgB})`);
    gradient.addColorStop(0.52, `rgb(${midR},${midG},${midB})`);
    gradient.addColorStop(1, `rgb(${Math.round(mix(ar, wr, 0.34))},${Math.round(mix(ag, wg, 0.34))},${Math.round(mix(ab, wb, 0.34))})`);
    fallbackCtx.fillStyle = gradient;
    fallbackCtx.fillRect(0, 0, fallbackCanvas.width, fallbackCanvas.height);

    const random = createRandom(seed ^ 0x9E3779B9);
    fallbackCtx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 170; i += 1) {
      const x = random() * fallbackCanvas.width;
      const y = random() * fallbackCanvas.height;
      const width = 8 + random() * fallbackCanvas.width * 0.28;
      const height = 1 + random() * 9;
      const warm = random() > 0.55;
      fallbackCtx.fillStyle = warm
        ? `rgba(${wr},${wg},${wb},${0.025 + random() * 0.08})`
        : `rgba(${ar},${ag},${ab},${0.022 + random() * 0.07})`;
      fallbackCtx.fillRect(x, y, width, height);
    }
    fallbackCtx.globalCompositeOperation = 'source-over';
  }

  function recomposeSource() {
    stableCtx.clearRect(0, 0, stableCanvas.width, stableCanvas.height);
    stableCtx.drawImage(fallbackCanvas, 0, 0, stableCanvas.width, stableCanvas.height);
    if (imageLoaded && image && artworkBlend > 0) {
      stableCtx.save();
      stableCtx.globalAlpha = smoothstep(artworkBlend);
      stableCtx.drawImage(artworkCanvas, 0, 0, stableCanvas.width, stableCanvas.height);
      stableCtx.restore();
    }

    sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    sourceCtx.drawImage(stableCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height);
  }

  function refreshSourceFromImage() {
    drawFallbackArtwork();
    artworkCtx.clearRect(0, 0, artworkCanvas.width, artworkCanvas.height);
    if (image && imageLoaded) {
      fillCover(artworkCtx, image, image.naturalWidth || 1, image.naturalHeight || 1, artworkCanvas.width, artworkCanvas.height);
    }
    recomposeSource();
  }

  function resizeBuffers(width: number, height: number) {
    setCanvasSize(stableCanvas, width, height);
    setCanvasSize(fallbackCanvas, width, height);
    setCanvasSize(artworkCanvas, width, height);
    setCanvasSize(feedbackCanvas, width, height);
    setCanvasSize(previousFrameCanvas, width, height);
    setCanvasSize(freezeCanvas, width, height);
    const compressionScale = Math.max(0.08, Math.min(0.65, config.compressionScale ?? 0.26));
    setCanvasSize(compressionCanvas, Math.max(24, width * compressionScale), Math.max(18, height * compressionScale));
    setCanvasSize(sourceCanvas, config.sampleWidth, config.sampleHeight);
    refreshSourceFromImage();
    feedbackCtx.clearRect(0, 0, feedbackCanvas.width, feedbackCanvas.height);
    feedbackCtx.drawImage(stableCanvas, 0, 0, feedbackCanvas.width, feedbackCanvas.height);
    previousFrameCtx.clearRect(0, 0, previousFrameCanvas.width, previousFrameCanvas.height);
    previousFrameCtx.drawImage(feedbackCanvas, 0, 0, previousFrameCanvas.width, previousFrameCanvas.height);
    freezeCtx.clearRect(0, 0, freezeCanvas.width, freezeCanvas.height);
    freezeCtx.drawImage(feedbackCanvas, 0, 0, freezeCanvas.width, freezeCanvas.height);
    buildRainDrops();
    buildLeftFlowParticles();
    buildStormParticles();
    assignLeftFlowArtworkTargets();
    assignStormArtworkTargets();
    assignPixelIslandTargets();
  }

  function loadArtwork(context?: VisualizerRuntimeContext, retryWithoutCors = false) {
    imageLoaded = false;
    imageFailed = false;
    artworkBlend = 0;
    artworkTargetsReady = false;
    artworkReveal = 0;
    image = null;

    const artworkUrl = context?.artworkUrl;
    if (!artworkUrl) {
      imageFailed = true;
      refreshSourceFromImage();
      return;
    }

    // Fast path: image already cached by the preloader — no blank screen.
    if (!retryWithoutCors) {
      const cached = getCachedArtworkImage(artworkUrl);
      if (cached) {
        image = cached;
        imageLoaded = true;
        artworkBlend = 1;
        artworkReveal = 1;
        fallbackPresence = 0;
        refreshSourceFromImage();
        assignLeftFlowArtworkTargets();
        assignStormArtworkTargets();
        assignPixelIslandTargets();
        artworkTargetsReady = true;
        feedbackCtx.globalAlpha = 1;
        feedbackCtx.globalCompositeOperation = 'source-over';
        feedbackCtx.drawImage(stableCanvas, 0, 0, feedbackCanvas.width, feedbackCanvas.height);
        return;
      }
    }

    const nextImage = new Image();
    if (!retryWithoutCors) nextImage.crossOrigin = 'anonymous';
    nextImage.decoding = 'async';
    nextImage.onload = () => {
      if (destroyed || image !== nextImage) return;
      imageLoaded = true;
      imageFailed = false;
      refreshSourceFromImage();
    };
    nextImage.onerror = () => {
      if (destroyed || image !== nextImage) return;
      if (!retryWithoutCors) {
        loadArtwork(context, true);
        return;
      }
      imageLoaded = false;
      imageFailed = true;
      refreshSourceFromImage();
    };
    image = nextImage;
    nextImage.src = artworkUrl;
  }

  function drawSlicePass(intensity: number, protectStart: number, profile: SectionProfile) {
    const sliceHeight = Math.max(1, sourceCanvas.height / Math.max(sliceSeeds.length, 1));
    const scaleY = h / sourceCanvas.height;
    // Use transient-gated bass so macro displacement only spikes on real hits,
    // not sustained bass energy. bassTransient = 0 during continuous bass.
    const beatLift = audio.bass * 0.4 + bassTransient * 0.7 + audio.energy * 0.28 + eventBurst * 0.7;
    const displacement = config.displacement * profile.displacement * (0.18 + intensity * 0.72 + beatLift * 0.55) * (1 + sectionComplexityBias * 0.38);

    feedbackCtx.save();
    feedbackCtx.globalCompositeOperation = imageFailed ? 'screen' : 'source-over';
    feedbackCtx.globalAlpha = 0.32 + params.density * 0.18 + intensity * 0.14 + profile.imageAnchor * 0.12;
    for (let i = 0; i < sliceSeeds.length; i += 1) {
      const slice = sliceSeeds[i];
      const sy = Math.floor(i * sliceHeight);
      const sh = Math.max(1, Math.ceil(sliceHeight + 1));
      const yDepth = i / Math.max(sliceSeeds.length - 1, 1);
      const phase = time * slice.speed * profile.timeScale * bpmScale + slice.phase + yDepth * sectionEnergy * 4.5;
      const bassBand = 0.36 + Math.sin(yDepth * Math.PI) * 0.64;
      const offset = Math.sin(phase) * displacement * slice.amp
        + Math.sin(phase * 0.37 + sectionEnergy * 5) * displacement * 0.38 * slice.skew
        + audio.bass * config.transientDisplacement * bassBand;
      const dx = Math.max(-w * 0.12, Math.min(offset, protectStart - w * 0.12));
      const dy = Math.sin(phase * 0.53) * (1 + sectionEnergy * 7 * profile.displacement + audio.mids * 7);
      feedbackCtx.drawImage(
        sourceCanvas,
        0,
        sy,
        sourceCanvas.width,
        sh,
        dx,
        sy * scaleY + dy,
        w,
        Math.ceil(sh * scaleY) + 2,
      );
    }
    feedbackCtx.restore();
  }

  function drawBlockPass(intensity: number, protectStart: number, profile: SectionProfile) {
    const sectionNumber = sectionCueCount + 1;
    const fractureBaseline = clamp01(config.fractureBaseline ?? 0);
    const sectionMask = config.blockSectionMask;
    if (sectionMask?.length && !sectionMask.includes(sectionNumber)) return;
    const layerChance = config.blockLayerChance ?? 1;
    const sectionGate = seededUnit(sectionSeed * 0.001 + sectionNumber * 19.7);
    const fractureLift = Math.max(fracturePresence, layerTargets.fracture, fractureBaseline);
    if (sectionGate > layerChance && fractureLift < 0.24 && eventBurst < 0.42) return;

    const shapeMode = fractureBaseline > 0 && config.blockShapeMode
      ? config.blockShapeMode
      : sectionNumber <= 2
      ? 'soft'
      : sectionNumber <= 4
        ? 'mixed'
        : sectionNumber <= 6
          ? 'bars'
          : 'shards';
    const blockPresence = clamp01((0.22 + fractureLift * 0.78 + eventBurst * 0.28) * layerChance);
    const activeCount = Math.max(1, Math.round(blockSeeds.length * (profile.blocks + sectionComplexityBias * 0.22) * blockPresence * (0.18 + intensity * 0.48 + audio.mids * 0.28)));
    const blockScale = config.blockSize * profile.blocks * (0.45 + intensity * 0.8 + audio.mids * 0.68);

    feedbackCtx.save();
    feedbackCtx.globalCompositeOperation = imageFailed ? 'lighter' : 'screen';
    feedbackCtx.globalAlpha = (config.blockOpacityScale ?? 1) * (0.035 + intensity * 0.12 + audio.mids * 0.1 + eventBurst * 0.14 + profile.blocks * 0.035 + fractureLift * 0.08);
    for (let i = 0; i < activeCount; i += 1) {
      const block = blockSeeds[(i + Math.floor(time * 7 * bpmScale + sectionEnergy * 17)) % blockSeeds.length];
      if (shapeMode === 'shards' && block.shape > 0.46) continue;
      if (shapeMode === 'bars' && (block.shape < 0.32 || block.shape > 0.8)) continue;
      if (shapeMode === 'soft' && block.shape < 0.56) continue;
      const phase = block.phase + time * profile.timeScale * bpmScale * (0.45 + block.amp * 0.7);
      const sx = Math.floor(block.x * sourceCanvas.width);
      const sy = Math.floor(block.y * sourceCanvas.height);
      const sw = Math.max(2, Math.floor(block.w * sourceCanvas.width));
      const sh = Math.max(2, Math.floor(block.h * sourceCanvas.height));
      const x = Math.min(protectStart - blockScale * 0.5, block.x * w + Math.sin(phase) * blockScale * block.amp);
      const y = block.y * h + Math.cos(phase * 0.83) * blockScale * 0.42;
      const softScale = block.shape > 0.68 ? 1.18 : 1;
      const width = sw * (w / sourceCanvas.width) * (0.72 + sectionEnergy * 0.52 + fractureLift * 0.18) * softScale;
      const height = sh * (h / sourceCanvas.height) * (0.72 + audio.highs * 0.56 + fractureLift * 0.14) * softScale;
      feedbackCtx.filter = block.shape > 0.68 || shapeMode === 'soft' ? 'blur(0.6px)' : 'none';
      feedbackCtx.drawImage(sourceCanvas, sx, sy, sw, sh, x, y, width, height);
    }
    feedbackCtx.filter = 'none';
    feedbackCtx.restore();
  }

  function drawChannelPass(intensity: number, profile: SectionProfile) {
    const offset = config.channelOffset * profile.channel * (0.25 + intensity + audio.highs * 1.2 + audio.transient * 1.4 + eventBurst);
    if (offset < 0.25) return;

    feedbackCtx.save();
    feedbackCtx.globalCompositeOperation = 'screen';
    feedbackCtx.globalAlpha = 0.06 + intensity * 0.1 + audio.highs * 0.12 + eventBurst * 0.1 + profile.channel * 0.04;
    feedbackCtx.filter = 'hue-rotate(-18deg) saturate(140%)';
    feedbackCtx.drawImage(sourceCanvas, offset, Math.sin(time * 1.9 * bpmScale) * offset * 0.22, w, h);
    feedbackCtx.filter = 'hue-rotate(22deg) saturate(130%)';
    feedbackCtx.drawImage(sourceCanvas, -offset * 0.76, Math.cos(time * 1.4 * bpmScale) * offset * 0.18, w, h);
    feedbackCtx.filter = 'none';

    // Treble-driven micro shimmer: fine brightness noise on the surface
    // Only fires when highs are elevated — creates that "shimmering texture" look.
    const shimmerStrength = audio.highs * 0.6 + audio.transient * 0.3;
    if (shimmerStrength > 0.12) {
      const shimmerAlpha = shimmerStrength * 0.06 * profile.channel;
      feedbackCtx.globalCompositeOperation = 'overlay';
      feedbackCtx.globalAlpha = shimmerAlpha;
      const micro = 3 + Math.floor(Math.random() * 5);
      for (let m = 0; m < micro; m += 1) {
        const mx = Math.random() * w;
        const my = Math.random() * h;
        const mw = 4 + Math.random() * 18;
        const mh = 1 + Math.random() * 2;
        feedbackCtx.drawImage(sourceCanvas,
          Math.random() * (sourceCanvas.width - mw), Math.random() * (sourceCanvas.height - mh), mw, mh,
          mx, my, mw, mh);
      }
    }

    feedbackCtx.restore();
  }

  function getAutomaticMoshAmount(pass: MoshPassName, baseIntensity: number, profile: SectionProfile): number {
    if (!passEnabled(pass)) return 0;

    const corruption = config.corruptionIntensity ?? config.effectIntensity ?? 0.36;
    const beat = config.beatSensitivity ?? 1;
    const playing = clamp01(audio.playing ?? 0);
    const idleMotion = config.idleMotionAmount ?? 0.46;
    const idle = clamp01(1 - playing);
    const sectionNumber = sectionCueCount + 1;
    const fractureBaseline = clamp01(config.fractureBaseline ?? 0);
    const earlyFractureVector = fractureBaseline > 0 && pass === 'vectorWarp';
    if (sectionNumber <= 2 && pass !== 'feedback' && pass !== 'ghost' && pass !== 'freeze' && !earlyFractureVector) return 0;
    const normalizedSection = clamp01(roleProgress || (sectionNumber - 1) / Math.max(sectionCountEstimate - 1, 1));
    const intro = 1 - smoothstep((normalizedSection - 0.06) / 0.22);
    const build = smoothstep((normalizedSection - 0.18) / 0.34) * (1 - smoothstep((normalizedSection - 0.58) / 0.26));
    const peak = smoothstep((normalizedSection - 0.48) / 0.24) * (1 - smoothstep((normalizedSection - 0.84) / 0.18));
    const afterglow = smoothstep((normalizedSection - 0.7) / 0.2);
    const livingPulse = 0.5 + Math.sin(time * 0.43 * bpmScale + moshProfile.phase + sectionSeed * 0.00003) * 0.5;
    const slowFault = 0.5 + Math.sin(time * 0.11 * bpmScale + moshProfile.phase * 1.7) * 0.5;
    // Use bassTransient instead of raw bass so the mosh director responds to
    // rhythmic hits rather than sustained bass energy.
    const musicalDrive = audio.energy * 0.42 + audio.bass * 0.14 + bassTransient * 0.2 + audio.mids * 0.18 + audio.highs * 0.12 + audio.transient * 0.46 * beat;
    const idleDrive = idle * idleMotion * (0.34 + slowFault * 0.38);
    const cueDrive = eventBurst * (0.46 + beat * 0.2) + sectionEnergy * 0.18;
    const base = corruption * (0.18 + baseIntensity * 0.38 + musicalDrive + idleDrive + cueDrive);
    let sectionShape = 0.45;
    let weight = 1;

    if (pass === 'feedback') {
      weight = moshProfile.feedback;
      sectionShape = 0.7 + intro * 0.28 + afterglow * 0.32 + peak * 0.12;
    } else if (pass === 'smear') {
      weight = moshProfile.smear;
      sectionShape = 0.36 + build * 0.34 + peak * 0.3 + afterglow * 0.38;
    } else if (pass === 'blocks') {
      weight = moshProfile.blocks;
      sectionShape = 0.18 + build * 0.34 + peak * 0.72 + eventBurst * 0.2;
    } else if (pass === 'scanTear') {
      weight = moshProfile.scanTear;
      sectionShape = 0.24 + build * 0.42 + peak * 0.44 + audio.transient * beat * 0.22;
    } else if (pass === 'channelLag') {
      weight = moshProfile.channelLag;
      sectionShape = 0.34 + intro * 0.18 + build * 0.18 + afterglow * 0.22 + profile.channel * 0.24;
    } else if (pass === 'ghost') {
      weight = moshProfile.ghost;
      sectionShape = 0.26 + intro * 0.56 + build * 0.26 + afterglow * 0.72 + peak * 0.16;
    } else if (pass === 'freeze') {
      weight = moshProfile.freeze;
      sectionShape = 0.06 + intro * 0.48 + peak * 0.66 + eventBurst * 0.2;
    } else if (pass === 'compression') {
      weight = moshProfile.compression;
      sectionShape = 0.28 + intro * 0.2 + build * 0.22 + peak * 0.54;
    } else if (pass === 'sync') {
      weight = moshProfile.sync;
      sectionShape = 0.1 + build * 0.28 + peak * 0.74 + audio.transient * beat * 0.2;
    } else if (pass === 'drift') {
      weight = moshProfile.drift;
      sectionShape = 0.3 + build * 0.34 + peak * 0.22 + afterglow * 0.78 + leftFlowCoverage * 0.18 + stormPresence * 0.16;
    } else if (pass === 'vectorWarp') {
      weight = moshProfile.vectorWarp;
      sectionShape = 0.16 + build * 0.28 + peak * 0.46 + fracturePresence * 0.26 + handoffPressure * 0.18 + profile.displacement * 0.18;
    } else if (pass === 'pixelSort') {
      // Config-weighted (opt-in per tuning preset, no director redistribution).
      weight = config.pixelSortStrength ?? 0;
      sectionShape = 0.2 + build * 0.4 + peak * 0.5 + audio.transient * beat * 0.24;
    } else if (pass === 'slitScan') {
      weight = config.slitScanStrength ?? 0;
      sectionShape = 0.24 + build * 0.46 + peak * 0.4 + afterglow * 0.2;
    } else if (pass === 'ditherDrift') {
      weight = config.ditherAmount ?? 0;
      sectionShape = 0.3 + build * 0.26 + afterglow * 0.42 + profile.feedback * 0.2;
    }

    let amount = clamp01(base * weight * sectionShape * (0.72 + livingPulse * 0.28));
    if (earlyFractureVector && sectionNumber <= 2) {
      amount = Math.max(amount, fractureBaseline * (0.18 + profile.displacement * 0.12));
    }
    if (sectionNumber >= 7) {
      if (pass === 'scanTear' || pass === 'channelLag' || pass === 'compression' || pass === 'sync') amount *= 0.12;
      if (pass === 'vectorWarp') amount *= 0.3;
      if (pass === 'ghost' || pass === 'drift') amount = Math.min(1, amount * 1.32);
    }
    return amount;
  }

  function sectionMaskAllows(mask: readonly number[] | undefined): boolean {
    if (!mask?.length) return true;
    const sectionNumber = sectionCueCount + 1;
    return mask.includes(sectionNumber);
  }

  function drawTemporalSmearPass(amount: number, protectStart: number) {
    if (amount <= 0.004) return;
    const persistence = config.smearPersistence ?? 0.52;
    const offsetX = (Math.sin(time * 0.34 * bpmScale + moshProfile.phase) * 18 + leftFlowCoverage * 18 - stormPresence * 8) * amount;
    const offsetY = (Math.cos(time * 0.27 * bpmScale + moshProfile.phase * 0.7) * 10 + stormPresence * 14) * amount;

    feedbackCtx.save();
    feedbackCtx.globalCompositeOperation = imageFailed ? 'lighter' : 'screen';
    feedbackCtx.globalAlpha = Math.min(0.2, amount * (0.05 + persistence * 0.16));
    feedbackCtx.filter = `blur(${(0.4 + amount * 1.6).toFixed(2)}px)`;
    feedbackCtx.drawImage(previousFrameCanvas, offsetX, offsetY, protectStart, h);
    feedbackCtx.drawImage(previousFrameCanvas, -offsetX * 0.56, -offsetY * 0.38, protectStart, h);
    feedbackCtx.filter = 'none';
    feedbackCtx.restore();
  }

  function drawDirectionalDriftPass(amount: number, protectStart: number) {
    if (amount <= 0.004) return;
    const rows = Math.max(8, Math.round(12 + amount * 24));
    const rowHeight = Math.max(2, Math.ceil(h / rows));
    const flowBias = leftFlowCoverage * 0.72 - stormPresence * 0.18 + Math.sin(time * 0.18 * bpmScale + moshProfile.phase) * 0.22;

    feedbackCtx.save();
    feedbackCtx.globalCompositeOperation = 'screen';
    feedbackCtx.globalAlpha = Math.min(0.16, 0.025 + amount * 0.14);
    for (let index = 0; index < rows; index += 1) {
      const y = index * rowHeight;
      const depth = index / Math.max(rows - 1, 1);
      const wave = Math.sin(time * (0.28 + depth * 0.18) + depth * 8.2 + moshProfile.phase);
      const drift = (flowBias * 34 + wave * 22 + audio.bass * 20) * amount;
      feedbackCtx.drawImage(previousFrameCanvas, 0, y, protectStart, rowHeight + 2, drift, y, protectStart, rowHeight + 2);
    }
    feedbackCtx.restore();
  }

  function drawScanlineTearPass(amount: number, protectStart: number) {
    if (amount <= 0.006) return;
    const tearCount = Math.max(2, Math.round(2 + amount * 12 + eventBurst * 6));
    const maxHeight = Math.max(2, h * (0.008 + amount * 0.028));

    feedbackCtx.save();
    feedbackCtx.globalCompositeOperation = 'source-over';
    feedbackCtx.globalAlpha = Math.min(0.82, 0.22 + amount * 0.58);
    for (let index = 0; index < tearCount; index += 1) {
      const seedPhase = sectionSeed * 0.0001 + index * 2.19 + moshProfile.phase;
      const y = Math.floor(((Math.sin(time * (0.48 + index * 0.07) + seedPhase) * 0.5 + 0.5) * h + index * h / tearCount) % h);
      const height = Math.max(1, Math.round(maxHeight * (0.35 + seededUnit(seedPhase) * 0.9)));
      const xShift = (Math.sin(seedPhase + time * 0.72) * 0.55 + Math.cos(seedPhase * 0.7) * 0.45)
        * config.displacement
        * amount
        * (0.35 + audio.transient + eventBurst * 0.4);
      feedbackCtx.drawImage(previousFrameCanvas, 0, y, protectStart, height, xShift, y, protectStart, height);
    }
    feedbackCtx.restore();
  }

  function drawChannelLagPass(amount: number, protectStart: number) {
    if (amount <= 0.005) return;
    const offset = Math.max(1, config.channelOffset * (0.6 + amount * 5 + audio.highs * 2));

    feedbackCtx.save();
    feedbackCtx.globalCompositeOperation = 'screen';
    feedbackCtx.globalAlpha = Math.min(0.18, 0.028 + amount * 0.14);
    feedbackCtx.filter = 'hue-rotate(-38deg) saturate(165%)';
    feedbackCtx.drawImage(previousFrameCanvas, offset, Math.sin(time * 1.1) * offset * 0.2, protectStart, h);
    feedbackCtx.filter = 'hue-rotate(34deg) saturate(150%)';
    feedbackCtx.drawImage(previousFrameCanvas, -offset * 0.72, Math.cos(time * 0.9) * offset * 0.18, protectStart, h);
    feedbackCtx.filter = 'none';
    feedbackCtx.restore();
  }

  function drawDifferenceGhostPass(amount: number, protectStart: number) {
    if (amount <= 0.005) return;
    const smear = config.smearPersistence ?? 0.52;
    const x = Math.sin(time * 0.22 + moshProfile.phase) * 10 * amount;
    const y = Math.cos(time * 0.2 + moshProfile.phase) * 7 * amount;

    feedbackCtx.save();
    feedbackCtx.globalCompositeOperation = 'difference';
    feedbackCtx.globalAlpha = Math.min(0.18, amount * (0.035 + smear * 0.16));
    feedbackCtx.drawImage(previousFrameCanvas, x, y, protectStart, h);
    feedbackCtx.globalCompositeOperation = 'screen';
    feedbackCtx.globalAlpha = Math.min(0.12, amount * 0.08);
    feedbackCtx.drawImage(stableCanvas, -x * 0.4, -y * 0.4, w, h);
    feedbackCtx.restore();
  }

  function drawPartialFreezePass(amount: number, protectStart: number) {
    if (amount <= 0.005 || freezeHold <= 0.001 || freezeW <= 2 || freezeH <= 2) return;

    feedbackCtx.save();
    feedbackCtx.globalCompositeOperation = 'source-over';
    feedbackCtx.globalAlpha = Math.min(0.9, 0.26 + amount * 0.62 + freezeHold * 0.18);
    feedbackCtx.drawImage(freezeCanvas, freezeX, freezeY, freezeW, freezeH, freezeX, freezeY, freezeW, freezeH);
    feedbackCtx.globalCompositeOperation = 'screen';
    feedbackCtx.globalAlpha = Math.min(0.16, amount * 0.12);
    feedbackCtx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, freezeX, freezeY, Math.min(freezeW, protectStart - freezeX), freezeH);
    feedbackCtx.restore();
  }

  function drawLowResCompressionPass(amount: number, protectStart: number) {
    if (amount <= 0.004 || !compressionCanvas.width || !compressionCanvas.height) return;
    const compressionAmount = Math.min(0.88, amount * (0.42 + (moshProfile.compression - 0.5) * 0.16));
    if (compressionAmount <= 0.003) return;

    compressionCtx.save();
    compressionCtx.imageSmoothingEnabled = false;
    compressionCtx.clearRect(0, 0, compressionCanvas.width, compressionCanvas.height);
    compressionCtx.drawImage(feedbackCanvas, 0, 0, protectStart, h, 0, 0, compressionCanvas.width, compressionCanvas.height);
    compressionCtx.restore();

    feedbackCtx.save();
    feedbackCtx.imageSmoothingEnabled = false;
    feedbackCtx.globalCompositeOperation = imageFailed ? 'lighter' : 'source-over';
    feedbackCtx.globalAlpha = Math.min(0.38, 0.045 + compressionAmount * 0.32);
    feedbackCtx.drawImage(compressionCanvas, 0, 0, compressionCanvas.width, compressionCanvas.height, 0, 0, protectStart, h);
    feedbackCtx.imageSmoothingEnabled = true;
    feedbackCtx.restore();
  }

  function drawHorizontalSyncPass(amount: number, protectStart: number) {
    const sectionNumber = sectionCueCount + 1;
    const phaseCap = sectionNumber >= 5 && sectionNumber <= 6 ? 0.94 : sectionNumber >= 3 && sectionNumber <= 4 ? 0.42 : 0.16;
    amount = Math.min(amount, Math.max(phaseCap, config.horizontalSyncCap ?? 0.18));
    if (amount <= 0.006) return;
    const peak = sectionNumber >= 5 && sectionNumber <= 6;
    const bands = peak ? Math.round(12 + amount * 8) : Math.round(4 + amount * 9);
    const bandHeight = peak ? Math.round(8 + amount * 12) : Math.round(2 + amount * 5);

    feedbackCtx.save();
    feedbackCtx.globalCompositeOperation = 'source-over';
    feedbackCtx.globalAlpha = Math.min(0.72, 0.18 + amount * 0.5);
    for (let index = 0; index < bands; index += 1) {
      const phase = moshProfile.phase + sectionSeed * 0.00017 + index * 1.81;
      const y = Math.floor(((index / bands + seededUnit(phase) * 0.08 + Math.sin(time * 0.24 + phase) * 0.035) % 1) * h);
      const widthClip = protectStart * (0.55 + seededUnit(phase * 1.9) * 0.45);
      const shift = (Math.sin(time * (0.7 + index * 0.03) + phase) * 0.72 + Math.cos(phase) * 0.28)
        * w
        * (0.012 + amount * 0.065);
      feedbackCtx.drawImage(previousFrameCanvas, 0, y, widthClip, bandHeight, shift, y, widthClip, bandHeight);
    }
    feedbackCtx.restore();
  }

  function drawVectorWarpPass(amount: number, protectStart: number, profile: SectionProfile) {
    const strength = config.vectorWarpStrength ?? 0;
    const earlyFracture = (config.fractureBaseline ?? 0) > 0 && sectionCueCount < 2;
    if (strength <= 0.001 || amount <= 0.005 || (!earlyFracture && !sectionMaskAllows(config.vectorWarpSectionMask))) return;

    const scale = Math.max(0.18, config.vectorWarpScale ?? 0.52);
    const curl = Math.max(0.05, config.vectorWarpCurl ?? 0.58);
    const active = clamp01(
      amount
      * strength
      * (0.72 + profile.displacement * 0.42 + params.turbulence * 0.28 + audio.energy * 0.32 + eventBurst * 0.26),
    );
    if (active <= 0.004) return;

    const widthClip = Math.max(1, Math.min(protectStart, w));
    const bandCount = Math.max(5, Math.round(7 + active * 20));
    const bandHeight = Math.max(3, Math.round(h / (bandCount * (1.6 - Math.min(active, 0.72) * 0.28))));
    const pullCount = Math.max(2, Math.round(3 + active * 9 + audio.transient * 4));
    const basePhase = moshProfile.phase + sectionSeed * 0.00019;

    feedbackCtx.save();
    feedbackCtx.globalCompositeOperation = imageFailed ? 'lighter' : 'screen';
    feedbackCtx.globalAlpha = Math.min(0.34, 0.035 + active * 0.22);
    feedbackCtx.filter = `saturate(${112 + active * 56}%)`;

    for (let index = 0; index < bandCount; index += 1) {
      const depth = index / Math.max(bandCount - 1, 1);
      const phase = basePhase + index * 1.47;
      const y = Math.floor(((depth + Math.sin(time * (0.17 + depth * 0.16) + phase) * 0.032 + 1) % 1) * h);
      const curve = Math.sin(time * (0.36 + curl * 0.24) + phase) * 0.58
        + Math.cos(time * 0.21 + depth * 7.2 + basePhase) * 0.42;
      const sourceX = Math.max(0, Math.min(widthClip - 1, curve * widthClip * 0.026 * active));
      const sourceWidth = Math.max(1, widthClip - Math.abs(sourceX));
      const shift = curve
        * config.displacement
        * active
        * (0.22 + scale * 0.72 + audio.bass * 0.24)
        + Math.sin(depth * Math.PI * 2 + time * 0.44) * widthClip * 0.01 * curl * active;
      const stretch = 1 + Math.sin(phase + time * 0.23) * 0.035 * active;

      feedbackCtx.drawImage(
        previousFrameCanvas,
        sourceX,
        y,
        sourceWidth,
        bandHeight,
        Math.max(-widthClip * 0.08, shift),
        y + Math.sin(phase) * bandHeight * 0.36 * active,
        Math.min(widthClip * 1.08, sourceWidth * stretch),
        bandHeight + 1,
      );
    }

    feedbackCtx.globalCompositeOperation = 'source-over';
    feedbackCtx.globalAlpha = Math.min(0.42, 0.04 + active * 0.28);
    for (let index = 0; index < pullCount; index += 1) {
      const phase = basePhase + index * 2.31;
      const localSeed = seededUnit(phase * 3.17);
      const radius = Math.max(18, Math.min(widthClip, h) * (0.035 + localSeed * 0.075 + active * 0.035));
      const cx = widthClip * (0.08 + seededUnit(phase) * 0.78);
      const cy = h * (0.08 + seededUnit(phase * 1.43) * 0.84);
      const wobbleX = Math.sin(time * (0.28 + localSeed * 0.22) + phase) * radius * curl * active;
      const wobbleY = Math.cos(time * (0.24 + localSeed * 0.2) + phase * 0.7) * radius * curl * active;
      const sx = Math.max(0, Math.min(sourceCanvas.width - 2, Math.floor((cx / Math.max(widthClip, 1)) * sourceCanvas.width - radius * 0.5)));
      const sy = Math.max(0, Math.min(sourceCanvas.height - 2, Math.floor((cy / Math.max(h, 1)) * sourceCanvas.height - radius * 0.5)));
      const sw = Math.max(2, Math.min(sourceCanvas.width - sx, Math.floor(radius * (1.15 + active * 0.7))));
      const sh = Math.max(2, Math.min(sourceCanvas.height - sy, Math.floor(radius * (0.72 + localSeed * 0.8))));
      const dx = Math.max(-radius, Math.min(widthClip - radius * 0.3, cx + wobbleX - radius * 0.5));
      const dy = Math.max(-radius, Math.min(h - radius * 0.3, cy + wobbleY - radius * 0.5));

      feedbackCtx.drawImage(
        sourceCanvas,
        sx,
        sy,
        sw,
        sh,
        dx,
        dy,
        Math.min(widthClip - dx, radius * (1.16 + active * 0.44)),
        radius * (0.8 + localSeed * 0.7),
      );
    }

    feedbackCtx.filter = 'none';
    feedbackCtx.restore();
  }

  function drawPixelSortPass(amount: number, protectStart: number) {
    if (amount <= 0.01) return;

    const threshold = config.pixelSortThreshold ?? 0.5;
    const decaySeconds = (config.pixelSortDecayMs ?? 2400) / 1000;
    const trigger = Math.max(audio.bassOnset ?? 0, bassTransient);
    if (trigger > threshold && time - lastPixelSortTime > decaySeconds * 0.45) {
      lastPixelSortTime = time;
      const bandCount = Math.max(1, Math.min(4, Math.round((config.pixelSortBandCount ?? 3) * (0.5 + trigger * 0.7))));
      for (let band = 0; band < bandCount; band += 1) {
        const bandHeight = Math.max(3, Math.round(sourceCanvas.height * (0.02 + seededUnit(time * 3.1 + band) * 0.05)));
        const y = Math.floor(seededUnit(time * 7.7 + band * 2.3) * Math.max(1, sourceCanvas.height - bandHeight));
        pendingSortBands.push({ y, height: bandHeight });
      }
      while (pendingSortBands.length > 6) pendingSortBands.shift();
    }

    // Amortize: sort at most one queued band per frame.
    const next = pendingSortBands.shift();
    if (next) {
      sortSourceBand(next.y, next.height);
      sortedBands.push({ y: next.y, height: next.height, age: 0 });
      while (sortedBands.length > 10) sortedBands.shift();
    }

    // Surface recently sorted bands at full canvas scale, gliding in and out.
    if (!sortedBands.length) return;
    const scaleY = h / Math.max(1, sourceCanvas.height);
    feedbackCtx.save();
    feedbackCtx.globalCompositeOperation = imageFailed ? 'lighter' : 'source-over';
    for (const band of sortedBands) {
      const fadeIn = smoothstep(Math.min(1, band.age / 0.25));
      const fadeOut = smoothstep(Math.max(0, 1 - band.age / decaySeconds));
      const fade = fadeIn * fadeOut;
      if (fade <= 0.01) continue;
      feedbackCtx.globalAlpha = Math.min(0.55, amount * fade * 0.7);
      feedbackCtx.drawImage(
        sourceCanvas,
        0, band.y, sourceCanvas.width, band.height,
        0, band.y * scaleY, protectStart, band.height * scaleY,
      );
    }
    feedbackCtx.restore();
  }

  function sortSourceBand(y: number, bandHeight: number): void {
    let imageData: ImageData;
    try {
      imageData = sourceCtx.getImageData(0, y, sourceCanvas.width, bandHeight);
    } catch {
      return; // tainted canvas (CORS) — skip silently
    }
    const data = imageData.data;
    const rowWidth = sourceCanvas.width;
    for (let row = 0; row < bandHeight; row += 1) {
      const rowStart = row * rowWidth * 4;
      let runStart = 0;
      let x = 0;
      // Sort luminance runs broken at bright pixels so edges survive.
      const flushRun = (endX: number) => {
        const length = endX - runStart;
        if (length < 6) return;
        const pixels: [number, number, number, number, number][] = [];
        for (let px = runStart; px < endX; px += 1) {
          const offset = rowStart + px * 4;
          const luma = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
          pixels.push([luma, data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]);
        }
        pixels.sort((a, b) => a[0] - b[0]);
        for (let px = 0; px < pixels.length; px += 1) {
          const offset = rowStart + (runStart + px) * 4;
          data[offset] = pixels[px][1];
          data[offset + 1] = pixels[px][2];
          data[offset + 2] = pixels[px][3];
          data[offset + 3] = pixels[px][4];
        }
      };
      for (x = 0; x < rowWidth; x += 1) {
        const offset = rowStart + x * 4;
        const luma = (data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114) / 255;
        if (luma > 0.82) {
          flushRun(x);
          runStart = x + 1;
        }
      }
      flushRun(rowWidth);
    }
    sourceCtx.putImageData(imageData, 0, y);
  }

  function drawSlitScanPass(amount: number, protectStart: number) {
    if (amount <= 0.008) return;
    const depth = Math.max(4, Math.min(16, config.slitScanDepth ?? 10));

    if (!slitScanRing.length) {
      // Lazy allocation — only tracks whose tuning enables slit scan pay for it.
      for (let index = 0; index < depth; index += 1) {
        const snapshot = document.createElement('canvas');
        snapshot.width = Math.max(2, Math.floor(w / 4));
        snapshot.height = Math.max(2, Math.floor(h / 4));
        slitScanRing.push(snapshot);
      }
      slitScanHead = 0;
      slitScanFilled = 0;
    }

    const pushInterval = config.slitScanRate ?? 0.09;
    if (time - lastSlitScanPush >= pushInterval) {
      lastSlitScanPush = time;
      const snapshot = slitScanRing[slitScanHead];
      const snapCtx = snapshot.getContext('2d');
      if (snapCtx) {
        snapCtx.clearRect(0, 0, snapshot.width, snapshot.height);
        snapCtx.drawImage(feedbackCanvas, 0, 0, snapshot.width, snapshot.height);
      }
      slitScanHead = (slitScanHead + 1) % slitScanRing.length;
      slitScanFilled = Math.min(slitScanFilled + 1, slitScanRing.length);
    }
    if (slitScanFilled < 2) return;

    const bands = Math.max(6, Math.min(28, config.slitScanBands ?? 16));
    const vertical = (config.slitScanAxis ?? 'horizontal') === 'vertical';
    const baseAlpha = Math.min(0.4, 0.06 + amount * 0.3);
    // Continuous time displacement: each band samples a fixed delay behind
    // "now". Ring age advances smoothly between pushes, so crossfading the two
    // adjacent snapshots eliminates the per-push content jump.
    const ageOffset = time - lastSlitScanPush;
    const reachSeconds = (slitScanFilled - 2) * pushInterval * Math.min(1, amount * 1.6);

    feedbackCtx.save();
    feedbackCtx.globalCompositeOperation = 'source-over';
    for (let band = 0; band < bands; band += 1) {
      const progress = band / Math.max(1, bands - 1);
      const delaySeconds = progress * reachSeconds;
      const backFloat = Math.max(0, Math.min(slitScanFilled - 2, (delaySeconds + ageOffset) / pushInterval - 1));
      const back0 = Math.floor(backFloat);
      const frac = backFloat - back0;
      for (let tap = 0; tap < 2; tap += 1) {
        const weight = tap === 0 ? 1 - frac : frac;
        if (weight <= 0.02) continue;
        const back = Math.min(slitScanFilled - 1, back0 + tap);
        const ringIndex = ((slitScanHead - 1 - back) % slitScanRing.length + slitScanRing.length) % slitScanRing.length;
        const snapshot = slitScanRing[ringIndex];
        feedbackCtx.globalAlpha = baseAlpha * weight;
        if (vertical) {
          const sx = Math.floor(progress * snapshot.width);
          const sw = Math.max(1, Math.ceil(snapshot.width / bands));
          const dx = progress * protectStart;
          feedbackCtx.drawImage(snapshot, sx, 0, sw, snapshot.height, dx, 0, Math.ceil(protectStart / bands) + 1, h);
        } else {
          const sy = Math.floor(progress * snapshot.height);
          const sh = Math.max(1, Math.ceil(snapshot.height / bands));
          const dy = progress * h;
          feedbackCtx.drawImage(snapshot, 0, sy, snapshot.width, sh, 0, dy, protectStart, Math.ceil(h / bands) + 1);
        }
      }
    }
    feedbackCtx.restore();
  }

  function drawDitherDriftPass(amount: number, protectStart: number) {
    if (amount <= 0.01) return;
    frameParity = (frameParity + 1) % 3;
    if (!ditherCanvas) {
      ditherCanvas = document.createElement('canvas');
      ditherCanvas.width = sourceCanvas.width;
      ditherCanvas.height = sourceCanvas.height;
      ditherCtx = ditherCanvas.getContext('2d');
    }
    if (!ditherCtx || !ditherCanvas) return;

    // Re-dither every third frame; the cached result still composites every frame.
    if (frameParity === 0) {
      ditherPhase += (config.ditherDriftSpeed ?? 0.4) * 0.06;
      ditherCtx.clearRect(0, 0, ditherCanvas.width, ditherCanvas.height);
      ditherCtx.drawImage(sourceCanvas, 0, 0);
      let imageData: ImageData;
      try {
        imageData = ditherCtx.getImageData(0, 0, ditherCanvas.width, ditherCanvas.height);
      } catch {
        return;
      }
      const data = imageData.data;
      const levels = Math.max(3, Math.min(10, config.ditherLevels ?? 6));
      const stepSize = 255 / (levels - 1);
      const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      const drift = Math.floor(ditherPhase) % 4;
      const width = ditherCanvas.width;
      for (let index = 0; index < data.length; index += 4) {
        const px = (index / 4) % width;
        const py = Math.floor(index / 4 / width);
        const bayerThreshold = (bayer[(((py + drift) % 4) * 4) + ((px + drift) % 4)] / 16 - 0.5) * stepSize;
        data[index] = Math.round(Math.max(0, Math.min(255, data[index] + bayerThreshold)) / stepSize) * stepSize;
        data[index + 1] = Math.round(Math.max(0, Math.min(255, data[index + 1] + bayerThreshold)) / stepSize) * stepSize;
        data[index + 2] = Math.round(Math.max(0, Math.min(255, data[index + 2] + bayerThreshold)) / stepSize) * stepSize;
      }
      ditherCtx.putImageData(imageData, 0, 0);
    }

    feedbackCtx.save();
    feedbackCtx.globalCompositeOperation = imageFailed ? 'lighter' : 'source-over';
    feedbackCtx.globalAlpha = Math.min(0.3, 0.04 + amount * 0.24);
    feedbackCtx.imageSmoothingEnabled = false;
    feedbackCtx.drawImage(ditherCanvas, 0, 0, ditherCanvas.width, ditherCanvas.height, 0, 0, protectStart, h);
    feedbackCtx.imageSmoothingEnabled = true;
    feedbackCtx.restore();
  }

  function drawAutomaticMoshPasses(intensity: number, protectStart: number, profile: SectionProfile) {
    const feedbackAmount = getAutomaticMoshAmount('feedback', intensity, profile) * (config.feedbackAmount ?? 1);
    const smearAmount = getAutomaticMoshAmount('smear', intensity, profile);
    const driftAmount = getAutomaticMoshAmount('drift', intensity, profile);
    const scanAmount = getAutomaticMoshAmount('scanTear', intensity, profile);
    const channelAmount = getAutomaticMoshAmount('channelLag', intensity, profile);
    const ghostAmount = getAutomaticMoshAmount('ghost', intensity, profile);
    const freezeAmount = getAutomaticMoshAmount('freeze', intensity, profile);
    const compressionAmount = getAutomaticMoshAmount('compression', intensity, profile);
    const syncAmount = getAutomaticMoshAmount('sync', intensity, profile);
    const vectorWarpAmount = getAutomaticMoshAmount('vectorWarp', intensity, profile);

    if (feedbackAmount > 0.006) {
      feedbackCtx.save();
      feedbackCtx.globalCompositeOperation = 'screen';
      feedbackCtx.globalAlpha = Math.min(0.1, feedbackAmount * 0.07);
      feedbackCtx.drawImage(previousFrameCanvas, 0, 0, protectStart, h);
      feedbackCtx.restore();
    }

    drawTemporalSmearPass(smearAmount, protectStart);
    drawDirectionalDriftPass(driftAmount, protectStart);
    drawVectorWarpPass(vectorWarpAmount, protectStart, profile);
    drawScanlineTearPass(scanAmount, protectStart);
    drawHorizontalSyncPass(syncAmount, protectStart);
    drawChannelLagPass(channelAmount, protectStart);
    drawDifferenceGhostPass(ghostAmount, protectStart);
    drawSlitScanPass(getAutomaticMoshAmount('slitScan', intensity, profile), protectStart);
    drawPixelSortPass(getAutomaticMoshAmount('pixelSort', intensity, profile), protectStart);
    drawDitherDriftPass(getAutomaticMoshAmount('ditherDrift', intensity, profile), protectStart);
  }

  function sectionEffectAmount(startSection: number, endSection: number, localLead = 0.18): number {
    const sectionNumber = sectionCueCount + 1;
    if (sectionNumber < startSection || sectionNumber > endSection) return 0;
    const span = Math.max(1, endSection - startSection + 1);
    const stage = (sectionNumber - startSection + sectionProgress) / span;
    return smoothstep(stage + localLead);
  }

  function drawMoshWavePass(intensity: number, protectStart: number, profile: SectionProfile) {
    const effect = config.effectIntensity ?? 0;
    if (effect <= 0.001 || sectionCueCount < 2) return;

    const sectionNumber = sectionCueCount + 1;
    const waveStrength = effect
      * (0.25 + profile.displacement * 0.75)
      * (sectionNumber >= 2 && sectionNumber <= 6 ? 1 : 0.48)
      * (0.58 + intensity * 0.42 + eventBurst * 0.22);
    if (waveStrength <= 0.01) return;

    const speed = config.moshWaveSpeed ?? 0.55;
    const widthRatio = Math.max(0.08, config.moshWaveWidth ?? 0.22);
    const vertical = (sectionSeed & 2) === 2;
    const travel = clamp01(sectionProgress * (0.72 + speed * 0.82) + sectionEffectAmount(2, 4, 0) * 0.12);
    const center = travel * (vertical ? h : protectStart);
    const widthPx = Math.max(24, (vertical ? h : protectStart) * widthRatio);
    const strips = vertical ? 18 : 24;

    feedbackCtx.save();
    feedbackCtx.globalCompositeOperation = imageFailed ? 'lighter' : 'screen';
    feedbackCtx.globalAlpha = 0.045 + waveStrength * 0.14;

    for (let i = 0; i < strips; i += 1) {
      const progress = i / Math.max(strips - 1, 1);
      const position = progress * (vertical ? h : protectStart);
      const distance = Math.abs(position - center) / widthPx;
      const band = smoothstep(1 - distance);
      if (band <= 0.002) continue;

      const seedPhase = sectionSeed * 0.00013 + i * 1.37;
      const shove = (Math.sin(seedPhase + sectionAge * 0.58) * 0.6 + Math.cos(seedPhase * 0.7) * 0.4)
        * config.displacement
        * waveStrength
        * band;

      if (vertical) {
        const sy = Math.floor(progress * sourceCanvas.height);
        const sh = Math.max(1, Math.ceil(sourceCanvas.height / strips + 2));
        const dy = position + Math.sin(seedPhase) * band * 10;
        feedbackCtx.drawImage(sourceCanvas, 0, sy, sourceCanvas.width, sh, shove, dy, protectStart, Math.ceil(sh * (h / sourceCanvas.height)) + 2);
      } else {
        const sx = Math.floor(progress * sourceCanvas.width);
        const sw = Math.max(1, Math.ceil(sourceCanvas.width / strips + 2));
        const dx = Math.min(protectStart - 1, position + shove);
        feedbackCtx.drawImage(sourceCanvas, sx, 0, sw, sourceCanvas.height, dx, Math.sin(seedPhase) * band * 12, Math.ceil(sw * (w / sourceCanvas.width)) + 2, h);
      }
    }

    feedbackCtx.restore();
  }

  function drawPixelIslandPass(ctx: CanvasRenderingContext2D, protectStart: number, profile: SectionProfile) {
    const effect = config.effectIntensity ?? 0;
    const fractureBaseline = clamp01(config.fractureBaseline ?? 0);
    if (!pixelIslands.length || effect <= 0.001 || (sectionCueCount < 1 && fractureBaseline <= 0)) return;

    const sectionNumber = sectionCueCount + 1;
    const detach = Math.max(
      fracturePresence,
      fractureBaseline,
      sectionNumber < 5
        ? sectionEffectAmount(2, 4, -0.04)
        : Math.max(0.18, 1 - smoothstep((sectionAge - 1.4) / Math.max(4, sectionDurationEstimate * 0.42))),
    );
    const settleBase = sectionNumber >= 5
      ? smoothstep(sectionAge / Math.max(2, (config.leftFlowReformDurationMs ?? 10000) / 1600))
      : 0;
    const visible = clamp01(effect * (detach * 1.08 + settleBase * 0.62 + handoffPressure * 0.22) * (0.68 + profile.blocks * 0.58 + audio.energy * 0.18));
    if (visible <= 0.004) return;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const island of pixelIslands) {
      const particleSettle = smoothstep((settleBase - island.settle * 0.55) / 0.45);
      const particleDetach = smoothstep((detach - island.stagger * 0.42) / 0.58);
      if (particleDetach <= 0.002 && particleSettle <= 0.002) continue;

      const sx = Math.floor(island.sx * sourceCanvas.width);
      const sy = Math.floor(island.sy * sourceCanvas.height);
      const sw = Math.max(2, Math.floor(island.sw * sourceCanvas.width));
      const sh = Math.max(2, Math.floor(island.sh * sourceCanvas.height));
      const originalX = (island.sx + island.sw * 0.5) * protectStart;
      const originalY = (island.sy + island.sh * 0.5) * h;
      const driftX = island.driftX * protectStart * (0.6 + sectionEnergy * 0.8);
      const driftY = island.driftY * h * (0.42 + audio.mids * 0.48);
      const floatX = originalX + driftX * particleDetach + Math.sin(sectionAge * 0.32 + island.phase) * 12 * particleDetach;
      const floatY = originalY + driftY * particleDetach + Math.cos(sectionAge * 0.27 + island.phase) * 10 * particleDetach;
      const targetX = island.targetX * protectStart;
      const targetY = island.targetY * h;
      const x = mix(floatX, targetX + Math.sin(sectionAge * 0.16 + island.phase) * 3.5, particleSettle);
      const y = mix(floatY, targetY + Math.cos(sectionAge * 0.14 + island.phase) * 3, particleSettle);
      const scale = 0.78 + particleDetach * 0.54 - particleSettle * 0.18 + audio.transient * 0.1;
      const drawWidth = sw * (w / sourceCanvas.width) * scale;
      const drawHeight = sh * (h / sourceCanvas.height) * scale;

      ctx.globalAlpha = smoothstep(artworkReveal) * visible * (0.2 + particleDetach * 0.32 + particleSettle * 0.24 + audio.highs * 0.08);
      ctx.drawImage(sourceCanvas, sx, sy, sw, sh, x - drawWidth * 0.5, y - drawHeight * 0.5, drawWidth, drawHeight);
    }

    ctx.restore();
  }

  function drawChromaticFaultPass(ctx: CanvasRenderingContext2D, protectStart: number, profile: SectionProfile) {
    const effect = (config.effectIntensity ?? 0) * (config.chromaticFaultStrength ?? 0);
    const fractureBaseline = clamp01(config.fractureBaseline ?? 0);
    if (effect <= 0.001 || (sectionCueCount < 2 && fractureBaseline <= 0)) return;

    const fault = clamp01(effect * (sectionEffectAmount(3, 6, -0.12) + Math.max(fracturePresence, fractureBaseline) * 0.8 + eventBurst * 0.36) * (0.5 + profile.channel * 0.72));
    if (fault <= 0.006) return;

    const bandHeight = h * (0.11 + profile.channel * 0.08 + audio.highs * 0.06);
    const travel = (sectionProgress * 1.24 + (sectionSeed % 19) * 0.017) % 1.25;
    const y = travel * (h + bandHeight) - bandHeight;
    const offset = config.channelOffset * (1.5 + fault * 4 + audio.highs * 2);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = smoothstep(artworkReveal) * (0.075 + fault * 0.22);
    const eventMix = getEventColorMix();
    ctx.filter = `hue-rotate(${-32 + eventMix * 42}deg) saturate(${170 + eventMix * 80}%)`;
    ctx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, offset, y, protectStart, bandHeight);
    ctx.filter = `hue-rotate(${34 - eventMix * 38}deg) saturate(${150 + eventMix * 70}%)`;
    ctx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, -offset * 0.74, y + bandHeight * 0.12, protectStart, bandHeight);
    ctx.filter = 'none';
    ctx.restore();
  }

  function drawRainPass(ctx: CanvasRenderingContext2D, protectStart: number, profile: SectionProfile, presence = rainPresence, maxDrops?: number) {
    if (!rainDrops.length || presence <= 0.002) return;

    const [ar, ag, ab] = palette.accentGlow;
    const [wr, wg, wb] = palette.accentWarm;
    const baseColor = applyEventTint([ar, ag, ab], 0.78);
    const targetColor = applyEventTint(complementRgb(baseColor, [wr, wg, wb]), 1);
    const slant = 7 + params.drift * 13 + audio.energy * 8;
    const colorDuration = Math.max(0.001, (config.rainColorMorphMs ?? 9000) / 1000);
    const colorProgress = smoothstep(rainColorProgress / colorDuration);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const visibleCount = Math.min(rainDrops.length, maxDrops ?? rainDrops.length);
    for (let index = 0; index < visibleCount; index += 1) {
      const drop = rainDrops[index];
      const release = config.rainColorReleaseMode === 'all-at-once'
        ? colorProgress
        : smoothstep((colorProgress - drop.stagger * 0.72) / 0.28);
      const [red, green, blue] = mixRgb(baseColor, targetColor, release);
      const depthLift = 0.52 + drop.depth * 0.76;
      const x = drop.x
        + Math.sin(time * (0.42 + drop.depth * 0.7) + drop.phase) * (6 + profile.rain * 18)
        + audio.mids * 14 * drop.depth;
      const y = drop.y;
      if (x > protectStart + drop.size * 8) continue;

      const layerLift = 0.46 + layerTargets.rain * 0.74 + audio.energy * 0.32;
      const alpha = drop.alpha * presence * Math.max(profile.rain, 0.34 + layerTargets.rain * 0.58) * depthLift * layerLift * (1 + audio.highs * 1.1 + eventBurst * 0.36 + bassTransient * 0.42 + (audio.beatPulse ?? 0) * 0.22);
      const length = drop.size * (6.5 + drop.depth * 11 + audio.energy * 10 + audio.bass * 9 + bassTransient * 10);
      ctx.strokeStyle = `rgba(${red},${green},${blue},${alpha})`;
      ctx.lineWidth = drop.size * (0.34 + drop.depth * 0.34);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + slant * drop.depth, y + length);
      ctx.stroke();

      if (drop.size > 2.4) {
        ctx.fillStyle = `rgba(${red},${green},${blue},${alpha * 0.62})`;
        ctx.beginPath();
        ctx.ellipse(x, y, drop.size * 0.62, drop.size * 0.86, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawLeftFlowPass(ctx: CanvasRenderingContext2D, protectStart: number, profile: SectionProfile) {
    if (!leftFlowParticles.length || leftFlowCoverage <= 0.002) return;

    const [ar, ag, ab] = palette.accentGlow;
    const [wr, wg, wb] = palette.accentWarm;
    const [dr, dg, db] = palette.dotColor;
    const alphaBase = config.leftFlowAlpha ?? 0.13;
    const pointSize = config.leftFlowPointSize ?? 1.4;
    const lineLength = config.leftFlowLineLength ?? 18;
    const hueBias = config.leftFlowColorShift ?? 0.42;
    const coverageWidth = Math.min(protectStart, w * (0.18 + leftFlowCoverage * 0.86));

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const particle of leftFlowParticles) {
      if (particle.x > coverageWidth + w * 0.08 && particle.depth > leftFlowCoverage + 0.18) continue;
      if (particle.x > protectStart + 28) continue;

      const coverageGate = smoothstep((coverageWidth - particle.x) / Math.max(w * 0.16, 1));
      const localCover = clamp01(leftFlowCoverage * (0.45 + coverageGate * 0.72));
      if (particle.depth > localCover + 0.42) continue;
      const reformColorProgress = smoothstep((leftFlowReform - particle.targetStagger * 0.58) / 0.42) * (config.leftFlowReformStrength ?? 0.82);

      const laneTint = particle.lane === 0
        ? clamp01(0.16 + particle.depth * 0.5 + params.glow * 0.22 + leftFlowEvolution * 0.12)
        : clamp01(0.12 + particle.depth * 0.42 + audio.highs * 0.2 + leftFlowCoverage * 0.18);
      const target = applyEventTint(particle.lane === 0 ? [ar, ag, ab] : [wr, wg, wb], particle.lane === 0 ? 0.82 : 0.62);
      const accentColor: [number, number, number] = [
        Math.round(mix(dr, target[0], clamp01(laneTint + hueBias * 0.2))),
        Math.round(mix(dg, target[1], laneTint)),
        Math.round(mix(db, target[2], clamp01(laneTint + (1 - hueBias) * 0.16))),
      ];
      const [red, green, blue] = mixRgb(
        accentColor,
        mixRgb(applyEventTint(particle.targetColor, 0.7), target, 0.2),
        reformColorProgress,
      );
      const alpha = alphaBase
        * (0.18 + leftFlowCoverage * 0.94)
        * (0.46 + particle.depth * 1.2 + particle.targetBrightness * reformColorProgress * 0.72 + params.density * 0.34 + audio.energy * 0.28 + eventBurst * 0.2)
        * (0.82 + profile.glow * 0.42 + layerTargets.flow * 0.18);

      ctx.strokeStyle = `rgba(${red},${green},${blue},${alpha})`;
      ctx.lineWidth = pointSize * (0.58 + particle.depth * 1.06 + audio.transient * 0.34 + audio.bass * 0.18);
      ctx.beginPath();
      ctx.moveTo(particle.prevX, particle.prevY);
      ctx.lineTo(
        particle.x + (particle.x - particle.prevX) * (0.35 + lineLength * 0.026 + leftFlowCoverage * 0.36),
        particle.y + (particle.y - particle.prevY) * (0.35 + lineLength * 0.018),
      );
      ctx.stroke();

      if (particle.depth > 0.68 || leftFlowCoverage > 0.7) {
        ctx.fillStyle = `rgba(${red},${green},${blue},${alpha * 0.72})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, pointSize * (0.55 + particle.depth * 1.1), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawStormPass(ctx: CanvasRenderingContext2D, protectStart: number, profile: SectionProfile, reduced: boolean) {
    if (!stormParticles.length || stormPresence <= 0.002 || reduced) return;

    const [ar, ag, ab] = palette.accentGlow;
    const [wr, wg, wb] = palette.accentWarm;
    const [dr, dg, db] = palette.dotColor;
    const baseAlpha = config.stormAlpha ?? 0.1;
    const mirrorAlpha = config.stormMirrorAlpha ?? 0.5;
    const artworkMix = config.stormArtworkColorMix ?? 0.32;
    const topBias = config.stormTopColorBias ?? 0.66;
    const bottomBias = config.stormBottomColorBias ?? 0.7;
    const visibleWidth = Math.min(protectStart, w);
    const densityGate = clamp01(stormPresence * (0.88 + params.density * 0.34 + audio.energy * 0.26 + eventBurst * 0.18));

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const particle of stormParticles) {
      if (particle.x > visibleWidth + 32) continue;
      if (particle.depth > densityGate + 0.28) continue;

      const reformProgress = smoothstep((stormReform - particle.targetStagger * 0.62) / 0.38);
      const edgeDistance = particle.direction === 1 ? particle.y / Math.max(h, 1) : 1 - particle.y / Math.max(h, 1);
      const edgeGlow = clamp01(1 - Math.abs(edgeDistance - 0.5) * 0.55);
      const laneTint = particle.direction === 1
        ? clamp01(0.18 + particle.depth * 0.46 + topBias * 0.26 + audio.highs * 0.18)
        : clamp01(0.16 + particle.depth * 0.42 + bottomBias * 0.3 + audio.mids * 0.1);
      const laneTarget = applyEventTint(particle.direction === 1 ? [ar, ag, ab] : [wr, wg, wb], particle.direction === 1 ? 0.82 : 0.7);
      const accent: [number, number, number] = [
        Math.round(mix(dr, laneTarget[0], laneTint)),
        Math.round(mix(dg, laneTarget[1], laneTint)),
        Math.round(mix(db, laneTarget[2], laneTint)),
      ];
      const [red, green, blue] = mixRgb(accent, applyEventTint(particle.targetColor, 0.72), artworkMix * (0.35 + reformProgress * 0.65));
      const alpha = baseAlpha
        * stormPresence
        * (0.28 + particle.depth * 0.92 + particle.targetBrightness * reformProgress * 0.42)
        * (0.84 + profile.glow * 0.42 + audio.highs * 0.62 + audio.bass * 0.40 + bassTransient * 0.28 + eventBurst * 0.26 + layerTargets.storm * 0.18)
        * edgeGlow;
      const beatFlash = (audio.beatPulse ?? 0) * 0.62;
      const length = (3.5 + particle.depth * 12 + audio.bass * 10 + stormLineFlash * 7 + bassTransient * 14 + beatFlash * 6) * (0.7 + stormPresence * 0.45);
      const width = particle.size * (0.46 + particle.depth * 0.44 + audio.transient * 0.24);
      const mirrorY = h - particle.y;

      ctx.strokeStyle = `rgba(${red},${green},${blue},${alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(particle.prevX, particle.prevY);
      ctx.lineTo(
        particle.x + Math.sin(time * 0.38 + particle.phase) * length * 0.28,
        particle.y + particle.direction * length,
      );
      ctx.stroke();

      if (mirrorAlpha > 0.001 && stormPresence > 0.18 && particle.depth > 0.48) {
        ctx.strokeStyle = `rgba(${red},${green},${blue},${alpha * mirrorAlpha * 0.72})`;
        ctx.beginPath();
        ctx.moveTo(particle.prevX, h - particle.prevY);
        ctx.lineTo(
          particle.x - Math.sin(time * 0.32 + particle.phase) * length * 0.18,
          mirrorY - particle.direction * length * 0.72,
        );
        ctx.stroke();
      }

      if (particle.depth > 0.58 || stormPresence > 0.52) {
        ctx.fillStyle = `rgba(${red},${green},${blue},${alpha * 0.54})`;
        ctx.beginPath();
        ctx.ellipse(particle.x, particle.y, width * 1.1, width * 0.72, particle.phase * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const lineAlpha = (config.stormLineAlpha ?? 0) * stormPresence * (stormLineFlash + audio.transient * 0.5 + params.impulse * 0.3 + audio.bass * 0.14);
    if (lineAlpha > 0.004) {
      const [lineR, lineG, lineB] = applyEventTint([wr, wg, wb], 0.92);
      ctx.strokeStyle = `rgba(${lineR},${lineG},${lineB},${lineAlpha})`;
      ctx.lineWidth = 0.7 + audio.transient * 1.8;
      const lineCount = 3 + Math.round(stormPresence * 4);
      for (let index = 0; index < lineCount; index += 1) {
        const offset = (index + 0.5) / lineCount;
        const y = h * (0.1 + offset * 0.78 + Math.sin(time * 0.5 + index + sectionSeed * 0.001) * 0.035);
        const lean = (index % 2 === 0 ? 1 : -1) * w * (0.1 + audio.bass * 0.06);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(visibleWidth * (0.62 + stormPresence * 0.26), h - y * 0.38 + lean);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  return {
    setup(_q, _w, _h, _palette, _tuning, context) {
      q = _q;
      w = _w;
      h = _h;
      palette = _palette;
      config = resolveCongArtworkDatamoshTuning(_tuning);
      sourceCanvas = document.createElement('canvas');
      feedbackCanvas = document.createElement('canvas');
      stableCanvas = document.createElement('canvas');
      fallbackCanvas = document.createElement('canvas');
      artworkCanvas = document.createElement('canvas');
      previousFrameCanvas = document.createElement('canvas');
      freezeCanvas = document.createElement('canvas');
      compressionCanvas = document.createElement('canvas');
      const maybeSourceCtx = sourceCanvas.getContext('2d');
      const maybeFeedbackCtx = feedbackCanvas.getContext('2d');
      const maybeStableCtx = stableCanvas.getContext('2d');
      const maybeFallbackCtx = fallbackCanvas.getContext('2d');
      const maybeArtworkCtx = artworkCanvas.getContext('2d');
      const maybePreviousFrameCtx = previousFrameCanvas.getContext('2d');
      const maybeFreezeCtx = freezeCanvas.getContext('2d');
      const maybeCompressionCtx = compressionCanvas.getContext('2d');
      if (!maybeSourceCtx || !maybeFeedbackCtx || !maybeStableCtx || !maybeFallbackCtx || !maybeArtworkCtx || !maybePreviousFrameCtx || !maybeFreezeCtx || !maybeCompressionCtx) throw new Error('Failed to create datamosh buffers');
      sourceCtx = maybeSourceCtx;
      feedbackCtx = maybeFeedbackCtx;
      stableCtx = maybeStableCtx;
      fallbackCtx = maybeFallbackCtx;
      artworkCtx = maybeArtworkCtx;
      previousFrameCtx = maybePreviousFrameCtx;
      freezeCtx = maybeFreezeCtx;
      compressionCtx = maybeCompressionCtx;
      destroyed = false;
      time = 0;
      eventBurst = 0;
      artworkBlend = 0;
      artworkTargetsReady = false;
      artworkReveal = 0;
      fallbackPresence = 1;
      sectionEnergy = 0;
      sectionTarget = 0.12;
      sectionCueCount = 0;
      sectionAge = 0;
      sectionProgress = 0;
      sectionDurationEstimate = 18;
      lastSectionCueTime = 0;
      sectionSeed = seed ^ 0x41C6CE57;
      sectionProfile = getSectionProfile(1);
      prevSectionProfile = getSectionProfile(1);
      lerpedSectionProfile = getSectionProfile(1);
      memorySmear = 0;
      memorySmearTarget = 0;
      scanBloom = 0;
      scanBloomTarget = 0;
      rainPresence = 0;
      rainPresenceTarget = 0;
      rainColorProgress = 0;
      rainColorProgressTarget = 0;
      eventColorTarget = null;
      eventColorProgress = 0;
      eventColorDuration = 1;
      eventColorStrength = 0;
      eventColorStrengthTarget = 0;
      leftFlowCoverage = 0;
      leftFlowCoverageTarget = 0;
      leftFlowEvolution = 0;
      leftFlowReform = 0;
      leftFlowReformTarget = 0;
      stormPresence = 0;
      stormPresenceTarget = 0;
      stormLineFlash = 0;
      stormReform = 0;
      stormReformTarget = 0;
      sectionCountEstimate = 6;
      roleProgress = 0;
      layerTargets = emptyLayerTargets();
      fracturePresence = 0;
      fracturePresenceTarget = 0;
      handoffPressure = 0;
      handoffPressureTarget = 0;
      bpm = context?.beatGrid?.bpm ?? 120;
      rebuildSeeds(context?.assetSeed ?? `${context?.albumName ?? ''}::${context?.trackTitle ?? ''}`);
      moshProfile = createMoshDirectorProfile(seed);
      freezeRandom = createRandom(seed ^ 0x8C1F2A9D);
      freezeHold = 0;
      freezeAge = 0;
      freezeX = 0;
      freezeY = 0;
      freezeW = 0;
      freezeH = 0;
      arcName = pickArc(seed);
      arcOrder = getArcOrder(arcName);
      sectionComplexityBias = 0;
      sectionComplexityBiasTarget = 0;
      crescendoLift = 0;
      sectionSeed = seed ^ 0x41C6CE57;
      leftFlowRandom = createRandom(seed ^ 0x3D9271B5);
      stormRandom = createRandom(seed ^ 0x4DD1F23A);
      resizeBuffers(w, h);
      loadArtwork(context);
    },

    update(dt, nextParams, nextAudio, nextExclusion) {
      params = nextParams;
      audio = nextAudio;
      exclusion = nextExclusion;
      if (imageLoaded && artworkBlend < 1) {
        artworkBlend = Math.min(1, artworkBlend + dt / ARTWORK_BLEND_SECONDS);
        recomposeSource();
        if (artworkBlend >= 1 && !artworkTargetsReady) {
          assignLeftFlowArtworkTargets();
          assignStormArtworkTargets();
          assignPixelIslandTargets();
          artworkTargetsReady = true;
        }
      }
      artworkReveal = imageLoaded ? artworkBlend : 0;
      fallbackPresence = imageLoaded ? 1 - smoothstep(artworkBlend) : 1;

      // Transient gate: only fire hard displacement on genuine bass spikes
      bassRollingAvg = bassRollingAvg * 0.94 + audio.bass * 0.06;
      const rawSpike = audio.bass - bassRollingAvg * 1.2;
      bassTransient = rawSpike > 0 ? Math.min(1, rawSpike / 0.25) : 0;

      for (const band of sortedBands) band.age += dt;
      const sortDecaySeconds = (config.pixelSortDecayMs ?? 2400) / 1000;
      sortedBands = sortedBands.filter((band) => band.age < sortDecaySeconds);

      sectionAge += dt;
      sectionProgress = clamp01(sectionAge / Math.max(4, sectionDurationEstimate));
      const profileLerpT = smoothstep(Math.min(1, sectionProgress / 0.62));
      lerpedSectionProfile = lerpSectionProfile(prevSectionProfile, sectionProfile, profileLerpT);
      sectionEnergy = mix(sectionEnergy, sectionTarget, 1 - Math.pow(0.001, dt));
      eventBurst = mix(eventBurst, 0, 1 - Math.pow(0.0002, dt));
      memorySmear = mix(memorySmear, memorySmearTarget, 1 - Math.pow(Math.max(0.0004, config.memorySmearDecay ?? 0.12), dt));
      scanBloom = mix(scanBloom, scanBloomTarget, 1 - Math.pow(0.001, dt));
      scanBloomTarget = mix(scanBloomTarget, 0, 1 - Math.pow(0.012, dt));
      rainPresence = mix(rainPresence, rainPresenceTarget, 1 - Math.pow(0.001, dt));
      // Evolution: rain builds through section via sectionProgress ramp
      if (sectionCueCount >= (config.rainSectionIndex ?? 4) - 1 && sectionProfile.rain > 0) {
        const rainRamp = smoothstep(Math.max(0, (sectionProgress - 0.3) / 0.5)) * 0.14;
        rainPresenceTarget = Math.max(rainPresenceTarget, sectionProfile.rain + rainRamp);
      }
      leftFlowCoverage = mix(leftFlowCoverage, leftFlowCoverageTarget, 1 - Math.pow(0.001, dt));
      leftFlowReform = mix(leftFlowReform, leftFlowReformTarget, 1 - Math.pow(0.001, dt));
      leftFlowEvolution = Math.max(leftFlowEvolution, leftFlowCoverage);
      stormPresence = mix(stormPresence, stormPresenceTarget, 1 - Math.pow(0.001, dt));
      stormLineFlash = mix(stormLineFlash, 0, 1 - Math.pow(0.0001, dt));
      stormReform = mix(stormReform, stormReformTarget, 1 - Math.pow(0.001, dt));
      fracturePresence = mix(fracturePresence, fracturePresenceTarget, 1 - Math.pow(0.001, dt));
      handoffPressure = mix(handoffPressure, handoffPressureTarget, 1 - Math.pow(0.001, dt));
      // Evolution: complexity grows within each section and fracture has a roleProgress floor
      sectionComplexityBiasTarget = smoothstep(sectionProgress) * 0.28 * (1 + roleProgress * 0.44);
      sectionComplexityBias = mix(sectionComplexityBias, sectionComplexityBiasTarget, 1 - Math.pow(0.001, dt));
      const fractureFloor = clamp01(roleProgress * 0.42 - 0.08);
      if (fractureFloor > fracturePresenceTarget) fracturePresenceTarget = Math.max(fracturePresenceTarget, fractureFloor);
      // Crescendo
      crescendoLift *= Math.exp(-dt / 1.8);
      if (rainColorProgressTarget > rainColorProgress) {
        rainColorProgress = Math.min(rainColorProgressTarget, rainColorProgress + dt);
      }
      if (eventColorTarget) {
        eventColorProgress = Math.min(eventColorDuration, eventColorProgress + dt);
        eventColorStrength = mix(eventColorStrength, eventColorStrengthTarget, 1 - Math.pow(0.001, dt));
        eventColorStrengthTarget = mix(eventColorStrengthTarget, 0, 1 - Math.pow(0.045, dt));
        if (eventColorStrength < 0.002 && eventColorStrengthTarget < 0.002 && eventColorProgress >= eventColorDuration) {
          eventColorTarget = null;
        }
      }
      if (sectionCueCount === 0) {
        const introProgress = clamp01(0.08 + smoothstep(sectionAge / 42) * 0.34);
        roleProgress = Math.max(roleProgress, introProgress);
        applyLayerTargets(buildLayerTargets(roleProgress), 0);
        rainPresenceTarget = 0;
        leftFlowCoverageTarget = 0;
        stormPresenceTarget = 0;
      }

      const reduced = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      const idleMotion = config.idleMotionAmount ?? 0.46;
      const idlePresence = clamp01(1 - (audio.playing ?? 0));
      const staticMotionScale = Math.max(config.staticMotionScale ?? 1, idleMotion * (0.72 + idlePresence * 0.7));
      time += dt * (
        (0.38 + params.drift * 1.45) * staticMotionScale * lerpedSectionProfile.timeScale
        + audio.energy * 0.42
        + sectionEnergy * 0.26
        + eventBurst * 0.22
      );
      bpmScale = bpm / 120;
      beatPhase = (time * (bpm / 60)) % 1;

      const rainSpeedScale = (0.22 + staticMotionScale * 0.78) * (0.72 + lerpedSectionProfile.rain * 0.42 + audio.energy * 0.34 + eventBurst * 0.16);
      for (const drop of rainDrops) {
        drop.y += drop.speed * rainSpeedScale * dt;
        if (drop.y - drop.size * 10 > h + 24) resetRainDrop(drop, true);
      }

      if (stormParticles.length && stormPresence > 0.002) {
        const speedScale = (config.stormSpeed ?? 0.8)
          * (0.34 + params.drift * 0.62 + audio.bass * 0.44 + audio.energy * 0.26 + stormPresence * 0.44 + eventBurst * 0.18);
        const sway = (config.stormSway ?? 32) * (0.38 + params.turbulence * 0.72 + audio.mids * 0.5 + stormPresence * 0.24);
        const reformStrength = clamp01(stormReform);

        for (const particle of stormParticles) {
          particle.prevX = particle.x;
          particle.prevY = particle.y;
          const staggeredReform = smoothstep((reformStrength - particle.targetStagger * 0.62) / 0.38);
          const noise = q?.noise
            ? q.noise(
              particle.x * 0.0022 + particle.seed * 0.01,
              particle.y * 0.0022 + particle.phase,
              time * (0.16 + particle.depth * 0.2),
            )
            : (Math.sin(particle.x * 0.005 + particle.seed + time) + 1) * 0.5;
          const bend = (noise - 0.5) * sway + Math.sin(time * (0.42 + particle.depth * 0.36) + particle.phase) * sway * 0.2;
          particle.x += bend * dt * (1 - staggeredReform * 0.58);
          particle.y += particle.direction * particle.speed * speedScale * dt * (1 - staggeredReform * 0.5);

          if (staggeredReform > 0.001) {
            const targetX = particle.targetX * Math.max(w, 1);
            const targetY = particle.targetY * Math.max(h, 1);
            const pull = 1 - Math.pow(0.001, dt * staggeredReform);
            const livingDrift = Math.sin(time * (0.18 + particle.depth * 0.16) + particle.phase) * (1.5 + particle.depth * 4) * reformStrength;
            particle.x = mix(particle.x, targetX + livingDrift, pull);
            particle.y = mix(particle.y, targetY + Math.cos(time * 0.14 + particle.phase) * livingDrift, pull);
          }

          if (particle.x < -44) particle.x = w + 36;
          if (particle.x > w + 44) particle.x = -36;
          if (stormReform < 0.42 && (particle.y > h + 48 || particle.y < -48)) {
            respawnStormParticle(particle, stormRandom, true);
          }
        }
      }

      if (leftFlowParticles.length && leftFlowCoverage > 0.002) {
        const flowSpeed = config.leftFlowSpeed ?? 72;
        const noiseScale = 0.0018 + params.turbulence * 0.0014 + leftFlowEvolution * 0.0009;
        const reformStrength = config.leftFlowReformStrength ?? 0.82;
        const travel = flowSpeed * (0.38 + params.drift * 0.78 + audio.energy * 0.42 + leftFlowCoverage * 0.84 + eventBurst * 0.28) * (1 - leftFlowReform * 0.58);
        const verticalSwing = (14 + params.turbulence * 24 + audio.mids * 16 + leftFlowCoverage * 22) * (1 - leftFlowReform * 0.68);

        for (const particle of leftFlowParticles) {
          particle.prevX = particle.x;
          particle.prevY = particle.y;
          const staggeredReform = smoothstep((leftFlowReform - particle.targetStagger * 0.58) / 0.42) * reformStrength;
          const field = q?.noise
            ? q.noise(
              particle.x * noiseScale + particle.seed,
              particle.y * noiseScale + particle.seed * 0.3,
              time * (0.58 + particle.depth * 0.42),
            )
            : (Math.sin(particle.x * noiseScale + particle.seed + time) + 1) * 0.5;
          const angle = field * Math.PI * 2 + (particle.lane === 0 ? -0.3 : 0.36) + leftFlowCoverage * 0.18;
          particle.x += Math.cos(angle) * (travel * 0.22 + 16 * (0.4 + particle.depth)) * dt + travel * dt * (1 - staggeredReform * 0.82);
          particle.y += Math.sin(angle) * verticalSwing * dt;

          if (staggeredReform > 0.001) {
            const targetX = particle.targetX * Math.max(w, 1);
            const targetY = particle.targetY * Math.max(h, 1);
            const pull = 1 - Math.pow(0.0008, dt * staggeredReform);
            const livingDrift = Math.sin(time * (0.28 + particle.depth * 0.18) + particle.seed) * (2.5 + particle.depth * 6) * leftFlowReform;
            particle.x = mix(particle.x, targetX + livingDrift, pull);
            particle.y = mix(particle.y, targetY + Math.cos(time * 0.22 + particle.seed) * livingDrift * 0.64, pull);
          }

          if (leftFlowReform < 0.35 && (particle.x > w + 48 || particle.y < -48 || particle.y > h + 48)) {
            respawnLeftFlowParticle(particle, leftFlowRandom, true);
          }
        }
      }

      freezeHold = Math.max(0, freezeHold - dt * (0.55 + audio.transient * 0.7));
      freezeAge += dt;
      const estimatedIntensity = clamp01(params.turbulence * 0.22 + params.density * 0.16 + sectionEnergy * config.sectionEvolution + audio.energy * 0.28 + eventBurst * 0.42);
      const freezeAmount = getAutomaticMoshAmount('freeze', estimatedIntensity, sectionProfile);
      const freezeChance = config.freezeChance ?? 0.035;
      if (freezeHold <= 0.001 && freezeAmount > 0.08 && freezeAge > 0.35 && freezeRandom() < freezeChance * freezeAmount * dt * 8) {
        const maxWidth = Math.max(24, w * (0.16 + freezeRandom() * 0.34));
        const maxHeight = Math.max(18, h * (0.08 + freezeRandom() * 0.24));
        freezeW = Math.min(w, maxWidth);
        freezeH = Math.min(h, maxHeight);
        freezeX = Math.max(0, Math.min(w - freezeW, freezeRandom() * w * 0.72));
        freezeY = Math.max(0, Math.min(h - freezeH, freezeRandom() * h));
        freezeCtx.clearRect(0, 0, freezeCanvas.width, freezeCanvas.height);
        freezeCtx.drawImage(feedbackCanvas, 0, 0, freezeCanvas.width, freezeCanvas.height);
        freezeHold = 0.16 + freezeAmount * 0.46 + freezeRandom() * 0.22;
        freezeAge = 0;
      }
    },

    draw(_q, ctx) {
      const reduced = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const fractureBaseline = clamp01(config.fractureBaseline ?? 0);
      const protectStart = Math.max(w * 0.58, Math.min(w, exclusion.left - exclusion.pad * 1.5));
      const intensity = reduced
        ? 0.05
        : clamp01(params.turbulence * 0.22 + params.density * 0.16 + sectionEnergy * config.sectionEvolution + audio.energy * 0.28 + eventBurst * 0.42);
      const [bgR, bgG, bgB] = palette.bgDark;

      if (!reduced) {
        previousFrameCtx.globalAlpha = 1;
        previousFrameCtx.globalCompositeOperation = 'source-over';
        previousFrameCtx.clearRect(0, 0, previousFrameCanvas.width, previousFrameCanvas.height);
        previousFrameCtx.drawImage(feedbackCanvas, 0, 0, previousFrameCanvas.width, previousFrameCanvas.height);

        feedbackCtx.save();
        feedbackCtx.globalCompositeOperation = 'source-over';
        const smearHold = (config.effectIntensity ?? 0) * memorySmear;
        const autoFeedback = getAutomaticMoshAmount('feedback', intensity, lerpedSectionProfile) * (config.feedbackAmount ?? 1);
        const feedbackBreath = 0.92 + Math.sin(time * 0.28 + moshProfile.phase) * 0.08 * (config.idleMotionAmount ?? 0.46);
        feedbackCtx.globalAlpha = Math.max(
          0.026,
          Math.min(
            0.5,
            (config.feedbackAlpha + sectionEnergy * 0.06 - audio.transient * 0.04 - autoFeedback * 0.028)
              * lerpedSectionProfile.feedback
              * feedbackBreath
              * (1 - smearHold * 0.48),
          ),
        );
        feedbackCtx.fillStyle = `rgb(${bgR},${bgG},${bgB})`;
        feedbackCtx.fillRect(0, 0, w, h);
        feedbackCtx.restore();

        const effectiveImageAnchor = Math.max(0.08, lerpedSectionProfile.imageAnchor);
        feedbackCtx.save();
        feedbackCtx.globalCompositeOperation = 'source-over';
        feedbackCtx.globalAlpha = 0.018 + effectiveImageAnchor * 0.038;
        feedbackCtx.drawImage(stableCanvas, 0, 0, w, h);
        feedbackCtx.restore();

        if (sectionCueCount >= 2 || fractureBaseline > 0) drawSlicePass(intensity, protectStart, lerpedSectionProfile);
        drawMoshWavePass(intensity, protectStart, lerpedSectionProfile);
        if (fractureBaseline > 0) drawBlockPass(intensity, protectStart, lerpedSectionProfile);
        if (sectionCueCount >= 2) drawChannelPass(intensity, lerpedSectionProfile);
        drawAutomaticMoshPasses(intensity, protectStart, lerpedSectionProfile);

        // Quiet-moment regeneration: bleed source image back at very low alpha
        // during silent/quiet passages so the artwork never fully corrupts.
        const leakAlpha = Math.max(0, (0.18 - audio.energy) / 0.18) * 0.007;
        if (leakAlpha > 0.001 && imageLoaded) {
          feedbackCtx.globalAlpha = leakAlpha;
          feedbackCtx.globalCompositeOperation = 'source-over';
          feedbackCtx.drawImage(stableCanvas, 0, 0, w, h);
        }
      } else {
        feedbackCtx.globalAlpha = 1;
        feedbackCtx.globalCompositeOperation = 'source-over';
        feedbackCtx.drawImage(stableCanvas, 0, 0, w, h);
      }

      ctx.save();
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgb(${bgR},${bgG},${bgB})`;
      ctx.fillRect(0, 0, w, h);
      const fallbackReveal = smoothstep(fallbackPresence);
      ctx.globalAlpha = 1;
      ctx.drawImage(feedbackCanvas, 0, 0, w, h);

      const [ar, ag, ab] = palette.accentGlow;
      const [wr, wg, wb] = palette.accentWarm;
      const [scanR, scanG, scanB] = applyEventTint([ar, ag, ab], 0.86);
      const [warmR, warmG, warmB] = applyEventTint([wr, wg, wb], 0.72);
      ctx.globalCompositeOperation = 'screen';
      const sectionBloom = scanBloom + sectionEffectAmount(2, 5, -0.18) * (config.scanBloomStrength ?? 0) * (0.42 + sectionProgress * 0.42);
      const scanAlpha = (0.012 + intensity * 0.024 + params.shimmer * 0.012) * (0.72 + lerpedSectionProfile.scan * 0.76 + sectionBloom * 0.74 + getEventColorMix() * 0.32);
      ctx.fillStyle = `rgba(${scanR},${scanG},${scanB},${scanAlpha})`;
      const scanStep = Math.max(4, Math.round(24 - lerpedSectionProfile.scan * 10 - intensity * 5 - sectionBloom * 5));
      const scanOffset = Math.floor(beatPhase * scanStep) % scanStep;
      for (let y = -scanOffset; y < h; y += scanStep) {
        ctx.fillRect(0, y, protectStart, 1);
      }

      const glow = ctx.createLinearGradient(0, 0, protectStart, h);
      glow.addColorStop(0, `rgba(${scanR},${scanG},${scanB},${0.014 + lerpedSectionProfile.glow * 0.026 + audio.highs * 0.05 + eventBurst * 0.04 + getEventColorMix() * 0.035})`);
      glow.addColorStop(0.55, 'rgba(255,255,255,0)');
      glow.addColorStop(1, `rgba(${warmR},${warmG},${warmB},${0.012 + lerpedSectionProfile.glow * 0.024 + audio.bass * 0.04 + sectionEnergy * 0.03 + getEventColorMix() * 0.026})`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, protectStart, h);
      if (fractureBaseline <= 0 || !reduced) drawChromaticFaultPass(ctx, protectStart, lerpedSectionProfile);
      if (fractureBaseline > 0 && !reduced) drawPixelIslandPass(ctx, protectStart, lerpedSectionProfile);
      if (sectionCueCount >= 2) drawLeftFlowPass(ctx, protectStart, sectionProfile);
      if (sectionCueCount >= 2) drawStormPass(ctx, protectStart, sectionProfile, reduced);
      if (fallbackReveal > 0.002 && !reduced) {
        drawRainPass(ctx, protectStart, sectionProfile, Math.max(rainPresence, fallbackReveal * 0.72), 170);
      } else if (sectionCueCount >= 4) {
        drawRainPass(ctx, protectStart, sectionProfile);
      }
      // Crescendo: white screen-mode flash when all layers peak simultaneously
      if (crescendoLift > 0.02) {
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(255,255,255,${crescendoLift * 0.18})`;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
    },

    onEvent(event: VisualEvent) {
      const intensity = event.intensity ?? 0.55;
      if (event.type === 'section-cue') {
        if (lastSectionCueTime > 0 && event.t > lastSectionCueTime) {
          sectionDurationEstimate = mix(sectionDurationEstimate, Math.max(6, event.t - lastSectionCueTime), 0.72);
        } else if (event.t > 0 && sectionCueCount === 0) {
          sectionDurationEstimate = mix(sectionDurationEstimate, Math.max(8, event.t), 0.45);
        }
        lastSectionCueTime = Math.max(lastSectionCueTime, event.t);
        sectionCueCount = Math.min(7, sectionCueCount + 1);
        sectionCountEstimate = Math.max(1, Math.round(event.sectionCount ?? sectionCountEstimate));
        const sectionNumber = Math.max(2, Math.min(sectionCountEstimate, Math.round((event.sectionIndex ?? sectionCueCount) + 1)));
        roleProgress = clamp01((sectionNumber - 1) / Math.max(sectionCountEstimate - 1, 1));
        prevSectionProfile = lerpedSectionProfile;
        sectionAge = 0;
        sectionProgress = 0;
        sectionSeed = hashString(`${seed}:${sectionNumber}:${Math.round(event.t * 1000)}`);
        sectionProfile = getSectionProfile(sectionNumber);
        const nextLayerTargets = buildLayerTargets(roleProgress);
        applyLayerTargets(nextLayerTargets, intensity);
        sectionTarget = clamp01(sectionProfile.energy + roleProgress * 0.14 + intensity * 0.22);
        eventBurst = Math.max(eventBurst, 0.42 + intensity * 0.5 + roleProgress * 0.1);
        scanBloomTarget = Math.max(scanBloomTarget, (config.scanBloomStrength ?? 0) * (0.42 + intensity * 0.56 + roleProgress * 0.14));
        if (sectionNumber >= 4) {
          memorySmearTarget = Math.max(memorySmearTarget, (config.effectIntensity ?? 0) * (0.28 + sectionProfile.feedback * 0.34));
        }
        if (sectionNumber >= 6) {
          memorySmearTarget = Math.min(memorySmearTarget, 0.34 + (config.effectIntensity ?? 0) * 0.18);
        }

        const stormEntrySection = config.stormEntrySection ?? 2;
        if (sectionNumber >= stormEntrySection && stormParticles.length) {
          const stormPeakSection = Math.max(stormEntrySection, config.stormPeakSection ?? 5);
          const stormSettleSection = Math.max(stormPeakSection, config.stormSettleSection ?? 6);
          let nextStormPresence = 0;
          if (sectionNumber <= stormPeakSection) {
            nextStormPresence = mix(0.14, 1, smoothstep((sectionNumber - stormEntrySection) / Math.max(1, stormPeakSection - stormEntrySection)));
          } else if (sectionNumber < stormSettleSection) {
            nextStormPresence = 0.82;
          } else {
            nextStormPresence = sectionNumber >= 8
              ? 0.22
              : mix(0.62, 0.34, smoothstep((sectionNumber - stormSettleSection) / Math.max(1, 8 - stormSettleSection)));
          }
          stormPresenceTarget = Math.max(stormPresenceTarget * 0.82, clamp01(nextStormPresence));
        }

        const stormSettleSection = config.stormSettleSection ?? 6;
        if (sectionNumber >= stormSettleSection && stormParticles.length) {
          stormReformTarget = Math.max(stormReformTarget, sectionNumber >= 8 ? 0.78 : 0.54 + (sectionNumber - stormSettleSection) * 0.1);
        }

        const rainSectionIndex = config.rainSectionIndex ?? 4;
        if (sectionNumber >= rainSectionIndex) {
          rainPresenceTarget = sectionProfile.rain;
          // Evolution: rain builds through the section (ramp applied in update via sectionProgress)
        }
        if (sectionNumber === rainSectionIndex + 1) {
          rainColorProgress = 0;
          rainColorProgressTarget = Math.max(0.001, (config.rainColorMorphMs ?? 9000) / 1000);
        }

        const leftEntrySection = config.leftFlowEntrySection ?? 3;
        if (sectionNumber >= leftEntrySection && leftFlowParticles.length) {
          const coverTarget = config.leftFlowCoverTarget ?? 0.88;
          const evolutionStrength = config.leftFlowEvolutionStrength ?? 1;
          const sectionSpan = Math.max(1, 6 - leftEntrySection + 1);
          const sectionProgress = clamp01((sectionNumber - leftEntrySection + 1) / sectionSpan);
          const nextCoverage = coverTarget * smoothstep(sectionProgress) * evolutionStrength;
          leftFlowCoverageTarget = Math.max(leftFlowCoverageTarget, clamp01(nextCoverage));
        }

        const reformSection = config.leftFlowReformSection ?? 5;
        if (sectionNumber >= reformSection && leftFlowParticles.length) {
          const durationSeconds = Math.max(0.12, (config.leftFlowReformDurationMs ?? 10000) / 1000);
          const durationScaledTarget = clamp01((sectionNumber - reformSection + 1) / Math.max(1, durationSeconds / 5));
          leftFlowReformTarget = Math.max(leftFlowReformTarget, (config.leftFlowReformStrength ?? 0.82) * smoothstep(durationScaledTarget));
          leftFlowCoverageTarget = Math.max(leftFlowCoverageTarget, config.leftFlowCoverTarget ?? 0.88);
        }
        return;
      }

      if (event.type === 'storm-release') {
        sectionTarget = clamp01(sectionTarget + 0.16 + intensity * 0.22);
        eventBurst = Math.max(eventBurst, 0.52 + intensity * 0.48);
        stormPresenceTarget = Math.max(stormPresenceTarget, clamp01(0.78 + intensity * 0.22));
        stormLineFlash = Math.max(stormLineFlash, config.stormLineAlpha ? 0.52 + intensity * 0.48 : 0);
        fracturePresenceTarget = Math.max(fracturePresenceTarget, clamp01(fracturePresence + 0.12 + intensity * 0.18));
        leftFlowCoverageTarget = Math.max(leftFlowCoverageTarget, clamp01(leftFlowCoverage + (config.leftFlowParticleCount ? 0.12 + intensity * 0.16 : 0)));
        // Crescendo: maximise all layers simultaneously in final act
        if (roleProgress > 0.78) {
          crescendoLift = Math.max(crescendoLift, 0.72 + intensity * 0.28);
          rainPresenceTarget = Math.max(rainPresenceTarget, 0.88);
          stormPresenceTarget = Math.max(stormPresenceTarget, 1);
          fracturePresenceTarget = Math.max(fracturePresenceTarget, 0.92);
          leftFlowCoverageTarget = Math.max(leftFlowCoverageTarget, 0.88);
          memorySmearTarget = Math.max(memorySmearTarget, (config.effectIntensity ?? 0) * 0.92);
          eventBurst = Math.max(eventBurst, 1);
        }
        return;
      }

      if (event.type === 'density-surge' || event.type === 'spark-burst' || event.type === 'bloom-flash') {
        sectionTarget = clamp01(sectionTarget + 0.12 + intensity * 0.16);
        eventBurst = Math.max(eventBurst, 0.58 + intensity * 0.5);
        if (event.color || event.palette) triggerEventColor(event, event.type === 'spark-burst' || event.type === 'bloom-flash' ? 0.72 : 0.52);
        scanBloomTarget = Math.max(scanBloomTarget, (config.scanBloomStrength ?? 0) * (0.34 + intensity * 0.56));
        fracturePresenceTarget = Math.max(fracturePresenceTarget, clamp01(fracturePresence + 0.14 + intensity * 0.2));
        stormPresenceTarget = Math.max(stormPresenceTarget, clamp01(stormPresence + (config.stormParticleCount ? 0.22 + intensity * 0.24 : 0)));
        stormLineFlash = Math.max(stormLineFlash, config.stormLineAlpha ? 0.48 + intensity * 0.52 : 0);
        if (!event.target || event.target === 'particles' || event.target === 'foreground' || event.target === 'all') {
          leftFlowCoverageTarget = Math.max(leftFlowCoverageTarget, clamp01(leftFlowCoverage + (config.leftFlowParticleCount ? 0.12 + intensity * 0.18 : 0)));
          rainPresenceTarget = Math.max(rainPresenceTarget, clamp01(rainPresence + (config.rainParticleCount ? 0.16 + intensity * 0.22 : 0)));
        }
        return;
      }

      if (event.type === 'motion-drift' || event.type === 'grain-bloom' || event.type === 'veil-sweep') {
        sectionTarget = clamp01(sectionTarget + 0.08 + intensity * 0.1);
        eventBurst = Math.max(eventBurst, 0.32 + intensity * 0.34);
        memorySmearTarget = Math.max(memorySmearTarget, (config.effectIntensity ?? 0) * (0.24 + intensity * 0.3));
        fracturePresenceTarget = Math.max(fracturePresenceTarget, clamp01(fracturePresence + 0.08 + intensity * 0.12));
        stormPresenceTarget = Math.max(stormPresenceTarget, clamp01(stormPresence + (config.stormParticleCount ? 0.07 + intensity * 0.1 : 0)));
        stormLineFlash = Math.max(stormLineFlash, config.stormLineAlpha ? 0.22 + intensity * 0.32 : 0);
        if (event.type === 'motion-drift') {
          leftFlowCoverageTarget = Math.max(leftFlowCoverageTarget, clamp01(leftFlowCoverage + (config.leftFlowParticleCount ? 0.16 + intensity * 0.2 : 0)));
        }
        if (event.type === 'grain-bloom') {
          rainPresenceTarget = Math.max(rainPresenceTarget, clamp01(rainPresence + (config.rainParticleCount ? 0.14 + intensity * 0.18 : 0)));
          scanBloomTarget = Math.max(scanBloomTarget, (config.scanBloomStrength ?? 0) * (0.42 + intensity * 0.48));
        }
        return;
      }

      if (event.type === 'color-morph' || event.type === 'palette-morph' || event.type === 'focus-shift') {
        eventBurst = Math.max(eventBurst, 0.26 + intensity * 0.28);
        triggerEventColor(event, event.type === 'focus-shift' ? 0.58 : 1);
        stormLineFlash = Math.max(stormLineFlash, config.stormLineAlpha ? 0.18 + intensity * 0.24 : 0);
        if (!event.target || event.target === 'particles' || event.target === 'foreground' || event.target === 'all') {
          rainColorProgress = 0;
          rainColorProgressTarget = Math.max(rainColorProgressTarget, (event.durationMs ?? config.rainColorMorphMs ?? 9000) / 1000);
          rainPresenceTarget = Math.max(rainPresenceTarget, clamp01(rainPresence + 0.1 + intensity * 0.14));
          leftFlowCoverageTarget = Math.max(leftFlowCoverageTarget, clamp01(leftFlowCoverage + 0.08 + intensity * 0.12));
          leftFlowReformTarget = Math.max(leftFlowReformTarget, (config.leftFlowReformStrength ?? 0.82) * (0.28 + intensity * 0.5));
        }
      }
    },

    resize(_w, _h) {
      w = _w;
      h = _h;
      resizeBuffers(w, h);
    },

    destroy() {
      destroyed = true;
      image = null;
      sliceSeeds = [];
      blockSeeds = [];
      pixelIslands = [];
      rainDrops = [];
      leftFlowParticles = [];
      stormParticles = [];
      sortedBands = [];
      pendingSortBands = [];
      slitScanRing = [];
      slitScanFilled = 0;
      ditherCanvas = null;
      ditherCtx = null;
    },
  };
}
