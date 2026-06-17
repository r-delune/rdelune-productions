# Explorer Tuning

Main tuning file:

- `src/components/explorer/tuning.ts`

This is the file to edit if you want to fine-tune live visual behaviour.

## What updates immediately

When local dev is running with `npm run dev`, changes to:

- `src/components/explorer/tuning.ts`

should hot-reload the `/productions/` page almost immediately.

## How it works

1. Visualizer presets live in `src/components/explorer/tuning.ts`
2. Recipes select one preset using `tuningKey` in `src/components/explorer/runtime/recipes.ts`
3. Storyboards or explicit track plans choose recipes in `public/data/showcase.json`

So the chain is:

- tuning preset → recipe → storyboard or track plan → live visual

For the visual-system contract, see `src/components/explorer/VISUAL_SYSTEM.md`.

For storyboard resolution rules, see `src/components/explorer/STORYBOARD_ARCHITECTURE.md`.

## Current tuneable families

- `cong-cloud-orbit`
- `cong-landscape-flow`
- `cong-generative-particles`
- `cong-rain-shower`
- `cong-contour-lines`
- `cong-planet-core`

## Safe editing pattern

If you want a new variant:

1. Duplicate a preset in `src/components/explorer/tuning.ts`
2. Give it a new key
3. Point a recipe at that key in `src/components/explorer/runtime/recipes.ts`
4. Use that recipe from album or track config in `public/data/showcase.json`

For particle/noise visuals, prefer a new `cong-generative-particles` tuning preset and recipe before adding a new visualizer kernel.

## Important rule

- Put tweakable numbers in `src/components/explorer/tuning.ts`
- Put rendering behaviour in the visualizer source files
- Put recipe identity (scene profile, baseline hue bias, recipe personality) in `src/components/explorer/runtime/recipes.ts`

## Runtime safety

- If a visualizer throws during setup, resize, event handling, or draw, the explorer runtime now falls back to the default native recipe instead of killing the whole `/productions` canvas.
- The recovery logic lives in `src/components/explorer/ExplorerCanvas.tsx`.

That keeps the architecture scalable as more Cong-derived techniques are added.
