import { getExplorerRecipe, isGloballyDisabledRecipe, isImageDependentRecipe, isProductionReadyRecipe, listRandomRecipeIds } from './runtime/recipes';
import type { ExplorerRecipeId } from './runtime/types';
import shippedDefaults from './production-defaults.json';

export interface ProductionsVisualSettings {
  colorOnlyWhilePlaying: boolean;
  automaticSketchDeck: ExplorerRecipeId[];
  localDisabledSketches: ExplorerRecipeId[];
  highStarTunePriority: boolean;
}

export interface ProductionsSettingsBundle {
  version: number;
  exportedAt: string;
  settings: ProductionsVisualSettings;
}

interface ShippedProductionsSettings {
  version?: number;
  settings?: RawProductionsVisualSettings;
}

type RawProductionsVisualSettings = Partial<ProductionsVisualSettings> & {
  startupSketchDeck?: ExplorerRecipeId[];
};

export const PRODUCTIONS_VISUAL_SETTINGS_STORAGE_KEY = 'productions-visual-settings-v1';
export const PRODUCTIONS_VISUAL_SETTINGS_SAVED_AT_STORAGE_KEY = 'productions-visual-settings-saved-at-v1';
export const PRODUCTIONS_VISUAL_SETTINGS_VERSION_STORAGE_KEY = 'productions-visual-settings-version-v1';
// Snapshot of the auto-eligible recipe set the saved deck was last reconciled
// against. Lets newly-finished sketches auto-enroll into a returning user's deck
// without clobbering their curation. See reconcileAutomaticDeckEnrollment.
export const PRODUCTIONS_AUTOMATIC_DECK_KNOWN_STORAGE_KEY = 'productions-automatic-deck-known-v1';
export const PRODUCTIONS_SETTINGS_BUNDLE_VERSION = 7;
export const LEGACY_HIDDEN_REVIEW_SKETCHES_STORAGE_KEY = 'productions-hidden-review-sketches-v1';

const LEGACY_STARTUP_SKETCH_DECK: readonly ExplorerRecipeId[] = [
  'cong-rain-shower',
  'cong-waterline-shimmer',
  'cong-lateral-current',
];
const FALLBACK_AUTOMATIC_SKETCH_DECK: readonly ExplorerRecipeId[] = listRandomRecipeIds()
  .filter((recipeId) => !isImageDependentRecipe(recipeId));

const FALLBACK_PRODUCTIONS_VISUAL_SETTINGS: ProductionsVisualSettings = {
  colorOnlyWhilePlaying: true,
  automaticSketchDeck: [...FALLBACK_AUTOMATIC_SKETCH_DECK],
  localDisabledSketches: [],
  highStarTunePriority: false,
};

const SHIPPED_DEFAULTS = shippedDefaults as ShippedProductionsSettings;

function recipeExists(recipeId: string): boolean {
  return getExplorerRecipe(recipeId).id === recipeId;
}

function isKnownProductionReadyRecipe(recipeId: string): boolean {
  return recipeExists(recipeId) && isProductionReadyRecipe(recipeId);
}

function isKnownGloballyDisabledRecipe(recipeId: string): boolean {
  return recipeExists(recipeId) && isGloballyDisabledRecipe(recipeId);
}

function normalizeAutomaticDeck(value: unknown, fallback: readonly ExplorerRecipeId[] = FALLBACK_AUTOMATIC_SKETCH_DECK): ExplorerRecipeId[] {
  const source = Array.isArray(value) ? value : fallback;
  const automaticIds = new Set(FALLBACK_AUTOMATIC_SKETCH_DECK);
  const normalized = source
    .filter((item): item is string => typeof item === 'string')
    .filter((item) => automaticIds.has(item));
  const normalizedFallback = fallback
    .filter((item): item is string => typeof item === 'string')
    .filter((item) => automaticIds.has(item));

  return normalized.length ? Array.from(new Set(normalized)) : Array.from(new Set(normalizedFallback));
}

function normalizeDisabledSketches(value: unknown, fallback: readonly ExplorerRecipeId[] = []): ExplorerRecipeId[] {
  const source = Array.isArray(value) ? value : fallback;
  const normalized = source
    .filter((item): item is string => typeof item === 'string')
    .filter((item) => isKnownProductionReadyRecipe(item) && !isGloballyDisabledRecipe(item));

  return Array.from(new Set(normalized));
}

export function normalizeProductionsVisualSettings(
  value: unknown,
  fallback: ProductionsVisualSettings = FALLBACK_PRODUCTIONS_VISUAL_SETTINGS,
): ProductionsVisualSettings {
  const raw = value && typeof value === 'object' ? value as RawProductionsVisualSettings : {};
  const localDisabledSketches = normalizeDisabledSketches(raw.localDisabledSketches, fallback.localDisabledSketches);
  const automaticSketchDeck = normalizeAutomaticDeck(raw.automaticSketchDeck ?? raw.startupSketchDeck, fallback.automaticSketchDeck);

  return {
    colorOnlyWhilePlaying: typeof raw.colorOnlyWhilePlaying === 'boolean'
      ? raw.colorOnlyWhilePlaying
      : fallback.colorOnlyWhilePlaying,
    automaticSketchDeck: automaticSketchDeck.length
      ? automaticSketchDeck
      : normalizeAutomaticDeck(FALLBACK_AUTOMATIC_SKETCH_DECK),
    localDisabledSketches,
    highStarTunePriority: typeof raw.highStarTunePriority === 'boolean'
      ? raw.highStarTunePriority
      : fallback.highStarTunePriority,
  };
}

export const SHIPPED_PRODUCTIONS_VISUAL_SETTINGS_VERSION = Number.isFinite(SHIPPED_DEFAULTS.version)
  ? Number(SHIPPED_DEFAULTS.version)
  : PRODUCTIONS_SETTINGS_BUNDLE_VERSION;

export const SHIPPED_PRODUCTIONS_VISUAL_SETTINGS = normalizeProductionsVisualSettings(
  SHIPPED_DEFAULTS.settings,
  FALLBACK_PRODUCTIONS_VISUAL_SETTINGS,
);

export const DEFAULT_AUTOMATIC_SKETCH_DECK: readonly ExplorerRecipeId[] = SHIPPED_PRODUCTIONS_VISUAL_SETTINGS.automaticSketchDeck;

export const DEFAULT_PRODUCTIONS_VISUAL_SETTINGS: ProductionsVisualSettings = {
  ...SHIPPED_PRODUCTIONS_VISUAL_SETTINGS,
  automaticSketchDeck: [...SHIPPED_PRODUCTIONS_VISUAL_SETTINGS.automaticSketchDeck],
  localDisabledSketches: [...SHIPPED_PRODUCTIONS_VISUAL_SETTINGS.localDisabledSketches],
};

function readLegacyHiddenReviewSketches(): ExplorerRecipeId[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_HIDDEN_REVIEW_SKETCHES_STORAGE_KEY);
    return normalizeDisabledSketches(raw ? JSON.parse(raw) : null);
  } catch {
    return [];
  }
}

function readKnownEligibleSnapshot(): ExplorerRecipeId[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PRODUCTIONS_AUTOMATIC_DECK_KNOWN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : null;
  } catch {
    return null;
  }
}

function writeKnownEligibleSnapshot(ids: readonly ExplorerRecipeId[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PRODUCTIONS_AUTOMATIC_DECK_KNOWN_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore local preference persistence failures.
  }
}

/**
 * Auto-enroll newly-finished sketches into a returning user's deck without
 * clobbering their curation. The current auto-eligible universe is
 * FALLBACK_AUTOMATIC_SKETCH_DECK (every randomEligible, non-image recipe). We
 * persist a snapshot of that universe; any recipe that becomes eligible *after*
 * the snapshot is unioned into the saved deck on the next load (skipping ones the
 * user has explicitly disabled). On first run the snapshot is simply seeded —
 * existing curated decks are preserved, only future additions enroll. Returns the
 * settings with the reconciled deck and advances the persisted snapshot.
 */
function reconcileAutomaticDeckEnrollment(settings: ProductionsVisualSettings): ProductionsVisualSettings {
  if (typeof window === 'undefined') return settings;
  const currentEligible = FALLBACK_AUTOMATIC_SKETCH_DECK;
  const knownSnapshot = readKnownEligibleSnapshot();
  writeKnownEligibleSnapshot(currentEligible);

  // First run under the snapshot scheme: seed only, preserve the deck as-is.
  if (knownSnapshot === null) return settings;

  const knownSet = new Set(knownSnapshot);
  const disabledSet = new Set(settings.localDisabledSketches);
  const newlyEligible = currentEligible.filter((id) => !knownSet.has(id) && !disabledSet.has(id));
  if (!newlyEligible.length) return settings;

  return {
    ...settings,
    automaticSketchDeck: Array.from(new Set([...settings.automaticSketchDeck, ...newlyEligible])),
  };
}

function mergeLocalWithShippedSettings(localSettings: ProductionsVisualSettings | null): ProductionsVisualSettings {
  if (!localSettings) return DEFAULT_PRODUCTIONS_VISUAL_SETTINGS;
  return normalizeProductionsVisualSettings({
    ...DEFAULT_PRODUCTIONS_VISUAL_SETTINGS,
    ...localSettings,
    automaticSketchDeck: localSettings.automaticSketchDeck,
    localDisabledSketches: localSettings.localDisabledSketches,
  }, DEFAULT_PRODUCTIONS_VISUAL_SETTINGS);
}

function migrateLegacyProductionsVisualSettings(settings: ProductionsVisualSettings): ProductionsVisualSettings {
  // v7: reset the deck to the full current eligible set so Three.js recipes
  // (and any other newly-shipped sketches) enroll for all returning users,
  // not just those who loaded after the reconciliation snapshot was seeded.
  return normalizeProductionsVisualSettings({
    ...settings,
    automaticSketchDeck: [...FALLBACK_AUTOMATIC_SKETCH_DECK],
  }, DEFAULT_PRODUCTIONS_VISUAL_SETTINGS);
}

export function readProductionsVisualSettings(): ProductionsVisualSettings {
  if (typeof window === 'undefined') return DEFAULT_PRODUCTIONS_VISUAL_SETTINGS;
  try {
    const raw = window.localStorage.getItem(PRODUCTIONS_VISUAL_SETTINGS_STORAGE_KEY);
    const storedVersion = Number(window.localStorage.getItem(PRODUCTIONS_VISUAL_SETTINGS_VERSION_STORAGE_KEY) ?? 0);
    const shouldMigrateLegacyDeck = raw ? !Number.isFinite(storedVersion) || storedVersion < PRODUCTIONS_SETTINGS_BUNDLE_VERSION : false;
    const localSettings = raw
      ? shouldMigrateLegacyDeck
        ? migrateLegacyProductionsVisualSettings(normalizeProductionsVisualSettings(JSON.parse(raw), DEFAULT_PRODUCTIONS_VISUAL_SETTINGS))
        : normalizeProductionsVisualSettings(JSON.parse(raw), DEFAULT_PRODUCTIONS_VISUAL_SETTINGS)
      : null;
    const legacyHidden = readLegacyHiddenReviewSketches();
    const merged = mergeLocalWithShippedSettings(localSettings);
    const withLegacyHidden = legacyHidden.length
      ? { ...merged, localDisabledSketches: Array.from(new Set([...merged.localDisabledSketches, ...legacyHidden])) }
      : merged;

    return reconcileAutomaticDeckEnrollment(withLegacyHidden);
  } catch {
    return DEFAULT_PRODUCTIONS_VISUAL_SETTINGS;
  }
}

export function writeProductionsVisualSettings(settings: ProductionsVisualSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PRODUCTIONS_VISUAL_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeProductionsVisualSettings(settings)));
    window.localStorage.setItem(PRODUCTIONS_VISUAL_SETTINGS_VERSION_STORAGE_KEY, String(PRODUCTIONS_SETTINGS_BUNDLE_VERSION));
    window.localStorage.setItem(PRODUCTIONS_VISUAL_SETTINGS_SAVED_AT_STORAGE_KEY, new Date().toISOString());
    window.localStorage.removeItem(LEGACY_HIDDEN_REVIEW_SKETCHES_STORAGE_KEY);
  } catch {
    // Ignore local preference persistence failures.
  }
}

export function resetLocalProductionsVisualSettings(): ProductionsVisualSettings {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(PRODUCTIONS_VISUAL_SETTINGS_STORAGE_KEY);
      window.localStorage.removeItem(PRODUCTIONS_VISUAL_SETTINGS_VERSION_STORAGE_KEY);
      window.localStorage.removeItem(PRODUCTIONS_VISUAL_SETTINGS_SAVED_AT_STORAGE_KEY);
      window.localStorage.removeItem(PRODUCTIONS_AUTOMATIC_DECK_KNOWN_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_HIDDEN_REVIEW_SKETCHES_STORAGE_KEY);
    } catch {
      // Ignore local preference persistence failures.
    }
  }

  return DEFAULT_PRODUCTIONS_VISUAL_SETTINGS;
}

export function readProductionsVisualSettingsSavedAt(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(PRODUCTIONS_VISUAL_SETTINGS_SAVED_AT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function createProductionsSettingsBundle(settings: ProductionsVisualSettings, exportedAt = new Date()): ProductionsSettingsBundle {
  return {
    version: PRODUCTIONS_SETTINGS_BUNDLE_VERSION,
    exportedAt: exportedAt.toISOString(),
    settings: normalizeProductionsVisualSettings(settings, DEFAULT_PRODUCTIONS_VISUAL_SETTINGS),
  };
}

function assertValidSettingsRecipeIds(value: unknown): void {
  const raw = value && typeof value === 'object' ? value as RawProductionsVisualSettings : {};
  const invalidIds: string[] = [];

  const automaticSketchDeck = raw.automaticSketchDeck ?? raw.startupSketchDeck;
  if (Array.isArray(automaticSketchDeck)) {
    automaticSketchDeck.forEach((item) => {
      if (typeof item !== 'string' || (!isKnownProductionReadyRecipe(item) && !isKnownGloballyDisabledRecipe(item))) {
        invalidIds.push(String(item));
      }
    });
  }

  if (Array.isArray(raw.localDisabledSketches)) {
    raw.localDisabledSketches.forEach((item) => {
      if (typeof item !== 'string' || (!isKnownProductionReadyRecipe(item) && !isKnownGloballyDisabledRecipe(item))) {
        invalidIds.push(String(item));
      }
    });
  }

  if (invalidIds.length) {
    throw new Error(`Invalid production settings recipe ids: ${Array.from(new Set(invalidIds)).join(', ')}`);
  }
}

export function parseProductionsSettingsBundle(value: unknown): ProductionsSettingsBundle {
  const raw = value && typeof value === 'object' ? value as Partial<ProductionsSettingsBundle> : {};
  const settingsSource = raw.settings && typeof raw.settings === 'object' ? raw.settings : value;
  assertValidSettingsRecipeIds(settingsSource);
  const settings = normalizeProductionsVisualSettings(settingsSource, DEFAULT_PRODUCTIONS_VISUAL_SETTINGS);
  const bundleVersion = Number.isFinite(raw.version) ? Number(raw.version) : PRODUCTIONS_SETTINGS_BUNDLE_VERSION;

  return {
    version: bundleVersion,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString(),
    settings: bundleVersion < PRODUCTIONS_SETTINGS_BUNDLE_VERSION
      ? migrateLegacyProductionsVisualSettings(settings)
      : settings,
  };
}

export function pickAutomaticSketch(deck: readonly ExplorerRecipeId[]): ExplorerRecipeId {
  const normalized = normalizeAutomaticDeck(deck);
  return normalized[Math.floor(Math.random() * normalized.length)] ?? DEFAULT_AUTOMATIC_SKETCH_DECK[0];
}
