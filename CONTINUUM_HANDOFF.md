# Continuum coherence pass — handoff

> Context for the next session (Claude Code or otherwise). Goal of this work: kill the
> "random / channel-flipping" feel and make the explorer read as **one warm, continuous
> world that breathes with the music** — subtle ambient consistency + bounded, musically
> motivated variety. Working *within* the existing kernel → tuning → recipe → storyboard →
> plan pipeline; no rewrite.

## TL;DR — what's already true in this repo (don't rebuild it)

A hands-on audit found the coherence infrastructure mostly **already exists**:

- **Deterministic selection** — `runtime/storyboard.ts` + `runtime/plans.ts` use FNV-1a `hashString` + `seededUnit` keyed on album+track. No `Math.random` in the visual-plan selection path. (The `Math.random` hits are particle warm-starts inside kernels and autoplay shuffle — fine.)
- **Shared musical easing** — `createSectionProgress()` in `visualizers/three-scene-helpers.ts` ratchets section progress with per-section time-constants (`SECTION_TAU`). Used by ~10 kernels.
- **Per-track palette + per-section colour temperature** — standard uniform block (`uColorBg/Mid/A/Warm`, `uHueShift`), re-read each frame so kernels follow section colour shifts.
- **GPU plumbing** — `createFloatPingPong` (half-float), `NOISE_GLSL` (snoise/fbm/curlNoise), `createInstancedField`; kernels `three-fluid-advection`, `three-caustics`, `three-curl-flow`, `three-reaction-diffusion` already exist.
- **Lens** — `GRAIN_GLSL` / `applyGrainVignette` (film grain + vignette), used by 8 three kernels.

Conclusion: the perceived randomness is **director-level + finishing**, not missing infra.

## Changes made in this pass (committed to working tree)

All type-checked (`npx tsc --noEmit`) and linted (`npm run lint`) clean. NOT yet run through
`npm run verify` / `npm run build` / `check-rotation` (those need the local macOS toolchain —
they fail in the Linux sandbox on esbuild/swc native binaries). **Run `npm run verify` locally.**

1. **Filmic tonemap added to the shared lens** — `visualizers/three-scene-helpers.ts`, inside
   `GRAIN_GLSL`. New `acesFilmic()` + `applyToneMap()` (Narkowicz ACES + ~8% saturation recovery
   to honour the Colour Vibrancy Mandate). `applyGrainVignette` now runs `applyToneMap` first, so
   **all 8 lens kernels inherit one "film stock" from a single place.** Tune catalogue-wide via
   the `FILM_EXPOSURE` / `FILM_SATURATION` consts in that function. One-line revert: drop the
   `applyToneMap(col)` call.
2. **Softer, longer section transitions** — `ExplorerCanvas.tsx`:
   - `SKETCH_CROSSFADE_SECONDS` 4.2 → **7.5** (cross-kernel)
   - `SKETCH_MERGE_TRANSITION_SECONDS` 1.55 → **2.6**
   - `SAME_SKETCH_MORPH_SECONDS` 1.8 → **2.8**
   - Added `smootherstep01()` and used it for the two section transition blends (gentler dissolve
     than `smoothstep01`). These are the only call sites changed; `smoothstep01` is untouched
     elsewhere.
3. **Lens gap closed for curl-flow** — `three-curl-flow.ts` is an additive instanced-particle
   kernel, so it can't use the fullscreen `applyGrainVignette`. Added a standalone `TONEMAP_GLSL`
   export in `three-scene-helpers.ts` and now tonemap each particle's colour (`applyToneMap(col*bright)`)
   so it shares the filmic colour response. Approximation (per-particle, not summed-frame); the
   exact match would be an FBO post pass over its target. Now every Three kernel shares the film stock.
4. **Dev-tunable exposure** — `?exposure=` (dev/lab only, default 1.0). Added `uExposure` to the
   standard uniform block; `applyToneMap` (in `GRAIN_GLSL`) reads it; `getFilmExposure()` parses the
   URL once and `applyStandardUpdate` feeds it each frame. Lets you A/B the film stock live without a
   rebuild. (`FILM_SATURATION` stays a const at 1.08.) All 8 lens kernels include the std block, so
   the uniform is declared everywhere it's used — verified.
5. **Cohesion-bias director flag (OFF)** — `runtime/storyboard.ts`, `export const COHESION_BIAS = false`.
   When true, inverts the family bias (`prioritizeSameFamily`) and lets a recipe repeat across
   sections, so a track stays one world. Only affects the **authored-storyboard** path; the
   generative-variety path in `runtime/plans.ts` (most generated tracks) needs the same treatment to
   change the catalogue feel — that's the follow-up if you decide you want more continuity than the
   softer crossfades give.
6. **Contact-sheet tool** — `scripts/contact-sheet.mts` + `npm run contact-sheet`. Playwright script
   that screenshots every production-ready recipe (via `?lab=1&recipe=<id>`) into
   `out/contact-sheet/index.html`, sorted by scene family, for spotting cohesion outliers. Local only:
   needs the dev server running + `npm i -D playwright && npx playwright install chromium`. Env knobs:
   `BASE_URL`, `SETTLE_MS`, `WIDTH`, `HEIGHT`, `ONLY=random|all`.

## Director finding (decision made: leave selection, tune transitions)

The selection logic actively *forces* a scene change every section, which is the main source of
the "random" feel:

- `deprioritizeSameFamily()` (storyboard.ts) pushes each section toward a **different** visual family.
- `pickCandidate()` (storyboard.ts) skips `previousRecipeId`, so the **same kernel never repeats**
  in consecutive sections.

Meanwhile kernels already evolve across sections internally (via `uSectionProgress` + palette
temperature), so swapping kernels every section fights their built-in section-awareness.

**Decision for now:** do NOT change the director. Soften the crossfades instead (done above) so the
existing kernel changes feel like dissolves. If continuity still feels insufficient after seeing it
live, the next lever (deferred) is a "cohesion bias": prefer staying in one family per track and only
change kernel on major sections — see the brief.

## Recommended next steps (in priority order)

1. **Run it live** (`npm run dev:productions`, port 8084; `M` or `?lab=1` for the mood lab) and judge:
   - the filmic tonemap across kernels — adjust `FILM_EXPOSURE` (try 0.95–1.1) / `FILM_SATURATION`
     (1.0–1.15) if it darkens or mutes too much.
   - the new 7.5s cross-kernel crossfade — lengthen/shorten to taste.
2. **`npm run verify`** to confirm the full gate (lint + check-rotation + build) is green locally.
3. If transitions alone don't deliver enough continuity, revisit the **cohesion-bias** director option.
4. Optional polish from the design brief: a `FogExp2` + IBL pass for the 3D-scene kernels (depth/warmth);
   a catalogue contact-sheet script for spotting outliers across the ~200 tracks.

## Reference material (now copied into the repo root)

- `continuum-coherence-pass.md` — the full design brief / spec (four levers, skill→work map, demo-env ideas, acceptance rubric).
- `continuum-prototype.html` — standalone "feel target": one persistent liquid (ping-pong FBO + curl-noise advection), seeded section currents, slow colour shifts, shared lens. Open in a browser. Reference for the *feel*, not a drop-in.
- `threejs-skills-main/skills/` (in repo) — Three.js API reference; auto-loads in Claude Code. Most relevant: `threejs-shaders`, `threejs-textures` (render targets), `threejs-postprocessing`, `threejs-fundamentals`.
