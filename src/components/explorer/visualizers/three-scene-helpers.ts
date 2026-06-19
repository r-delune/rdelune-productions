/* ── Three Scene Helpers ─────────────────────────────────────
   Shared GPU infrastructure for fragment-shader Three sketches.
   Centralizes the song-data → uniform plumbing and the fullscreen-
   quad scaffold so each sketch only writes its fragment shader —
   mirroring how cong-particle-primitives.ts centralizes CPU
   particle logic.

   The standard uniform block makes song-structure response the path
   of least resistance: every sketch that calls applyStandardUpdate
   gets a slow level envelope, persistent section progress, authored
   beatPhase only when present (sentinel -1 otherwise), params,
   palette, and exclusion. See THREE_INTEGRATION.md
   ("Song Structure First").
──────────────────────────────────────────────────────────────── */

import type { AudioSignal } from '../audio-signal';
import { getCachedArtworkImage, preloadArtworkImage } from '../artwork-cache';
import type { Palette } from '../palette';
import type { ExclusionRect, VisualEvent, VisualParams } from '../visualizer';
import type { ThreeModule } from './three-host';

export type Uniforms = Record<string, { value: unknown }>;

/** 0..1 colour channels for a shader uniform from a 0..255 palette triple. */
export function paletteVec3(three: ThreeModule, rgb: [number, number, number]) {
  return new three.Vector3(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
}

/** Update an existing vec3 uniform from a 0..255 palette triple (no alloc). */
export function setVec3(uniform: { value: unknown }, rgb: [number, number, number]): void {
  (uniform.value as { set: (r: number, g: number, b: number) => void }).set(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
}

export interface ArtworkTextureResult {
  texture: import('three').Texture | null;
  status: 'missing-url' | 'loading' | 'ready' | 'cors-unsafe';
  width: number;
  height: number;
}

/**
 * Create a scene-owned texture from the shared artwork image cache.
 * WebGL requires CORS-clean images, so cache fallbacks loaded without
 * crossOrigin are rejected and callers should use a palette/noise fallback.
 */
export function loadArtworkTexture(three: ThreeModule, artworkUrl?: string): ArtworkTextureResult {
  if (!artworkUrl) return { texture: null, status: 'missing-url', width: 0, height: 0 };
  preloadArtworkImage(artworkUrl);
  const image = getCachedArtworkImage(artworkUrl);
  if (!image) return { texture: null, status: 'loading', width: 0, height: 0 };
  if (image.crossOrigin !== 'anonymous') return { texture: null, status: 'cors-unsafe', width: image.naturalWidth, height: image.naturalHeight };

  const texture = new three.Texture(image);
  texture.needsUpdate = true;
  texture.colorSpace = three.SRGBColorSpace;
  texture.wrapS = three.ClampToEdgeWrapping;
  texture.wrapT = three.ClampToEdgeWrapping;
  texture.minFilter = three.LinearFilter;
  texture.magFilter = three.LinearFilter;
  return { texture, status: 'ready', width: image.naturalWidth, height: image.naturalHeight };
}

export interface PingPongTargets {
  readonly read: import('three').WebGLRenderTarget;
  readonly write: import('three').WebGLRenderTarget;
  resize(w: number, h: number): void;
  swap(): void;
  dispose(): void;
}

export function createPingPong(three: ThreeModule, w: number, h: number): PingPongTargets {
  const makeTarget = () => new three.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: three.LinearFilter,
    magFilter: three.LinearFilter,
    wrapS: three.ClampToEdgeWrapping,
    wrapT: three.ClampToEdgeWrapping,
    type: three.UnsignedByteType,
    format: three.RGBAFormat,
  });

  let read = makeTarget();
  let write = makeTarget();
  return {
    get read() { return read; },
    get write() { return write; },
    resize(nextW: number, nextH: number) {
      const rw = Math.max(1, nextW);
      const rh = Math.max(1, nextH);
      read.setSize(rw, rh);
      write.setSize(rw, rh);
    },
    swap() {
      const tmp = read;
      read = write;
      write = tmp;
    },
    dispose() {
      read.dispose();
      write.dispose();
    },
  };
}

/** Half-float ping-pong for simulation state that needs sub-byte precision. */
export function createFloatPingPong(three: ThreeModule, w: number, h: number): PingPongTargets {
  const makeTarget = () => new three.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: three.NearestFilter,
    magFilter: three.NearestFilter,
    wrapS: three.ClampToEdgeWrapping,
    wrapT: three.ClampToEdgeWrapping,
    type: three.HalfFloatType,
    format: three.RGBAFormat,
  });

  let read = makeTarget();
  let write = makeTarget();
  return {
    get read() { return read; },
    get write() { return write; },
    resize(nextW: number, nextH: number) {
      const rw = Math.max(1, nextW);
      const rh = Math.max(1, nextH);
      read.setSize(rw, rh);
      write.setSize(rw, rh);
    },
    swap() { const tmp = read; read = write; write = tmp; },
    dispose() { read.dispose(); write.dispose(); },
  };
}

export interface InstancedField {
  geometry: import('three').BufferGeometry;
  positions: Float32Array;
  phases: Float32Array;
  depths: Float32Array;
  rands: Float32Array;
  setDrawFraction(fraction: number, minCount?: number): void;
  dispose(): void;
}

export function createInstancedField(
  three: ThreeModule,
  count: number,
  spanX: number,
  spanY: number,
  seed = 0x9e3779b9,
): InstancedField {
  const maxInstances = Math.max(1, Math.round(count));
  const positions = new Float32Array(maxInstances * 3);
  const phases = new Float32Array(maxInstances);
  const depths = new Float32Array(maxInstances);
  const rands = new Float32Array(maxInstances);
  let s = seed ^ maxInstances;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };

  for (let i = 0; i < maxInstances; i += 1) {
    positions[i * 3] = (rnd() * 2 - 1) * spanX;
    positions[i * 3 + 1] = (rnd() * 2 - 1) * spanY;
    positions[i * 3 + 2] = 0;
    phases[i] = rnd();
    depths[i] = rnd();
    rands[i] = rnd();
  }

  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new three.BufferAttribute(phases, 1));
  geometry.setAttribute('aDepth', new three.BufferAttribute(depths, 1));
  geometry.setAttribute('aRand', new three.BufferAttribute(rands, 1));

  return {
    geometry,
    positions,
    phases,
    depths,
    rands,
    setDrawFraction(fraction: number, minCount = 1) {
      const clamped = Math.max(0, Math.min(1, fraction));
      geometry.setDrawRange(0, Math.min(maxInstances, Math.max(minCount, Math.round(maxInstances * clamped))));
    },
    dispose() {
      geometry.dispose();
    },
  };
}

/* ── GLSL: canonical noise library ───────────────────────────
   3D simplex (Ashima) + single-octave-stacked fbm + curl. Sketches
   `#include` this by string concatenation so noise is never
   re-implemented. (Round-1 three-curl-flow keeps its own validated
   inline copy; consolidate later.) */
export const NOISE_GLSL = /* glsl */ `
  vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  // 5-octave fbm in 0..1.
  float fbm(vec3 p){
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      sum += amp * snoise(p);
      p *= 2.02;
      amp *= 0.5;
    }
    return sum * 0.5 + 0.5;
  }

  vec3 snoiseVec3(vec3 x){
    return vec3(
      snoise(x),
      snoise(vec3(x.y - 19.1, x.z + 33.4, x.x + 47.2)),
      snoise(vec3(x.z + 74.2, x.x - 124.5, x.y + 99.4))
    );
  }

  vec3 curlNoise(vec3 p){
    const float e = 0.12;
    vec3 dx = vec3(e, 0.0, 0.0);
    vec3 dy = vec3(0.0, e, 0.0);
    vec3 dz = vec3(0.0, 0.0, e);
    vec3 px0 = snoiseVec3(p - dx); vec3 px1 = snoiseVec3(p + dx);
    vec3 py0 = snoiseVec3(p - dy); vec3 py1 = snoiseVec3(p + dy);
    vec3 pz0 = snoiseVec3(p - dz); vec3 pz1 = snoiseVec3(p + dz);
    float x = (py1.z - py0.z) - (pz1.y - pz0.y);
    float y = (pz1.x - pz0.x) - (px1.z - px0.z);
    float z = (px1.y - px0.y) - (py1.x - py0.x);
    return vec3(x, y, z) / (2.0 * e);
  }
`;

/* ── GLSL: standard uniform block + helpers ──────────────────
   Declares every uniform applyStandardUpdate() drives. A fragment
   shader prepends `varying vec2 vUv;` then this block, then
   NOISE_GLSL, then its own extra uniforms and main(). */
export const STD_UNIFORM_GLSL = /* glsl */ `
  uniform float uTime;
  uniform vec2  uResolution;
  uniform float uPixelRatio;

  // STRUCTURAL musical signals only — no raw per-frame bands/onsets. GPU
  // sketches are smooth and high-fidelity; direct signal makes them jumpy.
  // Drive motion from these slow/structural values plus eased onEvent gestures.
  uniform float uLevel;           // slow (~2.5s) energy envelope — song dynamics
  uniform float uSectionProgress; // 0..1, ratchets up over song sections (persistent)
  uniform float uBeatPhase;       // authored BPM only; < 0.0 when absent

  uniform vec3  uColorBg;
  uniform vec3  uColorMid;
  uniform vec3  uColorA;
  uniform vec3  uColorWarm;

  uniform float uTurbulence;
  uniform float uDensity;
  uniform float uGlow;
  uniform float uDrift;
  uniform float uShimmer;
  uniform float uImpulse;
  uniform float uHueShift;

  uniform vec4  uExclusion;       // left, right, top, bottom (px, top-origin)
  uniform float uExclusionActive;

  // Subtle authored beat pulse; 1.0 (neutral) when no BPM metadata.
  float beatPulse(){
    return uBeatPhase >= 0.0 ? (1.0 + 0.18 * pow(1.0 - uBeatPhase, 3.0)) : 1.0;
  }

  // Keep shader output continuous behind the player. The player panel already
  // has its own dark surface; even gentle shader-side dimming can read as a
  // rectangular artifact on dense or textural sketches.
  float exclusionMask(){
    return 1.0;
  }
`;

/**
 * Film grain + vignette utility. Append after STD_UNIFORM_GLSL in any sketch
 * that wants cinematic depth. Requires no extra uniforms — uses uTime and
 * uSectionProgress from the standard block.
 *
 * Call `applyGrainVignette(col, vUv, grainAmt, vignetteAmt)` at the end of
 * main() before gl_FragColor. grainAmt ~0.03-0.06; vignetteAmt ~0.5-0.8.
 * Both scale down under sections 0-1 so the intro doesn't open on noise.
 */
export const GRAIN_GLSL = /* glsl */ `
  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  // Signed grain in [-1, 1], animated per frame so it never aliases to a
  // static pattern. The floor(uTime * 24.0) quantises to ~24 fps so the grain
  // feels filmic rather than digital shimmer.
  float filmGrain(vec2 uv) {
    float t = floor(uTime * 24.0);
    return (hash21(uv * uResolution + t) * 2.0 - 1.0);
  }

  // Smooth radial darkening. strength=1 gives a moderate cinematic vignette.
  float vignetteStrength(vec2 uv, float strength) {
    float d = length(uv - 0.5) * 1.42;  // 1.42 ≈ corner distance
    return mix(1.0, smoothstep(1.0, 0.0, d), strength);
  }

  // Apply both in one call. grainAmt ~0.03–0.06; vignetteAmt ~0.45–0.75.
  // Both taper in sections 0-1 so the opener isn't gritty from frame zero.
  vec3 applyGrainVignette(vec3 col, vec2 uv, float grainAmt, float vignetteAmt) {
    float sectionEase = smoothstep(0.0, 0.35, uSectionProgress);
    col += filmGrain(uv) * grainAmt * sectionEase;
    col *= vignetteStrength(uv, vignetteAmt);
    return col;
  }
`;

const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** Build the standard uniform object (palette + zeroed structure/params). */
export function createStandardUniforms(three: ThreeModule, palette: Palette, w: number, h: number): Uniforms {
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1;
  return {
    uTime: { value: 0 },
    uResolution: { value: new three.Vector2(w, h) },
    uPixelRatio: { value: dpr },
    uLevel: { value: 0 },
    uSectionProgress: { value: 0 },
    uBeatPhase: { value: -1 },
    uColorBg: { value: paletteVec3(three, palette.bgDark) },
    uColorMid: { value: paletteVec3(three, palette.bgMid) },
    uColorA: { value: paletteVec3(three, palette.accentGlow) },
    uColorWarm: { value: paletteVec3(three, palette.accentWarm) },
    uTurbulence: { value: 0 },
    uDensity: { value: 0 },
    uGlow: { value: 0 },
    uDrift: { value: 0 },
    uShimmer: { value: 0 },
    uImpulse: { value: 0 },
    uHueShift: { value: 0 },
    uExclusion: { value: new three.Vector4(0, 0, 0, 0) },
    uExclusionActive: { value: 0 },
  };
}

/**
 * Push STRUCTURAL signals, params, and exclusion into the standard block.
 * Deliberately NO raw per-frame bands/onsets — Three sketches stay calm and
 * are driven by uLevel (slow envelope), uSectionProgress, beatPhase, and eased
 * events. See THREE_INTEGRATION.md ("Structural Signal Only").
 */
export function applyStandardUpdate(
  uniforms: Uniforms,
  dt: number,
  time: number,
  params: VisualParams,
  audio: AudioSignal,
  exclusion: ExclusionRect,
  palette: Palette,
): void {
  uniforms.uTime.value = time;
  // Slow (~2.5 s) energy envelope — song dynamics without per-frame jitter.
  const k = 1 - Math.exp(-Math.max(0, dt) / 2.5);
  const level = uniforms.uLevel.value as number;
  uniforms.uLevel.value = level + (audio.energy - level) * k;
  // Re-read the (live, in-place mutated) palette each frame so Three sketches
  // follow per-section colour-temperature shifts like every other kernel.
  setVec3(uniforms.uColorBg, palette.bgDark);
  setVec3(uniforms.uColorMid, palette.bgMid);
  setVec3(uniforms.uColorA, palette.accentGlow);
  setVec3(uniforms.uColorWarm, palette.accentWarm);
  // Authored BPM only — never synthesize a clock when beatPhase is absent.
  uniforms.uBeatPhase.value = audio.beatPhase ?? -1;
  uniforms.uTurbulence.value = params.turbulence;
  uniforms.uDensity.value = params.density;
  uniforms.uGlow.value = params.glow;
  uniforms.uDrift.value = params.drift;
  uniforms.uShimmer.value = params.shimmer;
  uniforms.uImpulse.value = params.impulse;
  uniforms.uHueShift.value = params.hueShift;
  const ex = uniforms.uExclusion.value as { set: (a: number, b: number, c: number, d: number) => void };
  const hasExclusion = exclusion.right > exclusion.left && exclusion.bottom > exclusion.top;
  ex.set(exclusion.left, exclusion.right, exclusion.top, exclusion.bottom);
  uniforms.uExclusionActive.value = hasExclusion ? 1 : 0;
}

// Per-section time constants (tau, seconds) for the section progress ratchet.
// Tuned to the musical arc: intro/afterglow are slow and atmospheric; the
// build→peak transition is the sharpest; release exhales quickly then settles.
// Index = sectionIndex received in the section-cue event (0-based, clamped to 4).
const SECTION_TAU: readonly number[] = [
  5.5,  // section 0 → 1: slow atmospheric emergence
  3.2,  // section 1 → 2: deliberate build
  1.8,  // section 2 → 3: energetic snap to peak
  2.4,  // section 3 → 4: quick release drop
  4.8,  // section 4 → 5: long afterglow exhale
];

/**
 * Persistent section-progression ratchet shared by Three sketches. Driven by
 * `section-cue` events; the value rises over the song (never decays) and eases
 * smoothly toward each new target using musically-tuned time constants per
 * section boundary. Feed events via handleEvent(), advance with update(dt),
 * read `.value` to set uSectionProgress.
 */
export function createSectionProgress() {
  let value = 0;
  let target = 0;
  let cueCount = 0;
  let tau = SECTION_TAU[0];
  return {
    get value() { return value; },
    reset() { value = 0; target = 0; cueCount = 0; tau = SECTION_TAU[0]; },
    handleEvent(event: VisualEvent) {
      if (event.type === 'section-cue') {
        const idx = Math.max(cueCount, event.sectionIndex ?? 0);
        cueCount = idx + 1;
        target = Math.min(1, cueCount / 5);
        tau = SECTION_TAU[Math.min(idx, SECTION_TAU.length - 1)];
      }
    },
    update(dt: number) {
      value += (target - value) * (1 - Math.exp(-Math.max(0, dt) / tau));
    },
  };
}

export interface FullscreenScene {
  scene: import('three').Scene;
  camera: import('three').Camera;
  material: import('three').ShaderMaterial;
  geometry: import('three').BufferGeometry;
}

/**
 * Build a fullscreen-quad scene that runs `fragmentShader` over every pixel.
 * The fragment shader receives `varying vec2 vUv` plus the standard uniform
 * block (prepend STD_UNIFORM_GLSL + NOISE_GLSL + sketch uniforms yourself).
 */
export function createFullscreenScene(three: ThreeModule, fragmentShader: string, uniforms: Uniforms): FullscreenScene {
  const geometry = new three.PlaneGeometry(2, 2);
  const material = new three.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, { value: unknown }>,
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    transparent: false,
  });
  const mesh = new three.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new three.Scene();
  scene.add(mesh);
  const camera = new three.Camera();
  return { scene, camera, material, geometry };
}
