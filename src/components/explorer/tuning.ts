/* ── Explorer Tuning File ───────────────────────────────────
   Edit this file to tune live explorer visuals.

   Location:
   - `src/components/explorer/tuning.ts`

   Local dev behaviour:
   - When `npm run dev` is running, saving this file should
     hot-reload the productions page almost immediately.

   How to use it:
   - Each entry in `VISUALIZER_TUNINGS` is a named preset.
   - Recipes point at one preset through `tuningKey` in
     `src/components/explorer/runtime/recipes.ts`.
   - To make a softer / brighter / denser variant, duplicate
     a preset, rename the key, then point a recipe at it.

   Working rule:
   - Put tweakable artistic knobs here.
   - Keep renderer logic inside visualizer files.
──────────────────────────────────────────────────────────────── */

export interface CongCloudOrbitTuning {
  kernel: 'cong-cloud-orbit';
  particleCount: number;
  maxBursts: number;
  maxRadiusScale: number;
  centerX: number;
  centerY: number;
  centerXMotion: number;
  centerYMotion: number;
  baseFillAlpha: number;
  bloomAlpha: number;
  burstThreshold: number;
  burstChanceScale: number;
  initialParticleScale?: number;
  particleSizeJitter?: number;
  particleColorJitter?: number;
  ringAlpha?: number;
  veilAlpha?: number;
}

export interface CongRainShowerTuning {
  kernel: 'cong-rain-shower';
  dropCount: number;
  maxPulses: number;
  orbitalWidthRatio: number;
  centerX: number;
  fillAlpha: number;
  slantBase: number;
  orbAlpha: number;
  pulseAlpha: number;
  rainSpeedScale?: number;
  dropIndependence?: number;
}

export interface CongContourLinesTuning {
  kernel: 'cong-contour-lines';
  bandCount: number;
  xStep: number;
  fillAlpha: number;
  accentGlowThreshold: number;
  accentTransientThreshold: number;
}

export interface CongPlanetCoreTuning {
  kernel: 'cong-planet-core';
  sparkCount: number;
  chordCount: number;
  maxPulses: number;
  baseFillAlpha: number;
  haloAlpha: number;
  warmHaloAlpha: number;
  planetEdgeAlpha: number;
}

export interface CongLandscapeFlowTuning {
  kernel: 'cong-landscape-flow';
  particleCount: number;
  noiseScale: number;
  speed: number;
  driftX: number;
  lineLength: number;
  baseFillAlpha: number;
  strokeAlpha: number;
  glowAlpha: number;
}

export interface CongLandscapeSpiralTuning {
  kernel: 'cong-landscape-spiral';
  armCount: number;
  maxTurns: number;
  centerX: number;
  centerY: number;
  lineAlpha: number;
  innerAlpha: number;
  baseFillAlpha: number;
  pulseAlpha: number;
}

export interface CongParticleCurrentTuning {
  kernel: 'cong-particle-current';
  particleCount: number;
  flowScale: number;
  speed: number;
  driftX: number;
  trailAlpha: number;
  accentAlpha: number;
  maxBursts: number;
}

export interface CongLateralCurrentTuning {
  kernel: 'cong-lateral-current';
  particleCount: number;
  seed: number;
  flowScale: number;
  noiseStrength: number;
  speed: number;
  trailAlpha: number;
  particleAlpha: number;
  pointSize: number;
  sizeJitter: number;
  colorJitter: number;
  lineAlpha: number;
  sunRadius: number;
  sunAlpha: number;
}

export interface CongLateralCascadeTuning {
  kernel: 'cong-lateral-cascade';
  particleCount: number;
  seed: number;
  flowScale: number;
  noiseStrength: number;
  speed: number;
  trailAlpha: number;
  particleAlpha: number;
  pointSize: number;
  sizeJitter: number;
  colorJitter: number;
  lineAlpha: number;
  colorRippleRange: number;
  colorRippleMs: number;
  eddyStrength: number;
  sparkRate: number;
  maxPulses: number;
  laneCount: number;
}

export interface CongVerticalLandscapeStreamTuning {
  kernel: 'cong-vertical-landscape-stream';
  particleCount: number;
  seed: number;
  flowScale: number;
  curlStrength: number;
  speed: number;
  shear: number;
  trailAlpha: number;
  particleAlpha: number;
  pointSize: number;
  sizeJitter: number;
  colorJitter: number;
  lineAlpha: number;
  streakLength: number;
  ridgeCount: number;
  ridgeAlpha: number;
  laneCount: number;
  maxPulses: number;
}

export interface CongGreenGalaxyTuning {
  kernel: 'cong-green-galaxy';
  particleCount: number;
  centerX: number;
  centerY: number;
  radiusScale: number;
  speed: number;
  trailAlpha: number;
  rayAlpha: number;
  maxBursts: number;
}

export interface CongChordStormTuning {
  kernel: 'cong-chord-storm';
  particleCount: number;
  centerX: number;
  centerY: number;
  radiusScale: number;
  speed: number;
  trailAlpha: number;
  chordAlpha: number;
  maxBursts: number;
}

export interface CongTopBottomStormTuning {
  kernel: 'cong-top-bottom-storm';
  particleCount: number;
  speed: number;
  sway: number;
  trailAlpha: number;
  accentAlpha: number;
  maxBursts: number;
}

export interface CongMistFieldTuning {
  kernel: 'cong-mist-field';
  layerCount: number;
  baseAlpha: number;
  layerSpacing: number;
  noiseScale: number;
  moteCount: number;
  moteAlpha: number;
  ridgeCount: number;
  ridgeAlpha: number;
  driftStrength: number;
}

export interface CongHorizonFieldTuning {
  kernel: 'cong-horizon-field';
  particleCount: number;
  ridgeCount: number;
  filamentLimit: number;
  flowScale: number;
  warpScale: number;
  warpStrength: number;
  speed: number;
  horizonY: number;
  mirrorAlpha: number;
  trailAlpha: number;
  haloAlpha: number;
  maxBursts: number;
}

export interface CongWaterlineShimmerTuning {
  kernel: 'cong-waterline-shimmer';
  lineCount: number;
  baseAlpha: number;
  verticalSpread: number;
  particleCount: number;
  particleAlpha: number;
  particleSpeed: number;
  burstSize: number;
}

export interface CongGrainErosionTuning {
  kernel: 'cong-grain-erosion';
  gridSize: number;
  baseAlpha: number;
}

export interface CongWanderingLinesTuning {
  kernel: 'cong-wandering-lines';
  lineCount: number;
  pointsPerLine: number;
  baseAlpha: number;
}

export interface CongBrokenGridTuning {
  kernel: 'cong-broken-grid';
  cellSize: number;
  baseAlpha: number;
  breakChance: number;
}

export interface CongSparseConstellationTuning {
  kernel: 'cong-sparse-constellation';
  pairCount: number;
  baseAlpha: number;
  connectionChance: number;
}

export interface CongEmberGeologyTuning {
  kernel: 'cong-ember-geology';
  plateCount: number;
  faultCount: number;
  sparkCount: number;
  baseAlpha: number;
  heatAlpha: number;
}

export interface CongArtworkDatamoshTuning {
  kernel: 'cong-artwork-datamosh';
  sampleWidth: number;
  sampleHeight: number;
  sliceCount: number;
  displacement: number;
  blockSize: number;
  feedbackAlpha: number;
  channelOffset: number;
  sectionEvolution: number;
  transientDisplacement: number;
  staticMotionScale?: number;
  idleMotionAmount?: number;
  corruptionIntensity?: number;
  fractureBaseline?: number;
  feedbackAmount?: number;
  smearPersistence?: number;
  beatSensitivity?: number;
  freezeChance?: number;
  compressionScale?: number;
  horizontalSyncCap?: number;
  enabledPasses?: readonly ('feedback' | 'smear' | 'blocks' | 'scanTear' | 'channelLag' | 'ghost' | 'freeze' | 'compression' | 'sync' | 'drift' | 'vectorWarp' | 'pixelSort' | 'slitScan' | 'ditherDrift')[];
  pixelSortStrength?: number;
  pixelSortBandCount?: number;
  pixelSortThreshold?: number;
  pixelSortDecayMs?: number;
  slitScanStrength?: number;
  slitScanDepth?: number;
  slitScanBands?: number;
  slitScanRate?: number;
  slitScanAxis?: 'horizontal' | 'vertical';
  ditherAmount?: number;
  ditherLevels?: number;
  ditherDriftSpeed?: number;
  rainParticleCount?: number;
  rainFallSpeed?: number;
  rainMinSize?: number;
  rainMaxSize?: number;
  rainMinAlpha?: number;
  rainMaxAlpha?: number;
  rainSectionIndex?: number;
  rainColorMorphMs?: number;
  rainColorReleaseMode?: 'all-at-once' | 'one-by-one';
  blockLayerChance?: number;
  blockOpacityScale?: number;
  blockShapeMode?: 'mixed' | 'shards' | 'bars' | 'soft';
  blockSectionMask?: readonly number[];
  leftFlowParticleCount?: number;
  leftFlowEntrySection?: number;
  leftFlowCoverTarget?: number;
  leftFlowSpeed?: number;
  leftFlowLineLength?: number;
  leftFlowAlpha?: number;
  leftFlowPointSize?: number;
  leftFlowColorShift?: number;
  leftFlowEvolutionStrength?: number;
  leftFlowReformSection?: number;
  leftFlowReformStrength?: number;
  leftFlowReformDurationMs?: number;
  effectIntensity?: number;
  moshWaveSpeed?: number;
  moshWaveWidth?: number;
  vectorWarpStrength?: number;
  vectorWarpScale?: number;
  vectorWarpCurl?: number;
  vectorWarpSectionMask?: readonly number[];
  pixelIslandCount?: number;
  scanBloomStrength?: number;
  chromaticFaultStrength?: number;
  memorySmearDecay?: number;
  stormParticleCount?: number;
  stormEntrySection?: number;
  stormPeakSection?: number;
  stormSettleSection?: number;
  stormSpeed?: number;
  stormSway?: number;
  stormAlpha?: number;
  stormMirrorAlpha?: number;
  stormLineAlpha?: number;
  stormTopColorBias?: number;
  stormBottomColorBias?: number;
  stormArtworkColorMix?: number;
}

export interface CongArtworkParticleMangleTuning {
  kernel: 'cong-artwork-particle-mangle';
  sampleWidth: number;
  sampleHeight: number;
  particleCount: number;
  particleSize: number;
  feedbackAlpha: number;
  scatter: number;
  shear: number;
  vortex: number;
  blockTearCount: number;
  sectionEvolution: number;
  transientScatter: number;
}

export interface CongBatcapeGridTuning {
  kernel: 'cong-batcape-grid';
  gridSize: number;       // default 35, matches original batcape() gridSize
  rectSize: number;       // default 3, matches original s.rect 3×3
  baseAlpha: number;      // default 0.08
  flickerSpeed: number;   // default 0.9
}

export type CongGenerativeParticleMode = 'landscape-og' | 'cloud-again' | 'galaxy' | 'storm' | 'chord-storm';
export type CongGenerativeParticleEmitter = 'left-edge' | 'orbital-cloud' | 'field-scatter' | 'top-bottom' | 'center-burst';
export type CongGenerativeParticleField = 'landscape-dual-flow' | 'curl-noise' | 'orbital-fall' | 'vertical-sway';
export type CongGenerativeParticleRenderer = 'points' | 'streaks' | 'cloud-puffs' | 'mirrored-points' | 'rays' | 'chords';
export type CongGenerativeParticleBlendMode = 'source-over' | 'lighter' | 'screen';
export type CongGenerativeParticleOverlay = 'bouncing-lines' | 'random-chords' | 'grid-rays';

export interface CongGenerativeParticlesTuning {
  kernel: 'cong-generative-particles';
  mode: CongGenerativeParticleMode;
  particleCount: number;
  seed: number;
  noiseOctaves: number;
  noiseFalloff: number;
  fieldScale: number;
  fieldStrength: number;
  speed: number;
  trailAlpha: number;
  blendMode: CongGenerativeParticleBlendMode;
  emitter: CongGenerativeParticleEmitter;
  field: CongGenerativeParticleField;
  renderer: CongGenerativeParticleRenderer;
  feedbackBlur: number;
  particleAlpha: number;
  pointSize: number;
  streakLength: number;
  centerX: number;
  centerY: number;
  laneSeparation: number;
  overlayAlpha: number;
  overlays: readonly CongGenerativeParticleOverlay[];
  maxBursts: number;
  lineworkAlpha?: number;
  particleStrokeAlpha?: number;
  particleSizeJitter?: number;
  particleColorJitter?: number;
  releaseOnCue?: boolean;
  initialParticleAlpha?: number;
  releaseDurationMs?: number;
  releaseMode?: 'all-at-once' | 'one-by-one';
  centerFormAlpha?: number;
  centerHaloRadius?: number;
  centerCoreAlpha?: number;
  centerCoreRadius?: number;
  centerOcclusionRadius?: number;
  centerOcclusionStrength?: number;
  leftEntrySpread?: number;
  coverageGrowthSeconds?: number;
  coverageCueBoost?: number;
  verticalPullStrength?: number;
}

export interface NativeKaleidoFoldTuning {
  kernel: 'native-kaleido-fold';
  foldCount: number;
  foldDriftSpeed: number;
  wedgeParticleCount: number;
  seamGlow: number;
  centerVeil: number;
  bufferScale: number;
}

export interface NativeReactionVeilTuning {
  kernel: 'native-reaction-veil';
  gridScale: number;
  feed: number;
  kill: number;
  iterationsPerFrame: number;
  injectStrength: number;
  veilAlpha: number;
}

export interface NativeAttractorDriftTuning {
  kernel: 'native-attractor-drift';
  stepsPerFrame: number;
  fadeAlpha: number;
  coeffDriftSpeed: number;
  pointAlpha: number;
  scale: number;
  warmMix: number;
  widthGrowth: number;
  heightGrowth: number;
  growthSpeed: number;
  onsetGrowth: number;
}

export interface NativeNightfallRidgesTuning {
  kernel: 'native-nightfall-ridges';
  ridgeCountBase: number;
  ridgeCountMax: number;
  sampleStep: number;
  ridgeAmp: number;
  parallaxSpread: number;
  fogAlpha: number;
  rimAlpha: number;
  glintDensity: number;
  fillAlpha: number;
  distantLayerCount: number;
  distantLandscapeAlpha: number;
  shootingStarCount: number;
  shootingStarAlpha: number;
}

export interface NativeAuroraVeilTuning {
  kernel: 'native-aurora-veil';
  gridScale: number;
  baseFreq: number;
  warpFreq: number;
  warpStrength: number;
  anisotropy: number;
  driftSpeed: number;
  veilAlpha: number;
  tensionMix: number;
}

export interface NativeSidewindDriftTuning {
  kernel: 'native-sidewind-drift';
  moteCount: number;
  windBase: number;
  gustSpeed: number;
  gustAmp: number;
  windAngleDeg: number;
  horizonY: number;
  horizonAlpha: number;
  streakLength: number;
  moteAlpha: number;
  fillAlpha: number;
}

export interface NativeGravityCurrentTuning {
  kernel: 'native-gravity-current';
  particleCount: number;
  wellCountBase: number;
  wellStrength: number;
  swirl: number;
  flowScale: number;
  trailFade: number;
  segmentAlpha: number;
  rippleSpeed: number;
}

export interface ThreeCurlFlowTuning {
  kernel: 'three-curl-flow';
  maxInstances: number;     // upper bound on points (runtime drawRange scales below this)
  integrationSteps: number; // curl streamline steps (build-time shader constant)
  noiseScale: number;       // spatial frequency of the curl field
  flowSpeed: number;        // life-loop advance rate
  stepLength: number;       // per-step advection distance in normalized units
  pointSize: number;        // base sprite size (px, pre pixel-ratio)
  additiveAlpha: number;    // global additive intensity
}

export interface ThreeVolumetricFogTuning {
  kernel: 'three-volumetric-fog';
  maxSteps: number;       // raymarch step ceiling (runtime uSteps scales below this)
  densityScale: number;   // base fog coverage
  noiseScale: number;     // spatial frequency of the density volume
  driftSpeed: number;     // domain advection rate
  lightStrength: number;  // self-shadow scatter intensity
  additiveAlpha: number;  // emissive gain
}

export interface ThreeCausticsTuning {
  kernel: 'three-caustics';
  maxLayers: number;      // ridged-noise layer ceiling (runtime uLayers scales below)
  noiseScale: number;     // spatial frequency of the caustic field
  warpAmount: number;     // refractive uv warp strength
  flowSpeed: number;      // animation rate
  sharpness: number;      // ridge sharpness (glint contrast)
  additiveAlpha: number;  // glint additive gain
}

export interface ThreeFresnelCoreTuning {
  kernel: 'three-fresnel-core';
  coreRadius: number;   // normalised SDF sphere radius (0..1 screen-height units)
  rimWidth: number;     // Fresnel rim falloff width relative to radius
  glowRadius: number;   // outer glow cloud extent relative to radius
}

export interface ThreeArtworkFluxTuning {
  kernel: 'three-artwork-flux';
  memory: number;               // feedback persistence
  displacement: number;         // noise/curl displacement strength
  reveal: number;               // artwork-vs-procedural material mix
  chromaticAberration: number;  // horizontal channel split amount
  vignette: number;             // display pass edge darkening
}

export type VisualizerTuningConfig =
  | CongCloudOrbitTuning
  | CongRainShowerTuning
  | CongContourLinesTuning
  | CongPlanetCoreTuning
  | CongLandscapeFlowTuning
  | CongLandscapeSpiralTuning
  | CongParticleCurrentTuning
  | CongLateralCurrentTuning
  | CongGreenGalaxyTuning
  | CongChordStormTuning
  | CongTopBottomStormTuning
  | CongGenerativeParticlesTuning
  | CongMistFieldTuning
  | CongHorizonFieldTuning
  | CongWaterlineShimmerTuning
  | CongGrainErosionTuning
  | CongLateralCascadeTuning
  | CongVerticalLandscapeStreamTuning
  | CongWanderingLinesTuning
  | CongBrokenGridTuning
  | CongSparseConstellationTuning
  | CongEmberGeologyTuning
  | CongArtworkDatamoshTuning
  | CongArtworkParticleMangleTuning
  | CongBatcapeGridTuning
  | NativeKaleidoFoldTuning
  | NativeReactionVeilTuning
  | NativeAttractorDriftTuning
  | NativeNightfallRidgesTuning
  | NativeAuroraVeilTuning
  | NativeSidewindDriftTuning
  | NativeGravityCurrentTuning
  | ThreeCurlFlowTuning
  | ThreeVolumetricFogTuning
  | ThreeCausticsTuning
  | ThreeArtworkFluxTuning
  | ThreeFresnelCoreTuning;

export const VISUALIZER_TUNINGS = {
  'cong-cloud-orbit-default': {
    kernel: 'cong-cloud-orbit',
    particleCount: 980,
    maxBursts: 5,
    maxRadiusScale: 0.38,
    centerX: 0.34,
    centerY: 0.42,
    centerXMotion: 0.04,
    centerYMotion: 0.05,
    baseFillAlpha: 0.06,
    bloomAlpha: 0.08,
    burstThreshold: 0.22,
    burstChanceScale: 0.22,
  },
  'cong-cloud-orbit-lite': {
    kernel: 'cong-cloud-orbit',
    particleCount: 1800,
    maxBursts: 7,
    maxRadiusScale: 0.34,
    centerX: 0.38,
    centerY: 0.4,
    centerXMotion: 0.028,
    centerYMotion: 0.035,
    baseFillAlpha: 0.035,
    bloomAlpha: 0.052,
    burstThreshold: 0.3,
    burstChanceScale: 0.16,
    initialParticleScale: 0.42,
    particleSizeJitter: 0.75,
    particleColorJitter: 14,
    ringAlpha: 0.035,
    veilAlpha: 0.045,
  },
  'cong-rain-shower-default': {
    kernel: 'cong-rain-shower',
    dropCount: 1180,
    maxPulses: 8,
    orbitalWidthRatio: 0.24,
    centerX: 0.36,
    fillAlpha: 0.08,
    slantBase: 3,
    orbAlpha: 0.055,
    pulseAlpha: 0,
    rainSpeedScale: 0.58,
    dropIndependence: 0.86,
  },
  'cong-contour-lines-default': {
    kernel: 'cong-contour-lines',
    bandCount: 28,
    xStep: 24,
    fillAlpha: 0.05,
    accentGlowThreshold: 0.25,
    accentTransientThreshold: 0.08,
  },
  'cong-planet-core-default': {
    kernel: 'cong-planet-core',
    sparkCount: 300,
    chordCount: 24,
    maxPulses: 6,
    baseFillAlpha: 0.035,
    haloAlpha: 0.14,
    warmHaloAlpha: 0.05,
    planetEdgeAlpha: 0.12,
  },
  'cong-landscape-flow-default': {
    kernel: 'cong-landscape-flow',
    particleCount: 620,
    noiseScale: 0.0018,
    speed: 54,
    driftX: 28,
    lineLength: 12,
    baseFillAlpha: 0.032,
    strokeAlpha: 0.12,
    glowAlpha: 0.08,
  },
  'cong-landscape-spiral-default': {
    kernel: 'cong-landscape-spiral',
    armCount: 5,
    maxTurns: 21,
    centerX: 0.38,
    centerY: 0.5,
    lineAlpha: 0.12,
    innerAlpha: 0.16,
    baseFillAlpha: 0.03,
    pulseAlpha: 0,
  },
  'cong-particle-current-default': {
    kernel: 'cong-particle-current',
    particleCount: 760,
    flowScale: 0.0028,
    speed: 0.82,
    driftX: 18,
    trailAlpha: 0.045,
    accentAlpha: 0.08,
    maxBursts: 6,
  },
  'cong-lateral-current-default': {
    kernel: 'cong-lateral-current',
    particleCount: 4300,
    seed: 6841,
    flowScale: 0.0021,
    noiseStrength: 0.96,
    speed: 72,
    trailAlpha: 0.046,
    particleAlpha: 0.56,
    pointSize: 0.56,
    sizeJitter: 1.18,
    colorJitter: 12,
    lineAlpha: 0.065,
    sunRadius: 0.118,
    sunAlpha: 0.62,
  },
  'cong-lateral-cascade-default': {
    kernel: 'cong-lateral-cascade',
    particleCount: 7200,
    seed: 9167,
    flowScale: 0.00185,
    noiseStrength: 1.08,
    speed: 78,
    trailAlpha: 0.038,
    particleAlpha: 0.58,
    pointSize: 0.48,
    sizeJitter: 1.08,
    colorJitter: 15,
    lineAlpha: 0.072,
    colorRippleRange: 0.86,
    colorRippleMs: 8400,
    eddyStrength: 1.28,
    sparkRate: 9,
    maxPulses: 10,
    laneCount: 9,
  },
  'cong-vertical-landscape-stream-default': {
    kernel: 'cong-vertical-landscape-stream',
    particleCount: 6200,
    seed: 11821,
    flowScale: 0.00235,
    curlStrength: 0.88,
    speed: 82,
    shear: 1.16,
    trailAlpha: 0.041,
    particleAlpha: 0.64,
    pointSize: 0.5,
    sizeJitter: 1.12,
    colorJitter: 16,
    lineAlpha: 0.92,
    streakLength: 15,
    ridgeCount: 7,
    ridgeAlpha: 0.034,
    laneCount: 13,
    maxPulses: 9,
  },
  'cong-green-galaxy-default': {
    kernel: 'cong-green-galaxy',
    particleCount: 580,
    centerX: 0.35,
    centerY: 0.45,
    radiusScale: 0.82,
    speed: 0.72,
    trailAlpha: 0.04,
    rayAlpha: 0.055,
    maxBursts: 6,
  },
  'cong-chord-storm-default': {
    kernel: 'cong-chord-storm',
    particleCount: 520,
    centerX: 0.37,
    centerY: 0.48,
    radiusScale: 0.76,
    speed: 0.82,
    trailAlpha: 0.036,
    chordAlpha: 0.1,
    maxBursts: 7,
  },
  'cong-top-bottom-storm-default': {
    kernel: 'cong-top-bottom-storm',
    particleCount: 920,
    speed: 0.82,
    sway: 34,
    trailAlpha: 0.055,
    accentAlpha: 0.075,
    maxBursts: 7,
  },
  'cong-landscape-og-current-default': {
    kernel: 'cong-generative-particles',
    mode: 'landscape-og',
    particleCount: 980,
    seed: 1729,
    noiseOctaves: 5,
    noiseFalloff: 0.56,
    fieldScale: 0.0062,
    fieldStrength: 1.18,
    speed: 68,
    trailAlpha: 0.055,
    blendMode: 'lighter',
    emitter: 'left-edge',
    field: 'landscape-dual-flow',
    renderer: 'streaks',
    feedbackBlur: 0,
    particleAlpha: 0.72,
    pointSize: 1.15,
    streakLength: 16,
    centerX: 0.34,
    centerY: 0.48,
    laneSeparation: 0.54,
    overlayAlpha: 0.05,
    lineworkAlpha: 1,
    particleStrokeAlpha: 0.08,
    particleSizeJitter: 0.28,
    particleColorJitter: 22,
    centerFormAlpha: 0.11,
    centerHaloRadius: 0.22,
    centerCoreAlpha: 0.12,
    centerCoreRadius: 0.036,
    centerOcclusionRadius: 0.17,
    centerOcclusionStrength: 0.82,
    leftEntrySpread: 0.58,
    coverageGrowthSeconds: 92,
    coverageCueBoost: 0.18,
    overlays: [],
    maxBursts: 6,
  },
  'cong-cloud-again-generative-default': {
    kernel: 'cong-generative-particles',
    mode: 'cloud-again',
    particleCount: 1060,
    seed: 2407,
    noiseOctaves: 4,
    noiseFalloff: 0.5,
    fieldScale: 0.0036,
    fieldStrength: 0.86,
    speed: 46,
    trailAlpha: 0.048,
    blendMode: 'screen',
    emitter: 'left-edge',
    field: 'landscape-dual-flow',
    renderer: 'cloud-puffs',
    feedbackBlur: 0.7,
    particleAlpha: 0.62,
    pointSize: 2.4,
    streakLength: 11,
    centerX: 0.5,
    centerY: 0.5,
    laneSeparation: 0.72,
    leftEntrySpread: 0.96,
    verticalPullStrength: 0.06,
    coverageGrowthSeconds: 6,
    coverageCueBoost: 0.18,
    overlayAlpha: 0.09,
    particleStrokeAlpha: 0.045,
    particleSizeJitter: 0.3,
    particleColorJitter: 20,
    overlays: [],
    maxBursts: 5,
  },
  'cong-cloud-again-intro-generative': {
    kernel: 'cong-generative-particles',
    mode: 'cloud-again',
    particleCount: 860,
    seed: 2411,
    noiseOctaves: 4,
    noiseFalloff: 0.48,
    fieldScale: 0.0032,
    fieldStrength: 0.76,
    speed: 36,
    trailAlpha: 0.04,
    blendMode: 'screen',
    emitter: 'orbital-cloud',
    field: 'orbital-fall',
    renderer: 'cloud-puffs',
    feedbackBlur: 0.9,
    particleAlpha: 0.58,
    pointSize: 2.7,
    streakLength: 10,
    centerX: 0.34,
    centerY: 0.4,
    laneSeparation: 0.38,
    overlayAlpha: 0.07,
    particleStrokeAlpha: 0.035,
    particleSizeJitter: 0.26,
    particleColorJitter: 18,
    overlays: [],
    maxBursts: 4,
  },
  'cong-cloud-again-lines': {
    kernel: 'cong-generative-particles',
    mode: 'cloud-again',
    particleCount: 980,
    seed: 2423,
    noiseOctaves: 5,
    noiseFalloff: 0.54,
    fieldScale: 0.0044,
    fieldStrength: 0.9,
    speed: 42,
    trailAlpha: 0.044,
    blendMode: 'screen',
    emitter: 'orbital-cloud',
    field: 'orbital-fall',
    renderer: 'cloud-puffs',
    feedbackBlur: 0.5,
    particleAlpha: 0.6,
    pointSize: 2.15,
    streakLength: 12,
    centerX: 0.35,
    centerY: 0.43,
    laneSeparation: 0.44,
    overlayAlpha: 0.1,
    lineworkAlpha: 1,
    particleStrokeAlpha: 0.045,
    particleSizeJitter: 0.32,
    particleColorJitter: 22,
    overlays: ['bouncing-lines'],
    maxBursts: 5,
  },
  'cong-cloud-again-peak': {
    kernel: 'cong-generative-particles',
    mode: 'chord-storm',
    particleCount: 820,
    seed: 2437,
    noiseOctaves: 5,
    noiseFalloff: 0.56,
    fieldScale: 0.0048,
    fieldStrength: 0.9,
    speed: 50,
    trailAlpha: 0.043,
    blendMode: 'lighter',
    emitter: 'center-burst',
    field: 'curl-noise',
    renderer: 'cloud-puffs',
    feedbackBlur: 0.25,
    particleAlpha: 0.58,
    pointSize: 1.9,
    streakLength: 12,
    centerX: 0.38,
    centerY: 0.48,
    laneSeparation: 0.54,
    overlayAlpha: 0.13,
    lineworkAlpha: 1,
    particleStrokeAlpha: 0.065,
    particleSizeJitter: 0.36,
    particleColorJitter: 26,
    overlays: ['random-chords'],
    maxBursts: 5,
  },
  'cong-green-galaxy-generative': {
    kernel: 'cong-generative-particles',
    mode: 'galaxy',
    particleCount: 900,
    seed: 3511,
    noiseOctaves: 4,
    noiseFalloff: 0.52,
    fieldScale: 0.004,
    fieldStrength: 0.96,
    speed: 52,
    trailAlpha: 0.044,
    blendMode: 'screen',
    emitter: 'field-scatter',
    field: 'orbital-fall',
    renderer: 'rays',
    feedbackBlur: 0.4,
    particleAlpha: 0.68,
    pointSize: 1.6,
    streakLength: 14,
    centerX: 0.36,
    centerY: 0.46,
    laneSeparation: 0.5,
    overlayAlpha: 0.075,
    lineworkAlpha: 0.85,
    particleStrokeAlpha: 0.08,
    particleSizeJitter: 0.42,
    particleColorJitter: 34,
    overlays: ['grid-rays'],
    maxBursts: 6,
  },
  'cong-chord-storm-generative': {
    kernel: 'cong-generative-particles',
    mode: 'chord-storm',
    particleCount: 700,
    seed: 4517,
    noiseOctaves: 5,
    noiseFalloff: 0.54,
    fieldScale: 0.005,
    fieldStrength: 0.94,
    speed: 58,
    trailAlpha: 0.046,
    blendMode: 'lighter',
    emitter: 'center-burst',
    field: 'curl-noise',
    renderer: 'chords',
    feedbackBlur: 0.2,
    particleAlpha: 0.64,
    pointSize: 1.35,
    streakLength: 14,
    centerX: 0.38,
    centerY: 0.5,
    laneSeparation: 0.62,
    overlayAlpha: 0.12,
    lineworkAlpha: 1,
    particleStrokeAlpha: 0.075,
    particleSizeJitter: 0.42,
    particleColorJitter: 32,
    overlays: ['random-chords'],
    maxBursts: 8,
  },
  'cong-top-bottom-storm-generative': {
    kernel: 'cong-generative-particles',
    mode: 'storm',
    particleCount: 1040,
    seed: 5521,
    noiseOctaves: 4,
    noiseFalloff: 0.5,
    fieldScale: 0.0046,
    fieldStrength: 0.78,
    speed: 74,
    trailAlpha: 0.06,
    blendMode: 'lighter',
    emitter: 'top-bottom',
    field: 'vertical-sway',
    renderer: 'mirrored-points',
    feedbackBlur: 0,
    particleAlpha: 0.58,
    pointSize: 1.28,
    streakLength: 10,
    centerX: 0.34,
    centerY: 0.5,
    laneSeparation: 0.64,
    overlayAlpha: 0.08,
    lineworkAlpha: 0,
    particleStrokeAlpha: 0,
    particleSizeJitter: 0.3,
    particleColorJitter: 18,
    releaseOnCue: false,
    initialParticleAlpha: 1,
    releaseDurationMs: 3600,
    releaseMode: 'one-by-one',
    centerFormAlpha: 0.28,
    overlays: [],
    maxBursts: 7,
  },
  'cong-top-bottom-storm-section-template': {
    kernel: 'cong-generative-particles',
    mode: 'storm',
    particleCount: 4400,
    seed: 5521,
    noiseOctaves: 4,
    noiseFalloff: 0.5,
    fieldScale: 0.0049,
    fieldStrength: 0.5,
    speed: 40,
    trailAlpha: 0.056,
    blendMode: 'lighter',
    emitter: 'top-bottom',
    field: 'vertical-sway',
    renderer: 'mirrored-points',
    feedbackBlur: 0,
    particleAlpha: 0.46,
    pointSize: 0.62,
    streakLength: 4,
    centerX: 0.36,
    centerY: 0.5,
    laneSeparation: 0.64,
    overlayAlpha: 0.046,
    lineworkAlpha: 0,
    particleStrokeAlpha: 0,
    particleSizeJitter: 0.9,
    particleColorJitter: 18,
    releaseOnCue: true,
    initialParticleAlpha: 0.22,
    releaseDurationMs: 5200,
    releaseMode: 'one-by-one',
    centerFormAlpha: 0.18,
    centerHaloRadius: 0.19,
    centerCoreAlpha: 0.13,
    centerCoreRadius: 0.034,
    overlays: [],
    maxBursts: 7,
  },
  'cong-mist-field-default': {
    kernel: 'cong-mist-field',
    layerCount: 12,
    baseAlpha: 0.072,
    layerSpacing: 0.12,
    noiseScale: 0.0018,
    moteCount: 240,
    moteAlpha: 0.11,
    ridgeCount: 5,
    ridgeAlpha: 0.18,
    driftStrength: 18,
  },
  'cong-horizon-field-default': {
    kernel: 'cong-horizon-field',
    particleCount: 840,
    ridgeCount: 7,
    filamentLimit: 18,
    flowScale: 0.0016,
    warpScale: 0.0032,
    warpStrength: 0.072,
    speed: 0.72,
    horizonY: 0.52,
    mirrorAlpha: 0.44,
    trailAlpha: 0.072,
    haloAlpha: 0.09,
    maxBursts: 7,
  },
  'cong-waterline-shimmer-default': {
    kernel: 'cong-waterline-shimmer',
    lineCount: 64,
    baseAlpha: 0.038,
    verticalSpread: 0.92,
    particleCount: 1120,
    particleAlpha: 0.16,
    particleSpeed: 46,
    burstSize: 34,
  },
  'cong-grain-erosion-default': {
    kernel: 'cong-grain-erosion',
    gridSize: 16,
    baseAlpha: 0.068,
  },
  'cong-wandering-lines-default': {
    kernel: 'cong-wandering-lines',
    lineCount: 28,
    pointsPerLine: 40,
    baseAlpha: 0.052,
  },
  'cong-broken-grid-default': {
    kernel: 'cong-broken-grid',
    cellSize: 38,
    baseAlpha: 0.046,
    breakChance: 0.26,
  },
  'cong-sparse-constellation-default': {
    kernel: 'cong-sparse-constellation',
    pairCount: 48,
    baseAlpha: 0.052,
    connectionChance: 0.66,
  },
  'cong-ember-geology-default': {
    kernel: 'cong-ember-geology',
    plateCount: 15,
    faultCount: 68,
    sparkCount: 210,
    baseAlpha: 0.072,
    heatAlpha: 0.16,
  },
  'cong-artwork-datamosh-default': {
    kernel: 'cong-artwork-datamosh',
    sampleWidth: 240,
    sampleHeight: 180,
    sliceCount: 42,
    displacement: 78,
    blockSize: 34,
    feedbackAlpha: 0.18,
    channelOffset: 10,
    sectionEvolution: 0.74,
    transientDisplacement: 64,
    idleMotionAmount: 0.52,
    corruptionIntensity: 0.42,
    feedbackAmount: 0.95,
    smearPersistence: 0.58,
    beatSensitivity: 1,
    freezeChance: 0.025,
    compressionScale: 0.26,
    effectIntensity: 0.32,
    moshWaveSpeed: 0.58,
    moshWaveWidth: 0.2,
    vectorWarpStrength: 0.12,
    vectorWarpScale: 0.42,
    vectorWarpCurl: 0.42,
    vectorWarpSectionMask: [2, 3, 4, 5, 6],
    pixelIslandCount: 26,
    scanBloomStrength: 0.3,
    chromaticFaultStrength: 0.34,
    memorySmearDecay: 0.18,
    horizontalSyncCap: 0.16,
  },
  'cong-artwork-datamosh-rain-evolution': {
    kernel: 'cong-artwork-datamosh',
    sampleWidth: 270,
    sampleHeight: 198,
    sliceCount: 58,
    displacement: 56,
    blockSize: 22,
    feedbackAlpha: 0.115,
    channelOffset: 6,
    sectionEvolution: 0.5,
    transientDisplacement: 72,
    staticMotionScale: 0.56,
    idleMotionAmount: 0.72,
    corruptionIntensity: 0.56,
    feedbackAmount: 1.08,
    smearPersistence: 0.64,
    beatSensitivity: 1.52,
    freezeChance: 0.018,
    compressionScale: 0.3,
    rainParticleCount: 360,
    rainFallSpeed: 116,
    rainMinSize: 0.45,
    rainMaxSize: 2.1,
    rainMinAlpha: 0.030,
    rainMaxAlpha: 0.14,
    rainSectionIndex: 4,
    rainColorMorphMs: 11500,
    rainColorReleaseMode: 'one-by-one',
    blockLayerChance: 0.28,
    blockOpacityScale: 0.44,
    blockShapeMode: 'mixed',
    blockSectionMask: [2, 4, 6],
    leftFlowParticleCount: 720,
    leftFlowEntrySection: 3,
    leftFlowCoverTarget: 0.34,
    leftFlowSpeed: 48,
    leftFlowLineLength: 8,
    leftFlowAlpha: 0.045,
    leftFlowPointSize: 0.72,
    leftFlowColorShift: 0.5,
    leftFlowEvolutionStrength: 0.48,
    leftFlowReformSection: 5,
    leftFlowReformStrength: 0.5,
    leftFlowReformDurationMs: 11000,
    effectIntensity: 0.64,
    moshWaveSpeed: 0.42,
    moshWaveWidth: 0.18,
    vectorWarpStrength: 0.24,
    vectorWarpScale: 0.48,
    vectorWarpCurl: 0.56,
    vectorWarpSectionMask: [2, 3, 4, 5, 6],
    pixelIslandCount: 0,
    scanBloomStrength: 0.38,
    chromaticFaultStrength: 0.28,
    memorySmearDecay: 0.14,
    stormParticleCount: 420,
    stormEntrySection: 2,
    stormPeakSection: 5,
    stormSettleSection: 6,
    stormSpeed: 0.48,
    stormSway: 18,
    stormAlpha: 0.035,
    stormMirrorAlpha: 0.12,
    stormLineAlpha: 0.018,
    stormTopColorBias: 0.7,
    stormBottomColorBias: 0.74,
    stormArtworkColorMix: 0.18,
    horizontalSyncCap: 0.14,
  },
  'cong-artwork-mosh-soft-scan': {
    kernel: 'cong-artwork-datamosh',
    sampleWidth: 280,
    sampleHeight: 206,
    sliceCount: 34,
    displacement: 34,
    blockSize: 42,
    feedbackAlpha: 0.09,
    channelOffset: 4,
    sectionEvolution: 0.34,
    transientDisplacement: 44,
    staticMotionScale: 0.52,
    idleMotionAmount: 0.62,
    corruptionIntensity: 0.46,
    feedbackAmount: 1.16,
    smearPersistence: 0.7,
    beatSensitivity: 1.28,
    freezeChance: 0.008,
    compressionScale: 0.34,
    blockLayerChance: 0.18,
    blockOpacityScale: 0.34,
    blockShapeMode: 'soft',
    blockSectionMask: [2, 4],
    effectIntensity: 0.56,
    moshWaveSpeed: 0.34,
    moshWaveWidth: 0.18,
    vectorWarpStrength: 0.08,
    vectorWarpScale: 0.34,
    vectorWarpCurl: 0.32,
    vectorWarpSectionMask: [2, 4],
    pixelIslandCount: 16,
    scanBloomStrength: 0.68,
    chromaticFaultStrength: 0.18,
    memorySmearDecay: 0.16,
    horizontalSyncCap: 0.1,
  },
  'cong-artwork-mosh-horizontal-slice': {
    kernel: 'cong-artwork-datamosh',
    sampleWidth: 270,
    sampleHeight: 198,
    sliceCount: 76,
    displacement: 92,
    blockSize: 24,
    feedbackAlpha: 0.105,
    channelOffset: 7,
    sectionEvolution: 0.62,
    transientDisplacement: 68,
    staticMotionScale: 0.38,
    idleMotionAmount: 0.56,
    corruptionIntensity: 0.68,
    feedbackAmount: 1,
    smearPersistence: 0.52,
    beatSensitivity: 1.08,
    freezeChance: 0.03,
    compressionScale: 0.25,
    blockLayerChance: 0.44,
    blockOpacityScale: 0.58,
    blockShapeMode: 'bars',
    blockSectionMask: [1, 2, 4],
    effectIntensity: 0.74,
    moshWaveSpeed: 0.74,
    moshWaveWidth: 0.19,
    vectorWarpStrength: 0.16,
    vectorWarpScale: 0.42,
    vectorWarpCurl: 0.44,
    vectorWarpSectionMask: [2, 3, 4, 5],
    pixelIslandCount: 36,
    scanBloomStrength: 0.56,
    chromaticFaultStrength: 0.58,
    memorySmearDecay: 0.11,
  },
  'cong-artwork-mosh-pixel-islands': {
    kernel: 'cong-artwork-datamosh',
    sampleWidth: 260,
    sampleHeight: 196,
    sliceCount: 36,
    displacement: 48,
    blockSize: 28,
    feedbackAlpha: 0.12,
    channelOffset: 6,
    sectionEvolution: 0.58,
    transientDisplacement: 44,
    staticMotionScale: 0.34,
    idleMotionAmount: 0.54,
    corruptionIntensity: 0.58,
    feedbackAmount: 1.04,
    smearPersistence: 0.62,
    beatSensitivity: 0.9,
    freezeChance: 0.026,
    compressionScale: 0.28,
    blockLayerChance: 0.34,
    blockOpacityScale: 0.5,
    blockShapeMode: 'mixed',
    blockSectionMask: [2, 3, 5],
    effectIntensity: 0.68,
    moshWaveSpeed: 0.48,
    moshWaveWidth: 0.24,
    vectorWarpStrength: 0.14,
    vectorWarpScale: 0.4,
    vectorWarpCurl: 0.48,
    vectorWarpSectionMask: [2, 3, 5],
    pixelIslandCount: 140,
    fractureBaseline: 0.32,
    scanBloomStrength: 0.48,
    chromaticFaultStrength: 0.38,
    memorySmearDecay: 0.12,
    horizontalSyncCap: 0.18,
  },
  'cong-artwork-mosh-left-flow': {
    kernel: 'cong-artwork-datamosh',
    sampleWidth: 260,
    sampleHeight: 190,
    sliceCount: 44,
    displacement: 54,
    blockSize: 30,
    feedbackAlpha: 0.11,
    channelOffset: 5,
    sectionEvolution: 0.54,
    transientDisplacement: 38,
    staticMotionScale: 0.42,
    idleMotionAmount: 0.64,
    corruptionIntensity: 0.62,
    feedbackAmount: 1.02,
    smearPersistence: 0.58,
    beatSensitivity: 0.96,
    freezeChance: 0.022,
    compressionScale: 0.27,
    leftFlowParticleCount: 4600,
    leftFlowEntrySection: 1,
    leftFlowCoverTarget: 0.78,
    leftFlowSpeed: 68,
    leftFlowLineLength: 24,
    leftFlowAlpha: 0.13,
    leftFlowPointSize: 1.22,
    leftFlowColorShift: 0.5,
    leftFlowEvolutionStrength: 0.92,
    leftFlowReformSection: 4,
    leftFlowReformStrength: 0.72,
    leftFlowReformDurationMs: 12000,
    effectIntensity: 0.72,
    moshWaveSpeed: 0.54,
    moshWaveWidth: 0.22,
    vectorWarpStrength: 0.16,
    vectorWarpScale: 0.46,
    vectorWarpCurl: 0.54,
    vectorWarpSectionMask: [2, 3, 4, 5],
    pixelIslandCount: 62,
    scanBloomStrength: 0.54,
    chromaticFaultStrength: 0.48,
    memorySmearDecay: 0.105,
    horizontalSyncCap: 0.18,
  },
  'cong-artwork-mosh-storm-open': {
    kernel: 'cong-artwork-datamosh',
    sampleWidth: 270,
    sampleHeight: 198,
    sliceCount: 48,
    displacement: 68,
    blockSize: 28,
    feedbackAlpha: 0.11,
    channelOffset: 8,
    sectionEvolution: 0.66,
    transientDisplacement: 72,
    staticMotionScale: 0.44,
    idleMotionAmount: 0.66,
    corruptionIntensity: 0.74,
    feedbackAmount: 0.96,
    smearPersistence: 0.54,
    beatSensitivity: 1.44,
    freezeChance: 0.04,
    compressionScale: 0.24,
    rainParticleCount: 420,
    rainFallSpeed: 86,
    rainMinSize: 0.55,
    rainMaxSize: 3.1,
    rainMinAlpha: 0.02,
    rainMaxAlpha: 0.1,
    rainSectionIndex: 4,
    rainColorMorphMs: 9000,
    rainColorReleaseMode: 'one-by-one',
    blockLayerChance: 0.48,
    blockOpacityScale: 0.62,
    blockShapeMode: 'shards',
    blockSectionMask: [1, 3, 5],
    effectIntensity: 0.82,
    moshWaveSpeed: 0.58,
    moshWaveWidth: 0.24,
    vectorWarpStrength: 0.28,
    vectorWarpScale: 0.58,
    vectorWarpCurl: 0.68,
    vectorWarpSectionMask: [2, 3, 4, 5, 6],
    pixelIslandCount: 74,
    scanBloomStrength: 0.64,
    chromaticFaultStrength: 0.66,
    memorySmearDecay: 0.095,
    stormParticleCount: 3400,
    stormEntrySection: 1,
    stormPeakSection: 4,
    stormSettleSection: 6,
    stormSpeed: 0.96,
    stormSway: 56,
    stormAlpha: 0.21,
    stormMirrorAlpha: 0.58,
    stormLineAlpha: 0.16,
    stormTopColorBias: 0.7,
    stormBottomColorBias: 0.76,
    stormArtworkColorMix: 0.5,
    horizontalSyncCap: 0.18,
  },
  'cong-artwork-mosh-fracture': {
    kernel: 'cong-artwork-datamosh',
    sampleWidth: 252,
    sampleHeight: 188,
    sliceCount: 64,
    displacement: 104,
    blockSize: 22,
    feedbackAlpha: 0.1,
    channelOffset: 12,
    sectionEvolution: 0.7,
    transientDisplacement: 82,
    staticMotionScale: 0.4,
    idleMotionAmount: 0.6,
    corruptionIntensity: 0.82,
    fractureBaseline: 0.26,
    feedbackAmount: 0.92,
    smearPersistence: 0.5,
    beatSensitivity: 1.18,
    freezeChance: 0.045,
    compressionScale: 0.22,
    blockLayerChance: 0.82,
    blockOpacityScale: 0.82,
    blockShapeMode: 'shards',
    blockSectionMask: [1, 2, 3, 5],
    effectIntensity: 0.92,
    moshWaveSpeed: 0.78,
    moshWaveWidth: 0.16,
    vectorWarpStrength: 0.34,
    vectorWarpScale: 0.62,
    vectorWarpCurl: 0.74,
    vectorWarpSectionMask: [2, 3, 4, 5],
    pixelIslandCount: 96,
    scanBloomStrength: 0.72,
    chromaticFaultStrength: 0.92,
    memorySmearDecay: 0.085,
    horizontalSyncCap: 0.18,
    ditherAmount: 0.5,
    ditherLevels: 6,
    ditherDriftSpeed: 0.25,
  },
  'cong-artwork-mosh-pixel-sort': {
    kernel: 'cong-artwork-datamosh',
    sampleWidth: 252,
    sampleHeight: 188,
    sliceCount: 40,
    displacement: 72,
    feedbackAlpha: 0.1,
    blockSize: 18,
    channelOffset: 8,
    sectionEvolution: 0.62,
    transientDisplacement: 58,
    staticMotionScale: 0.42,
    idleMotionAmount: 0.5,
    corruptionIntensity: 0.6,
    feedbackAmount: 0.84,
    smearPersistence: 0.46,
    beatSensitivity: 1.24,
    effectIntensity: 0.66,
    moshWaveSpeed: 0.58,
    moshWaveWidth: 0.18,
    scanBloomStrength: 0.5,
    chromaticFaultStrength: 0.6,
    memorySmearDecay: 0.1,
    horizontalSyncCap: 0.14,
    pixelSortStrength: 0.9,
    pixelSortBandCount: 3,
    pixelSortThreshold: 0.46,
    pixelSortDecayMs: 2600,
  },
  'cong-artwork-mosh-slit-scan': {
    kernel: 'cong-artwork-datamosh',
    sampleWidth: 252,
    sampleHeight: 188,
    sliceCount: 36,
    displacement: 60,
    feedbackAlpha: 0.11,
    blockSize: 18,
    channelOffset: 7,
    sectionEvolution: 0.6,
    transientDisplacement: 48,
    staticMotionScale: 0.42,
    idleMotionAmount: 0.52,
    corruptionIntensity: 0.56,
    feedbackAmount: 0.9,
    smearPersistence: 0.56,
    beatSensitivity: 1.1,
    effectIntensity: 0.6,
    moshWaveSpeed: 0.5,
    moshWaveWidth: 0.2,
    scanBloomStrength: 0.46,
    chromaticFaultStrength: 0.52,
    memorySmearDecay: 0.1,
    horizontalSyncCap: 0.12,
    slitScanStrength: 0.88,
    slitScanDepth: 12,
    slitScanBands: 18,
    slitScanRate: 0.09,
    slitScanAxis: 'horizontal',
  },
  'cong-artwork-mosh-minimal-ghost': {
    kernel: 'cong-artwork-datamosh',
    sampleWidth: 300,
    sampleHeight: 220,
    sliceCount: 22,
    displacement: 18,
    blockSize: 58,
    feedbackAlpha: 0.075,
    channelOffset: 2,
    sectionEvolution: 0.24,
    transientDisplacement: 14,
    staticMotionScale: 0.24,
    idleMotionAmount: 0.4,
    corruptionIntensity: 0.18,
    feedbackAmount: 1.22,
    smearPersistence: 0.78,
    beatSensitivity: 0.62,
    freezeChance: 0.004,
    compressionScale: 0.36,
    blockLayerChance: 0.08,
    blockOpacityScale: 0.2,
    blockShapeMode: 'soft',
    effectIntensity: 0.16,
    moshWaveSpeed: 0.22,
    moshWaveWidth: 0.28,
    vectorWarpStrength: 0.04,
    vectorWarpScale: 0.28,
    vectorWarpCurl: 0.24,
    vectorWarpSectionMask: [3, 5],
    pixelIslandCount: 8,
    scanBloomStrength: 0.18,
    chromaticFaultStrength: 0.1,
    memorySmearDecay: 0.2,
    horizontalSyncCap: 0.08,
  },
  'cong-artwork-mosh-crystal-shard': {
    kernel: 'cong-artwork-datamosh',
    sampleWidth: 280,
    sampleHeight: 210,
    sliceCount: 48,
    displacement: 56,
    blockSize: 36,
    feedbackAlpha: 0.09,
    channelOffset: 7,
    sectionEvolution: 0.52,
    transientDisplacement: 58,
    staticMotionScale: 0.38,
    idleMotionAmount: 0.50,
    corruptionIntensity: 0.48,
    feedbackAmount: 1.08,
    smearPersistence: 0.44,
    beatSensitivity: 1.44,
    freezeChance: 0.012,
    compressionScale: 0.28,
    blockLayerChance: 0.72,
    blockOpacityScale: 0.86,
    blockShapeMode: 'shards',
    blockSectionMask: [1, 2, 3, 4, 5],
    effectIntensity: 0.92,
    moshWaveSpeed: 0.44,
    moshWaveWidth: 0.22,
    vectorWarpStrength: 0.42,
    vectorWarpScale: 0.5,
    vectorWarpCurl: 0.45,
    vectorWarpSectionMask: [2, 3, 4, 5],
    rainParticleCount: 60,
    pixelIslandCount: 48,
    scanBloomStrength: 0.52,
    chromaticFaultStrength: 0.54,
    memorySmearDecay: 0.14,
    enabledPasses: ['feedback', 'blocks', 'vectorWarp', 'compression', 'ghost'],
    horizontalSyncCap: 0,
  },
  'cong-artwork-mosh-veil-drift': {
    kernel: 'cong-artwork-datamosh',
    sampleWidth: 310,
    sampleHeight: 230,
    sliceCount: 18,
    displacement: 22,
    blockSize: 0,
    feedbackAlpha: 0.088,
    channelOffset: 3,
    sectionEvolution: 0.32,
    transientDisplacement: 16,
    staticMotionScale: 0.18,
    idleMotionAmount: 0.36,
    corruptionIntensity: 0.22,
    feedbackAmount: 1.28,
    smearPersistence: 0.76,
    beatSensitivity: 0.54,
    freezeChance: 0.002,
    compressionScale: 0.18,
    blockLayerChance: 0,
    blockOpacityScale: 0,
    blockShapeMode: 'soft',
    effectIntensity: 0.24,
    moshWaveSpeed: 0.18,
    moshWaveWidth: 0.36,
    vectorWarpStrength: 0.12,
    vectorWarpScale: 0.32,
    vectorWarpCurl: 0.28,
    vectorWarpSectionMask: [4, 5],
    leftFlowParticleCount: 2400,
    leftFlowEntrySection: 1,
    leftFlowCoverTarget: 0.72,
    leftFlowSpeed: 52,
    leftFlowLineLength: 18,
    leftFlowAlpha: 0.14,
    leftFlowPointSize: 1.1,
    leftFlowColorShift: 0.3,
    leftFlowEvolutionStrength: 0.6,
    pixelIslandCount: 12,
    scanBloomStrength: 0.14,
    chromaticFaultStrength: 0.08,
    memorySmearDecay: 0.24,
    enabledPasses: ['feedback', 'smear', 'ghost', 'drift'],
    horizontalSyncCap: 0,
  },
  'cong-artwork-datamosh-left-flow': {
    kernel: 'cong-artwork-datamosh',
    sampleWidth: 260,
    sampleHeight: 190,
    sliceCount: 50,
    displacement: 58,
    blockSize: 28,
    feedbackAlpha: 0.12,
    channelOffset: 6,
    sectionEvolution: 0.58,
    transientDisplacement: 42,
    staticMotionScale: 0.4,
    idleMotionAmount: 0.62,
    corruptionIntensity: 0.68,
    feedbackAmount: 1,
    smearPersistence: 0.58,
    beatSensitivity: 1,
    freezeChance: 0.028,
    compressionScale: 0.26,
    leftFlowParticleCount: 4200,
    leftFlowEntrySection: 3,
    leftFlowCoverTarget: 0.92,
    leftFlowSpeed: 78,
    leftFlowLineLength: 22,
    leftFlowAlpha: 0.12,
    leftFlowPointSize: 1.25,
    leftFlowColorShift: 0.5,
    leftFlowEvolutionStrength: 1,
    leftFlowReformSection: 5,
    leftFlowReformStrength: 0.82,
    leftFlowReformDurationMs: 10000,
    effectIntensity: 0.9,
    moshWaveSpeed: 0.62,
    moshWaveWidth: 0.28,
    vectorWarpStrength: 0.26,
    vectorWarpScale: 0.56,
    vectorWarpCurl: 0.68,
    vectorWarpSectionMask: [2, 3, 4, 5, 6],
    pixelIslandCount: 76,
    scanBloomStrength: 0.68,
    chromaticFaultStrength: 0.7,
    memorySmearDecay: 0.1,
  },
  'cong-artwork-datamosh-storm-evolution': {
    kernel: 'cong-artwork-datamosh',
    sampleWidth: 270,
    sampleHeight: 198,
    sliceCount: 58,
    displacement: 70,
    blockSize: 30,
    feedbackAlpha: 0.115,
    channelOffset: 8,
    sectionEvolution: 0.68,
    transientDisplacement: 54,
    staticMotionScale: 0.42,
    idleMotionAmount: 0.64,
    corruptionIntensity: 0.76,
    feedbackAmount: 0.98,
    smearPersistence: 0.56,
    beatSensitivity: 1.1,
    freezeChance: 0.036,
    compressionScale: 0.24,
    rainParticleCount: 520,
    rainFallSpeed: 94,
    rainMinSize: 0.55,
    rainMaxSize: 3.4,
    rainMinAlpha: 0.026,
    rainMaxAlpha: 0.12,
    rainSectionIndex: 5,
    rainColorMorphMs: 9800,
    rainColorReleaseMode: 'one-by-one',
    leftFlowParticleCount: 2600,
    leftFlowEntrySection: 4,
    leftFlowCoverTarget: 0.58,
    leftFlowSpeed: 52,
    leftFlowLineLength: 18,
    leftFlowAlpha: 0.085,
    leftFlowPointSize: 1.08,
    leftFlowColorShift: 0.46,
    leftFlowEvolutionStrength: 0.72,
    leftFlowReformSection: 6,
    leftFlowReformStrength: 0.74,
    leftFlowReformDurationMs: 12000,
    effectIntensity: 0.88,
    moshWaveSpeed: 0.58,
    moshWaveWidth: 0.26,
    vectorWarpStrength: 0.28,
    vectorWarpScale: 0.58,
    vectorWarpCurl: 0.7,
    vectorWarpSectionMask: [2, 3, 4, 5, 6],
    pixelIslandCount: 84,
    scanBloomStrength: 0.74,
    chromaticFaultStrength: 0.72,
    memorySmearDecay: 0.1,
    stormParticleCount: 2500,
    stormEntrySection: 2,
    stormPeakSection: 5,
    stormSettleSection: 6,
    stormSpeed: 0.92,
    stormSway: 42,
    stormAlpha: 0.13,
    stormMirrorAlpha: 0.58,
    stormLineAlpha: 0.09,
    stormTopColorBias: 0.72,
    stormBottomColorBias: 0.76,
    stormArtworkColorMix: 0.46,
  },
  'cong-batcape-grid-default': {
    kernel: 'cong-batcape-grid',
    gridSize: 35,
    rectSize: 3,
    baseAlpha: 0.08,
    flickerSpeed: 0.9,
  },
  'cong-batcape-grid-dense': {
    kernel: 'cong-batcape-grid',
    gridSize: 22,
    rectSize: 3,
    baseAlpha: 0.1,
    flickerSpeed: 1.2,
  },
  'cong-artwork-particle-mangle-default': {
    kernel: 'cong-artwork-particle-mangle',
    sampleWidth: 220,
    sampleHeight: 170,
    particleCount: 5200,
    particleSize: 2.2,
    feedbackAlpha: 0.13,
    scatter: 180,
    shear: 90,
    vortex: 0.72,
    blockTearCount: 34,
    sectionEvolution: 0.86,
    transientScatter: 140,
  },
  'native-kaleido-fold-ambient': {
    kernel: 'native-kaleido-fold',
    foldCount: 5,
    foldDriftSpeed: 0.045,
    wedgeParticleCount: 96,
    seamGlow: 0.34,
    centerVeil: 0.6,
    bufferScale: 0.62,
  },
  'native-kaleido-fold-bloom': {
    kernel: 'native-kaleido-fold',
    foldCount: 7,
    foldDriftSpeed: 0.07,
    wedgeParticleCount: 120,
    seamGlow: 0.5,
    centerVeil: 0.48,
    bufferScale: 0.68,
  },
  'native-reaction-veil-default': {
    kernel: 'native-reaction-veil',
    gridScale: 128,
    feed: 0.037,
    kill: 0.0605,
    iterationsPerFrame: 4,
    injectStrength: 0.55,
    veilAlpha: 0.46,
  },
  'native-reaction-veil-deep': {
    kernel: 'native-reaction-veil',
    gridScale: 112,
    feed: 0.029,
    kill: 0.057,
    iterationsPerFrame: 5,
    injectStrength: 0.65,
    veilAlpha: 0.56,
  },
  'native-attractor-drift-default': {
    kernel: 'native-attractor-drift',
    stepsPerFrame: 2000,
    fadeAlpha: 0.018,
    coeffDriftSpeed: 0.05,
    pointAlpha: 0.065,
    scale: 0.34,
    warmMix: 0.42,
    widthGrowth: 0.42,
    heightGrowth: 0.36,
    growthSpeed: 1.7,
    onsetGrowth: 0.2,
  },
  'native-attractor-surge': {
    kernel: 'native-attractor-drift',
    stepsPerFrame: 2800,
    fadeAlpha: 0.03,
    coeffDriftSpeed: 0.085,
    pointAlpha: 0.08,
    scale: 0.38,
    warmMix: 0.3,
    widthGrowth: 0.54,
    heightGrowth: 0.48,
    growthSpeed: 2.1,
    onsetGrowth: 0.26,
  },
  'native-nightfall-ridges-default': {
    kernel: 'native-nightfall-ridges',
    ridgeCountBase: 5,
    ridgeCountMax: 8,
    sampleStep: 6,
    ridgeAmp: 0.16,
    parallaxSpread: 14,
    fogAlpha: 0.06,
    rimAlpha: 0.085,
    glintDensity: 14,
    fillAlpha: 0.085,
    distantLayerCount: 3,
    distantLandscapeAlpha: 0.11,
    shootingStarCount: 5,
    shootingStarAlpha: 0.42,
  },
  'native-aurora-veil-default': {
    kernel: 'native-aurora-veil',
    gridScale: 128,
    baseFreq: 2.6,
    warpFreq: 1.4,
    warpStrength: 0.9,
    anisotropy: 1.7,
    driftSpeed: 0.045,
    veilAlpha: 0.42,
    tensionMix: 0.42,
  },
  'native-sidewind-drift-default': {
    kernel: 'native-sidewind-drift',
    moteCount: 300,
    windBase: 26,
    gustSpeed: 0.07,
    gustAmp: 0.6,
    windAngleDeg: 4,
    horizonY: 0.62,
    horizonAlpha: 0.085,
    streakLength: 14,
    moteAlpha: 0.16,
    fillAlpha: 0.1,
  },
  'native-gravity-current-default': {
    kernel: 'native-gravity-current',
    particleCount: 420,
    wellCountBase: 2,
    wellStrength: 60,
    swirl: 0.65,
    flowScale: 0.0024,
    trailFade: 0.028,
    segmentAlpha: 0.2,
    rippleSpeed: 140,
  },
  'three-curl-flow-default': {
    kernel: 'three-curl-flow',
    maxInstances: 180000,
    integrationSteps: 7,
    noiseScale: 0.9,
    flowSpeed: 0.05,
    stepLength: 0.05,
    pointSize: 1.7,
    additiveAlpha: 0.55,
  },
  'three-volumetric-fog-default': {
    kernel: 'three-volumetric-fog',
    maxSteps: 26,
    densityScale: 1.0,
    noiseScale: 1.1,
    driftSpeed: 0.08,
    lightStrength: 0.9,
    additiveAlpha: 1.15,
  },
  'three-caustics-default': {
    kernel: 'three-caustics',
    maxLayers: 5,
    noiseScale: 3.2,
    warpAmount: 0.5,
    flowSpeed: 0.12,
    sharpness: 3.0,
    additiveAlpha: 0.7,
  },
  'three-artwork-flux-default': {
    kernel: 'three-artwork-flux',
    memory: 0.84,
    displacement: 0.78,
    reveal: 0.82,
    chromaticAberration: 0.82,
    vignette: 0.42,
  },
  'three-fresnel-core-default': {
    kernel: 'three-fresnel-core',
    coreRadius: 0.28,
    rimWidth: 0.18,
    glowRadius: 0.55,
  },
} as const;

export type VisualizerTuningKey = keyof typeof VISUALIZER_TUNINGS;

export function getVisualizerTuning(tuningKey?: VisualizerTuningKey): VisualizerTuningConfig | undefined {
  return tuningKey ? VISUALIZER_TUNINGS[tuningKey] : undefined;
}

export function resolveCongCloudOrbitTuning(tuning?: VisualizerTuningConfig): CongCloudOrbitTuning {
  return tuning?.kernel === 'cong-cloud-orbit'
    ? tuning
    : VISUALIZER_TUNINGS['cong-cloud-orbit-default'];
}

export function resolveCongRainShowerTuning(tuning?: VisualizerTuningConfig): CongRainShowerTuning {
  return tuning?.kernel === 'cong-rain-shower'
    ? tuning
    : VISUALIZER_TUNINGS['cong-rain-shower-default'];
}

export function resolveCongContourLinesTuning(tuning?: VisualizerTuningConfig): CongContourLinesTuning {
  return tuning?.kernel === 'cong-contour-lines'
    ? tuning
    : VISUALIZER_TUNINGS['cong-contour-lines-default'];
}

export function resolveCongPlanetCoreTuning(tuning?: VisualizerTuningConfig): CongPlanetCoreTuning {
  return tuning?.kernel === 'cong-planet-core'
    ? tuning
    : VISUALIZER_TUNINGS['cong-planet-core-default'];
}

export function resolveCongLandscapeFlowTuning(tuning?: VisualizerTuningConfig): CongLandscapeFlowTuning {
  return tuning?.kernel === 'cong-landscape-flow'
    ? tuning
    : VISUALIZER_TUNINGS['cong-landscape-flow-default'];
}

export function resolveCongLandscapeSpiralTuning(tuning?: VisualizerTuningConfig): CongLandscapeSpiralTuning {
  return tuning?.kernel === 'cong-landscape-spiral'
    ? tuning
    : VISUALIZER_TUNINGS['cong-landscape-spiral-default'];
}

export function resolveCongParticleCurrentTuning(tuning?: VisualizerTuningConfig): CongParticleCurrentTuning {
  return tuning?.kernel === 'cong-particle-current'
    ? tuning
    : VISUALIZER_TUNINGS['cong-particle-current-default'];
}

export function resolveCongLateralCurrentTuning(tuning?: VisualizerTuningConfig): CongLateralCurrentTuning {
  return tuning?.kernel === 'cong-lateral-current'
    ? tuning
    : VISUALIZER_TUNINGS['cong-lateral-current-default'];
}

export function resolveCongLateralCascadeTuning(tuning?: VisualizerTuningConfig): CongLateralCascadeTuning {
  return tuning?.kernel === 'cong-lateral-cascade'
    ? tuning
    : VISUALIZER_TUNINGS['cong-lateral-cascade-default'];
}

export function resolveCongVerticalLandscapeStreamTuning(tuning?: VisualizerTuningConfig): CongVerticalLandscapeStreamTuning {
  return tuning?.kernel === 'cong-vertical-landscape-stream'
    ? tuning
    : VISUALIZER_TUNINGS['cong-vertical-landscape-stream-default'];
}

export function resolveCongGreenGalaxyTuning(tuning?: VisualizerTuningConfig): CongGreenGalaxyTuning {
  return tuning?.kernel === 'cong-green-galaxy'
    ? tuning
    : VISUALIZER_TUNINGS['cong-green-galaxy-default'];
}

export function resolveCongChordStormTuning(tuning?: VisualizerTuningConfig): CongChordStormTuning {
  return tuning?.kernel === 'cong-chord-storm'
    ? tuning
    : VISUALIZER_TUNINGS['cong-chord-storm-default'];
}

export function resolveCongTopBottomStormTuning(tuning?: VisualizerTuningConfig): CongTopBottomStormTuning {
  return tuning?.kernel === 'cong-top-bottom-storm'
    ? tuning
    : VISUALIZER_TUNINGS['cong-top-bottom-storm-default'];
}

export function resolveCongGenerativeParticlesTuning(tuning?: VisualizerTuningConfig): CongGenerativeParticlesTuning {
  return tuning?.kernel === 'cong-generative-particles'
    ? tuning
    : VISUALIZER_TUNINGS['cong-landscape-og-current-default'];
}

export function resolveCongMistFieldTuning(tuning?: VisualizerTuningConfig): CongMistFieldTuning {
  return tuning?.kernel === 'cong-mist-field'
    ? tuning
    : VISUALIZER_TUNINGS['cong-mist-field-default'];
}

export function resolveCongHorizonFieldTuning(tuning?: VisualizerTuningConfig): CongHorizonFieldTuning {
  return tuning?.kernel === 'cong-horizon-field'
    ? tuning
    : VISUALIZER_TUNINGS['cong-horizon-field-default'];
}

export function resolveCongWaterlineShimmerTuning(tuning?: VisualizerTuningConfig): CongWaterlineShimmerTuning {
  return tuning?.kernel === 'cong-waterline-shimmer'
    ? tuning
    : VISUALIZER_TUNINGS['cong-waterline-shimmer-default'];
}

export function resolveCongGrainErosionTuning(tuning?: VisualizerTuningConfig): CongGrainErosionTuning {
  return tuning?.kernel === 'cong-grain-erosion'
    ? tuning
    : VISUALIZER_TUNINGS['cong-grain-erosion-default'];
}

export function resolveCongWanderingLinesTuning(tuning?: VisualizerTuningConfig): CongWanderingLinesTuning {
  return tuning?.kernel === 'cong-wandering-lines'
    ? tuning
    : VISUALIZER_TUNINGS['cong-wandering-lines-default'];
}

export function resolveCongBrokenGridTuning(tuning?: VisualizerTuningConfig): CongBrokenGridTuning {
  return tuning?.kernel === 'cong-broken-grid'
    ? tuning
    : VISUALIZER_TUNINGS['cong-broken-grid-default'];
}

export function resolveCongSparseConstellationTuning(tuning?: VisualizerTuningConfig): CongSparseConstellationTuning {
  return tuning?.kernel === 'cong-sparse-constellation'
    ? tuning
    : VISUALIZER_TUNINGS['cong-sparse-constellation-default'];
}

export function resolveCongEmberGeologyTuning(tuning?: VisualizerTuningConfig): CongEmberGeologyTuning {
  return tuning?.kernel === 'cong-ember-geology'
    ? tuning
    : VISUALIZER_TUNINGS['cong-ember-geology-default'];
}

export function resolveCongArtworkDatamoshTuning(tuning?: VisualizerTuningConfig): CongArtworkDatamoshTuning {
  return tuning?.kernel === 'cong-artwork-datamosh'
    ? tuning
    : VISUALIZER_TUNINGS['cong-artwork-datamosh-default'];
}

export function resolveCongArtworkParticleMangleTuning(tuning?: VisualizerTuningConfig): CongArtworkParticleMangleTuning {
  return tuning?.kernel === 'cong-artwork-particle-mangle'
    ? tuning
    : VISUALIZER_TUNINGS['cong-artwork-particle-mangle-default'];
}

export function resolveCongBatcapeGridTuning(tuning?: VisualizerTuningConfig): CongBatcapeGridTuning {
  return tuning?.kernel === 'cong-batcape-grid'
    ? tuning
    : VISUALIZER_TUNINGS['cong-batcape-grid-default'];
}

export function resolveNativeKaleidoFoldTuning(tuning?: VisualizerTuningConfig): NativeKaleidoFoldTuning {
  return tuning?.kernel === 'native-kaleido-fold'
    ? tuning
    : VISUALIZER_TUNINGS['native-kaleido-fold-ambient'];
}

export function resolveNativeReactionVeilTuning(tuning?: VisualizerTuningConfig): NativeReactionVeilTuning {
  return tuning?.kernel === 'native-reaction-veil'
    ? tuning
    : VISUALIZER_TUNINGS['native-reaction-veil-default'];
}

export function resolveNativeAttractorDriftTuning(tuning?: VisualizerTuningConfig): NativeAttractorDriftTuning {
  return tuning?.kernel === 'native-attractor-drift'
    ? tuning
    : VISUALIZER_TUNINGS['native-attractor-drift-default'];
}

export function resolveNativeNightfallRidgesTuning(tuning?: VisualizerTuningConfig): NativeNightfallRidgesTuning {
  return tuning?.kernel === 'native-nightfall-ridges'
    ? tuning
    : VISUALIZER_TUNINGS['native-nightfall-ridges-default'];
}

export function resolveNativeAuroraVeilTuning(tuning?: VisualizerTuningConfig): NativeAuroraVeilTuning {
  return tuning?.kernel === 'native-aurora-veil'
    ? tuning
    : VISUALIZER_TUNINGS['native-aurora-veil-default'];
}

export function resolveNativeSidewindDriftTuning(tuning?: VisualizerTuningConfig): NativeSidewindDriftTuning {
  return tuning?.kernel === 'native-sidewind-drift'
    ? tuning
    : VISUALIZER_TUNINGS['native-sidewind-drift-default'];
}

export function resolveNativeGravityCurrentTuning(tuning?: VisualizerTuningConfig): NativeGravityCurrentTuning {
  return tuning?.kernel === 'native-gravity-current'
    ? tuning
    : VISUALIZER_TUNINGS['native-gravity-current-default'];
}

export function resolveThreeCurlFlowTuning(tuning?: VisualizerTuningConfig): ThreeCurlFlowTuning {
  return tuning?.kernel === 'three-curl-flow'
    ? tuning
    : VISUALIZER_TUNINGS['three-curl-flow-default'];
}

export function resolveThreeVolumetricFogTuning(tuning?: VisualizerTuningConfig): ThreeVolumetricFogTuning {
  return tuning?.kernel === 'three-volumetric-fog'
    ? tuning
    : VISUALIZER_TUNINGS['three-volumetric-fog-default'];
}

export function resolveThreeCausticsTuning(tuning?: VisualizerTuningConfig): ThreeCausticsTuning {
  return tuning?.kernel === 'three-caustics'
    ? tuning
    : VISUALIZER_TUNINGS['three-caustics-default'];
}

export function resolveThreeArtworkFluxTuning(tuning?: VisualizerTuningConfig): ThreeArtworkFluxTuning {
  return tuning?.kernel === 'three-artwork-flux'
    ? tuning
    : VISUALIZER_TUNINGS['three-artwork-flux-default'];
}

export function resolveThreeFresnelCoreTuning(tuning?: VisualizerTuningConfig): ThreeFresnelCoreTuning {
  return tuning?.kernel === 'three-fresnel-core'
    ? tuning
    : VISUALIZER_TUNINGS['three-fresnel-core-default'];
}

export function describeVisualizerTuning(tuningKey?: VisualizerTuningKey): string {
  const tuning = getVisualizerTuning(tuningKey);
  if (!tuning) return '—';

  if (tuning.kernel === 'cong-generative-particles') {
    const overlays = tuning.overlays.length ? ` · overlays ${tuning.overlays.join(', ')}` : '';
    return `${tuning.mode} · ${tuning.emitter} · ${tuning.field} · ${tuning.renderer} · ${tuning.particleCount} particles · ${tuning.blendMode}${overlays}`;
  }

  if (tuning.kernel === 'cong-artwork-datamosh') return `${tuning.sliceCount} slices · ${tuning.sampleWidth}x${tuning.sampleHeight} sample`;
  if (tuning.kernel === 'cong-artwork-particle-mangle') return `${tuning.particleCount} artwork particles · ${tuning.sampleWidth}x${tuning.sampleHeight} sample`;
  if ('particleCount' in tuning) return `${tuning.particleCount} particles`;
  if ('dropCount' in tuning) return `${tuning.dropCount} drops`;
  if ('bandCount' in tuning) return `${tuning.bandCount} bands`;
  if ('sparkCount' in tuning) return `${tuning.sparkCount} sparks`;
  if ('armCount' in tuning) return `${tuning.armCount} arms`;
  return 'configured';
}
