# Continuum — a coherence pass for `/productions`

> **For Cowork to implement, inside the existing codebase.**
> Goal: kill the "random" feeling and replace it with *subtle ambient consistency + an entertaining, musically-motivated amount of variety*, with rich, warm, smooth depth.
> This works **within** the kernel → tuning → recipe → storyboard → plan pipeline. Nothing here breaks the audio-as-accent rule, the single-shared-renderer rule, or the doc/governance contracts. Most changes are *additive shared infrastructure* plus *replacing random selection with seeded selection*.

---

## 0. The one-paragraph version

The system already has the right bones. What makes it feel random is that **selection is random** (flag-driven rotation + `Math.random` storyboard/variance choices) and **each section recipe is its own little world** (own colors, own lifecycle, no shared substrate, hard-ish crossfades, no shared "lens"). We fix this with four small, composable levers that slot into the existing layers: **(1) a per-track Seed** so every "random" choice becomes deterministic and replays identically; **(2) one OKLCH Palette per track** that every recipe samples from, so sections shift *within* a harmony instead of jumping between unrelated colors; **(3) a persistent Mood Field** — a cheap always-on atmosphere layer that never restarts on section change, carrying continuity; and **(4) a shared Lens** — one grain/vignette/tonemap/bloom post helper every kernel runs through, so the whole catalog feels shot on the same film stock. Levers 1 and 4 are *already on your ledger's next-priority list*. Together they convert "looped animation with different brightness" into "one continuous world that breathes with the song."

---

## 1. Diagnosis — where the randomness actually lives

Mapping the felt problem to real files:

| Symptom | Root cause in current code | Lever that fixes it |
|---|---|---|
| Two plays of the same track look different | `randomEligible` rotation + `Math.random()` in storyboard template / recipe / variance selection | **Seed** (§3) |
| Section 1 → 3 feels like a channel-flip, not a journey | each recipe carries its own palette; no track-level color identity | **Palette** (§4) |
| Scenes feel disconnected / "looped animation" | nothing persists across the section crossfade; the background is part of each recipe | **Field** (§5) |
| Visuals feel "thin" / not warm or deep | no shared finishing; per-kernel tonemapping, grain inconsistent or absent | **Lens** (§6) |
| Variety feels arbitrary, not "with the music" | storyboard expands roles but motif choice isn't constrained or energy-weighted enough | **Bounded Director** (§7) |
| Transitions feel abrupt at times | crossfade is per-recipe; no shared easing curve | **Shared easing** (§6, also a ledger priority) |

Note two of these (**Seed/shared easing** and the **shared film-grain/vignette GLSL helper**) are explicitly the next priorities in `VISUAL_LEDGER.md`, `VISUAL_REPERTOIRE.md`, and the Hermes contract. This brief is largely *executing the plan you already wrote*, plus tying it together with palette + field.

---

## 2. Principles this pass must not violate

Carried straight from `AGENT_GUIDE.md` / `STORYBOARD_ARCHITECTURE.md` / `THREE_INTEGRATION.md`:

- **Audio is accent only.** No runtime FFT, onset detection, tempo estimation, or synthetic beat clocks. The new levers read `section_times` and the precomputed `audio-signal.ts` envelope; audio only *modulates amplitude* within bounds the director sets (§8).
- **No renderer logic in JSON; no track-specific branches in kernels.** Seed/palette/field/lens are *engine* concerns, not per-track special cases. `track.visualConfig` stays declarative.
- **Single shared `WebGLRenderer` (`three-host.ts`), lazy Three import, idempotent `build()`, context-loss recovery.** The Field and Lens are shared passes inside that one host, not new renderers.
- **Every visualizer renders a stable, non-blank frame at `dt=0`** and respects `prefers-reduced-motion`. Field drift and accent must freeze cleanly at `dt=0`.
- **Color Vibrancy Mandate** (Hermes): the Palette system must *increase* vibrancy and control, never wash things out.

If a proposed change here ever conflicts with one of these, the principle wins — flag it instead of working around it.

---

## 3. Lever 1 — the Seed (deterministic identity)

**The single highest-leverage change.** One 32-bit seed per track derived from a stable id (e.g. `hash(album.slug + track.src)`), threaded through every place that currently calls `Math.random()`.

**Where it goes:** `useProductionVisualPlan.ts` computes `seed` once per track and passes a seeded PRNG (or the raw seed) down into:
- recipe selection from the eligible pool (replaces random rotation pick),
- storyboard template choice + per-section motif choice + variance jitter,
- any noise offsets / drift directions / motif "centers" a kernel wants to vary.

**Add** `src/lib/rng.ts`:
```ts
// FNV-1a hash + mulberry32 — tiny, fast, deterministic
export function seedFrom(...parts: string[]): number { /* FNV-1a over parts */ }
export function rng(seed: number): () => number { /* mulberry32 */ }
// deterministic pick + jitter helpers used everywhere selection happens
export function pick<T>(r: () => number, xs: T[]): T { return xs[Math.floor(r() * xs.length)]; }
export function jitter(r: () => number, base: number, amt: number) { return base + (r()*2-1)*amt; }
```

**Why it fixes "random":** variety *across* the 200+ tracks stays huge (every track draws a different but fixed plan); variety *within replays* drops to zero. The experience becomes reproducible, shareable (`?seed=` override, §9), debuggable, and — critically — it stops feeling arbitrary because each track now has *a* look, its look, every time.

**Rotation gate stays.** `npm run check-rotation` still guarantees every productionReady recipe is reachable; seeding only changes *which* eligible recipe a given track lands on, deterministically.

---

## 4. Lever 2 — one Palette per track (OKLCH harmony)

Today recipes carry their own colors, so a section change can jump across hue space. Instead, derive **one harmonic palette per track** and have recipes/tunings sample *slots* from it.

**Source:** `album.base_color` (already in the data model) as the anchor hue, perturbed by the track seed for per-track individuality. Build a 3–5 stop ramp in **OKLCH** (perceptual: interpolation never goes muddy or dark-in-the-middle):
- `ground` (deep, low-L) → `mid` (the glow) → `highlight` (high-L, slight hue rotation or a single controlled complement for the Vibrancy Mandate).
- A scalar `warmth` (seeded, biased warm) tints the whole track.

**Add** `src/lib/palette.ts` with `buildPalette(baseColor, seed) → { ground, mid, highlight, warmth }` in linear-sRGB (and an `oklch→srgb` converter; see the prototype for a working one). Expose the ramp as uniforms (`uCol1/2/3`, `uWarmth`) on the shared material base.

**Tuning change:** `tuning.ts` presets stop hardcoding RGB and instead reference palette slots + a per-section *modulation* (lift L, push chroma, nudge temperature). Sections then shift *within* the track's harmony — section 3 reads as "the same world, later in the day," not a different channel. This is exactly the cohesion-vs-variety balance you asked for.

**Migration:** keep a back-compat path — if a recipe/track has an explicit color override in `visualConfig`, honor it (highest-specificity layer wins, per the pipeline). Palette is the *default*, not a hard override.

---

## 5. Lever 3 — the persistent Mood Field (continuity substrate)

The thing that makes sections feel like *one* world is a layer that **never restarts and never has anything pop into it.** For an ambient/IDM catalog like this, the *dominant* visual should be a single continuous liquid field for the whole track. Sections must not swap in discrete shapes (a ring, a band, a burst that "appears") — that reads as exactly the randomness you're trying to kill. Sections should only **ease the field's parameters** (gradient, flow direction, turbulence, temperature, brightness) over seconds, so every change *oozes in*.

**Implementation (inside the existing host).** Promote a single domain-warped FBM field to an **engine-level base kernel** that runs first every frame, owned by the engine, not any recipe. Give it genuine *liquid* motion with **ping-pong FBO feedback + curl-noise advection** — the prototype implements exactly this, and it is your ledger's #1 open priority ("GPU fluid advection"). Each frame the previous frame is advected along a slow, divergence-free curl-noise flow and a *small* amount of freshly-computed field colour is stirred in (≈2% per frame). The result is marbled, warm, perpetually-evolving liquid where any parameter change manifests as a gradual stir, never a cut. This is the Three.js render-target path — lean on the `threejs-textures` (render targets), `threejs-shaders`, and `threejs-postprocessing` skills when building it.

**Recipes become parameter sets, not separate kernels (key reframe).** Within the existing pipeline this is clean: a "recipe" for the default experience = the liquid kernel + a *tuning* (a parameter set — warp scale, flow strength, curl, chroma, lift, drift). The storyboard sequences *parameter sets*; the section crossfade *eases parameters*, it does not swap kernels. Discrete-kernel motifs (instanced fields, raymarch, etc.) stay in the library for the genuinely high-energy tracks that want them, but they are the exception, gated behind scene profile/energy — not the default rotation.

**Why it's safe & cheap:** the sim runs at ~1.25× DPR into a half-float target and is one advection pass + one present pass; it shares the single `WebGLRenderer`; and because it's always the floor, even "sparse/minimal" tracks get a warm, full frame. "Less is more" is enforced structurally: there is usually just *the liquid* + the lens.

**Depth comes for free:** the advected feedback gives self-similar marbling at multiple scales (far drift + near filaments) + atmospheric falloff via the vignette/tonemap = the "rich depth" you want, without stacking layers.

**Grid/Structure gap:** treat structure as a *modulation of the liquid* (e.g. a faint anisotropic bias / contour term added inside the field shader, eased in on structural sections) rather than a cold wireframe kernel on black. It then reads as intentional and warm, and finally fills the repertoire gap honestly.

---

## 6. Lever 4 — the shared Lens (one film stock) + shared easing

Both are already on your ledger. Do them now, because they're what make *every* scene feel like part of one production.

**Shared GLSL lens helper** — `src/lib/three/lens.glsl.ts` exporting a chunk every fragment shader appends as its final step:
- soft highlight bloom (cheap, self-buffer lift — no postprocessing lib, per the no-extra-libs rule),
- filmic tonemap (ACES-approx) for smooth, rich rolloff and warmth,
- vignette,
- film grain.
All four driven by shared uniforms with sane defaults; tunable per recipe but consistent by default. A kernel opts in by appending `LENS_FRAG` and declaring the uniform block. This single change is the biggest *perceived* cohesion + warmth upgrade per line of code.

Two refinements the skill pack makes possible (see §13): **(a)** set `renderer.toneMapping = ACESFilmicToneMapping` + `outputColorSpace = SRGBColorSpace` once on the shared renderer so the filmic curve is identical everywhere and the Lens chunk drops its hand-rolled tonemap (keeping only bloom/vignette/grain); **(b)** push the Lens (and palette) into the ~40 existing kernels via `onBeforeCompile` injection at `#include <output_fragment>` rather than editing each file — this is what turns "improve every sketch" into one helper.

**Shared section-easing** — `src/runtime/easing.ts` exporting named curves (`smootherstep`, `easeInOutSine`, etc.). `ExplorerCanvas.tsx` uses one shared curve for *all* section parameter morphs, with the **transition window scaled to section length** (e.g. `min(0.35 * sectionLen, 6s)`) so transitions feel musical, never abrupt and never draggy. Because the field is a feedback liquid, even a parameter step would resolve gradually — but ease the parameters anyway so the morph is fully under art direction. Everything interpolates *continuously*; nothing is swapped.

---

## 7. Bounded Director — variety that goes with the music

Keep `storyboard.ts` and its templates (`lift-arc`, `journey`, `pulse-arc`, …). Tighten *how* it chooses so variety reads as intentional — and remember the unit of variety is now **a parameter set ("current"), not a shape**:

- **Roles already exist** (intro/build/peak/release/afterglow). Map each role to a **named liquid "current"** — a small parameter delta from the track baseline (see prototype `ROLE_CURRENTS`: e.g. `calm haze`, `rising flow`, `deep swell`, `easing tide`, `warm settle`). All currents sit within close ranges of each other, so any section-to-section move is a gentle drift.
- **Seed the micro-variation** (§3): two same-role sections get slightly different warp/flow/curl so the track isn't mechanically repetitive, while staying subtle.
- **Energy-weight it**: peaks raise flow/turbulence/chroma toward the top of the allowed band; intros/afterglows settle toward the calm end. Energy comes from `section_times` position + the precomputed envelope, *not* live audio.
- **One field, period** (plus the lens). Discrete accent layers are opt-in per track via `visualConfig`, never the default. This is the "less is more" guardrail encoded in the director, not left to taste.

Result: the same track always tells the same visual story, that story tracks the song's arc as a slow tide rather than a slideshow, and across the catalog you get enormous bounded variety from palette + parameter-space alone.

---

## 8. Audio-as-accent compliance (unchanged rule, made explicit)

The new levers consume only what's allowed:
- **Structure** drives everything: `section_times` → roles → motif/palette/field targets.
- **`audio-signal.ts` envelope** (energy, bass/mids/highs, transient, onsets; beatPhase/barPhase only if authored BPM) modulates **bounded amplitudes only**: bloom intensity, motif energy, drift gain, accent particle emission. Floor and ceiling per section are set by the director so audio can *breathe* the scene but never *choose* or *restart* it.
- **No** FFT / onset detection / tempo estimation / synthetic beat clocks added. Tracks without BPM simply get no beat-phase modulation; the structure-driven arc still carries them.

---

## 9. Demo / dev environment improvements

To actually *tune* the above, the dev loop needs to be inspectable and reproducible. All of these fit existing `scripts/` + dev conventions:

1. **URL overrides** (dev-only, no effect in prod export): `?seed=`, `?section=N`, `?recipe=`, `?paused=1`, `?t=seconds`. Lets you reproduce and freeze any frame. The `?seed=` override is also how you'd share "this exact look."
2. **Director Inspector overlay** (toggle, dev-only): current section / role / motif, palette swatches, transition %, energy meter, active uniforms — exactly the panel in the prototype. Turns "looks off" into "section 3, peak, motif X, energy pinned high."
3. **Section scrubber / jump-to-section** in dev so you don't wait through a 17-minute track (you have several) to review its afterglow.
4. **Catalog contact sheet** — `scripts/contact-sheet.mjs`: headless-render the first ~6s of each track to a thumbnail grid so you can eyeball *catalog-wide* cohesion and spot the outliers and the Grid/Structure gap at a glance. This is the highest-value review tool for a 200-track archive.
5. **A/B compare**: split-screen old-rotation vs seeded-director (or two seeds) to make regressions obvious during the migration.
6. **Fix the stale-data footgun**: make `npm run dev` either refresh `public/data/showcase.json` or warn loudly that it's stale (currently only `dev:productions` refreshes). Small, removes a recurring confusion.
7. **Reduced-motion preview toggle** in the inspector so you can verify the `dt=0` stable frame without OS settings.

A working reference for items 1–3 and the seeded director is the prototype HTML in this deliverable — it's the same logic, just standalone.

---

## 10. Suggested sequencing (small, verifiable steps)

Each step ends green on `npm run verify` (lint + check-rotation + build) and is independently shippable — fits the Hermes cadence (small cycles straight to `main`).

1. **`lib/rng.ts` + thread the seed** through `useProductionVisualPlan.ts` (replace `Math.random` in selection). *Immediate de-randomization, zero visual redesign.*
2. **`runtime/easing.ts` + shared crossfade** in `ExplorerCanvas.tsx` (ledger priority). *Smoother transitions.*
3. **`lib/three/lens.glsl.ts`** and roll it into 2–3 flagship kernels first, then the rest (ledger priority). *Warmth + cohesion jump.*
4. **`lib/palette.ts`** + convert `tuning.ts` presets to palette slots + per-section modulation (back-compat for explicit overrides). *Track-level color identity.*
5. **Engine-level liquid field** (ping-pong FBO + curl-noise advection) as the default base kernel; convert section recipes to *parameter sets* of it. *Continuity + depth; the "liquid" look; also unlocks Grid/Structure as a field modulation.*
6. **Bounded Director**: role→named "current" (parameter delta), seeded micro-variation + energy-weighted, one-field default in `storyboard.ts`. *Variety that tracks the music as a tide, not a slideshow.*
7. **Dev tooling** (§9) — ideally do the Inspector + `?seed=` early (after step 1) so the rest is tunable.

Steps 1–3 alone will remove most of the "random/thin" feeling. 4–6 deliver the "one warm world that breathes" target.

---

## 11. Acceptance rubric (how to know it worked)

Extends the existing 15-point Aesthetic Rubric. A pass means:

- **Replay-identical:** same track, same seed → pixel-stable plan (different *render* due to time is fine; *choices* are identical).
- **One-world test:** scrub from section 1 to the last section — at no point does it read as a channel-flip. The liquid is continuous; sections only ease its parameters, and nothing ever "appears."
- **No-pop test:** watch a full section change at 1× speed. There must be no discrete element that fades/snaps in — only the gradient, flow and temperature drifting over seconds.
- **Arc test:** with audio muted, the *visual* energy still rises to the song's peak and releases — structure alone carries it.
- **Warmth/lens test:** every recipe shares the grain/vignette/tonemap signature; nothing looks like a cold tech demo on pure black.
- **Less-is-more test:** the default frame is just the liquid + the lens; any extra layer is a deliberate per-track opt-in.
- **Bounded-variety test:** the catalog contact sheet shows wide variety *between* tracks and clear family/role logic, not noise.
- **Rule compliance:** no new FFT/tempo code; single renderer; `dt=0` stable; reduced-motion clean; `npm run verify` green; `check-rotation` green.
- **Vibrancy Mandate:** palette pass increases controlled vibrancy vs. the old per-recipe colors (compare A/B).

---

## 12. Light doc/governance reconciliation (do alongside, not first)

Since you're staying in the codebase, fold this work into the existing docs rather than adding more:
- Record the four levers in `VISUAL_SYSTEM.md` as engine layers (Seed/Palette/Field/Lens) and tick off the ledger's "shared easing" + "shared grain/vignette" priorities.
- Update `VISUAL_REPERTOIRE.md`: Grid/Structure becomes viable once it sits on the field + lens; note it.
- The 7 visual-system docs + `HERMES.md` likely have redundancy worth a consolidation pass *after* this lands (the overview flags this) — but treat that as a separate cleanup, not part of the coherence work.

---

## 13. Using the `threejs-skills` pack (now in the repo)

The pack at `threejs-skills-main/skills/` is the authoritative API reference Cowork should consult while implementing each lever. Reading it confirmed the design and surfaced four concrete upgrades that make the cohesion work cheaper and — importantly — let it **retrofit every existing kernel, not just new ones.**

**Skill → lever map (what to open while building each piece):**

| Building | Open these skills |
|---|---|
| Liquid field: ping-pong half-float targets, curl-noise advection | `threejs-textures` (Render Targets), `threejs-shaders` (noise, gradients, GLSL3) |
| Shared Lens (bloom / vignette / grain / chromatic) | `threejs-postprocessing` (UnrealBloomPass, VignetteShader, FilmPass, the included ChromaticAberration ShaderPass), `threejs-fundamentals` (tone mapping) |
| Shared easing curves | `threejs-fundamentals` (`THREE.MathUtils.smootherstep/lerp/mapLinear`, `Color.lerp`, `Quaternion.slerp`) |
| Retrofitting palette + lens into existing kernels | `threejs-shaders` (`onBeforeCompile`, injection points, `ShaderChunk`) |
| Depth/warmth on 3D-scene kernels | `threejs-fundamentals` (`FogExp2`), `threejs-lighting` (IBL/PMREM), `threejs-materials` (`MeshPhysicalMaterial` transmission/sheen) |
| Particle/field kernels | `threejs-geometry` (`InstancedMesh`, `InstancedBufferGeometry`) |

**Four upgrades the pack unlocks (fold into the levers above):**

1. **Set tone mapping + colour space once on the shared renderer**, don't hand-roll ACES in every fragment shader. `renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace` (fundamentals skill). This is literally "one film stock" enforced at the renderer — the single biggest consistency win, and it means kernels can stop each carrying their own tonemap. The Lens GLSL chunk then only needs bloom + vignette + grain.
2. **Retrofit the Lens and Palette into existing kernels via `onBeforeCompile`** (shaders skill). For kernels built on `MeshStandardMaterial`/built-ins, inject the grain/vignette/palette chunk at `#include <output_fragment>` instead of rewriting them. This is how "improve *every single* sketch" becomes a few hours, not a rewrite of ~40 files — the shared chunk lands everywhere through one injection helper.
3. **Build `runtime/easing.ts` on `THREE.MathUtils`** (`smootherstep`, `lerp`, `mapLinear`) and use `Color.lerp` for the colour morphs (exactly what the prototype does) and `Quaternion.slerp` for any camera moves — no custom curve code to maintain.
4. **`FogExp2` + IBL** for the 3D-scene kernels the ledger wants (light-only scene, volumetric outro). A warm `FogExp2` plus an environment map generated from the track palette (PMREM, textures/lighting skills) gives soft, deep, warm light for near-free — supports "rich depth" without extra passes, and is the honest path to the caustics/volumetric metaphors in the ledger.

**One constraint to respect:** the pack documents `EffectComposer` for post, but your `THREE_INTEGRATION.md` bans postprocessing libs and mandates a single shared `WebGLRenderer`. Keep the Lens as an inline GLSL chunk / manual `ShaderPass` over your own render target (the postprocessing skill's "Render to Texture" + custom `ShaderPass` sections show this path) — borrow the *math* from its Vignette/Chromatic shaders, not the `EffectComposer` plumbing.

---

### Companion file
`continuum-prototype.html` — a single self-contained reference implementation of the **feel target**: one persistent **liquid field** (ping-pong FBO feedback + curl-noise advection), one OKLCH palette per seed, a seeded Director that maps section roles to named liquid "currents" (parameter sets) over a simulated `section_times` timeline, slow parameter easing (no discrete shapes, no pops), bounded energy accent, and the shared Lens (bloom + filmic tonemap + vignette + grain). It is not a replacement architecture — it's the north-star look + the technique (this is the GPU-fluid-advection path from your ledger), isolated so you can feel it and port the math into the real kernels. Open it, hit **↻ new track** to see bounded variety, and scrub the timeline to confirm nothing ever pops — the whole track is one slowly-stirring liquid.

> Built with the Three.js render-target / shader / postprocessing patterns from your `threejs-playground` skill pack — when Cowork implements the real version, point it at `threejs-textures`, `threejs-shaders`, and `threejs-postprocessing`.
