/* ── Three Artwork Flux ──────────────────────────────────────
   Artwork-driven feedback/displacement accent. This is the first
   Three kernel that proves album art texture upload + scene-owned
   ping-pong render targets end to end. It stays deliberately
   restrained: a mid-section flux/memory surface, never an opener.
──────────────────────────────────────────────────────────────── */

import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import { resolveThreeArtworkFluxTuning, type ThreeArtworkFluxTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams } from '../visualizer';
import { clamp01, mix as mixNum } from './cong-particle-primitives';
import { threeHost } from './three-host';
import { createThreeVisualizer, type ThreeScene, type ThreeSceneBuildArgs } from './three-visualizer';
import {
  applyStandardUpdate,
  createFullscreenScene,
  createPingPong,
  createSectionProgress,
  createStandardUniforms,
  loadArtworkTexture,
  NOISE_GLSL,
  STD_UNIFORM_GLSL,
  type PingPongTargets,
  type Uniforms,
} from './three-scene-helpers';

const RENDER_SCALE = 0.62;

const FEEDBACK_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  ${STD_UNIFORM_GLSL}
  ${NOISE_GLSL}

  uniform sampler2D uFeedback;
  uniform sampler2D uArtwork;
  uniform float uHasArtwork;
  uniform float uHasHistory;
  uniform float uArtworkAspect;
  uniform float uMemory;
  uniform float uDisplace;
  uniform float uFlux;
  uniform float uReveal;
  uniform float uChromatic;
  uniform vec2  uTexel;

  vec2 coverUv(vec2 uv){
    float canvasAspect = uResolution.x / max(1.0, uResolution.y);
    float imageAspect = max(0.01, uArtworkAspect);
    vec2 p = uv - 0.5;
    if (imageAspect > canvasAspect) p.x *= canvasAspect / imageAspect;
    else p.y *= imageAspect / canvasAspect;
    return p + 0.5;
  }

  vec3 fallbackMaterial(vec2 uv){
    float n = fbm(vec3(uv * vec2(2.4, 1.5), uTime * 0.035));
    return mix(uColorBg, mix(uColorMid, uColorA, n), 0.58 + uGlow * 0.18);
  }

  vec3 artworkSample(vec2 uv, vec2 offset){
    if (uHasArtwork < 0.5) return fallbackMaterial(uv + offset);
    vec2 auv = clamp(coverUv(uv + offset), 0.001, 0.999);
    return texture2D(uArtwork, auv).rgb;
  }

  void main(){
    vec2 uv = vUv;
    float t = uTime * (0.045 + uDrift * 0.055);
    float structural = uLevel * 0.35 + uSectionProgress * 0.45 + uFlux * 0.55;
    vec2 curl = vec2(
      snoise(vec3(uv * 2.0, t)),
      snoise(vec3(uv.yx * 2.3 + 17.0, t + 2.0))
    );
    vec2 drift = curl * uDisplace * (0.004 + structural * 0.018);
    vec2 smear = vec2(uTexel.x * (1.0 + uFlux * 7.0), 0.0);

    vec3 prev = texture2D(uFeedback, clamp(uv + drift, 0.001, 0.999)).rgb;
    vec3 artR = artworkSample(uv, drift + smear * uChromatic);
    vec3 artG = artworkSample(uv, drift);
    vec3 artB = artworkSample(uv, drift - smear * uChromatic);
    vec3 art = vec3(artR.r, artG.g, artB.b);

    float reveal = clamp(uReveal + uSectionProgress * 0.22 + uLevel * 0.14, 0.0, 1.0);
    vec3 base = mix(fallbackMaterial(uv), art, reveal);
    base = mix(base, base + uColorWarm * (0.08 + uFlux * 0.18), uGlow);

    float memory = clamp(uMemory + uLevel * 0.08, 0.0, 0.96);
    vec3 col = mix(base, prev, uHasHistory * memory);
    col += uColorA * pow(max(0.0, fbm(vec3(uv * 4.0 + curl * 0.2, t)) - 0.62), 2.0) * (0.2 + uFlux * 0.8);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const DISPLAY_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  ${STD_UNIFORM_GLSL}

  uniform sampler2D uFrame;
  uniform float uVignette;

  void main(){
    vec3 col = texture2D(uFrame, vUv).rgb;
    float d = distance(vUv, vec2(0.5));
    col *= mix(1.0, smoothstep(0.82, 0.22, d), uVignette);
    col = mix(uColorBg, col, exclusionMask());
    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeArtworkFluxScene(): ThreeScene {
  let three: ThreeSceneBuildArgs['three'] | null = null;
  let displayScene: import('three').Scene | null = null;
  let displayCamera: import('three').Camera | null = null;
  let displayMaterial: import('three').ShaderMaterial | null = null;
  let displayGeometry: import('three').BufferGeometry | null = null;
  let feedbackScene: import('three').Scene | null = null;
  let feedbackCamera: import('three').Camera | null = null;
  let feedbackMaterial: import('three').ShaderMaterial | null = null;
  let feedbackGeometry: import('three').BufferGeometry | null = null;
  let displayUniforms: Uniforms | null = null;
  let feedbackUniforms: Uniforms | null = null;
  let pingPong: PingPongTargets | null = null;
  let artworkTexture: import('three').Texture | null = null;

  let tuning: ThreeArtworkFluxTuning = resolveThreeArtworkFluxTuning();
  let palette: Palette | null = null;
  let artworkUrl: string | undefined;
  let time = 0;
  let w = 1;
  let h = 1;
  let targetW = 1;
  let targetH = 1;
  let hasHistory = 0;
  let flux = 0;
  let fluxTarget = 0;
  const section = createSectionProgress();

  function updateTargetSize(width: number, height: number): void {
    w = width;
    h = height;
    targetW = Math.max(1, Math.round(width * RENDER_SCALE));
    targetH = Math.max(1, Math.round(height * RENDER_SCALE));
    pingPong?.resize(targetW, targetH);
    if (feedbackUniforms) (feedbackUniforms.uTexel.value as import('three').Vector2).set(1 / targetW, 1 / targetH);
  }

  function tryLoadArtworkTexture(): void {
    if (!three || artworkTexture || !feedbackUniforms) return;
    const result = loadArtworkTexture(three, artworkUrl);
    if (!result.texture) return;
    artworkTexture = result.texture;
    feedbackUniforms.uArtwork.value = artworkTexture;
    feedbackUniforms.uHasArtwork.value = 1;
    feedbackUniforms.uArtworkAspect.value = result.width / Math.max(1, result.height);
  }

  return {
    get scene() { return displayScene; },
    get camera() { return displayCamera; },
    get renderScale() { return RENDER_SCALE; },

    build(args: ThreeSceneBuildArgs) {
      three = args.three;
      palette = args.palette;
      artworkUrl = args.context?.artworkUrl;
      tuning = resolveThreeArtworkFluxTuning(args.tuning);
      updateTargetSize(args.w, args.h);

      pingPong = createPingPong(three, targetW, targetH);
      displayUniforms = createStandardUniforms(three, palette, args.w, args.h);
      feedbackUniforms = createStandardUniforms(three, palette, args.w, args.h);

      displayUniforms.uFrame = { value: pingPong.read.texture };
      displayUniforms.uVignette = { value: tuning.vignette };
      feedbackUniforms.uFeedback = { value: pingPong.read.texture };
      feedbackUniforms.uArtwork = { value: pingPong.read.texture };
      feedbackUniforms.uHasArtwork = { value: 0 };
      feedbackUniforms.uHasHistory = { value: 0 };
      feedbackUniforms.uArtworkAspect = { value: 1 };
      feedbackUniforms.uMemory = { value: tuning.memory };
      feedbackUniforms.uDisplace = { value: tuning.displacement };
      feedbackUniforms.uFlux = { value: 0 };
      feedbackUniforms.uReveal = { value: tuning.reveal };
      feedbackUniforms.uChromatic = { value: tuning.chromaticAberration };
      feedbackUniforms.uTexel = { value: new three.Vector2(1 / targetW, 1 / targetH) };

      const feedback = createFullscreenScene(three, FEEDBACK_SHADER, feedbackUniforms);
      feedbackScene = feedback.scene;
      feedbackCamera = feedback.camera;
      feedbackMaterial = feedback.material;
      feedbackGeometry = feedback.geometry;

      const display = createFullscreenScene(three, DISPLAY_SHADER, displayUniforms);
      displayScene = display.scene;
      displayCamera = display.camera;
      displayMaterial = display.material;
      displayGeometry = display.geometry;

      time = 0;
      hasHistory = 0;
      flux = 0;
      fluxTarget = 0;
      artworkTexture = null;
      section.reset();
      tryLoadArtworkTexture();
    },

    update(dt: number, params: VisualParams, audio: AudioSignal, exclusion: ExclusionRect) {
      if (!feedbackUniforms || !displayUniforms || !palette) return;
      time += dt;
      const damp = 1 - Math.pow(0.001, dt);
      flux = mixNum(flux, fluxTarget, damp);
      fluxTarget = Math.max(0, fluxTarget - dt * 0.6);
      section.update(dt);
      tryLoadArtworkTexture();

      applyStandardUpdate(feedbackUniforms, dt, time, params, audio, exclusion, palette);
      applyStandardUpdate(displayUniforms, dt, time, params, audio, exclusion, palette);
      feedbackUniforms.uSectionProgress.value = section.value;
      displayUniforms.uSectionProgress.value = section.value;
      feedbackUniforms.uFlux.value = Math.min(1, flux + params.impulse * 0.3);
      feedbackUniforms.uMemory.value = Math.min(0.96, tuning.memory + audio.energy * 0.04);
      feedbackUniforms.uDisplace.value = tuning.displacement * (0.65 + params.turbulence * 0.7 + flux * 0.5);
    },

    preRender() {
      if (!pingPong || !feedbackScene || !feedbackCamera || !feedbackUniforms || !displayUniforms) return;
      feedbackUniforms.uFeedback.value = pingPong.read.texture;
      feedbackUniforms.uHasHistory.value = hasHistory;
      threeHost.renderToTarget(feedbackScene, feedbackCamera, pingPong.write, targetW, targetH);
      pingPong.swap();
      hasHistory = 1;
      displayUniforms.uFrame.value = pingPong.read.texture;
    },

    onEvent(event: VisualEvent) {
      section.handleEvent(event);
      const intensity = clamp01(event.intensity ?? 0.5);
      if (event.type === 'density-surge' || event.type === 'grain-bloom' || event.type === 'spark-burst') {
        fluxTarget = Math.min(1, fluxTarget + 0.35 + intensity * 0.45);
      }
      if (event.type === 'glow-pulse' || event.type === 'bloom-flash') {
        fluxTarget = Math.min(1, fluxTarget + 0.18 + intensity * 0.28);
      }
    },

    resize(nextW: number, nextH: number) {
      updateTargetSize(nextW, nextH);
      if (feedbackUniforms) (feedbackUniforms.uResolution.value as import('three').Vector2).set(nextW, nextH);
      if (displayUniforms) (displayUniforms.uResolution.value as import('three').Vector2).set(nextW, nextH);
      hasHistory = 0;
    },

    dispose() {
      artworkTexture?.dispose();
      pingPong?.dispose();
      feedbackGeometry?.dispose();
      feedbackMaterial?.dispose();
      displayGeometry?.dispose();
      displayMaterial?.dispose();
      artworkTexture = null;
      pingPong = null;
      feedbackScene = null;
      feedbackCamera = null;
      feedbackGeometry = null;
      feedbackMaterial = null;
      displayScene = null;
      displayCamera = null;
      displayGeometry = null;
      displayMaterial = null;
      feedbackUniforms = null;
      displayUniforms = null;
      three = null;
    },
  };
}

export function createThreeArtworkFlux() {
  return createThreeVisualizer(makeArtworkFluxScene);
}
