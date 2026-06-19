import type { ExplorerRecipe, ExplorerRecipeId } from './types';

/* ── Recipe Registry ─────────────────────────────────────────
   Shared visual library for the explorer.
   Plans reference recipe ids, while the canvas uses the chosen
   recipe to instantiate a visualizer and its baseline params.
──────────────────────────────────────────────────────────────── */

export const GRAIN_COUNT = 1500;

const RECIPES: Readonly<Record<string, ExplorerRecipe>> = {
  'native-smoke-planes': {
    id: 'native-smoke-planes',
    name: 'Smoke Planes',
    source: 'native',
    kernel: 'smoke-planes',
    sceneProfile: 'smoke',
    baseParams: { turbulence: 0.28, density: 0.42, glow: 0.18, drift: 0.28, hueShift: 10, shimmer: 0.18, impulse: 0 },
    cardBg: 'transparent',
    cardBorder: 'rgba(110, 150, 210, 0.13)',
  },
  'cong-cloud-orbit': {
    id: 'cong-cloud-orbit',
    name: 'Cong Cloud Orbit',
    source: 'cong',
    kernel: 'cong-cloud-orbit',
    sceneProfile: 'cloud',
    baseParams: { turbulence: 0.42, density: 0.48, glow: 0.28, drift: 0.34, hueShift: -6, shimmer: 0.18, impulse: 0 },
    cardBg: 'transparent',
    cardBorder: 'rgba(120, 150, 220, 0.14)',
    tuningKey: 'cong-cloud-orbit-default',
    candidateIds: ['newcloudagainintro'],
  },
  'cong-rain-shower': {
    id: 'cong-rain-shower',
    name: 'Cong Rain Shower',
    source: 'cong',
    kernel: 'cong-rain-shower',
    sceneProfile: 'rain',
    baseParams: { turbulence: 0.34, density: 0.56, glow: 0.24, drift: 0.28, hueShift: -20, shimmer: 0.12, impulse: 0 },
    cardBg: 'transparent',
    cardBorder: 'rgba(110, 150, 210, 0.15)',
    tuningKey: 'cong-rain-shower-default',
    candidateIds: ['visitingtimerainshower'],
    materialOverlayAlpha: 0.34,
  },
  'cong-landscape-flow': {
    id: 'cong-landscape-flow',
    name: 'Cong Landscape Flow',
    source: 'cong',
    kernel: 'cong-landscape-flow',
    sceneProfile: 'flow',
    baseParams: { turbulence: 0.34, density: 0.46, glow: 0.22, drift: 0.38, hueShift: 16, shimmer: 0.18, impulse: 0.02 },
    cardBg: 'transparent',
    cardBorder: 'rgba(118, 160, 206, 0.14)',
    tuningKey: 'cong-landscape-flow-default',
    candidateIds: ['landscapeparticlesflow'],
  },
  'cong-landscape-spiral': {
    id: 'cong-landscape-spiral',
    name: 'Cong Landscape Spiral',
    source: 'cong',
    kernel: 'cong-landscape-spiral',
    sceneProfile: 'spiral',
    baseParams: { turbulence: 0.32, density: 0.38, glow: 0.26, drift: 0.36, hueShift: 24, shimmer: 0.22, impulse: 0.04 },
    cardBg: 'transparent',
    cardBorder: 'rgba(150, 174, 220, 0.16)',
    tuningKey: 'cong-landscape-spiral-default',
    candidateIds: ['landscapeparticlesspiral'],
  },
  'cong-contour-lines': {
    id: 'cong-contour-lines',
    name: 'Cong Contour Lines',
    source: 'cong',
    kernel: 'cong-contour-lines',
    sceneProfile: 'contour',
    baseParams: { turbulence: 0.28, density: 0.42, glow: 0.2, drift: 0.26, hueShift: -10, shimmer: 0.22, impulse: 0 },
    cardBg: 'transparent',
    cardBorder: 'rgba(130, 170, 150, 0.15)',
    tuningKey: 'cong-contour-lines-default',
    candidateIds: ['lort'],
  },
  'cong-planet-core': {
    id: 'cong-planet-core',
    name: 'Cong Planet Core',
    source: 'cong',
    kernel: 'cong-planet-core',
    sceneProfile: 'planet',
    baseParams: { turbulence: 0.46, density: 0.54, glow: 0.3, drift: 0.34, hueShift: 6, shimmer: 0.2, impulse: 0.04 },
    cardBg: 'transparent',
    cardBorder: 'rgba(170, 190, 230, 0.18)',
    tuningKey: 'cong-planet-core-default',
    candidateIds: ['planetopener'],
  },
  'cong-particle-current': {
    id: 'cong-particle-current',
    name: 'Cong Vertical Landscape Stream',
    source: 'cong',
    kernel: 'cong-vertical-landscape-stream',
    sceneProfile: 'flow',
    baseParams: { turbulence: 0.44, density: 0.58, glow: 0.26, drift: 0.5, hueShift: -8, shimmer: 0.24, impulse: 0.03, strokeMode: 1 },
    cardBg: 'transparent',
    cardBorder: 'rgba(126, 182, 214, 0.18)',
    tuningKey: 'cong-vertical-landscape-stream-default',
    candidateIds: ['particlecurrent'],
  },
  'cong-lateral-current': {
    id: 'cong-lateral-current',
    name: 'Cong Lateral Current',
    source: 'cong',
    kernel: 'cong-lateral-current',
    sceneProfile: 'flow',
    baseParams: { turbulence: 0.34, density: 0.46, glow: 0.2, drift: 0.28, hueShift: -6, shimmer: 0.18, impulse: 0, strokeMode: 0 },
    cardBg: 'transparent',
    cardBorder: 'rgba(118, 168, 214, 0.15)',
    tuningKey: 'cong-lateral-current-default',
    candidateIds: ['particlecurrent', 'landscapeparticlesflow'],
  },
  'cong-lateral-cascade': {
    id: 'cong-lateral-cascade',
    name: 'Cong Lateral Cascade',
    source: 'cong',
    kernel: 'cong-lateral-cascade',
    sceneProfile: 'flow',
    baseParams: { turbulence: 0.42, density: 0.58, glow: 0.26, drift: 0.34, hueShift: -8, shimmer: 0.22, impulse: 0.02, strokeMode: 1 },
    cardBg: 'transparent',
    cardBorder: 'rgba(128, 176, 220, 0.18)',
    tuningKey: 'cong-lateral-cascade-default',
    candidateIds: ['particlecurrent', 'landscapeparticlesflow'],
  },
'cong-cloud-again-intro-generative': {
    id: 'cong-cloud-again-intro-generative',
    name: 'Cong Cloud Again Intro',
    source: 'cong',
    kernel: 'cong-generative-particles',
    sceneProfile: 'cloud',
    baseParams: { turbulence: 0.28, density: 0.34, glow: 0.22, drift: 0.22, hueShift: -4, shimmer: 0.12, impulse: 0 },
    cardBg: 'transparent',
    cardBorder: 'rgba(124, 158, 220, 0.13)',
    tuningKey: 'cong-cloud-again-intro-generative',
    candidateIds: ['cloudagainrouter', 'cloudagainintro', 'newcloudagainintro'],
  },
  'cong-green-galaxy': {
    id: 'cong-green-galaxy',
    name: 'Cong Green Galaxy',
    source: 'cong',
    kernel: 'cong-generative-particles',
    sceneProfile: 'galaxy',
    baseParams: { turbulence: 0.34, density: 0.44, glow: 0.3, drift: 0.36, hueShift: 12, shimmer: 0.24, impulse: 0.04 },
    cardBg: 'transparent',
    cardBorder: 'rgba(122, 184, 158, 0.17)',
    tuningKey: 'cong-green-galaxy-generative',
    candidateIds: ['greemngalaxy'],
    materialOverlayAlpha: 0.3,
  },
  'cong-green-galaxy-orbit': {
    id: 'cong-green-galaxy-orbit',
    name: 'Green Galaxy Orbit',
    source: 'native',
    kernel: 'cong-green-galaxy',
    sceneProfile: 'galaxy',
    baseParams: { turbulence: 0.28, density: 0.38, glow: 0.34, drift: 0.32, hueShift: 14, shimmer: 0.22, impulse: 0.03 },
    cardBg: 'transparent',
    cardBorder: 'rgba(122, 184, 158, 0.17)',
    tuningKey: 'cong-green-galaxy-default',
    candidateIds: [],
    productionReady: true,
    randomEligible: true,
    startupEligible: false,
  },
  'cong-top-bottom-storm-template': {
    id: 'cong-top-bottom-storm-template',
    name: 'Cong Top Bottom Storm Template',
    source: 'cong',
    kernel: 'cong-generative-particles',
    sceneProfile: 'storm',
    baseParams: { turbulence: 0.2, density: 0.28, glow: 0.14, drift: 0.18, hueShift: 12, shimmer: 0.08, impulse: 0 },
    cardBg: 'transparent',
    cardBorder: 'rgba(132, 190, 176, 0.16)',
    tuningKey: 'cong-top-bottom-storm-section-template',
    candidateIds: ['topbottomgreenstorm'],
  },
  'cong-waterline-shimmer': {
    id: 'cong-waterline-shimmer',
    name: 'Cong Waterline Shimmer',
    source: 'cong',
    kernel: 'cong-waterline-shimmer',
    sceneProfile: 'tide',
    baseParams: { turbulence: 0.5, density: 0.62, glow: 0.42, drift: 0.48, hueShift: 8, shimmer: 0.56, impulse: 0.06 },
    cardBg: 'transparent',
    cardBorder: 'rgba(120, 170, 180, 0.14)',
    tuningKey: 'cong-waterline-shimmer-default',
    candidateIds: [],
    materialOverlayAlpha: 0.42,
  },
'cong-broken-grid': {
    id: 'cong-broken-grid',
    name: 'Cong Broken Grid',
    source: 'cong',
    kernel: 'cong-broken-grid',
    sceneProfile: 'grid',
    baseParams: { turbulence: 0.3, density: 0.42, glow: 0.2, drift: 0.3, hueShift: 8, shimmer: 0.14, impulse: 0.02 },
    cardBg: 'transparent',
    cardBorder: 'rgba(150, 170, 200, 0.13)',
    tuningKey: 'cong-broken-grid-default',
    candidateIds: [],
  },
  'cong-grid-pulse': {
    id: 'cong-grid-pulse',
    name: 'Cong Grid Pulse',
    source: 'cong',
    kernel: 'cong-grid-pulse',
    sceneProfile: 'grid',
    baseParams: { turbulence: 0.22, density: 0.5, glow: 0.24, drift: 0.44, hueShift: -10, shimmer: 0.16, impulse: 0.04 },
    cardBg: 'transparent',
    cardBorder: 'rgba(170, 150, 210, 0.14)',
    candidateIds: ['derkdisco'],
  },
  'cong-sparse-fall': {
    id: 'cong-sparse-fall',
    name: 'Cong Sparse Fall',
    source: 'cong',
    kernel: 'cong-sparse-fall',
    sceneProfile: 'sparse',
    baseParams: { turbulence: 0.28, density: 0.46, glow: 0.22, drift: 0.34, hueShift: -18, shimmer: 0.22, impulse: 0.02 },
    cardBg: 'transparent',
    cardBorder: 'rgba(180, 150, 170, 0.14)',
    candidateIds: ['stacyltites'],
  },
'native-warp-mesh-deep': {
    id: 'native-warp-mesh-deep',
    name: 'Warp Mesh — Deep',
    source: 'native',
    kernel: 'perlin-warp-mesh',
    sceneProfile: 'grid',
    baseParams: { turbulence: 0.22, density: 0.38, glow: 0.14, drift: 0.22, hueShift: 8, shimmer: 0.12, impulse: 0 },
    cardBg: 'transparent',
    cardBorder: 'rgba(100, 140, 200, 0.13)',
    productionReady: true,
    startupEligible: true,
    randomEligible: true,
  },
  'native-flow-field-drift': {
    id: 'native-flow-field-drift',
    name: 'Flow Field — Drift',
    source: 'native',
    kernel: 'perlin-flow-field',
    sceneProfile: 'particle',
    baseParams: { turbulence: 0.28, density: 0.38, glow: 0.16, drift: 0.26, hueShift: 12, shimmer: 0.22, impulse: 0, verticalHueGradient: 0.5 },
    cardBg: 'transparent',
    cardBorder: 'rgba(110, 150, 190, 0.13)',
    productionReady: false,
    startupEligible: false,
    randomEligible: false,
    disabledReason: 'Hidden after visual review.',
  },
'native-flow-field-chroma': {
    id: 'native-flow-field-chroma',
    name: 'Flow Field - Chroma',
    source: 'native',
    kernel: 'perlin-flow-field',
    sceneProfile: 'flow',
    baseParams: { turbulence: 0.62, density: 0.44, glow: 0.28, drift: 0.42, hueShift: 38, shimmer: 0.18, impulse: 0.03 },
    cardBg: 'transparent',
    cardBorder: 'rgba(142, 122, 206, 0.16)',
    productionReady: true,
    startupEligible: false,
    randomEligible: true,
  },
  'native-terrain-erode': {
    id: 'native-terrain-erode',
    name: 'Terrain Erode',
    source: 'native',
    kernel: 'perlin-terrain-erode',
    sceneProfile: 'geology',
    baseParams: { turbulence: 0.38, density: 0.46, glow: 0.22, drift: 0.32, hueShift: 8, shimmer: 0.24, impulse: 0.02 },
    cardBg: 'transparent',
    cardBorder: 'rgba(140, 170, 130, 0.14)',
    productionReady: true,
    startupEligible: true,
    randomEligible: true,
  },
  'native-organic-drift': {
    id: 'native-organic-drift',
    name: 'Organic Drift',
    source: 'native',
    kernel: 'organic-drift',
    sceneProfile: 'texture',
    baseParams: { turbulence: 0.22, density: 0.44, glow: 0.18, drift: 0.32, hueShift: 0, shimmer: 0.28, impulse: 0 },
    cardBg: 'transparent',
    cardBorder: 'rgba(120, 155, 195, 0.13)',
    productionReady: true,
    startupEligible: true,
    randomEligible: true,
  },
  'native-reaction-veil': {
    id: 'native-reaction-veil',
    name: 'Reaction Veil',
    source: 'native',
    kernel: 'native-reaction-veil',
    sceneProfile: 'texture',
    baseParams: { turbulence: 0.2, density: 0.42, glow: 0.2, drift: 0.22, hueShift: -6, shimmer: 0.22, impulse: 0.01 },
    cardBg: 'transparent',
    cardBorder: 'rgba(120, 170, 170, 0.14)',
    tuningKey: 'native-reaction-veil-default',
    productionReady: true,
    startupEligible: true,
    randomEligible: true,
  },
  'native-reaction-veil-deep': {
    id: 'native-reaction-veil-deep',
    name: 'Reaction Veil — Deep',
    source: 'native',
    kernel: 'native-reaction-veil',
    sceneProfile: 'mist',
    baseParams: { turbulence: 0.28, density: 0.52, glow: 0.26, drift: 0.26, hueShift: -14, shimmer: 0.26, impulse: 0.02 },
    cardBg: 'transparent',
    cardBorder: 'rgba(110, 160, 185, 0.15)',
    tuningKey: 'native-reaction-veil-deep',
    productionReady: true,
    startupEligible: false,
    randomEligible: true,
  },
  'native-attractor-drift': {
    id: 'native-attractor-drift',
    name: 'Attractor Drift',
    source: 'native',
    kernel: 'native-attractor-drift',
    sceneProfile: 'ink',
    baseParams: { turbulence: 0.22, density: 0.44, glow: 0.22, drift: 0.28, hueShift: 0, shimmer: 0.2, impulse: 0.02 },
    cardBg: 'transparent',
    cardBorder: 'rgba(150, 160, 200, 0.13)',
    tuningKey: 'native-attractor-drift-default',
    productionReady: true,
    startupEligible: true,
    randomEligible: true,
  },
  'native-attractor-surge': {
    id: 'native-attractor-surge',
    name: 'Attractor Surge',
    source: 'native',
    kernel: 'native-attractor-drift',
    sceneProfile: 'storm',
    baseParams: { turbulence: 0.38, density: 0.56, glow: 0.32, drift: 0.4, hueShift: -8, shimmer: 0.32, impulse: 0.06 },
    cardBg: 'transparent',
    cardBorder: 'rgba(170, 165, 230, 0.16)',
    tuningKey: 'native-attractor-surge',
    productionReady: true,
    startupEligible: false,
    randomEligible: true,
  },
  'native-aurora-veil': {
    id: 'native-aurora-veil',
    name: 'Aurora Veil',
    source: 'native',
    kernel: 'native-aurora-veil',
    sceneProfile: 'mist',
    baseParams: { turbulence: 0.24, density: 0.44, glow: 0.22, drift: 0.24, hueShift: -10, shimmer: 0.24, impulse: 0.01 },
    cardBg: 'transparent',
    cardBorder: 'rgba(120, 185, 165, 0.14)',
    tuningKey: 'native-aurora-veil-default',
    productionReady: true,
    startupEligible: true,
    randomEligible: true,
  },
  'native-gravity-current': {
    id: 'native-gravity-current',
    name: 'Gravity Current',
    source: 'native',
    kernel: 'native-gravity-current',
    sceneProfile: 'flow',
    baseParams: { turbulence: 0.28, density: 0.46, glow: 0.24, drift: 0.3, hueShift: -6, shimmer: 0.22, impulse: 0.03 },
    cardBg: 'transparent',
    cardBorder: 'rgba(155, 145, 210, 0.14)',
    tuningKey: 'native-gravity-current-default',
    productionReady: true,
    startupEligible: false,
    randomEligible: true,
  },
  'three-curl-flow': {
    id: 'three-curl-flow',
    name: 'Curl Flow Field',
    source: 'native',
    kernel: 'three-curl-flow',
    sceneProfile: 'flow',
    baseParams: { turbulence: 0.34, density: 0.5, glow: 0.3, drift: 0.34, hueShift: -4, shimmer: 0.26, impulse: 0.04 },
    cardBg: 'transparent',
    cardBorder: 'rgba(150, 170, 215, 0.16)',
    tuningKey: 'three-curl-flow-default',
    productionReady: true,
    startupEligible: true,
    randomEligible: true,
  },
  'three-volumetric-fog': {
    id: 'three-volumetric-fog',
    name: 'Volumetric Fog',
    source: 'native',
    kernel: 'three-volumetric-fog',
    sceneProfile: 'mist',
    baseParams: { turbulence: 0.3, density: 0.44, glow: 0.26, drift: 0.28, hueShift: 6, shimmer: 0.2, impulse: 0.02 },
    cardBg: 'transparent',
    cardBorder: 'rgba(150, 170, 200, 0.15)',
    tuningKey: 'three-volumetric-fog-default',
    productionReady: true,
    startupEligible: false,
    randomEligible: true,
  },
  'three-caustics': {
    id: 'three-caustics',
    name: 'Water Caustics',
    source: 'native',
    kernel: 'three-caustics',
    sceneProfile: 'tide',
    baseParams: { turbulence: 0.32, density: 0.5, glow: 0.32, drift: 0.34, hueShift: -8, shimmer: 0.4, impulse: 0.04 },
    cardBg: 'transparent',
    cardBorder: 'rgba(140, 185, 205, 0.16)',
    tuningKey: 'three-caustics-default',
    productionReady: true,
    startupEligible: false,
    randomEligible: true,
  },
  'three-artwork-flux': {
    id: 'three-artwork-flux',
    name: 'Artwork Flux',
    source: 'native',
    kernel: 'three-artwork-flux',
    sceneProfile: 'texture',
    baseParams: { turbulence: 0.34, density: 0.46, glow: 0.28, drift: 0.3, hueShift: -6, shimmer: 0.24, impulse: 0.05 },
    cardBg: 'transparent',
    cardBorder: 'rgba(175, 155, 205, 0.16)',
    tuningKey: 'three-artwork-flux-default',
    productionReady: true,
    startupEligible: false,
    randomEligible: true,
  },
  'three-flat-material': {
    id: 'three-flat-material',
    name: 'Flat Material',
    source: 'native',
    kernel: 'three-flat-material',
    sceneProfile: 'texture',
    baseParams: { turbulence: 0.3, density: 0.48, glow: 0.3, drift: 0.22, hueShift: -4, shimmer: 0.28, impulse: 0.04 },
    cardBg: 'transparent',
    cardBorder: 'rgba(170, 165, 205, 0.16)',
    tuningKey: 'three-flat-material-default',
    productionReady: true,
    startupEligible: true,
    randomEligible: true,
  },
  'three-light-rays-drift': {
    id: 'three-light-rays-drift',
    name: 'Light Rays',
    source: 'native',
    kernel: 'three-light-rays',
    sceneProfile: 'sparse',
    baseParams: { turbulence: 0.22, density: 0.38, glow: 0.42, drift: 0.26, hueShift: 8, shimmer: 0.34, impulse: 0.02 },
    cardBg: 'transparent',
    cardBorder: 'rgba(200, 180, 140, 0.16)',
    tuningKey: 'three-light-rays-default',
    productionReady: true,
    startupEligible: true,
    randomEligible: true,
  },
  'three-sparse-veil-still': {
    id: 'three-sparse-veil-still',
    name: 'Sparse Veil',
    source: 'native',
    kernel: 'three-sparse-veil',
    sceneProfile: 'mist',
    baseParams: { turbulence: 0.14, density: 0.28, glow: 0.22, drift: 0.12, hueShift: -6, shimmer: 0.14, impulse: 0 },
    cardBg: 'transparent',
    cardBorder: 'rgba(130, 160, 190, 0.13)',
    tuningKey: 'three-sparse-veil-default',
    productionReady: true,
    startupEligible: true,
    randomEligible: true,
  },
  'three-fluid-advection-drift': {
    id: 'three-fluid-advection-drift',
    name: 'Fluid Advection',
    source: 'native',
    kernel: 'three-fluid-advection',
    sceneProfile: 'ink',
    baseParams: { turbulence: 0.18, density: 0.32, glow: 0.24, drift: 0.22, hueShift: 0, shimmer: 0.12, impulse: 0.06 },
    cardBg: 'transparent',
    cardBorder: 'rgba(100, 140, 180, 0.14)',
    tuningKey: 'three-fluid-advection-default',
    productionReady: true,
    startupEligible: false,
    randomEligible: true,
  },
  'three-reaction-diffusion-coral': {
    id: 'three-reaction-diffusion-coral',
    name: 'Reaction Diffusion',
    source: 'native',
    kernel: 'three-reaction-diffusion',
    sceneProfile: 'texture',
    baseParams: { turbulence: 0.22, density: 0.38, glow: 0.28, drift: 0.18, hueShift: -4, shimmer: 0.16, impulse: 0.04 },
    cardBg: 'transparent',
    cardBorder: 'rgba(120, 160, 200, 0.14)',
    tuningKey: 'three-reaction-diffusion-default',
    productionReady: true,
    startupEligible: false,
    randomEligible: true,
  },
};

export const DEFAULT_RECIPE_ID = 'native-smoke-planes';

// When true, the random rotation pool is restricted to Three.js kernels only.
export const THREEJS_ONLY_MODE = false;

export const GLOBAL_DISABLED_RECIPE_IDS: readonly ExplorerRecipeId[] = [
  'native-flow-field-drift',
];

const GLOBAL_DISABLED_RECIPE_ID_SET = new Set(GLOBAL_DISABLED_RECIPE_IDS);

function recipeFlagEnabled(recipe: ExplorerRecipe, key: 'productionReady' | 'reviewable' | 'startupEligible' | 'randomEligible'): boolean {
  return recipe[key] !== false;
}

export function isGloballyDisabledRecipe(recipeId: ExplorerRecipeId): boolean {
  return GLOBAL_DISABLED_RECIPE_ID_SET.has(recipeId);
}

export function isProductionReadyRecipe(recipeId: ExplorerRecipeId): boolean {
  const recipe = RECIPES[recipeId];
  return !!recipe && recipeFlagEnabled(recipe, 'productionReady') && !isGloballyDisabledRecipe(recipeId);
}

export function isImageDependentRecipe(recipeId: ExplorerRecipeId): boolean {
  const kernel = RECIPES[recipeId]?.kernel;
  return kernel === 'three-artwork-flux';
}

export function listReviewRecipeIds(): ExplorerRecipeId[] {
  return listExplorerRecipes()
    .filter((recipe) => recipeFlagEnabled(recipe, 'productionReady') && recipeFlagEnabled(recipe, 'reviewable') && !isGloballyDisabledRecipe(recipe.id))
    .map((recipe) => recipe.id);
}

export function listStartupRecipeIds(): ExplorerRecipeId[] {
  return listExplorerRecipes()
    .filter((recipe) => recipeFlagEnabled(recipe, 'productionReady') && recipeFlagEnabled(recipe, 'startupEligible') && !isGloballyDisabledRecipe(recipe.id))
    .map((recipe) => recipe.id);
}

export function listRandomRecipeIds(localDisabledRecipeIds: readonly ExplorerRecipeId[] = []): ExplorerRecipeId[] {
  const localDisabled = new Set(localDisabledRecipeIds);
  return listExplorerRecipes()
    .filter((recipe) => (
      recipeFlagEnabled(recipe, 'productionReady')
      && recipeFlagEnabled(recipe, 'randomEligible')
      && !isGloballyDisabledRecipe(recipe.id)
      && !localDisabled.has(recipe.id)
      && (!THREEJS_ONLY_MODE || recipe.kernel.startsWith('three-'))
    ))
    .map((recipe) => recipe.id);
}

export const REVIEW_RECIPE_IDS: readonly ExplorerRecipeId[] = listReviewRecipeIds();

export function getExplorerRecipe(recipeId: ExplorerRecipeId): ExplorerRecipe {
  return RECIPES[recipeId] ?? RECIPES[DEFAULT_RECIPE_ID];
}

export function getDefaultExplorerRecipe(): ExplorerRecipe {
  return RECIPES[DEFAULT_RECIPE_ID];
}

export function listExplorerRecipes(): ExplorerRecipe[] {
  return Object.values(RECIPES);
}
