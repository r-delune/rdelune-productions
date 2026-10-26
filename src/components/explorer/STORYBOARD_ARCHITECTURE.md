# Explorer Storyboard Architecture

The long-term goal for `/productions` is **not** to hand-author a bespoke sketch for every track.

The goal is to build a scalable storyboard system where:

- a small number of strong visual kernels can support a large catalogue
- `showcase.json` can describe intent at different levels of specificity
- important tracks can still opt into bespoke section-by-section plans
- the runtime remains clean, deterministic, and maintainable

For the broader visual-system contract, LLM implementation rules, and Q5 particle-engine guidance, see `src/components/explorer/VISUAL_SYSTEM.md`.

## Core Principle

Think in **layers of intent**:

1. **Visualizer kernel**
   - low-level renderer
   - lives in `src/components/explorer/visualizers/`
   - example: `cong-rain-shower`, `cong-waterline-shimmer`

2. **Recipe**
   - gives a kernel a reusable identity
   - sets baseline params, hue bias, scene profile, and tuning key
   - lives in `src/components/explorer/runtime/recipes.ts`

3. **Storyboard**
   - semantic description of a track arc
   - chooses a generated sequence based on template, focus, energy, variance, and anchors
   - generated in `src/components/explorer/runtime/storyboard.ts`

4. **Explicit section plan**
   - highest specificity
   - direct `steps` or `sequence` in `showcase.json`
   - used for hero tracks, signature works, or reviewed custom moments

## Decision Order

The planner should resolve visuals in this order:

1. explicit `steps`
2. explicit `sequence`
3. semantic `storyboard`
4. album fallback sequence
5. global default sequence

This keeps the system scalable:

- most tracks use storyboard-level intent
- albums can share mood families
- special tracks can still receive hand-shaped arcs

## What Belongs Where

### Use `tuning.ts` for:

- renderer knobs
- density counts
- alpha values
- movement ranges
- kernel-specific artistic calibration

### Use `recipes.ts` for:

- recipe personality
- baseline hue bias
- scene profile
- mapping a kernel into a reusable explorer identity

### Use `showcase.json` for:

- track metadata
- section cue times
- album defaults
- semantic storyboard intent
- explicit reviewed overrides for important tracks

## Good Scalable Workflow

For the majority of tracks:

1. assign `section_times`
2. assign album-level or track-level `storyboard`
3. review generated result in explorer
4. only promote to explicit `sequence` or `steps` if the track really needs custom direction

For priority tracks:

1. start from storyboard
2. review live output
3. replace weak sections with explicit `sequence` or `steps`
4. if a new visual language is needed, add a new recipe or kernel only after review

## Hygiene Rules

- Do not put renderer logic into `showcase.json`
- Do not add track-specific branches inside visualizer files
- Do not create a new kernel when a new recipe or storyboard template is enough
- Prefer semantic config over hardcoded recipe ids when scaling across many tracks
- Keep bespoke section plans reserved for important tracks and reviewed moments

## Example `storyboard`

```json
{
  "visual_config": {
    "storyboard": {
      "template": "journey",
      "focus": "flow",
      "energy": "medium",
      "variance": "medium",
      "anchors": {
        "intro": "cong-cloud-again-generative",
        "peak": "cong-rain-shower",
        "outro": "cong-waterline-shimmer"
      }
    }
  }
}
```

This means:

- keep the track semantically defined
- generate a stable recipe sequence from that intent
- reserve fully explicit plans for tracks that justify the extra authoring cost

Use the `mosh-arc` storyboard template only when the track intentionally stays inside the restrained artwork mosh while section cues drive internal stages. It should resolve to `cong-artwork-datamosh-rain-evolution` across the song; scan/slice, light rain, sparse flow/storm motion, chromatic-fault, and reformation behaviours are internal mosh stages rather than separate recipe picks. Avoid restoring square-like pixel islands or dense worm-like particle layers to production defaults.

## End Goal

The explorer should feel like a **storyboard engine for music**, not a random visualizer picker and not an impossible library of one-off sketches.

That means the codebase should optimize for:

- clear separation of concerns
- deterministic planning
- reusable visual language
- room for bespoke craft where it matters most
