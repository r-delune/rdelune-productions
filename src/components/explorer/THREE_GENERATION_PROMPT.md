# Three Generation Prompt — /productions

Use this as the primary handoff for any Hermes/LLM session generating new `/productions` visuals.

## Operating Contract

- Three.js/WebGL is the primary path for new visual work. Canvas2D/q5 kernels are legacy-kept and may be maintained, but new Canvas2D sketches need a specific reason.
- Preserve the existing runtime shape: `Visualizer` lifecycle → `createThreeVisualizer` → shared `threeHost` → tuning → recipe → storyboard/plan.
- Add one production-ready recipe per cycle. Prefer shared-helper improvements before more kernels.
- Hermes/autonomous runs must follow repo-root `HERMES.md`: one budgeted cycle, one branch, no direct `main` push, no deploy without the configured gate.
- Do not add rendering libraries, postprocessing frameworks, runtime FFT/DSP, BPM detection, onset detection, or synthetic beat clocks.
- The aesthetic is moody, textural, deep, section-responsive, organic, readable around the player UI, and nonblank at rest.

## Read First

1. repo-root `HERMES.md` when running as Hermes/autonomous agent
2. `CLAUDE.md`
3. `AGENT_GUIDE.md`
4. `THREE_INTEGRATION.md`
5. `VISUAL_SYSTEM.md`
6. `VISUAL_REPERTOIRE.md`
7. `VISUAL_LEDGER.md`
8. Existing Three kernels in `visualizers/three-*.ts`

## Technique Menu

Choose one technique gap from `VISUAL_LEDGER.md`; do not create a denser duplicate of an existing family.

- Fullscreen shader material: caustics, material surfaces, light fields, fog sheets.
- Raymarch/SDF: volumetric fog, restrained core forms, depth tableaux.
- Instanced fields: curl-flow particles, ribbon fields, star/dust structures.
- Ping-pong FBO feedback: image-mangling, reaction/erosion, displacement memory.
- Artwork texture flux: CORS-clean album art sampled as material, never as a literal slideshow.
- Displacement/refraction: water/glass/smear surfaces driven by structural song state.
- Fresnel/bloom: sparse focus/outro forms, restrained and scene-like.

## Required Helpers

- `createThreeVisualizer()` owns async Three loading, fallback painting, reduced-motion freeze, context-loss rebuild, and the final 2D blit.
- `threeHost.render()` renders the final scene to the shared WebGL canvas.
- `threeHost.renderToTarget()` renders scene-owned FBO passes and restores the default target.
- `createStandardUniforms()` + `applyStandardUpdate()` wire palette, slow level, params, exclusion, and authored beat phase.
- `createSectionProgress()` turns `section-cue` events into a persistent 0..1 song arc.
- `createFullscreenScene()` builds a fullscreen quad.
- `createPingPong()` creates paired `WebGLRenderTarget`s with `resize()`, `swap()`, and `dispose()`.
- `createInstancedField()` creates reusable point attributes: `position`, `aPhase`, `aDepth`, `aRand`.
- `loadArtworkTexture()` returns a scene-owned WebGL texture only for CORS-clean cached artwork; handle `null` with a palette/noise fallback.

## Kernel Checklist

- Implement `ThreeScene`, not `Visualizer` directly.
- Keep `build()` idempotent and allocate all GPU resources there.
- Push uniforms in `update()`; only use optional `preRender()` for scene-owned offscreen FBO passes.
- Drive scene arcs from section cues, visual events, storyboard role, slow `uLevel`, and authored beat phase only.
- Respect `exclusionMask()` or equivalent UI avoidance.
- Use `renderScale`, dynamic loop bounds, `getQualityScale()`, or draw ranges for expensive work.
- Dispose every geometry, material, texture, render target, and buffer in `dispose()`.

## Registration

Wire new recipes through:

1. `visualizers/<kernel>.ts`
2. `visualizers/registry.ts`
3. `tuning.ts`
4. `runtime/recipes.ts`
5. `runtime/plans.ts`
6. `VISUAL_LEDGER.md` worklog and coverage

Artwork/image-mangling recipes must be marked image-dependent through `isImageDependentRecipe()` and must not enter opener pools. Use generated accent/mid-section pools only.

## Verification

- Run `npm run lint` and `npm run build`.
- Review with `npm run dev:productions`, open `/productions?lab=1`, press `M`, and preview the recipe by ID.
- Confirm fallback while Three/artwork loads, reduced-motion static frame, player readability, no opener use for image-mangle recipes, quality governor near `1.0`, and flat memory after repeated track/album switches.
- Confirm no top-level runtime `three` imports outside the adapter/Three kernels.

## Anti-patterns

- Shader demos without a five-section arc.
- More particle density without a new mood, technique, or scene role.
- Direct raw audio-band jitter as the visual identity.
- Synthetic beat clocks for tracks without authored BPM.
- FBOs or textures that are not disposed.
- CORS-unsafe artwork texture uploads.
- EffectComposer/postprocessing imports.
- Adding a kernel when a tuning preset or recipe would express the idea.
