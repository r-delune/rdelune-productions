# Visual Ledger — Continual Improvement & Diversity System

> The living work queue for the `/productions` visual system. An autonomous agent (or a human) pulls the
> single highest-value item from here each cycle, does the work, self-reviews against the rubric, verifies,
> and logs it back. The goal is a repertoire that **keeps improving and stays diverse** — not append-only
> growth and not over-building one mood.
>
> Read **`AGENT_GUIDE.md`** first for the aesthetic, the audio rule, and the render paths. Hermes/autonomous
> work also reads repo-root **`HERMES.md`** for budget, branch, deploy, and `/goal` rules. This file is the
> *what to do next* and the *did I do it well*.

---

## Per-cycle protocol

1. **Ground in the operating contract.** Hermes reads `HERMES.md`, starts a per-cycle `/goal` when supported,
   and confirms the expected token/spend risk before editing.
2. **Ground in the aesthetic.** Read `AGENT_GUIDE.md` §1–§3 (aesthetic, toolkit, audio rule).
3. **Check the current cycle mode** (set by the owner — do not override):
   > **Current mode: OPEN** — improvement candidates cleared; new kernels may ship freely. Prioritise new-visual queue first, then continue improvement if you notice regression.

   Within improvement mode, pick the highest-priority candidate and the most needed improvement dimension. Do not pick the same dimension consecutively.

4. **Do the work.** Improvement → follow the Improvement Protocol below. New (only when mode allows) → follow `THREE_GENERATION_PROMPT.md` + `THREE_INTEGRATION.md`. Canvas2D work is legacy maintenance only.
5. **Self-review** against the **Aesthetic Rubric** below. Fail any line → revise and re-review. Don't ship a
   sketch that fails the rubric.
6. **Verify** with `npm run verify` (lint + `check-rotation` reachability + build) plus `AGENT_GUIDE.md` §8 and `HERMES.md` deploy gates (mood lab `M`, governor ~1.0, reduced-motion, no console errors). A finished sketch enters rotation by flags (`productionReady` + `randomEligible`), not by editing `GENERATIVE_VARIETY_SEQUENCE`; `check-rotation` fails if a finished recipe is unreachable.
7. **Log & rebalance.** Append a **Worklog** entry, update the **Coverage Map**, and add any new improvement
   candidates you noticed while working.

### Improvement Protocol (revisiting an existing sketch)
- Keep the recipe ID stable unless you're deliberately retiring it (note retirements in the ledger).
- **Pick one dimension from the Improvement Techniques table below.** State which dimension, and what the before/after difference will be. One clear win per cycle beats a vague rewrite.
- A/B the before/after in the mood lab; confirm the governor isn't worse and memory stays flat.
- Record before → after in the Worklog so the trajectory is auditable and the work isn't redone.

### Improvement Techniques (rotate through these — do not repeat the same dimension twice in a row)

These are the only valid improvement targets. Each addresses a specific failure mode seen in the current Three.js sketches. Track which has been applied last in the Worklog.

| Dimension | What to fix | Failure mode it corrects |
|---|---|---|
| **Section arc depth** | Scene *structure* changes between sections — new elements appear, depth separates, composition shifts. Not just brightness/scale tweaks. | "Looks the same throughout the track" |
| **Event reactivity** | At least one `visual_event` type triggers a distinct, visible scene moment — not a nudged float. `color-morph` should cascade; `intensity-peak` should restructure something. | "Events do nothing noticeable" |
| **Motion quality** | Motion reads as *intentional* — rising, condensing, dispersing, orbiting. Replace uniform noise scroll with directed motion that has a clear quality and speed. | "It just slowly moves / noise scrolling" |
| **Depth & parallax** | Add a foreground / background separation or depth cue. Layers at different Z, parallax shift, near-vs-far contrast. Fullscreen flat materials fail this. | "Completely flat, no sense of space" |
| **Colour & mood range** | Palette responds to section role and mood tuning with range. Section 1 should feel tonally different from section 3 — not just a brightness knob. | "The colour barely changes" |
| **Performance headroom** | Identify and fix one per-frame allocation, gradient churn, or unbounded loop. Confirm governor holds ≥ 0.95 under load. | "Governor drops under complex tracks" |

---

## Coverage Map (diversity ledger)

Families mirror `VISUAL_REPERTOIRE.md`. Update counts/gaps as work lands. `+` = healthy, `~` = thin, `!` = gap.

| Family | State | Current coverage | Open gap |
|---|---|---|---|
| Atmosphere | + | `cong-cloud-orbit`, `cong-cloud-again-intro-generative`, `native-aurora-veil`, `three-volumetric-fog` | — |
| Landscape | + | `cong-contour-lines` (merged ridge/glint ideas), `cong-landscape-flow`, `cong-landscape-og-current`, `cong-horizon-field` (review-ready) | — |
| Weather | + | `cong-rain-shower`, `cong-top-bottom-storm`, `native-sidewind-drift` | — |
| Water / Tide | + | `cong-waterline-shimmer`, `three-caustics` | — |
| Texture | + | native overlays/grain; `cong-artwork-datamosh-rain-evolution` (legacy restrained accent); `three-artwork-flux` (artwork feedback); `three-volumetric-fog` (partial); `three-flat-material` | continue tuning procedural surfaces against fog/artwork overlap |
| Light | + | `three-light-rays` (god-rays + motes), `grid-rays`, `random-chords` overlays | — |
| Linework | ~ | `cong-contour-lines` | non-cloud linework family still open |
| Grid / Structure | ! | `grid-rays` overlay | **!** `cong-grid-pulse` (restrained tile/grid pulse) from `derkdisco` |
| Orbit / Core | + | `cong-planet-core`, `native-gravity-current`, `three-fresnel-core` | — |
| Sparse Minimal | + | `three-sparse-veil` (near-still volumetric mist), `three-fresnel-core` | — |

When a technique is confirmed/retired, also reflect it in `cong/ledger.ts` (`reviewState`, `archiveStatus`).

---

## Technique Coverage

Rotate GPU techniques so the repertoire does not become only fullscreen fragment shaders.

| Technique | State | Current coverage | Next pressure |
|---|---|---|---|
| Fullscreen shader material | + | `three-caustics` | Avoid duplicate caustic/noise demos |
| Raymarch / volumetric | + | `three-volumetric-fog` | Near-still outro tableau |
| Instanced field | + | `three-curl-flow` | Only add if the scene role differs clearly |
| Ping-pong FBO feedback | + | `three-artwork-flux`, `three-reaction-diffusion` | Fluid advection still open if a second stateful material is needed |
| Artwork texture sampling | + | `three-artwork-flux` | Keep accent-only; never opener |
| Fresnel / SDF / core form | + | `three-fresnel-core` | — |
| Light-only GPU scene | + | `three-light-rays` | — |
| Reaction-diffusion (Gray-Scott) | + | `three-reaction-diffusion` | Continue tuning against flat material/fog overlap |
| GPU fluid advection | ! | — | **Highest-priority new technique** — velocity-field ping-pong; drives particle trails like smoke/ink; far more organic than noise-driven motion |
| Section easing curves (shared helper) | ! | — | All kernels lerp linearly to section progress; a `createSectionEasing(role)` helper would make all transitions feel musical |
| Film grain / vignette utility (shared) | ! | — | ~5 GLSL lines; cinematic depth uplift across all Three kernels; build once, import everywhere |

---

## New-Visual Queue (prioritized)

Seeded from `VISUAL_REPERTOIRE.md` declared gaps + "Next Batch". Prefer Three-first rendering structures over more particle presets.

1. ~~**Fresnel bloom core**~~ — ✅ shipped as `three-fresnel-core` (2026-06-18)
2. ~~**Flat material texture**~~ — ✅ shipped as `three-flat-material` (2026-06-19)
3. ~~**Light-only recipe**~~ — ✅ shipped as `three-light-rays` (2026-06-19)
4. ~~**Near-still volumetric tableau**~~ — ✅ shipped as `three-sparse-veil` (2026-06-19)
5. ~~**Reaction-diffusion surface**~~ — ✅ shipped as `three-reaction-diffusion` (2026-06-19)

Next foundation/tech priorities:

1. **GPU fluid advection** — velocity-field ping-pong for smoke/ink trails.
2. **Shared section easing curves** — musical role-based easing helper for all kernels.
3. **Shared GLSL film grain/vignette utility** — one importable cinematic finish for Three kernels.
4. **Legacy Canvas2D maintenance** — `cong-grid-pulse` only when the cycle is explicitly maintenance.

Creative-prototype track (from `VISUAL_REPERTOIRE.md` New Sketch Baseline, building off `cong-lateral-current`):
`cong-symmetry-particles` → recursive/tree growth → snowflake field → Mandelbrot/Julia (once perf & AA are clear).

---

## Improvement Candidates (revisit existing sketches)

Running list of existing sketches worth a better version. Add to this whenever you notice one; remove when done
(log it in the Worklog).

All five Three.js improvement candidates cleared 2026-06-19. See Worklog.

All retirement candidates cleared 2026-06-19. See Worklog.

Look for additional candidates: sketches that read denser-than-deep, weak/absent five-section arcs, per-frame allocation or noise-cost hotspots, gradients/`fillStyle` churn, aesthetic drift (mechanical motion, diagrammatic geometry, off-tone color), or anything that blanks under reduced motion.

---

## Aesthetic Rubric (self-score every cycle — all must pass)

- [ ] **Moody & tonal** — dark, controlled glow; tonal color jitter, not random RGB; not chaotic/cheerful.
- [ ] **Landscape depth** — depth planes / horizon / parallax; not flat or diagrammatic.
- [ ] **Intricate at rest** — looks beautiful with no audio playing.
- [ ] **Organic, not mechanical** — curves over lines, drift over bounce; no concentric rings / target pulses /
      un-jittered grids.
- [ ] **Section arc present** — a five-section internal arc; the scene *structure* (not just brightness or scale) changes between section 1 and section 3. A viewer watching section 1 vs section 3 should feel a different scene, not just a different brightness.
- [ ] **Audio as accent, not clock** — reacts generously to `AudioSignal`; no analysis/DSP/synthetic beat clock.
- [ ] **Reduced-motion safe** — stable, nonblank frame with `dt = 0`.
- [ ] **Readable around player UI** — respects the exclusion rect.
- [ ] **Adds diversity** — fills a family/technique/mood gap; not a denser duplicate of an existing family.
- [ ] **Performant** — governor holds ~1.0; uses `getParticleBudget`/`fbm`; frees buffers in `destroy`/`dispose`.
- [ ] **Visually surprising** — a first-time viewer would ask "what is that?" within 3 seconds. If the concept can be summarised as "a glowing circle" or "a noise texture," it fails this line.
- [ ] **Perceivable section arc** — the visual at section 1 and section 3 look and feel meaningfully different (different density, brightness, form, or depth — not just slightly brighter).
- [ ] **Technique is distinct** — the core GPU technique is not already used by an existing Three.js kernel (or if it is, the scene role is clearly and specifically different — state why).
- [ ] **World/ecosystem presence** — reads as a place or living system, not an abstract pattern. A viewer with no context should feel spatially located (inside a landscape, weather event, body of water, creature colony, space environment) — not watching a visualizer or abstract animation.
- [ ] **Particle entrance arc** — for particle/field/instanced visuals: sparse in section 1 (elements arriving or waking), accumulating through sections 2–4, dispersing or stilling in section 5. Never at uniform density from frame 0.

---

## Worklog (append-only)

Newest first. Format: `YYYY-MM-DD · new|improvement · <recipe/kernel> · <one-line outcome>`.

- 2026-06-19 · improvement · `smoke-planes` · Section arc / Colour & mood: per-phase hue offset (cool → warm at peak → cool exhale), dot-size growth toward peak, speed multiplier per section; all lerp smoothly over ~1.4 s.
- 2026-06-19 · new · `cong-green-galaxy-orbit` · added recipe wiring the orphaned `cong-green-galaxy` kernel into rotation; fills Galaxy/Orbit via distinct orbital-particle implementation.
- 2026-06-19 · foundation · visual system checks · added profile/storyboard reachability validation and browser smoke-test coverage for visual regressions.
- 2026-06-19 · new · `three-reaction-diffusion` · Gray-Scott ping-pong FBO material surface; fills stateful organic texture technique.
- 2026-06-19 · removal · 6 kernels · deleted `cong-particle-current`, `cong-artwork-particle-mangle`, `native-lissajous`, `cong-chromatic-ring`, `cong-colour-vortex`, `native-kaleido-fold`; fixed storyboard `cong-vertical-datamosh` phantom; pruned `ARCHIVED_RECIPE_REPLACEMENTS`; removed orphan `'line'` from all scene profile arrays.
- 2026-06-19 · new · `three-light-rays` · fullscreen god-ray + mote shader; fills Light family gap; startupEligible, section-sweeping light source, `color-morph` event.
- 2026-06-19 · new · `three-sparse-veil` · near-still volumetric mist for outros/low-energy; fills Sparse Minimal; near-zero drift in sections 1–2, gentle exhale in 3+.
- 2026-06-19 · improvement · `three-fresnel-core` · added orbiting secondary ring (section 2+), directed core drift, `color-morph` chromatic shift.
- 2026-06-19 · improvement · `three-flat-material` · added per-section drift axis rotation, `color-morph` palette burst + erosion spike.
- 2026-06-19 · improvement · `three-caustics` · added directional light-source sweep across sections, regional caustic tightening near peak.
- 2026-06-19 · improvement · `three-curl-flow` · section-based noise frequency (broad→tight), directional flow bias fading out at peak, stronger depth/parallax via aDepth weighting.
- 2026-06-19 · improvement · `three-artwork-flux` · near-zero section amplitude at section 0 → full warp by section 3; `color-morph` triggers burst warp.
- 2026-06-19 · removal · 8 dead kernels · deleted `cong-chord-storm`, `cong-mist-field`, `cong-wandering-lines`, `cong-grain-erosion`, `cong-sparse-constellation`, `cong-top-bottom-storm`, `tide-lines`, `cong-tidal-mirror` + all associated tuning interfaces, presets, and resolvers.
- 2026-06-19 · enable · `cong-horizon-field` · flipped `randomEligible` to true; now enters mid-section rotation.
- 2026-06-19 · improvement · `three-fresnel-core` · Section arc depth: entrance arc (emerges from dim point in section 1) + depth background fbm layer gives spatial depth behind the sphere form.
- 2026-06-19 · improvement · `three-flat-material` · Event reactivity + Section arc depth: boosted fault seam visibility at section 3+ (dark seams with lit edges); stronger color-morph cascade.
- 2026-06-19 · improvement · `three-curl-flow` · Section arc depth: entrance arc (15% density at section 1, accumulates to full by section 2).
- 2026-06-19 · improvement · `three-caustics` · Depth & parallax: always-present directional light gradient (subtle bloom toward light source, sharpens at peak sections).
- 2026-06-19 · improvement · `three-light-rays` + `three-sparse-veil` · Reduced-motion safety: freeze time advancement under prefers-reduced-motion.
- 2026-06-19 · removal+merge · duplicate ridge/contour sketch → `cong-contour-lines` · removed duplicate standalone sketch and folded sparse glints/depth cues into Contour Lines.
- 2026-06-19 · removal · `native-terrain-erode-warm` · removed duplicate warm geology recipe; `native-terrain-erode` remains the single terrain-erode slot.
- 2026-06-19 · removal · duplicate grid/particle variants · removed redundant `native-warp-mesh-reactive` and `native-flow-field-surge` recipes while keeping their shared kernels through distinct base recipes.
- 2026-06-19 · removal+merge · `native-flow-field-thermal` → `native-flow-field-drift` · removed duplicate particle flow recipe and folded its vertical hue-gradient cue into the base drift recipe.
- 2026-06-19 · improvement · `cong-contour-lines` · rebuilt flat contour strokes into section-revealed parallax terraces with horizon wash and event-lit fault seams.
- 2026-06-19 · improvement · `cong-top-bottom-storm-template` · replaced literal center core with a horizontal collision veil and locked section cues to mirrored storm particles.
- 2026-06-19 · new · `three-flat-material` · fullscreen GPU matte sediment/erosion surface; fills Texture gap with strata, pitted relief, and no artwork dependency.
- 2026-06-18 · new · `three-fresnel-core` · fullscreen SDF Fresnel rim glow; fills Orbit/Core + Sparse Minimal gaps; startupEligible, section-arc, exclusion-rect support.
- 2026-06-17 · new · `three-artwork-flux` + GPU helpers · added CORS-safe artwork texture loading, ping-pong FBO support, reusable instanced-field helper, and Three-first agent docs.
- 2026-06-17 · meta · AGENT_GUIDE.md + VISUAL_LEDGER.md created · canonical aesthetic + continual-improvement system established.
