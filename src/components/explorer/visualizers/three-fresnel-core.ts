/* ── Three Fresnel Core ──────────────────────────────────────
   Restrained SDF sphere with Fresnel rim glow — a quiet,
   luminous presence for sparse/focus/outro sections. The core
   breathes slowly with song structure; the rim brightens as the
   section arc deepens. No dense particles, no mechanical motion.
   Fills the Orbit/Core and Sparse Minimal family gaps.

   Technique: fullscreen SDF + Fresnel term, NOISE_GLSL fbm for
   surface texture, STD_UNIFORM_GLSL structural signals.
   Uses createFullscreenScene — the simplest Three path for a
   shader that has no instanced geometry.

   No synthetic beat clock: uBeatPhase is ignored when < 0.
   See THREE_INTEGRATION.md.
──────────────────────────────────────────────────────────────── */

import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import { resolveThreeFresnelCoreTuning, type ThreeFresnelCoreTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams } from '../visualizer';
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

// ── Fragment shader ──────────────────────────────────────────
const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  ${STD_UNIFORM_GLSL}
  ${NOISE_GLSL}

  // Extra per-sketch uniforms
  uniform float uCoreRadius;   // normalised radius of the SDF sphere
  uniform float uRimWidth;     // Fresnel rim falloff scale
  uniform float uGlowRadius;   // soft outer glow extent
  uniform float uPulse;        // eased event pulse (0..1)

  // Signed distance to a sphere centred at the screen midpoint.
  float sdSphere(vec2 uv, float r) {
    // uv is in aspect-correct space [-aspect, aspect] x [-1, 1]
    return length(uv) - r;
  }

  void main() {
    vec2 res = uResolution;
    float aspect = res.x / max(1.0, res.y);

    // Map vUv to aspect-correct centred coords
    vec2 uv = (vUv - 0.5) * vec2(aspect * 2.0, 2.0);

    float beat = beatPulse();

    // Core radius breathes with section progress and level
    float radius = uCoreRadius
      * (0.85 + uSectionProgress * 0.3 + uLevel * 0.15)
      * (1.0 + uPulse * 0.06)
      * beat;

    float dist = sdSphere(uv, radius);

    // Fresnel-style rim: bright at grazing (|dist| ~ 0), dark inside
    float rim = 1.0 - clamp(-dist / (uRimWidth * radius + 0.001), 0.0, 1.0);
    float rimGlow = pow(rim, 3.0 + (1.0 - uGlow) * 4.0);

    // Soft outer glow cloud beyond the sphere surface
    float outerGlow = exp(-max(dist, 0.0) / (uGlowRadius * radius + 0.001));

    // Subtle surface texture via fbm (very slow, almost-still)
    float noiseCoord = uTime * 0.04 * (0.5 + uDrift * 0.8);
    float surf = fbm(vec3(uv * (1.8 + uTurbulence * 0.6), noiseCoord));
    // Apply texture only on the sphere surface (inside or at rim)
    float surfMask = clamp(1.0 - (dist + uRimWidth * radius) / (uRimWidth * radius + 0.001), 0.0, 1.0);
    float surfDetail = mix(0.0, surf * 0.18, surfMask * uShimmer);

    // Core interior — very dark, slightly lighter at centre for depth
    float interior = clamp(-dist / (radius + 0.001), 0.0, 1.0);
    float innerGlow = interior * interior * 0.25 * (0.5 + uLevel * 0.5 + uSectionProgress * 0.3);

    // Warm the rim toward accentWarm as section deepens
    float warmth = clamp(uSectionProgress * 0.7 + uLevel * 0.3, 0.0, 1.0);
    vec3 rimColor = mix(uColorA, uColorWarm, warmth);

    // Compose: background + outer glow + rim + inner + surface detail
    vec3 col = uColorBg;
    col += uColorMid * outerGlow * 0.18 * (0.4 + uGlow * 0.6);
    col += rimColor  * rimGlow   * (0.55 + uGlow * 0.55 + uPulse * 0.15);
    col += uColorA   * innerGlow;
    col += rimColor  * surfDetail;

    // Player panel exclusion: fade toward bg inside the UI rect
    float exMask = exclusionMask();
    col = mix(uColorBg, col, exMask);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ── Scene factory ────────────────────────────────────────────
function makeFresnelCoreScene(): ThreeScene {
  let fs: FullscreenScene | null = null;
  let uniforms: Uniforms | null = null;
  let tuning: ThreeFresnelCoreTuning = resolveThreeFresnelCoreTuning();
  let palette: Palette | null = null;
  let time = 0;
  const section = createSectionProgress();
  let pulse = 0;

  return {
    get scene() { return fs?.scene ?? null; },
    get camera() { return fs?.camera ?? null; },

    build(args: ThreeSceneBuildArgs) {
      tuning  = resolveThreeFresnelCoreTuning(args.tuning);
      palette = args.palette;
      const T = args.three;

      uniforms = {
        ...createStandardUniforms(T, palette, args.w, args.h),
        uCoreRadius:  { value: tuning.coreRadius },
        uRimWidth:    { value: tuning.rimWidth },
        uGlowRadius:  { value: tuning.glowRadius },
        uPulse:       { value: 0 },
      };

      fs = createFullscreenScene(T, FRAGMENT_SHADER, uniforms);
      time = 0;
      section.reset();
      pulse = 0;
    },

    update(dt, params: VisualParams, audio: AudioSignal, exclusion: ExclusionRect) {
      if (!uniforms || !palette) return;
      time += dt;

      pulse += (0 - pulse) * (1 - Math.exp(-dt / 0.8));

      section.update(dt);
      uniforms.uSectionProgress.value = section.value;

      applyStandardUpdate(uniforms, dt, time, params, audio, exclusion, palette);
      uniforms.uSectionProgress.value = section.value; // applyStandardUpdate doesn't set this
      uniforms.uCoreRadius.value = tuning.coreRadius;
      uniforms.uRimWidth.value   = tuning.rimWidth;
      uniforms.uGlowRadius.value = tuning.glowRadius;
      uniforms.uPulse.value      = pulse;
    },

    onEvent(event: VisualEvent) {
      section.handleEvent(event);
      if (event.type === 'glow-pulse' || event.type === 'bloom-flash' || event.type === 'grain-bloom') {
        pulse = Math.min(1, pulse + 0.4 + (event.intensity ?? 0.5) * 0.4);
      }
      if (event.type === 'density-surge' || event.type === 'spark-burst') {
        pulse = Math.min(1, pulse + 0.25);
      }
    },

    resize(w, h) {
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

export function createThreeFresnelCore() {
  return createThreeVisualizer(makeFresnelCoreScene);
}
