import { normalizeRuntimeKey } from './keys';
import { DEFAULT_RECIPE_ID, GLOBAL_DISABLED_RECIPE_IDS, getExplorerRecipe, isGloballyDisabledRecipe, isImageDependentRecipe } from './recipes';
import { getSectionMood } from './section-moods';
import { normalizeSectionTimes } from './section-times';
import { buildStoryboardSequence, expandSectionRoles } from './storyboard';
import type { BeatGrid, ExplorerRecipe, ExplorerRecipeId, ExplorerStoryboardTemplate, SectionPaletteConfig, SectionVisualEvent, TrackVisualConfig, TrackVisualPlan, VisualPlanEventConfig, VisualStoryboard } from './types';
import type { VisualParams } from '../visualizer';

/* ── Section Planning ────────────────────────────────────────
   Plans remain purely declarative. They only describe which
   recipe belongs to each section slot and how long transitions
   should take. This keeps the orchestration scalable and makes
   it safe to add future Cong/native recipes without rewiring
   the canvas runtime.
──────────────────────────────────────────────────────────────── */

export const ARTWORK_OPENER_RECIPES: readonly ExplorerRecipeId[] = [
  'cong-artwork-mosh-soft-scan',
  'cong-artwork-mosh-horizontal-slice',
  'cong-artwork-mosh-pixel-islands',
  'cong-artwork-datamosh-rain-evolution',
  'cong-artwork-mosh-left-flow',
  'cong-artwork-mosh-storm-open',
  'cong-artwork-mosh-fracture',
  'cong-artwork-mosh-minimal-ghost',
  'cong-artwork-mosh-crystal-shard',
  'cong-artwork-mosh-veil-drift',
] as const;

const GENERATED_MOSH_ACCENT_RECIPES: readonly ExplorerRecipeId[] = [
  'cong-artwork-mosh-soft-scan',
  'cong-artwork-mosh-pixel-islands',
  'cong-artwork-datamosh-rain-evolution',
  'cong-artwork-mosh-left-flow',
  'cong-artwork-mosh-storm-open',
  'cong-artwork-mosh-fracture',
  'cong-artwork-mosh-minimal-ghost',
  'cong-artwork-mosh-pixel-sort',
  'cong-artwork-mosh-slit-scan',
  'cong-artwork-mosh-crystal-shard',
  'cong-artwork-mosh-veil-drift',
  'three-artwork-flux',
] as const;

const GENERATIVE_VARIETY_SEQUENCE: readonly ExplorerRecipeId[] = [
  'cong-landscape-og-current',
  'cong-rain-shower',
  'cong-green-galaxy',
  'native-warp-mesh-deep',
  'cong-waterline-shimmer',
  'cong-artwork-mosh-soft-scan',
  'cong-cloud-orbit',
  'cong-contour-lines',
  'cong-planet-core',
  'native-flow-field-drift',
  'native-flow-field-veil',
  'cong-artwork-mosh-minimal-ghost',
  'cong-lateral-current',
  'cong-lateral-cascade',
  'cong-artwork-mosh-left-flow',
  'cong-artwork-mosh-pixel-sort',
  'cong-artwork-mosh-slit-scan',
  'cong-particle-current',
  'cong-cloud-again-generative',
  'cong-landscape-flow',
  'cong-artwork-mosh-pixel-islands',
  'cong-landscape-spiral',
  'cong-broken-grid',
  'native-flow-field-chroma',
  'native-lissajous-drift',
  'native-terrain-erode',
  'native-kaleido-fold-ambient',
  'native-kaleido-fold-bloom',
  'native-reaction-veil',
  'native-reaction-veil-deep',
  'native-attractor-drift',
  'native-attractor-surge',
  'native-aurora-veil',
  'native-sidewind-drift',
  'native-gravity-current',
  'three-curl-flow',
  'three-volumetric-fog',
  'three-caustics',
] as const;

/**
 * Every recipe id named by a built-in rotation pool (openers, mosh accents, the
 * generative-variety fallback). Used by scripts/check-rotation to treat
 * authored-pool membership as a valid reachability path. NOTE: these pools are
 * only fallbacks — the live rotation is flag-derived (listRandomRecipeIds), so a
 * recipe with `randomEligible !== false` is reachable whether or not it is here.
 */
export const STATIC_ROTATION_POOL_IDS: readonly ExplorerRecipeId[] = Array.from(new Set([
  ...ARTWORK_OPENER_RECIPES,
  ...GENERATED_MOSH_ACCENT_RECIPES,
  ...GENERATIVE_VARIETY_SEQUENCE,
]));

const DEFAULT_TRANSITION_MS = 1800;
const GENERATED_CHAPTER_TRANSITION_MS = 3000;
const GENERATED_INTERNAL_TRANSITION_MS = 1200;
const MOSH_BASE_RECIPE_ID = 'cong-artwork-datamosh-rain-evolution';
const GENERATED_INTRO_RECIPE_ID = 'native-flow-field-veil';
export const DEFAULT_TRACK_BPM = 120;
const ARCHIVED_RECIPE_REPLACEMENTS: Readonly<Record<string, ExplorerRecipeId>> = {
  'cong-artwork-datamosh-left-flow': MOSH_BASE_RECIPE_ID,
  'cong-artwork-datamosh-storm-evolution': MOSH_BASE_RECIPE_ID,
  'cong-cloud-again-peak': 'cong-green-galaxy',
  'cong-chord-storm': 'cong-green-galaxy',
  'cong-grain-erosion': MOSH_BASE_RECIPE_ID,
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed: number, salt: number): number {
  let value = (seed + Math.imul(salt + 1, 374761393)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 2246822519) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 3266489917) >>> 0;
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}

export function resolveBeatGrid(bpm: number | null | undefined, beatStartAt: number | null | undefined): BeatGrid {
  const hasAuthoredBpm = typeof bpm === 'number' && isFinite(bpm) && bpm > 0;
  const hasAuthoredBeatStart = typeof beatStartAt === 'number' && isFinite(beatStartAt) && beatStartAt >= 0;
  const resolvedBpm = hasAuthoredBpm ? bpm : DEFAULT_TRACK_BPM;
  const resolvedBeatStart = hasAuthoredBeatStart ? beatStartAt : 0;

  return {
    bpm: resolvedBpm,
    beatStartAt: resolvedBeatStart,
    barDurationSeconds: (60 / resolvedBpm) * 4,
    bpmSource: hasAuthoredBpm ? 'authored' : 'default',
    beatStartSource: hasAuthoredBeatStart ? 'authored' : 'default',
  };
}

export function getBeatGridPosition(beatGrid: BeatGrid, currentTime: number): { barNumber: number; nextBarTime: number; timeUntilNextBar: number } {
  const elapsed = currentTime - beatGrid.beatStartAt;
  const completedBars = elapsed >= 0 ? Math.floor(elapsed / beatGrid.barDurationSeconds) : -1;
  const nextBarTime = elapsed < 0
    ? beatGrid.beatStartAt
    : beatGrid.beatStartAt + (completedBars + 1) * beatGrid.barDurationSeconds;

  return {
    barNumber: elapsed < 0 ? 0 : completedBars + 1,
    nextBarTime,
    timeUntilNextBar: Math.max(0, nextBarTime - currentTime),
  };
}

function getBaseColorBucket(baseColor: string | null | undefined): number {
  if (!baseColor) return 0;
  const match = baseColor.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return hashString(baseColor) % 8;

  const hex = match[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const brightness = max / 255;

  if (brightness < 0.18) return 0;
  if (saturation < 0.12) return 1;
  if (r >= g && r >= b) return brightness > 0.72 ? 2 : 3;
  if (g >= r && g >= b) return brightness > 0.62 ? 4 : 5;
  return brightness > 0.62 ? 6 : 7;
}

export function pickArtworkOpener(
  albumKey: string,
  trackKey: string,
  baseColor: string | null | undefined,
  sectionCount: number,
  disabledRecipeIds?: readonly ExplorerRecipeId[],
): ExplorerRecipeId {
  const seed = hashString(`${albumKey}::${trackKey}::${getBaseColorBucket(baseColor)}::${sectionCount}::artwork-opener`);
  const shortTrackPool: readonly ExplorerRecipeId[] = [
    'cong-artwork-mosh-minimal-ghost',
    'cong-artwork-mosh-soft-scan',
    'cong-artwork-mosh-horizontal-slice',
    'cong-artwork-mosh-pixel-islands',
  ];
  const longTrackPool: readonly ExplorerRecipeId[] = [
    'cong-artwork-mosh-left-flow',
    'cong-artwork-mosh-storm-open',
    'cong-artwork-mosh-fracture',
    'cong-artwork-datamosh-rain-evolution',
    'cong-artwork-mosh-pixel-islands',
    'cong-artwork-mosh-horizontal-slice',
  ];
  const pool = sectionCount <= 2
    ? shortTrackPool
    : sectionCount >= 6
      ? longTrackPool
      : ARTWORK_OPENER_RECIPES;
  const allowedPool = filterRecipePool(pool, disabledRecipeIds, ARTWORK_OPENER_RECIPES);

  return allowedPool[seed % allowedPool.length] ?? MOSH_BASE_RECIPE_ID;
}

function resolveProductionRecipeId(recipeId: ExplorerRecipeId | undefined, fallbackRecipeId: ExplorerRecipeId = MOSH_BASE_RECIPE_ID): ExplorerRecipeId | undefined {
  if (!recipeId) return undefined;
  const replacement = ARCHIVED_RECIPE_REPLACEMENTS[recipeId] ?? recipeId;
  return isGloballyDisabledRecipe(replacement) ? fallbackRecipeId : replacement;
}

function getDisabledRecipeSet(disabledRecipeIds: readonly ExplorerRecipeId[] | undefined): Set<ExplorerRecipeId> {
  const disabled = new Set(disabledRecipeIds ?? []);
  GLOBAL_DISABLED_RECIPE_IDS.forEach((recipeId) => disabled.add(recipeId));
  return disabled;
}

function filterRecipePool(
  source: readonly ExplorerRecipeId[],
  disabledRecipeIds: readonly ExplorerRecipeId[] | undefined,
  fallback: readonly ExplorerRecipeId[],
): ExplorerRecipeId[] {
  const disabled = getDisabledRecipeSet(disabledRecipeIds);
  const result = source
    .map((recipeId) => resolveProductionRecipeId(recipeId))
    .filter((recipeId): recipeId is ExplorerRecipeId => !!recipeId && !disabled.has(recipeId) && !isGloballyDisabledRecipe(recipeId));
  if (result.length) return Array.from(new Set(result));
  return fallback
    .map((recipeId) => resolveProductionRecipeId(recipeId))
    .filter((recipeId): recipeId is ExplorerRecipeId => !!recipeId && !disabled.has(recipeId) && !isGloballyDisabledRecipe(recipeId));
}

function buildDefaultGenerativeSequence(
  albumKey: string,
  trackKey: string,
  sectionCount: number,
  _baseColor?: string | null,
  generatedRecipePool?: readonly ExplorerRecipeId[],
  disabledRecipeIds?: readonly ExplorerRecipeId[],
  rotationSeed?: string,
): ExplorerRecipeId[] {
  const seed = hashString(`${albumKey}::${trackKey}::${rotationSeed ?? ''}::generative-variety`);
  const slots = Math.max(sectionCount, 1);
  const pool = filterRecipePool(generatedRecipePool?.length ? generatedRecipePool : GENERATIVE_VARIETY_SEQUENCE, disabledRecipeIds, GENERATIVE_VARIETY_SEQUENCE);
  const safePool = pool.length ? pool : filterRecipePool(GENERATIVE_VARIETY_SEQUENCE, disabledRecipeIds, GENERATIVE_VARIETY_SEQUENCE);
  const safePoolSet = new Set(safePool);
  const introCandidates: readonly ExplorerRecipeId[] = [
    GENERATED_INTRO_RECIPE_ID,
    'cong-landscape-og-current',
    'cong-rain-shower',
    'cong-cloud-again-generative',
    'cong-lateral-current',
    'native-kaleido-fold-ambient',
    'native-attractor-drift',
    'native-aurora-veil',
    'native-sidewind-drift',
    'three-curl-flow',
    'three-caustics',
  ];
  const introPool = introCandidates
    .filter((recipeId) => safePoolSet.has(recipeId) && !isImageDependentRecipe(recipeId));
  const introIndex = Math.floor(seededUnit(seed, 100) * introPool.length) % Math.max(introPool.length, 1);
  const firstRecipe = introPool[introIndex] ?? safePool[seed % safePool.length] ?? GENERATED_INTRO_RECIPE_ID;
  const result: ExplorerRecipeId[] = [firstRecipe];
  const peakCandidates: readonly ExplorerRecipeId[] = [
    'cong-green-galaxy',
    'cong-waterline-shimmer',
    'cong-lateral-cascade',
    'cong-broken-grid',
    'cong-landscape-spiral',
    'native-kaleido-fold-bloom',
    'native-attractor-surge',
    'native-gravity-current',
  ];
  const peakPool = peakCandidates.filter((recipeId) => safePoolSet.has(recipeId));

  for (let index = 1; index < slots; index += 1) {
    const ratio = slots === 1 ? 0 : index / Math.max(slots - 1, 1);
    const rawSource = ratio > 0.62 && ratio < 0.88
      ? peakPool
      : safePool;
    const source = rawSource.length ? rawSource : [MOSH_BASE_RECIPE_ID];
    const start = Math.floor(seededUnit(seed + index * 131, index + 3) * source.length) % source.length;
    let recipeId = source[start] ?? source[0] ?? MOSH_BASE_RECIPE_ID;

    const recentCount = Math.min(3, index);
    const recentlyUsed = result.slice(result.length - recentCount);
    for (let offset = 0; offset < source.length; offset += 1) {
      const candidate = source[(start + offset) % source.length] ?? recipeId;
      if (!recentlyUsed.includes(candidate)) {
        recipeId = candidate;
        break;
      }
    }

    result.push(recipeId);
  }

  return result;
}

function applyGeneratedMoshAccent(
  sequence: readonly ExplorerRecipeId[],
  albumKey: string,
  trackKey: string,
  generatedMoshRecipePool: readonly ExplorerRecipeId[] | undefined,
  disabledRecipeIds: readonly ExplorerRecipeId[] | undefined,
  rotationSeed?: string,
): ExplorerRecipeId[] {
  const result = [...sequence];
  if (result.length < 2) return result;

  const seed = hashString(`${albumKey}::${trackKey}::${rotationSeed ?? ''}::artwork-mosh-accent`);
  const moshSource = generatedMoshRecipePool?.length ? generatedMoshRecipePool : GENERATED_MOSH_ACCENT_RECIPES;
  const eligibleMoshPool = filterRecipePool(moshSource, disabledRecipeIds, GENERATED_MOSH_ACCENT_RECIPES)
    .filter((recipeId) => isImageDependentRecipe(recipeId));
  if (!eligibleMoshPool.length) return result;

  const accentIndex = 1;
  const recipeIndex = Math.floor(seededUnit(seed, 203) * eligibleMoshPool.length) % eligibleMoshPool.length;
  result[accentIndex] = eligibleMoshPool[recipeIndex] ?? result[accentIndex];
  return result;
}

function sanitizeTransitionMs(value: number | undefined): number {
  if (value === undefined || !isFinite(value)) return DEFAULT_TRANSITION_MS;
  return Math.max(120, Math.round(value));
}

function mergeParams(
  moodParams: Partial<VisualParams> | undefined,
  stepParams: Partial<VisualParams> | undefined,
): Partial<VisualParams> | undefined {
  if (!moodParams && !stepParams) return undefined;
  return { ...moodParams, ...stepParams };
}

function mergePalette(
  moodPalette: SectionPaletteConfig | undefined,
  stepPalette: SectionPaletteConfig | undefined,
): SectionPaletteConfig | undefined {
  if (!moodPalette && !stepPalette) return undefined;
  return { ...moodPalette, ...stepPalette };
}

export function mergeTrackVisualConfigs(
  albumConfig?: TrackVisualConfig,
  trackConfig?: TrackVisualConfig,
): TrackVisualConfig | undefined {
  if (!albumConfig && !trackConfig) return undefined;
  const inheritedSequence = albumConfig?.sequence?.length && (albumConfig.sequence.length > 1 || albumConfig.singleSketch === true)
    ? albumConfig.sequence
    : undefined;

  return {
    fallbackRecipeId: resolveProductionRecipeId(trackConfig?.fallbackRecipeId ?? albumConfig?.fallbackRecipeId),
    defaultTransitionMs: trackConfig?.defaultTransitionMs ?? albumConfig?.defaultTransitionMs,
    sequence: (trackConfig?.sequence?.length ? trackConfig.sequence : inheritedSequence)
      ?.map((recipeId) => resolveProductionRecipeId(recipeId))
      .filter((recipeId): recipeId is ExplorerRecipeId => !!recipeId),
    steps: (trackConfig?.steps?.length ? trackConfig.steps : albumConfig?.steps)?.map((step) => ({
      ...step,
      recipeId: resolveProductionRecipeId(step.recipeId) ?? step.recipeId,
    })),
    events: trackConfig?.events?.length ? trackConfig.events : albumConfig?.events,
    defaultEvents: trackConfig?.defaultEvents ?? albumConfig?.defaultEvents,
    internalEvolution: trackConfig?.internalEvolution ?? albumConfig?.internalEvolution,
    singleSketch: trackConfig?.singleSketch ?? albumConfig?.singleSketch,
    storyboard: trackConfig?.storyboard ?? albumConfig?.storyboard,
    generatedRecipePool: trackConfig?.generatedRecipePool?.length ? trackConfig.generatedRecipePool : albumConfig?.generatedRecipePool,
    generatedMoshRecipePool: trackConfig?.generatedMoshRecipePool?.length ? trackConfig.generatedMoshRecipePool : albumConfig?.generatedMoshRecipePool,
    disabledRecipeIds: trackConfig?.disabledRecipeIds?.length ? trackConfig.disabledRecipeIds : albumConfig?.disabledRecipeIds,
    debugLabel: trackConfig?.debugLabel ?? albumConfig?.debugLabel,
  };
}

function createPlanKey(albumKey: string, trackKey: string, sectionCount: number): string {
  return `${albumKey}::${trackKey}::${sectionCount}`;
}

/**
 * Number of section boundaries crossed at `currentTime`. Expects a normalized
 * (sorted, positive, in-bounds) list — call normalizeSectionTimes() first; this
 * stays sort-free for per-frame cost and assumes ascending order.
 */
export function getSectionIndex(sectionTimes: number[], currentTime: number): number {
  let index = 0;
  while (index < sectionTimes.length && sectionTimes[index] <= currentTime) index += 1;
  return index;
}

export function padSectionTimes(
  sectionTimes: number[],
  trackDuration?: number,
  minSections = 10,
): number[] {
  const safeMinimumSections = isFinite(minSections) ? Math.max(1, Math.round(minSections)) : 10;
  const requiredBoundaryCount = safeMinimumSections - 1;
  // Clean (sort/filter/dedup/de-jitter/clamp) via the shared normalizer, then
  // synthesize extra boundaries below if the track is under-segmented.
  const boundaries = normalizeSectionTimes(sectionTimes, trackDuration);
  if (boundaries.length >= requiredBoundaryCount) return boundaries;

  const lastBoundary = boundaries[boundaries.length - 1] ?? 0;
  const estimatedEnd = lastBoundary > 0 ? lastBoundary * 1.25 : 240;
  const trackEnd = trackDuration !== undefined && isFinite(trackDuration) && trackDuration > lastBoundary
    ? trackDuration
    : estimatedEnd;
  const end = Math.max(lastBoundary + 0.001, trackEnd);

  while (boundaries.length < requiredBoundaryCount) {
    const points = [0, ...boundaries, end];
    let widestGapIndex = 0;
    let widestGap = -1;
    for (let index = 0; index < points.length - 1; index += 1) {
      const gap = points[index + 1] - points[index];
      if (gap > widestGap) {
        widestGap = gap;
        widestGapIndex = index;
      }
    }
    boundaries.push((points[widestGapIndex] + points[widestGapIndex + 1]) / 2);
    boundaries.sort((a, b) => a - b);
  }

  return boundaries;
}

function resolveEventTime(event: VisualPlanEventConfig, sectionTimes: number[]): number | undefined {
  if (event.time !== undefined && isFinite(event.time)) {
    return Math.max(0, event.time + (event.offsetSeconds ?? 0));
  }

  if (event.sectionIndex === undefined || !isFinite(event.sectionIndex)) return undefined;

  const sectionIndex = Math.max(0, Math.round(event.sectionIndex));
  const sectionStart = sectionIndex <= 0 ? 0 : sectionTimes[sectionIndex - 1];
  if (sectionStart === undefined || !isFinite(sectionStart)) return undefined;

  return Math.max(0, sectionStart + (event.offsetSeconds ?? 0));
}

function buildPlanEvents(
  sectionTimes: number[],
  configEvents: readonly VisualPlanEventConfig[] | undefined,
  steps: readonly { events?: readonly VisualPlanEventConfig[] }[],
  seedLabel: string,
  defaultEvents = true,
  template?: ExplorerStoryboardTemplate,
  trackDuration?: number,
  beatGrid?: BeatGrid,
  storyboard?: VisualStoryboard,
  rawSectionTimes?: number[],
): SectionVisualEvent[] {
  const events: SectionVisualEvent[] = [];
  const hasExplicitEvents = !!configEvents?.length || steps.some((step) => !!step.events?.length);

  const addEvent = (event: VisualPlanEventConfig, fallbackSectionIndex: number | undefined, sourceIndex: number, generated = false) => {
    const eventWithSection = event.sectionIndex === undefined && fallbackSectionIndex !== undefined
      ? { ...event, sectionIndex: fallbackSectionIndex }
      : event;
    const t = resolveEventTime(eventWithSection, sectionTimes);
    if (t === undefined) return;

    events.push({
      ...eventWithSection,
      id: `${event.type}:${fallbackSectionIndex ?? 'track'}:${sourceIndex}:${t}`,
      t,
      intensity: Math.max(0, Math.min(1, event.intensity ?? 0.72)),
      ...(generated ? { generated: true } : {}),
    });
  };

  if (!hasExplicitEvents && defaultEvents) {
    buildDefaultCueEvents(sectionTimes, seedLabel).forEach((event, index) => addEvent(event, undefined, index, true));
    if (sectionTimes.length) {
      const realTimes = rawSectionTimes ?? sectionTimes;
      const realCount = realTimes.length + 1;
      const lastBoundary = sectionTimes[sectionTimes.length - 1] ?? 0;
      const estimatedEnd = sectionTimes.length > 1
        ? lastBoundary + Math.max(8, lastBoundary - (sectionTimes[sectionTimes.length - 2] ?? 0))
        : (lastBoundary || 1) * 2;

      // Priority 1: storyboard role — 'peak' preferred, 'lift' as fallback
      let stormTime: number | undefined;
      if (storyboard && realTimes.length > 0) {
        const roles = expandSectionRoles(realCount, storyboard);
        const peakIdx = roles.findIndex((r) => r === 'peak');
        const liftIdx = roles.findIndex((r) => r === 'lift');
        const roleIdx = peakIdx >= 1 ? peakIdx : liftIdx >= 1 ? liftIdx : -1;
        if (roleIdx >= 1) stormTime = realTimes[roleIdx - 1];
      }

      // Priority 2: duration-ratio — find the build→drop boundary
      let peakSectionIndex = 1;
      if (stormTime === undefined) {
        let bestScore = -1;
        for (let index = 0; index < sectionTimes.length; index += 1) {
          const boundaryTime = sectionTimes[index] ?? 0;
          const prevDuration = index === 0 ? boundaryTime : boundaryTime - (sectionTimes[index - 1] ?? 0);
          const nextEnd = index < sectionTimes.length - 1 ? (sectionTimes[index + 1] ?? estimatedEnd) : estimatedEnd;
          const nextDuration = Math.max(1, nextEnd - boundaryTime);
          const durationRatio = prevDuration > 0 ? nextDuration / prevDuration : 1;
          const posRatio = estimatedEnd > 0 ? boundaryTime / estimatedEnd : 0;
          const posWeight = posRatio >= 0.3 && posRatio <= 0.8 ? 1.0 : posRatio >= 0.15 && posRatio <= 0.88 ? 0.5 : 0.1;
          const score = durationRatio * posWeight;
          if (score > bestScore) {
            bestScore = score;
            peakSectionIndex = index + 1;
          }
        }
        // Priority 3: positional fallback (60%) if no clear build→drop pattern
        if (bestScore < 1.4) {
          const targetTime = estimatedEnd * 0.6;
          let fallbackIndex = 1;
          for (let index = 1; index < sectionTimes.length; index += 1) {
            if (Math.abs(sectionTimes[index] - targetTime) < Math.abs(sectionTimes[fallbackIndex - 1] - targetTime)) {
              fallbackIndex = index + 1;
            }
          }
          peakSectionIndex = fallbackIndex;
        }
        stormTime = sectionTimes[peakSectionIndex - 1];
      }

      addEvent({
        type: template === 'lift-arc' ? 'bloom-flash' : 'storm-release',
        time: stormTime,
        intensity: 0.9,
        durationMs: 1800,
        target: 'all',
      }, undefined, 9000, true);
      // runway: density-surge near the end of the section before the peak, building tension
      if (stormTime !== undefined && stormTime > 0) {
        const prePeakEnd = stormTime;
        const prePeakStart = realTimes.filter((t) => t < prePeakEnd).pop() ?? 0;
        const prePeakLength = Math.max(8, prePeakEnd - prePeakStart);
        addEvent({
          type: 'density-surge',
          time: prePeakEnd - Math.min(prePeakLength * 0.35, 5),
          intensity: 0.78,
          durationMs: 3200,
          target: 'particles',
        }, undefined, 9001, true);
      }
    }
  }

  configEvents?.forEach((event, index) => addEvent(event, undefined, index));
  steps.forEach((step, sectionIndex) => {
    step.events?.forEach((event, index) => addEvent(event, sectionIndex, index));
  });

  if (defaultEvents && events.length < 5) {
    const existingTimes = new Set(events.map((event) => event.t.toFixed(2)));
    buildDefaultCueEvents(sectionTimes, seedLabel).forEach((event, index) => {
      if (events.length >= 5) return;
      const t = resolveEventTime(event, sectionTimes);
      if (t === undefined || existingTimes.has(t.toFixed(2))) return;
      addEvent(event, undefined, 1000 + index, true);
      existingTimes.add(t.toFixed(2));
    });
  }

  if (beatGrid) {
    buildBarCueEvents(sectionTimes, trackDuration, beatGrid).forEach((event, index) => addEvent(event, undefined, 20000 + index, true));
  }

  return events.sort((a, b) => a.t - b.t);
}

function estimateCueTimelineEnd(sectionTimes: readonly number[], trackDuration?: number): number {
  if (typeof trackDuration === 'number' && isFinite(trackDuration) && trackDuration > 0) return trackDuration;
  if (!sectionTimes.length) return 240;
  const lastCue = sectionTimes[sectionTimes.length - 1] ?? 0;
  const previousCue = sectionTimes.length > 1 ? sectionTimes[sectionTimes.length - 2] ?? 0 : 0;
  return lastCue + Math.max(12, lastCue - previousCue);
}

export function buildBarCueEvents(sectionTimes: number[], trackDuration: number | undefined, beatGrid: BeatGrid): VisualPlanEventConfig[] {
  // Bar cues only make musical sense on an authored grid; a default 120 BPM
  // grid would land them at arbitrary moments (bar-cue spam).
  if (beatGrid.bpmSource !== 'authored') return [];

  const end = estimateCueTimelineEnd(sectionTimes, trackDuration);
  const events: VisualPlanEventConfig[] = [];
  const start = Math.max(0, beatGrid.beatStartAt);

  for (let time = start; time <= end + 0.0001; time += beatGrid.barDurationSeconds) {
    if (sectionTimes.some((sectionTime) => Math.abs(sectionTime - time) <= 0.25)) continue;
    events.push({
      type: 'bar-cue',
      time,
      sectionIndex: getSectionIndex(sectionTimes, time),
      intensity: 0.38,
      durationMs: 680,
      target: 'particles',
    });
  }

  return events;
}

function buildDefaultCueEvents(sectionTimes: number[], seedLabel: string): VisualPlanEventConfig[] {
  const events: VisualPlanEventConfig[] = [];
  const seed = hashString(seedLabel);
  const paletteTurns: readonly SectionPaletteConfig[] = [
    { hueShift: 14, saturation: 1.08, brightness: 1.1, contrast: 1.04 },
    { hueShift: -24, saturation: 1.04, brightness: 1.12, contrast: 1.06 },
    { hueShift: 30, saturation: 1.18, brightness: 1.08, contrast: 1.08 },
    { hueShift: -34, saturation: 0.92, brightness: 1.16, contrast: 1.1 },
  ];
  const warmAccents: readonly [number, number, number][] = [
    [255, 238, 196],
    [255, 202, 132],
    [232, 108, 84],
    [180, 214, 255],
  ];
  const crescendoAccents: readonly [number, number, number][] = [
    [255, 148, 142],
    [255, 235, 126],
    [255, 158, 218],
    [154, 210, 255],
  ];
  const impactPalettes: readonly SectionPaletteConfig[] = [
    { hueShift: 46, saturation: 1.24, brightness: 1.13, contrast: 1.12 },
    { hueShift: -42, saturation: 1.2, brightness: 1.16, contrast: 1.1 },
    { hueShift: 58, saturation: 1.28, brightness: 1.1, contrast: 1.14 },
    { hueShift: -54, saturation: 1.18, brightness: 1.18, contrast: 1.12 },
  ];
  const impactAccents: readonly [number, number, number][] = [
    [255, 94, 116],
    [122, 218, 255],
    [255, 225, 92],
    [198, 126, 255],
  ];
  const sectionStarts = [0, ...sectionTimes];
  const sectionCount = Math.max(sectionStarts.length, 1);

  const estimateSectionEnd = (sectionIndex: number): number => {
    const nextCue = sectionTimes[sectionIndex];
    if (nextCue !== undefined && isFinite(nextCue)) return nextCue;
    const previousStart = sectionStarts[Math.max(0, sectionIndex - 1)] ?? 0;
    const currentStart = sectionStarts[sectionIndex] ?? previousStart;
    const previousLength = Math.max(12, currentStart - previousStart);
    return currentStart + previousLength;
  };

  const addSectionEvent = (sectionIndex: number, ratio: number, event: VisualPlanEventConfig): void => {
    const sectionStart = sectionStarts[sectionIndex] ?? 0;
    const sectionEnd = estimateSectionEnd(sectionIndex);
    const sectionLength = Math.max(10, sectionEnd - sectionStart);
    const offsetSeconds = Math.max(0, Math.min(sectionLength - 1.5, sectionLength * ratio));

    events.push({
      ...event,
      ...(sectionIndex === 0
        ? { time: Math.max(3, sectionStart + offsetSeconds) }
        : { sectionIndex, offsetSeconds }),
    });
  };

  for (let sectionSlot = 0; sectionSlot < sectionCount; sectionSlot += 1) {
    const sectionSeed = seed + sectionSlot * 97;
    const palette = paletteTurns[Math.floor(seededUnit(sectionSeed, 1) * paletteTurns.length) % paletteTurns.length];
    const accent = warmAccents[Math.floor(seededUnit(sectionSeed, 2) * warmAccents.length) % warmAccents.length];
    const crescendo = crescendoAccents[Math.floor(seededUnit(sectionSeed, 10) * crescendoAccents.length) % crescendoAccents.length];
    const progress = sectionCount === 1 ? 0 : sectionSlot / Math.max(sectionCount - 1, 1);
    const lateSection = sectionSlot >= Math.max(2, sectionCount - 3);
    const peakSection = sectionSlot >= Math.max(2, sectionCount - 2) || (progress > 0.58 && progress < 0.88);
    const energy = 0.48 + progress * 0.22 + (peakSection ? 0.14 : 0);
    const chapter = sectionSlot % 4;
    const isImpactSection = sectionSlot > 0 && (sectionSlot % 4 === 0 || (sectionCount < 5 && sectionSlot === sectionCount - 1));
    const impactPalette = impactPalettes[Math.floor(seededUnit(sectionSeed, 12) * impactPalettes.length) % impactPalettes.length];
    const impactAccent = impactAccents[Math.floor(seededUnit(sectionSeed, 13) * impactAccents.length) % impactAccents.length];

    addSectionEvent(sectionSlot, 0.03, {
      type: sectionSlot === 0 ? 'focus-shift' : 'density-surge',
      intensity: sectionSlot === 0 ? 0.42 : Math.min(0.9, energy + (isImpactSection ? 0.08 : 0)),
      durationMs: sectionSlot === 0 ? 3600 : peakSection ? 3800 : 3000,
      target: sectionSlot === 0 ? 'center' : 'particles',
      palette: sectionSlot === 0 ? { hueShift: -8, brightness: 1.06 } : undefined,
    });

    // short transition sections: opening surge is sufficient — skip chapter events
    const sectionSlotLength = Math.max(0, estimateSectionEnd(sectionSlot) - (sectionStarts[sectionSlot] ?? 0));
    if (sectionSlotLength < 16) continue;

    if (sectionSlot > 0 && !peakSection) {
      addSectionEvent(sectionSlot, 0.08, {
        type: 'color-morph',
        intensity: Math.min(0.9, 0.58 + progress * 0.22 + (isImpactSection ? 0.08 : 0)),
        durationMs: 9000,
        target: 'particles',
        releaseMode: 'one-by-one',
        color: isImpactSection ? impactAccent : crescendo,
        palette: isImpactSection ? impactPalette : palette,
      });
    } else if (peakSection && sectionSlot > 0) {
      // afterglow: let the storm-release own the peak section open, color settles later
      addSectionEvent(sectionSlot, 0.44, {
        type: 'color-morph',
        intensity: Math.min(0.72, 0.52 + progress * 0.2),
        durationMs: 9000,
        target: 'particles',
        releaseMode: 'one-by-one',
        color: isImpactSection ? impactAccent : crescendo,
        palette: isImpactSection ? impactPalette : palette,
      });
    }

    if (isImpactSection) {
      addSectionEvent(sectionSlot, 0.18 + seededUnit(sectionSeed, 14) * 0.06, {
        type: 'palette-morph',
        intensity: Math.min(0.86, 0.72 + progress * 0.14),
        durationMs: 9000 + Math.round(seededUnit(sectionSeed, 15) * 3000),
        target: seededUnit(sectionSeed, 16) > 0.42 ? 'terrain' : 'background',
        palette: impactPalette,
      });
      addSectionEvent(sectionSlot, 0.38 + seededUnit(sectionSeed, 17) * 0.08, {
        type: 'color-morph',
        intensity: Math.min(0.92, 0.78 + progress * 0.14),
        durationMs: 9000 + Math.round(seededUnit(sectionSeed, 18) * 2500),
        target: 'particles',
        releaseMode: 'one-by-one',
        color: impactAccent,
        palette: impactPalette,
      });
      addSectionEvent(sectionSlot, 0.66 + seededUnit(sectionSeed, 20) * 0.08, {
        type: seededUnit(sectionSeed, 21) > 0.52 ? 'glow-pulse' : 'spark-burst',
        intensity: Math.min(0.76, 0.58 + progress * 0.18),
        durationMs: 1600 + Math.round(seededUnit(sectionSeed, 22) * 1000),
        target: 'particles',
        color: impactAccent,
      });
    }

    if (chapter === 0) {
      addSectionEvent(sectionSlot, 0.34 + seededUnit(sectionSeed, 3) * 0.08, {
        type: 'color-morph',
        intensity: lateSection ? 0.7 : 0.56,
        durationMs: 9000,
        target: 'particles',
        releaseMode: 'one-by-one',
        color: crescendo,
      });
      addSectionEvent(sectionSlot, 0.72 + seededUnit(sectionSeed, 4) * 0.08, {
        type: peakSection ? 'spark-burst' : 'motion-drift',
        intensity: peakSection ? 0.64 : 0.48,
        durationMs: peakSection ? 1800 : 6200,
        target: peakSection ? 'particles' : 'terrain',
        color: accent,
        palette: peakSection ? undefined : { hueShift: 12, saturation: 1.08 },
      });
      continue;
    }

    if (chapter === 1) {
      addSectionEvent(sectionSlot, 0.28 + seededUnit(sectionSeed, 5) * 0.1, {
        type: 'palette-morph',
        intensity: lateSection ? 0.62 : 0.48,
        durationMs: 11000,
        target: 'background',
        palette,
      });
      addSectionEvent(sectionSlot, 0.58 + seededUnit(sectionSeed, 6) * 0.1, {
        type: 'veil-sweep',
        intensity: 0.38 + progress * 0.16,
        durationMs: 4600,
        target: 'mist',
        color: accent,
      });
      addSectionEvent(sectionSlot, 0.78, {
        type: 'motion-drift',
        intensity: 0.46 + progress * 0.16,
        durationMs: 7200,
        target: 'terrain',
        palette: { hueShift: -14, saturation: 1.12 },
      });
      continue;
    }

    if (chapter === 2) {
      addSectionEvent(sectionSlot, 0.3 + seededUnit(sectionSeed, 7) * 0.08, {
        type: 'color-morph',
        intensity: peakSection ? 0.74 : 0.54,
        durationMs: 7800,
        target: 'foreground',
        releaseMode: 'one-by-one',
        palette,
      });
      addSectionEvent(sectionSlot, 0.54 + seededUnit(sectionSeed, 8) * 0.1, {
        type: 'density-surge',
        intensity: peakSection ? 0.78 : 0.56,
        durationMs: 4300,
        target: 'particles',
      });
      addSectionEvent(sectionSlot, 0.82, {
        type: 'grain-bloom',
        intensity: 0.42 + progress * 0.12,
        durationMs: 5200,
        target: 'terrain',
        color: accent,
      });
      continue;
    }

    addSectionEvent(sectionSlot, 0.24 + seededUnit(sectionSeed, 9) * 0.08, {
      type: 'motion-drift',
      intensity: peakSection ? 0.68 : 0.52,
      durationMs: 7600,
      target: 'terrain',
      palette: { hueShift: 18, saturation: 1.08 },
    });
    addSectionEvent(sectionSlot, 0.5 + seededUnit(sectionSeed, 10) * 0.12, {
      type: 'spark-burst',
      intensity: peakSection ? 0.68 : 0.44,
      durationMs: 2200,
      target: 'particles',
      color: accent,
    });
    addSectionEvent(sectionSlot, 0.78, peakSection && seededUnit(sectionSeed, 11) > 0.45
      ? { type: 'bloom-flash', intensity: 0.42, durationMs: 900, target: 'all', color: accent }
      : { type: 'palette-morph', intensity: 0.5, durationMs: 9800, target: 'terrain', palette });
  }

  const existingTimes = new Set(
    events
      .map((event) => resolveEventTime(event, sectionTimes))
      .filter((time): time is number => time !== undefined)
      .map((time) => time.toFixed(2)),
  );
  const firstCue = Math.max(12, sectionTimes[0] ?? 30);
  const lastCue = sectionTimes.length ? sectionTimes[sectionTimes.length - 1] : firstCue;
  const cueGap = sectionTimes.length > 1
    ? Math.max(12, sectionTimes[sectionTimes.length - 1] - sectionTimes[sectionTimes.length - 2])
    : firstCue;
  const candidateTimes = [
    Math.max(6, firstCue * 0.42),
    Math.max(10, firstCue * 0.74),
    Math.max(14, firstCue + cueGap * 0.32),
    Math.max(18, lastCue + cueGap * 0.28),
    Math.max(22, lastCue + cueGap * 0.64),
    Math.max(28, lastCue + cueGap * 0.9),
  ];
  const fillers: readonly VisualPlanEventConfig[] = [
    { type: 'density-surge', intensity: 0.46, durationMs: 2600, target: 'particles' },
    { type: 'focus-shift', intensity: 0.42, durationMs: 3400, target: 'center', palette: { hueShift: 10, brightness: 1.08 } },
    { type: 'veil-sweep', intensity: 0.42, durationMs: 4400, target: 'mist', color: [190, 218, 255] },
    { type: 'motion-drift', intensity: 0.4, durationMs: 5400, target: 'terrain', palette: { hueShift: -14, saturation: 1.12 } },
    { type: 'grain-bloom', intensity: 0.38, durationMs: 3800, target: 'terrain', color: [255, 238, 196] },
    { type: 'color-morph', intensity: 0.44, durationMs: 9000, target: 'particles', releaseMode: 'one-by-one', palette: paletteTurns[seed % paletteTurns.length] },
  ];

  const minimumEventCount = Math.max(5, Math.min(18, sectionCount * 3));

  for (let index = 0; events.length < minimumEventCount && index < candidateTimes.length; index += 1) {
    const time = candidateTimes[index];
    const key = time.toFixed(2);
    if (existingTimes.has(key)) continue;
    existingTimes.add(key);
    events.push({ ...fillers[index % fillers.length], time });
  }

  return events;
}

export function buildTrackVisualPlan(
  albumName: string,
  trackTitle: string,
  sectionTimes: number[],
  visualConfig?: TrackVisualConfig,
  baseColor?: string | null,
  rotationSeed?: string,
  trackDuration?: number,
  beatGrid?: BeatGrid,
  artworkUrl?: string | null,
): TrackVisualPlan {
  const albumKey = normalizeRuntimeKey(albumName);
  const trackKey = normalizeRuntimeKey(trackTitle);
  const hasPinnedVisualStructure = !!(
    visualConfig?.sequence?.length
    || visualConfig?.steps?.length
    || visualConfig?.storyboard
    || visualConfig?.fallbackRecipeId
    || visualConfig?.internalEvolution === false
    || visualConfig?.singleSketch === true
  );
  // Don't pad beyond the natural section count — synthetic boundaries break musical alignment.
  // Only pad tracks that genuinely have too few real sections for visual variety.
  const effectiveSectionTimes = hasPinnedVisualStructure
    ? sectionTimes
    : padSectionTimes(sectionTimes, trackDuration, Math.max(6, sectionTimes.length + 1));
  const sectionCount = Math.max(effectiveSectionTimes.length + 1, visualConfig?.steps?.length ?? 0, 1);
  const generatedChapterCount = Math.min(3, sectionCount);
  const sequenceSlotCount = hasPinnedVisualStructure ? sectionCount : generatedChapterCount;
  const VARIED_TEMPLATES = [
    'ambient-arc', 'lift-arc', 'pulse-arc',
    'journey', 'generative-variety',
  ] as const;
  const templateSeed = hashString(`${albumKey}::${trackKey}::${rotationSeed ?? ''}::storyboard-template`);
  const effectiveStoryboard = visualConfig?.storyboard ?? {
    template: VARIED_TEMPLATES[templateSeed % VARIED_TEMPLATES.length],
    variance: 'high' as const,
    ...(visualConfig?.generatedRecipePool?.length ? { recipePool: visualConfig.generatedRecipePool } : {}),
  };
  const storyboardSequence = buildStoryboardSequence(
    albumName,
    trackTitle,
    sequenceSlotCount,
    effectiveStoryboard,
    hasPinnedVisualStructure
      ? undefined
      : { disallowImageDependentIntro: true, introFallbackRecipeId: GENERATED_INTRO_RECIPE_ID },
  );
  const selectedSequence = visualConfig?.sequence?.length
    ? visualConfig.sequence.map((recipeId) => resolveProductionRecipeId(recipeId)).filter((recipeId): recipeId is ExplorerRecipeId => !!recipeId)
    : storyboardSequence?.length
      ? storyboardSequence
      : hasPinnedVisualStructure
        ? [MOSH_BASE_RECIPE_ID]
        : buildDefaultGenerativeSequence(
          albumKey,
          trackKey,
          sequenceSlotCount,
          baseColor,
          visualConfig?.generatedRecipePool,
          visualConfig?.disabledRecipeIds,
          rotationSeed,
        );
  // Openers are always a generative (non-mosh) sketch — the artwork datamosh is
  // never the first thing shown. It surfaces only as a rare mid-sequence accent
  // (applyGeneratedMoshAccent), and only for tracks that actually have artwork.
  const generatedOpener = !hasPinnedVisualStructure
    ? buildDefaultGenerativeSequence(
        albumKey,
        trackKey,
        sequenceSlotCount,
        baseColor,
        visualConfig?.generatedRecipePool,
        visualConfig?.disabledRecipeIds,
        rotationSeed,
      )[0]
    : undefined;
  const openedSequence = generatedOpener && selectedSequence.length
    ? [generatedOpener, ...selectedSequence.slice(1)]
    : selectedSequence;
  const sequence = hasPinnedVisualStructure || !artworkUrl
    ? openedSequence
    : applyGeneratedMoshAccent(
      openedSequence,
      albumKey,
      trackKey,
      visualConfig?.generatedMoshRecipePool,
      visualConfig?.disabledRecipeIds,
      rotationSeed,
    );
  const fallbackRecipeId = resolveProductionRecipeId(visualConfig?.fallbackRecipeId)
    ?? resolveProductionRecipeId(visualConfig?.storyboard?.anchors?.fallbackRecipeId)
    ?? resolveProductionRecipeId(visualConfig?.steps?.[0]?.recipeId)
    ?? sequence[0]
    ?? DEFAULT_RECIPE_ID;
  const defaultTransitionMs = sanitizeTransitionMs(visualConfig?.defaultTransitionMs);
  const singleSketch = visualConfig?.singleSketch ?? hasPinnedVisualStructure;
  const singleSketchRecipeId = sequence[0] ?? fallbackRecipeId;
  const steps = Array.from({ length: sectionCount }, (_, index) => {
    const step = visualConfig?.steps?.[index];
    const mood = getSectionMood(step?.moodId);
    const chapterIndex = Math.floor(index * generatedChapterCount / sectionCount);
    const previousChapterIndex = index > 0
      ? Math.floor((index - 1) * generatedChapterCount / sectionCount)
      : chapterIndex;
    const generatedTransitionMs = index === 0 || chapterIndex !== previousChapterIndex
      ? GENERATED_CHAPTER_TRANSITION_MS
      : GENERATED_INTERNAL_TRANSITION_MS;

    return {
      recipeId: step?.recipeId
        ? (singleSketch ? singleSketchRecipeId : resolveProductionRecipeId(step.recipeId) ?? step.recipeId)
        : (singleSketch ? singleSketchRecipeId : sequence[(hasPinnedVisualStructure ? index : chapterIndex) % sequence.length])
        ?? fallbackRecipeId,
      transitionMs: hasPinnedVisualStructure
        ? sanitizeTransitionMs(step?.transitionMs ?? defaultTransitionMs)
        : generatedTransitionMs,
      ...(step?.moodId ? { moodId: step.moodId } : {}),
      ...(mergeParams(mood?.params, step?.params) ? { params: mergeParams(mood?.params, step?.params) } : {}),
      ...(mergePalette(mood?.palette, step?.palette) ? { palette: mergePalette(mood?.palette, step?.palette) } : {}),
      ...(step?.events?.length ? { events: step.events } : {}),
    };
  });

  return {
    key: createPlanKey(albumKey, trackKey, sectionCount),
    albumKey,
    trackKey,
    fallbackRecipeId,
    steps,
    events: buildPlanEvents(effectiveSectionTimes, visualConfig?.events, steps, `${albumKey}::${trackKey}`, visualConfig?.defaultEvents ?? visualConfig?.internalEvolution ?? true, effectiveStoryboard.template, trackDuration, beatGrid, effectiveStoryboard, sectionTimes),
    ...(beatGrid ? { beatGrid } : {}),
  };
}

export function getSectionRecipe(plan: TrackVisualPlan, sectionIndex: number): ExplorerRecipe {
  const step = plan.steps[Math.max(0, Math.min(sectionIndex, plan.steps.length - 1))];
  return getExplorerRecipe(step?.recipeId ?? plan.fallbackRecipeId);
}

export function getCardStyle(
  albumName: string,
  trackTitle: string,
  sectionTimes: number[],
  currentTime: number,
  visualConfig?: TrackVisualConfig,
  baseColor?: string | null,
): { cardBg: string; cardBorder: string } {
  const plan = buildTrackVisualPlan(albumName, trackTitle, sectionTimes, visualConfig, baseColor);
  const recipe = getSectionRecipe(plan, getSectionIndex(sectionTimes, currentTime));
  return { cardBg: recipe.cardBg, cardBorder: recipe.cardBorder };
}
