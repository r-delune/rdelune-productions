/* ── Three Sparse Veil ───────────────────────────────────────
   Near-still volumetric mist tableau for sparse/minimal family.
   Fills the outro and low-energy track gap: an intentionally
   quiet opener that barely moves in sections 1–2 then exhales a
   faint directional veil in sections 3+.

   Technique: fullscreen fragment shader, very slow 3D fbm with
   near-zero scroll speed. Ambient breathing at a ~4 s period;
   late-section directional drift via a single gentle advection.
   Reduced-motion safe: still frame with palette fill.
──────────────────────────────────────────────────────────────── */

import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import { getQualityScale } from '../render-quality';
import { resolveThreeSparseVeilTuning, type ThreeSparseVeilTuning } from '../tuning';
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

const MAX_LAYERS = 5;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  ${STD_UNIFORM_GLSL}
  ${NOISE_GLSL}
  ${GRAIN_GLSL}

  uniform float uLayers;
  uniform float uNoiseScale;
  uniform float uScrollSpeed;  // near-zero early; gentle drift late
  uniform float uBreath;       // slow ambient breathing amplitude
  uniform float uRipple;       // event-driven brightening ripple (0..1)

  // Slow multi-octave mist density (separate from shared fbm — ultra-slow time)
  float mistDensity(vec2 uv, float t) {
    float sum = 0.0;
    float amp = 0.58;
    float freq = 1.0;
    float norm = 0.0;
    for (int i = 0; i < ${MAX_LAYERS}; i++) {
      float lw = clamp(uLayers - float(i), 0.0, 1.0);
      if (lw <= 0.0) break;
      float n = snoise(vec3(uv * freq * uNoiseScale, t + float(i) * 4.77));
      sum += (n * 0.5 + 0.5) * amp * lw;
      norm += amp * lw;
      freq *= 1.88;
      amp *= 0.56;
    }
    return sum / max(0.001, norm);
  }

  void main() {
    vec2 aspect = vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
    vec2 uv = vUv * aspect;

    // Ultra-slow time: sections 1-2 near-still, sections 3+ gentle drift
    float scrollT = uTime * uScrollSpeed;
    float breathT = uTime * 0.042;  // ~4 s period breathing

    float mist = mistDensity(uv, scrollT);
    // Irregular breathing: FM sine at a non-integer modulator ratio so the
    // period is never perfectly repeated — feels like a living thing, not a metronome.
    float breath = sin(breathT * 6.28 + 0.55 * sin(breathT * 1.73 + 0.9)) * uBreath;
    mist = clamp(mist + breath * 0.08, 0.0, 1.0);

    float beat = beatPulse();
    float base = 0.24 + uLevel * 0.28 + uSectionProgress * 0.22 + uGlow * 0.2;
    float brightness = (base + uRipple * 0.35) * beat;

    // Deep monochromatic: stay close to bg, lift with very subtle tonal mid
    float mistLift = smoothstep(0.28, 0.88, mist) * brightness;
    float horizon = smoothstep(0.96, 0.22, vUv.y) * (0.06 + uSectionProgress * 0.08);

    vec3 col = uColorBg;
    col = mix(col, uColorMid, mistLift * (0.38 + uGlow * 0.22));
    col = mix(col, uColorA,   mistLift * (0.12 + uSectionProgress * 0.18));
    col += uColorMid * horizon;
    // Event ripple adds a faint brightening wash
    col += uColorA * pow(mist, 2.0) * uRipple * (0.18 + uGlow * 0.12);

    col = mix(uColorBg, col, exclusionMask());
    col = applyGrainVignette(col, vUv, 0.022, 0.48);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeSparseVeilScene(): ThreeScene {
  let fs: FullscreenScene | null = null;
  let uniforms: Uniforms | null = null;
  let tuning: ThreeSparseVeilTuning = resolveThreeSparseVeilTuning();
  let palette: Palette | null = null;
  let time = 0;
  let ripple = 0;
  let rippleTarget = 0;
  const section = createSectionProgress();

  return {
    get scene() { return fs?.scene ?? null; },
    get camera() { return fs?.camera ?? null; },
    get renderScale() { return 0.72; },

    build(args: ThreeSceneBuildArgs) {
      tuning = resolveThreeSparseVeilTuning(args.tuning);
      palette = args.palette;
      uniforms = {
        ...createStandardUniforms(args.three, palette, args.w, args.h),
        uLayers:      { value: tuning.maxLayers },
        uNoiseScale:  { value: tuning.noiseScale },
        uScrollSpeed: { value: 0 },
        uBreath:      { value: tuning.breathAmplitude },
        uRipple:      { value: 0 },
      };
      fs = createFullscreenScene(args.three, FRAGMENT_SHADER, uniforms);
      time = 0;
      ripple = 0;
      rippleTarget = 0;
      section.reset();
    },

    update(dt: number, params: VisualParams, audio: AudioSignal, exclusion: ExclusionRect) {
      if (!uniforms || !palette) return;
      if (!hasReducedMotion()) time += dt;

      const damp = 1 - Math.pow(0.001, dt);
      ripple = mixNum(ripple, rippleTarget, damp);
      rippleTarget = Math.max(0, rippleTarget - dt * 0.25);
      section.update(dt);

      applyStandardUpdate(uniforms, dt, time, params, audio, exclusion, palette);
      uniforms.uSectionProgress.value = section.value;
      uniforms.uLayers.value = Math.max(2, tuning.maxLayers * getQualityScale());

      // Sections 3+: gentle directional drift emerges (near-zero early)
      const sp = section.value;
      const driftEase = Math.max(0, (sp - 0.45) / 0.55);
      uniforms.uScrollSpeed.value = tuning.scrollSpeed * (0.02 + driftEase * 0.98 + params.drift * 0.15);
      uniforms.uRipple.value = clamp01(ripple);
    },

    onEvent(event: VisualEvent) {
      section.handleEvent(event);
      const intensity = clamp01(event.intensity ?? 0.5);
      if (event.type === 'veil-sweep' || event.type === 'glow-pulse' || event.type === 'grain-bloom') {
        rippleTarget = Math.min(1, rippleTarget + 0.3 + intensity * 0.4);
      }
      if (event.type === 'bloom-flash' || event.type === 'spark-burst') {
        rippleTarget = Math.min(1, rippleTarget + 0.2 + intensity * 0.3);
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

export function createThreeSparseVeil() {
  return createThreeVisualizer(makeSparseVeilScene);
}
