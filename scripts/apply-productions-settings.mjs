import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const defaultsPath = resolve(repoRoot, 'src/components/explorer/production-defaults.json');
const recipesPath = resolve(repoRoot, 'src/components/explorer/runtime/recipes.ts');
const bundleVersion = 1;

function usage() {
  console.error('Usage: npm run apply-productions-settings -- path/to/productions-settings.json');
}

function normalizeStringArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  return Array.from(new Set(value.map((item) => {
    if (typeof item !== 'string' || !item.trim()) {
      throw new Error(`${fieldName} must contain only non-empty strings`);
    }
    return item;
  })));
}

function extractRecipeIds(source) {
  return new Set([...source.matchAll(/^\s*'([^']+)':\s*\{/gm)].map((match) => match[1]));
}

function validateRecipeIds(ids, fieldName, knownRecipeIds) {
  const invalid = ids.filter((id) => !knownRecipeIds.has(id));
  if (invalid.length) {
    throw new Error(`${fieldName} contains unknown recipe id(s): ${invalid.join(', ')}`);
  }
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    usage();
    process.exitCode = 1;
    return;
  }

  const [inputRaw, recipesRaw] = await Promise.all([
    readFile(resolve(process.cwd(), inputPath), 'utf8'),
    readFile(recipesPath, 'utf8'),
  ]);
  const knownRecipeIds = extractRecipeIds(recipesRaw);
  const bundle = JSON.parse(inputRaw);
  const source = bundle?.settings && typeof bundle.settings === 'object' ? bundle.settings : bundle;
  const settings = {
    colorOnlyWhilePlaying: source.colorOnlyWhilePlaying === true,
    startupSketchDeck: normalizeStringArray(source.startupSketchDeck, 'startupSketchDeck'),
    localDisabledSketches: normalizeStringArray(source.localDisabledSketches ?? [], 'localDisabledSketches'),
  };

  validateRecipeIds(settings.startupSketchDeck, 'startupSketchDeck', knownRecipeIds);
  validateRecipeIds(settings.localDisabledSketches, 'localDisabledSketches', knownRecipeIds);

  const archived = new Set(settings.localDisabledSketches);
  settings.startupSketchDeck = settings.startupSketchDeck.filter((recipeId) => !archived.has(recipeId));

  if (!settings.startupSketchDeck.length) {
    throw new Error('startupSketchDeck must contain at least one recipe id');
  }

  const nextDefaults = {
    version: Number.isFinite(bundle?.version) ? Number(bundle.version) : bundleVersion,
    settings,
  };

  await writeFile(defaultsPath, `${JSON.stringify(nextDefaults, null, 2)}\n`);
  console.log(`Updated ${defaultsPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
