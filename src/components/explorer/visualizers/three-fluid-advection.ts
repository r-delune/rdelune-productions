/* ── Three Fluid Advection ────────────────────────────────────
   GPU velocity-field advection. A curl-noise velocity field is
   stored in a half-float ping-pong FBO; a dye field (passive
   scalar) is advected along the velocity each frame. The result
   looks like ink bleeding into still water — slow eddies,
   pooling colour, and organic filaments that never repeat.

   Section arc:
     0   — near-still, single seeded dye plume, velocity low
     1–2 — vortex strength rises, dye spreads from seed events
     3   — tight spiral currents, colour shifts toward warm
     4–5 — viscosity damps velocity to rest, dye bleeds away

   Song structure owns the arc: section cues drive velocity
   strength and injection rate; audio energy adds gentle pulse
   without beat detection.
──────────────────────────────────────────────────────────────── */

import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import { getQualityScale } from '../render-quality';
import { resolveThreeFluidAdvectionTuning, type ThreeFluidAdvectionTuning } from '../tuning';
import type { ExclusionRect, VisualEvent, VisualParams } from '../visualizer';
import { clamp01, mix as mixNum } from './cong-particle-primitives';
import {
  applyStandardUpdate,
  createFloatPingPong,
  createFullscreenScene,
  createPingPong,
  createSectionProgress,
  createStandardUniforms,
  GRAIN_GLSL,
  NOISE_GLSL,
  STD_UNIFORM_GLSL,
  type FullscreenScene,
  type PingPongTargets,
  type Uniforms,
} from './three-scene-helpers';
import { threeHost } from './three-host';
import { createThreeVisualizer, type ThreeScene, type ThreeSceneBuildArgs } from './three-visualizer';

// Velocity simulation at half resolution; dye at full resolution.
const VEL_SCALE = 0.45;

// Curl-noise velocity advection. Reads previous velocity, applies
// a curl-noise impulse, and damps toward rest (viscosity).
// RG = velocity XY in [-1, 1] range, stored as [0,1] (centred at 0.5).
const VELOCITY_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  ${NOISE_GLSL}

  uniform sampler2D uVelocity;
  uniform vec2  uTexel;
  uniform float uTime;
  uniform float uViscosity;     // per-frame damping: 0.92–0.98
  uniform float uCurlStrength;  // driven by section progress
  uniform float uNoiseScale;    // spatial frequency of the curl field
  uniform float uDrift;         // slow time-drift speed
  uniform vec2  uPointerPos;    // normalized UV, bottom-origin
  uniform vec2  uPointerDelta;  // recent movement direction
  uniform float uPointerForce;  // eased movement energy
  uniform float uAspect;

  void main() {
    // Decode velocity from [0,1] → [-1,1]
    vec2 vel = texture2D(uVelocity, vUv).rg * 2.0 - 1.0;

    // Curl noise impulse: take the 2D curl of a scalar potential so
    // the field is divergence-free (incompressible), preventing blobs
    // from inflating or collapsing artificially.
    vec2 p = vUv * uNoiseScale;
    float t = uTime * uDrift;
    float eps = uTexel.x * 1.5;
    float n0  = snoise(vec3(p.x,        p.y,        t));
    float ndx = snoise(vec3(p.x + eps,  p.y,        t));
    float ndy = snoise(vec3(p.x,        p.y + eps,  t));
    // Curl of scalar potential n: (dn/dy, -dn/dx)
    vec2 curl = vec2((ndy - n0) / eps, -(ndx - n0) / eps);
    curl = normalize(curl + 0.0001) * uCurlStrength;

    vel = vel * uViscosity + curl;

    // Local directional force: the pointer disturbs the existing current
    // rather than attracting dye toward a cursor-shaped singularity.
    vec2 pointerOffset = (vUv - uPointerPos) * vec2(uAspect, 1.0);
    float pointerField = exp(-dot(pointerOffset, pointerOffset) * 46.0);
    vel += uPointerDelta * pointerField * uPointerForce * 0.16;

    // Clamp to prevent runaway advection at peak injection
    vel = clamp(vel, -1.0, 1.0);

    // Re-encode to [0,1]
    gl_FragColor = vec4(vel * 0.5 + 0.5, 0.0, 1.0);
  }
`;

// Dye advection: semi-Lagrangian backtrack along the velocity field.
// RGB = dye colour, A = density.
const DYE_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D uDye;
  uniform sampler2D uVelocity;
  uniform vec2  uTexel;
  uniform float uDissipation;  // per-frame decay: 0.994–0.999
  uniform float uInject;       // 0..1 injection burst
  uniform vec2  uInjectPos;    // UV centre of the injection plume
  uniform float uInjectRadius; // radius in UV space
  uniform vec3  uInjectColor;  // palette-driven dye colour
  uniform float uTime;
  uniform vec2  uPointerPos;
  uniform float uPointerInject;
  uniform float uAspect;

  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  void main() {
    // Decode velocity, scale to UV displacement per frame
    vec2 vel = texture2D(uVelocity, vUv).rg * 2.0 - 1.0;
    // Semi-Lagrangian: look back in time along the velocity
    vec2 prevUv = clamp(vUv - vel * uTexel * 1.5, 0.001, 0.999);
    vec4 prev = texture2D(uDye, prevUv);

    // Dissipate
    vec4 dye = prev * uDissipation;

    // Inject dye at the plume centre (Gaussian falloff)
    float dist = length(vUv - uInjectPos);
    float plume = exp(-dist * dist / (uInjectRadius * uInjectRadius + 0.0001));
    // Sparse scatter noise so the plume looks organic, not circular
    float scatter = hash21(vUv + uTime * 0.01);
    plume *= smoothstep(0.05, 0.45, scatter);
    dye.rgb += uInjectColor * plume * uInject;
    dye.a   += plume * uInject * 0.8;

    vec2 pointerOffset = (vUv - uPointerPos) * vec2(uAspect, 1.0);
    float pointerPlume = exp(-dot(pointerOffset, pointerOffset) * 85.0) * uPointerInject;
    dye.rgb += uInjectColor * pointerPlume * 0.16;
    dye.a += pointerPlume * 0.12;

    gl_FragColor = clamp(dye, 0.0, 1.0);
  }
`;

// Display: map dye density to palette colours + grain + vignette.
const DISPLAY_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  ${STD_UNIFORM_GLSL}
  ${GRAIN_GLSL}

  uniform sampler2D uDye;
  uniform float uColorShift;   // warm shift from events (0..1)

  void main() {
    vec4 dye = texture2D(uDye, vUv);
    float density = clamp(dye.a, 0.0, 1.0);

    // Section-aware brightness floor — raised so thin dye is visible even at rest
    float brightness = 0.48 + uSectionProgress * 0.42 + uLevel * 0.22 + uGlow * 0.20;

    // Colour: bg in empty space, mid at low density, accent at peak,
    // warm at the very top (vortex cores). Thresholds lowered so sparse
    // dye at late sections still paints mid colour rather than disappearing.
    vec3 col = uColorBg;
    col = mix(col, uColorMid,  smoothstep(0.02, 0.22, density) * brightness);
    col = mix(col, uColorA,    smoothstep(0.12, 0.55, density) * brightness);
    col = mix(col, uColorWarm, smoothstep(0.45, 0.88, density) * (0.5 + uColorShift * 0.5));

    // Blend in any tint the dye itself carries (from multi-color injection)
    col = mix(col, dye.rgb, clamp(density * 0.35, 0.0, 0.35));

    col = mix(uColorBg, col, exclusionMask());
    col = applyGrainVignette(col, vUv, 0.032, 0.60);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Seed shader: clear dye and velocity to rest state.
const CLEAR_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec4 uClearColor;
  void main() { gl_FragColor = uClearColor; }
`;

function makeFluidAdvectionScene(): ThreeScene {
  let displayScene: import('three').Scene | null = null;
  let displayCamera: import('three').Camera | null = null;
  let displayUniforms: Uniforms | null = null;
  let displayFs: FullscreenScene | null = null;

  let velScene: import('three').Scene | null = null;
  let velCamera: import('three').Camera | null = null;
  let velUniforms: Uniforms | null = null;
  let velFs: FullscreenScene | null = null;

  let dyeScene: import('three').Scene | null = null;
  let dyeCamera: import('three').Camera | null = null;
  let dyeUniforms: Uniforms | null = null;
  let dyeFs: FullscreenScene | null = null;

  let clearScene: import('three').Scene | null = null;
  let clearCamera: import('three').Camera | null = null;
  let clearUniforms: Uniforms | null = null;
  let clearFs: FullscreenScene | null = null;

  let velPP: PingPongTargets | null = null;  // half-float velocity
  let dyePP: PingPongTargets | null = null;  // RGBA dye

  let tuning: ThreeFluidAdvectionTuning = resolveThreeFluidAdvectionTuning();
  let palette: Palette | null = null;
  let time = 0;
  let velW = 1;
  let velH = 1;
  let dyeW = 1;
  let dyeH = 1;

  // Eased state
  let inject = 0;
  let injectTarget = 0;
  let colorShift = 0;
  let colorShiftTarget = 0;
  let curlStrength = 0;
  let curlStrengthTarget = tuning.baseCurlStrength;

  // Injection position (drifts slowly)
  let injectX = 0.5;
  let injectY = 0.5;

  const section = createSectionProgress();

  function computeSizes(w: number, h: number) {
    velW = Math.max(1, Math.round(w * VEL_SCALE));
    velH = Math.max(1, Math.round(h * VEL_SCALE));
    dyeW = Math.max(1, w);
    dyeH = Math.max(1, h);
  }

  function clearBuffers(three: ThreeSceneBuildArgs['three']): void {
    if (!clearFs || !clearUniforms || !velPP || !dyePP) return;
    // Velocity: clear to 0.5 (encodes velocity 0)
    (clearUniforms.uClearColor.value as import('three').Vector4).set(0.5, 0.5, 0, 1);
    threeHost.renderToTarget(clearFs.scene, clearFs.camera, velPP.read, velW, velH);
    threeHost.renderToTarget(clearFs.scene, clearFs.camera, velPP.write, velW, velH);
    // Dye: clear to 0
    (clearUniforms.uClearColor.value as import('three').Vector4).set(0, 0, 0, 0);
    threeHost.renderToTarget(clearFs.scene, clearFs.camera, dyePP.read, dyeW, dyeH);
    threeHost.renderToTarget(clearFs.scene, clearFs.camera, dyePP.write, dyeW, dyeH);
  }

  return {
    get scene() { return displayScene; },
    get camera() { return displayCamera; },
    get renderScale() { return 1.0; },

    build(args: ThreeSceneBuildArgs) {
      const three = args.three;
      palette = args.palette;
      tuning = resolveThreeFluidAdvectionTuning(args.tuning);
      computeSizes(args.w, args.h);

      velPP = createFloatPingPong(three, velW, velH);
      dyePP = createPingPong(three, dyeW, dyeH);

      // Clear scene
      clearUniforms = { uClearColor: { value: new three.Vector4(0.5, 0.5, 0, 1) } };
      clearFs = createFullscreenScene(three, CLEAR_SHADER, clearUniforms);
      clearScene = clearFs.scene;
      clearCamera = clearFs.camera;

      // Velocity update scene
      velUniforms = {
        uVelocity:     { value: velPP.read.texture },
        uTexel:        { value: new three.Vector2(1 / velW, 1 / velH) },
        uTime:         { value: 0 },
        uViscosity:    { value: tuning.viscosity },
        uCurlStrength: { value: tuning.baseCurlStrength },
        uNoiseScale:   { value: tuning.noiseScale },
        uDrift:        { value: tuning.driftSpeed },
        uPointerPos:   { value: new three.Vector2(0.5, 0.5) },
        uPointerDelta: { value: new three.Vector2(0, 0) },
        uPointerForce: { value: 0 },
        uAspect:       { value: args.w / Math.max(1, args.h) },
      };
      velFs = createFullscreenScene(three, VELOCITY_SHADER, velUniforms);
      velScene = velFs.scene;
      velCamera = velFs.camera;

      // Dye advection scene
      dyeUniforms = {
        uDye:          { value: dyePP.read.texture },
        uVelocity:     { value: velPP.read.texture },
        uTexel:        { value: new three.Vector2(1 / dyeW, 1 / dyeH) },
        uDissipation:  { value: tuning.dissipation },
        uInject:       { value: 0 },
        uInjectPos:    { value: new three.Vector2(0.5, 0.5) },
        uInjectRadius: { value: tuning.injectRadius },
        uInjectColor:  { value: new three.Vector3(1, 1, 1) },
        uTime:         { value: 0 },
        uPointerPos:   { value: new three.Vector2(0.5, 0.5) },
        uPointerInject:{ value: 0 },
        uAspect:       { value: args.w / Math.max(1, args.h) },
      };
      dyeFs = createFullscreenScene(three, DYE_SHADER, dyeUniforms);
      dyeScene = dyeFs.scene;
      dyeCamera = dyeFs.camera;

      // Display scene
      displayUniforms = {
        ...createStandardUniforms(three, palette, args.w, args.h),
        uDye:        { value: dyePP.read.texture },
        uColorShift: { value: 0 },
      };
      displayFs = createFullscreenScene(three, DISPLAY_SHADER, displayUniforms);
      displayScene = displayFs.scene;
      displayCamera = displayFs.camera;

      time = 0;
      inject = 0;
      injectTarget = 0.6;  // seed initial plume on startup
      colorShift = 0;
      colorShiftTarget = 0;
      curlStrength = 0;
      curlStrengthTarget = tuning.baseCurlStrength;
      injectX = 0.35 + Math.random() * 0.3;
      injectY = 0.35 + Math.random() * 0.3;
      section.reset();

      clearBuffers(three);
    },

    update(dt: number, params: VisualParams, audio: AudioSignal, exclusion: ExclusionRect) {
      if (!displayUniforms || !velUniforms || !dyeUniforms || !dyePP || !velPP || !palette) return;
      time += dt;
      section.update(dt);
      const sp = section.value;

      const damp = 1 - Math.exp(-Math.max(0, dt) / 1.4);
      inject = mixNum(inject, injectTarget, damp);
      injectTarget = Math.max(0, injectTarget - dt * 0.32);
      colorShift = mixNum(colorShift, colorShiftTarget, damp);
      colorShiftTarget = Math.max(0, colorShiftTarget - dt * 0.28);

      // Section-driven velocity: low at open, peak at section 3, decay after
      const sectionStrength = tuning.baseCurlStrength
        + sp * (tuning.peakCurlStrength - tuning.baseCurlStrength)
        * (sp < 0.6 ? sp / 0.6 : 1 - (sp - 0.6) / 0.4);
      const curlDamp = 1 - Math.exp(-dt / 2.2);
      curlStrength = mixNum(curlStrength, curlStrengthTarget + sectionStrength * 0.012, curlDamp);
      curlStrengthTarget = sectionStrength;

      // Continuous trickle keeps dye visible even at late sections (rises mid-song)
      const baseInject = 0.06 + sp * 0.04;
      // Audio energy breathes the injection rate
      const audioInject = audio.energy * 0.22 * params.impulse;

      // Slow inject position drift so plume wanders across the frame
      injectX += Math.sin(time * 0.11 + 1.3) * 0.0015;
      injectY += Math.cos(time * 0.09 + 0.7) * 0.0012;
      injectX = clamp01(injectX);
      injectY = clamp01(injectY);

      // Palette-driven dye colour
      const [r, g, b] = palette.dotColor;
      const pointer = params.pointer;
      const pointerPresence = pointer?.presence ?? 0;
      const pointerVelocity = pointer?.velocity ?? 0;
      const pointerX = pointer?.x ?? 0.5;
      const pointerY = 1 - (pointer?.y ?? 0.5);

      // Update velocity uniforms
      velUniforms.uTime.value = time;
      velUniforms.uViscosity.value = tuning.viscosity - sp * 0.035;  // slightly less viscous at peak
      velUniforms.uCurlStrength.value = curlStrength;
      (velUniforms.uPointerPos.value as import('three').Vector2).set(pointerX, pointerY);
      (velUniforms.uPointerDelta.value as import('three').Vector2).set(pointer?.deltaX ?? 0, -(pointer?.deltaY ?? 0));
      velUniforms.uPointerForce.value = pointerPresence * pointerVelocity;

      // Update dye uniforms
      dyeUniforms.uTime.value = time;
      dyeUniforms.uDissipation.value = tuning.dissipation + sp * 0.003;  // slower decay at peak
      dyeUniforms.uInject.value = clamp01(inject + audioInject + baseInject);
      (dyeUniforms.uInjectPos.value as import('three').Vector2).set(injectX, injectY);
      (dyeUniforms.uInjectColor.value as import('three').Vector3).set(r / 255, g / 255, b / 255);
      (dyeUniforms.uPointerPos.value as import('three').Vector2).set(pointerX, pointerY);
      dyeUniforms.uPointerInject.value = pointerPresence * pointerVelocity;

      // Update display uniforms
      applyStandardUpdate(displayUniforms, dt, time, params, audio, exclusion, palette);
      displayUniforms.uSectionProgress.value = sp;
      displayUniforms.uDye.value = dyePP.read.texture;
      displayUniforms.uColorShift.value = colorShift;
    },

    preRender() {
      if (!velPP || !dyePP || !velFs || !dyeFs || !velUniforms || !dyeUniforms || !displayUniforms) return;

      const steps = Math.max(1, Math.round(2 * getQualityScale()));

      for (let i = 0; i < steps; i++) {
        // Step 1: update velocity field
        velUniforms.uVelocity.value = velPP.read.texture;
        (velUniforms.uTexel.value as import('three').Vector2).set(1 / velW, 1 / velH);
        threeHost.renderToTarget(velFs.scene, velFs.camera, velPP.write, velW, velH);
        velPP.swap();

        // Step 2: advect dye along updated velocity
        dyeUniforms.uVelocity.value = velPP.read.texture;
        dyeUniforms.uDye.value = dyePP.read.texture;
        (dyeUniforms.uTexel.value as import('three').Vector2).set(1 / dyeW, 1 / dyeH);
        threeHost.renderToTarget(dyeFs.scene, dyeFs.camera, dyePP.write, dyeW, dyeH);
        dyePP.swap();
      }

      displayUniforms.uDye.value = dyePP.read.texture;
    },

    onEvent(event: VisualEvent) {
      section.handleEvent(event);
      const intensity = clamp01(event.intensity ?? 0.5);

      if (event.type === 'density-surge' || event.type === 'spark-burst') {
        injectTarget = Math.min(1, injectTarget + 0.45 + intensity * 0.45);
        // Shift injection position to a new spot
        injectX = 0.25 + Math.random() * 0.5;
        injectY = 0.25 + Math.random() * 0.5;
      }
      if (event.type === 'glow-pulse' || event.type === 'bloom-flash') {
        injectTarget = Math.min(1, injectTarget + 0.25 + intensity * 0.3);
        curlStrengthTarget = Math.min(curlStrengthTarget + 0.015 + intensity * 0.02, tuning.peakCurlStrength * 1.4);
      }
      if (event.type === 'color-morph' || event.type === 'palette-morph') {
        colorShiftTarget = Math.min(1, 0.55 + intensity * 0.45);
        injectTarget = Math.min(1, injectTarget + 0.3 + intensity * 0.35);
        injectX = 0.3 + Math.random() * 0.4;
        injectY = 0.3 + Math.random() * 0.4;
      }
      if (event.type === 'grain-bloom') {
        injectTarget = Math.min(1, injectTarget + 0.2 + intensity * 0.3);
      }
      if (event.type === 'section-cue') {
        injectTarget = Math.min(1, 0.55 + intensity * 0.4);
        curlStrengthTarget = Math.min(
          curlStrengthTarget + 0.022 + intensity * 0.018,
          tuning.peakCurlStrength * 1.6
        );
        injectX = 0.2 + Math.random() * 0.6;
        injectY = 0.2 + Math.random() * 0.6;
      }
    },

    resize(w: number, h: number) {
      if (displayUniforms) {
        (displayUniforms.uResolution.value as import('three').Vector2).set(w, h);
      }
      if (velUniforms) velUniforms.uAspect.value = w / Math.max(1, h);
      if (dyeUniforms) dyeUniforms.uAspect.value = w / Math.max(1, h);
      if (velPP && dyePP) {
        const newVelW = Math.max(1, Math.round(w * VEL_SCALE));
        const newVelH = Math.max(1, Math.round(h * VEL_SCALE));
        const newDyeW = Math.max(1, w);
        const newDyeH = Math.max(1, h);
        if (newVelW !== velW || newVelH !== velH) {
          velW = newVelW; velH = newVelH;
          velPP.resize(velW, velH);
          if (velUniforms) (velUniforms.uTexel.value as import('three').Vector2).set(1 / velW, 1 / velH);
        }
        if (newDyeW !== dyeW || newDyeH !== dyeH) {
          dyeW = newDyeW; dyeH = newDyeH;
          dyePP.resize(dyeW, dyeH);
          if (dyeUniforms) (dyeUniforms.uTexel.value as import('three').Vector2).set(1 / dyeW, 1 / dyeH);
        }
      }
    },

    dispose() {
      velPP?.dispose();
      dyePP?.dispose();
      clearFs?.material.dispose();
      clearFs?.geometry.dispose();
      velFs?.material.dispose();
      velFs?.geometry.dispose();
      dyeFs?.material.dispose();
      dyeFs?.geometry.dispose();
      displayFs?.material.dispose();
      displayFs?.geometry.dispose();
      velPP = null;
      dyePP = null;
      clearFs = null;
      velFs = null;
      dyeFs = null;
      displayFs = null;
      displayScene = null;
      displayCamera = null;
      displayUniforms = null;
      velScene = null;
      velCamera = null;
      velUniforms = null;
      dyeScene = null;
      dyeCamera = null;
      dyeUniforms = null;
      clearScene = null;
      clearCamera = null;
      clearUniforms = null;
      palette = null;
    },
  };
}

export function createThreeFluidAdvection() {
  return createThreeVisualizer(makeFluidAdvectionScene);
}
