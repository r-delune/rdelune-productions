/* ── Three Flat Material ─────────────────────────────────────
   Fullscreen GPU material surface: matte sediment strata, pitted
   grain, and eroded relief. It fills the Texture gap with a flat,
   tactile surface rather than fog, particles, caustics, or artwork mosh.

   Song structure owns the arc: buried matte sediment opens into
   terraced relief and late-section fault edges; audio and events only
   add eased pressure/edge lift.
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
  GRAIN_GLSL,
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
  ${GRAIN_GLSL}

  uniform float uLayers;
  uniform float uGrainScale;
  uniform float uCellScale;
  uniform float uErosion;
  uniform float uReliefGain;
  uniform float uPressure;
  uniform vec2  uDriftDir;   // directional drift axis, changes per section
  uniform float uColorMorph; // event-driven chromatic push (0..1)

  vec2 materialUv(){
    vec2 uv = vUv;
    uv.x *= uResolution.x / max(1.0, uResolution.y);
    return uv;
  }

  float matteGrain(vec2 p, float t){
    float sum = 0.0;
    float amp = 0.55;
    float freq = 1.0;
    float norm = 0.0;
    for (int i = 0; i < ${MAX_LAYERS}; i++) {
      float lw = clamp(uLayers - float(i), 0.0, 1.0);
      if (lw <= 0.0) break;
      float n = snoise(vec3(p * freq, t + float(i) * 9.17));
      sum += (n * 0.5 + 0.5) * amp * lw;
      norm += amp * lw;
      freq *= 1.82;
      amp *= 0.58;
    }
    return sum / max(0.001, norm);
  }

  float erodedRelief(vec2 p, float t){
    float chapter = smoothstep(0.0, 1.0, uSectionProgress);
    float broad = fbm(vec3(p * uCellScale * mix(0.62, 1.42, chapter), t * 0.24));
    float pitted = fbm(vec3(p * (uCellScale * mix(1.25, 3.1, chapter)) + 11.0, t * 0.18));
    float relief = smoothstep(mix(0.38, 0.18, chapter), 0.88, broad * mix(0.86, 0.62, chapter) + pitted * mix(0.14, 0.38, chapter));
    float terraceCount = mix(2.5, 9.5, chapter);
    float terraces = abs(fract(relief * terraceCount + chapter * 0.18) - 0.5);
    return relief - terraces * (mix(0.04, 0.18, chapter) + uErosion * 0.08);
  }

  float strataBands(vec2 uv, float t){
    float chapter = smoothstep(0.0, 1.0, uSectionProgress);
    float slope = uv.y + uv.x * (0.035 + uTurbulence * 0.08 + chapter * 0.08);
    float drift = snoise(vec3(uv * vec2(0.9, 1.7), t * 0.16)) * (0.018 + uTurbulence * 0.035 + chapter * 0.04);
    float bands = sin((slope + drift) * mix(12.0, 46.0 + uDensity * 14.0, chapter));
    return smoothstep(mix(-0.65, -0.12, chapter), 1.0, bands) * 0.68 + 0.32 * fbm(vec3(uv * vec2(1.0, mix(2.1, 7.2, chapter)), t * 0.12));
  }

  float faultLift(vec2 uv, vec2 warp, float t){
    float chapter = smoothstep(0.18, 0.92, uSectionProgress);
    vec2 faultUv = uv * vec2(1.05, 2.8) + vec2(uv.y * 0.18, -uv.x * 0.08) + warp * 0.22;
    float line = 1.0 - abs(snoise(vec3(faultUv, t * 0.12)));
    float branch = 1.0 - abs(snoise(vec3(faultUv * 1.9 + 8.0, t * 0.1)));
    float fault = pow(max(line, branch * 0.78), 4.5);
    return fault * chapter;
  }

  void main(){
    vec2 uv = materialUv();
    vec2 centered = uv - vec2(0.5 * uResolution.x / max(1.0, uResolution.y), 0.5);
    // Directional drift: axis shifts per section instead of uniform scroll
    float tBase = uTime * (0.025 + uDrift * 0.045);
    float t = tBase + dot(uv, uDriftDir) * 0.18;

    float chapter = smoothstep(0.0, 1.0, uSectionProgress);
    float midOpen = smoothstep(0.18, 0.58, uSectionProgress);
    float lateOpen = smoothstep(0.54, 0.95, uSectionProgress);
    float structural = clamp(chapter * 0.86 + uLevel * 0.08 + uPressure * 0.22, 0.0, 1.0);
    float warpStrength = 0.012 + uTurbulence * 0.036 + structural * 0.055;
    vec2 warp = vec2(
      snoise(vec3(uv * 1.7, t)),
      snoise(vec3(uv.yx * 1.9 + 17.0, t + 3.0))
    );
    vec2 p = uv * uGrainScale * mix(0.74, 1.18, midOpen) + warp * warpStrength;

    float grain = matteGrain(p, t);
    float relief = erodedRelief(p + warp * 0.16, t);
    float bands = strataBands(uv, t);
    float sediment = fbm(vec3(centered * vec2(1.2, 0.55), t * 0.24));
    float fault = faultLift(uv, warp, t);

    float reveal = smoothstep(0.08, 0.86, structural + uDensity * 0.08);
    float pore = pow(1.0 - grain, mix(4.8, 2.7, midOpen)) * (0.06 + uShimmer * 0.14 + midOpen * 0.08);
    float liftedEdge = smoothstep(mix(0.68, 0.46, midOpen), 0.84, relief) * smoothstep(0.78, 0.32, grain);
    float shadow = smoothstep(mix(0.28, 0.12, midOpen), 0.64, relief);
    float buried = 1.0 - smoothstep(0.10, 0.42, uSectionProgress);

    float vignette = smoothstep(0.96, 0.22, distance(vUv, vec2(0.48, 0.52)));
    float horizonShade = smoothstep(0.98, 0.18, vUv.y);

    vec3 base = mix(uColorBg, uColorMid, 0.22 + sediment * 0.24 + bands * (0.08 + midOpen * 0.26) + grain * 0.08);
    base *= mix(0.46, 0.68, midOpen) + horizonShade * 0.24 + shadow * (0.08 + midOpen * 0.14);
    // Color-morph from events: push warmth toward a saturated mineral tone
    float warmPush = clamp(structural * 0.55 + bands * 0.18 + lateOpen * 0.28 + uColorMorph * 0.7, 0.0, 1.0);
    vec3 mineral = mix(uColorA, uColorWarm, warmPush);

    vec3 col = base;
    col = mix(col, uColorBg, buried * 0.32);
    col -= uColorBg * (1.0 - shadow) * (0.08 + midOpen * 0.14);
    col += uColorA * pore * (0.08 + midOpen * 0.12);
    col = mix(col, mineral, liftedEdge * (0.04 + reveal * 0.23));
    col -= uColorBg * fault * (0.18 + lateOpen * 0.42);
    col += mineral * fault * uReliefGain * (0.10 + lateOpen * 0.55 + uPressure * 0.14);
    col += mineral * liftedEdge * uReliefGain * (0.035 + uGlow * 0.12 + lateOpen * 0.12 + uPressure * 0.08);
    col += uColorWarm * bands * reveal * (0.014 + lateOpen * 0.045);
    col *= 0.72 + vignette * 0.36;
    col = mix(uColorBg, col, exclusionMask());
    col = applyGrainVignette(col, vUv, 0.045, 0.0);

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
  let colorMorph = 0;
  let colorMorphTarget = 0;
  // Per-section drift axis: target rotates ~45° at each section boundary,
  // current lerps toward target over ~1.4 s so the shift feels like sediment
  // reorienting under current rather than a hard cut.
  let driftDirX = 1;
  let driftDirY = 0;
  let targetDriftDirX = 1;
  let targetDriftDirY = 0;
  let prevSectionIdx = -1;
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
        uReliefGain: { value: tuning.reliefGain },
        uPressure: { value: 0 },
        uDriftDir: { value: new args.three.Vector2(1, 0) },
        uColorMorph: { value: 0 },
      };

      fs = createFullscreenScene(args.three, FRAGMENT_SHADER, uniforms);
      time = 0;
      pressure = 0;
      pressureTarget = 0;
      colorMorph = 0;
      colorMorphTarget = 0;
      driftDirX = 1;
      driftDirY = 0;
      targetDriftDirX = 1;
      targetDriftDirY = 0;
      prevSectionIdx = -1;
      section.reset();
    },

    update(dt: number, params: VisualParams, audio: AudioSignal, exclusion: ExclusionRect) {
      if (!uniforms || !palette) return;
      time += dt;
      const damp = 1 - Math.exp(-Math.max(0, dt) / 2.2);
      pressure = mixNum(pressure, pressureTarget, damp);
      pressureTarget = Math.max(0, pressureTarget - dt * 0.34);
      colorMorph = mixNum(colorMorph, colorMorphTarget, damp);
      colorMorphTarget = Math.max(0, colorMorphTarget - dt * 0.5);
      section.update(dt);

      // Set target drift direction at each section change; lerp current toward it
      const sectionIdx = Math.floor(section.value * 4);
      if (sectionIdx !== prevSectionIdx && prevSectionIdx >= 0) {
        const rotAngle = (Math.PI / 4) * (1 + (sectionIdx % 2) * 0.6);
        const cosA = Math.cos(rotAngle);
        const sinA = Math.sin(rotAngle);
        targetDriftDirX = targetDriftDirX * cosA - targetDriftDirY * sinA;
        targetDriftDirY = targetDriftDirX * sinA + targetDriftDirY * cosA;
      }
      prevSectionIdx = sectionIdx;
      // Lerp current toward target (~1.4 s time constant)
      const driftDamp = 1 - Math.exp(-Math.max(0, dt) / 1.4);
      driftDirX += (targetDriftDirX - driftDirX) * driftDamp;
      driftDirY += (targetDriftDirY - driftDirY) * driftDamp;

      applyStandardUpdate(uniforms, dt, time, params, audio, exclusion, palette);
      uniforms.uSectionProgress.value = section.value;
      uniforms.uLayers.value = Math.max(3, tuning.maxLayers * getQualityScale());
      uniforms.uGrainScale.value = tuning.grainScale * (0.72 + section.value * 0.36 + params.density * 0.18);
      uniforms.uCellScale.value = tuning.cellScale * (0.68 + section.value * 0.74);
      uniforms.uErosion.value = tuning.erosion + section.value * 0.54;
      uniforms.uReliefGain.value = tuning.reliefGain * (0.72 + section.value * 0.62);
      uniforms.uPressure.value = Math.min(1, pressure);
      uniforms.uColorMorph.value = colorMorph;
      (uniforms.uDriftDir.value as { set: (x: number, y: number) => void }).set(driftDirX, driftDirY);
    },

    onEvent(event: VisualEvent) {
      section.handleEvent(event);
      const intensity = clamp01(event.intensity ?? 0.5);
      if (event.type === 'grain-bloom' || event.type === 'density-surge') {
        pressureTarget = Math.min(0.62, pressureTarget + 0.12 + intensity * 0.18);
      }
      if (event.type === 'glow-pulse' || event.type === 'bloom-flash' || event.type === 'spark-burst') {
        pressureTarget = Math.min(0.42, pressureTarget + 0.06 + intensity * 0.1);
      }
      if (event.type === 'color-morph' || event.type === 'palette-morph') {
        colorMorphTarget = Math.min(1, 0.5 + intensity * 0.5);
        pressureTarget = Math.min(0.62, pressureTarget + 0.18 + intensity * 0.2);
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
