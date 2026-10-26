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
  GRAIN_GLSL,
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
  uniform float uSectionAmp;
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
    float t = uTime * 0.025;
    float broad = fbm(vec3(uv * vec2(2.1, 1.15), t));
    float sediment = fbm(vec3(uv * vec2(7.0, 2.4) + vec2(broad * 0.9, 0.0), t * 0.6));
    float veil = smoothstep(0.18, 0.92, broad * 0.72 + sediment * 0.38);
    vec3 ground = mix(uColorBg, uColorMid, 0.34 + veil * 0.52);
    return mix(ground, uColorA, pow(sediment, 3.0) * (0.18 + uGlow * 0.2));
  }

  vec3 artworkSample(vec2 uv, vec2 offset){
    if (uHasArtwork < 0.5) return fallbackMaterial(uv + offset);
    vec2 auv = clamp(coverUv(uv + offset), 0.001, 0.999);
    return texture2D(uArtwork, auv).rgb;
  }

  void main(){
    vec2 uv = vUv;
    float t = uTime * (0.10 + uDrift * 0.12);
    // Keep a drift floor (0.15) so the scene never fully locks static even at silence/section 0
    float structural = 0.15 + (uLevel * 0.30 + uSectionProgress * 0.35 + uFlux * 0.50) * max(0.25, uSectionAmp);
    // Coherent curl: two scalar potentials rotated together break x/y independence
    // and eliminate the grid-aligned plaid artifact of separable noise.
    float pot0 = snoise(vec3(uv * 2.0, t));
    float pot1 = snoise(vec3(uv * 2.0 + 3.7, t + 1.1));
    float rotA = uTime * 0.075;
    float rc = cos(rotA), rs = sin(rotA);
    vec2 curl = vec2(pot0 * rc - pot1 * rs, pot0 * rs + pot1 * rc);
    vec2 drift = curl * uDisplace * (0.006 + structural * 0.034);
    // Translate the artwork as well as its distortion field. Differential
    // feedback travel keeps the motion legible without turning into a fast mosh.
    float travelPhase = uTime * (0.085 + uDrift * 0.075);
    vec2 transport = vec2(
      sin(travelPhase) + sin(travelPhase * 0.43 + 1.7) * 0.34,
      cos(travelPhase * 0.71) + sin(travelPhase * 0.37) * 0.28
    ) * (0.008 + structural * 0.014);
    float foldNoise = snoise(vec3(uv * vec2(1.35, 2.8), t * 0.72));
    float fineNoise = snoise(vec3(uv * vec2(5.6, 2.1) + curl * 0.18, t * 1.15));
    float fold = sin((uv.y + foldNoise * 0.105) * 18.0 - uv.x * 2.8 + t * 8.0);
    float tear = smoothstep(0.48, 0.92, abs(fold)) * (0.42 + structural * 0.58);
    float crossFold = sin((uv.x + fineNoise * 0.115) * 14.0 + uv.y * 4.6 - t * 5.4);
    float crossTear = smoothstep(0.52, 0.94, abs(crossFold)) * (0.3 + structural * 0.7);
    float split = sign(fold) * (0.012 + structural * 0.048) * uDisplace;
    vec2 foldOffset = vec2(split + fineNoise * 0.012, foldNoise * 0.018) * tear;
    foldOffset += vec2(fineNoise * 0.012, sign(crossFold) * (0.008 + structural * 0.035)) * crossTear * uDisplace;
    // Asymmetric per-channel smear: R and B split at different angles so the
    // chromatic fringe looks like optical glass aberration, not a "split RGB" filter.
    float smearMag = uTexel.x * (1.0 + uFlux * 7.0);
    vec2 smearR = vec2( smearMag,  smearMag * 0.4);
    vec2 smearB = vec2(-smearMag * 0.85, smearMag * 0.6);

    vec3 prev = texture2D(uFeedback, clamp(uv + drift + transport * 0.42, 0.001, 0.999)).rgb;
    vec3 artR = artworkSample(uv, drift + transport + foldOffset + smearR * uChromatic);
    vec3 artG = artworkSample(uv, drift + transport + foldOffset);
    vec3 artB = artworkSample(uv, drift + transport + foldOffset + smearB * uChromatic);
    vec3 art = vec3(artR.r, artG.g, artB.b);

    // Offset echoes expose different parts of even very plain artwork. Their
    // irregular masks read as translucent geological folds rather than a
    // full-screen image with a small distortion filter applied to it.
    vec2 echoOffset = vec2(-foldOffset.x * 2.6 + curl.y * 0.026, foldOffset.y - 0.045);
    vec3 echo = artworkSample(uv, drift + transport * 1.24 + echoOffset);
    float echoMask = smoothstep(0.08, 0.86, foldNoise * 0.5 + 0.5) * max(tear, crossTear * 0.78);
    art = mix(art, echo, echoMask * (0.28 + structural * 0.46));

    float reveal = clamp(uReveal + uSectionProgress * 0.22 + uLevel * 0.14, 0.0, 1.0);
    vec3 material = fallbackMaterial(uv + curl * 0.045);
    vec3 base = mix(material, art, reveal);

    // A minimum relief floor is essential for covers with almost no internal
    // contrast (for example Sewing Machine 2's brown field). The artwork owns
    // the colour, while procedural folds supply readable light and shadow.
    float relief = smoothstep(-0.8, 0.82, foldNoise);
    float crossRelief = smoothstep(-0.82, 0.86, fineNoise);
    float foldShade = relief * 0.22 + crossRelief * 0.13 + max(tear, crossTear) * 0.15;
    base *= 0.68 + foldShade;
    base = mix(base, material, 0.18 + tear * (0.12 + structural * 0.08));

    // Fault seams and a low atmospheric shelf give the material a spatial
    // silhouette even when the source art is nearly monochrome.
    float seamA = pow(1.0 - abs(fold), 9.0);
    float seamB = pow(1.0 - abs(crossFold), 10.0);
    float seam = max(seamA, seamB * 0.78) * (0.48 + structural * 0.52);
    seam *= 0.45 + 0.55 * smoothstep(-0.7, 0.85, fineNoise);
    float horizon = exp(-abs(uv.y - (0.58 + foldNoise * 0.055)) * 12.0);
    float depthHaze = smoothstep(0.05, 0.92, uv.y) * (0.08 + structural * 0.12);
    vec3 seamLight = mix(uColorA, uColorWarm, 0.55 + uFlux * 0.25) + vec3(0.055, 0.045, 0.04);
    base += seamLight * seam * (0.52 + uGlow * 0.3 + uFlux * 0.44);
    base = mix(base, uColorMid + uColorA * 0.12, horizon * depthHaze);
    base = mix(base, base + uColorWarm * (0.08 + uFlux * 0.2), uGlow);

    float memory = clamp(uMemory + uLevel * 0.08, 0.0, 0.96);
    // Keep enough current structure that feedback cannot blur the folds back
    // into the uniform wash this recipe previously converged toward.
    float localMemory = memory * (0.82 - seam * 0.42 - tear * 0.12);
    vec3 col = mix(base, prev, uHasHistory * localMemory);
    col += uColorA * pow(max(0.0, fbm(vec3(uv * 4.0 + curl * 0.2, t)) - 0.62), 2.0) * (0.2 + uFlux * 0.8);
    // Ambient floor: feedback can't collapse below a visible minimum
    col = max(col, uColorMid * 0.22 + uColorBg * 0.08);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const DISPLAY_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  ${STD_UNIFORM_GLSL}
  ${GRAIN_GLSL}

  uniform sampler2D uFrame;
  uniform float uVignette;

  void main(){
    vec3 col = texture2D(uFrame, vUv).rgb;
    // Palette-derived floors remain too dark for low-key green/blue artwork.
    // Lift exposure and gamma while retaining channel ratios and texture contrast.
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float shadow = smoothstep(0.34, 0.02, luma);
    col = col * 1.42 + mix(vec3(0.045), uColorMid, 0.16) * shadow;
    col = pow(max(col, vec3(0.0)), vec3(0.86));
    col = applyGrainVignette(col, vUv, 0.024, uVignette);
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
  let fallbackTexture: import('three').DataTexture | null = null;

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
  let warmColor: [number, number, number] | null = null;
  let colorMorph = 0;
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
      fallbackTexture = new three.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, three.RGBAFormat);
      fallbackTexture.needsUpdate = true;
      displayUniforms = createStandardUniforms(three, palette, args.w, args.h);
      feedbackUniforms = createStandardUniforms(three, palette, args.w, args.h);

      displayUniforms.uFrame = { value: pingPong.read.texture };
      displayUniforms.uVignette = { value: tuning.vignette };
      feedbackUniforms.uFeedback = { value: pingPong.read.texture };
      feedbackUniforms.uArtwork = { value: fallbackTexture };
      feedbackUniforms.uHasArtwork = { value: 0 };
      feedbackUniforms.uHasHistory = { value: 0 };
      feedbackUniforms.uArtworkAspect = { value: 1 };
      feedbackUniforms.uMemory = { value: tuning.memory };
      feedbackUniforms.uDisplace = { value: tuning.displacement };
      feedbackUniforms.uFlux = { value: 0 };
      feedbackUniforms.uReveal = { value: tuning.reveal };
      feedbackUniforms.uSectionAmp = { value: 0 };
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
      colorMorph = 0;
      warmColor = null;
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
      // Section arc: near-zero warp in section 0, full by section 3 (smoothstep gives qualitative jump)
      feedbackUniforms.uSectionAmp.value = Math.pow(Math.min(1, section.value * 1.5), 1.6);
      // Color-morph: tint the warm pole toward event colour
      if (warmColor && colorMorph > 0.001 && palette) {
        const baseWarm = palette.accentWarm;
        const r = mixNum(baseWarm[0], warmColor[0], colorMorph) / 255;
        const g = mixNum(baseWarm[1], warmColor[1], colorMorph) / 255;
        const b = mixNum(baseWarm[2], warmColor[2], colorMorph) / 255;
        (feedbackUniforms.uColorWarm.value as import('three').Vector3).set(r, g, b);
        (displayUniforms.uColorWarm.value as import('three').Vector3).set(r, g, b);
        colorMorph = Math.max(0, colorMorph - dt * 0.3);
      }
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
      if ((event.type === 'color-morph' || event.type === 'palette-morph') && event.color) {
        warmColor = event.color;
        colorMorph = Math.min(1, 0.6 + intensity * 0.4);
        fluxTarget = Math.min(1, fluxTarget + 0.5 + intensity * 0.4);
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
      fallbackTexture?.dispose();
      pingPong?.dispose();
      feedbackGeometry?.dispose();
      feedbackMaterial?.dispose();
      displayGeometry?.dispose();
      displayMaterial?.dispose();
      artworkTexture = null;
      fallbackTexture = null;
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
