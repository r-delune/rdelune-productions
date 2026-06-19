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
import { createCongParticleCurrent } from './cong-particle-current';
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
import { createCongArtworkParticleMangle } from './cong-artwork-particle-mangle';
import { createSmokePlanes } from './smoke-planes';
import { createPerlinWarpMesh } from './perlin-warp-mesh';
import { createPerlinFlowField } from './perlin-flow-field';
import { createCongChromaticRing } from './cong-chromatic-ring';
import { createNativeLissajous } from './native-lissajous';
import { createPerlinTerrainErode } from './perlin-terrain-erode';
import { createCongParticleLandscape } from './cong-particle-landscape';
import { createCongImageDatamoshLandscape } from './cong-image-datamosh-landscape';
import { createCongColourVortex } from './cong-colour-vortex';
import { createOrganicDrift } from './organic-drift';
import { createNativeKaleidoFold } from './native-kaleido-fold';
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

export type VisualizerName =
  | 'cong-cloud-orbit'
  | 'cong-landscape-flow'
  | 'cong-landscape-spiral'
  | 'cong-contour-lines'
  | 'cong-planet-core'
  | 'cong-rain-shower'
  | 'cong-generative-particles'
  | 'cong-particle-current'
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
  | 'cong-artwork-particle-mangle'
  | 'smoke-planes'
  | 'perlin-warp-mesh'
  | 'perlin-flow-field'
  | 'cong-chromatic-ring'
  | 'native-lissajous'
  | 'perlin-terrain-erode'
  | 'cong-particle-landscape'
  | 'cong-image-datamosh-landscape'
  | 'cong-colour-vortex'
  | 'organic-drift'
  | 'native-kaleido-fold'
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
  | 'three-sparse-veil';

const FACTORIES: Record<VisualizerName, () => Visualizer> = {
  'cong-cloud-orbit': createCongCloudOrbit,
  'cong-landscape-flow': createCongLandscapeFlow,
  'cong-landscape-spiral': createCongLandscapeSpiral,
  'cong-contour-lines': createCongContourLines,
  'cong-planet-core': createCongPlanetCore,
  'cong-rain-shower': createCongRainShower,
  'cong-generative-particles': createCongGenerativeParticles,
  'cong-particle-current': createCongParticleCurrent,
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
  'cong-artwork-particle-mangle': createCongArtworkParticleMangle,
  'smoke-planes': createSmokePlanes,
  'perlin-warp-mesh': createPerlinWarpMesh,
  'perlin-flow-field': createPerlinFlowField,
  'cong-chromatic-ring': createCongChromaticRing,
  'native-lissajous': createNativeLissajous,
  'perlin-terrain-erode': createPerlinTerrainErode,
  'cong-particle-landscape': createCongParticleLandscape,
  'cong-image-datamosh-landscape': createCongImageDatamoshLandscape,
  'cong-colour-vortex': createCongColourVortex,
  'organic-drift': createOrganicDrift,
  'native-kaleido-fold': createNativeKaleidoFold,
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
