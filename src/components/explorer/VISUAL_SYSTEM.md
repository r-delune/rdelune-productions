# Explorer Visual System

This document is the working contract for adding, tuning, and reviewing visuals in `/productions`.

The catalogue is expected to grow to hundreds of tracks and many albums. The system must stay transparent enough that a human can review it and strict enough that LLM-generated additions do not turn into one-off sketch sprawl.

## Mental Model

Visuals are layered from low-level implementation to high-level musical intent:

1. **Kernel**
   - A reusable rendering engine.
   - Lives in `src/components/explorer/visualizers/`.
   - Examples: `cong-generative-particles`, `cong-rain-shower`, `cong-contour-lines`.

2. **Tuning**
   - The artistic and performance knobs for a kernel.
   - Lives in `src/components/explorer/tuning.ts`.
   - Examples: particle count, noise seed, emitter mode, field scale, alpha, blend mode.

3. **Recipe**
   - The public visual identity that albums/tracks use.
   - Lives in `src/components/explorer/runtime/recipes.ts`.
   - A recipe chooses a kernel, a tuning key, base params, scene profile, and source candidates.

4. **Storyboard or section plan**
   - The musical assignment layer.
   - Comes from `showcase.json` or runtime fallback plans.
   - Should reference recipe IDs, not kernels.

For track data, the stable public surface is the **recipe ID**.

## Rule of Thumb

Add the smallest thing that expresses the new visual idea:

- New colour/density/motion balance: add a tuning preset.
- New reusable mood using an existing kernel: add a recipe.
- New particle/noise behaviour: usually add a mode/tuning for `cong-generative-particles`.
- Truly new rendering structure: add a Three kernel behind `createThreeVisualizer`.

Do not add a new kernel just to get a visual variant.

## Three Primary Path

New visual generation should start from `THREE_GENERATION_PROMPT.md` and `THREE_INTEGRATION.md`.

Use Three when the work needs true depth, shader materials, high-density instancing, ping-pong feedback,
artwork texture displacement, caustics, volumetric light, or other GPU-native techniques. Keep Three contained
behind the shared adapter, lazy-loaded through `three-host.ts`, and wired through the same tuning/recipe/plan
layers as every other sketch.

## Q5 Particle Engine (Legacy-Kept)

`cong-generative-particles` is the legacy home for particle/noise-based Cong work. Existing Canvas2D/q5 kernels
remain production code and may be fixed, tuned, or retired. New Canvas2D sketches need a clear reason they are a
better fit than a Three recipe.

It is designed to express many behaviours through tuning:

- `mode`: high-level behaviour, such as `landscape-og`, `cloud-again`, `galaxy`, `storm`, or `chord-storm`.
- `emitter`: where particles originate.
- `field`: how particles move.
- `renderer`: how particles are drawn.
- `overlays`: reusable accents layered over particles, such as `bouncing-lines`, `random-chords`, and `grid-rays`.
- `feedback`: persistent trail behaviour through a Q5 graphics buffer.

Use Q5 where it helps:

- `q.noiseSeed()` and `q.noiseDetail()` for stable but distinct flow fields.
- `q.createGraphics()` for persistent trails and feedback buffers.
- Canvas composite modes for additive sparks, soft cloud bloom, and stronger peak moments.
- Cached low-resolution vector fields when a particle mode would otherwise call noise too often.

Keep `q.pixelDensity(1)` for predictable performance.

Noise cost rules (the explorer's main CPU sink is Perlin, not rasterization):

- The shared explorer instance runs `q.noiseDetail(4, 0.5)`, so every `q.noise()` call costs 4 Perlin evaluations. Never wrap it in an octave loop — `fbm()` in `cong-particle-primitives.ts` already exists and reads a dedicated single-octave source.
- Never refresh a full noise field (heightlines, grids) every frame. Amortize round-robin across frames, cache generated rows/layers where possible, and interpolate between refreshes.
- Per-particle `q.noise()` flow lookups should be cached and refreshed on alternating frames when the field morphs slowly.
- Cache CanvasGradients keyed by quantized color/geometry and ride per-frame alpha on `globalAlpha`; never create gradients per frame in a layer loop.

Cloud Again is a useful example of the extraction rule. Its old sketch is a section router, so production runtime uses the `cloud-again` storyboard template plus recipes like `cong-cloud-again-intro-generative`, `cong-cloud-again-lines`, and `cong-rain-shower` instead of running the raw router. The former `cong-cloud-again-peak` recipe is archived and should not be reintroduced as a production peak.

## Premium Top-Bottom Storm Template

Use `cong-top-bottom-storm-template` when a track should stay inside one strong sketch while section cues create internal events.

Prompt pattern:

```text
Create a premium section-event visual plan using top-bottom storm as the template.
Use one recipe across the track. Do not switch sketches for each section.
Before the release cue, show only the storm atmosphere and center form.
On the chosen section cue, trigger storm-release with one-by-one particle reveal.
On a later cue, trigger color-morph on particles or center form.
Keep the plan declarative in visual_events or step events. Do not add track-specific visualizer branches.
```

Example config:

```json
{
  "visual_config": {
    "debug_label": "top-bottom storm section events",
    "visual_sequence": ["cong-top-bottom-storm-template"],
    "visual_events": [
      { "event": "storm-release", "section_index": 1, "duration_ms": 3600, "release_mode": "one-by-one" },
      { "event": "color-morph", "section_index": 3, "target": "particles", "duration_ms": 2200, "color": [210, 244, 230] },
      { "event": "density-surge", "section_index": 3, "offset_seconds": 6, "intensity": 0.85, "color": [255, 180, 90] },
      { "event": "spark-burst", "section_index": 4, "offset_seconds": 8, "intensity": 0.95, "color": [255, 245, 190] },
      { "event": "color-morph", "section_index": 4, "target": "center", "duration_ms": 2600, "palette": { "hue_shift": -28, "brightness": 1.18 } }
    ]
  }
}
```

Current generic cue events work across all sketches because the canvas applies the fallback behavior:

- `color-morph` / `palette-morph`: gradual sketch-local color moves. They do not paint a full-canvas flash. Use `target` to scope the change to `particles`, `foreground`, `center`, `background`, `ridges`, `mist`, `terrain`, or `all`. Element targets stagger one-by-one by default; set `"release_mode": "all-at-once"` for a uniform color move.
- `density-surge`: short density, turbulence, drift, and glow push.
- `glow-pulse` / `bloom-flash`: bright wash and impulse. `bloom-flash` is reserved for explicit authored hits, not normal generated defaults.
- `spark-burst`: shimmer/impulse burst plus each sketch's normal `onEvent` response.
- `focus-shift`: a slower center-weighted glow and hue move.
- `veil-sweep`: a moving translucent light band across the sketch.
- `motion-drift`: a gradual drift/turbulence lift for section momentum.
- `grain-bloom`: a warmer texture/glow accent for ambient impact.
- `storm-release`: top-bottom storm particle reveal; ignored safely by sketches that do not implement it.

For generative particle sketches, tuning may also set `particleSizeJitter` and `particleColorJitter`. These add deterministic per-particle variation around the current color/size, with extra temporary variation after burst-style cue events.
Generative particle sketches can also set `particleStrokeAlpha` for particle outlines and `lineworkAlpha` for chord/ray/streak overlays. Set either to `0` for Cong-style no-stroke behavior, or raise them per tuning preset when the sketch should show drawn edges.

Use `cong-artwork-datamosh-rain-evolution` as an occasional artwork texture accent, not as the default section-evolution system. When selected, it stays in one sketch across the song and uses `section_times` plus default cue events for subtle image slice displacement, chromatic faults, light rain, sparse flow/storm motion, feedback memory, and partial artwork reformation.

The older `cong-artwork-datamosh-left-flow` and `cong-artwork-datamosh-storm-evolution` recipes are archived from production selection. Their behaviours now live inside the unified mosh tuning as event-reactive stages rather than separate sketches. `cong-artwork-particle-mangle` remains available for review as a distinct high-intensity texture, but it is no longer part of automatic sequencing.

Artwork datamosh runs cue-aged generative effects from the same `section_times` events: a directional mosh wave crosses after cue changes, scanlines bloom around musical surges, chromatic faults travel as bands, and feedback memory accumulates through dense sections before clearing into the reconstructed state. Square-like pixel islands and dense worm-like particle layers should remain suppressed in production tuning.

## Onset Signals

Beyond the smoothed band values, `AudioSignal` carries per-band spectral-flux onsets computed in `ShowcasePlayer.tsx`:

- `bassOnset` (0–1): kick-like low-band hits, adaptive baseline + ~140 ms refractory.
- `highOnset` (0–1): hat/snare-like high-band hits, ~90 ms refractory.
- `onsetStrength` (0–1): combined onset value for band-agnostic consumers.

They feed three places without requiring kernel changes:

1. `params.ts` adds small accent terms (impulse/shimmer/glow), so every kernel reacts.
2. `ExplorerCanvas.tsx` bridges strong bass onsets (≥0.7, energy ≥0.45, ≥2.5 s apart) into a low-intensity `spark-burst` cue event, so sketches get musically-timed gestures through the normal cue machinery.
3. Kernels may read `audio.bassOnset` / `audio.highOnset` directly for band-specific behaviour (e.g. kaleido seam glow, datamosh pixel-sort triggers).

**Design decision — low audio processing.** BPM and beat-start come authored from the processed showcase file (ableton_manager pipeline). Do not add runtime tempo estimation or per-frame audio DSP beyond the existing band/flux loop. `beatPhase`/`barPhase`/`beatPulse` exist only when the track has authored BPM; tracks without it get no beat clock and no bar-cue events — they stay alive through energy/transient/onset signals and section cues. Never inject a synthetic clock: `params.ts` downweights real FFT transients whenever a clock is present, so a fake clock both pulses at the wrong tempo and mutes genuine reactivity. Onsets are cheap accent signals, not a timing system.

## Section-Ready Sketch Baseline

Every review-deck sketch should be able to run as one recipe across a song and develop internally:

- Section 1: controlled but alive, with fine detail, coherent color, and no empty/static frame.
- Later sections: persistent increases in at least two of density, depth, scale, motion, structure, bloom, or palette tension.
- Cue events should alter sketch-owned layers, not only trigger a short global flash.
- Color variation should be tonal within the current palette family unless a `color-morph` deliberately changes the target.
- Stroke/linework should be an authored state: off or subtle by default, then lifted by section events when it improves readability.

Cue presets are available for cleaner `showcase.json` authoring:

```json
{ "preset": "storm-drop", "section_index": 1 }
{ "preset": "warm-build", "section_index": 1, "offset_seconds": 6 }
{ "preset": "colour-turn", "section_index": 2 }
{ "preset": "hard-cut-flash", "section_index": 2, "offset_seconds": 8 }
{ "preset": "afterglow", "time": 86 }
```

Presets can still be overridden per event by adding `event`, `duration_ms`, `intensity`, `target`, `color`, or `palette`.

Tracks without explicit `visual_events` receive default internal cue events derived from their `section_times`: focused center glow, staggered foreground/particle color turns, slow background or terrain palette morphs, motion drift, and grain/veil accents. Override them by adding `visual_events`, or disable them with:

```json
{
  "visual_config": {
    "default_events": false
  }
}
```

The default planner gives un-authored production tracks no more than three sketch identities. Its Automatic Sketch Deck is the authoritative ordinary pool: recipes must be production-ready, random-eligible, globally enabled, locally visible, and non-image-based. Synthetic cue boundaries and internal events continue the motion inside each identity. A deterministic roughly one-third subset of tracks may replace one middle or peak chapter with one eligible artwork/image-mosh accent; generated tracks never open with mosh.

Current artwork opener families include soft scan, horizontal slice, pixel islands, rain mosh, left-flow mosh, storm mosh, fracture mosh, and minimal ghost mosh. They are separate recipe IDs backed by the `cong-artwork-datamosh` kernel.

Explicitly authored tracks retain their declared section timing and are not padded with synthetic boundaries. Unless `single_sketch` is explicitly `false`, the first recipe in `visual_sequence` or `visual_steps` is held across all sections and internal events do the section work. Step moods/params still apply without recreating the visualizer. To intentionally rotate sketches in an authored plan, set:

```json
{
  "visual_config": {
    "single_sketch": false
  }
}
```

Default event generation also fills in at least five internal event points, using section cues plus additional timed gestures when a track has only a few section boundaries.

Several current sketch kernels also consume the same event state internally, beyond the canvas fallback:

- grid sketches: tile-by-tile color morphs, sweep emphasis, and motion lift.
- mist/smoke sketches: fog or noise cells change color gradually, with grain-bloom increasing density.
- rain/waterline/tide sketches: line and droplet colors morph independently from center/orb glows.
- planet-core: orbiting sparks and the central body can morph toward different cue colors.
- generative particles: particles can morph one-by-one while center forms morph separately.

## Cong Extraction Policy

Raw Cong sketches are source material, not production runtime code.

When extracting from `src/data/cong/**`:

- Preserve the visual behaviour, not the original globals.
- Do not call raw sketch functions directly from the explorer runtime.
- Move sketch constants into tuning presets.
- Convert `mouseX`, `mouseY`, current time hacks, and random global arrays into deterministic params, audio response, seeded randomness, or lifecycle-managed particle state.
- Record the source candidate in the Cong catalogue/library.
- Update `cong/ledger.ts` when a technique is extracted, confirmed, archived, parked, or rejected.
- Avoid explicit concentric circles, target-like pulses, or diagrammatic orbital rings. Prefer depth, blur, noise, veils, glows, smears, and field motion.

Rejected or parked candidates stay rejected/parked unless a human explicitly changes their status.

Use `VISUAL_REPERTOIRE.md` to check whether a new idea expands the ambient/textural/landscape vocabulary or merely repeats an existing particle/cloud/storm pattern.

## LLM Implementation Contract

When an LLM adds or modifies a visual technique, it must follow this checklist:

1. Identify whether the change belongs in tuning, recipe, storyboard, or kernel code.
2. Prefer `THREE_GENERATION_PROMPT.md` for new kernels; use `cong-generative-particles` only for legacy Canvas2D variants.
3. Add or update recipe metadata instead of hardcoding track-specific logic in a visualizer.
4. Add Cong catalogue/library entries when a Cong source sketch informs the work.
5. Implement the full `Visualizer` lifecycle: `setup`, `update`, `draw`, `onEvent`, `resize`, `destroy`.
6. Release arrays, buffers, and Q5 graphics resources in `destroy`.
7. Respect reduced motion by stopping particle advancement while leaving a nonblank stable frame.
8. Preserve exclusion-zone behaviour so the player UI remains readable.
9. Run `npm run lint` and `npm run build`.

Three kernels follow `THREE_GENERATION_PROMPT.md` and `THREE_INTEGRATION.md`: build with `createThreeVisualizer`, lazy-load Three, plumb standard song-structure uniforms/events via `three-scene-helpers.ts`, scale quality with dynamic loop bounds/draw ranges/render scale, and degrade to a stable Canvas2D fallback frame when WebGL is unavailable or the context is lost. They must preserve the existing sketch feature set: section progression, `onEvent` handling, palette shifts, reduced motion, exclusion readability, and review by recipe ID.

If a change cannot meet those rules, it should be treated as an experiment, not a production visual.

## Naming

Use names that explain intent:

- Kernel: technical family, e.g. `cong-generative-particles`.
- Tuning key: recipe-like preset, e.g. `cong-cloud-again-generative-default`.
- Recipe ID: public visual identity, e.g. `cong-cloud-again-generative`.
- Candidate ID: source/archive reference, e.g. `landscapeparticlesflow`.

Avoid names like `newstuff2`, `visual3`, or track-specific recipe IDs unless the visual is genuinely tied to a single reviewed moment.

## Debug And Review

The localhost-only `M` section mood lab is the review surface.

It should show enough information to discuss a visual clearly:

- album and track
- section index
- recipe ID
- kernel
- tuning key
- engine mode/emitter/field/renderer when available
- particle count and blend mode when available
- Cong source candidate
- current and next section recipe

The goal is that feedback can be specific: "use the landscape OG current but less trail" or "this section wants cloud-again, not storm".

## Iteration Review

New visual attempts should be reviewable as iterations, not destructive replacements.

When Brian says an iteration is not keeping:

- Keep the code/source record unless deletion is explicitly requested.
- Mark the ledger entry with `reviewState: 'not-keeping'`.
- Set `archiveStatus` to `archived`, `rejected`, or `parked` depending on whether the idea is complete-but-unused, wrong for the system, or worth revisiting later.
- Add `dispositionNotes` explaining why it is not staying active.
- Remove the recipe from default/storyboard pools if it should not appear in `/productions`.

When creating an iteration, expose a recipe ID and tell Brian how to view it. The review unit should be the recipe, not a hidden tuning change.

## Scaling Guidance

For 700 tracks:

- Put broad mood intent at album/storyboard level.
- Use explicit section plans only for important reviewed tracks.
- Avoid per-track visualizer code.
- Prefer recipe pools and anchors over hand-authored full sequences.
- Keep visual families small, documented, and reusable.

The explorer should become a storyboard engine with a strong visual vocabulary, not a pile of isolated sketches.
