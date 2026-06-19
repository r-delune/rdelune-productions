# Three.js Integration

Working contract for adding WebGL (Three.js) visualizers to the `/productions` sketch rotation.

Read `THREE_GENERATION_PROMPT.md`, `VISUAL_SYSTEM.md`, and `VISUAL_REPERTOIRE.md` first. This document covers the WebGL adapter and production constraints. Everything else — recipes, tuning, plans, the mood lab, and the LLM implementation contract — applies unchanged.

## Stack Policy

`CLAUDE.md` declares Three.js/WebGL as the primary path for new `/productions` visuals, with existing Canvas2D/q5 kernels legacy-kept. Three is still deliberately contained behind this adapter. The policy holds only if:

- WebGL stays behind the adapter described here. Raw Three.js code never appears in `runtime/`, `recipes.ts`, `plans.ts`, or any kernel that is not a Three visualizer.
- Three is lazy-loaded so the initial `/productions` payload is unaffected.
- A Three recipe degrades to a stable Canvas2D fallback frame when WebGL is unavailable or the context is lost.

If a change cannot meet those rules, it is an experiment, not a production visual.

The contract must keep reading as "Three-primary for new visuals, behind the adapter; Canvas2D legacy-kept" so future agents neither treat WebGL as forbidden nor casually bypass the lifecycle.

## Why Integration Is Clean

Visualizers do not render to the screen. Each `Stage` owns its own offscreen 2D `buffer` canvas, and `viz.draw(q, ctx)` writes into that buffer's 2D context (`ExplorerCanvas.tsx`, `instantiateStage` / `renderStage`). The main loop then composites the buffer onto the q5 canvas with crossfade, material overlay, cue washes, exclusion handling, and the quality governor layered on top.

A Three visualizer therefore never touches the screen or the q5 canvas. It renders its scene to a WebGL canvas, then **blits the result into the stage's 2D buffer**:

```ts
draw(q: any, ctx: CanvasRenderingContext2D): void {
  threeHost.render(this.scene, this.camera, this.width, this.height);
  ctx.drawImage(threeHost.domElement, 0, 0, this.width, this.height);
}
```

That single `drawImage` is the entire bridge. Crossfades, material overlays, cue tints, exclusion-zone readability, the 45fps/18fps throttle, and the zero-touch quality governor all keep working with **no changes** — they operate on the buffer and do not care how the pixels arrived.

## Architecture

### One shared renderer (`three-host.ts`)

Browsers cap live WebGL contexts (~16) and the explorer creates/destroys stages on every track and section change. A context-per-stage design would exhaust contexts and crash. Instead, a module-level singleton owns a **single `WebGLRenderer` + one canvas**. Each visualizer holds only a lightweight `Scene` + `Camera`.

During a crossfade the loop renders active then outgoing sequentially in the same frame. With a shared host this is render A → blit A → render B → blit B; each `drawImage` snapshots the host canvas before the next render overwrites it, so two live Three stages are safe.

Responsibilities of the host:

- Lazy-load Three (see below) and expose a `ready` flag.
- Own the renderer, resize it to the requested stage size before each render, and clear per render.
- `render(scene, camera, w, h)` and a `domElement` getter for the blit.
- Survive context loss: listen for `webglcontextlost`, mark itself not-ready, and let kernels fall back. Recover on `webglcontextrestored`.
- Never own a `requestAnimationFrame` loop. Rendering is pull-driven by the explorer's draw loop only.

### Base adapter (`createThreeVisualizer`)

A factory that implements the full `Visualizer` lifecycle and the blit, so individual sketches only write scene code — mirroring how `cong-generative-particles` centralizes particle logic and keeps recipes declarative.

```ts
interface ThreeScene {
  build(host, w, h, palette, tuning, context): void;     // create geometry/materials/uniforms
  update(dt, params, audio, exclusion): void;            // push uniforms; no rendering
  onEvent(event): void;                                  // color-morph, density-surge, etc.
  resize(w, h): void;
  preRender?(): void;                                    // optional scene-owned FBO passes
  dispose(): void;                                        // free GPU resources
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
}

export function createThreeVisualizer(makeScene: () => ThreeScene): Visualizer;
```

The adapter:

- **Reconciles async readiness against a sync `setup`.** `viz.setup(...)` is synchronous, but Three loads async. `setup` records dimensions/palette/tuning/context and marks the scene "not built." `draw` lazily calls `scene.build(...)` the first time `threeHost.ready` is true. `build` must be **idempotent** — calling it again after a no-op resize must not duplicate geometry — and the adapter must guard against the race where the module resolves *after* `destroy` has run (check a `disposed` flag before building; never build into a torn-down stage).
- Until the scene is built (or if WebGL is unavailable), `draw` paints a stable non-blank fallback frame from the palette — never blank.
- In `draw`, renders the scene through the host and blits into `ctx`.
- In reduced-motion mode, freezes scene time and renders a single coherent still frame.
- In `destroy`, sets `disposed`, calls `scene.dispose()`, and disposes every geometry, material, texture, and render target. GPU memory is not garbage-collected — leaks here are fatal over a long rotation.

### Lazy loading

**Decision: `import('three')`, not a script tag.** The repo does not currently depend on Three. Add `three` (and `@types/three`) as a dependency and load it with a dynamic `import('three')` inside `three-host.ts`, triggered when the rich runtime mounts. This is more idiomatic for the Next.js build than vendoring a `/public` asset and lets the bundler split Three into its own chunk.

A script-tag approach (the q5 precedent in `useQ5.ts`) is the fallback only if the dynamic import cannot be made to split cleanly — and it would require a pinned local/vendor asset, not a CDN, to keep the static export self-contained.

Acceptance gate for this decision: **verify via `npm run build` output that Three lands in a separate chunk and is absent from the initial `/productions` payload.** If it does not split, fix the import boundary before proceeding. Three recipes render the fallback frame until the module resolves, which keeps the default load lean and keeps `output: 'export'` client-only and happy.

## Signal Mapping

WebGL kernels consume the same inputs every other kernel gets — translate them to uniforms:

| Source | Maps to |
| --- | --- |
| `VisualParams` (turbulence, density, glow, drift, shimmer, impulse, hueShift) | shader uniforms; scale particle count / raymarch steps off `density` |
| Section cues, storyboard roles, visual steps, and transitions | primary scene-state arc: depth, reveal, density, light direction, palette temperature, clearing, afterglow |
| `VisualEvent` via `onEvent` (color-morph, density-surge, spark-burst, …) | authored gestures and eased uniform targets |
| `beatPhase` / `barPhase` / `beatPulse` (authored-BPM tracks only) | subtle pulse or phase alignment — **never** synthesize a clock when absent |
| `AudioSignal` energy/bands/onsets | optional smoothed accents only; never the visual identity |
| `Palette` | material/uniform colors at `build`; re-read on `color-morph` |
| `ExclusionRect` | a darken/avoid uniform so the player panel stays readable |
| reduced motion | freeze time, hold a stable frame |

Honor the low-audio-processing design decision: no runtime tempo estimation, no new FFT/DSP, no synthetic beat clocks.

## Song Structure First

A WebGL sketch that ignores the song is an experiment, not a production visual. Every production Three sketch should be able to run as one recipe across a track and develop through section cues, storyboard roles, visual steps, transitions, and authored `visual_events`.

- Section changes and `onEvent` handlers should alter sketch-owned scene state, not just trigger a global flash: fog depth and clearing, caustic scale/refraction, light angle, palette temperature, core visibility, density, bloom, and afterglow are the intended levers.
- `beatPhase`/`barPhase`/`beatPulse` are read **only when authored** (the track carries BPM). The standard block forwards `uBeatPhase = -1` otherwise, and the shader helper `beatPulse()` returns a neutral `1.0` in that case.
- The shared `Visualizer` interface still passes `AudioSignal`, but Three sketches should treat it as supporting material: a slow level envelope (`uLevel`) or small accent, not the structural driver. Do not add sketch-local FFT, onset analysis, BPM detection, or fake clocks.

`visualizers/three-scene-helpers.ts` makes this the path of least resistance: `createStandardUniforms()` + `applyStandardUpdate()` plumb slow `uLevel`, persistent `uSectionProgress`, authored `uBeatPhase`, params, palette, and exclusion into a uniform block, and `STD_UNIFORM_GLSL` declares them (plus `beatPulse()` and `exclusionMask()`). Start there for any fragment-shader sketch.

## GPU Patterns

Patterns that get the most out of the GPU within this architecture:

- **Fullscreen-quad fragment shaders** (fog, caustics): build with `createFullscreenScene(three, fragmentShader, uniforms)`. The fragment shader receives `varying vec2 vUv` and prepends `STD_UNIFORM_GLSL` + `NOISE_GLSL` + its own extra uniforms. One draw call, no geometry to manage.
- **Quality is scaled by a dynamic loop bound, not a recompile.** Step/layer/iteration counts are baked as a `#define MAX_*` ceiling; set a `uSteps`/`uLayers` uniform each frame to `round(MAX * getQualityScale())` and gate the loop `for (int i=0;i<MAX;i++){ if (float(i) >= uSteps) break; … }`. Scale only the frame-local snapshot — never persistent state (`render-quality.ts`).
- **Instanced point clouds** (flow-field): one `BufferGeometry` allocated at max count once; vary `geometry.setDrawRange(0, count)` per frame off `density * getQualityScale()`. Stateless per-instance advection in the vertex shader avoids per-frame attribute re-upload and FBO ping-pong.
- **Shared instancing scaffold**: use `createInstancedField()` for point attributes (`position`, `aPhase`, `aDepth`, `aRand`) so future instanced kernels do not reimplement seed/attribute setup.
- **Heavy per-pixel sketches render at reduced resolution.** A `ThreeScene` may expose `renderScale` (0..1); the adapter renders the GL at `w*scale × h*scale` and the 2D blit upscales to the full buffer (keep `uResolution` at full size so aspect/exclusion stay correct). Raymarched fog runs at `0.5` — soft output hides the upscale and it costs ~4× less. Pair with cheap noise (3-octave, single-octave light) and a low step ceiling; a full-res 5-octave raymarch will stall playback.
- **Reuse `NOISE_GLSL`** (simplex + fbm + curl) — do not re-implement noise per sketch.
- **True stateful sims** (fluid, reaction-diffusion, artwork feedback) use scene-owned FBO ping-pong render targets. Build them with `createPingPong()`, render offscreen passes with `threeHost.renderToTarget()` from `preRender()`, size them on resize, and dispose them in `dispose()`.
- **Artwork textures**: use `loadArtworkTexture()`. It only returns a texture for CORS-clean cached artwork; sketches must keep a palette/noise fallback for loading, missing, or CORS-unsafe artwork.
- **We deliberately avoid the postprocessing `EffectComposer`** for now: it breaks the single-host `render(scene, camera, w, h)` model and adds bundle weight. Fake bloom/glow with additive terms inside the fragment shader (or, later, a scene-owned second pass) rather than pulling `three/examples/jsm/postprocessing`.

## WebGL Technique Catalogue

| Technique | Kernel | Repertoire gap | Status |
| --- | --- | --- | --- |
| GPU instanced curl flow-field | `three-curl-flow` | Landscape/lateral current at GPU density | ✅ shipped |
| Raymarched volumetric fog | `three-volumetric-fog` | Atmosphere "fog sheets" + Texture "non-particle material" | ✅ shipped |
| Shader water caustics | `three-caustics` | Water/Tide caustic | ✅ shipped |
| Artwork texture feedback | `three-artwork-flux` | Texture/image-mangling accent | ✅ shipped |
| Fresnel + bloom core form | retired | Orbit/Core "quieter core forms" + Light "soft bloom" | Removed after review; central orb form failed the world/ecosystem test |
| Procedural material surface | `three-flat-material` | Texture grain/erosion/cellular surface | ✅ shipped |
| Light-only GPU scene | `three-light-rays` | Glints/rays/bloom without dense particles | ✅ shipped |
| Near-still volumetric tableau | `three-sparse-veil` | Sparse Minimal outro/low-energy tableau | ✅ shipped |
| Reaction-diffusion FBO sim | `three-reaction-diffusion` | Stateful organic Turing/cellular texture | ✅ shipped |
| GPU fluid advection | — | Velocity-field smoke/ink trail material | open |

## Registration

Identical to a native kernel. A new Three sketch touches:

1. Kernel file in `visualizers/`, built with `createThreeVisualizer`.
2. `visualizers/registry.ts` — name added to the `VisualizerName` union and the `FACTORIES` map.
3. `tuning.ts` — interface, preset, and resolver entry.
4. `runtime/recipes.ts` — a recipe choosing the kernel, tuning key, base params, and scene profile.
5. **Rotation enrollment is by flags, not by editing a list.** The recipe enters the live rotation simply by
   being `productionReady` (default) + `randomEligible` (default `true`) + not globally disabled —
   `listRandomRecipeIds` derives the deck from those flags. `GENERATIVE_VARIETY_SEQUENCE` is only a fallback
   ordering; you do **not** need to add to it. Image-dependent recipes auto-route to the mosh accent pool
   (never opener). `npm run check-rotation` (in `npm run verify`) fails if a finished recipe is unreachable.

Reviewable by recipe ID in the localhost `M` mood lab. Recipes must be production-ready, random-eligible, globally enabled, locally visible, and non-image-based to qualify for the automatic deck.

## Visual Direction

Target what Canvas2D cannot do and which fills documented repertoire gaps, rather than re-skinning existing particle moods:

- **GPU instanced flow-field** — 100k–500k instanced points on a curl-noise field, far past the CPU particle budget. Extends the lateral/landscape-current family at a density that reads as genuinely new.
- **Raymarched volumetric fog / cloud** — true depth and light scattering in a fragment shader. Fills the Texture gap ("non-artwork material texture that is not another mosh or particle field") and the Atmosphere family at a quality Canvas2D fog cannot reach.
- **Shader caustics / water surface** — fills the explicit Water/Tide caustic gap with refractive shimmer.
- **GPU fluid advection** — the next open GPU technique: ping-pong velocity/density fields that read as smoke or ink trails, not another noise-scroll material.
- **Shared section easing + GLSL finish utilities** — cross-kernel upgrades that make existing Three scenes feel more musical and cinematic without adding new visual families.

Each maps to one new recipe and one repertoire role. Add a clear family, not sketch sprawl.

## Storyboard Priorities

Three recipes should behave like reusable song chapter systems, not isolated shader loops. A strong WebGL recipe can carry a whole track by changing scene state across sections: depth, reveal, concealment, pressure, release, light direction, color temperature, and afterglow.

For the current repertoire, prioritize:

1. **Volumetric fog / cloud** — best flagship for the song-storyboard model because it can move from suspended intro to pressured build, luminous reveal, and clearing afterglow. It expands Atmosphere and non-artwork Texture.
2. **Water caustics / surface light** — best second family for reflective, glassy, liquid, or tide-like middle chapters. It expands Water/Tide without becoming a waveform visualizer.
3. **Fresnel bloom core** — best as sparse/minimal, outro, or focus material. Keep it quiet and scene-like so it does not collapse into a generic central orb.

Flow fields remain valid when they prove a distinct storyboard role, but avoid adding one only because WebGL can draw more particles. WebGL should expand the visual vocabulary of songs, not just densify existing Canvas2D families.

## Risks

- **Blit stalls.** Per-frame `drawImage(webglCanvas)` can force a GPU→CPU sync in some browsers. Measure on the target hardware early; if it stalls, investigate keeping the result GPU-side.
- **Quality governor.** Scale particle counts / raymarch steps / resolution off `getQualityScale()` each frame. Scale the frame-local snapshot only — never mutate persistent lerp targets (`render-quality.ts`).
- **Context loss — chosen behavior, not assumed.** `recoverStage` only catches *thrown* errors. A context loss that merely flips `threeHost.ready = false` will not trigger it; the adapter would otherwise paint the fallback frame forever. The deliberate policy: on `webglcontextlost`, the host marks itself not-ready and the adapter shows the fallback frame; on `webglcontextrestored`, the host re-initializes and every live Three scene rebuilds (via the idempotent `build` path) on its next `draw`. The adapter does **not** throw to force `recoverStage` for context loss — `recoverStage` remains reserved for genuine setup/render exceptions.
- **GPU memory.** Dispose everything in `destroy`. Verify with a long rotation that memory is flat.
- **Bundle / SSR.** Three is client-only and lazy-loaded; it must never be imported at module top-level in anything that runs during static export.

## First Slice

Ship the smallest reviewable unit before scaling:

1. `three-host.ts` (shared renderer + lazy load + context-loss handling).
2. `createThreeVisualizer` adapter.
3. One flagship sketch — recommended: the GPU instanced flow-field (highest impact per line, clearly outside Canvas2D's reach).
4. One recipe + one pool slot, reviewed in the `M` lab.

The instanced flow-field is only the right first sketch **if it is actually measured on target devices** — it is exactly where buffer allocation, per-frame attribute updates, and `drawImage` sync costs bite. Gate the slice on evidence, not vibes:

- frame-time on target hardware stays within the existing 45fps playing budget (use the same `reportFrame` path the quality governor reads);
- Three splits into its own chunk and is absent from the initial `/productions` payload;
- GPU memory is flat across a long rotation with repeated track/section switches (no per-stage context leak, no undisposed geometry);
- context loss shows the fallback and recovers on restore.

Only after this one recipe proves lifecycle, bundle, memory, and frame-time behavior do additional WebGL visualizers get greenlit — one recipe at a time. Run `npm run lint` and `npm run build` before review.
