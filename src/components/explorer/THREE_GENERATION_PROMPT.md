# Three Generation Prompt — /productions

Use this as the primary handoff for any Hermes/LLM session generating new `/productions` visuals.

## Step 0 — Concept Gate (Three.js kernels only, required before any code)

Before touching a file, complete this gate. It costs ~$0.02 on the cheap model and prevents spending a full cycle budget on an unambitious visual.

1. **Open `THREE_VISUAL_CONCEPTS.md`** (same directory). Read all 8 concepts.
2. **Pick a concept** that fills the highest-priority gap in `VISUAL_LEDGER.md`. Do not pick a concept in the same technique family as an existing kernel unless the scene role is clearly distinct.
3. **Write the concept pitch** — 3 sentences:
   - "At t=5s, the viewer sees ..."
   - "At the section peak, ..."
   - "A viewer with no context would feel they are observing ..." (must name a world/place/ecosystem — a landscape, weather event, body of water, creature colony, deep-space environment. Fail if the honest answer is a shape or pattern name: "a glowing orb," "a noise grid," "a ring," etc.)
4. **Apply the Concept Pitch Test:** if any sentence contains "a glowing circle," "a noise texture," or "particles moving" with no further scene detail — it fails. Also fail if the third sentence cannot name a world or living system. Pick again.
5. **Score against the Aesthetic Rubric** in `VISUAL_LEDGER.md`. Must hit ≥ 8/10.
6. If the pitch fails or scores < 8, stop. Pick a different concept or propose a new brief in `THREE_VISUAL_CONCEPTS.md` at the same richness level.
7. Only proceed to implementation once the pitch passes.

---

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
4. `THREE_VISUAL_CONCEPTS.md` — concept briefs and the concept pitch test (required before implementation)
5. `THREE_INTEGRATION.md`
6. `VISUAL_SYSTEM.md`
7. `VISUAL_REPERTOIRE.md`
8. `VISUAL_LEDGER.md`
9. Existing Three kernels in `visualizers/three-*.ts`

## Technique Menu

Choose one technique gap from `VISUAL_LEDGER.md`; do not create a denser duplicate of an existing family.

**Preferred (under-used — bias toward these):**
- **Raymarch / volumetric depth** — depth-fog corridors, god-ray slabs, near-still atmospheric tableaux. Adds genuine scene depth.
- **Height-field terrain** — silhouette ridges, displacement surfaces with parallax layers. Fills Landscape gap with scene-like results.
- **SDF lattice / wireframe** — sparse geometric structures, edge-glow, Fresnel on struts. Fills Grid/Structure gap elegantly.
- **Particle ribbons / billboard quads** — sparse vertical columns, ribbon trails, billboard alpha quads. Distinct from point-cloud instanced fields.

Other available techniques:
- Fullscreen shader material: caustics, material surfaces, light fields, fog sheets.
- Instanced point fields: curl-flow, star/dust structures (use sparingly — this family is well-covered).
- Ping-pong FBO feedback: reaction/erosion, diffusion, displacement memory.
- Artwork texture flux: CORS-clean album art sampled as material, never as a literal slideshow.
- Displacement/refraction: water/glass/smear surfaces driven by structural song state.

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

**Banned shortcuts — these will fail the concept gate and the aesthetic rubric:**
- **Fullscreen SDF sphere as the primary form** — `three-fresnel-core` already covers this. A new kernel that is "an orb / core / circle with glow" is a duplicate.
- **Flat noise material with only palette colour as variation** — `three-flat-material` already covers grain/sediment texture. A new kernel that is "noise + palette colour on a quad" is a duplicate.
- **Caustic-style domain-warp copied to a new palette** — `three-caustics` already covers refractive shimmer. Changing the colour does not make it a different visual.
- **Uniform particle grid** — evenly spaced points on a plane, even animated, reads as a UI diagram. Not atmospheric.
- **Particle count increase as a new visual** — more points in the same technique family is not a new recipe.

Other anti-patterns:
- Shader demos without a five-section arc.
- Direct raw audio-band jitter as the visual identity.
- Synthetic beat clocks for tracks without authored BPM.
- FBOs or textures that are not disposed.
- CORS-unsafe artwork texture uploads.
- EffectComposer/postprocessing imports.
- Adding a kernel when a tuning preset or recipe would express the idea.
