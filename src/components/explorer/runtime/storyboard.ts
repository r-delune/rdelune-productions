import { normalizeRuntimeKey } from './keys';
import { DEFAULT_RECIPE_ID, getDefaultExplorerRecipe, getExplorerRecipe, isImageDependentRecipe, isProductionReadyRecipe, listExplorerRecipes } from './recipes';
import type {
  ExplorerRecipe,
  ExplorerRecipeId,
  ExplorerSceneProfile,
  ExplorerStoryboardEnergy,
  ExplorerStoryboardSectionRole,
  ExplorerStoryboardTemplate,
  ExplorerStoryboardVariance,
  VisualStoryboard,
} from './types';

/**
 * COHESION BIAS (default OFF — opt-in, A/B only).
 *
 * The storyboard normally forces variety: each section prefers a DIFFERENT
 * visual family than the last (deprioritizeSameFamily) and never repeats the
 * exact previous recipe. For the ambient catalogue that can read as
 * channel-flipping. Flip this to `true` to invert the bias — sections then
 * prefer STAYING in the same family (and may repeat the same kernel), letting a
 * track read as one continuous world whose arc is carried by uSectionProgress +
 * palette shifts rather than kernel swaps.
 *
 * Scope note: this only affects the authored-storyboard path here. The
 * generative-variety path (runtime/plans.ts, used by most generated tracks)
 * has its own sequencing and would need the same treatment to fully change the
 * catalogue feel — see CONTINUUM_HANDOFF.md.
 */
export const COHESION_BIAS = false;

export const EXPLORER_SCENE_PROFILES: readonly ExplorerSceneProfile[] = [
  'ink',
  'smoke',
  'tide',
  'cloud',
  'rain',
  'flow',
  'spiral',
  'contour',
  'planet',
  'particle',
  'galaxy',
  'storm',
  'mist',
  'texture',
  'line',
  'grid',
  'geology',
  'sparse',
];

const TEMPLATE_ROLES: Readonly<Record<ExplorerStoryboardTemplate, readonly ExplorerStoryboardSectionRole[]>> = {
  'ambient-arc': ['intro', 'establish', 'drift', 'lift', 'release', 'afterglow'],
  'lift-arc': ['intro', 'establish', 'build', 'lift', 'peak', 'release', 'afterglow'],
  'pulse-arc': ['intro', 'build', 'peak', 'release', 'build', 'peak', 'afterglow'],
  journey: ['intro', 'drift', 'establish', 'build', 'lift', 'peak', 'release', 'afterglow'],
  'cloud-again': ['intro', 'build', 'peak', 'release', 'afterglow'],
  'mosh-arc': ['intro', 'establish', 'build', 'lift', 'peak', 'release', 'afterglow'],
  'generative-variety': ['intro', 'establish', 'drift', 'build', 'lift', 'peak', 'release', 'afterglow'],
};

export const ROLE_PROFILE_ORDER: Readonly<Record<ExplorerStoryboardSectionRole, readonly ExplorerSceneProfile[]>> = {
  intro:     ['texture', 'cloud', 'particle', 'ink', 'smoke', 'mist', 'tide', 'flow', 'contour', 'galaxy', 'grid', 'rain', 'storm', 'spiral', 'planet', 'geology', 'sparse'],
  establish: ['texture', 'cloud', 'particle', 'smoke', 'mist', 'flow', 'galaxy', 'ink', 'tide', 'contour', 'grid', 'rain', 'storm', 'spiral', 'planet', 'geology', 'sparse'],
  drift:     ['particle', 'sparse', 'texture', 'geology', 'ink', 'smoke', 'mist', 'flow', 'cloud', 'galaxy', 'tide', 'contour', 'rain', 'storm', 'spiral', 'planet', 'grid'],
  build:     ['flow', 'texture', 'particle', 'rain', 'storm', 'spiral', 'galaxy', 'contour', 'cloud', 'tide', 'grid', 'smoke', 'mist', 'ink', 'planet', 'geology', 'sparse'],
  lift:      ['texture', 'rain', 'storm', 'flow', 'particle', 'tide', 'spiral', 'galaxy', 'cloud', 'contour', 'ink', 'grid', 'smoke', 'mist', 'planet', 'geology', 'sparse'],
  peak:      ['texture', 'planet', 'storm', 'spiral', 'rain', 'galaxy', 'particle', 'contour', 'grid', 'flow', 'cloud', 'tide', 'smoke', 'mist', 'ink', 'geology', 'sparse'],
  release:   ['texture', 'sparse', 'contour', 'geology', 'tide', 'particle', 'smoke', 'mist', 'cloud', 'ink', 'flow', 'galaxy', 'rain', 'storm', 'spiral', 'planet', 'grid'],
  afterglow: ['texture', 'sparse', 'cloud', 'geology', 'galaxy', 'particle', 'tide', 'smoke', 'mist', 'ink', 'contour', 'flow', 'rain', 'storm', 'spiral', 'planet', 'grid'],
};

const LOW_ENERGY_PROFILES: readonly ExplorerSceneProfile[] = ['texture', 'sparse', 'cloud', 'particle', 'smoke', 'mist', 'tide', 'ink', 'contour', 'galaxy', 'flow', 'grid', 'rain', 'storm', 'spiral', 'planet'];
const MEDIUM_ENERGY_PROFILES: readonly ExplorerSceneProfile[] = ['texture', 'particle', 'sparse', 'cloud', 'flow', 'galaxy', 'tide', 'contour', 'smoke', 'mist', 'ink', 'grid', 'rain', 'storm', 'spiral', 'planet'];
const HIGH_ENERGY_PROFILES: readonly ExplorerSceneProfile[] = ['texture', 'storm', 'flow', 'rain', 'particle', 'spiral', 'planet', 'galaxy', 'grid', 'contour', 'cloud', 'tide', 'smoke', 'mist', 'ink', 'sparse'];

export const STORYBOARD_ENERGY_PROFILE_ORDER: Readonly<Record<ExplorerStoryboardEnergy, readonly ExplorerSceneProfile[]>> = {
  low: LOW_ENERGY_PROFILES,
  medium: MEDIUM_ENERGY_PROFILES,
  high: HIGH_ENERGY_PROFILES,
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function dedupeRecipeIds(recipeIds: readonly ExplorerRecipeId[]): ExplorerRecipeId[] {
  const seen = new Set<string>();
  const result: ExplorerRecipeId[] = [];

  for (let index = 0; index < recipeIds.length; index += 1) {
    const recipeId = recipeIds[index];
    if (seen.has(recipeId)) continue;
    seen.add(recipeId);
    result.push(recipeId);
  }

  return result;
}

function reorderProfiles(base: readonly ExplorerSceneProfile[], priority: readonly ExplorerSceneProfile[]): ExplorerSceneProfile[] {
  const result = [...base];

  for (let index = priority.length - 1; index >= 0; index -= 1) {
    const profile = priority[index];
    const existingIndex = result.indexOf(profile);
    if (existingIndex >= 0) result.splice(existingIndex, 1);
    result.unshift(profile);
  }

  return result;
}

function getEnergyPriority(energy: ExplorerStoryboardEnergy | undefined): readonly ExplorerSceneProfile[] {
  if (energy === 'low') return LOW_ENERGY_PROFILES;
  if (energy === 'high') return HIGH_ENERGY_PROFILES;
  return MEDIUM_ENERGY_PROFILES;
}

export function expandSectionRoles(
  sectionCount: number,
  storyboard?: VisualStoryboard,
): ExplorerStoryboardSectionRole[] {
  const explicitRoles = storyboard?.sectionRoles?.filter(Boolean);
  if (explicitRoles?.length) {
    return Array.from({ length: Math.max(sectionCount, 1) }, (_, index) => (
      explicitRoles[Math.min(index, explicitRoles.length - 1)] ?? 'afterglow'
    ));
  }

  const template = storyboard?.template ?? 'ambient-arc';
  const templateRoles = TEMPLATE_ROLES[template] ?? TEMPLATE_ROLES['ambient-arc'];
  const slots = Math.max(sectionCount, 1);

  if (slots === templateRoles.length) return [...templateRoles];
  if (slots === 1) return [templateRoles[0] ?? 'intro'];

  return Array.from({ length: slots }, (_, index) => {
    const ratio = index / Math.max(slots - 1, 1);
    const roleIndex = Math.round(ratio * (templateRoles.length - 1));
    return templateRoles[Math.max(0, Math.min(roleIndex, templateRoles.length - 1))] ?? 'afterglow';
  });
}

function getRecipePool(storyboard?: VisualStoryboard): ExplorerRecipe[] {
  const recipes = listExplorerRecipes().filter((recipe) => isProductionReadyRecipe(recipe.id));
  const recipePool = storyboard?.recipePool?.filter(Boolean);

  if (!recipePool?.length) return recipes;

  const allowed = new Set(recipePool);
  const filtered = recipes.filter((recipe) => allowed.has(recipe.id));
  return filtered.length > 0 ? filtered : recipes;
}

function getCloudAgainRoleCandidates(role: ExplorerStoryboardSectionRole, storyboard?: VisualStoryboard): ExplorerRecipeId[] {
  if (storyboard?.template !== 'cloud-again') return [];

  const semanticIds: Readonly<Record<ExplorerStoryboardSectionRole, readonly ExplorerRecipeId[]>> = {
    intro: ['cong-cloud-again-intro-generative', 'cong-cloud-orbit'],
    establish: ['cong-cloud-again-intro-generative', 'cong-cloud-orbit'],
    drift: ['cong-cloud-orbit', 'cong-landscape-flow'],
    build: ['cong-landscape-flow'],
    lift: ['cong-rain-shower'],
    peak: ['cong-rain-shower', 'cong-waterline-shimmer', 'three-artwork-flux'],
    release: ['cong-cloud-orbit', 'cong-waterline-shimmer'],
    afterglow: ['cong-cloud-again-intro-generative', 'native-smoke-planes'],
  };

  const poolIds = new Set(getRecipePool(storyboard).map((recipe) => recipe.id));
  return semanticIds[role].filter((recipeId) => poolIds.has(recipeId));
}

// Mosh-arc keeps every section inside the restrained artwork-mosh family.
// `three-artwork-flux` is currently the only production recipe in that family
// (the cong-artwork-mosh-* variants were retired in "Prune weak production
// visuals" and must not be referenced here — without a live recipe they fall
// through to the generic profile pool and break mosh-arc containment).
const MOSH_ROLE_POOLS: Readonly<Record<ExplorerStoryboardSectionRole, readonly ExplorerRecipeId[]>> = {
  intro:     ['three-artwork-flux'],
  establish: ['three-artwork-flux'],
  drift:     ['three-artwork-flux'],
  build:     ['three-artwork-flux'],
  lift:      ['three-artwork-flux'],
  peak:      ['three-artwork-flux'],
  release:   ['three-artwork-flux'],
  afterglow: ['three-artwork-flux'],
};

function getMoshRoleCandidates(role: ExplorerStoryboardSectionRole, storyboard?: VisualStoryboard): ExplorerRecipeId[] {
  if (storyboard?.template !== 'mosh-arc') return [];

  const poolIds = new Set(getRecipePool(storyboard).map((recipe) => recipe.id));
  const roleCandidates = MOSH_ROLE_POOLS[role].filter((recipeId) => isProductionReadyRecipe(recipeId));
  // Return all candidates that pass production-ready check; pool filtering is
  // relaxed for mosh — artworks should always be accessible regardless of pool.
  return roleCandidates.length > 0
    ? roleCandidates
    : MOSH_ROLE_POOLS[role].filter((recipeId) => poolIds.has(recipeId));
}

function getRoleCandidates(role: ExplorerStoryboardSectionRole, storyboard: VisualStoryboard | undefined): ExplorerRecipeId[] {
  const moshCandidates = getMoshRoleCandidates(role, storyboard);
  if (moshCandidates.length) return moshCandidates;

  const semanticCandidates = getCloudAgainRoleCandidates(role, storyboard);
  if (semanticCandidates.length) return semanticCandidates;

  const pool = getRecipePool(storyboard);
  const byProfile = new Map<ExplorerSceneProfile, ExplorerRecipeId[]>();

  for (let index = 0; index < pool.length; index += 1) {
    const recipe = pool[index];
    const existing = byProfile.get(recipe.sceneProfile) ?? [];
    existing.push(recipe.id);
    byProfile.set(recipe.sceneProfile, existing);
  }

  let profileOrder = reorderProfiles(ROLE_PROFILE_ORDER[role], getEnergyPriority(storyboard?.energy));
  if (storyboard?.focus && storyboard.focus !== 'mixed') {
    profileOrder = reorderProfiles(profileOrder, [storyboard.focus]);
  }

  const orderedIds = profileOrder.flatMap((profile) => byProfile.get(profile) ?? []);
  return dedupeRecipeIds(orderedIds);
}

function pickAnchoredRecipe(role: ExplorerStoryboardSectionRole, storyboard?: VisualStoryboard): ExplorerRecipeId | undefined {
  const anchors = storyboard?.anchors;
  if (!anchors) return undefined;
  const recipeId = role === 'intro'
    ? anchors.intro
    : role === 'peak'
      ? anchors.peak
      : role === 'afterglow'
        ? anchors.outro
        : undefined;

  if (!recipeId || !isProductionReadyRecipe(recipeId)) return undefined;
  return recipeId;
}

// Maps scene profiles to broad visual family buckets so consecutive sections
// can avoid the same family (soft exclusion — falls back gracefully).
const PROFILE_FAMILY: Readonly<Record<ExplorerSceneProfile, string>> = {
  cloud: 'cloud',
  rain: 'flow',
  spiral: 'flow',
  flow: 'flow',
  contour: 'terrain',
  geology: 'terrain',
  grid: 'mesh',
  line: 'mesh',
  particle: 'particle',
  galaxy: 'particle',
  storm: 'particle',
  sparse: 'particle',
  mist: 'smoke',
  smoke: 'smoke',
  ink: 'ink',
  tide: 'tide',
  planet: 'planet',
  texture: 'texture',
};

function getProfileFamily(profile: ExplorerSceneProfile): string {
  return PROFILE_FAMILY[profile] ?? 'other';
}

function deprioritizeSameFamily(candidates: readonly ExplorerRecipeId[], lastFamily: string | undefined): ExplorerRecipeId[] {
  if (!lastFamily) return [...candidates];
  const preferred: ExplorerRecipeId[] = [];
  const deprioritized: ExplorerRecipeId[] = [];
  for (const recipeId of candidates) {
    const recipe = getExplorerRecipe(recipeId);
    if (getProfileFamily(recipe.sceneProfile) === lastFamily) {
      deprioritized.push(recipeId);
    } else {
      preferred.push(recipeId);
    }
  }
  // Always return both — if all share the same family, fallback ensures a pick
  return preferred.length > 0 ? [...preferred, ...deprioritized] : deprioritized;
}

/** Inverse of deprioritizeSameFamily: put same-family candidates FIRST so the
 *  next section tends to stay in the current world. Used when COHESION_BIAS is on. */
function prioritizeSameFamily(candidates: readonly ExplorerRecipeId[], lastFamily: string | undefined): ExplorerRecipeId[] {
  if (!lastFamily) return [...candidates];
  const sameFamily: ExplorerRecipeId[] = [];
  const others: ExplorerRecipeId[] = [];
  for (const recipeId of candidates) {
    const recipe = getExplorerRecipe(recipeId);
    if (getProfileFamily(recipe.sceneProfile) === lastFamily) sameFamily.push(recipeId);
    else others.push(recipeId);
  }
  return sameFamily.length > 0 ? [...sameFamily, ...others] : others;
}

function pickCandidate(
  candidates: readonly ExplorerRecipeId[],
  previousRecipeId: ExplorerRecipeId | undefined,
  variance: ExplorerStoryboardVariance | undefined,
  seed: number,
  allowRepeat = false,
): ExplorerRecipeId | undefined {
  if (!candidates.length) return undefined;
  // Continuity mode: allow the same recipe to carry across sections so a track
  // can stay one world (the arc comes from uSectionProgress + palette, not swaps).
  if (allowRepeat) {
    const startIndex = seed % candidates.length;
    return candidates[startIndex];
  }
  if (variance === 'low') {
    // Low variance: limit to the top 2 candidates but use seed to pick between them
    // so different tracks see variety within the same role pool.
    const cap = Math.min(2, candidates.length);
    const startIndex = seed % cap;
    for (let offset = 0; offset < cap; offset += 1) {
      const candidate = candidates[(startIndex + offset) % cap];
      if (candidate !== previousRecipeId) return candidate;
    }
    return candidates[startIndex];
  }

  const startIndex = variance === 'high'
    ? seed % candidates.length
    : Math.min(seed % Math.min(candidates.length, 2), candidates.length - 1);

  for (let offset = 0; offset < candidates.length; offset += 1) {
    const candidate = candidates[(startIndex + offset) % candidates.length];
    if (candidate !== previousRecipeId) return candidate;
  }

  return candidates[startIndex];
}

interface StoryboardSelectionPolicy {
  disallowImageDependentIntro?: boolean;
  introFallbackRecipeId?: ExplorerRecipeId;
}

export function buildStoryboardSequence(
  albumName: string,
  trackTitle: string,
  sectionCount: number,
  storyboard?: VisualStoryboard,
  policy?: StoryboardSelectionPolicy,
): ExplorerRecipeId[] | undefined {
  if (!storyboard) return undefined;

  const roles = expandSectionRoles(sectionCount, storyboard);
  const fallbackRecipeId = storyboard.anchors?.fallbackRecipeId && isProductionReadyRecipe(storyboard.anchors.fallbackRecipeId)
    ? storyboard.anchors.fallbackRecipeId
    : DEFAULT_RECIPE_ID;
  const seedBase = hashString(`${normalizeRuntimeKey(albumName)}::${normalizeRuntimeKey(trackTitle)}`);
  const steps: ExplorerRecipeId[] = [];
  let lastFamily: string | undefined;

  for (let index = 0; index < roles.length; index += 1) {
    const role = roles[index] ?? 'afterglow';
    const guardIntro = index === 0 && policy?.disallowImageDependentIntro === true;
    const rawAnchor = pickAnchoredRecipe(role, storyboard);
    const anchored = guardIntro && rawAnchor && isImageDependentRecipe(rawAnchor) ? undefined : rawAnchor;
    const rawCandidates = getRoleCandidates(role, storyboard)
      .filter((recipeId) => !guardIntro || !isImageDependentRecipe(recipeId));
    // Family ordering vs the previous section: normally deprioritize same family
    // (variety); under COHESION_BIAS, prioritize it (continuity).
    const candidates = anchored
      ? rawCandidates
      : (COHESION_BIAS
          ? prioritizeSameFamily(rawCandidates, lastFamily)
          : deprioritizeSameFamily(rawCandidates, lastFamily));
    const introFallbackRecipeId = policy?.introFallbackRecipeId && isProductionReadyRecipe(policy.introFallbackRecipeId)
      ? policy.introFallbackRecipeId
      : fallbackRecipeId;
    const recipeId = anchored
      ?? pickCandidate(candidates, steps[index - 1], storyboard.variance, seedBase + index * 17, COHESION_BIAS)
      ?? (guardIntro ? introFallbackRecipeId : undefined)
      ?? fallbackRecipeId
      ?? getDefaultExplorerRecipe().id;

    steps.push(recipeId);
    lastFamily = getProfileFamily(getExplorerRecipe(recipeId).sceneProfile);
  }

  return steps.length > 0 ? steps : undefined;
}
