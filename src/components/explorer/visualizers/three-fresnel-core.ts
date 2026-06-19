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
  GRAIN_GLSL,
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
  ${GRAIN_GLSL}

  // Extra per-sketch uniforms
  uniform float uCoreRadius;   // normalised radius of the SDF sphere
  uniform float uRimWidth;     // Fresnel rim falloff scale
  uniform float uGlowRadius;   // soft outer glow extent
  uniform float uPulse;        // eased event pulse (0..1)
  uniform vec2  uOrbitPos;     // secondary ring centre (aspect-corrected)
  uniform float uOrbitAlpha;   // 0=hidden, 1=fully visible (fades in at section 2)
  uniform float uColorMorph;   // chromatic shift amount from color-morph event

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

    // Entrance arc: core emerges from near-invisible point in section 1
    float emerge = smoothstep(0.0, 0.22, uSectionProgress) * 0.85 + 0.15;

    // Core center drifts slowly toward a side as section deepens (directed motion)
    vec2 coreCenter = vec2(uSectionProgress * 0.08, -uSectionProgress * 0.04);
    vec2 uvCore = uv - coreCenter;

    // Core radius breathes with section progress and level — less mechanical by
    // linking to section rather than a stand-alone pulse
    float radius = uCoreRadius
      * emerge
      * (0.82 + uSectionProgress * 0.35 + uLevel * 0.12)
      * (1.0 + uPulse * 0.06)
      * beat;

    float dist = sdSphere(uvCore, radius);

    // Fresnel-style rim: bright at grazing (|dist| ~ 0), dark inside
    float rim = 1.0 - clamp(-dist / (uRimWidth * radius + 0.001), 0.0, 1.0);
    float rimGlow = pow(rim, 3.0 + (1.0 - uGlow) * 4.0);

    // Soft outer glow cloud beyond the sphere surface
    float outerGlow = exp(-max(dist, 0.0) / (uGlowRadius * radius + 0.001));

    // Subtle surface texture via fbm (very slow, almost-still)
    float noiseCoord = uTime * 0.04 * (0.5 + uDrift * 0.8);
    float surf = fbm(vec3(uvCore * (1.8 + uTurbulence * 0.6), noiseCoord));
    // Apply texture only on the sphere surface (inside or at rim)
    float surfMask = clamp(1.0 - (dist + uRimWidth * radius) / (uRimWidth * radius + 0.001), 0.0, 1.0);
    float surfDetail = mix(0.0, surf * 0.18, surfMask * uShimmer);

    // Core interior — very dark, slightly lighter at centre for depth
    float interior = clamp(-dist / (radius + 0.001), 0.0, 1.0);
    float innerGlow = interior * interior * 0.25 * (0.5 + uLevel * 0.5 + uSectionProgress * 0.3);

    // Orbiting secondary ring — appears at section 2+ (section > 0.35)
    float ringRadius = radius * 1.7;
    float ringWidth  = radius * 0.06;
    float ringDist   = abs(length(uv - uOrbitPos) - ringRadius);
    float ring = exp(-ringDist * ringDist / (ringWidth * ringWidth + 0.0001));
    ring *= uOrbitAlpha;

    // Warm the rim toward accentWarm as section deepens
    float warmth = clamp(uSectionProgress * 0.7 + uLevel * 0.3 + uColorMorph * 0.5, 0.0, 1.0);
    vec3 rimColor = mix(uColorA, uColorWarm, warmth);

    // Depth background: very slow 2D fbm plane drifting at half the core speed,
    // giving a sense of textured space behind the sphere form.
    float bgT = uTime * 0.018;
    float bgNoise = fbm(vec3(uv * 0.55, bgT));
    float bgLayer = smoothstep(0.32, 0.78, bgNoise) * (0.07 + uSectionProgress * 0.06 + uGlow * 0.04);

    // Compose: background + depth layer + outer glow + rim + inner + surface detail + ring
    vec3 col = uColorBg;
    col += uColorMid * bgLayer;
    col += uColorMid * outerGlow * 0.18 * (0.4 + uGlow * 0.6);
    col += rimColor  * rimGlow   * (0.55 + uGlow * 0.55 + uPulse * 0.15);
    col += uColorA   * innerGlow;
    col += rimColor  * surfDetail;
    col += uColorMid * ring * (0.4 + uGlow * 0.3);

    // Player panel exclusion: fade toward bg inside the UI rect
    float exMask = exclusionMask();
    col = mix(uColorBg, col, exMask);
    col = applyGrainVignette(col, vUv, 0.03, 0.6);

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
  let orbitAngle = 0;
  let colorMorph = 0;
  let colorMorphTarget = 0;

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
        uOrbitPos:    { value: new args.three.Vector2(0, 0) },
        uOrbitAlpha:  { value: 0 },
        uColorMorph:  { value: 0 },
      };

      fs = createFullscreenScene(T, FRAGMENT_SHADER, uniforms);
      time = 0;
      section.reset();
      pulse = 0;
      orbitAngle = 0;
      colorMorph = 0;
      colorMorphTarget = 0;
    },

    update(dt, params: VisualParams, audio: AudioSignal, exclusion: ExclusionRect) {
      if (!uniforms || !palette) return;
      time += dt;

      pulse += (0 - pulse) * (1 - Math.exp(-dt / 0.8));
      colorMorph += (colorMorphTarget - colorMorph) * (1 - Math.exp(-dt / 0.6));
      colorMorphTarget = Math.max(0, colorMorphTarget - dt * 0.4);

      // Orbit ring: slowly revolves, speed increases with section
      orbitAngle += dt * (0.18 + section.value * 0.22);
      section.update(dt);
      const sp = section.value;

      applyStandardUpdate(uniforms, dt, time, params, audio, exclusion, palette);
      uniforms.uSectionProgress.value = sp;
      uniforms.uCoreRadius.value = tuning.coreRadius;
      uniforms.uRimWidth.value   = tuning.rimWidth;
      uniforms.uGlowRadius.value = tuning.glowRadius;
      uniforms.uPulse.value      = pulse;
      uniforms.uColorMorph.value = colorMorph;
      // Ring fades in once section > 0.35 (roughly section 2 of 4)
      uniforms.uOrbitAlpha.value = Math.max(0, (sp - 0.3) / 0.4);
      // Ring orbit radius scales with core radius + section
      const orbitR = tuning.coreRadius * (1.7 + sp * 0.4);
      const aspect = typeof window !== 'undefined' ? window.innerWidth / Math.max(1, window.innerHeight) : 1;
      ;(uniforms.uOrbitPos.value as { set: (x: number, y: number) => void }).set(
        Math.cos(orbitAngle) * orbitR * aspect * 0.5,
        Math.sin(orbitAngle) * orbitR
      );
    },

    onEvent(event: VisualEvent) {
      section.handleEvent(event);
      if (event.type === 'glow-pulse' || event.type === 'bloom-flash' || event.type === 'grain-bloom') {
        pulse = Math.min(1, pulse + 0.4 + (event.intensity ?? 0.5) * 0.4);
      }
      if (event.type === 'density-surge' || event.type === 'spark-burst') {
        pulse = Math.min(1, pulse + 0.25);
      }
      if (event.type === 'color-morph' || event.type === 'palette-morph') {
        colorMorphTarget = Math.min(1, 0.5 + (event.intensity ?? 0.5) * 0.5);
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
