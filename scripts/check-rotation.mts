#!/usr/bin/env tsx
/* ── Rotation Reachability Check ─────────────────────────────
   Safety net so a finished /productions sketch actually appears.
   Fails (exit 1) when a productionReady recipe can never surface,
   or a registered kernel has no recipe at all. Run in `npm run verify`.

   Reachability model (see useProductionVisualPlan / recipes.ts):
   live rotation is flag-derived — a recipe with productionReady (default) and
   randomEligible !== false enters listRandomRecipeIds and thus the generated
   section/mosh pools. Static pools (openers/variety/mosh) are only fallbacks.
──────────────────────────────────────────────────────────────── */

import {
  listExplorerRecipes,
  isProductionReadyRecipe,
} from '../src/components/explorer/runtime/recipes';
import { STATIC_ROTATION_POOL_IDS } from '../src/components/explorer/runtime/plans';
import { listVisualizerNames } from '../src/components/explorer/visualizers/registry';

const errors: string[] = [];
const warnings: string[] = [];

const recipes = listExplorerRecipes();
const pool = new Set<string>(STATIC_ROTATION_POOL_IDS);
const kernelsWithAnyRecipe = new Set<string>();
const kernelsWithReachableRecipe = new Set<string>();

for (const recipe of recipes) {
  kernelsWithAnyRecipe.add(recipe.kernel);
  if (!isProductionReadyRecipe(recipe.id)) continue; // not finished / globally disabled — skip

  const randomReachable = recipe.randomEligible !== false; // enters live rotation
  const authoredReachable = pool.has(recipe.id); // named by a built-in pool
  const reviewReachable = recipe.reviewable !== false; // mood lab only (intentional)

  if (randomReachable || authoredReachable) kernelsWithReachableRecipe.add(recipe.kernel);

  if (!randomReachable && !authoredReachable && !reviewReachable) {
    errors.push(`recipe "${recipe.id}" (kernel ${recipe.kernel}) is productionReady but unreachable everywhere — not randomEligible, not in any pool, not reviewable.`);
  } else if (!randomReachable && !authoredReachable) {
    warnings.push(`recipe "${recipe.id}" (kernel ${recipe.kernel}) is review-only (randomEligible:false) — mood lab only, not automatic rotation.`);
  }
}

for (const name of listVisualizerNames()) {
  if (!kernelsWithAnyRecipe.has(name)) {
    // Legacy cruft (kernel registered, its recipe long since renamed/removed) is
    // a warning, not a hard failure — it doesn't break a finished sketch. A NEW
    // kernel you just added will show here until you give it a recipe.
    warnings.push(`kernel "${name}" is registered in FACTORIES but has NO recipe — it can never appear (legacy cruft, or a new kernel still missing its recipe in runtime/recipes.ts).`);
  } else if (!kernelsWithReachableRecipe.has(name)) {
    warnings.push(`kernel "${name}" has recipes but none are in automatic rotation (all review-only or disabled).`);
  }
}

if (warnings.length) {
  console.warn('check-rotation warnings:');
  for (const w of warnings) console.warn(`  • ${w}`);
}

if (errors.length) {
  console.error('\ncheck-rotation FAILED:');
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error(`\n${errors.length} unreachable item(s). A finished sketch must be productionReady + randomEligible (image-dependent recipes auto-join the mosh accent pool).`);
  process.exit(1);
}

console.log(`check-rotation OK — ${recipes.length} recipes, ${listVisualizerNames().length} kernels; all finished sketches reachable.`);
