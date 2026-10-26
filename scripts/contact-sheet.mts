#!/usr/bin/env tsx
/* ── Visual Contact Sheet ────────────────────────────────────
   Batch-render a thumbnail of every recipe into a single grid so
   you can eyeball catalogue-wide cohesion (one film stock? warm,
   consistent palette? any cold/odd outliers?) at a glance instead
   of waiting through tracks one at a time.

   Rides the existing dev override: ?lab=1&recipe=<id> forces a
   recipe onto whatever track is playing (see ExplorerShell). So it
   captures the *visual* of each recipe, not each track.

   USAGE (run locally — needs a dev server + Playwright):
     1. Terminal A:  npm run dev:productions        # serves :8084
     2. Terminal B:  npm i -D playwright && npx playwright install chromium
                     npm run contact-sheet
     Output: out/contact-sheet/index.html (+ per-recipe PNGs)

   ENV knobs:
     BASE_URL   default http://localhost:8084
     SETTLE_MS  default 6000   (let the scene ease in before the shot)
     WIDTH      default 640
     HEIGHT     default 360
     ONLY       'random' (live-deck recipes only) | 'all' (default)
──────────────────────────────────────────────────────────────── */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  listExplorerRecipes,
  listRandomRecipeIds,
  isProductionReadyRecipe,
} from '../src/components/explorer/runtime/recipes';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8084';
const SETTLE_MS = Number.parseInt(process.env.SETTLE_MS ?? '6000', 10);
const WIDTH = Number.parseInt(process.env.WIDTH ?? '640', 10);
const HEIGHT = Number.parseInt(process.env.HEIGHT ?? '360', 10);
const ONLY = (process.env.ONLY ?? 'all').toLowerCase();
const OUT_DIR = join(process.cwd(), 'out', 'contact-sheet');

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    console.error(
      '\nPlaywright is not installed. This is a local dev tool, so it is not a\n' +
      'project dependency. Install it then re-run:\n\n' +
      '  npm i -D playwright && npx playwright install chromium\n',
    );
    process.exit(1);
  }
}

interface Shot { id: string; profile: string; file: string; ok: boolean; }

async function main() {
  const { chromium } = await loadPlaywright();

  const recipes = listExplorerRecipes().filter(isProductionReadyRecipe);
  const liveDeck = new Set(listRandomRecipeIds());
  const targets = (ONLY === 'random' ? recipes.filter((r) => liveDeck.has(r.id)) : recipes)
    .slice()
    .sort((a, b) => (a.sceneProfile + a.id).localeCompare(b.sceneProfile + b.id));

  if (!targets.length) {
    console.error('No recipes to render.');
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Rendering ${targets.length} recipes from ${BASE_URL} → ${OUT_DIR}`);

  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  page.on('pageerror', (e) => console.warn(`  page error: ${e.message}`));

  const shots: Shot[] = [];
  for (let i = 0; i < targets.length; i += 1) {
    const r = targets[i];
    const file = `${r.id}.png`;
    const url = `${BASE_URL}/?lab=1&recipe=${encodeURIComponent(r.id)}`;
    process.stdout.write(`  [${i + 1}/${targets.length}] ${r.id} (${r.sceneProfile})… `);
    let ok = true;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(SETTLE_MS);            // let the scene ease in
      await page.screenshot({ path: join(OUT_DIR, file) });
      console.log('ok');
    } catch (err) {
      ok = false;
      console.log(`FAILED (${(err as Error).message})`);
    }
    shots.push({ id: r.id, profile: r.sceneProfile, file, ok });
  }

  await browser.close();
  await writeFile(join(OUT_DIR, 'index.html'), renderIndex(shots), 'utf8');
  console.log(`\nDone. Open ${join('out', 'contact-sheet', 'index.html')}`);
}

function renderIndex(shots: Shot[]): string {
  const cards = shots.map((s) => `
    <figure class="card${s.ok ? '' : ' err'}">
      ${s.ok ? `<img loading="lazy" src="./${s.file}" width="${WIDTH}" height="${HEIGHT}" alt="${s.id}">` : '<div class="missing">render failed</div>'}
      <figcaption><b>${s.id}</b><span>${s.profile}</span></figcaption>
    </figure>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Continuum contact sheet</title>
<style>
  body{margin:0;background:#04050a;color:#e8e6df;font:13px/1.4 ui-sans-serif,system-ui,sans-serif}
  header{padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.1)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(${WIDTH}px,1fr));gap:14px;padding:18px}
  .card{margin:0;background:#0a0c12;border:1px solid rgba(255,255,255,.08);border-radius:10px;overflow:hidden}
  .card.err{border-color:#7a3030}
  .card img{display:block;width:100%;height:auto}
  .missing{aspect-ratio:${WIDTH}/${HEIGHT};display:flex;align-items:center;justify-content:center;color:#9b9890}
  figcaption{display:flex;justify-content:space-between;gap:8px;padding:8px 10px;font-size:11px}
  figcaption span{color:#9b9890}
</style></head><body>
<header><b>Continuum contact sheet</b> — ${shots.length} recipes · sorted by scene family · review for one warm, consistent film stock and any outliers</header>
<div class="grid">${cards}</div>
</body></html>`;
}

main().catch((e) => { console.error(e); process.exit(1); });
