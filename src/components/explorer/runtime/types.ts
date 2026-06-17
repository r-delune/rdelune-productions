import type { CongCandidateId } from '../cong/types';
import type { VisualizerTuningKey } from '../tuning';
import type { VisualEventReleaseMode, VisualEventTarget, VisualEventType, VisualParams } from '../visualizer';
import type { VisualizerName } from '../visualizers/registry';

export type ExplorerRecipeId = string;
export type ExplorerSceneProfile =
  | 'ink'
  | 'smoke'
  | 'tide'
  | 'cloud'
  | 'rain'
  | 'flow'
  | 'spiral'
  | 'contour'
  | 'planet'
  | 'particle'
  | 'galaxy'
  | 'storm'
  | 'mist'
  | 'texture'
  | 'line'
  | 'grid'
  | 'geology'
  | 'sparse';
export type ExplorerStoryboardTemplate = 'ambient-arc' | 'lift-arc' | 'pulse-arc' | 'journey' | 'cloud-again' | 'mosh-arc' | 'generative-variety';
export type ExplorerStoryboardEnergy = 'low' | 'medium' | 'high';
export type ExplorerStoryboardVariance = 'low' | 'medium' | 'high';
export type ExplorerStoryboardFocus = ExplorerSceneProfile | 'mixed';
export type ExplorerStoryboardSectionRole = 'intro' | 'establish' | 'drift' | 'build' | 'lift' | 'peak' | 'release' | 'afterglow';

export interface VisualStoryboardAnchors {
  intro?: ExplorerRecipeId;
  peak?: ExplorerRecipeId;
  outro?: ExplorerRecipeId;
  fallbackRecipeId?: ExplorerRecipeId;
}

export interface VisualStoryboard {
  template?: ExplorerStoryboardTemplate;
  focus?: ExplorerStoryboardFocus;
  energy?: ExplorerStoryboardEnergy;
  variance?: ExplorerStoryboardVariance;
  recipePool?: readonly ExplorerRecipeId[];
  anchors?: VisualStoryboardAnchors;
  sectionRoles?: readonly ExplorerStoryboardSectionRole[];
  debugLabel?: string;
}

export interface VisualPlanConfigStep {
  recipeId: ExplorerRecipeId;
  transitionMs?: number;
  moodId?: string;
  params?: Partial<VisualParams>;
  palette?: SectionPaletteConfig;
  events?: readonly VisualPlanEventConfig[];
}

export interface TrackVisualConfig {
  fallbackRecipeId?: ExplorerRecipeId;
  defaultTransitionMs?: number;
  sequence?: readonly ExplorerRecipeId[];
  steps?: readonly VisualPlanConfigStep[];
  events?: readonly VisualPlanEventConfig[];
  defaultEvents?: boolean;
  internalEvolution?: boolean;
  singleSketch?: boolean;
  storyboard?: VisualStoryboard;
  generatedRecipePool?: readonly ExplorerRecipeId[];
  generatedMoshRecipePool?: readonly ExplorerRecipeId[];
  disabledRecipeIds?: readonly ExplorerRecipeId[];
  debugLabel?: string;
}

export interface SectionPaletteConfig {
  hueShift?: number;
  saturation?: number;
  brightness?: number;
  contrast?: number;
}

export interface ExplorerRecipe {
  id: ExplorerRecipeId;
  name: string;
  source: 'native' | 'cong';
  kernel: VisualizerName;
  sceneProfile: ExplorerSceneProfile;
  baseParams: VisualParams;
  cardBg: string;
  cardBorder: string;
  tuningKey?: VisualizerTuningKey;
  candidateIds?: CongCandidateId[];
  materialOverlayAlpha?: number;
  productionReady?: boolean;
  reviewable?: boolean;
  startupEligible?: boolean;
  randomEligible?: boolean;
  disabledReason?: string;
}

export interface VisualPlanEventConfig {
  type: VisualEventType;
  sectionIndex?: number;
  time?: number;
  offsetSeconds?: number;
  intensity?: number;
  target?: VisualEventTarget;
  durationMs?: number;
  color?: [number, number, number];
  palette?: SectionPaletteConfig;
  releaseMode?: VisualEventReleaseMode;
}

export interface SectionVisualEvent extends VisualPlanEventConfig {
  id: string;
  t: number;
  intensity: number;
  generated?: boolean;
}

export interface BeatGrid {
  bpm: number;
  beatStartAt: number;
  barDurationSeconds: number;
  bpmSource: 'authored' | 'default';
  beatStartSource: 'authored' | 'default';
}

export interface SectionVisualStep {
  recipeId: ExplorerRecipeId;
  transitionMs: number;
  moodId?: string;
  params?: Partial<VisualParams>;
  palette?: SectionPaletteConfig;
  events?: readonly VisualPlanEventConfig[];
}

export interface TrackVisualPlan {
  key: string;
  albumKey: string;
  trackKey: string;
  steps: SectionVisualStep[];
  events: SectionVisualEvent[];
  fallbackRecipeId: ExplorerRecipeId;
  beatGrid?: BeatGrid;
}
