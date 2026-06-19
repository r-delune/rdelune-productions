# Three Visual Concepts — Inspiration Catalogue

> **Hermes: read this before picking a technique.** Each brief is a cinematographer's shot list, not a shader spec.
> Pick a concept or propose a new one at the same richness level. If you can't answer "what does a viewer see at
> second 5?" in vivid, specific terms — pick a different concept.
>
> **The Concept Pitch Test** (required before any code): write 2 sentences — what the viewer sees at t=5s and at
> the section peak. If either sentence contains "a glowing circle," "a noise texture," or "particles moving" with
> no further scene detail, it fails. Try again.

---

## How to Use This File

1. Read all 8 concepts below. Note which families and techniques are still open (marked `!` in `VISUAL_LEDGER.md`).
2. Choose the concept that best fills the highest-priority gap. Do not pick a concept in the same technique family as an existing kernel unless the scene role is clearly distinct.
3. Write the concept pitch (2 sentences, t=5s + t=peak). Score it against the Aesthetic Rubric — must hit ≥ 8/10.
4. If it passes, proceed to implementation. If it fails, pick a different concept or propose a new brief here.

To propose a new concept: add a brief below in the same format. Concepts should name a specific physical or artistic phenomenon, not a generic technique.

---

## Concept 1 — `aurora-ribbon`
**Label:** Aurora Ribbon
**Reference:** Northern lights — soft curtains of luminous colour shifting slowly downward, overlapping in depth.
**Technique:** 6–10 thin horizontal screen-spanning quads at varying depths. Each quad carries a noise-displaced alpha mask (slow vertical wave). Additive blend. No geometry rasterisation — just overlapping soft planes. No particles.
**Scene at t=5s:** The viewer sees two or three faint luminous curtains floating at different screen depths, edges softly rippling, colour shifting from blue to violet across the width.
**Scene at t=peak:** Four or five curtains are fully saturated and overlapping, the colour arc spans the full width, subtle pulsing brightens the central band.
**Mood / Family / Role:** Light family — the primary gap. Outro / low-energy opener. `sceneProfile: light`.
**Anti-pattern:** Not a particle field. Not a lens flare. Not a vertical line grid. The curtains have soft, irregular edges — they look gaseous, not ruled.

---

## Concept 2 — `depth-fog-corridor`
**Label:** Depth Fog Corridor
**Reference:** Fog layers receding toward a lit vanishing point in a forest or canyon, each layer slightly lighter than the last.
**Technique:** Volumetric slab raymarching — 4–6 depth planes of exponential fog density. Section progress pushes the viewer "deeper" (fog planes shift apart). No instanced geometry. The horizon glows faintly; the near plane is dense.
**Scene at t=5s:** A muted, nearly dark frame with a faint bright point at the horizon. Thick haze fills the lower half. The vanishing point pulls the eye but is barely visible.
**Scene at t=peak:** The corridor opens — depth planes separate, the horizon brightens, haze thins just enough to suggest a space beyond. A sense of emergence, not explosion.
**Mood / Family / Role:** Sparse Minimal / outro. Low-energy tracks, closing sections. `sceneProfile: sparse`.
**Anti-pattern:** Not volumetric fog recycled (three-volumetric-fog is atmospheric ambient — this has a horizon and directional depth). Not a tunnel. Not a zoom.

---

## Concept 3 — `molten-surface`
**Label:** Molten Surface
**Reference:** Slow lava convection: bright glowing cracks between dark cooling cells, cells contracting and expanding over minutes.
**Technique:** Voronoi distance field in the fragment shader. Cell edges glow (distance to nearest cell boundary → brightness). Cells distort with slow domain-warped time. Section arc: section 1 = dense/small cells dimly cracked; section 3 = wider cells, bright fissures; section 5 = fading back to dark cool.
**Scene at t=5s:** A dark textured surface, faint orange-gold veins tracing cell boundaries, slowly shifting — like cooling obsidian with heat still underneath.
**Scene at t=peak:** Cells widen, veins become bright rivers of light, the palette shifts toward deep amber and red. Looks genuinely hot and pressurised.
**Mood / Family / Role:** Texture family. Mid-section / climax accent. `sceneProfile: geology`.
**Anti-pattern:** Not `three-flat-material` (which is sediment grain / mineral veins — static mineral, no convection). The key difference is liquid motion: cells drift and merge. Not an explosion. Not grid lines.

---

## Concept 4 — `dust-column`
**Label:** Dust Column
**Reference:** Desert dust devil or backstage theatre lighting — a slowly rising column of illuminated particulate caught in a side-lit beam.
**Technique:** Instanced billboard quads (not point sprites). Each quad: alpha-noise texture, slow upward drift, random horizontal scatter within a narrow column. Side lighting via a uniform direction; quads brighten at the lit edge. Very low density (300–600 quads).
**Scene at t=5s:** A faint column of slow upward-drifting dust particles, barely visible, lit from the left. The column breathes — expanding and contracting gently.
**Scene at t=peak:** The column is fuller, lit more brightly, the upward drift slightly faster. The particles never become a uniform cloud — there are always gaps and clusters.
**Mood / Family / Role:** Atmosphere / Weather. Can open or fill mid-section. `sceneProfile: mist`.
**Anti-pattern:** Not `three-curl-flow` (which is a horizontal landscape field of 100k+ points). This is vertical, sparse, and uses billboard quads with soft alpha textures — it reads as air, not data.

---

## Concept 5 — `ink-diffusion`
**Label:** Ink Diffusion
**Reference:** Ink dropped into still water — dense plume expanding, tendrils curling, slow viscous mixing.
**Technique:** Ping-pong FBO reaction-diffusion. Each pass: read previous frame, apply domain-warp vector field (slow curl), diffuse slightly. No artwork — starts from a seeded seed point and grows. Monochrome or near-monochrome (ink black on pale, or near-white on deep dark). Section arc drives injection rate.
**Scene at t=5s:** A small dark cloud has bloomed from the centre, tendrils reaching outward in organic curves, slowing near the edges.
**Scene at t=peak:** The diffusion has spread to 60% of the frame, tendrils have split and curled back on themselves, creating enclosed loops. The frame feels heavy with pressure.
**Mood / Family / Role:** Texture family — distinct from `three-artwork-flux` (which uses album art as source). This is generative, monochrome, and looks liquid. `sceneProfile: ink`.
**Anti-pattern:** Not `three-artwork-flux`. Not a smoke simulation. Not colourful. The visual language is specifically ink — the density gradient from centre to edge, the tendrils splitting.

---

## Concept 6 — `crystal-lattice`
**Label:** Crystal Lattice
**Reference:** A single crystal or mineral specimen slowly rotating — edges catching light, facets reflecting colour.
**Technique:** SDF wireframe of a sparse 3-D structure (cube, octahedron, or dodecahedron). Render only the edges (distance to nearest edge → brightness). Slow Y-axis rotation (< 1 RPM). Fresnel on struts: edges brighten at grazing viewing angles. Low particle count — 0 actual particles; pure SDF math.
**Scene at t=5s:** A faint geometric lattice floating in deep dark space, edges barely visible, slowly rotating. The shape is clear but not harsh — edges glow softly.
**Scene at t=peak:** Edges brighten, a secondary harmonic (octave lattice, half-scale) appears inside the outer form. Colour shifts toward the palette accent. The whole structure pulses with the section arc, not the beat.
**Mood / Family / Role:** Grid / Structure family — the primary gap. Focused/outro sections. `sceneProfile: grid`.
**Anti-pattern:** Not a wireframe sphere (too basic). Not a rotating UI element. Not a particle cage. The lattice is sparse and jewel-like — its beauty is in the SDF glow, not in density.

---

## Concept 7 — `light-shaft`
**Label:** Light Shaft
**Reference:** God rays through stained glass or forest canopy — visible beams of light in dusty air, fanning from a single source.
**Technique:** Volumetric light cone: instanced flat slabs arranged as a cone/fan from a top-screen source point. Each slab: density from noise, additive blend, very low opacity. Section arc drives beam width and density. No particles — purely overlapping translucent quads in a fan.
**Scene at t=5s:** Two or three faint beams of pale light descend from the top of the frame, slightly offset. Dust density in each beam shifts slowly. Deep dark background.
**Scene at t=peak:** The fan widens to 5 or 6 beams, each brighter, their density peaks create visible bright columns. The source point glows.
**Mood / Family / Role:** Light family — the direct gap. `sceneProfile: light`. Mid to outro sections.
**Anti-pattern:** Not a lens flare. Not a sun texture. Not a radial gradient. The beams are volumetric — they have internal density variation (bright/dark bands within a single shaft).

---

## Concept 8 — `terrain-silhouette`
**Label:** Terrain Silhouette
**Reference:** A dark mountain ridge against a deep twilight sky — the silhouette of landscape against faint atmospheric glow, stars above.
**Technique:** Two-layer height field in the fragment shader. Bottom layer: ridge height sampled from slow fbm noise → dark silhouette. Top layer: star field (hash-based sparse bright points, very low density). Horizon glow: exponential falloff from y=horizon in atmosphere colour. Section arc reveals stars (start occluded, end clear). Subtle parallax: layers move at different speeds with slow camera drift.
**Scene at t=5s:** A dark irregular ridge occupies the lower third of the frame. A faint amber/violet horizon glow sits above it. A handful of faint stars are visible through light haze.
**Scene at t=peak:** The ridge detail sharpens slightly, the horizon glow intensifies, more stars become visible. The mood is still, cinematic, and vast.
**Mood / Family / Role:** Landscape family — specifically fills the depth/horizon gap not covered by `cong-landscape-flow` (which is a particle flow field, not a scene). `sceneProfile: cloud`.
**Anti-pattern:** Not a particle landscape. Not a 3-D terrain mesh. Not animated with vertical motion. The ridgeline is still — only the stars and glow drift. The feeling is stillness, not flight.

---

## Adding New Concepts

Propose new concepts by appending a brief above this section in the same format. A valid brief must:
- Name a specific physical or artistic reference (not a technique description)
- Pass the Concept Pitch Test (2 vivid sentences: t=5s + t=peak)
- Name a scene profile and family gap it fills
- Include one anti-pattern note distinguishing it from the nearest existing kernel
