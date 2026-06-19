/* ── Visualizer Registry ────────────────────────────────────
   Maps visualizer names to factory functions.
──────────────────────────────────────────────────────────────── */

import type { Visualizer } from '../visualizer';
import { createCongCloudOrbit } from './cong-cloud-orbit';
import { createCongLandscapeFlow } from './cong-landscape-flow';
import { createCongLandscapeSpiral } from './cong-landscape-spiral';
import { createCongContourLines } from './cong-contour-lines';
import { createCongGenerativeParticles } from './cong-generative-particles';
import { createCongGreenGalaxy } from './cong-green-galaxy';
import { createCongPlanetCore } from './cong-planet-core';
import { createCongLateralCurrent } from './cong-lateral-current';
import { createCongLateralCascade } from './cong-lateral-cascade';
import { createCongVerticalLandscapeStream } from './cong-vertical-landscape-stream';
import { createCongRainShower } from './cong-rain-shower';
import { createCongHorizonField } from './cong-horizon-field';
import { createCongWaterlineShimmer } from './cong-waterline-shimmer';
import { createCongBrokenGrid } from './cong-broken-grid';
import { createCongGridPulse } from './cong-grid-pulse';
import { createCongSparseFall } from './cong-sparse-fall';
import { createCongArtworkDatamosh } from './cong-artwork-datamosh';
import { createSmokePlanes } from './smoke-planes';
import { createPerlinWarpMesh } from './perlin-warp-mesh';
import { createPerlinFlowField } from './perlin-flow-field';
import { createPerlinTerrainErode } from './perlin-terrain-erode';
import { createCongParticleLandscape } from './cong-particle-landscape';
import { createCongImageDatamoshLandscape } from './cong-image-datamosh-landscape';
import { createOrganicDrift } from './organic-drift';
import { createNativeReactionVeil } from './native-reaction-veil';
import { createNativeAttractorDrift } from './native-attractor-drift';
import { createNativeAuroraVeil } from './native-aurora-veil';
import { createNativeSidewindDrift } from './native-sidewind-drift';
import { createNativeGravityCurrent } from './native-gravity-current';
import { createThreeCurlFlow } from './three-curl-flow';
import { createThreeVolumetricFog } from './three-volumetric-fog';
import { createThreeCaustics } from './three-caustics';
import { createThreeArtworkFlux } from './three-artwork-flux';
import { createThreeFresnelCore } from './three-fresnel-core';
import { createThreeFlatMaterial } from './three-flat-material';
import { createThreeLightRays } from './three-light-rays';
import { createThreeSparseVeil } from './three-sparse-veil';
import { createThreeReactionDiffusion } from './three-reaction-diffusion';

export type VisualizerName =
  | 'cong-cloud-orbit'
  | 'cong-landscape-flow'
  | 'cong-landscape-spiral'
  | 'cong-contour-lines'
  | 'cong-planet-core'
  | 'cong-rain-shower'
  | 'cong-generative-particles'
  | 'cong-lateral-current'
  | 'cong-lateral-cascade'
  | 'cong-vertical-landscape-stream'
  | 'cong-green-galaxy'
  | 'cong-horizon-field'
  | 'cong-waterline-shimmer'
  | 'cong-broken-grid'
  | 'cong-grid-pulse'
  | 'cong-sparse-fall'
  | 'cong-artwork-datamosh'
  | 'smoke-planes'
  | 'perlin-warp-mesh'
  | 'perlin-flow-field'
  | 'perlin-terrain-erode'
  | 'cong-particle-landscape'
  | 'cong-image-datamosh-landscape'
  | 'organic-drift'
  | 'native-reaction-veil'
  | 'native-attractor-drift'
  | 'native-aurora-veil'
  | 'native-sidewind-drift'
  | 'native-gravity-current'
  | 'three-curl-flow'
  | 'three-volumetric-fog'
  | 'three-caustics'
  | 'three-artwork-flux'
  | 'three-fresnel-core'
  | 'three-flat-material'
  | 'three-light-rays'
  | 'three-sparse-veil'
  | 'three-reaction-diffusion';

const FACTORIES: Record<VisualizerName, () => Visualizer> = {
  'cong-cloud-orbit': createCongCloudOrbit,
  'cong-landscape-flow': createCongLandscapeFlow,
  'cong-landscape-spiral': createCongLandscapeSpiral,
  'cong-contour-lines': createCongContourLines,
  'cong-planet-core': createCongPlanetCore,
  'cong-rain-shower': createCongRainShower,
  'cong-generative-particles': createCongGenerativeParticles,
  'cong-lateral-current': createCongLateralCurrent,
  'cong-lateral-cascade': createCongLateralCascade,
  'cong-vertical-landscape-stream': createCongVerticalLandscapeStream,
  'cong-green-galaxy': createCongGreenGalaxy,
  'cong-horizon-field': createCongHorizonField,
  'cong-waterline-shimmer': createCongWaterlineShimmer,
  'cong-broken-grid': createCongBrokenGrid,
  'cong-grid-pulse': createCongGridPulse,
  'cong-sparse-fall': createCongSparseFall,
  'cong-artwork-datamosh': createCongArtworkDatamosh,
  'smoke-planes': createSmokePlanes,
  'perlin-warp-mesh': createPerlinWarpMesh,
  'perlin-flow-field': createPerlinFlowField,
  'perlin-terrain-erode': createPerlinTerrainErode,
  'cong-particle-landscape': createCongParticleLandscape,
  'cong-image-datamosh-landscape': createCongImageDatamoshLandscape,
  'organic-drift': createOrganicDrift,
  'native-reaction-veil': createNativeReactionVeil,
  'native-attractor-drift': createNativeAttractorDrift,
  'native-aurora-veil': createNativeAuroraVeil,
  'native-sidewind-drift': createNativeSidewindDrift,
  'native-gravity-current': createNativeGravityCurrent,
  'three-curl-flow': createThreeCurlFlow,
  'three-volumetric-fog': createThreeVolumetricFog,
  'three-caustics': createThreeCaustics,
  'three-artwork-flux': createThreeArtworkFlux,
  'three-fresnel-core': createThreeFresnelCore,
  'three-flat-material': createThreeFlatMaterial,
  'three-light-rays': createThreeLightRays,
  'three-sparse-veil': createThreeSparseVeil,
  'three-reaction-diffusion': createThreeReactionDiffusion,
};

export function createVisualizer(name: VisualizerName): Visualizer {
  const factory = FACTORIES[name];
  if (!factory) throw new Error(`Unknown visualizer: ${name}`);
  return factory();
}

/** Every registered kernel name. Used by scripts/check-rotation for reachability. */
export function listVisualizerNames(): VisualizerName[] {
  return Object.keys(FACTORIES) as VisualizerName[];
}
