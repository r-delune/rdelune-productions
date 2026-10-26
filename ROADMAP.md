# Roadmap

Planned work for rdelune-productions, the public listening app and PWA for
albums published from Roam Studio. Estimates are rough working hours.
Detailed design notes live in `continuum-coherence-pass.md`,
`CONTINUUM_HANDOFF.md` and `CONG_INTEGRATION_PLAN.md`.

**Total planned: ~70 hours**

## 1. Visual coherence ("Continuum" pass), ~27 h

Goal: every track reads as one warm, continuous world that follows the music,
not a slideshow of effects.

- [ ] **Land and tune the filmic lens pass** (2 h): run `npm run verify`
      locally, A/B `?exposure=`, settle `FILM_EXPOSURE` / `FILM_SATURATION`
      and the 7.5 s cross-kernel crossfade.
- [ ] **Dev inspector + `?seed=` override** (4 h): show the active plan,
      recipe, palette and section; make any plan replayable from a URL.
- [ ] **Bounded Director** (6 h): map section roles to named "currents"
      (parameter deltas) with seeded, energy-weighted micro-variation in
      `runtime/storyboard.ts`; add a cohesion-bias option.
- [ ] **Engine-level liquid field as the default base kernel** (8 h):
      ping-pong FBO and curl-noise advection; convert section recipes into
      parameter sets of it.
- [ ] **Depth and warmth for 3D-scene kernels** (4 h): `FogExp2` and IBL pass.
- [ ] **Catalogue contact sheet** (3 h): finish `scripts/contact-sheet.mts`,
      run it across all ~200 tracks, fix the outliers.

Done when the acceptance rubric in `continuum-coherence-pass.md` §11 passes
(replay-identical, one-world, no-pop, arc and lens tests).

## 2. Feed contract, ~13 h

See [`docs/showcase-feed-spec.md`](docs/showcase-feed-spec.md).

- [ ] **Validate the upstream feed against `docs/showcase-feed.schema.json`**
      in `scripts/fetch-tracks.mjs`, with readable build errors (3 h).
- [ ] **Contract test fixtures** (3 h): good feed, missing MP3, bad section
      times, legacy camelCase, run in CI.
- [ ] **`schema_version` handling** (2 h): accept the current and previous
      version for one release.
- [ ] **Beat-aware transitions** (5 h): when `bpm` / `beat_start_at` are
      present, snap section transitions to the nearest downbeat; fall back
      cleanly when they are null.

## 3. Privacy-light analytics, ~4 h

- [ ] Stop storing `user_agent` and `referrer` in `page_views`; keep path,
      country and timestamp only (new D1 migration plus `functions/api/event.ts`).
- [ ] Roll up raw events into daily counts and drop rows older than 30 days.
- [ ] Document what is collected in the README.

## 4. PWA and playback, ~9 h

- [ ] **Offline listening** (5 h): cache recently played MP3s and artwork in
      the service worker, with a size cap and clear eviction.
- [ ] **Media Session polish** (2 h): artwork, seek and next/previous on lock
      screens (`useProductionMediaSession.ts`).
- [ ] **Shareable deep links** (2 h): link to an album, track and timestamp.

## 5. Quality and tooling, ~13 h

- [ ] **Unit tests** (5 h): section-time normalisation (keep the script and
      runtime copies in sync), deterministic plan selection, palette mapping.
- [ ] **CI** (2 h): GitHub Actions running `npm run verify` on every push.
- [ ] **Reduced-motion and accessibility audit** (3 h): every kernel respects
      `prefers-reduced-motion`; keyboard and screen-reader pass on the player UI.
- [ ] **Docs reconciliation** (3 h): fold the visual-system notes into one
      current architecture doc (`continuum-coherence-pass.md` §12).

## Explicitly out of scope

- Changes to Roam Studio itself (the upstream publisher is a separate,
  proprietary app).
- The vortex / feedback-vortex visual family, `mandala` and `darkspirals`,
  skipped by design decision (see `CONG_INTEGRATION_PLAN.md`).
