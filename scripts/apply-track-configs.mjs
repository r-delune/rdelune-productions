/**
 * apply-track-configs.mjs
 *
 * Reads per-track YAML configs from src/data/track-configs/**\/*.yaml and
 * patches them into public/data/showcase.json.
 *
 * Each YAML file path encodes album and track slugs:
 *   src/data/track-configs/{album-slug}/{track-slug}.yaml
 *
 * Slugs are matched against album/track names in showcase.json using:
 *   name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
 *
 * Usage:
 *   node scripts/apply-track-configs.mjs
 *   node scripts/apply-track-configs.mjs --dry-run   (print diff, no write)
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONFIGS_DIR = join(ROOT, 'src', 'data', 'track-configs');
const SHOWCASE_PATH = join(ROOT, 'public', 'data', 'showcase.json');

const isDryRun = process.argv.includes('--dry-run');

// ── Utilities ────────────────────────────────────────────────────────────────

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** Walk a directory recursively, yielding .yaml file paths. */
function* walkYaml(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walkYaml(full);
    } else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
      yield full;
    }
  }
}

/** Convert snake_case keys in an object to camelCase (shallow). */
function snakeToCamel(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
      v,
    ])
  );
}

/**
 * Convert a YAML sections[] entry to a VisualPlanConfigStep.
 * Strips `description`; renames `recipe` → `recipeId`; camelCases transition_ms.
 */
function sectionToStep(section) {
  const { description: _desc, recipe, transition_ms, params, palette, events, ...rest } = section;
  const step = { ...snakeToCamel(rest) };
  if (recipe) step.recipeId = recipe;
  if (transition_ms !== undefined) step.transitionMs = transition_ms;
  if (params) step.params = params;
  if (palette) step.palette = palette;
  if (events) step.events = events;
  return step;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const showcase = JSON.parse(readFileSync(SHOWCASE_PATH, 'utf-8'));

let patchCount = 0;
let errorCount = 0;

for (const yamlPath of walkYaml(CONFIGS_DIR)) {
  const relPath = relative(CONFIGS_DIR, yamlPath);
  const parts = relPath.replace(/\.ya?ml$/, '').split(/[\\/]/);

  if (parts.length !== 2) {
    console.warn(`[skip] ${relPath} — expected {album-slug}/{track-slug}.yaml`);
    continue;
  }

  const [albumSlug, trackSlug] = parts;
  let config;

  try {
    config = yaml.load(readFileSync(yamlPath, 'utf-8'));
  } catch (err) {
    console.error(`[error] ${relPath} — YAML parse failed: ${err.message}`);
    errorCount++;
    continue;
  }

  // Find matching album
  const album = showcase.albums?.find(a => slugify(a.name) === albumSlug);
  if (!album) {
    console.warn(`[miss]  ${relPath} — no album matching slug "${albumSlug}"`);
    continue;
  }

  // Find matching track
  const track = album.tracks?.find(t => slugify(t.title) === trackSlug);
  if (!track) {
    console.warn(`[miss]  ${relPath} — no track matching slug "${trackSlug}" in "${album.name}"`);
    continue;
  }

  // Apply section_times
  if (Array.isArray(config.section_times)) {
    track.section_times = config.section_times;
    track.section_times_source = 'manual';
  }

  // Apply visual_config.steps from sections[]
  const vc = config.visual_config;
  if (vc) {
    if (!track.visual_config) track.visual_config = {};

    if (vc.default_transition_ms !== undefined) {
      track.visual_config.default_transition_ms = vc.default_transition_ms;
    }

    if (Array.isArray(vc.sections)) {
      const expectedCount = (config.section_times?.length ?? 0) + 1;
      if (vc.sections.length !== expectedCount) {
        console.warn(
          `[warn]  ${relPath} — sections[] has ${vc.sections.length} entries but expected ${expectedCount} (section_times.length + 1)`
        );
      }
      track.visual_config.steps = vc.sections.map(sectionToStep);
    }
  }

  console.log(`[patch] ${album.name} / ${track.title}`);
  patchCount++;
}

if (errorCount > 0) {
  console.error(`\n${errorCount} YAML error(s) — aborting write.`);
  process.exit(1);
}

if (patchCount === 0) {
  console.log('No tracks matched — showcase.json unchanged.');
  process.exit(0);
}

if (isDryRun) {
  console.log(`\n--dry-run: would patch ${patchCount} track(s), no file written.`);
} else {
  writeFileSync(SHOWCASE_PATH, JSON.stringify(showcase, null, 2) + '\n');
  console.log(`\nPatched ${patchCount} track(s) → public/data/showcase.json`);
}
