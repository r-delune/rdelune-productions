/* ── Visualizer Registry ────────────────────────────────────
   Maps visualizer names to factory functions.
──────────────────────────────────────────────────────────────── */

import type { Visualizer } from '../visualizer';
import { createCongCloudOrbit } from './cong-cloud-orbit';
import { createCongLandscapeFlow } from './cong-landscape-flow';
import { createCongLandscapeSpiral } from './cong-landscape-spiral';
import { createCongContourLines } from './cong-contour-lines';
import { createCongChordStorm } from './cong-chord-storm';
import { createCongGenerativeParticles } from './cong-generative-particles';
import { createCongGreenGalaxy } from './cong-green-galaxy';
import { createCongPlanetCore } from './cong-planet-core';
import { createCongParticleCurrent } from './cong-particle-current';
import { createCongLateralCurrent } from './cong-lateral-current';
import { createCongLateralCascade } from './cong-lateral-cascade';
import { createCongVerticalLandscapeStream } from './cong-vertical-landscape-stream';
import { createCongRainShower } from './cong-rain-shower';
import { createCongTopBottomStorm } from './cong-top-bottom-storm';
import { createCongMistField } from './cong-mist-field';
import { createCongHorizonField } from './cong-horizon-field';
import { createCongWaterlineShimmer } from './cong-waterline-shimmer';
import { createCongGrainErosion } from './cong-grain-erosion';
import { createCongWanderingLines } from './cong-wandering-lines';
import { createCongBrokenGrid } from './cong-broken-grid';
import { createCongGridPulse } from './cong-grid-pulse';
import { createCongSparseFall } from './cong-sparse-fall';
import { createCongSparseConstellation } from './cong-sparse-constellation';
import { createCongArtworkDatamosh } from './cong-artwork-datamosh';
import { createCongArtworkParticleMangle } from './cong-artwork-particle-mangle';
import { createSmokePlanes } from './smoke-planes';
import { createTideLines } from './tide-lines';
import { createPerlinWarpMesh } from './perlin-warp-mesh';
import { createPerlinFlowField } from './perlin-flow-field';
import { createCongChromaticRing } from './cong-chromatic-ring';
import { createNativeLissajous } from './native-lissajous';
import { createPerlinTerrainErode } from './perlin-terrain-erode';
import { createCongParticleLandscape } from './cong-particle-landscape';
import { createCongImageDatamoshLandscape } from './cong-image-datamosh-landscape';
import { createCongColourVortex } from './cong-colour-vortex';
import { createCongTidalMirror } from './cong-tidal-mirror';
import { createOrganicDrift } from './organic-drift';
import { createNativeKaleidoFold } from './native-kaleido-fold';
import { createNativeReactionVeil } from './native-reaction-veil';
import { createNativeAttractorDrift } from './native-attractor-drift';
import { createNativeNightfallRidges } from './native-nightfall-ridges';
import { createNativeAuroraVeil } from './native-aurora-veil';
import { createNativeSidewindDrift } from './native-sidewind-drift';
import { createNativeGravityCurrent } from './native-gravity-current';
import { createThreeCurlFlow } from './three-curl-flow';
import { createThreeVolumetricFog } from './three-volumetric-fog';
import { createThreeCaustics } from './three-caustics';
import { createThreeArtworkFlux } from './three-artwork-flux';

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
  | 'cong-chord-storm'
  | 'cong-top-bottom-storm'
  | 'cong-mist-field'
  | 'cong-horizon-field'
  | 'cong-waterline-shimmer'
  | 'cong-grain-erosion'
  | 'cong-wandering-lines'
  | 'cong-broken-grid'
  | 'cong-grid-pulse'
  | 'cong-sparse-fall'
  | 'cong-sparse-constellation'
  | 'cong-artwork-datamosh'
  | 'cong-artwork-particle-mangle'
  | 'smoke-planes'
  | 'tide-lines'
  | 'perlin-warp-mesh'
  | 'perlin-flow-field'
  | 'cong-chromatic-ring'
  | 'native-lissajous'
  | 'perlin-terrain-erode'
  | 'cong-particle-landscape'
  | 'cong-image-datamosh-landscape'
  | 'cong-colour-vortex'
  | 'cong-tidal-mirror'
  | 'organic-drift'
  | 'native-kaleido-fold'
  | 'native-reaction-veil'
  | 'native-attractor-drift'
  | 'native-nightfall-ridges'
  | 'native-aurora-veil'
  | 'native-sidewind-drift'
  | 'native-gravity-current'
  | 'three-curl-flow'
  | 'three-volumetric-fog'
  | 'three-caustics'
  | 'three-artwork-flux';

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
  'cong-chord-storm': createCongChordStorm,
  'cong-top-bottom-storm': createCongTopBottomStorm,
  'cong-mist-field': createCongMistField,
  'cong-horizon-field': createCongHorizonField,
  'cong-waterline-shimmer': createCongWaterlineShimmer,
  'cong-grain-erosion': createCongGrainErosion,
  'cong-wandering-lines': createCongWanderingLines,
  'cong-broken-grid': createCongBrokenGrid,
  'cong-grid-pulse': createCongGridPulse,
  'cong-sparse-fall': createCongSparseFall,
  'cong-sparse-constellation': createCongSparseConstellation,
  'cong-artwork-datamosh': createCongArtworkDatamosh,
  'cong-artwork-particle-mangle': createCongArtworkParticleMangle,
  'smoke-planes': createSmokePlanes,
  'tide-lines': createTideLines,
  'perlin-warp-mesh': createPerlinWarpMesh,
  'perlin-flow-field': createPerlinFlowField,
  'cong-chromatic-ring': createCongChromaticRing,
  'native-lissajous': createNativeLissajous,
  'perlin-terrain-erode': createPerlinTerrainErode,
  'cong-particle-landscape': createCongParticleLandscape,
  'cong-image-datamosh-landscape': createCongImageDatamoshLandscape,
  'cong-colour-vortex': createCongColourVortex,
  'cong-tidal-mirror': createCongTidalMirror,
  'organic-drift': createOrganicDrift,
  'native-kaleido-fold': createNativeKaleidoFold,
  'native-reaction-veil': createNativeReactionVeil,
  'native-attractor-drift': createNativeAttractorDrift,
  'native-nightfall-ridges': createNativeNightfallRidges,
  'native-aurora-veil': createNativeAuroraVeil,
  'native-sidewind-drift': createNativeSidewindDrift,
  'native-gravity-current': createNativeGravityCurrent,
  'three-curl-flow': createThreeCurlFlow,
  'three-volumetric-fog': createThreeVolumetricFog,
  'three-caustics': createThreeCaustics,
  'three-artwork-flux': createThreeArtworkFlux,
};

export function createVisualizer(name: VisualizerName): Visualizer {
  const factory = FACTORIES[name];
  if (!factory) throw new Error(`Unknown visualizer: ${name}`);
  return factory();
}
