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
3. **Pick one item.** Scan the **Coverage Map**, **Technique Coverage**, the **New-Visual Queue**, and **Improvement Candidates**.
   Choose the single highest-value item. Bias toward:
   - **under-covered families** over piling onto a well-covered mood (diversity);
   - **under-used GPU techniques** over another fullscreen shader;
   - **clear aesthetic or perf wins** on existing sketches (revisit old work when a better version exists);
   - **novel rendering structures** over yet another particle preset.
4. **Do the work.** New → follow `THREE_GENERATION_PROMPT.md` + `THREE_INTEGRATION.md`. Canvas2D work is legacy maintenance only. Improvement → follow the Improvement Protocol below.
5. **Self-review** against the **Aesthetic Rubric** below. Fail any line → revise and re-review. Don't ship a
   sketch that fails the rubric.
6. **Verify** with `npm run verify` (lint + `check-rotation` reachability + build) plus `AGENT_GUIDE.md` §8 and `HERMES.md` deploy gates (mood lab `M`, governor ~1.0, reduced-motion, no console errors). A finished sketch enters rotation by flags (`productionReady` + `randomEligible`), not by editing `GENERATIVE_VARIETY_SEQUENCE`; `check-rotation` fails if a finished recipe is unreachable.
7. **Log & rebalance.** Append a **Worklog** entry, update the **Coverage Map**, and add any new improvement
   candidates you noticed while working.

### Improvement Protocol (revisiting an existing sketch)
- Keep the recipe ID stable unless you're deliberately retiring it (note retirements in the ledger).
- State the specific win up front: perf headroom, depth-over-density, richer section arc, or aesthetic drift
  correction. One clear win per cycle beats a vague rewrite.
- A/B the before/after in the mood lab; confirm the governor isn't worse and memory stays flat.
- Record before → after in the Worklog so the trajectory is auditable and the work isn't redone.

---

## Coverage Map (diversity ledger)

Families mirror `VISUAL_REPERTOIRE.md`. Update counts/gaps as work lands. `+` = healthy, `~` = thin, `!` = gap.

| Family | State | Current coverage | Open gap |
|---|---|---|---|
| Atmosphere | + | `cong-cloud-orbit`, `cong-cloud-again-intro-generative`, `native-aurora-veil`, `three-volumetric-fog` | — |
| Landscape | + | `cong-contour-lines`, `cong-landscape-flow`, `cong-landscape-og-current`, `native-nightfall-ridges`, `cong-horizon-field` (review-ready) | — |
| Weather | + | `cong-rain-shower`, `cong-top-bottom-storm`, `native-sidewind-drift` | — |
| Water / Tide | + | `cong-waterline-shimmer`, `three-caustics` | — |
| Texture | + | native overlays/grain; `cong-artwork-datamosh-rain-evolution` (legacy restrained accent); `three-artwork-flux` (artwork feedback); `three-volumetric-fog` (partial) | flat material/surface texture (grain, erosion, cellular) distinct from volumetric atmosphere |
| Light | ~ | `grid-rays`, `random-chords` overlays | **!** light-only recipes that don't require dense particles |
| Linework | ~ | `cong-cloud-again-lines`, `cong-contour-lines` | **!** non-cloud `cong-wandering-lines` recipe/kernel |
| Grid / Structure | ! | `grid-rays` overlay | **!** `cong-grid-pulse` (restrained tile/grid pulse) from `derkdisco` |
| Orbit / Core | + | `cong-planet-core`, `native-gravity-current`, `three-fresnel-core` | near-still tableau still open |
| Sparse Minimal | ~ | `three-fresnel-core` (partial) | **!** intentional sparse/minimal recipes for outros & low-energy tracks; Three near-still tableaux |

When a technique is confirmed/retired, also reflect it in `cong/ledger.ts` (`reviewState`, `archiveStatus`).

---

## Technique Coverage

Rotate GPU techniques so the repertoire does not become only fullscreen fragment shaders.

| Technique | State | Current coverage | Next pressure |
|---|---|---|---|
| Fullscreen shader material | + | `three-caustics` | Avoid duplicate caustic/noise demos |
| Raymarch / volumetric | + | `three-volumetric-fog` | Near-still outro tableau |
| Instanced field | + | `three-curl-flow` | Only add if the scene role differs clearly |
| Ping-pong FBO feedback | + | `three-artwork-flux` | Flat material erosion or reaction surface |
| Artwork texture sampling | + | `three-artwork-flux` | Keep accent-only; never opener |
| Fresnel / SDF / core form | + | `three-fresnel-core` | — |
| Light-only GPU scene | ! | — | Glints/rays/bloom without dense particles |

---

## New-Visual Queue (prioritized)

Seeded from `VISUAL_REPERTOIRE.md` declared gaps + "Next Batch". Prefer Three-first rendering structures over more particle presets.

1. ~~**Fresnel bloom core**~~ — ✅ shipped as `three-fresnel-core` (2026-06-18)
2. **Flat material texture** — grain/erosion/cellular GPU surface distinct from volumetric fog. Fills Texture. (Three)
3. **Light-only recipe** — luminous glints/rays/soft bloom that does not need dense particles. Fills Light. (Three)
4. **Near-still volumetric tableau** — premium low-density ending for outros/low-energy tracks. Fills Sparse Minimal. (Three)
5. **Legacy Canvas2D maintenance** — `cong-grid-pulse`, `cong-mist-noise`, `cong-wandering-lines` only when the cycle is explicitly maintenance.

Creative-prototype track (from `VISUAL_REPERTOIRE.md` New Sketch Baseline, building off `cong-lateral-current`):
`cong-symmetry-particles` → recursive/tree growth → snowflake field → Mandelbrot/Julia (once perf & AA are clear).

---

## Improvement Candidates (revisit existing sketches)

Running list of existing sketches worth a better version. Add to this whenever you notice one; remove when done
(log it in the Worklog). Seed entries:

- _(none recorded yet — populate as the agent reviews the repertoire in the mood lab)_

Look for: sketches that read denser-than-deep, weak/absent five-section arcs, per-frame allocation or noise-cost
hotspots, gradients/`fillStyle` churn, aesthetic drift (mechanical motion, diagrammatic geometry, off-tone
color), or anything that blanks under reduced motion.

---

## Aesthetic Rubric (self-score every cycle — all must pass)

- [ ] **Moody & tonal** — dark, controlled glow; tonal color jitter, not random RGB; not chaotic/cheerful.
- [ ] **Landscape depth** — depth planes / horizon / parallax; not flat or diagrammatic.
- [ ] **Intricate at rest** — looks beautiful with no audio playing.
- [ ] **Organic, not mechanical** — curves over lines, drift over bounce; no concentric rings / target pulses /
      un-jittered grids.
- [ ] **Section arc present** — a five-section internal arc; visual evolves with song structure.
- [ ] **Audio as accent, not clock** — reacts generously to `AudioSignal`; no analysis/DSP/synthetic beat clock.
- [ ] **Reduced-motion safe** — stable, nonblank frame with `dt = 0`.
- [ ] **Readable around player UI** — respects the exclusion rect.
- [ ] **Adds diversity** — fills a family/technique/mood gap; not a denser duplicate of an existing family.
- [ ] **Performant** — governor holds ~1.0; uses `getParticleBudget`/`fbm`; frees buffers in `destroy`/`dispose`.

---

## Worklog (append-only)

Newest first. Format: `YYYY-MM-DD · new|improvement · <recipe/kernel> · <one-line outcome>`.

- 2026-06-18 · new · `three-fresnel-core` · fullscreen SDF Fresnel rim glow; fills Orbit/Core + Sparse Minimal gaps; startupEligible, section-arc, exclusion-rect support.
- 2026-06-17 · new · `three-artwork-flux` + GPU helpers · added CORS-safe artwork texture loading, ping-pong FBO support, reusable instanced-field helper, and Three-first agent docs.
- 2026-06-17 · meta · AGENT_GUIDE.md + VISUAL_LEDGER.md created · canonical aesthetic + continual-improvement system established.
