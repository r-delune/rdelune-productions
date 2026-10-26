/* ── Three Light Rays ────────────────────────────────────────
   Radial god-rays from a drifting off-screen light source.
   Fills the Light family gap: pure glints/rays/soft bloom
   without dense particles.

   Technique: fullscreen fragment shader. Ray marching from
   each pixel toward a light-source position; separate mote
   pass adds sparse dust points; in-shader bright-pass gives
   bloom. Song structure drives the light-source azimuth sweep
   and palette warmth. Gentle opener, quiet mid-section anchor.
──────────────────────────────────────────────────────────────── */

import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import { resolveThreeLightRaysTuning, type ThreeLightRaysTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams } from '../visualizer';
import { clamp01, hasReducedMotion, mix as mixNum } from './cong-particle-primitives';
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

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  ${STD_UNIFORM_GLSL}
  ${NOISE_GLSL}
  ${GRAIN_GLSL}

  uniform vec2  uLightPos;    // normalised screen position of light source
  uniform float uRayDensity;  // number of ray samples
  uniform float uRayDecay;    // ray brightness fall-off per step
  uniform float uRayExposure; // final exposure multiplier
  uniform float uMoteScale;   // spatial scale of dust mote field
  uniform float uFlash;       // event-driven brightening

  // Light-shaft radial blur: march from pixel toward light and accumulate.
  vec3 godRays(vec2 uv) {
    vec2 aspect = vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
    vec2 uvA = uv * aspect;
    vec2 lightA = uLightPos * aspect;
    vec2 dir = (lightA - uvA) / max(1.0, uRayDensity);
    float illum = 0.0;
    float decay = 1.0;
    float t = uTime * 0.11;

    for (int i = 0; i < 64; i++) {
      if (float(i) >= uRayDensity) break;
      uvA += dir;
      float n = snoise(vec3(uvA * uMoteScale, t + float(i) * 0.04));
      illum += decay * smoothstep(0.45, 0.96, n);
      decay *= uRayDecay;
    }
    illum /= max(1.0, uRayDensity * 0.5);

    float beat = beatPulse();
    float brightness = uRayExposure * (0.52 + uLevel * 0.5 + uGlow * 0.5 + uSectionProgress * 0.22) * beat;
    brightness *= (1.0 + uFlash * 1.6);

    // Warm toward light source centre, cool at edges
    float distToLight = length((vUv - uLightPos) * aspect);
    float warmth = clamp(uSectionProgress * 0.5 + uLevel * 0.2 + (1.0 - distToLight * 1.2), 0.0, 1.0);
    return mix(uColorA, uColorWarm, warmth) * illum * brightness;
  }

  // Sparse dust motes: random bright specks distributed in screen space.
  float dustMotes(vec2 uv) {
    float t = uTime * 0.06;
    vec2 aspect = vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
    // 3x3 tiled noise cells — each cell gets one mote
    vec2 cell = floor(uv * aspect * 6.0);
    vec2 within = fract(uv * aspect * 6.0);
    float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5);
    vec2 motePos = vec2(fract(h * 17.3 + t * 0.018), fract(h * 6.7 + t * 0.012));
    float d = length(within - motePos);
    float brightness = smoothstep(0.06, 0.0, d);
    // Only 1-in-4 cells have a visible mote (hash-based mask)
    float visible = step(0.75, fract(h * 93.1));
    return brightness * visible * (0.12 + h * 0.22);
  }

  void main(){
    vec2 uv = vUv;

    vec3 rays = godRays(uv);
    float motes = dustMotes(uv);
    float moteBrightness = (0.4 + uShimmer * 0.8 + uSectionProgress * 0.3) * (1.0 + uFlash * 0.8);

    // Soft gradient from light position
    vec2 aspect = vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
    float dist = length((uv - uLightPos) * aspect);
    float halo = exp(-dist * (1.4 - uSectionProgress * 0.5)) * (0.14 + uGlow * 0.16 + uLevel * 0.10);

    vec3 col = uColorBg;
    col += uColorMid * halo;
    col += rays;
    col += uColorWarm * motes * moteBrightness;

    col = mix(uColorBg, col, exclusionMask());
    col = applyGrainVignette(col, vUv, 0.025, 0.5);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeLightRaysScene(): ThreeScene {
  let fs: FullscreenScene | null = null;
  let uniforms: Uniforms | null = null;
  let tuning: ThreeLightRaysTuning = resolveThreeLightRaysTuning();
  let palette: Palette | null = null;
  let time = 0;
  let flash = 0;
  let flashTarget = 0;
  let warmColor: [number, number, number] | null = null;
  let colorMorph = 0;
  const section = createSectionProgress();

  return {
    get scene() { return fs?.scene ?? null; },
    get camera() { return fs?.camera ?? null; },

    build(args: ThreeSceneBuildArgs) {
      tuning = resolveThreeLightRaysTuning(args.tuning);
      palette = args.palette;
      uniforms = {
        ...createStandardUniforms(args.three, palette, args.w, args.h),
        uLightPos:    { value: new args.three.Vector2(0.5, 1.1) },
        uRayDensity:  { value: tuning.rayDensity },
        uRayDecay:    { value: tuning.rayDecay },
        uRayExposure: { value: tuning.rayExposure },
        uMoteScale:   { value: tuning.moteScale },
        uFlash:       { value: 0 },
      };
      fs = createFullscreenScene(args.three, FRAGMENT_SHADER, uniforms);
      time = 0;
      flash = 0;
      flashTarget = 0;
      colorMorph = 0;
      warmColor = null;
      section.reset();
    },

    update(dt: number, params: VisualParams, audio: AudioSignal, exclusion: ExclusionRect) {
      if (!uniforms || !palette) return;
      if (!hasReducedMotion()) time += dt;

      const damp = 1 - Math.pow(0.001, dt);
      flash = mixNum(flash, flashTarget, damp);
      flashTarget = Math.max(0, flashTarget - dt * 0.6);
      section.update(dt);

      applyStandardUpdate(uniforms, dt, time, params, audio, exclusion, palette);
      uniforms.uSectionProgress.value = section.value;

      // Light drifts from top-centre → upper-right → upper-left across sections
      const sp = section.value;
      const lightAngle = -Math.PI * 0.5 + sp * Math.PI * 0.55;
      const lightR = 0.35 + sp * 0.15;
      const authoredLightX = 0.5 + Math.cos(lightAngle) * lightR;
      const authoredLightY = 0.5 + Math.sin(lightAngle) * lightR * 0.7;
      const pointer = params.pointer;
      const pointerInfluence = (pointer?.presence ?? 0) * (0.26 + (pointer?.velocity ?? 0) * 0.08);
      (uniforms.uLightPos.value as { set: (x: number, y: number) => void }).set(
        mixNum(authoredLightX, pointer?.x ?? authoredLightX, pointerInfluence),
        mixNum(authoredLightY, 1 - (pointer?.y ?? 1 - authoredLightY), pointerInfluence),
      );

      uniforms.uRayDensity.value = tuning.rayDensity * (0.6 + sp * 0.5);
      uniforms.uFlash.value = flash;

      // Color-morph: blend warm pole
      if (warmColor && colorMorph > 0.001) {
        const base = palette.accentWarm;
        const r = mixNum(base[0], warmColor[0], colorMorph) / 255;
        const g = mixNum(base[1], warmColor[1], colorMorph) / 255;
        const b = mixNum(base[2], warmColor[2], colorMorph) / 255;
        (uniforms.uColorWarm.value as import('three').Vector3).set(r, g, b);
        colorMorph = Math.max(0, colorMorph - dt * 0.3);
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
        flashTarget = Math.min(1, flashTarget + 0.3 + intensity * 0.3);
      }
      if (event.type === 'veil-sweep' || event.type === 'focus-shift') {
        flashTarget = Math.min(1, flashTarget + 0.15 + intensity * 0.25);
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

export function createThreeLightRays() {
  return createThreeVisualizer(makeLightRaysScene);
}
