/* ── Three Canyon Vista ──────────────────────────────────────
   Fullscreen fragment-shader raymarch of a heightfield terrain
   seen in perspective — the first sketch with a real camera,
   horizon, and vanishing point. A slow forward dolly gives true
   parallax; a drifting sun and distance fog give atmospheric
   depth. Distinct from three-volumetric-fog (groundless cloud)
   and three-caustics (2D water surface): this is solid terrain,
   a landscape you look across.

   Section arc: intro is fog-shrouded low relief with the sun near
   the horizon; the build raises ridges and thins the haze; the
   peak breaks the sun through with warm rim light on the crests;
   the release lets fog reclaim the valley. Structure is driven by
   uSectionProgress (eased ratchet) — audio is accent only.

   Quality lever: the march step count (uSteps) is set each frame
   from getQualityScale(); rendered at ~0.55x and blit-upscaled,
   which the atmospheric haze hides. See THREE_INTEGRATION.md.
──────────────────────────────────────────────────────────────── */

import type { AudioSignal } from '../audio-signal';
import type { Palette } from '../palette';
import { getQualityScale } from '../render-quality';
import { resolveThreeCanyonVistaTuning, type ThreeCanyonVistaTuning } from '../tuning';
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

const MAX_STEPS = 64;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  ${STD_UNIFORM_GLSL}
  ${NOISE_GLSL}
  ${GRAIN_GLSL}

  uniform float uSteps;
  uniform float uTerrainScale;
  uniform float uRelief;
  uniform float uDollySpeed;
  uniform float uFogDensity;
  uniform float uSurge;

  // Ridged 4-octave heightfield in ~0..1.8. Ridged (1-|n|) noise gives the
  // sharp canyon crests and rounded valleys a plain fbm can't. Cheap enough at
  // raymarch rates; half-res rendering hides the lost fine detail.
  float terrainShape(vec2 p){
    p *= uTerrainScale;
    float h = 0.0;
    float amp = 1.0;
    float freq = 1.0;
    for (int i = 0; i < 4; i++){
      float n = snoise(vec3(p * freq, 0.0));
      n = 1.0 - abs(n);   // ridge
      n *= n;
      h += amp * n;
      amp *= 0.5;
      freq *= 2.03;
    }
    return h;
  }

  void main(){
    vec2 uvc = vUv - 0.5;
    float aspect = uResolution.x / max(1.0, uResolution.y);
    uvc.x *= aspect;

    // Forward dolly — the terrain domain scrolls toward the camera for parallax.
    float camZ = uTime * uDollySpeed * (0.6 + uDrift * 0.8);
    vec3 ro = vec3(0.0, 1.25, camZ);
    // Low camera, wide-ish FOV (z=0.85) so the horizon sits near mid-frame with
    // plenty of vertical spread — a clear sky above, terrain below.
    vec3 rd = normalize(vec3(uvc.x, uvc.y - 0.02, 0.85));

    // Sun drifts azimuth across the song and climbs to break through at peak.
    float sunAz = -0.6 + uSectionProgress * 1.25 + (uPointer.x - 0.5) * 0.5 * uPointerPresence;
    float sunElev = 0.05 + uSectionProgress * 0.5 + uSurge * 0.08;
    vec3 sunDir = normalize(vec3(sin(sunAz), sunElev, cos(sunAz)));
    float sunDot = max(dot(rd, sunDir), 0.0);
    vec3 sunColor = mix(uColorA, uColorWarm, 0.55);

    // Relief rises with the section; a slow level envelope adds subtle breathing.
    float reliefAmp = uRelief * (0.55 + uSectionProgress * 0.95 + uLevel * 0.18);

    // Haze is a tent over the arc: thick at the ends, clears near the peak
    // (~0.62). uSectionProgress is monotonic, so the tent gives the "fog
    // reclaims the valley" late-section feel without a decaying signal.
    float clearness = clamp(1.0 - pow(abs(uSectionProgress - 0.62) / 0.62, 1.4), 0.0, 1.0);
    clearness = clamp(clearness + uSurge * 0.25, 0.0, 1.0);
    float fogDensity = uFogDensity * (1.5 - clearness * 0.9) * (0.9 + uDensity * 0.4);

    // ── Sky ──────────────────────────────────────────────────
    // A deliberately luminous, warm horizon band under a darker zenith reads as
    // a landscape regardless of how dark the palette is — the horizon is the
    // key depth cue and the atmospheric-perspective haze target below. Lifted
    // toward white by clearness so it stays legible on the darkest palettes
    // while remaining moody (never a flat bright field).
    vec3 hazeCol = mix(uColorMid, uColorWarm, 0.5) + uColorA * 0.2;
    hazeCol = mix(hazeCol, vec3(1.0), 0.12 + clearness * 0.16);
    vec3 zenith = mix(uColorBg, uColorMid, 0.3) * 0.7;
    float skyT = clamp(rd.y * 1.7 + 0.12, 0.0, 1.0);
    vec3 sky = mix(hazeCol, zenith, skyT);
    // Crisp horizon glow line + sun disc/halo.
    sky += hazeCol * exp(-abs(rd.y) * 9.0) * (0.25 + clearness * 0.4);
    sky += sunColor * (pow(sunDot, 130.0) * 1.8 + pow(sunDot, 8.0) * 0.5 * clearness);

    // ── Raymarch the heightfield ─────────────────────────────
    float tmax = 36.0;
    float t = 0.2;
    float hitT = -1.0;
    for (int i = 0; i < ${MAX_STEPS}; i++){
      if (float(i) >= uSteps) break;
      vec3 p = ro + rd * t;
      float terr = terrainShape(p.xz) * reliefAmp;
      float d = p.y - terr;
      if (d < 0.0016 * t){ hitT = t; break; }
      t += max(0.09, d * 0.4);    // relaxed cone march
      if (t > tmax) break;
    }

    vec3 col;
    if (hitT > 0.0){
      vec3 p = ro + rd * hitT;
      // Surface normal via central differences of the heightfield.
      float e = 0.05 + hitT * 0.012;
      float hx = terrainShape(vec2(p.x + e, p.z)) - terrainShape(vec2(p.x - e, p.z));
      float hz = terrainShape(vec2(p.x, p.z + e)) - terrainShape(vec2(p.x, p.z - e));
      vec3 nor = normalize(vec3(-hx * reliefAmp, 2.0 * e, -hz * reliefAmp));

      float diff = clamp(dot(nor, sunDir), 0.0, 1.0);
      float skyLight = clamp(nor.y * 0.5 + 0.5, 0.0, 1.0);   // ambient from above
      float heightN = clamp(terrainShape(p.xz) / 2.0, 0.0, 1.0);

      // Strong tonal separation: deep valleys, accent-lit ridges.
      vec3 valley = uColorBg * 0.5;
      vec3 ridge = mix(uColorMid, uColorA, 0.65);
      vec3 rock = mix(valley, ridge, heightN);
      // Cool sky-fill from above + strong warm key light from the sun so ridge
      // faces read clearly against shadowed slopes (chiaroscuro), not flat dark.
      vec3 lit = rock * (0.16 + skyLight * 0.4);
      lit += mix(uColorWarm, vec3(1.0), 0.25) * diff * (0.85 + clearness * 0.9);
      // Bright crest glint where lit slopes turn away — the ridgeline catch.
      float crest = pow(clamp(1.0 - abs(nor.y), 0.0, 1.0), 1.4);
      lit += mix(uColorWarm, vec3(1.0), 0.4) * crest * diff * clearness * 0.4;
      lit += uColorA * heightN * uGlow * 0.16;

      // Atmospheric perspective: distant ridges fade to the bright horizon haze,
      // so ridgelines stack into legible depth layers even on a dark palette.
      float depthFade = 1.0 - exp(-hitT * fogDensity);
      col = mix(lit, hazeCol, depthFade);
    } else {
      col = sky;
    }

    // Subtle authored beat lift; neutral (1.0) when no BPM metadata.
    col *= beatPulse();
    col = mix(col, col + uColorA * uGlow * 0.12, uGlow * 0.5);

    col = mix(uColorBg, col, exclusionMask());
    col = applyGrainVignette(col, vUv, 0.03, 0.55);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeCanyonScene(): ThreeScene {
  let three: ThreeModuleRef = null;
  let scene: import('three').Scene | null = null;
  let camera: import('three').Camera | null = null;
  let material: import('three').ShaderMaterial | null = null;
  let geometry: import('three').BufferGeometry | null = null;
  let uniforms: Uniforms | null = null;

  let tuning: ThreeCanyonVistaTuning = resolveThreeCanyonVistaTuning();
  let palette: Palette | null = null;
  let time = 0;
  let surge = 0;
  let surgeTarget = 0;
  const section = createSectionProgress();

  return {
    get scene() { return scene; },
    get camera() { return camera; },
    // Per-pixel raymarch is heavy; render below native and let the 2D blit
    // upscale. Atmospheric haze makes the upscale invisible.
    get renderScale() { return 0.55; },

    build(args: ThreeSceneBuildArgs) {
      three = args.three;
      palette = args.palette;
      tuning = resolveThreeCanyonVistaTuning(args.tuning);

      uniforms = createStandardUniforms(three, palette, args.w, args.h);
      uniforms.uSteps = { value: tuning.maxSteps };
      uniforms.uTerrainScale = { value: tuning.terrainScale };
      uniforms.uRelief = { value: tuning.relief };
      uniforms.uDollySpeed = { value: tuning.dollySpeed };
      uniforms.uFogDensity = { value: tuning.fogDensity };
      uniforms.uSurge = { value: 0 };

      const fs = createFullscreenScene(three, FRAGMENT_SHADER, uniforms);
      scene = fs.scene;
      camera = fs.camera;
      material = fs.material;
      geometry = fs.geometry;

      time = 0;
      surge = 0;
      surgeTarget = 0;
      section.reset();
    },

    update(dt, params: VisualParams, audio: AudioSignal, exclusion: ExclusionRect) {
      if (!uniforms || !three || !palette) return;
      time += dt;

      // Slow attack so surges breathe in; decay ~1.5s τ.
      surge = mixNum(surge, surgeTarget, 1 - Math.pow(0.5, dt));
      surgeTarget = Math.max(0, surgeTarget - dt * 0.3);
      section.update(dt);

      applyStandardUpdate(uniforms, dt, time, params, audio, exclusion, palette);
      uniforms.uSurge.value = surge;
      uniforms.uSectionProgress.value = section.value;
      // Raymarch step count is the per-frame quality lever (frame-local).
      uniforms.uSteps.value = Math.max(20, Math.round(tuning.maxSteps * getQualityScale()));
    },

    onEvent(event: VisualEvent) {
      section.handleEvent(event);
      const intensity = clamp01(event.intensity ?? 0.5);
      if (event.type === 'density-surge' || event.type === 'grain-bloom' || event.type === 'bloom-flash') {
        surgeTarget = Math.min(1, surgeTarget + 0.35 + intensity * 0.5);
      }
      if (event.type === 'glow-pulse' || event.type === 'spark-burst') {
        surgeTarget = Math.min(1, surgeTarget + 0.2 + intensity * 0.3);
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

type ThreeModuleRef = ThreeSceneBuildArgs['three'] | null;

export function createThreeCanyonVista() {
  return createThreeVisualizer(makeCanyonScene);
}
