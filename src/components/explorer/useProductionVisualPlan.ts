import { useEffect, useMemo } from 'react';
import type { SectionMoodOverride } from './SectionMoodLab';
import { buildTrackVisualPlan, getSectionIndex, getSectionRecipe, mergeTrackVisualConfigs, padSectionTimes, resolveBeatGrid } from './runtime/plans';
import { normalizeSectionTimes } from './runtime/section-times';
import { GLOBAL_DISABLED_RECIPE_IDS, getExplorerRecipe, isGloballyDisabledRecipe, isImageDependentRecipe, listRandomRecipeIds } from './runtime/recipes';
import { REVIEW_SECTION_MOOD_IDS } from './runtime/section-moods';
import type { ExplorerRecipeId, TrackVisualConfig } from './runtime/types';
import type { Album } from './showcase-data';
import {
  DEFAULT_AUTOMATIC_SKETCH_DECK,
  type ProductionsVisualSettings,
} from './production-settings';

const FORCE_GENERATED_VISUALS_FOR_ALL_TRACKS = false;
const EMPTY_SECTION_TIMES: number[] = [];
const PARTICLE_EVOLUTION_KERNELS = new Set([
  'cong-generative-particles',
  'cong-cloud-orbit',
  'cong-rain-shower',
  'cong-lateral-current',
  'cong-lateral-cascade',
  'cong-waterline-shimmer',
]);

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getProductionMoshArcName(albumName: string, trackTitle: string): string {
  const arcs = ['rain-first', 'flow-first', 'storm-first', 'fracture-first'] as const;
  return arcs[hashString(`${albumName}::${trackTitle}::mosh-arc`) % arcs.length];
}

function hasAuthoredVisualConfig(config: TrackVisualConfig | undefined): boolean {
  if (!config) return false;
  return !!(
    config.fallbackRecipeId
    || config.sequence?.length
    || config.steps?.length
    || config.storyboard
    || config.internalEvolution === false
    || config.singleSketch === true
  );
}

function stripAuthoredVisualConfig(config: TrackVisualConfig | undefined): TrackVisualConfig | undefined {
  if (!config || !FORCE_GENERATED_VISUALS_FOR_ALL_TRACKS) return config;

  return {
    ...(config.defaultTransitionMs !== undefined ? { defaultTransitionMs: config.defaultTransitionMs } : {}),
    ...(config.internalEvolution !== undefined ? { internalEvolution: config.internalEvolution } : {}),
    ...(config.generatedRecipePool?.length ? { generatedRecipePool: config.generatedRecipePool } : {}),
    ...(config.generatedMoshRecipePool?.length ? { generatedMoshRecipePool: config.generatedMoshRecipePool } : {}),
    ...(config.disabledRecipeIds?.length ? { disabledRecipeIds: config.disabledRecipeIds } : {}),
  };
}

function prioritizeInternalEvolutionRecipes(recipeIds: readonly ExplorerRecipeId[]): ExplorerRecipeId[] {
  const indexed = recipeIds.map((recipeId, index) => ({ recipeId, index, recipe: getExplorerRecipe(recipeId) }));
  indexed.sort((a, b) => {
    const aParticleReady = PARTICLE_EVOLUTION_KERNELS.has(a.recipe.kernel) ? 0 : 1;
    const bParticleReady = PARTICLE_EVOLUTION_KERNELS.has(b.recipe.kernel) ? 0 : 1;
    return aParticleReady - bParticleReady || a.index - b.index;
  });

  return indexed.map((item) => item.recipeId);
}

export function recipeIsDisabled(recipeId: ExplorerRecipeId | undefined): boolean {
  return !!recipeId && isGloballyDisabledRecipe(getExplorerRecipe(recipeId).id);
}

function replaceGloballyDisabledRecipes(config: TrackVisualConfig, fallbackRecipeId: ExplorerRecipeId): TrackVisualConfig {
  const replaceRecipeId = (recipeId: ExplorerRecipeId | undefined): ExplorerRecipeId | undefined => {
    if (!recipeId) return undefined;
    return recipeIsDisabled(recipeId) ? fallbackRecipeId : recipeId;
  };
  const normalizeRecipeList = (recipeIds: readonly ExplorerRecipeId[] | undefined): ExplorerRecipeId[] | undefined => {
    const nextRecipeIds = recipeIds
      ?.map((recipeId) => replaceRecipeId(recipeId))
      .filter((recipeId): recipeId is ExplorerRecipeId => !!recipeId);
    return nextRecipeIds?.length ? Array.from(new Set(nextRecipeIds)) : undefined;
  };
  const nextSequence = config.sequence
    ? normalizeRecipeList(config.sequence)
    : undefined;
  const nextSteps = config.steps?.map((step) => ({
    ...step,
    recipeId: replaceRecipeId(step.recipeId) ?? fallbackRecipeId,
  }));
  const nextRecipePool = config.storyboard?.recipePool
    ? normalizeRecipeList(config.storyboard.recipePool)
    : undefined;
  const nextGeneratedRecipePool = config.generatedRecipePool
    ? normalizeRecipeList(config.generatedRecipePool)
    : undefined;
  const nextGeneratedMoshRecipePool = config.generatedMoshRecipePool
    ? normalizeRecipeList(config.generatedMoshRecipePool)
    : undefined;
  const nextDisabledRecipeIds = Array.from(new Set([
    ...(config.disabledRecipeIds ?? []),
    ...GLOBAL_DISABLED_RECIPE_IDS,
  ]));
  const nextAnchors = config.storyboard?.anchors
    ? {
        ...config.storyboard.anchors,
        intro: replaceRecipeId(config.storyboard.anchors.intro),
        peak: replaceRecipeId(config.storyboard.anchors.peak),
        outro: replaceRecipeId(config.storyboard.anchors.outro),
        fallbackRecipeId: replaceRecipeId(config.storyboard.anchors.fallbackRecipeId),
      }
    : undefined;

  return {
    ...config,
    fallbackRecipeId: replaceRecipeId(config.fallbackRecipeId) ?? config.fallbackRecipeId,
    ...(nextSequence?.length ? { sequence: nextSequence } : config.sequence ? { sequence: [fallbackRecipeId] } : {}),
    ...(nextSteps?.length ? { steps: nextSteps } : {}),
    ...(nextGeneratedRecipePool?.length ? { generatedRecipePool: nextGeneratedRecipePool } : config.generatedRecipePool ? { generatedRecipePool: [fallbackRecipeId] } : {}),
    ...(nextGeneratedMoshRecipePool?.length ? { generatedMoshRecipePool: nextGeneratedMoshRecipePool } : {}),
    disabledRecipeIds: nextDisabledRecipeIds,
    ...(config.storyboard ? {
      storyboard: {
        ...config.storyboard,
        ...(nextRecipePool?.length ? { recipePool: nextRecipePool } : config.storyboard.recipePool ? { recipePool: [fallbackRecipeId] } : {}),
        ...(nextAnchors ? { anchors: nextAnchors } : {}),
      },
    } : {}),
    debugLabel: config.debugLabel ? `${config.debugLabel} + disabled-safe` : 'authored disabled-safe fallback',
  };
}

export interface ProductionVisualPlanInput {
  album: Album | undefined;
  fallbackAlbum: Album | undefined;
  effectiveVisualTrackIndex: number;
  currentTime: number;
  trackProgress: number;
  visualSettings: ProductionsVisualSettings;
  automaticRecipeId: ExplorerRecipeId;
  showMoodLab: boolean;
  sectionMoodOverrides: Record<string, SectionMoodOverride>;
  setSectionMoodOverrides: (updater: (current: Record<string, SectionMoodOverride>) => Record<string, SectionMoodOverride>) => void;
  rotationSeed: string;
}

export function useProductionVisualPlan({
  album,
  fallbackAlbum,
  effectiveVisualTrackIndex,
  currentTime,
  trackProgress,
  visualSettings,
  automaticRecipeId,
  showMoodLab,
  sectionMoodOverrides,
  setSectionMoodOverrides,
  rotationSeed,
}: ProductionVisualPlanInput) {
  const visualAlbum = album ?? fallbackAlbum;
  const albumName = visualAlbum?.name ?? '';
  const baseColor = visualAlbum?.base_color ?? null;
  const track = visualAlbum?.tracks[effectiveVisualTrackIndex] ?? visualAlbum?.tracks[0];
  const trackTitle = track?.title ?? '';
  const rawSectionTimes = track?.section_times ?? EMPTY_SECTION_TIMES;
  const beatGrid = useMemo(() => resolveBeatGrid(track?.bpm, track?.beatStartAt), [track?.beatStartAt, track?.bpm]);
  const visualCurrentTime = currentTime;
  const visualTrackProgress = trackProgress;
  const baseVisualConfig = useMemo(
    () => stripAuthoredVisualConfig(mergeTrackVisualConfigs(visualAlbum?.visualConfig, track?.visualConfig)),
    [visualAlbum?.visualConfig, track?.visualConfig],
  );
  const randomRecipePool = useMemo(
    () => listRandomRecipeIds(visualSettings.localDisabledSketches),
    [visualSettings.localDisabledSketches],
  );
  const generatedSectionRecipePool = useMemo(() => {
    const automaticSet = new Set(visualSettings.automaticSketchDeck);
    const ordinaryAutomaticPool = randomRecipePool.filter((recipeId) => automaticSet.has(recipeId) && !isImageDependentRecipe(recipeId));
    if (ordinaryAutomaticPool.length) return prioritizeInternalEvolutionRecipes(ordinaryAutomaticPool);

    const ordinaryEligiblePool = randomRecipePool.filter((recipeId) => !isImageDependentRecipe(recipeId));
    if (ordinaryEligiblePool.length) return prioritizeInternalEvolutionRecipes(ordinaryEligiblePool);

    return prioritizeInternalEvolutionRecipes(DEFAULT_AUTOMATIC_SKETCH_DECK);
  }, [randomRecipePool, visualSettings.automaticSketchDeck]);
  const generatedMoshRecipePool = useMemo(
    () => randomRecipePool.filter((recipeId) => isImageDependentRecipe(recipeId)),
    [randomRecipePool],
  );
  const visualAssignmentMode: 'authored' | 'fallback' = hasAuthoredVisualConfig(baseVisualConfig)
    ? 'authored'
    : 'fallback';
  const sectionTimes = useMemo(() => {
    // Normalize in BOTH modes so getSectionIndex/cues always get sorted,
    // in-bounds, de-jittered boundaries — authored data is not pre-cleaned.
    const cleaned = normalizeSectionTimes(rawSectionTimes, track?.duration ?? undefined);
    return visualAssignmentMode === 'authored'
      ? cleaned
      : padSectionTimes(cleaned, track?.duration ?? undefined, Math.max(6, cleaned.length + 1));
  }, [rawSectionTimes, track?.duration, visualAssignmentMode]);
  const visualConfig = useMemo<TrackVisualConfig | undefined>(() => {
    const fallbackRecipeId = 'cong-artwork-datamosh-rain-evolution';
    if (hasAuthoredVisualConfig(baseVisualConfig)) {
      return baseVisualConfig ? replaceGloballyDisabledRecipes(baseVisualConfig, fallbackRecipeId) : baseVisualConfig;
    }

    return baseVisualConfig;
  }, [baseVisualConfig]);
  const sectionIndex = getSectionIndex(sectionTimes, visualCurrentTime);
  const moodTrackOverrideKey = `${albumName}::${trackTitle}::__recipe`;
  const moodOverrideKey = `${albumName}::${trackTitle}::${sectionIndex}`;
  const storedReviewRecipeId = sectionMoodOverrides[moodTrackOverrideKey]?.recipeId;
  const reviewRecipeId = recipeIsDisabled(storedReviewRecipeId) ? undefined : storedReviewRecipeId;

  useEffect(() => {
    if (!storedReviewRecipeId || !recipeIsDisabled(storedReviewRecipeId)) return;
    setSectionMoodOverrides((current) => {
      if (current[moodTrackOverrideKey]?.recipeId !== storedReviewRecipeId) return current;
      const next = { ...current };
      delete next[moodTrackOverrideKey];
      return next;
    });
  }, [moodTrackOverrideKey, setSectionMoodOverrides, storedReviewRecipeId]);

  const startupVisualConfig = useMemo(() => {
    if (visualAssignmentMode === 'authored' || !automaticRecipeId) return visualConfig;
    return {
      ...visualConfig,
      generatedRecipePool: generatedSectionRecipePool,
      generatedMoshRecipePool,
      disabledRecipeIds: visualSettings.localDisabledSketches,
      debugLabel: visualConfig?.debugLabel ? `${visualConfig.debugLabel} + generated section rotation` : 'generated section rotation',
    };
  }, [automaticRecipeId, generatedMoshRecipePool, generatedSectionRecipePool, visualAssignmentMode, visualConfig, visualSettings.localDisabledSketches]);
  const moodLabVisualConfig = useMemo(() => {
    const baseConfig = startupVisualConfig;
    if (!showMoodLab) return baseConfig;
    const override = sectionMoodOverrides[moodOverrideKey];
    if (baseConfig?.events?.length && !override && !reviewRecipeId) return baseConfig;

    const basePlanForLab = buildTrackVisualPlan(albumName, trackTitle, sectionTimes, baseConfig, baseColor, rotationSeed, track?.duration ?? undefined, beatGrid, visualAlbum?.artworkUrl);
    const singleRecipeId = reviewRecipeId ?? basePlanForLab.steps[0]?.recipeId;
    const steps = basePlanForLab.steps.map((step, index) => {
      const isCurrentSection = index === sectionIndex;

      return {
        recipeId: reviewRecipeId ?? step.recipeId,
        transitionMs: step.transitionMs,
        moodId: isCurrentSection && override?.moodId ? override.moodId : step.moodId ?? REVIEW_SECTION_MOOD_IDS[index % REVIEW_SECTION_MOOD_IDS.length],
        ...(isCurrentSection && override?.params ? { params: { ...(step?.params ?? {}), ...override.params } } : step?.params ? { params: step.params } : {}),
        ...(isCurrentSection && override?.palette ? { palette: { ...(step?.palette ?? {}), ...override.palette } } : step?.palette ? { palette: step.palette } : {}),
      };
    });

    return {
      ...baseConfig,
      fallbackRecipeId: singleRecipeId ?? baseConfig?.fallbackRecipeId,
      sequence: reviewRecipeId && singleRecipeId ? [singleRecipeId] : baseConfig?.sequence,
      steps,
      debugLabel: baseConfig?.debugLabel ? `${baseConfig.debugLabel} + local lab` : 'local mood lab',
    };
  }, [albumName, baseColor, beatGrid, moodOverrideKey, reviewRecipeId, rotationSeed, sectionIndex, sectionMoodOverrides, sectionTimes, showMoodLab, startupVisualConfig, track?.duration, trackTitle, visualAlbum?.artworkUrl]);
  const visualPlan = useMemo(
    () => buildTrackVisualPlan(albumName, trackTitle, sectionTimes, moodLabVisualConfig, baseColor, rotationSeed, track?.duration ?? undefined, beatGrid, visualAlbum?.artworkUrl),
    [albumName, trackTitle, sectionTimes, moodLabVisualConfig, baseColor, rotationSeed, track?.duration, beatGrid, visualAlbum?.artworkUrl],
  );
  const currentRecipe = getSectionRecipe(visualPlan, sectionIndex);
  const visualChipPrefix = reviewRecipeId
    ? 'Review override'
    : visualAssignmentMode === 'authored'
      ? 'Authored'
      : 'Production';
  const productionArcName = useMemo(() => getProductionMoshArcName(albumName, trackTitle), [albumName, trackTitle]);
  const productionChipDetail = visualAssignmentMode === 'fallback' && !reviewRecipeId
    ? currentRecipe.id === 'cong-artwork-datamosh-rain-evolution'
      ? ` · arc ${productionArcName}`
      : ` · generated`
    : '';

  return {
    album: visualAlbum,
    albumName,
    baseColor,
    track,
    trackTitle,
    sectionTimes,
    beatGrid,
    visualCurrentTime,
    visualTrackProgress,
    visualPlan,
    currentRecipe,
    moodLabVisualConfig,
    sectionIndex,
    moodOverrideKey,
    moodTrackOverrideKey,
    reviewRecipeId,
    visualAssignmentMode,
    visualChipPrefix,
    productionChipDetail,
    randomRecipePool: generatedSectionRecipePool,
    rotationSeed,
  };
}
