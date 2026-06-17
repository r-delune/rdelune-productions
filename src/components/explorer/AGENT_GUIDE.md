# Agent Guide — /productions Visual System

> **Read this first.** This is the canonical entry point for any human or LLM/agent working on the
> `/productions` generative visual system. It states the aesthetic, the hard rules, and routes you to the
> right deeper doc for whatever you're doing. The deep docs (`THREE_GENERATION_PROMPT.md`,
> `THREE_INTEGRATION.md`, `VISUAL_SYSTEM.md`, `VISUAL_REPERTOIRE.md`, `VISUAL_LEDGER.md`) expand on
> the layers below — don't duplicate them, route to them.
>
> Doing ongoing work? Pull your task from **`VISUAL_LEDGER.md`** (same dir) and follow its per-cycle protocol.
> Running as Hermes/autonomous agent? Read repo-root **`HERMES.md`** first for OpenRouter budget, branch,
> deploy, and `/goal` rules.

---

## 1. The Aesthetic (single source of truth)

**Moody, textural, deep, and section-responsive — never CPU-heavy.**

- **Moody and cinematic** — dark backgrounds, slow drift, controlled glow. Not chaotic, not cheerful.
- **Landscape-oriented depth** — wide horizons, depth planes, parallax, vanishing points.
- **Intricate at rest, alive under music** — beautiful with no audio, then responds dramatically to bass,
  transients, and song structure.
- **Organic, never mechanical** — curves over lines, drift over bounce, breathe over pulse.

The visual arc is owned by **song structure** — `section_times`, storyboard roles, visual steps, transitions,
and authored `visual_events`. Audio is an **accent**, never the timing system. Every sketch must be
section-ready, nonblank, tonal, atmospheric/textural, event-reactive, reduced-motion safe, and readable around
the player UI.

This language is canonical here and in `THREE_GENERATION_PROMPT.md`. If a sketch reads as a shader demo, a
diagram (concentric rings, target pulses, grids without jitter), or a denser duplicate of an existing family,
it's off-aesthetic — revise.

---

## 2. Sanctioned toolkit (what you may render with)

- **Three.js / WebGL is primary for new visuals** and is allowed ONLY behind the adapter — `createThreeVisualizer` in `three-visualizer.ts`,
  lazy-loaded via the shared `threeHost` (`three-host.ts`). It must degrade to a Canvas2D fallback frame when
  WebGL is unavailable. Use Three to add **richer scene metaphors Canvas2D can't do** (true depth, reveal,
  caustics, volumetric light) and to fill documented repertoire gaps — not isolated shader demos or denser
  copies of existing Canvas2D moods.
- **Canvas2D / q5.js is legacy-kept.** Existing kernels remain production code and may be fixed or tuned. New
  Canvas2D sketches need a clear reason that Three cannot serve better. q5 supplies Perlin noise and the draw
  loop only.
- **No other rendering libraries.** No raw p5, no DOM/SVG animation libraries, no new render frameworks. If you
  think you need one, you don't — express the idea in Canvas2D or behind the Three adapter.

---

## 3. The audio rule, disambiguated

**Analyze audio conservatively. React to it generously.**

The hard rule is about *analysis*, not *reactivity*. You are encouraged to react vividly to the pre-computed,
already-smoothed `AudioSignal` — drive expansion, speed, glow, color, and impulse from it. What you must
**never** do is *generate* new audio data at runtime.

**Forbidden:** runtime tempo/BPM estimation, FFT, onset/beat detection, per-frame audio DSP, or synthetic beat
clocks for tracks that lack authored BPM. (`AudioSignal` is produced in `ShowcasePlayer.tsx`; authored-only
beat-clock injection lives in `ExplorerCanvas.tsx`. Don't add to either.)

What a kernel may read — `audio-signal.ts:6-26`:

```ts
export interface AudioSignal {
  energy: number;
  bass: number;
  mids: number;
  highs: number;
  transient: number;
  activity?: number;
  playing?: number;
  bassOnset?: number;      // 0–1 pulse on low-band onsets (kick-like)
  highOnset?: number;      // 0–1 pulse on high-band onsets (hat/snare-like)
  onsetStrength?: number;  // 0–1 combined onset strength
  beatPhase?: number;      // 0–1 within beat; undefined when track has no BPM metadata
  barPhase?: number;       // 0–1 within 4-beat bar; undefined without BPM
  beatPulse?: number;      // exp decay from 1.0 per downbeat; undefined without BPM
}
```

The `beat*`/`bar*` fields are **optional** — guard them (`audio.beatPulse ?? 0`). Unauthored-BPM tracks stay
alive via section cues, visual events, and lightweight energy/transient/onset accents only.

---

## 4. Decision router — am I adding new, or improving?

### Adding a NEW visual
Pick your render path, then follow that doc end-to-end:

- **Three.js / WebGL** → follow **`THREE_GENERATION_PROMPT.md`**, then **`THREE_INTEGRATION.md`** — adapter contract, GPU patterns (fullscreen
  shaders, instanced clouds, FBO ping-pong, `renderScale`), quality-via-uniforms, and the first-slice
  measurement gates. Three kernels implement `ThreeScene`, not `Visualizer` directly (§5).
- **Canvas2D / q5** → legacy maintenance only; archived guidance lives in `archive/2026-06-17_explorer-canvas2d-era/MASTER_PROMPT.md`.
- **Image / datamosh texture** → use the Three texture/feedback path in `THREE_GENERATION_PROMPT.md` and
  `THREE_INTEGRATION.md` (rare accent only — never an opener; see the mosh rule in §6). Historical Canvas2D
  datamosh notes live in `archive/2026-06-17_explorer-canvas2d-era/DATAMOSH_VISION.md`.

Then do the registration in §6 and the verification in §7.

### IMPROVING an existing sketch
Revisiting old sketches when a better version exists is first-class work, not an afterthought. Follow the
**Improvement Protocol in `VISUAL_LEDGER.md`** (depth-over-density, richer
section arcs, perf). Historical Canvas2D improvement notes live in `archive/2026-06-17_explorer-canvas2d-era/IMPROVEMENT_BRIEF.md`. Keep the recipe ID stable unless you're intentionally retiring it; re-run the full
verification; log the before/after in the ledger.

---

## 5. Lifecycle quick-reference

**Canvas2D kernels implement `Visualizer`** — `visualizer.ts:78-96`:

```ts
export interface Visualizer {
  setup(q, w, h, palette, tuning?, context?): void;   // once, on attach
  update(dt, params, audio, exclusion): void;          // every frame, before draw
  draw(q, ctx): void;                                  // every frame, render to Canvas2D
  onEvent(event): void;                                // when a musical visual event fires
  resize(w, h): void;                                  // on stage resize
  destroy(): void;                                     // on album switch / unmount — free buffers
}
```

**Three kernels implement `ThreeScene`** and are wrapped by `createThreeVisualizer(() => makeScene())` —
`three-visualizer.ts:46-66`:

```ts
export interface ThreeScene {
  build(args): void;                                   // create geometry/materials/uniforms (adapter-driven)
  update(dt, params, audio, exclusion): void;          // push uniforms only — NO rendering here
  onEvent(event): void;                                // eased uniform targets (color morph, surge, …)
  resize(w, h): void;
  dispose(): void;                                     // free EVERY geometry/material/texture/RT
  readonly scene; readonly camera;
  readonly renderScale?: number;                       // 0..1 internal res for heavy raymarch; blit upscales
}
```

The adapter owns the GL lifecycle, async load, context-loss recovery, reduced-motion (`dt=0`), and the 2D
blit. A Three scene never touches `CanvasRenderingContext2D`.

---

## 6. Registration touchpoints (the 5 + 1)

A new kernel is wired through these files (Canvas2D and Three are identical here):

1. **Kernel file** — `visualizers/<name>.ts`, exporting a `create<Name>()` factory.
2. **Name union + factory** — add to `VisualizerName` and the `FACTORIES` map in `visualizers/registry.ts`.
3. **Tuning** — add the interface, the `VisualizerTuningConfig` union member, a `VISUALIZER_TUNINGS` preset,
   and (Three) a resolver in `tuning.ts`. Tuning is declarative artistic knobs only.
4. **Recipe** — add to `RECIPES` in `runtime/recipes.ts` (kernel name + `tuningKey` + `sceneProfile` +
   `baseParams` + card styling). Recipes are the public visual vocabulary; tracks reference recipe IDs only.
5. **Pool slot** — add the recipe to `GENERATIVE_VARIETY_SEQUENCE` in `runtime/plans.ts` so it becomes
   eligible in variety storyboards. (Heavy mosh recipes join accent/mid-section pools only.)

**+1 — Mosh rule:** gentle artwork openers may open generated tracks (`pickArtworkOpener`); the heavy
artwork-mosh accent is a seeded ~20% replacement at section index 1 (`applyGeneratedMoshAccent`) and must
**NEVER** be an opener.

Add the smallest layer that expresses the idea — a new mood is often just a recipe or a tuning preset, not a
new kernel. Only add a kernel when the rendering structure is genuinely different.

---

## 7. Performance non-negotiables

- **`q.noise()` costs 4 Perlin evals** — the shared q5 instance runs `noiseDetail(4)`. Never wrap it in an
  octave loop. For fbm, use `fbm()` from `cong-particle-primitives.ts`, which uses its own single-octave
  source — never stack octaves on the shared instance.
- **Counts via `getParticleBudget(desktopCount, width)`** (`cong-particle-primitives.ts`) — it halves on
  mobile and applies the quality scale.
- **Quality governor** (`render-quality.ts`, `getQualityScale()` → 0.55–1.0) scales **frame-local** params
  only. Never mutate persistent lerp targets with it.
- **Reduced motion** — Canvas2D: call `hasReducedMotion()` and freeze time (`dt = 0`) to a stable, nonblank
  frame. Three: the adapter already passes `dt=0`; ensure your idle frame is non-blank.
- **Known sinks** — per-point `fillStyle` churn (batch into Path2D per color), per-frame Map/array allocation
  (reuse typed arrays), `getImageData` spikes (amortize over frames, low-res sample canvases), un-throttled
  offscreen redraws (cache, re-render at half/third rate), per-frame `CanvasGradient` creation (cache keyed by
  quantized color/geometry; ride per-frame alpha on `globalAlpha`), full noise-field refresh every frame
  (amortize round-robin). See `VISUAL_SYSTEM.md` for the full list.
- Free every buffer/geometry/material in `destroy()` / `dispose()`.

---

## 8. Definition of done / verify

1. `npm run lint` and `npm run build` pass.
2. Review in the **mood lab** — `npm run dev:productions` (port 8084, refreshes showcase data), press **`M`**.
   Plain `npm run dev` (8083) serves stale showcase data — don't review there.
3. Quality governor holds ~1.0 on target hardware; memory stays flat across album switches.
4. Reduced-motion produces a stable, nonblank frame.
5. Run it against the **Aesthetic Rubric** in `VISUAL_LEDGER.md` — fail any line → revise.
6. **Update `VISUAL_LEDGER.md`** — Worklog entry + Coverage Map update + any new improvement candidates noted.

Hermes additionally follows `HERMES.md`: work on a `hermes/productions-<task>` branch, respect the monthly
OpenRouter budget, and do not deploy or merge to `main` without the configured approval gate.

---

## 9. Deep-doc index

- **`THREE_GENERATION_PROMPT.md`** — primary Hermes/LLM handoff for new Three visuals.
- **`THREE_INTEGRATION.md`** — Three/WebGL adapter contract, GPU patterns, measurement gates.
- **`VISUAL_SYSTEM.md`** — the master architecture contract (layers, naming, noise-cost rules, design decisions).
- **`VISUAL_REPERTOIRE.md`** — the target family taxonomy + declared gaps. (What's worth building.)
- **`VISUAL_LEDGER.md`** — the living work queue, diversity ledger, aesthetic rubric, and per-cycle protocol.
- **`../../../HERMES.md`** — autonomous Hermes budget, branch, deploy, and token-frugal cycle contract.
- **`archive/2026-06-17_explorer-canvas2d-era/`** — historical Canvas2D/datamosh prompts for legacy maintenance only.
