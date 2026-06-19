/* ── Three Curl Flow ─────────────────────────────────────────
   GPU instanced curl-noise flow field. Hundreds of thousands of
   points stream along a divergence-free curl-noise field at a
   density far past the CPU particle budget — the first visual that
   genuinely needs WebGL. Each point advects statelessly inside the
   vertex shader: a looping per-point life phase walks a fixed-step
   curl streamline from its seed position, so points recycle into
   fresh filaments with no per-frame attribute re-upload and no FBO
   ping-pong. Built on createThreeVisualizer; the adapter owns the
   lifecycle and the blit into the 2D stage buffer.

   Quality: drawRange (drawn point count) is the per-frame lever,
   scaled off density * getQualityScale() — a frame-local snapshot
   only, never persistent state. Integration step count is a tuned
   build-time shader constant.

   No synthetic beat clock: uBeatPhase is -1 unless the track carries
   authored BPM, and the shader ignores it when negative.
   See THREE_INTEGRATION.md and VISUAL_SYSTEM.md.
──────────────────────────────────────────────────────────────── */

import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import { getQualityScale } from '../render-quality';
import { resolveThreeCurlFlowTuning, type ThreeCurlFlowTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams } from '../visualizer';
import { clamp01, mix } from './cong-particle-primitives';
import { createInstancedField, createSectionProgress, NOISE_GLSL, type InstancedField } from './three-scene-helpers';
import { createThreeVisualizer, type ThreeScene, type ThreeSceneBuildArgs } from './three-visualizer';

const VERTEX_SHADER = /* glsl */ `
  precision highp float;

  attribute float aPhase;
  attribute float aDepth;
  attribute float aRand;

  uniform float uTime;
  uniform vec2  uResolution;
  uniform float uPixelRatio;
  uniform float uNoiseScale;
  uniform float uFlowSpeed;
  uniform float uStepLen;
  uniform float uAmp;
  uniform float uPointSize;
  uniform float uGlow;
  uniform float uShimmer;
  uniform float uImpulse;
  // Structural only: slow envelope + section progress + authored beat.
  uniform float uLevel;
  uniform float uSectionProgress;
  uniform float uBeatPhase;
  uniform float uDensitySurge;
  // Section-based frequency: low early (broad sweeping), high at peak (tight eddies)
  uniform float uFreqMod;
  // Early-section directional bias (fades out as section deepens)
  uniform vec2  uFlowBias;
  uniform vec3  uColorA;
  uniform vec3  uColorWarm;
  uniform vec4  uExclusion;     // left, right, top, bottom (px)
  uniform float uExclusionActive;

  varying vec3  vColor;
  varying float vAlpha;

  // Shared noise library (simplex + curl) — never re-implement per sketch.
  ${NOISE_GLSL}

  // Normalized curl direction for even-speed streamlines (shared curlNoise is
  // un-normalized; guard the zero case to avoid NaN).
  vec3 curlDir(vec3 p){
    vec3 c = curlNoise(p);
    float l = length(c);
    return l > 0.0001 ? c / l : vec3(0.0);
  }

  void main(){
    // Looping per-point life: 0 at birth, 1 at the end of its streamline.
    float life = fract(aPhase + uTime * uFlowSpeed * (0.4 + aDepth * 0.5));

    // Travel distance grows slowly with the level envelope and section
    // progress — structural, no per-frame onset lurch.
    float travel = uStepLen * uAmp * (1.0 + uLevel * 0.4 + uSectionProgress * 0.3);

    // Walk a fixed-step curl streamline from the seed position. The current
    // step eases in continuously over its 1/STEPS life window (smooth weight,
    // not a hard step() gate) so the filament grows smoothly instead of
    // lurching one step-length at each threshold.
    vec3 p = position;
    float zSlice = aDepth * 2.0 + uTime * 0.03;
    float noiseScaleMod = uNoiseScale * uFreqMod;
    for (int i = 0; i < STEPS; i++) {
      float fi = float(i) / float(STEPS);
      float w = clamp((life - fi) * float(STEPS), 0.0, 1.0);
      if (w <= 0.0) break;
      vec3 v = curlDir(vec3(p.xy * noiseScaleMod, zSlice));
      // Add directional bias in early sections for clear flow character
      v.xy = normalize(v.xy + uFlowBias * (1.0 - uSectionProgress));
      p.xy += v.xy * travel * w;
    }

    vec4 mvPosition = modelViewMatrix * vec4(p.xy, 0.0, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Fade in at birth, out at death so recycling is invisible.
    float lifeEnv = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.78, 1.0, life));

    // Subtle authored beat pulse only — uBeatPhase < 0 means no BPM metadata.
    float beat = uBeatPhase >= 0.0 ? (1.0 + 0.18 * pow(1.0 - uBeatPhase, 3.0)) : 1.0;

    // Near particles (aDepth > 0.5) are larger and brighter for depth separation
    float depthSize = 0.35 + aDepth * 1.3;
    // Gentle per-point shimmer from the eased shimmer param (no raw highs).
    float sparkle = 1.0 + uShimmer * aRand * 0.8;
    float size = uPointSize * uPixelRatio * depthSize * beat * sparkle
                 * (1.0 + uDensitySurge * 0.5);
    gl_PointSize = clamp(size, 0.5, 12.0);

    // Player-panel exclusion: shrink/dim points whose screen position falls
    // inside the (padded) UI rect so the panel stays readable.
    float exMask = 1.0;
    if (uExclusionActive > 0.5) {
      vec2 ndc = gl_Position.xy / gl_Position.w;
      vec2 screen = vec2((ndc.x * 0.5 + 0.5) * uResolution.x,
                         (1.0 - (ndc.y * 0.5 + 0.5)) * uResolution.y);
      float pad = 90.0;
      float inside = step(uExclusion.x - pad, screen.x) * step(screen.x, uExclusion.y + pad)
                   * step(uExclusion.z - pad, screen.y) * step(screen.y, uExclusion.w + pad);
      exMask = mix(1.0, 0.12, inside);
      gl_PointSize *= mix(1.0, 0.4, inside);
    }

    // Near particles brighter; far particles cooler for depth/parallax feel
    float warmth = clamp(aRand * 0.5 + uSectionProgress * 0.3 + aDepth * 0.3, 0.0, 1.0);
    vec3 col = mix(uColorA, uColorWarm, warmth);
    float bright = (0.3 + uGlow * 0.7 + uLevel * 0.3 + aDepth * 0.5) * beat;
    vColor = col * bright;
    vAlpha = lifeEnv * exMask * (0.22 + uGlow * 0.45 + aDepth * 0.55);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uAdditiveAlpha;

  varying vec3  vColor;
  varying float vAlpha;

  void main(){
    // Soft round sprite.
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = dot(d, d);
    if (r > 0.25) discard;
    float falloff = smoothstep(0.25, 0.0, r);
    float a = vAlpha * falloff * uAdditiveAlpha;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

interface CurlFlowUniforms {
  [name: string]: { value: unknown };
}

/** 0..1 colour channels for a shader uniform from a 0..255 palette triple. */
function paletteVec3(three: ThreeSceneBuildArgs['three'], rgb: [number, number, number]) {
  return new three.Vector3(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
}

function makeCurlFlowScene(): ThreeScene {
  let three: ThreeSceneBuildArgs['three'] | null = null;
  let scene: import('three').Scene | null = null;
  let camera: import('three').OrthographicCamera | null = null;
  let field: InstancedField | null = null;
  let material: import('three').ShaderMaterial | null = null;
  let points: import('three').Points | null = null;
  let uniforms: CurlFlowUniforms | null = null;

  let tuning: ThreeCurlFlowTuning = resolveThreeCurlFlowTuning();
  let palette: Palette | null = null;
  let maxInstances = 0;
  let time = 0;
  let aspect = 1;
  // Structural drivers: slow energy envelope + persistent section progress.
  let level = 0;
  const section = createSectionProgress();

  // Eased event targets (color-morph / density-surge) — decay back to rest.
  let densitySurge = 0;
  let densitySurgeTarget = 0;
  let warmColor: [number, number, number] | null = null;
  let colorMorph = 0;

  function setCameraBounds(camObj: import('three').OrthographicCamera, w: number, h: number): void {
    aspect = w / Math.max(1, h);
    camObj.left = -aspect;
    camObj.right = aspect;
    camObj.top = 1;
    camObj.bottom = -1;
    camObj.near = -10;
    camObj.far = 10;
    camObj.updateProjectionMatrix();
  }

  return {
    get scene() { return scene; },
    get camera() { return camera; },

    build(args: ThreeSceneBuildArgs) {
      three = args.three;
      palette = args.palette;
      tuning = resolveThreeCurlFlowTuning(args.tuning);
      const T = three;

      // Mobile halving mirrors getParticleBudget's <768px convention; the
      // per-frame drawRange (quality * density) does the runtime scaling.
      const mobileFactor = args.w < 768 ? 0.5 : 1;
      maxInstances = Math.max(2000, Math.round(tuning.maxInstances * mobileFactor));

      const spanX = (args.w / Math.max(1, args.h)) * 1.15;
      field = createInstancedField(T, maxInstances, spanX, 1.15, 0x9e3779b9);

      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1;
      const colA = paletteVec3(T, palette.dotColor);
      const colWarm = paletteVec3(T, palette.accentWarm);

      uniforms = {
        uTime: { value: 0 },
        uResolution: { value: new T.Vector2(args.w, args.h) },
        uPixelRatio: { value: dpr },
        uNoiseScale: { value: tuning.noiseScale },
        uFlowSpeed: { value: tuning.flowSpeed },
        uStepLen: { value: tuning.stepLength },
        uAmp: { value: 1 },
        uPointSize: { value: tuning.pointSize },
        uGlow: { value: 0.3 },
        uShimmer: { value: 0.2 },
        uImpulse: { value: 0 },
        // Structural signals only — slow level envelope + section progress +
        // authored beat. No raw bands/onsets (see THREE_INTEGRATION.md).
        uLevel: { value: 0 },
        uSectionProgress: { value: 0 },
        uBeatPhase: { value: -1 },
        uDensitySurge: { value: 0 },
        uColorA: { value: colA },
        uColorWarm: { value: colWarm },
        uExclusion: { value: new T.Vector4(0, 0, 0, 0) },
        uExclusionActive: { value: 0 },
        uAdditiveAlpha: { value: tuning.additiveAlpha },
        uFreqMod: { value: 1 },
        uFlowBias: { value: new T.Vector2(0.6, 0.2) },
      };

      const steps = Math.max(3, Math.min(16, Math.round(tuning.integrationSteps)));
      material = new T.ShaderMaterial({
        uniforms: uniforms as unknown as Record<string, { value: unknown }>,
        vertexShader: `#define STEPS ${steps}\n${VERTEX_SHADER}`,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: T.AdditiveBlending,
      });

      points = new T.Points(field.geometry, material);
      points.frustumCulled = false;
      scene = new T.Scene();
      scene.add(points);

      camera = new T.OrthographicCamera(-1, 1, 1, -1, -10, 10);
      camera.position.set(0, 0, 1);
      setCameraBounds(camera, args.w, args.h);

      time = 0;
      level = 0;
      section.reset();
      densitySurge = 0;
      densitySurgeTarget = 0;
      colorMorph = 0;
      warmColor = null;
    },

    update(dt, params: VisualParams, audio: AudioSignal, exclusion: ExclusionRect) {
      if (!uniforms || !field || !three || !palette) return;
      time += dt;

      const damp = 1 - Math.pow(0.001, dt);
      densitySurge = mix(densitySurge, densitySurgeTarget, damp);
      densitySurgeTarget = Math.max(0, densitySurgeTarget - dt * 0.5);

      // Slow (~2.5 s) energy envelope — structural song dynamics, no jitter.
      level += (audio.energy - level) * (1 - Math.exp(-Math.max(0, dt) / 2.5));
      section.update(dt);

      uniforms.uTime.value = time;
      uniforms.uAmp.value = 0.6 + params.turbulence * 1.1;
      uniforms.uFlowSpeed.value = tuning.flowSpeed * (0.3 + section.value * 0.6 + params.drift * 0.8);
      // Noise freq: low (0.6) at section 0 for broad sweeping → high (1.5) at peak for tight eddies
      uniforms.uFreqMod.value = 0.6 + section.value * 0.9;
      // Directional bias fades out as section deepens (structure emerges from chaos)
      const biasStrength = Math.max(0, 0.7 - section.value * 1.2);
      (uniforms.uFlowBias.value as import('three').Vector2).set(biasStrength * 0.8, biasStrength * 0.25);
      uniforms.uGlow.value = params.glow;
      uniforms.uShimmer.value = params.shimmer;
      uniforms.uImpulse.value = params.impulse;
      uniforms.uLevel.value = level;
      uniforms.uSectionProgress.value = section.value;
      // Authored BPM only — never synthesize a clock when beatPhase is absent.
      uniforms.uBeatPhase.value = audio.beatPhase ?? -1;
      uniforms.uDensitySurge.value = densitySurge;

      // Follow per-section palette temperature each frame (the stage palette is
      // mutated in place by the canvas) like every other kernel.
      (uniforms.uColorA.value as import('three').Vector3).set(palette.dotColor[0] / 255, palette.dotColor[1] / 255, palette.dotColor[2] / 255);
      (uniforms.uColorWarm.value as import('three').Vector3).set(palette.accentWarm[0] / 255, palette.accentWarm[1] / 255, palette.accentWarm[2] / 255);

      // Color-morph eases the warm pole toward the event colour (overrides base).
      if (warmColor && colorMorph > 0.001) {
        const baseWarm = palette.accentWarm;
        const r = mix(baseWarm[0], warmColor[0], colorMorph) / 255;
        const g = mix(baseWarm[1], warmColor[1], colorMorph) / 255;
        const b = mix(baseWarm[2], warmColor[2], colorMorph) / 255;
        (uniforms.uColorWarm.value as import('three').Vector3).set(r, g, b);
        colorMorph = Math.max(0, colorMorph - dt * 0.25);
      }

      // Quality / density is the per-frame draw lever: scale the drawn point
      // count off the frame-local snapshot, never persistent state.
      // Entrance arc: section 1 is sparse (~15% of max), accumulates to full by section 2.
      const quality = getQualityScale();
      const entranceArc = Math.min(1, section.value / 0.22);
      const drawFraction = clamp01(entranceArc * (0.15 + params.density * 0.85) + densitySurge * 0.25) * quality;
      field.setDrawFraction(drawFraction, 1000);

      const ex = uniforms.uExclusion.value as import('three').Vector4;
      const hasExclusion = exclusion.right > exclusion.left && exclusion.bottom > exclusion.top;
      ex.set(exclusion.left, exclusion.right, exclusion.top, exclusion.bottom);
      uniforms.uExclusionActive.value = hasExclusion ? 1 : 0;
    },

    onEvent(event: VisualEvent) {
      section.handleEvent(event);
      const intensity = clamp01(event.intensity ?? 0.5);
      if (event.type === 'density-surge' || event.type === 'grain-bloom' || event.type === 'spark-burst') {
        densitySurgeTarget = Math.min(1, densitySurgeTarget + 0.4 + intensity * 0.5);
      }
      if ((event.type === 'color-morph' || event.type === 'palette-morph') && event.color) {
        warmColor = event.color;
        colorMorph = Math.min(1, 0.5 + intensity * 0.5);
      }
      if (event.type === 'glow-pulse' || event.type === 'bloom-flash') {
        densitySurgeTarget = Math.min(1, densitySurgeTarget + 0.2 + intensity * 0.3);
      }
    },

    resize(w, h) {
      if (uniforms) (uniforms.uResolution.value as import('three').Vector2).set(w, h);
      if (camera) setCameraBounds(camera, w, h);
    },

    dispose() {
      field?.dispose();
      material?.dispose();
      if (scene && points) scene.remove(points);
      field = null;
      material = null;
      points = null;
      scene = null;
      camera = null;
      uniforms = null;
      three = null;
    },
  };
}

export function createThreeCurlFlow() {
  return createThreeVisualizer(makeCurlFlowScene);
}
