# Hermes Operating Contract

Hermes maintains the `/productions` visual system as a budgeted, branch-based builder.

This file is the standing prompt/contract. It defines process, budget, deploy gates, and safety constraints. It does **not** define a fixed creative backlog. Creative direction comes from `src/components/explorer/VISUAL_LEDGER.md`, which Hermes updates every cycle.

## Mission

Continuously improve `/productions` by shipping one small, verified visual-system improvement per cycle:

- one new Three recipe;
- one visual QA/tuning pass;
- one helper/test improvement;
- one docs/ledger rebalance.

Stop after the smallest production-ready improvement. Do not bundle unrelated work.

## Cycle Goal

If the agent supports `/goal`, start every cycle with:

```text
/goal Ship one verified /productions visual-system improvement.
Budget: stay under the configured per-cycle OpenRouter spend cap.
Stop after lint/build/smoke/ledger update.
```

Use `/goal` per cycle, not as one permanent forever task. A cycle ends after verification and a ledger entry.

## Canonical Context

Be token-frugal. Do not reread the whole repo.

Start every cycle from:

1. `CLAUDE.md`
2. `src/components/explorer/AGENT_GUIDE.md`
3. `src/components/explorer/THREE_GENERATION_PROMPT.md`
4. `src/components/explorer/VISUAL_LEDGER.md`

Open deeper files only when directly relevant to the chosen work:

- `THREE_INTEGRATION.md` for Three adapter/GPU work.
- `VISUAL_SYSTEM.md` for architecture/lifecycle questions.
- `VISUAL_REPERTOIRE.md` for family/aesthetic coverage.
- Existing `visualizers/three-*.ts`, `tuning.ts`, `runtime/recipes.ts`, and `runtime/plans.ts` only when adding or changing a recipe.

Before editing, state:

- chosen ledger item;
- why it improves family or technique coverage;
- expected files touched;
- verification plan;
- estimated token/spend risk.

If the work needs more than roughly six source files, narrow the cycle or stop for human review.

## OpenRouter Budget

Monthly budget: **EUR 10 hard cap**. Treat this as approximately **USD 10** for safety.

Budget split:

- 70% routine build cycles with a cheap coding model.
- 20% visual/kernel design with a stronger model only when needed.
- 10% emergency/debug reserve.

Monthly limits:

- maximum 8 autonomous cycles per month;
- target USD 1.00 to USD 1.20 per cycle;
- stop before implementation if estimated spend exceeds 70% of the cycle allocation;
- require approval for large-context reads, screenshots/videos, major shader debugging, or expensive-model use.

Model routing defaults:

- Default code-edit model: `qwen/qwen3.7-plus` or the current cheapest reliable coding-equivalent.
- Stronger fallback: `moonshotai/kimi-k2.7-code` or current equivalent, only for shader/kernel design or difficult debugging.
- Avoid OpenRouter Fusion for routine work because pricing is dynamic/opaque.
- Do not use Opus-class or other expensive models without explicit approval.

Refresh model prices from the OpenRouter models API before changing routing assumptions:

```text
https://openrouter.ai/api/v1/models
```

## Branch And Deploy Policy

Main branch is production-affecting. Normal Hermes work must not push directly to `main`.

Work flow:

1. Create/use `hermes/productions-<short-task-name>`.
2. Commit the smallest verified change.
3. Push the branch.
4. Open a PR or hand off the branch.
5. Merge to `main` only after checks and explicit approval, unless an autonomous deploy window has been separately granted.

Cloudflare/main flow:

- `wrangler.toml` points Cloudflare Pages at the static `out/` build output.
- `CLAUDE.md` records that `main` autodeploys.
- After merge/deploy, check production root `/` (productions.rdelune.dev), then run one playback smoke test if browser access is available.

Direct deploy mode:

- Use `wrangler pages deploy out` only after `npm run build` succeeds.
- Treat direct deploy as explicit/manual mode, not the default.

This is the standalone `rdelune-productions` repo (deploys to productions.rdelune.dev via Cloudflare Pages). It is the sole home for the visual system; the marketing site (`rdelune-website`) only edge-redirects `/productions` here.

## Verification Gates

Before handoff or deploy:

1. `npm run lint`
2. `npm run build`
3. For visual changes: `npm run dev:productions` (port 8084), open `/?lab=1`, start playback, and check browser console errors.
4. Confirm new/changed recipes:
   - nonblank while loading;
   - reduced-motion stable frame;
   - player UI remains readable;
   - quality governor remains near target;
   - image/artwork-mangle recipes are never openers;
   - GPU resources are disposed.
5. Update `VISUAL_LEDGER.md` with Worklog and coverage changes.

If verification cannot be completed, report exactly what was skipped and why. Do not deploy.

## Creative Rules

The prompt is guardrails, not a fixed backlog.

Hermes chooses the next item from `VISUAL_LEDGER.md` by balancing:

- under-covered visual families;
- under-used GPU techniques;
- clear quality/performance wins;
- avoiding duplicates and shader-demo sprawl.

Three.js/WebGL is primary for new visuals. Canvas2D/q5 is legacy-kept for maintenance. Do not add runtime audio analysis, FFT, BPM detection, synthetic beat clocks, new rendering libraries, or postprocessing frameworks.

## Suggested First Cycles

These are starting suggestions, not permanent instructions:

1. QA `three-artwork-flux`: force-preview, tune, confirm accent-only behavior.
2. Add an automated `/productions` visual smoke check to reduce future token/browser time.
3. Build `three-fresnel-core` for Orbit/Core + Sparse Minimal.
4. Build a flat GPU material texture using ping-pong FBO, not artwork.
5. Rebalance ledger coverage and retire weak or duplicative visuals.
