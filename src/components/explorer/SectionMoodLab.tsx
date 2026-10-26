'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { REVIEW_RECIPE_IDS, getExplorerRecipe, isImageDependentRecipe, listRandomRecipeIds } from './runtime/recipes';
import { REVIEW_SECTION_MOOD_IDS, SECTION_MOODS } from './runtime/section-moods';
import type { BeatGrid, ExplorerRecipe, ExplorerRecipeId, SectionPaletteConfig, SectionVisualStep, TrackVisualConfig, TrackVisualPlan } from './runtime/types';
import { getBeatGridPosition } from './runtime/plans';
import type { VisualParams } from './visualizer';
import { getRenderQualityTelemetry, type RenderQualityTelemetry } from './render-quality';
import {
  createProductionsSettingsBundle,
  DEFAULT_PRODUCTIONS_VISUAL_SETTINGS,
  DEFAULT_AUTOMATIC_SKETCH_DECK,
  parseProductionsSettingsBundle,
  PRODUCTIONS_SETTINGS_BUNDLE_VERSION,
  PRODUCTIONS_VISUAL_SETTINGS_STORAGE_KEY,
  readProductionsVisualSettingsSavedAt,
  SHIPPED_PRODUCTIONS_VISUAL_SETTINGS_VERSION,
  type ProductionsVisualSettings,
} from './production-settings';

type ParamKey = Exclude<keyof VisualParams, 'pointer'>;
type PaletteKey = keyof SectionPaletteConfig;

export interface SectionMoodOverride {
  recipeId?: string;
  moodId?: string;
  params?: Partial<VisualParams>;
  palette?: SectionPaletteConfig;
}

interface Props {
  sectionIndex: number;
  sectionCount: number;
  step?: SectionVisualStep;
  baseParams: VisualParams;
  override?: SectionMoodOverride;
  albumName?: string;
  trackTitle?: string;
  trackNote?: string;
  recipe?: ExplorerRecipe;
  reviewRecipeId?: string;
  currentTime?: number;
  beatGrid?: BeatGrid;
  visualConfig?: TrackVisualConfig;
  visualPlan?: TrackVisualPlan;
  visualSettings?: ProductionsVisualSettings;
  visualAssignmentMode?: 'authored' | 'fallback';
  visualRotationLabel?: string;
  randomRecipePool?: readonly string[];
  onVisualSettingsChange?: (settings: ProductionsVisualSettings) => void;
  onResetVisualSettings?: () => void;
  onRecipeChange?: (recipeId: string | undefined) => void;
  onClearAllOverrides?: () => void;
  onChange: (override: SectionMoodOverride | undefined) => void;
}

interface SliderConfig<T extends string> {
  key: T;
  label: string;
  min: number;
  max: number;
  step: number;
  fallback: number;
}

const PARAM_SLIDERS: readonly SliderConfig<ParamKey>[] = [
  { key: 'turbulence', label: 'Turb', min: 0, max: 1, step: 0.01, fallback: 0.3 },
  { key: 'density', label: 'Dens', min: 0, max: 1, step: 0.01, fallback: 0.4 },
  { key: 'glow', label: 'Glow', min: 0, max: 1, step: 0.01, fallback: 0.24 },
  { key: 'drift', label: 'Drift', min: 0, max: 1, step: 0.01, fallback: 0.3 },
  { key: 'hueShift', label: 'Hue', min: -45, max: 45, step: 1, fallback: 0 },
  { key: 'shimmer', label: 'Shim', min: 0, max: 1, step: 0.01, fallback: 0.16 },
  { key: 'impulse', label: 'Imp', min: 0, max: 1, step: 0.01, fallback: 0 },
];

const PALETTE_SLIDERS: readonly SliderConfig<PaletteKey>[] = [
  { key: 'hueShift', label: 'Pal Hue', min: -45, max: 45, step: 1, fallback: 0 },
  { key: 'saturation', label: 'Sat', min: 0.4, max: 1.6, step: 0.01, fallback: 1 },
  { key: 'brightness', label: 'Bright', min: 0.5, max: 1.6, step: 0.01, fallback: 1 },
  { key: 'contrast', label: 'Cont', min: 0.6, max: 1.4, step: 0.01, fallback: 1 },
];

const STROKE_MODE_FALLBACK = 1;

function compact<T extends Record<string, unknown>>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, item]) => typeof item === 'number' && isFinite(item));
  return entries.length ? Object.fromEntries(entries) as T : undefined;
}

function SliderRow<T extends string>({
  config,
  value,
  onChange,
}: {
  config: SliderConfig<T>;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[3.8rem_1fr_3rem] items-center gap-2 text-[11px] text-white/82">
      <span className="uppercase tracking-[0.16em] text-white/72">{config.label}</span>
      <input
        type="range"
        min={config.min}
        max={config.max}
        step={config.step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="h-1 w-full accent-white/80"
      />
      <span className="text-right font-mono text-[10px] text-white/82">{value.toFixed(config.step >= 1 ? 0 : 2)}</span>
    </label>
  );
}

function formatCue(time: number): string {
  return `${time.toFixed(1)}s`;
}

function formatSavedAt(value: string | null): string {
  if (!value) return 'not saved this session';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'saved';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function SectionMoodLab({
  sectionIndex,
  sectionCount,
  step,
  baseParams,
  override,
  albumName,
  trackTitle,
  trackNote,
  recipe,
  reviewRecipeId,
  currentTime = 0,
  beatGrid,
  visualConfig,
  visualPlan,
  visualSettings,
  visualAssignmentMode,
  visualRotationLabel,
  randomRecipePool,
  onVisualSettingsChange,
  onResetVisualSettings,
  onRecipeChange,
  onClearAllOverrides,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [sketchFilter, setSketchFilter] = useState('');
  const [showHiddenSketches, setShowHiddenSketches] = useState(false);
  const [hiddenReviewSketches, setHiddenReviewSketches] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [persistenceMessage, setPersistenceMessage] = useState('Autosaved locally');
  const [qualityTelemetry, setQualityTelemetry] = useState<RenderQualityTelemetry>(() => getRenderQualityTelemetry());
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setHiddenReviewSketches(visualSettings?.localDisabledSketches ?? []);
  }, [visualSettings?.localDisabledSketches]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSavedAt(readProductionsVisualSettingsSavedAt()), 0);
    return () => window.clearTimeout(timer);
  }, [visualSettings]);

  useEffect(() => {
    const update = () => setQualityTelemetry(getRenderQualityTelemetry());
    update();
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, []);

  const params = useMemo(() => ({ ...baseParams, ...(step?.params ?? {}), ...(override?.params ?? {}) }), [baseParams, override?.params, step?.params]);
  const palette = useMemo(() => ({ hueShift: 0, saturation: 1, brightness: 1, contrast: 1, ...(step?.palette ?? {}), ...(override?.palette ?? {}) }), [override?.palette, step?.palette]);

  const snippet = useMemo(() => JSON.stringify({
    recipe_id: step?.recipeId,
    ...(step?.moodId ? { mood_id: step.moodId } : {}),
    ...(compact(params) ? { params: compact(params) } : {}),
    ...(compact(palette) ? { palette: compact(palette) } : {}),
    ...(step?.transitionMs ? { transition_ms: step.transitionMs } : {}),
  }, null, 2), [palette, params, step]);
  const planMode = visualConfig?.steps?.length
    ? visualConfig.singleSketch === false ? 'explicit sketch steps' : 'single sketch + step moods'
    : visualConfig?.sequence?.length
      ? 'configured sequence'
      : visualConfig?.storyboard
        ? 'storyboard'
        : 'fallback sequence';
  const currentPlanStep = visualPlan?.steps[Math.max(0, Math.min(sectionIndex, (visualPlan?.steps.length ?? 1) - 1))];
  const nextPlanStep = visualPlan?.steps[Math.min(sectionIndex + 1, Math.max((visualPlan?.steps.length ?? 1) - 1, 0))];
  const lastEvent = visualPlan ? [...visualPlan.events].reverse().find((event) => event.t <= currentTime) : undefined;
  const nextEvent = visualPlan?.events.find((event) => event.t > currentTime);
  const beatPosition = beatGrid ? getBeatGridPosition(beatGrid, currentTime) : undefined;
  const currentRecipe = currentPlanStep ? getExplorerRecipe(currentPlanStep.recipeId) : recipe;
  const nextRecipe = nextPlanStep ? getExplorerRecipe(nextPlanStep.recipeId) : undefined;
  const nextMode = currentRecipe && nextRecipe
    ? currentRecipe.id === nextRecipe.id ? 'internal event' : 'sketch transition'
    : '—';
  const activeReviewRecipeId = reviewRecipeId ?? currentRecipe?.id ?? step?.recipeId;
  const activeMoodId = override?.moodId ?? step?.moodId ?? 'base';
  const localDisabledSet = useMemo(() => new Set(visualSettings?.localDisabledSketches ?? hiddenReviewSketches), [hiddenReviewSketches, visualSettings?.localDisabledSketches]);
  const filteredReviewRecipes = useMemo(() => {
    const filter = sketchFilter.trim().toLowerCase();
    const visibleRecipes = showHiddenSketches
      ? REVIEW_RECIPE_IDS
      : REVIEW_RECIPE_IDS.filter((recipeId) => !localDisabledSet.has(recipeId));
    if (!filter) return visibleRecipes;
    return visibleRecipes.filter((recipeId) => {
      const recipe = getExplorerRecipe(recipeId);
      return recipeId.toLowerCase().includes(filter)
        || recipe.name.toLowerCase().includes(filter)
        || recipe.kernel.toLowerCase().includes(filter)
        || recipe.sceneProfile.toLowerCase().includes(filter);
    });
  }, [localDisabledSet, showHiddenSketches, sketchFilter]);
  const hiddenReviewSketchCount = hiddenReviewSketches.length;
  const automaticRecipeIds = useMemo(
    () => listRandomRecipeIds().filter((recipeId) => !isImageDependentRecipe(recipeId)),
    [],
  );
  const automaticDeck = useMemo(
    () => (visualSettings?.automaticSketchDeck ?? DEFAULT_AUTOMATIC_SKETCH_DECK).filter((recipeId) => !localDisabledSet.has(recipeId)),
    [localDisabledSet, visualSettings?.automaticSketchDeck],
  );
  const automaticDeckSet = useMemo(() => new Set(automaticDeck), [automaticDeck]);

  const setParam = (key: ParamKey, value: number) => {
    onChange({
      params: { ...(override?.params ?? {}), [key]: value },
      ...(override?.palette ? { palette: override.palette } : {}),
    });
  };

  const setStrokeMode = (enabled: boolean) => {
    setParam('strokeMode', enabled ? 1 : 0);
  };

  const setPalette = (key: PaletteKey, value: number) => {
    onChange({
      ...(override?.params ? { params: override.params } : {}),
      palette: { ...(override?.palette ?? {}), [key]: value },
    });
  };

  const applyMood = (moodId: string) => {
    const mood = SECTION_MOODS[moodId];
    onChange({
      ...(override?.recipeId ? { recipeId: override.recipeId } : {}),
      moodId,
      ...(mood.params ? { params: mood.params } : {}),
      ...(mood.palette ? { palette: mood.palette } : {}),
    });
  };

  const applyRecipe = (recipeId: string) => {
    onRecipeChange?.(recipeId);
  };

  const hideReviewSketch = (recipeId: string) => {
    setHiddenReviewSketches((current) => current.includes(recipeId) ? current : [...current, recipeId]);
    if (visualSettings && onVisualSettingsChange) {
      const nextDisabled = visualSettings.localDisabledSketches.includes(recipeId)
        ? visualSettings.localDisabledSketches
        : [...visualSettings.localDisabledSketches, recipeId];
      onVisualSettingsChange({
        ...visualSettings,
        localDisabledSketches: nextDisabled,
      });
      setPersistenceMessage('Autosaved locally');
    }
    if (reviewRecipeId === recipeId) onRecipeChange?.(undefined);
  };

  const restoreReviewSketch = (recipeId: string) => {
    setHiddenReviewSketches((current) => current.filter((hiddenId) => hiddenId !== recipeId));
    if (visualSettings && onVisualSettingsChange) {
      onVisualSettingsChange({
        ...visualSettings,
        localDisabledSketches: visualSettings.localDisabledSketches.filter((disabledId) => disabledId !== recipeId),
      });
      setPersistenceMessage('Autosaved locally');
    }
  };

  const setColorOnlyWhilePlaying = (enabled: boolean) => {
    if (!visualSettings || !onVisualSettingsChange) return;
    onVisualSettingsChange({ ...visualSettings, colorOnlyWhilePlaying: enabled });
    setPersistenceMessage('Autosaved locally');
  };

  const setAutomaticDeck = (deck: readonly ExplorerRecipeId[]) => {
    if (!visualSettings || !onVisualSettingsChange) return;
    const nextDeck = deck.filter((recipeId) => !localDisabledSet.has(recipeId));
    onVisualSettingsChange({ ...visualSettings, automaticSketchDeck: nextDeck.length ? nextDeck : [...DEFAULT_AUTOMATIC_SKETCH_DECK].filter((recipeId) => !localDisabledSet.has(recipeId)) });
    setPersistenceMessage('Autosaved locally');
  };

  const toggleAutomaticSketch = (recipeId: ExplorerRecipeId) => {
    const next = automaticDeckSet.has(recipeId)
      ? automaticDeck.filter((item) => item !== recipeId)
      : [...automaticDeck, recipeId];
    setAutomaticDeck(next.length ? next : DEFAULT_AUTOMATIC_SKETCH_DECK);
  };

  const exportSettings = () => {
    if (!visualSettings || typeof window === 'undefined') return;
    const bundle = createProductionsSettingsBundle(visualSettings);
    const blob = new Blob([`${JSON.stringify(bundle, null, 2)}\n`], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `productions-settings-${bundle.exportedAt.slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    setPersistenceMessage('Exported production bundle');
  };

  const importSettings = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || !onVisualSettingsChange) return;

    try {
      const text = await file.text();
      const bundle = parseProductionsSettingsBundle(JSON.parse(text));
      onVisualSettingsChange(bundle.settings);
      setPersistenceMessage(`Imported bundle v${bundle.version}`);
    } catch {
      setPersistenceMessage('Import failed: invalid settings JSON');
    }
  };

  const resetLocalSettings = () => {
    onResetVisualSettings?.();
    setHiddenReviewSketches(DEFAULT_PRODUCTIONS_VISUAL_SETTINGS.localDisabledSketches);
    setSavedAt(null);
    setPersistenceMessage('Reset to shipped defaults');
  };

  return (
    <div className="fixed bottom-4 left-4 z-30 hidden md:flex flex-col items-start gap-2">
      {open ? (
        <div className="max-h-[calc(100vh-2rem)] w-[min(34rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-white/40 bg-[rgba(7,10,18,0.98)] p-3 text-white shadow-[0_16px_60px_rgba(0,0,0,0.62)] backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-white/80">Production Lab</div>
              <div className="text-sm font-medium text-white">Section {Math.min(sectionIndex + 1, sectionCount)}/{sectionCount}</div>
              <div className="mt-0.5 max-w-80 truncate text-[11px] text-white/86">{albumName || 'Album'} · {trackTitle || 'Track'}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-white/72">Local autosave · lab only</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-white/28 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/88 transition hover:bg-white/10">
                Close
              </button>
              <button type="button" onClick={onClearAllOverrides} className="rounded-full border border-rose-200/32 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-rose-100/90 transition hover:bg-rose-200/10">
                Clear All
              </button>
            </div>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl border border-white/18 bg-white/[0.055] p-2 text-[10px]">
            <div>
              <div className="uppercase tracking-[0.18em] text-white/62">Recipe</div>
              <div className="mt-0.5 truncate text-white/82" title={currentRecipe?.id}>{currentRecipe?.name ?? step?.recipeId ?? 'none'}</div>
            </div>
            <div>
              <div className="uppercase tracking-[0.18em] text-white/62">Kernel</div>
              <div className="mt-0.5 truncate text-white/82">{currentRecipe?.kernel ?? recipe?.kernel ?? '—'}</div>
            </div>
            <div>
              <div className="uppercase tracking-[0.18em] text-white/62">Plan</div>
              <div className="mt-0.5 truncate text-white/82">{visualConfig?.debugLabel ?? planMode}</div>
            </div>
            <div>
              <div className="uppercase tracking-[0.18em] text-white/62">Assignment</div>
              <div className="mt-0.5 truncate text-white/82">
                {reviewRecipeId ? 'review override' : visualAssignmentMode === 'authored' ? 'authored' : 'production mosh'} · {visualRotationLabel ?? 'session'}
              </div>
            </div>
            <div>
              <div className="uppercase tracking-[0.18em] text-white/62">Mood</div>
              <div className="mt-0.5 truncate text-white/82" title={activeMoodId}>{activeMoodId.replace(/^sketch-/, '')}</div>
            </div>
            <div>
              <div className="uppercase tracking-[0.18em] text-white/62">Next</div>
              <div className="mt-0.5 truncate text-white/82">{nextRecipe?.name ?? '—'} · {nextMode}</div>
            </div>
            <div>
              <div className="uppercase tracking-[0.18em] text-white/62">Cue</div>
              <div className="mt-0.5 truncate text-white/82">{nextEvent ? `${nextEvent.type} ${formatCue(Math.max(0, nextEvent.t - currentTime))}` : lastEvent ? `last ${lastEvent.type}` : 'none'}</div>
            </div>
            <div>
              <div className="uppercase tracking-[0.18em] text-white/62">Beat Grid</div>
              <div className="mt-0.5 truncate text-white/82">
                {beatGrid ? `${beatGrid.bpm} BPM ${beatGrid.bpmSource} · ${beatGrid.beatStartAt.toFixed(2)}s ${beatGrid.beatStartSource}` : 'none'}
              </div>
            </div>
            <div>
              <div className="uppercase tracking-[0.18em] text-white/62">Bar</div>
              <div className="mt-0.5 truncate text-white/82">
                {beatPosition ? `${beatPosition.barNumber} · next ${formatCue(beatPosition.timeUntilNextBar)}` : 'none'}
              </div>
            </div>
            <div>
              <div className="uppercase tracking-[0.18em] text-white/62">Pool</div>
              <div className="mt-0.5 truncate text-white/82">{randomRecipePool?.length ?? 0} eligible · {localDisabledSet.size} disabled</div>
            </div>
            <div>
              <div className="uppercase tracking-[0.18em] text-white/62">FPS</div>
              <div className="mt-0.5 truncate font-mono text-white/82">
                {qualityTelemetry.fpsEstimate.toFixed(1)} · {qualityTelemetry.frameEma.toFixed(1)}ms
              </div>
            </div>
            <div>
              <div className="uppercase tracking-[0.18em] text-white/62">Quality</div>
              <div className="mt-0.5 truncate font-mono text-white/82">
                {qualityTelemetry.qualityScale.toFixed(2)} · target {qualityTelemetry.targetFrameMs.toFixed(1)}ms
              </div>
            </div>
            <div className="col-span-2">
              <div className="uppercase tracking-[0.18em] text-white/62">Published Note</div>
              <div className={`mt-0.5 whitespace-pre-wrap ${trackNote?.trim() ? 'text-white/82' : 'text-white/46'}`}>
                {trackNote?.trim() || 'No published note for this track'}
              </div>
            </div>
          </div>

          {visualSettings ? (
            <div className="mb-3 border-t border-white/10 pt-3">
              <div className="mb-3 rounded-xl border border-white/14 bg-white/[0.045] p-2">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.24em] text-white/70">Persistence</div>
                    <div className="mt-0.5 text-[11px] text-white/76">{persistenceMessage}</div>
                    <div className="mt-0.5 text-[10px] text-white/52">
                      {PRODUCTIONS_VISUAL_SETTINGS_STORAGE_KEY} · bundle v{PRODUCTIONS_SETTINGS_BUNDLE_VERSION} · shipped v{SHIPPED_PRODUCTIONS_VISUAL_SETTINGS_VERSION}
                    </div>
                    <div className="mt-1 max-w-[21rem] text-[10px] leading-snug text-white/58">
                      Production removals are applied directly in source from Brian&apos;s sketch IDs.
                    </div>
                  </div>
                  <div className="text-right text-[10px] uppercase tracking-[0.12em] text-white/62">
                    Last saved<br />
                    <span className="normal-case tracking-normal text-white/82">{formatSavedAt(savedAt)}</span>
                  </div>
                </div>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={importSettings}
                  className="hidden"
                />
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={exportSettings}
                    className="rounded-full border border-white/24 px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-white/82 transition hover:border-white/40 hover:bg-white/10"
                  >
                    Export JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                    className="rounded-full border border-white/24 px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-white/82 transition hover:border-white/40 hover:bg-white/10"
                  >
                    Import JSON
                  </button>
                  <button
                    type="button"
                    onClick={resetLocalSettings}
                    className="rounded-full border border-white/24 px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-white/82 transition hover:border-white/40 hover:bg-white/10"
                  >
                    Reset Local Prefs
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onVisualSettingsChange?.(DEFAULT_PRODUCTIONS_VISUAL_SETTINGS);
                      setPersistenceMessage('Autosaved shipped defaults');
                    }}
                    className="rounded-full border border-white/24 px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-white/82 transition hover:border-white/40 hover:bg-white/10"
                  >
                    Reset to Shipped
                  </button>
                </div>
              </div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-white/70">Runtime</div>
                  <div className="mt-0.5 text-[11px] text-white/66">Local visual settings</div>
                </div>
                <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-white/82">
                  <span>Color while playing</span>
                  <input
                    type="checkbox"
                    checked={visualSettings.colorOnlyWhilePlaying}
                    onChange={(event) => setColorOnlyWhilePlaying(event.currentTarget.checked)}
                    className="h-4 w-4 accent-white/80"
                  />
                </label>
              </div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/62">Automatic Sketch Deck</div>
                <button
                  type="button"
                  onClick={() => setAutomaticDeck(DEFAULT_AUTOMATIC_SKETCH_DECK)}
                  className="rounded-full border border-white/20 px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-white/72 transition hover:border-white/34 hover:text-white"
                >
                  Defaults
                </button>
              </div>
              <div className="grid max-h-32 grid-cols-2 gap-1 overflow-y-auto pr-1">
                {automaticRecipeIds.filter((recipeId) => showHiddenSketches || !localDisabledSet.has(recipeId)).map((recipeId) => {
                  const selected = automaticDeckSet.has(recipeId);
                  const disabled = localDisabledSet.has(recipeId);
                  return (
                    <button
                      key={recipeId}
                      type="button"
                      onClick={() => disabled ? undefined : toggleAutomaticSketch(recipeId)}
                      disabled={disabled}
                      className="truncate rounded-md border px-2 py-1.5 text-left text-[10px] font-medium text-white/90 transition hover:border-white/34 hover:bg-white/10"
                      style={{
                        borderColor: selected ? 'rgba(220,235,255,0.58)' : 'rgba(255,255,255,0.14)',
                        background: disabled ? 'rgba(255,120,120,0.08)' : selected ? 'rgba(180,210,255,0.16)' : 'rgba(255,255,255,0.045)',
                        opacity: disabled ? 0.45 : 1,
                      }}
                      title={recipeId}
                    >
                      {disabled ? '- ' : selected ? '+ ' : ''}{recipeId.replace(/^cong-/, '').replace(/^native-/, '')}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mb-3 border-t border-white/10 pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-[0.24em] text-white/70">Preview Sketch</div>
              <div className="text-[10px] text-white/68">{filteredReviewRecipes.length}/{REVIEW_RECIPE_IDS.length}</div>
            </div>
            <div className="mb-2 rounded-lg border border-sky-200/28 bg-sky-200/[0.12] px-2 py-1.5 text-[11px] text-white/92">
              Active sketch: <span className="font-semibold">{activeReviewRecipeId ?? 'none'}</span> · {nextMode}
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => activeReviewRecipeId ? hideReviewSketch(activeReviewRecipeId) : undefined}
                disabled={!activeReviewRecipeId}
                className="rounded-full border border-white/28 px-3 py-1 text-[10px] uppercase tracking-[0.1em] text-white/88 transition hover:border-white/44 hover:bg-white/10 disabled:opacity-35"
              >
                Hide Active
              </button>
              <button
                type="button"
                onClick={() => setShowHiddenSketches((value) => !value)}
                className="rounded-full border border-white/28 px-3 py-1 text-[10px] uppercase tracking-[0.1em] text-white/88 transition hover:border-white/44 hover:bg-white/10"
              >
                {showHiddenSketches ? 'Hide Hidden' : `Show Hidden ${hiddenReviewSketchCount}`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setHiddenReviewSketches([]);
                  if (visualSettings) onVisualSettingsChange?.({ ...visualSettings, localDisabledSketches: [] });
                  setPersistenceMessage('Autosaved locally');
                }}
                disabled={!hiddenReviewSketchCount}
                className="rounded-full border border-white/28 px-3 py-1 text-[10px] uppercase tracking-[0.1em] text-white/88 transition hover:border-white/44 hover:bg-white/10 disabled:opacity-35"
              >
                Restore Hidden
              </button>
              {visualSettings ? (
                <button
                  type="button"
                  onClick={() => {
                    setHiddenReviewSketches([]);
                    onVisualSettingsChange?.({ ...visualSettings, localDisabledSketches: [] });
                    setPersistenceMessage('Autosaved locally');
                  }}
                  disabled={!visualSettings.localDisabledSketches.length}
                  className="rounded-full border border-white/28 px-3 py-1 text-[10px] uppercase tracking-[0.1em] text-white/88 transition hover:border-white/44 hover:bg-white/10 disabled:opacity-35"
                >
                  Enable All
                </button>
              ) : null}
            </div>
            <input
              type="search"
              value={sketchFilter}
              onChange={(event) => setSketchFilter(event.currentTarget.value)}
              placeholder="Filter sketches"
              className="mb-2 w-full rounded-md border border-white/28 bg-white/[0.08] px-2 py-1.5 text-[12px] text-white/92 outline-none placeholder:text-white/56 focus:border-white/48"
            />
            <div className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto pr-1 lg:grid-cols-2">
              {filteredReviewRecipes.map((recipeId) => {
                const active = (reviewRecipeId ?? step?.recipeId) === recipeId;
                const hidden = hiddenReviewSketches.includes(recipeId);
                const recipeForButton = getExplorerRecipe(recipeId);
                return (
                  <div
                    key={recipeId}
                    className="grid grid-cols-[1fr_auto] overflow-hidden rounded-md border text-left text-[11px] font-medium text-white/94 transition"
                    style={{
                      borderColor: active ? 'rgba(220,235,255,0.62)' : 'rgba(255,255,255,0.16)',
                      background: hidden
                        ? 'rgba(255,180,180,0.08)'
                        : active ? 'rgba(180,210,255,0.18)' : 'rgba(255,255,255,0.06)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => applyRecipe(recipeId)}
                      className="min-w-0 px-2.5 py-2 text-left transition hover:bg-white/12 hover:text-white"
                      title={recipeId}
                    >
                      <span className="block truncate">{recipeId.replace(/^cong-/, '').replace(/^native-/, '')}</span>
                      <span className="block truncate text-[9px] font-normal uppercase tracking-[0.14em] text-white/64">
                        {hidden ? 'hidden' : recipeForButton.sceneProfile}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => hidden ? restoreReviewSketch(recipeId) : hideReviewSketch(recipeId)}
                      className="border-l border-white/14 px-2 text-[9px] uppercase tracking-[0.08em] text-white/76 transition hover:bg-white/12 hover:text-white"
                      title={hidden ? 'Restore sketch' : 'Hide from review'}
                    >
                      {hidden ? 'Add' : 'Hide'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mb-3 border-t border-white/10 pt-3">
            <div className="mb-2 text-[10px] uppercase tracking-[0.24em] text-white/70">Review Moods</div>
            <div className="grid max-h-36 grid-cols-2 gap-1 overflow-y-auto pr-1">
              {REVIEW_SECTION_MOOD_IDS.map((moodId) => {
                const active = step?.moodId === moodId;
                return (
                  <button
                    key={moodId}
                    type="button"
                    onClick={() => applyMood(moodId)}
                    className="truncate rounded-md border px-2 py-1 text-left text-[10px] font-medium text-white/90 transition hover:border-white/34 hover:bg-white/10 hover:text-white"
                    style={{
                      borderColor: active ? 'rgba(220,235,255,0.62)' : 'rgba(255,255,255,0.16)',
                      background: active ? 'rgba(180,210,255,0.18)' : 'rgba(255,255,255,0.06)',
                    }}
                    title={moodId}
                  >
                    {moodId.replace('sketch-', '')}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            {PARAM_SLIDERS.map((config) => (
              <SliderRow
                key={config.key}
                config={config}
                value={params[config.key] ?? config.fallback}
                onChange={(value) => setParam(config.key, value)}
              />
            ))}
            <label className="mt-3 flex items-center justify-between gap-3 border-t border-white/8 pt-3 text-[11px] text-white/82">
              <span className="uppercase tracking-[0.16em] text-white/72">Linework</span>
              <input
                type="checkbox"
                checked={(params.strokeMode ?? STROKE_MODE_FALLBACK) >= 0.5}
                onChange={(event) => setStrokeMode(event.currentTarget.checked)}
                className="h-4 w-4 accent-white/80"
              />
            </label>
          </div>

          <div className="mt-3 border-t border-white/8 pt-3">
            <div className="mb-2 text-[10px] uppercase tracking-[0.24em] text-white/58">Palette</div>
            <div className="space-y-2">
              {PALETTE_SLIDERS.map((config) => (
                <SliderRow
                  key={config.key}
                  config={config}
                  value={palette[config.key] ?? config.fallback}
                  onChange={(value) => setPalette(config.key, value)}
                />
              ))}
            </div>
          </div>

          <pre className="mt-3 max-h-44 overflow-auto rounded-xl border border-white/18 bg-black/54 p-2 text-[10px] leading-4 text-white/90">{snippet}</pre>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="mt-2 rounded-full border border-white/16 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-white/72 transition hover:border-white/28 hover:text-white"
          >
            Reset Current Section
          </button>
          {reviewRecipeId ? (
            <button
              type="button"
              onClick={() => onRecipeChange?.(undefined)}
              className="ml-2 mt-2 rounded-full border border-white/16 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-white/72 transition hover:border-white/28 hover:text-white"
            >
              Reset Review Sketch
            </button>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Toggle section mood lab"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/36 bg-[rgba(8,12,22,0.92)] text-[10px] uppercase tracking-[0.18em] text-white shadow-[0_8px_24px_rgba(0,0,0,0.42)] backdrop-blur-md transition hover:border-white/56 hover:bg-[rgba(18,24,38,0.96)]"
      >
        M
      </button>
    </div>
  );
}
