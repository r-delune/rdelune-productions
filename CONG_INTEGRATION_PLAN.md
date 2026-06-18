# Cong Integration Plan

Long-term plan for selectively integrating the strongest ideas from `src/data/cong/` into the explorer visualiser.

## Goal

Bring over only the verified, reusable visual motifs from the Cong archive and re-express them inside the current explorer system.

## Current Progress

### Integrated and marked done

- `newcloudagainintro` → integrated as `cong-cloud-orbit`
- `visitingtimerainshower` → integrated as `cong-rain-shower`
- `lort` → integrated as `cong-contour-lines`
- `planetopener` → integrated as `cong-planet-core`

### Integrated and awaiting review in sequencing

- `cloudagainintro` → integrated as `cong-cloud-orbit-lite`
- `landscapeparticlesflow` → integrated as `cong-landscape-flow`
- `landscapeparticlesspiral` → integrated as `cong-landscape-spiral`

### Approved in the live explorer

- Phase 1 is complete
- Phase 2 is complete
- `multispiral` remains intentionally ignored

### Next queue

These are the next Cong sections / motifs to integrate and review:

- no immediate queued Cong extraction targets

### Explicitly skipped by direction

- `mandala`
- `darkspirals`

This is **not** a direct port of the old sketch files. The archive mostly contains song-specific cue wrappers, while the current site already has a better rendering host: pluggable visualizers, normalized audio signals, section events, and a panel exclusion zone.

## Current Decision

- Ignore the vortex family for now.
- Do not integrate the `colourvortexmain` / feedback-vortex line of work from `src/data/cong/utility/shadeballs.js`.
- Use top-level Cong sketches as taste references and motif indexes, not as direct production code.

## How the Archive Is Structured

### 1. Song wrappers

These top-level files mostly switch between scenes by BPM or event number:

- `src/data/cong/cloudAgain.js`
- `src/data/cong/after_open_ear.js`
- `src/data/cong/mill_street.js`
- `src/data/cong/prepop.js`
- `src/data/cong/sleeping.js`
- `src/data/cong/visiting_time.js`
- `src/data/cong/subtangent_simulcra.js`

They are useful because they reveal which moments were considered strong enough to keep, but they should not be ported directly.

### 2. Reusable motif utilities

These are the actual extraction targets:

- `src/data/cong/utility/scenes.js`
- `src/data/cong/utility/dots.js`
- `src/data/cong/utility/newstuff.js`
- `src/data/cong/utility/lansdscape-particles.js`
- `src/data/cong/utility/tools.js`

### 3. Archive-only or unstable material

These should stay out of the first integration passes:

- files with old path assumptions
- files relying on undefined globals or stale runtime state
- whole-sketch composites that mix several effects in one draw loop

## Integration Principle

Integrate by **motif kernel**, not by song file.

Each approved motif should become one of the following:

- a new explorer visualizer
- an optional layer inside an existing visualizer
- a reusable accent module that can be combined with another visualizer

## Proposed System

### A. Candidate registry

Maintain a small registry of Cong candidates with these fields:

- `id`
- `name`
- `sourceFile`
- `sourceFunction`
- `role` — `background`, `accent`, or `hero`
- `audioMapping` — which bands matter most
- `perfClass` — `low`, `medium`, `high`
- `extractionDifficulty` — `low`, `medium`, `high`
- `status` — `raw`, `shortlisted`, `preview`, `approved`, `rejected`, `parked`
- `notes`
- `approvedBy`

This can start as a markdown table and later become a TypeScript registry if needed.

### A1. Integrated library index

In addition to the raw candidate registry, maintain a separate index of what has actually been extracted into the live explorer runtime.

Current location:

- `src/components/explorer/cong/library.ts`

Each library entry should say:

- which Cong candidate it comes from
- which runtime visualizer / recipe now carries it
- which original behaviors were intentionally preserved
- how it was adapted to fit the current system cleanly

This prevents crude direct ports and makes each integration traceable.

### B. Extraction workflow

Every Cong effect should move through the same pipeline:

1. **Catalog** — identify the exact function, not just the parent sketch.
2. **Isolate** — describe the visual idea in plain language and separate it from song/BPM logic.
3. **Normalize** — remap it to explorer inputs: `AudioSignal`, section events, palette, and exclusion zone.
4. **Prototype** — build a minimal adapter or visualizer in isolation.
5. **Review** — you verify whether the “good bit” survived translation.
6. **Approve** — mark the motif as allowed for production use.
7. **Compose** — attach it to an album or combine it with an existing visualizer.

### C. Explorer-facing target structure

When implementation starts, Cong work should land in explorer-native locations, not back in the archive:

- `src/components/explorer/visualizers/` for full visualizers
- `src/components/explorer/` for shared orchestration
- `src/data/cong/` remains archive/reference material

Optional future support files if the backlog grows:

- `src/components/explorer/cong/catalog.ts`
- `src/components/explorer/cong/motifs.ts`
- `src/components/explorer/cong/review-notes.ts`

## Shortlist Without Vortex

These are the strongest candidates after excluding the vortex line.

| Priority | Motif | Source | Role | Why it is interesting | Difficulty | Suggested destination |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `newcloudagainintro` | `src/data/cong/utility/scenes.js` | background | organic orbital cloud / particle bloom with strong atmosphere | low | new visualizer or `smoke-planes` variant |
| 1 | `visitingtimerainshower` | `src/data/cong/utility/scenes.js` | background | distinctive rain / shower texture with immediate mood value | low-medium | `drift-ink` variant or new rain visualizer |
| 1 | `lort` | `src/data/cong/utility/dots.js` | background | soft layered contour lines; easy to civilize into the explorer | low | extend `tide-lines` or new contour visualizer |
| 2 | `landscapeparticlesflow` | `src/data/cong/utility/lansdscape-particles.js` | background | important particle-bed language with sideways drift and noise flow | medium | new background kernel or `drift-ink` variant |
| 2 | `landscapeparticlesspiral` | `src/data/cong/utility/lansdscape-particles.js` | accent | important spiral / line overlay from the same family | medium | accent module or hero overlay |
| 2 | `planetopener` | `src/data/cong/utility/scenes.js` | hero | memorable central form and pulse language | high | dedicated visualizer after simplification |
| 3 | `mandala` | `src/data/cong/utility/newstuff.js` | accent | compact radial accent; likely useful as a triggered overlay | low | accent module |
| 3 | `darkspirals` | `src/data/cong/utility/newstuff.js` | accent | line-burst radial energy that could work on section events | low-medium | accent module |
| 3 | `cloudagainintro` | `src/data/cong/utility/scenes.js` | background | simpler precursor to the cloud bloom family | low | integrated as lighter cloud recipe variant |
| 4 | `stacyltites` | `src/data/cong/utility/scenes.js` | accent | expressive line behavior, but likely needs cleanup first | medium | later accent module |

## What We Should Not Port Directly

Avoid direct lift-and-shift of:

- top-level Cong sketch files with `switch`-heavy BPM routing
- code that still expects old import paths
- archive helpers that depend on undefined globals or stale p5 state
- large monolithic functions when the useful part is only one sub-behavior

Examples of archive issues already observed:

- old relative imports in `src/data/cong/cloudAgain.js`
- missing references in `src/data/cong/iiji.js`
- stale references in `src/data/cong/visiting_time.js`
- unstable state usage in `src/data/cong/utility/run_particles.js`

## Phase Plan

### Phase 1 — Low-risk translations

Goal: establish the workflow and prove the system.

Status: complete

Targets:

- `newcloudagainintro`
- `visitingtimerainshower`
- `lort`

Completed output:

- `cong-cloud-orbit`
- `cong-rain-shower`
- `cong-contour-lines`

Expected output:

- 1 to 3 clean explorer-native prototypes
- consistent param mapping from explorer audio to Cong motif behavior
- first pass on review / approval statuses

### Phase 2 — Signature hero motion

Goal: bring in the most characterful non-vortex centerpiece.

Status: complete

Targets:

- possibly a reduced `planetopener`

Completed output:

- `cong-planet-core`
- first Cong-derived centerpiece now live in authored track plans

Expected output:

- at least one stronger centerpiece visualizer
- clarified rules for when a motif deserves its own visualizer instead of being a layer

### Phase 3 — Accent language

Goal: add controlled accents instead of whole-scene chaos.

Status: narrowed by direction

Targets:

- no active accent target

Explicitly skipped in this phase:

- `mandala`
- `darkspirals`

Parked after inspection:

- `stacyltites`

Expected output:

- event-triggered overlays or transient accents
- reusable accent hooks for future albums

### Phase 4 — Album composition

Goal: assign approved Cong pieces to album identities.

Status: in progress

This happens only after motifs are approved individually.

Possible outcomes:

- a fully Cong-derived album visualizer
- a hybrid album setup using existing explorer visuals plus one Cong accent
- a library of approved motifs that can be recombined per release

## Review Rules

For each candidate, ask:

- Is the visual idea still good when removed from the original song wrapper?
- Does it still look intentional with explorer palette logic?
- Does it work with normalized audio, not raw sketch-era assumptions?
- Can it respect the explorer panel exclusion zone?
- Is the motion legible without becoming noisy or cheap?
- Is frame cost acceptable on a full-screen route?

If the answer is mostly no, the motif should be parked rather than forced through.

## Definition of “Approved”

A Cong motif is approved only when:

- it has an explorer-native implementation
- it uses current audio inputs and current palette handling
- it respects reduced motion and the panel exclusion zone
- you have explicitly confirmed the translated version still contains the right quality

## Active Practical Queue

When work resumes, tackle these in order:

1. review `cloudagainintro` in live album sequencing and decide whether it stays in rotation
2. review `landscapeparticlesflow` in live album sequencing and decide whether it stays in rotation
3. review `landscapeparticlesspiral` in live album sequencing and decide whether it stays in rotation
4. review remaining Cong archive for other non-mandala, non-darkspirals, non-stacyltites candidates worth promoting
3. review remaining Cong archive for other non-mandala, non-darkspirals candidates worth promoting

## Explicitly Ignored

The following technique is intentionally excluded from the active integration roadmap unless that decision changes later:

- `multispiral`

## Working Rule Going Forward

Every time we identify a “good bit”, we should record it as:

- exact source function
- one-sentence description of what is worth saving
- whether it is background, hero, or accent
- whether you approved it for prototype work

That keeps the archive useful without letting it spill raw into production.
