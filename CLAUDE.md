# rdelune-productions

Standalone Next.js 15 static-export app for the **Roam Productions** music experience — the full-screen
immersive audio/visual explorer. Deploys to **productions.rdelune.dev** via Cloudflare Pages. This repo is
the **sole home** for the `/productions` visual system; the marketing site (`rdelune-website`) only
edge-redirects `/productions` here.

## Stack
- Next.js 15 (App Router, static export via `output: 'export'`)
- TypeScript strict
- Tailwind CSS with CSS custom properties for theming
- No animation libraries -- pure CSS keyframes plus the visual runtime. Three.js/WebGL is the primary path for new visuals and must stay behind the Three adapter (see `src/components/explorer/THREE_GENERATION_PROMPT.md` and `src/components/explorer/THREE_INTEGRATION.md`): Three.js is lazy-loaded, stays behind `createThreeVisualizer`, and degrades to a Canvas2D fallback frame. Existing Canvas2D/q5 kernels are legacy-kept and still maintained.

## App Structure
- The explorer is the **root route `/`** (`src/app/page.tsx` → `ExplorerShell`); `src/app/layout.tsx` is the productions-specific shell (dark theme, fonts, `siteUrl = https://productions.rdelune.dev`).
- Full-screen immersive canvas, no site chrome. PWA: `public/manifest.json`, `PwaRegistrar`.
- Analytics: `functions/` (Cloudflare Pages Functions: `_middleware.js`, `api/stats.ts`, `api/event.ts`) backed by the D1 database `rdelune-analytics` (binding `DB`, see `wrangler.toml`, `migrations/`). `PageTracker` + `src/lib/analytics.ts` emit events.

## Data Layer
- Showcase data originates from the **ableton_manager** backend, which publishes to R2 at `audio.rdelune.dev` (the **data CDN**, not this app's host): raw `showcase.json`, audio renders under `/renders/`, artwork under `/album-artwork-web/`. Track audio `src` and `artworkUrl` are absolute `audio.rdelune.dev/...` URLs baked in by that backend.
  - **Build step** `scripts/fetch-tracks.mjs` (runs in `npm run build` and `dev:productions`) fetches the raw `audio.rdelune.dev/showcase.json` (override via `SHOWCASE_SOURCE_URL`), transforms snake_case → camelCase, validates track URLs, nulls unplayable/non-mp3 tracks, normalizes `section_times`, and writes the processed `public/data/showcase.json` (gitignored)
  - **Runtime**: `ExplorerShell.tsx` fetches same-origin `/data/showcase.json` (the processed file), NOT the remote source
  - Plain `npm run dev` (port 8084) does NOT run the fetch step, so the local `public/data/showcase.json` may be stale/raw — use `npm run fetch-tracks` or `dev:productions` to refresh locally

## Conventions
- All interactive components use `'use client'` directive
- Heavy canvas components loaded via `next/dynamic` with `ssr: false`
- `useHydrated()` hook guards client-only styling to prevent SSR mismatches
- CSS variables defined in `src/app/globals.css`
- `prefers-reduced-motion` respected in both CSS and canvas components

## Visual System
- Entry point: `src/components/explorer/AGENT_GUIDE.md` — **read this first.** Canonical aesthetic (moody, textural, deep, section-responsive; never CPU-heavy), the audio rule (analyze-conservatively / react-generously), sanctioned toolkit (Three-primary for new visuals, Canvas2D/q5 legacy-kept, no other libs), and a router to the right deeper doc. New visual generation starts at `THREE_GENERATION_PROMPT.md`; deeper layers include architecture contract `VISUAL_SYSTEM.md` and family taxonomy `VISUAL_REPERTOIRE.md` (all same dir). Ongoing work pulls from the living queue `VISUAL_LEDGER.md` (Coverage Map, Technique Coverage, New-Visual Queue, Improvement Candidates, Aesthetic Rubric, per-cycle protocol).
- Hermes/autonomous work: read `HERMES.md` (repo root) before starting. It defines the OpenRouter budget, branch policy, deploy gates, `/goal` usage, and token-frugal cycle protocol.
- Layers: kernel (`visualizers/`) → tuning (`tuning.ts`) → recipe (`runtime/recipes.ts`) → plan/storyboard (`runtime/plans.ts`, `runtime/storyboard.ts`). Tracks reference recipe IDs only; add the smallest layer that expresses the idea.
- New kernel checklist: kernel file + `visualizers/registry.ts` (name union + factory) + `tuning.ts` (interface/preset/resolver) + recipe in `runtime/recipes.ts`. Rotation enrollment is by flags, not a list: a recipe appears automatically once it is `productionReady` (default) + `randomEligible` (default true) + not in `GLOBAL_DISABLED_RECIPE_IDS` (`listRandomRecipeIds` derives the live deck; `GENERATIVE_VARIETY_SEQUENCE` is only a fallback). Image-dependent recipes auto-route to the mosh-accent pool (never opener). Run `npm run check-rotation` (in `npm run verify`) to catch a finished-but-unreachable recipe. Implement the full Visualizer/ThreeScene lifecycle; free buffers in `destroy()`/`dispose()`; respect reduced motion (stable non-blank frame); use `getParticleBudget()` from `cong-particle-primitives.ts` for counts.
- Visual baseline: every production sketch, including Three/WebGL, should be section-ready, nonblank, tonal, atmospheric/textural, event-reactive, reduced-motion safe, and readable around the player UI. Three should add richer scene metaphors (depth, reveal, caustics, volumetric light), not isolated shader demos or denser duplicates of existing Canvas2D families.
- Mosh rule: gentle artwork openers may open generated tracks (`pickArtworkOpener`); the heavy artwork-mosh accent is a seeded ~20% replacement at section index 1 (`applyGeneratedMoshAccent`) and must NEVER be an opener. Heavy mosh recipes join accent/mid-section pools only.
- DESIGN DECISION (song structure first, low audio processing): `section_times`, storyboard roles, visual steps, transitions, and authored `visual_events` own the visual arc. BPM/beat-start come authored from the processed showcase file and may add subtle pulse only when present. Do NOT add runtime tempo estimation, heavy onset analysis, or per-frame audio DSP. Unauthored-BPM tracks must not receive synthetic beat clocks or bar-cue spam — they stay alive via section cues, visual events, and optional lightweight energy/transient/onset accents only. (`AudioSignal` in `audio-signal.ts`; analysis in `ShowcasePlayer.tsx`; authored-only beat-clock injection in `ExplorerCanvas.tsx`.)
- Known perf pitfalls: per-point fillStyle churn (batch into Path2D per color), per-frame Map/array allocation in kernels (reuse typed arrays), getImageData spikes (amortize over frames, operate on low-res sample canvases), un-throttled offscreen redraws (cache and re-render at half/third rate), Perlin octave compounding (the shared q5 instance runs `noiseDetail(4)` so each `q.noise()` = 4 evals; `fbm()` in `cong-particle-primitives.ts` therefore uses its own single-octave source — never stack octaves on the shared instance), full noise-field refreshes every frame (amortize round-robin like nightfall-ridges' layers), per-frame CanvasGradient creation (cache keyed by quantized color/geometry; ride per-frame alpha on globalAlpha). Quality governor (`render-quality.ts`) scales frame-local params — never mutate persistent lerp targets.
- Review surface: `M` key opens the mood lab on localhost, or append `?lab=1` (also `?debug=1`). Dev: `npm run dev:productions` (port 8084, refreshes showcase.json); plain `dev` (8084) serves stale showcase data.

## Build & Deploy
- `npm run dev` starts on port 8084
- `npm run dev:productions` runs `fetch-tracks` then dev on 8084 (refreshes showcase data)
- `npm run build` runs `fetch-tracks` then produces static output in `out/`
- `npm run lint` runs ESLint; `npm run check-rotation` is the rotation-reachability gate; `npm run verify` = lint + check-rotation + build
- Deploy: Cloudflare Pages (`wrangler.toml`, `pages_build_output_dir = "out"`) → **productions.rdelune.dev**. Main branch autodeploys; manual deploy via `wrangler pages deploy out` after a green `npm run build`.
- Autonomous agents work on `hermes/productions-<task>` branches and follow `HERMES.md` deploy gates.
