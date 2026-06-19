/* ── Three Reaction-Diffusion ────────────────────────────────
   Gray-Scott reaction-diffusion simulation. Two chemical species
   A and B interact to produce Turing patterns: coral spots in
   section 1, branching veins in section 3, slow erosion in the
   outro. Feed/kill parameters sweep through pattern families as
   the song progresses. Ping-pong half-float FBO for simulation
   state; display shader maps B concentration to palette.

   Song structure owns the visual arc — feed/kill lerp between
   section presets. Audio energy modulates injection pulse rate.
   Events spike injection or shift the kill parameter briefly.
──────────────────────────────────────────────────────────────── */

import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import { getQualityScale } from '../render-quality';
import { resolveThreeReactionDiffusionTuning, type ThreeReactionDiffusionTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams } from '../visualizer';
import { clamp01, mix as mixNum } from './cong-particle-primitives';
import {
  applyStandardUpdate,
  createFloatPingPong,
  createFullscreenScene,
  createSectionProgress,
  createStandardUniforms,
  GRAIN_GLSL,
  STD_UNIFORM_GLSL,
  type FullscreenScene,
  type PingPongTargets,
  type Uniforms,
} from './three-scene-helpers';
import { threeHost } from './three-host';
import { createThreeVisualizer, type ThreeScene, type ThreeSceneBuildArgs } from './three-visualizer';

// Simulation runs at reduced resolution for performance.
const SIM_SCALE = 0.35;

// Gray-Scott section presets [feed, kill].
// Each entry is the target at section progress 0, 0.25, 0.5, 0.75, 1.0.
// Interpolated smoothly so no hard jumps occur.
//   Spots:     f≈0.037, k≈0.063  — sparse dots, open space
//   Worms:     f≈0.039, k≈0.058  — branching worm-like threads
//   Labyrinth: f≈0.026, k≈0.051  — dense coral maze, peak complexity
//   Mitosis:   f≈0.028, k≈0.062  — dividing blobs, dynamic
//   Fade:      f≈0.040, k≈0.065  — dissolves pattern back to uniform A
const SECTION_PRESETS: ReadonlyArray<readonly [number, number]> = [
  [0.037, 0.063],  // section 0: sparse dots, calm opener
  [0.039, 0.058],  // section 1–2: worms emerge, threading
  [0.026, 0.051],  // section 2–3: coral labyrinth, peak complexity
  [0.028, 0.062],  // section 3–4: mitosis — dynamic but loosening
  [0.040, 0.065],  // section 4–5: patterns dissolve, afterglow
];

// Gray-Scott update: one step per pass. RG = A, B concentrations.
const UPDATE_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D uState;
  uniform vec2  uTexel;
  uniform float uFeed;
  uniform float uKill;
  uniform float uDa;
  uniform float uDb;
  uniform float uInject;       // 0..1 burst from events/audio

  // 9-tap Laplacian with weights matching the Gray-Scott standard kernel.
  vec2 laplacian(vec2 uv) {
    vec2 tc = texture2D(uState, uv).rg;
    vec2 l  = texture2D(uState, uv + vec2(-uTexel.x, 0)).rg;
    vec2 r  = texture2D(uState, uv + vec2( uTexel.x, 0)).rg;
    vec2 u  = texture2D(uState, uv + vec2(0,  uTexel.y)).rg;
    vec2 d  = texture2D(uState, uv + vec2(0, -uTexel.y)).rg;
    vec2 tl = texture2D(uState, uv + vec2(-uTexel.x,  uTexel.y)).rg;
    vec2 tr = texture2D(uState, uv + vec2( uTexel.x,  uTexel.y)).rg;
    vec2 bl = texture2D(uState, uv + vec2(-uTexel.x, -uTexel.y)).rg;
    vec2 br = texture2D(uState, uv + vec2( uTexel.x, -uTexel.y)).rg;
    return (l + r + u + d) * 0.2
         + (tl + tr + bl + br) * 0.05
         - tc;
  }

  void main() {
    vec2 state = texture2D(uState, vUv).rg;
    float A = state.r;
    float B = state.g;
    vec2 lap = laplacian(vUv);
    float reaction = A * B * B;
    float newA = clamp(A + uDa * lap.r - reaction + uFeed * (1.0 - A), 0.0, 1.0);
    float newB = clamp(B + uDb * lap.g + reaction - (uFeed + uKill) * B, 0.0, 1.0);
    // Inject B at this pixel with a hash-based sparse mask (events/audio pulse)
    float h = fract(sin(dot(vUv, vec2(127.1, 311.7))) * 43758.5453);
    if (uInject > 0.01 && h < uInject * 0.012) newB = min(1.0, newB + 0.85);
    gl_FragColor = vec4(newA, newB, 0.0, 1.0);
  }
`;

// Display shader: maps B concentration to palette.
const DISPLAY_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  ${STD_UNIFORM_GLSL}
  ${GRAIN_GLSL}

  uniform sampler2D uState;
  uniform float uContrast;   // sharpens the B→colour mapping
  uniform float uColorShift; // event-driven colour morph (0..1)

  void main() {
    float B = texture2D(uState, vUv).g;

    // Sigmoid contrast: B near 0 or 1 compresses; midrange sharpens.
    float b = clamp(B, 0.0, 1.0);
    float shaped = clamp((b - 0.5) * uContrast + 0.5, 0.0, 1.0);

    // Section-aware brightness: quiet at start, opens toward peak.
    float brightness = 0.28 + uSectionProgress * 0.42 + uLevel * 0.22 + uGlow * 0.18;

    // Colour: deep bg in empty space, accent in B-dense regions,
    // warm bloom at the very high end (bright veins/spots).
    vec3 col = uColorBg;
    col = mix(col, uColorA,    smoothstep(0.18, 0.72, shaped) * brightness);
    col = mix(col, uColorWarm, smoothstep(0.68, 0.96, shaped) * (0.45 + uColorShift * 0.55));
    col = mix(col, uColorMid,  smoothstep(0.0,  0.22, shaped) * (0.12 + uSectionProgress * 0.08));

    col = mix(uColorBg, col, exclusionMask());
    col = applyGrainVignette(col, vUv, 0.028, 0.58);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Seed shader: fills the simulation with A=1, B=0 (uniform equilibrium),
// then scatters a few B=1 seed points. Run once on init / reset.
const SEED_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uSeed;

  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  void main() {
    float h = hash21(vUv * 137.0 + uSeed);
    float isSpot = step(0.994, h);  // ~0.6% of pixels start as B seeds
    gl_FragColor = vec4(1.0 - isSpot, isSpot, 0.0, 1.0);
  }
`;

function makeReactionDiffusionScene(): ThreeScene {
  let displayScene: import('three').Scene | null = null;
  let displayCamera: import('three').Camera | null = null;
  let displayUniforms: Uniforms | null = null;
  let displayFs: FullscreenScene | null = null;

  let updateScene: import('three').Scene | null = null;
  let updateCamera: import('three').Camera | null = null;
  let updateUniforms: Uniforms | null = null;
  let updateFs: FullscreenScene | null = null;

  let seedScene: import('three').Scene | null = null;
  let seedCamera: import('three').Camera | null = null;
  let seedUniforms: Uniforms | null = null;
  let seedFs: FullscreenScene | null = null;

  let statePP: PingPongTargets | null = null;

  let tuning: ThreeReactionDiffusionTuning = resolveThreeReactionDiffusionTuning();
  let palette: Palette | null = null;
  let time = 0;
  let simW = 1;
  let simH = 1;
  let seeded = false;
  let inject = 0;
  let injectTarget = 0;
  let colorShift = 0;
  let colorShiftTarget = 0;
  // Current feed/kill (smoothly lerped toward section presets)
  let feed = SECTION_PRESETS[0][0];
  let kill = SECTION_PRESETS[0][1];
  const section = createSectionProgress();

  function simSize(w: number, h: number) {
    simW = Math.max(1, Math.round(w * SIM_SCALE));
    simH = Math.max(1, Math.round(h * SIM_SCALE));
  }

  function seedSimulation(three: ThreeSceneBuildArgs['three']): void {
    if (!seedFs || !seedUniforms || !statePP) return;
    seedUniforms.uSeed = { value: Math.random() * 100 };
    threeHost.renderToTarget(seedFs.scene, seedFs.camera, statePP.read, simW, simH);
    threeHost.renderToTarget(seedFs.scene, seedFs.camera, statePP.write, simW, simH);
    seeded = true;
  }

  return {
    get scene() { return displayScene; },
    get camera() { return displayCamera; },
    get renderScale() { return 1.0; },

    build(args: ThreeSceneBuildArgs) {
      const three = args.three;
      palette = args.palette;
      tuning = resolveThreeReactionDiffusionTuning(args.tuning);
      simSize(args.w, args.h);

      statePP = createFloatPingPong(three, simW, simH);

      // Seed scene (runs once to initialise state)
      seedUniforms = { uSeed: { value: 0 } };
      seedFs = createFullscreenScene(three, SEED_SHADER, seedUniforms);
      seedScene = seedFs.scene;
      seedCamera = seedFs.camera;

      // Update scene (Gray-Scott step)
      updateUniforms = {
        uState:  { value: statePP.read.texture },
        uTexel:  { value: new three.Vector2(1 / simW, 1 / simH) },
        uFeed:   { value: feed },
        uKill:   { value: kill },
        uDa:     { value: tuning.diffusionA },
        uDb:     { value: tuning.diffusionB },
        uInject: { value: 0 },
      };
      updateFs = createFullscreenScene(three, UPDATE_SHADER, updateUniforms);
      updateScene = updateFs.scene;
      updateCamera = updateFs.camera;

      // Display scene
      displayUniforms = {
        ...createStandardUniforms(three, palette, args.w, args.h),
        uState:      { value: statePP.read.texture },
        uContrast:   { value: tuning.contrast },
        uColorShift: { value: 0 },
      };
      displayFs = createFullscreenScene(three, DISPLAY_SHADER, displayUniforms);
      displayScene = displayFs.scene;
      displayCamera = displayFs.camera;

      time = 0;
      seeded = false;
      inject = 0;
      injectTarget = 0;
      colorShift = 0;
      colorShiftTarget = 0;
      feed = SECTION_PRESETS[0][0];
      kill = SECTION_PRESETS[0][1];
      section.reset();

      seedSimulation(three);
    },

    update(dt: number, params: VisualParams, audio: AudioSignal, exclusion: ExclusionRect) {
      if (!displayUniforms || !updateUniforms || !statePP || !palette) return;
      time += dt;
      section.update(dt);

      const damp = 1 - Math.exp(-Math.max(0, dt) / 1.8);
      inject = mixNum(inject, injectTarget, damp);
      injectTarget = Math.max(0, injectTarget - dt * 0.9);
      colorShift = mixNum(colorShift, colorShiftTarget, damp);
      colorShiftTarget = Math.max(0, colorShiftTarget - dt * 0.4);

      // Lerp feed/kill toward section-preset target
      const sp = section.value;
      const presetIdx = Math.min(sp * (SECTION_PRESETS.length - 1), SECTION_PRESETS.length - 1.001);
      const lo = Math.floor(presetIdx);
      const hi = Math.min(lo + 1, SECTION_PRESETS.length - 1);
      const t = presetIdx - lo;
      const targetFeed = mixNum(SECTION_PRESETS[lo][0], SECTION_PRESETS[hi][0], t);
      const targetKill = mixNum(SECTION_PRESETS[lo][1], SECTION_PRESETS[hi][1], t);
      const paramDamp = 1 - Math.exp(-Math.max(0, dt) / 3.5);
      feed = mixNum(feed, targetFeed, paramDamp);
      kill = mixNum(kill, targetKill, paramDamp);

      // Audio energy adds a gentle injection pulse to make the pattern
      // breathe with the music without needing beat detection.
      const audioInject = audio.energy * 0.4 * params.impulse;

      applyStandardUpdate(displayUniforms, dt, time, params, audio, exclusion, palette);
      displayUniforms.uSectionProgress.value = sp;
      displayUniforms.uState.value = statePP.read.texture;
      displayUniforms.uContrast.value = tuning.contrast * (0.7 + sp * 0.5);
      displayUniforms.uColorShift.value = colorShift;

      updateUniforms.uFeed.value = feed;
      updateUniforms.uKill.value = kill;
      updateUniforms.uInject.value = clamp01(inject + audioInject);
    },

    preRender() {
      if (!statePP || !updateUniforms || !updateFs || !displayUniforms) return;
      // Run N simulation steps per frame (quality-scaled)
      const steps = Math.max(1, Math.round(3 * getQualityScale()));
      for (let i = 0; i < steps; i++) {
        updateUniforms.uState.value = statePP.read.texture;
        (updateUniforms.uTexel.value as import('three').Vector2).set(1 / simW, 1 / simH);
        threeHost.renderToTarget(updateFs.scene, updateFs.camera, statePP.write, simW, simH);
        statePP.swap();
      }
      displayUniforms.uState.value = statePP.read.texture;
    },

    onEvent(event: VisualEvent) {
      section.handleEvent(event);
      const intensity = clamp01(event.intensity ?? 0.5);
      if (event.type === 'density-surge' || event.type === 'spark-burst') {
        injectTarget = Math.min(1, injectTarget + 0.5 + intensity * 0.5);
      }
      if (event.type === 'glow-pulse' || event.type === 'bloom-flash') {
        injectTarget = Math.min(1, injectTarget + 0.25 + intensity * 0.3);
        colorShiftTarget = Math.min(1, colorShiftTarget + 0.3 + intensity * 0.3);
      }
      if (event.type === 'color-morph' || event.type === 'palette-morph') {
        colorShiftTarget = Math.min(1, 0.6 + intensity * 0.4);
        injectTarget = Math.min(1, injectTarget + 0.35 + intensity * 0.4);
      }
      if (event.type === 'grain-bloom') {
        injectTarget = Math.min(1, injectTarget + 0.3 + intensity * 0.4);
      }
    },

    resize(w: number, h: number) {
      if (displayUniforms) {
        (displayUniforms.uResolution.value as import('three').Vector2).set(w, h);
      }
      if (statePP) {
        const newSimW = Math.max(1, Math.round(w * SIM_SCALE));
        const newSimH = Math.max(1, Math.round(h * SIM_SCALE));
        if (newSimW !== simW || newSimH !== simH) {
          simW = newSimW;
          simH = newSimH;
          statePP.resize(simW, simH);
          seeded = false;
          // Re-seed after resize so we don't display a blank/stretched state
          if (seedFs && seedUniforms) {
            seedUniforms.uSeed = { value: Math.random() * 100 };
            threeHost.renderToTarget(seedFs.scene, seedFs.camera, statePP.read, simW, simH);
            threeHost.renderToTarget(seedFs.scene, seedFs.camera, statePP.write, simW, simH);
            seeded = true;
          }
        }
      }
    },

    dispose() {
      statePP?.dispose();
      seedFs?.material.dispose();
      seedFs?.geometry.dispose();
      updateFs?.material.dispose();
      updateFs?.geometry.dispose();
      displayFs?.material.dispose();
      displayFs?.geometry.dispose();
      statePP = null;
      seedFs = null;
      updateFs = null;
      displayFs = null;
      displayScene = null;
      displayCamera = null;
      displayUniforms = null;
      updateScene = null;
      updateCamera = null;
      updateUniforms = null;
      seedScene = null;
      seedCamera = null;
      seedUniforms = null;
      palette = null;
    },
  };
}

export function createThreeReactionDiffusion() {
  return createThreeVisualizer(makeReactionDiffusionScene);
}
