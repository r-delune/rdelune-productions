/* ── Three Flat Material ─────────────────────────────────────
   Fullscreen GPU material surface: sediment grain, cellular erosion,
   and luminous mineral veins. It fills the Texture gap with a flat,
   tactile surface rather than fog, particles, or artwork mosh.

   Song structure owns the arc: sections reveal brighter fissures and
   larger eroded cells; audio and events only add eased pressure/glow.
──────────────────────────────────────────────────────────────── */

import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import { getQualityScale } from '../render-quality';
import { resolveThreeFlatMaterialTuning, type ThreeFlatMaterialTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams } from '../visualizer';
import { clamp01, mix as mixNum } from './cong-particle-primitives';
import {
  applyStandardUpdate,
  createFullscreenScene,
  createSectionProgress,
  createStandardUniforms,
  NOISE_GLSL,
  STD_UNIFORM_GLSL,
  type FullscreenScene,
  type Uniforms,
} from './three-scene-helpers';
import { createThreeVisualizer, type ThreeScene, type ThreeSceneBuildArgs } from './three-visualizer';

const MAX_LAYERS = 7;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  ${STD_UNIFORM_GLSL}
  ${NOISE_GLSL}

  uniform float uLayers;
  uniform float uGrainScale;
  uniform float uCellScale;
  uniform float uErosion;
  uniform float uVeinGlow;
  uniform float uPressure;

  vec2 materialUv(){
    vec2 uv = vUv;
    uv.x *= uResolution.x / max(1.0, uResolution.y);
    return uv;
  }

  float layeredGrain(vec2 p, float t){
    float sum = 0.0;
    float amp = 0.55;
    float freq = 1.0;
    float norm = 0.0;
    for (int i = 0; i < ${MAX_LAYERS}; i++) {
      float lw = clamp(uLayers - float(i), 0.0, 1.0);
      if (lw <= 0.0) break;
      float n = snoise(vec3(p * freq, t + float(i) * 9.17));
      float ridge = 1.0 - abs(n);
      sum += pow(ridge, 1.8 + uErosion * 1.6) * amp * lw;
      norm += amp * lw;
      freq *= 1.82;
      amp *= 0.58;
    }
    return sum / max(0.001, norm);
  }

  float cellCrackle(vec2 p, float t){
    vec2 q = p * uCellScale;
    float a = snoise(vec3(q, t));
    float b = snoise(vec3(q * 1.37 + 12.0, t * 0.7));
    float c = snoise(vec3(q * 2.1 - 8.0, t * 0.45));
    float cracks = abs(a * 0.62 + b * 0.28 + c * 0.10);
    return pow(1.0 - cracks, 4.0 + uErosion * 5.0);
  }

  void main(){
    vec2 uv = materialUv();
    vec2 centered = uv - vec2(0.5 * uResolution.x / max(1.0, uResolution.y), 0.5);
    float t = uTime * (0.025 + uDrift * 0.045);

    float structural = clamp(uSectionProgress * 0.72 + uLevel * 0.18 + uPressure * 0.35, 0.0, 1.0);
    float warpStrength = 0.05 + uTurbulence * 0.08 + structural * 0.04;
    vec2 warp = vec2(
      snoise(vec3(uv * 1.7, t)),
      snoise(vec3(uv.yx * 1.9 + 17.0, t + 3.0))
    );
    vec2 p = uv * uGrainScale + warp * warpStrength;

    float grain = layeredGrain(p, t);
    float cells = cellCrackle(p + warp * 0.22, t * 0.8);
    float sediment = fbm(vec3(centered * vec2(1.4, 0.75), t * 0.32));

    float reveal = smoothstep(0.18, 0.86, structural + uDensity * 0.18);
    float vein = smoothstep(0.54 - reveal * 0.18, 0.94, cells + grain * 0.18);
    float pore = pow(1.0 - grain, 3.0) * (0.16 + uShimmer * 0.25);

    float vignette = smoothstep(0.96, 0.22, distance(vUv, vec2(0.48, 0.52)));
    float horizonShade = smoothstep(0.98, 0.18, vUv.y);

    vec3 base = mix(uColorBg, uColorMid, 0.34 + sediment * 0.34 + grain * 0.18);
    base *= 0.68 + horizonShade * 0.26;
    vec3 mineral = mix(uColorA, uColorWarm, clamp(structural + grain * 0.35, 0.0, 1.0));

    vec3 col = base;
    col += uColorA * pore * 0.25;
    col = mix(col, mineral, vein * (0.18 + reveal * 0.34));
    col += mineral * pow(vein, 2.4) * uVeinGlow * (0.22 + uGlow * 0.7 + uPressure * 0.45);
    col += uColorWarm * pow(max(0.0, grain - 0.58), 2.0) * (0.08 + uShimmer * 0.14);
    col *= 0.72 + vignette * 0.36;
    col *= beatPulse();
    col = mix(uColorBg, col, exclusionMask());

    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeFlatMaterialScene(): ThreeScene {
  let fs: FullscreenScene | null = null;
  let uniforms: Uniforms | null = null;
  let tuning: ThreeFlatMaterialTuning = resolveThreeFlatMaterialTuning();
  let palette: Palette | null = null;
  let time = 0;
  let pressure = 0;
  let pressureTarget = 0;
  const section = createSectionProgress();

  return {
    get scene() { return fs?.scene ?? null; },
    get camera() { return fs?.camera ?? null; },
    get renderScale() { return 0.86; },

    build(args: ThreeSceneBuildArgs) {
      tuning = resolveThreeFlatMaterialTuning(args.tuning);
      palette = args.palette;
      uniforms = {
        ...createStandardUniforms(args.three, palette, args.w, args.h),
        uLayers: { value: tuning.maxLayers },
        uGrainScale: { value: tuning.grainScale },
        uCellScale: { value: tuning.cellScale },
        uErosion: { value: tuning.erosion },
        uVeinGlow: { value: tuning.veinGlow },
        uPressure: { value: 0 },
      };

      fs = createFullscreenScene(args.three, FRAGMENT_SHADER, uniforms);
      time = 0;
      pressure = 0;
      pressureTarget = 0;
      section.reset();
    },

    update(dt: number, params: VisualParams, audio: AudioSignal, exclusion: ExclusionRect) {
      if (!uniforms || !palette) return;
      time += dt;
      const damp = 1 - Math.pow(0.001, dt);
      pressure = mixNum(pressure, pressureTarget, damp);
      pressureTarget = Math.max(0, pressureTarget - dt * 0.62);
      section.update(dt);

      applyStandardUpdate(uniforms, dt, time, params, audio, exclusion, palette);
      uniforms.uSectionProgress.value = section.value;
      uniforms.uLayers.value = Math.max(3, tuning.maxLayers * getQualityScale());
      uniforms.uGrainScale.value = tuning.grainScale * (0.88 + params.density * 0.24);
      uniforms.uCellScale.value = tuning.cellScale * (0.92 + section.value * 0.22);
      uniforms.uErosion.value = tuning.erosion + section.value * 0.28 + audio.energy * 0.08;
      uniforms.uVeinGlow.value = tuning.veinGlow;
      uniforms.uPressure.value = Math.min(1, pressure + params.impulse * 0.22);
    },

    onEvent(event: VisualEvent) {
      section.handleEvent(event);
      const intensity = clamp01(event.intensity ?? 0.5);
      if (event.type === 'grain-bloom' || event.type === 'density-surge') {
        pressureTarget = Math.min(1, pressureTarget + 0.35 + intensity * 0.42);
      }
      if (event.type === 'glow-pulse' || event.type === 'bloom-flash' || event.type === 'spark-burst') {
        pressureTarget = Math.min(1, pressureTarget + 0.18 + intensity * 0.28);
      }
    },

    resize(w: number, h: number) {
      if (uniforms) {
        (uniforms.uResolution.value as { set: (x: number, y: number) => void }).set(w, h);
      }
    },

    dispose() {
      fs?.material.dispose();
      fs?.geometry.dispose();
      fs = null;
      uniforms = null;
      palette = null;
    },
  };
}

export function createThreeFlatMaterial() {
  return createThreeVisualizer(makeFlatMaterialScene);
}
