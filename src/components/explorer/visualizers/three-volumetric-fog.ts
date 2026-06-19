/* ── Three Volumetric Fog ────────────────────────────────────
   Fullscreen fragment-shader raymarch through a 3D fbm density
   volume with a cheap single-light scatter term — true depth and
   soft light scattering Canvas2D fog cannot reach. Fills the
   Atmosphere "fog sheets" and Texture "non-particle material"
   repertoire gaps. Built on createThreeVisualizer + the shared
   fullscreen-quad scaffold; song data drives coverage, bloom, and
   billow via the standard uniform block.

   Quality lever: the march step count (uSteps) is set each frame
   from getQualityScale() — a frame-local snapshot only. Step counts
   can't recompile, so a dynamic loop bound is the per-frame lever.
   See THREE_INTEGRATION.md ("GPU Patterns").
──────────────────────────────────────────────────────────────── */

import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import { getQualityScale } from '../render-quality';
import { resolveThreeVolumetricFogTuning, type ThreeVolumetricFogTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams } from '../visualizer';
import { clamp01, mix as mixNum } from './cong-particle-primitives';
import { createThreeVisualizer, type ThreeScene, type ThreeSceneBuildArgs } from './three-visualizer';
import {
  applyStandardUpdate,
  createFullscreenScene,
  createSectionProgress,
  createStandardUniforms,
  GRAIN_GLSL,
  NOISE_GLSL,
  STD_UNIFORM_GLSL,
  type Uniforms,
} from './three-scene-helpers';

const MAX_STEPS = 48;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  ${STD_UNIFORM_GLSL}
  ${NOISE_GLSL}
  ${GRAIN_GLSL}

  uniform float uSteps;
  uniform float uNoiseScale;
  uniform float uDensityScale;
  uniform float uDriftSpeed;
  uniform float uLightStrength;
  uniform float uEmissiveGain;
  uniform float uSurge;

  // Cheap 3-octave density for the volume — the 5-octave shared fbm is far too
  // expensive at raymarch rates. Half-res rendering hides the lost fine detail.
  float fogFbm(vec3 p){
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) { s += a * snoise(p); p *= 2.03; a *= 0.5; }
    return s * 0.5 + 0.5;
  }

  void main(){
    vec2 uv = vUv - 0.5;
    uv.x *= uResolution.x / max(1.0, uResolution.y);

    vec3 ro = vec3(0.0, 0.0, -2.6);
    vec3 rd = normalize(vec3(uv, 1.15));
    vec3 L  = normalize(vec3(0.35, 0.7, -0.4)); // soft key light

    // Slow domain drift only — structural, no per-frame audio billow.
    float t = uTime * uDriftSpeed * (0.5 + uDrift * 1.1);
    vec3 drift = vec3(t * 0.5, -t * 0.3, t);

    // Coverage grows with the slow level envelope and section progress (the
    // fog deepens over the song) — no raw band signal.
    float coverage = uDensityScale * (0.55 + uLevel * 0.5 + uDensity * 0.6 + uSectionProgress * 0.5 + uSurge * 0.5);
    float ns = uNoiseScale;

    float marchDist = 5.0;
    float stepSize = marchDist / uSteps;

    vec4 acc = vec4(0.0);
    for (int i = 0; i < ${MAX_STEPS}; i++) {
      if (float(i) >= uSteps) break;
      vec3 p = ro + rd * (float(i) * stepSize + 0.15);

      float base = fogFbm(p * ns + drift);
      // Sections reveal a touch more fine structure over the song.
      float d = smoothstep(0.52 - uSectionProgress * 0.06, 0.9, base) * coverage;
      if (d <= 0.003) continue;

      // Cheap self-shadow toward the light (single octave) for soft scatter.
      float lit = snoise((p + L * 0.28) * ns + drift) * 0.5 + 0.5;
      float scatter = clamp((base - lit) * 1.8 + 0.35, 0.0, 1.0);

      vec3 fogColor = mix(uColorMid, uColorA, scatter * uLightStrength + uLevel * 0.25);
      fogColor = mix(fogColor, uColorWarm, uSurge * 0.4);

      float a = clamp(d * stepSize * 5.0, 0.0, 1.0);
      acc.rgb += (1.0 - acc.a) * a * fogColor;
      acc.a   += (1.0 - acc.a) * a;
      if (acc.a > 0.97) break;
    }

    // Composite premultiplied fog over the palette background; subtle beat lift.
    float pulse = beatPulse();
    vec3 col = uColorBg * (1.0 - acc.a) + acc.rgb * uEmissiveGain * pulse;
    col = mix(col, col + uColorA * uGlow * 0.18, uGlow);

    // Dim under the player panel for readability.
    col = mix(uColorBg, col, exclusionMask());
    col = applyGrainVignette(col, vUv, 0.032, 0.62);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeFogScene(): ThreeScene {
  let three: ThreeModuleRef = null;
  let scene: import('three').Scene | null = null;
  let camera: import('three').Camera | null = null;
  let material: import('three').ShaderMaterial | null = null;
  let geometry: import('three').BufferGeometry | null = null;
  let uniforms: Uniforms | null = null;

  let tuning: ThreeVolumetricFogTuning = resolveThreeVolumetricFogTuning();
  let palette: Palette | null = null;
  let time = 0;
  let surge = 0;
  let surgeTarget = 0;
  let warmColor: [number, number, number] | null = null;
  let colorMorph = 0;
  const section = createSectionProgress();

  return {
    get scene() { return scene; },
    get camera() { return camera; },
    // Raymarch is heavy per-pixel; render at half resolution and let the 2D
    // blit upscale. Fog is soft, so the upscale is invisible.
    get renderScale() { return 0.5; },

    build(args: ThreeSceneBuildArgs) {
      three = args.three;
      palette = args.palette;
      tuning = resolveThreeVolumetricFogTuning(args.tuning);

      uniforms = createStandardUniforms(three, palette, args.w, args.h);
      uniforms.uSteps = { value: tuning.maxSteps };
      uniforms.uNoiseScale = { value: tuning.noiseScale };
      uniforms.uDensityScale = { value: tuning.densityScale };
      uniforms.uDriftSpeed = { value: tuning.driftSpeed };
      uniforms.uLightStrength = { value: tuning.lightStrength };
      uniforms.uEmissiveGain = { value: tuning.additiveAlpha };
      uniforms.uSurge = { value: 0 };

      const fs = createFullscreenScene(three, FRAGMENT_SHADER, uniforms);
      scene = fs.scene;
      camera = fs.camera;
      material = fs.material;
      geometry = fs.geometry;

      time = 0;
      surge = 0;
      surgeTarget = 0;
      colorMorph = 0;
      warmColor = null;
      section.reset();
    },

    update(dt, params: VisualParams, audio: AudioSignal, exclusion: ExclusionRect) {
      if (!uniforms || !three || !palette) return;
      time += dt;

      const damp = 1 - Math.pow(0.001, dt);
      surge = mixNum(surge, surgeTarget, damp);
      surgeTarget = Math.max(0, surgeTarget - dt * 0.5);
      section.update(dt);

      applyStandardUpdate(uniforms, dt, time, params, audio, exclusion, palette);
      uniforms.uSurge.value = surge;
      uniforms.uSectionProgress.value = section.value;
      // Raymarch step count is the per-frame quality lever (frame-local).
      uniforms.uSteps.value = Math.max(8, Math.round(tuning.maxSteps * getQualityScale()));

      if (warmColor && colorMorph > 0.001) {
        const baseWarm = palette.accentWarm;
        const r = mixNum(baseWarm[0], warmColor[0], colorMorph) / 255;
        const g = mixNum(baseWarm[1], warmColor[1], colorMorph) / 255;
        const b = mixNum(baseWarm[2], warmColor[2], colorMorph) / 255;
        (uniforms.uColorWarm.value as import('three').Vector3).set(r, g, b);
        colorMorph = Math.max(0, colorMorph - dt * 0.25);
      }
    },

    onEvent(event: VisualEvent) {
      section.handleEvent(event);
      const intensity = clamp01(event.intensity ?? 0.5);
      if (event.type === 'density-surge' || event.type === 'grain-bloom' || event.type === 'bloom-flash') {
        surgeTarget = Math.min(1, surgeTarget + 0.4 + intensity * 0.5);
      }
      if (event.type === 'glow-pulse' || event.type === 'spark-burst') {
        surgeTarget = Math.min(1, surgeTarget + 0.2 + intensity * 0.3);
      }
      if ((event.type === 'color-morph' || event.type === 'palette-morph') && event.color) {
        warmColor = event.color;
        colorMorph = Math.min(1, 0.5 + intensity * 0.5);
      }
    },

    resize(w, h) {
      if (uniforms) (uniforms.uResolution.value as import('three').Vector2).set(w, h);
    },

    dispose() {
      geometry?.dispose();
      material?.dispose();
      geometry = null;
      material = null;
      scene = null;
      camera = null;
      uniforms = null;
      three = null;
    },
  };
}

type ThreeModuleRef = ThreeSceneBuildArgs['three'] | null;

export function createThreeVolumetricFog() {
  return createThreeVisualizer(makeFogScene);
}
