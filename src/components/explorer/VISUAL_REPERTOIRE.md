# Explorer Visual Repertoire

This is the target vocabulary for `/productions`.

The goal is an extensive ambient, textural, landscape-adjacent library. The system should not collapse into four repeated themes. New visuals should add a clear family, technique, or mood role.

## Accounting

Use these files together:

- `cong/catalog.ts`: source material and extraction difficulty.
- `cong/library.ts`: what has been integrated into production kernels/recipes.
- `cong/ledger.ts`: review/archive state, extracted behaviours, active recipes, and revisit notes.

When Brian confirms a technique is complete, mark it in the ledger as `reviewState: 'confirmed'`. When it should stop appearing in future proposals, set `archiveStatus: 'archived'`, `rejected`, or `parked` with a clear note.

## Target Families

### Atmosphere

Soft, slow-moving spatial texture.

- cloud bloom
- mist fields
- fog sheets
- dust motes
- soft bloom feedback

Current coverage: `cong-cloud-orbit`, `cong-cloud-again-intro-generative`, `native-aurora-veil` (domain-warped fbm curtain fog on a low-res buffer — mist that does not read as particles), `three-volumetric-fog` (WebGL raymarched fog/cloud with true depth and soft light scatter).

### Landscape

Visuals that feel like terrain, horizons, valleys, ridgelines, or distance.

- horizon fields
- valley contours
- ridgelines
- topographic drift
- low landscape currents

Current coverage: `cong-contour-lines` (section-revealed parallax terraces with sparse ridge glints), `cong-landscape-flow`; `cong-horizon-field` is review-ready as a mirrored mist-horizon family.

### Weather

Natural vertical or diagonal motion.

- rain
- sleet
- sparse falling particles
- sidewind
- distant storm shimmer

Current coverage: `cong-rain-shower`, `cong-top-bottom-storm`.

### Water / Tide

Fluid, reflective movement without becoming a waveform visualizer.

- waterline shimmer
- caustic drift
- tide interference
- surface glints

Current coverage: `cong-waterline-shimmer`, `three-caustics` (WebGL refractive caustic web with high-band glints — fills the caustic-drift/surface-glints role without becoming a waveform visualizer).

### Texture

Ambient material surfaces.

- grain fields
- paper/noise erosion
- ink smudge
- cellular noise
- low-resolution blur feedback

Current coverage: native canvas overlays and grain only.

Current production texture accents: `cong-artwork-datamosh-rain-evolution` as a restrained legacy artwork mosh, and `three-artwork-flux` as the Three-first artwork texture/feedback path. They should appear occasionally as mid-section accents, never as openers. `cong-grain-erosion` is archived from production selection.

Partial coverage: `three-volumetric-fog` doubles as non-artwork material texture when it reads as atmosphere rather than particles.

Gap: a flat material/surface texture (grain, erosion, cellular) distinct from volumetric atmosphere.

### Light

Subtle luminous accents.

- ray grids
- glints
- chord flashes
- soft lens bloom

Current coverage: `grid-rays` and `random-chords` overlays.

Archived: `cong-chord-storm` should not be treated as an active production light/storm recipe.

Gap: light-only recipes that do not require dense particles.

### Linework

Drawn marks and paths.

- wandering lines
- bouncing strokes
- contour strokes
- chord paths
- ribbon trails

Current coverage: `cong-cloud-again-lines`, `cong-contour-lines`.

Gap: a non-cloud `cong-wandering-lines` recipe/kernel.

### Grid / Structure

Architectural and tiled motion.

- tile pulse
- broken grid
- scanline structure
- window/light grids
- restrained geometric pulse

Current coverage: `grid-rays` overlay.

Gap: `cong-grid-pulse` from `derkdisco`.

### Orbit / Core

Central forms and gravity wells.

- planet core
- rings
- orbital sparks
- gravity wells

Current coverage: `cong-planet-core`.

Gap: quieter core forms.

Three opportunity: a restrained fresnel bloom core can serve sparse, focus, or outro chapters when it stays scene-like rather than a generic orb.

### Sparse Minimal

Low-density afterglow scenes.

- single drifting forms
- small particle constellations
- nearly static cloud frames
- reduced-motion-friendly tableaux

Current coverage: partial through Cloud Again intro and cloud orbit lite.

Gap: intentional sparse/minimal recipes for album outros and low-energy tracks.

Three opportunity: fresnel core or near-still volumetric tableaux can provide premium low-density endings.

## Next Batch

Prioritize new GPU behaviour and shared polish over more particle presets:

1. **GPU fluid advection**: velocity-field ping-pong material for smoke/ink trails.
2. **Shared section easing**: role-aware easing curves so section arcs feel more musical across all kernels.
3. **Shared GLSL film grain/vignette**: one reusable finish for Three scenes.
4. **Reaction-diffusion tuning**: keep `three-reaction-diffusion` distinct from `three-flat-material` and fog.
5. Legacy maintenance candidates: `cong-grid-pulse`, `cong-horizon-field`, `cong-mist-noise`, `cong-wandering-lines` only when maintaining Canvas2D coverage.

## Rules

- Recipes are the public visual vocabulary.
- Kernels are only added when the rendering structure is genuinely different.
- Particle presets must not become the answer to every Cong source.
- A source sketch can be completed, archived, and still preserved as influence.
- Do not reintroduce parked/rejected sources without explicit human review.

## New Sketch Baseline

Every new review sketch should have one primary technique kernel and a five-section internal arc before it enters the review deck. Suitable kernels include noise fields, particles, kaleidoscope/symmetry, color interpolation, recursive trees, snowflakes, and Mandelbrot/Julia-style fractals.

`cong-lateral-current` is the reference for this rule: many left-to-right particles driven by noise, tonal color jitter rather than random RGB variation, optional linework, and section cues for density, movement, color turn, and afterglow. Next creative prototypes should build from this contract: `cong-symmetry-particles`, recursive/tree growth, snowflake field, then Mandelbrot/Julia once performance and antialiasing constraints are clear.
