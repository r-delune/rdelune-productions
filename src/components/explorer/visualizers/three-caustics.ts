/* ── Three Caustics ──────────────────────────────────────────
   Fullscreen fragment-shader water caustics: domain-warped layered
   noise forms a refractive caustic web with sharp glints, the uv
   warped by a second noise field for shimmer. Fills the explicit
   Water/Tide caustic gap. Built on createThreeVisualizer + the
   shared fullscreen-quad scaffold; song data drives shimmer, swell,
   and glint flashes via the standard uniform block.

   Quality lever: the layer count (uLayers) is set each frame from
   getQualityScale() — a frame-local snapshot only (layer counts
   can't recompile, so a dynamic loop bound is the per-frame lever).
   See THREE_INTEGRATION.md ("GPU Patterns").
──────────────────────────────────────────────────────────────── */

import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import { getQualityScale } from '../render-quality';
import { resolveThreeCausticsTuning, type ThreeCausticsTuning } from '../tuning';
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

const MAX_LAYERS = 6;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  ${STD_UNIFORM_GLSL}
  ${NOISE_GLSL}
  ${GRAIN_GLSL}

  uniform float uLayers;
  uniform float uNoiseScale;
  uniform float uWarpAmount;
  uniform float uFlowSpeed;
  uniform float uSharpness;
  uniform float uGlowGain;
  uniform float uFlash;
  uniform vec2  uLightDir;   // directional light offset, shifts with section
  uniform float uFocus;      // 0=uniform, 1=tightened to center-region near peak

  void main(){
    vec2 uv = vUv;
    uv.x *= uResolution.x / max(1.0, uResolution.y);

    float t = uTime * uFlowSpeed * (0.5 + uDrift * 0.9);
    // Slow swell from the level envelope — no per-frame bass jump.
    float swell = 1.0 + uLevel * 0.35;
    vec2 p = uv * uNoiseScale * swell;

    // Directional light shifts the noise base, simulating light-source movement.
    p += uLightDir * uNoiseScale * 0.38;

    // Refractive warp from a slow second field; eased shimmer/level only.
    // A slow time-rotating matrix on the raw warp breaks x/y independence so the
    // refractive field flows directionally instead of producing grid-aligned plaid.
    float warpAmt = uWarpAmount * (1.0 + uShimmer * 0.5 + uLevel * 0.3);
    vec2 rawWarp = vec2(
      snoise(vec3(p + 1.7, t * 0.6)),
      snoise(vec3(p * 1.1 - 4.3, t * 0.6))
    );
    float wa = uTime * 0.022;
    float wc = cos(wa), ws = sin(wa);
    vec2 warp = vec2(rawWarp.x * wc - rawWarp.y * ws, rawWarp.x * ws + rawWarp.y * wc) * warpAmt;
    p += warp;

    // Ridged layers → caustic web. Sharpens gradually over song sections.
    float sharpness = uSharpness * (1.0 + uSectionProgress * 0.6);
    float caustic = 0.0;
    float amp = 1.0;
    float freq = 1.0;
    float norm = 0.0;
    for (int i = 0; i < ${MAX_LAYERS}; i++) {
      // Fractional layer weight: the top (partial) layer fades in/out smoothly
      // as uLayers changes with quality, instead of popping a whole octave.
      float lw = clamp(uLayers - float(i), 0.0, 1.0);
      if (lw <= 0.0) break;
      float n = snoise(vec3(p * freq, t + float(i) * 1.3));
      caustic += amp * lw * pow(1.0 - abs(n), sharpness);
      norm += amp * lw;
      freq *= 1.72;
      amp *= 0.62;
    }
    caustic /= max(0.001, norm);

    // Directional light presence: spatially-varying falloff toward light direction,
    // always active (creates a sense of light source even in section 1).
    float aspect = uResolution.x / max(1.0, uResolution.y);
    vec2 uvCentered = (vUv - 0.5) * vec2(aspect, 1.0);
    float distFromLight = length(uvCentered - uLightDir * 0.5);
    // Base directional gradient: subtle warm bloom toward the light source
    float dirGlow = mix(0.62, 1.0, exp(-distFromLight * (0.9 + uSectionProgress * 0.8)));
    caustic *= dirGlow;
    // Near peak: caustic additionally tightens into center region
    float focusFalloff = mix(1.0, smoothstep(0.85, 0.12, distFromLight), uFocus);
    caustic *= mix(1.0, focusFalloff, uFocus * 0.7);

    // Glints: the brightest crests, lifted by eased spark/glow events only.
    float glint = pow(caustic, 3.0) * (1.0 + uFlash * 1.5);

    float pulse = beatPulse();
    float brightness = (0.35 + uLevel * 0.4 + uGlow * 0.4 + uSectionProgress * 0.2) * pulse;

    vec3 col = mix(uColorBg, uColorA, caustic * brightness);
    col += uColorWarm * glint * uGlowGain;

    col = mix(uColorBg, col, exclusionMask());
    col = applyGrainVignette(col, vUv, 0.038, 0.55);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeCausticsScene(): ThreeScene {
  let three: ThreeSceneBuildArgs['three'] | null = null;
  let scene: import('three').Scene | null = null;
  let camera: import('three').Camera | null = null;
  let material: import('three').ShaderMaterial | null = null;
  let geometry: import('three').BufferGeometry | null = null;
  let uniforms: Uniforms | null = null;

  let tuning: ThreeCausticsTuning = resolveThreeCausticsTuning();
  let palette: Palette | null = null;
  let time = 0;
  let flash = 0;
  let flashTarget = 0;
  let warmColor: [number, number, number] | null = null;
  let colorMorph = 0;
  const section = createSectionProgress();

  return {
    get scene() { return scene; },
    get camera() { return camera; },

    build(args: ThreeSceneBuildArgs) {
      three = args.three;
      palette = args.palette;
      tuning = resolveThreeCausticsTuning(args.tuning);

      uniforms = createStandardUniforms(three, palette, args.w, args.h);
      uniforms.uLayers = { value: tuning.maxLayers };
      uniforms.uNoiseScale = { value: tuning.noiseScale };
      uniforms.uWarpAmount = { value: tuning.warpAmount };
      uniforms.uFlowSpeed = { value: tuning.flowSpeed };
      uniforms.uSharpness = { value: tuning.sharpness };
      uniforms.uGlowGain = { value: tuning.additiveAlpha };
      uniforms.uFlash = { value: 0 };
      uniforms.uLightDir = { value: new three.Vector2(0, 0) };
      uniforms.uFocus = { value: 0 };

      const fs = createFullscreenScene(three, FRAGMENT_SHADER, uniforms);
      scene = fs.scene;
      camera = fs.camera;
      material = fs.material;
      geometry = fs.geometry;

      time = 0;
      flash = 0;
      flashTarget = 0;
      colorMorph = 0;
      warmColor = null;
      section.reset();
    },

    update(dt, params: VisualParams, audio: AudioSignal, exclusion: ExclusionRect) {
      if (!uniforms || !three || !palette) return;
      time += dt;

      const damp = 1 - Math.pow(0.001, dt);
      flash = mixNum(flash, flashTarget, damp);
      flashTarget = Math.max(0, flashTarget - dt * 0.8);
      section.update(dt);

      applyStandardUpdate(uniforms, dt, time, params, audio, exclusion, palette);
      uniforms.uFlash.value = flash;
      uniforms.uSectionProgress.value = section.value;
      // Light source drifts from diffuse (centred) to directional as sections deepen.
      const sp = section.value;
      const lightAngle = sp * Math.PI * 0.6 - 0.3; // sweeps ~108° across song
      const lightRadius = sp * 0.5;
      (uniforms.uLightDir.value as import('three').Vector2).set(
        Math.cos(lightAngle) * lightRadius,
        Math.sin(lightAngle) * lightRadius * 0.5
      );
      // Near peak (section > 0.55) caustic tightens regionally
      uniforms.uFocus.value = Math.max(0, (sp - 0.45) / 0.55);
      // Fractional layer count is the per-frame quality lever (frame-local);
      // the shader fades the partial top layer so there's no octave popping.
      uniforms.uLayers.value = Math.max(2, tuning.maxLayers * getQualityScale());

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
      if (event.type === 'spark-burst' || event.type === 'glow-pulse' || event.type === 'bloom-flash') {
        flashTarget = Math.min(1, flashTarget + 0.5 + intensity * 0.5);
      }
      if (event.type === 'density-surge' || event.type === 'grain-bloom') {
        flashTarget = Math.min(1, flashTarget + 0.2 + intensity * 0.3);
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

export function createThreeCaustics() {
  return createThreeVisualizer(makeCausticsScene);
}
