import type {
  ExplorerStoryboardEnergy,
  ExplorerStoryboardFocus,
  ExplorerStoryboardSectionRole,
  ExplorerStoryboardTemplate,
  ExplorerStoryboardVariance,
  SectionPaletteConfig,
  TrackVisualConfig,
  VisualStoryboard,
  VisualPlanEventConfig,
  VisualPlanConfigStep,
} from './runtime/types';

export interface Track {
  id: number;
  title: string;
  duration: number | null;
  src: string;
  notes?: string;
  isPublished?: boolean;
  sourceUrl?: string;
  audioStatus?: string;
  audioError?: string;
  audioFormat?: string;
  section_times?: number[];
  section_times_source?: 'detected' | 'manual' | 'fallback' | null;
  bpm?: number;
  beatStartAt?: number;
  starRating?: number;
  visualConfig?: TrackVisualConfig;
}

export interface Album {
  name: string;
  active: boolean;
  status: string;
  artist?: string;
  date?: string;
  artworkUrl?: string;
  blurb?: string;
  credits?: string;
  bandcampUrl?: string;
  appleMusicUrl?: string;
  base_color?: string | null;
  visualConfig?: TrackVisualConfig;
  tracks: Track[];
}

interface RawVisualPlanStep {
  recipe_id?: string | null;
  recipeId?: string | null;
  visualizer?: string | null;
  technique_id?: string | null;
  techniqueId?: string | null;
  transition_ms?: number | null;
  transitionMs?: number | null;
  mood_id?: string | null;
  moodId?: string | null;
  mood?: string | null;
  params?: Record<string, unknown> | null;
  palette?: Record<string, unknown> | null;
  events?: readonly RawVisualEvent[];
  visual_events?: readonly RawVisualEvent[];
  visualEvents?: readonly RawVisualEvent[];
  default_events?: boolean | null;
  defaultEvents?: boolean | null;
  internal_evolution?: boolean | null;
  internalEvolution?: boolean | null;
  single_sketch?: boolean | null;
  singleSketch?: boolean | null;
}

interface RawVisualEvent {
  preset?: string | null;
  type?: string | null;
  event?: string | null;
  section_index?: number | null;
  sectionIndex?: number | null;
  time?: number | null;
  t?: number | null;
  offset_seconds?: number | null;
  offsetSeconds?: number | null;
  offset?: number | null;
  intensity?: number | null;
  target?: string | null;
  duration_ms?: number | null;
  durationMs?: number | null;
  color?: readonly unknown[] | null;
  colour?: readonly unknown[] | null;
  palette?: Record<string, unknown> | null;
  release_mode?: string | null;
  releaseMode?: string | null;
}

interface RawVisualConfig {
  fallback_recipe_id?: string | null;
  fallbackRecipeId?: string | null;
  recipe_id?: string | null;
  recipeId?: string | null;
  visualizer?: string | null;
  technique_id?: string | null;
  techniqueId?: string | null;
  default_transition_ms?: number | null;
  defaultTransitionMs?: number | null;
  transition_ms?: number | null;
  transitionMs?: number | null;
  sequence?: readonly string[];
  visual_sequence?: readonly string[];
  visualSequence?: readonly string[];
  technique_sequence?: readonly string[];
  techniqueSequence?: readonly string[];
  steps?: readonly RawVisualPlanStep[];
  visual_steps?: readonly RawVisualPlanStep[];
  visualSteps?: readonly RawVisualPlanStep[];
  technique_steps?: readonly RawVisualPlanStep[];
  techniqueSteps?: readonly RawVisualPlanStep[];
  events?: readonly RawVisualEvent[];
  visual_events?: readonly RawVisualEvent[];
  visualEvents?: readonly RawVisualEvent[];
  default_events?: boolean | null;
  defaultEvents?: boolean | null;
  internal_evolution?: boolean | null;
  internalEvolution?: boolean | null;
  storyboard?: RawVisualStoryboard;
  visual_storyboard?: RawVisualStoryboard;
  visualStoryboard?: RawVisualStoryboard;
  debug_label?: string | null;
  debugLabel?: string | null;
  technique_label?: string | null;
  techniqueLabel?: string | null;
  single_sketch?: boolean | null;
  singleSketch?: boolean | null;
}

interface RawVisualStoryboardAnchors {
  intro?: string | null;
  peak?: string | null;
  outro?: string | null;
  fallback_recipe_id?: string | null;
  fallbackRecipeId?: string | null;
}

interface RawVisualStoryboard {
  template?: string | null;
  focus?: string | null;
  energy?: string | null;
  variance?: string | null;
  recipe_pool?: readonly string[];
  recipePool?: readonly string[];
  section_roles?: readonly string[];
  sectionRoles?: readonly string[];
  anchors?: RawVisualStoryboardAnchors | null;
  debug_label?: string | null;
  debugLabel?: string | null;
}

interface RawTrack {
  id?: number;
  title?: string | null;
  duration_seconds?: number | null;
  duration?: number | null;
  r2_url?: string | null;
  src?: string | null;
  source_url?: string | null;
  sourceUrl?: string | null;
  notes?: string | null;
  is_published?: boolean | null;
  isPublished?: boolean | null;
  audio_status?: string | null;
  audioStatus?: string | null;
  audio_error?: string | null;
  audioError?: string | null;
  audio_format?: string | null;
  audioFormat?: string | null;
  format?: string | null;
  section_times?: readonly number[];
  section_times_source?: 'detected' | 'manual' | 'fallback' | null;
  bpm?: number | null;
  beat_start_at?: number | null;
  beatStartAt?: number | null;
  star_rating?: number | null;
  starRating?: number | null;
  visual_config?: RawVisualConfig;
  visualConfig?: RawVisualConfig;
  visual_sequence?: readonly string[];
  visualSequence?: readonly string[];
  technique_sequence?: readonly string[];
  techniqueSequence?: readonly string[];
  visual_steps?: readonly RawVisualPlanStep[];
  visualSteps?: readonly RawVisualPlanStep[];
  technique_steps?: readonly RawVisualPlanStep[];
  techniqueSteps?: readonly RawVisualPlanStep[];
  storyboard?: RawVisualStoryboard;
  visual_storyboard?: RawVisualStoryboard;
  visualStoryboard?: RawVisualStoryboard;
  fallback_recipe_id?: string | null;
  fallbackRecipeId?: string | null;
  recipe_id?: string | null;
  recipeId?: string | null;
  visualizer?: string | null;
  debug_label?: string | null;
  debugLabel?: string | null;
}

interface RawAlbum {
  name?: string | null;
  active?: boolean | null;
  status?: string | null;
  artist_name?: string | null;
  artist?: string | null;
  release_date?: string | null;
  date?: string | null;
  artwork_url?: string | null;
  artworkUrl?: string | null;
  blurb?: string | null;
  description?: string | null;
  credits?: string | null;
  credit_text?: string | null;
  creditText?: string | null;
  bandcamp_url?: string | null;
  bandcampUrl?: string | null;
  apple_music_url?: string | null;
  appleMusicUrl?: string | null;
  base_color?: string | null;
  visual_config?: RawVisualConfig;
  visualConfig?: RawVisualConfig;
  visual_sequence?: readonly string[];
  visualSequence?: readonly string[];
  technique_sequence?: readonly string[];
  techniqueSequence?: readonly string[];
  visual_steps?: readonly RawVisualPlanStep[];
  visualSteps?: readonly RawVisualPlanStep[];
  technique_steps?: readonly RawVisualPlanStep[];
  techniqueSteps?: readonly RawVisualPlanStep[];
  storyboard?: RawVisualStoryboard;
  visual_storyboard?: RawVisualStoryboard;
  visualStoryboard?: RawVisualStoryboard;
  fallback_recipe_id?: string | null;
  fallbackRecipeId?: string | null;
  recipe_id?: string | null;
  recipeId?: string | null;
  visualizer?: string | null;
  debug_label?: string | null;
  debugLabel?: string | null;
  tracks?: readonly RawTrack[];
}

const pick = (...vals: unknown[]) => vals.find((value) => value !== undefined) ?? null;

function normalizeLookupKey(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function pickArray<T>(...vals: unknown[]): readonly T[] | undefined {
  return vals.find((value) => Array.isArray(value)) as readonly T[] | undefined;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && isFinite(value) ? value : undefined;
}

function audioFormatFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).pathname.split('.').pop()?.toLowerCase() || undefined;
  } catch {
    return url.split('?', 1)[0].split('.').pop()?.toLowerCase() || undefined;
  }
}

function normalizeTrackAudioStatus(track: RawTrack, title: string, albumName: string): { src: string; sourceUrl?: string; audioStatus?: string; audioError?: string; audioFormat?: string } {
  const rawSrc = (pick(track.r2_url, track.src) as string) || '';
  const sourceUrl = (pick(track.source_url, track.sourceUrl, track.r2_url, track.src) as string) || undefined;
  const explicitStatus = normalizeString(pick(track.audio_status, track.audioStatus));
  const explicitError = normalizeString(pick(track.audio_error, track.audioError));
  const audioFormat = normalizeString(pick(track.audio_format, track.audioFormat, track.format)) ?? audioFormatFromUrl(rawSrc);

  if (explicitStatus && explicitStatus !== 'ok') {
    return {
      src: '',
      ...(sourceUrl ? { sourceUrl } : {}),
      audioStatus: explicitStatus,
      audioError: explicitError ?? `"${title}" in "${albumName}" is unavailable`,
      ...(audioFormat ? { audioFormat } : {}),
    };
  }

  if (!rawSrc) {
    return {
      src: '',
      audioStatus: 'missing',
      audioError: `"${title}" in "${albumName}" has no public audio URL`,
      ...(audioFormat ? { audioFormat } : {}),
    };
  }

  if (audioFormat !== 'mp3') {
    return {
      src: '',
      ...(sourceUrl ? { sourceUrl } : {}),
      audioStatus: 'format',
      audioError: `"${title}" in "${albumName}" is ${audioFormat || 'unknown format'}, expected mp3`,
      ...(audioFormat ? { audioFormat } : {}),
    };
  }

  return {
    src: rawSrc,
    ...(sourceUrl ? { sourceUrl } : {}),
    audioStatus: explicitStatus ?? 'ok',
    ...(explicitError ? { audioError: explicitError } : {}),
    ...(audioFormat ? { audioFormat } : {}),
  };
}

function normalizeVisualParamOverrides(raw: unknown): VisualPlanConfigStep['params'] | undefined {
  if (!isRecord(raw)) return undefined;

  const rawStrokeMode = pick(raw.stroke_mode, raw.strokeMode);
  const strokeMode = normalizeNumber(rawStrokeMode) ?? (
    normalizeBoolean(rawStrokeMode) === undefined
      ? undefined
      : normalizeBoolean(rawStrokeMode) ? 1 : 0
  );
  const params = {
    ...(normalizeNumber(raw.turbulence) !== undefined ? { turbulence: normalizeNumber(raw.turbulence) } : {}),
    ...(normalizeNumber(raw.density) !== undefined ? { density: normalizeNumber(raw.density) } : {}),
    ...(normalizeNumber(raw.glow) !== undefined ? { glow: normalizeNumber(raw.glow) } : {}),
    ...(normalizeNumber(raw.drift) !== undefined ? { drift: normalizeNumber(raw.drift) } : {}),
    ...(normalizeNumber(pick(raw.hue_shift, raw.hueShift)) !== undefined ? { hueShift: normalizeNumber(pick(raw.hue_shift, raw.hueShift)) } : {}),
    ...(normalizeNumber(raw.shimmer) !== undefined ? { shimmer: normalizeNumber(raw.shimmer) } : {}),
    ...(normalizeNumber(raw.impulse) !== undefined ? { impulse: normalizeNumber(raw.impulse) } : {}),
    ...(strokeMode !== undefined ? { strokeMode } : {}),
  };

  return Object.keys(params).length > 0 ? params : undefined;
}

function normalizePaletteConfig(raw: unknown): SectionPaletteConfig | undefined {
  if (!isRecord(raw)) return undefined;

  const palette = {
    ...(normalizeNumber(pick(raw.hue_shift, raw.hueShift)) !== undefined ? { hueShift: normalizeNumber(pick(raw.hue_shift, raw.hueShift)) } : {}),
    ...(normalizeNumber(raw.saturation) !== undefined ? { saturation: normalizeNumber(raw.saturation) } : {}),
    ...(normalizeNumber(raw.brightness) !== undefined ? { brightness: normalizeNumber(raw.brightness) } : {}),
    ...(normalizeNumber(raw.contrast) !== undefined ? { contrast: normalizeNumber(raw.contrast) } : {}),
  };

  return Object.keys(palette).length > 0 ? palette : undefined;
}

function normalizeColorTuple(raw: unknown): [number, number, number] | undefined {
  if (!Array.isArray(raw) || raw.length < 3) return undefined;
  const values = raw.slice(0, 3).map((value) => normalizeNumber(value));
  if (values.some((value) => value === undefined)) return undefined;
  return values.map((value) => Math.max(0, Math.min(255, Math.round(value ?? 0)))) as [number, number, number];
}

function normalizeBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function normalizeSequence(values: readonly unknown[] | undefined): string[] | undefined {
  if (!values?.length) return undefined;

  const sequence = values
    .map((value) => normalizeString(value))
    .filter((value): value is string => !!value);

  return sequence.length > 0 ? sequence : undefined;
}

function parseVisualStep(raw: unknown): VisualPlanConfigStep | undefined {
  if (!isRecord(raw)) return undefined;

  const recipeId = normalizeString(
    pick(raw.recipe_id, raw.recipeId, raw.visualizer, raw.technique_id, raw.techniqueId),
  );

  if (!recipeId) return undefined;

  const transitionMs = normalizeNumber(pick(raw.transition_ms, raw.transitionMs));
  const moodId = normalizeString(pick(raw.mood_id, raw.moodId, raw.mood));
  const params = normalizeVisualParamOverrides(raw.params);
  const palette = normalizePaletteConfig(raw.palette);
  const events = parseVisualEvents(pickArray(raw.events, raw.visual_events, raw.visualEvents));

  return {
    recipeId,
    ...(transitionMs !== undefined ? { transitionMs } : {}),
    ...(moodId ? { moodId } : {}),
    ...(params ? { params } : {}),
    ...(palette ? { palette } : {}),
    ...(events?.length ? { events } : {}),
  };
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const normalized = normalizeString(value) as T | undefined;
  return normalized && allowed.includes(normalized) ? normalized : undefined;
}

const VISUAL_EVENT_PRESETS = {
  'storm-drop': { type: 'storm-release', durationMs: 3600, releaseMode: 'one-by-one', intensity: 0.8 },
  'warm-build': { type: 'density-surge', durationMs: 1300, intensity: 0.85, color: [255, 180, 90] },
  'hard-cut-flash': { type: 'bloom-flash', durationMs: 500, intensity: 1, color: [255, 245, 210] },
  'colour-turn': { type: 'color-morph', target: 'foreground', durationMs: 6200, releaseMode: 'one-by-one', intensity: 0.58, color: [255, 72, 38] },
  afterglow: { type: 'palette-morph', target: 'background', durationMs: 12000, intensity: 0.44, color: [80, 180, 255] },
  'focus-turn': { type: 'focus-shift', target: 'center', durationMs: 3200, intensity: 0.48, palette: { hueShift: 14, brightness: 1.06 } },
  'veil-sweep': { type: 'veil-sweep', durationMs: 3000, intensity: 0.46, color: [190, 220, 255] },
  'motion-lift': { type: 'motion-drift', durationMs: 3200, intensity: 0.5, palette: { hueShift: -16, saturation: 1.08 } },
  'grain-bloom': { type: 'grain-bloom', durationMs: 1700, intensity: 0.44, color: [255, 234, 190] },
  'particle-thin': { type: 'grain-bloom', target: 'particles', durationMs: 5200, intensity: 0.26, palette: { saturation: 0.88, brightness: 0.96 } },
  'particle-bloom': { type: 'glow-pulse', target: 'particles', durationMs: 3200, intensity: 0.62, palette: { brightness: 1.14, contrast: 1.06 } },
  'particle-swarm': { type: 'density-surge', target: 'particles', durationMs: 4600, intensity: 0.78, palette: { saturation: 1.12, brightness: 1.06 } },
} as const;

function parseVisualEvent(raw: unknown): VisualPlanEventConfig | undefined {
  if (!isRecord(raw)) return undefined;

  const presetKey = normalizeString(raw.preset);
  const preset = presetKey ? VISUAL_EVENT_PRESETS[presetKey as keyof typeof VISUAL_EVENT_PRESETS] : undefined;
  const presetRecord = preset as Record<string, unknown> | undefined;
  const type = normalizeEnum(pick(raw.type, raw.event, presetRecord?.type), [
    'section-cue',
    'bar-cue',
    'storm-release',
    'color-morph',
    'palette-morph',
    'density-surge',
    'glow-pulse',
    'spark-burst',
    'bloom-flash',
    'focus-shift',
    'veil-sweep',
    'motion-drift',
    'grain-bloom',
  ] as const);
  if (!type) return undefined;

  const target = normalizeEnum(pick(raw.target, presetRecord?.target), ['particles', 'center', 'all', 'background', 'ridges', 'foreground', 'mist', 'terrain'] as const);
  const releaseMode = normalizeEnum(pick(raw.release_mode, raw.releaseMode, presetRecord?.releaseMode), ['all-at-once', 'one-by-one'] as const);
  const sectionIndex = normalizeNumber(pick(raw.section_index, raw.sectionIndex));
  const time = normalizeNumber(pick(raw.time, raw.t));
  const offsetSeconds = normalizeNumber(pick(raw.offset_seconds, raw.offsetSeconds, raw.offset));
  const intensity = normalizeNumber(pick(raw.intensity, presetRecord?.intensity));
  const durationMs = normalizeNumber(pick(raw.duration_ms, raw.durationMs, presetRecord?.durationMs));
  const color = normalizeColorTuple(pick(raw.color, raw.colour, presetRecord?.color));
  const palette = normalizePaletteConfig(pick(raw.palette, presetRecord?.palette));

  return {
    type,
    ...(sectionIndex !== undefined ? { sectionIndex } : {}),
    ...(time !== undefined ? { time } : {}),
    ...(offsetSeconds !== undefined ? { offsetSeconds } : {}),
    ...(intensity !== undefined ? { intensity } : {}),
    ...(target ? { target } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(color ? { color } : {}),
    ...(palette ? { palette } : {}),
    ...(releaseMode ? { releaseMode } : {}),
  };
}

function parseVisualEvents(raw: readonly unknown[] | undefined): VisualPlanEventConfig[] | undefined {
  const events = raw
    ?.map((event) => parseVisualEvent(event))
    .filter((event): event is VisualPlanEventConfig => !!event);

  return events?.length ? events : undefined;
}

function parseVisualStoryboard(raw: unknown): VisualStoryboard | undefined {
  if (!isRecord(raw)) return undefined;

  const nested = pick(raw.storyboard, raw.visual_storyboard, raw.visualStoryboard);
  const source = isRecord(nested) ? nested : raw;

  const template = normalizeEnum<ExplorerStoryboardTemplate>(source.template, ['ambient-arc', 'lift-arc', 'pulse-arc', 'journey', 'cloud-again', 'mosh-arc', 'generative-variety']);
  const focus = normalizeEnum<ExplorerStoryboardFocus>(source.focus, ['ink', 'smoke', 'tide', 'cloud', 'rain', 'flow', 'spiral', 'contour', 'planet', 'particle', 'galaxy', 'storm', 'mist', 'texture', 'line', 'grid', 'geology', 'sparse', 'mixed']);
  const energy = normalizeEnum<ExplorerStoryboardEnergy>(source.energy, ['low', 'medium', 'high']);
  const variance = normalizeEnum<ExplorerStoryboardVariance>(source.variance, ['low', 'medium', 'high']);
  const recipePool = normalizeSequence(pickArray(source.recipe_pool, source.recipePool));
  const sectionRoles = normalizeSequence(pickArray(source.section_roles, source.sectionRoles))
    ?.filter((role): role is ExplorerStoryboardSectionRole => (
      ['intro', 'establish', 'drift', 'build', 'lift', 'peak', 'release', 'afterglow'] as const
    ).includes(role as ExplorerStoryboardSectionRole));

  const rawAnchors = isRecord(source.anchors) ? source.anchors : null;
  const anchors = rawAnchors
    ? {
        ...(normalizeString(rawAnchors.intro) ? { intro: normalizeString(rawAnchors.intro) } : {}),
        ...(normalizeString(rawAnchors.peak) ? { peak: normalizeString(rawAnchors.peak) } : {}),
        ...(normalizeString(rawAnchors.outro) ? { outro: normalizeString(rawAnchors.outro) } : {}),
        ...(normalizeString(pick(rawAnchors.fallback_recipe_id, rawAnchors.fallbackRecipeId))
          ? { fallbackRecipeId: normalizeString(pick(rawAnchors.fallback_recipe_id, rawAnchors.fallbackRecipeId)) }
          : {}),
      }
    : undefined;

  const debugLabel = normalizeString(pick(source.debug_label, source.debugLabel));

  if (!template && !focus && !energy && !variance && !recipePool?.length && !sectionRoles?.length && !anchors && !debugLabel) {
    return undefined;
  }

  return {
    ...(template ? { template } : {}),
    ...(focus ? { focus } : {}),
    ...(energy ? { energy } : {}),
    ...(variance ? { variance } : {}),
    ...(recipePool?.length ? { recipePool } : {}),
    ...(sectionRoles?.length ? { sectionRoles } : {}),
    ...(anchors && Object.keys(anchors).length > 0 ? { anchors } : {}),
    ...(debugLabel ? { debugLabel } : {}),
  };
}

function parseVisualConfig(raw: unknown): TrackVisualConfig | undefined {
  if (!isRecord(raw)) return undefined;

  const nested = pick(raw.visual_config, raw.visualConfig);
  const source = isRecord(nested) ? nested : raw;

  const fallbackRecipeId = normalizeString(
    pick(
      source.fallback_recipe_id,
      source.fallbackRecipeId,
      source.recipe_id,
      source.recipeId,
      source.visualizer,
      source.technique_id,
      source.techniqueId,
    ),
  );

  const defaultTransitionMs = normalizeNumber(
    pick(
      source.default_transition_ms,
      source.defaultTransitionMs,
      source.transition_ms,
      source.transitionMs,
    ),
  );

  const sequence = normalizeSequence(
    pickArray(
      source.sequence,
      source.visual_sequence,
      source.visualSequence,
      source.technique_sequence,
      source.techniqueSequence,
    ),
  );

  const steps = pickArray(
    source.steps,
    source.visual_steps,
    source.visualSteps,
    source.technique_steps,
    source.techniqueSteps,
  )
    ?.map((step) => parseVisualStep(step))
    .filter((step): step is VisualPlanConfigStep => !!step);
  const events = parseVisualEvents(pickArray(source.events, source.visual_events, source.visualEvents));
  const defaultEvents = normalizeBoolean(pick(source.default_events, source.defaultEvents));
  const internalEvolution = normalizeBoolean(pick(source.internal_evolution, source.internalEvolution));
  const singleSketch = normalizeBoolean(pick(source.single_sketch, source.singleSketch));

  const storyboard = parseVisualStoryboard(source);

  const debugLabel = normalizeString(
    pick(source.debug_label, source.debugLabel, source.technique_label, source.techniqueLabel, storyboard?.debugLabel),
  );

  if (!fallbackRecipeId && defaultTransitionMs === undefined && !sequence?.length && !steps?.length && !events?.length && defaultEvents === undefined && internalEvolution === undefined && singleSketch === undefined && !storyboard && !debugLabel) {
    return undefined;
  }

  return {
    ...(fallbackRecipeId ? { fallbackRecipeId } : {}),
    ...(defaultTransitionMs !== undefined ? { defaultTransitionMs } : {}),
    ...(sequence?.length ? { sequence } : {}),
    ...(steps?.length ? { steps } : {}),
    ...(events?.length ? { events } : {}),
    ...(defaultEvents !== undefined ? { defaultEvents } : {}),
    ...(internalEvolution !== undefined ? { internalEvolution } : {}),
    ...(singleSketch !== undefined ? { singleSketch } : {}),
    ...(storyboard ? { storyboard } : {}),
    ...(debugLabel ? { debugLabel } : {}),
  };
}

export function transformAlbums(raw: readonly unknown[]): Album[] {
  return raw
    .map((albumRaw) => {
      const album = (albumRaw ?? {}) as RawAlbum;
      const sourceTracks = Array.isArray(album.tracks) ? album.tracks : [];
      const name = (album.name || '').trim();

      const tracks: Track[] = sourceTracks.map((trackRaw) => {
        const track = (trackRaw ?? {}) as RawTrack;
        const visualConfig = parseVisualConfig(track);
        const title = (track.title || 'Untitled').trim();
        const audioStatus = normalizeTrackAudioStatus(track, title, name);

        return {
        id: track.id ?? 0,
        title,
        duration: (pick(track.duration_seconds, track.duration) as number) || null,
        ...(normalizeString(track.notes) ? { notes: normalizeString(track.notes) } : {}),
        ...(normalizeBoolean(pick(track.is_published, track.isPublished)) !== undefined ? { isPublished: normalizeBoolean(pick(track.is_published, track.isPublished)) } : {}),
        ...audioStatus,
        ...(track.section_times ? { section_times: [...track.section_times] } : {}),
        ...(track.section_times_source !== undefined ? { section_times_source: track.section_times_source } : {}),
        ...(normalizeNumber(track.bpm) !== undefined ? { bpm: normalizeNumber(track.bpm) } : {}),
        ...(normalizeNumber(pick(track.beat_start_at, track.beatStartAt)) !== undefined ? { beatStartAt: normalizeNumber(pick(track.beat_start_at, track.beatStartAt)) } : {}),
        ...(normalizeNumber(pick(track.star_rating, track.starRating)) !== undefined ? { starRating: normalizeNumber(pick(track.star_rating, track.starRating)) } : {}),
        ...(visualConfig ? { visualConfig } : {}),
        };
      });

      const rawArtwork = pick(album.artwork_url, album.artworkUrl) as string | null;
      const artworkUrl = rawArtwork && !rawArtwork.endsWith('.heic') ? rawArtwork : undefined;
      const visualConfig = parseVisualConfig(album);
      const status = album.status || 'WEBSITE';
      const hasPlayableTrack = tracks.some((track) => !!track.src);
      const explicitActive = normalizeBoolean(album.active);
      const active = status === 'WEBSITE' && hasPlayableTrack
        ? true
        : explicitActive ?? false;

      return {
        name,
        active,
        artist: (pick(album.artist_name, album.artist) as string) || undefined,
        date: (pick(album.release_date, album.date) as string) || undefined,
        status,
        artworkUrl,
        blurb: (pick(album.blurb, album.description) as string) || undefined,
        credits: (pick(album.credits, album.credit_text, album.creditText) as string) || undefined,
        bandcampUrl: (pick(album.bandcamp_url, album.bandcampUrl) as string) || undefined,
        appleMusicUrl: (pick(album.apple_music_url, album.appleMusicUrl) as string) || undefined,
        base_color: album.base_color ?? null,
        ...(visualConfig ? { visualConfig } : {}),
        tracks,
      };
    })
    .filter((album) => album.name.length > 0);
}

export function mergeAlbumVisualConfigs(referenceAlbums: readonly Album[], incomingAlbums: readonly Album[]): Album[] {
  const referenceAlbumMap = new Map(referenceAlbums.map((album) => [normalizeLookupKey(album.name), album]));

  return incomingAlbums.map((album) => {
    const referenceAlbum = referenceAlbumMap.get(normalizeLookupKey(album.name));
    const referenceTrackMap = new Map(
      (referenceAlbum?.tracks ?? []).map((track) => [normalizeLookupKey(track.title), track]),
    );

    return {
      ...album,
      base_color: album.base_color ?? referenceAlbum?.base_color ?? null,
      credits: album.credits ?? referenceAlbum?.credits,
      visualConfig: album.visualConfig ?? referenceAlbum?.visualConfig,
      tracks: album.tracks.map((track) => {
        const referenceTrack = referenceTrackMap.get(normalizeLookupKey(track.title));
        const referenceVisualConfig = referenceTrack?.visualConfig;
        const preserveReferenceReviewTrack =
          !!referenceVisualConfig?.events?.length ||
          referenceVisualConfig?.debugLabel?.toLowerCase().includes('sketch lab') ||
          referenceVisualConfig?.debugLabel?.toLowerCase().includes('section-event');

        return {
          ...track,
          ...(preserveReferenceReviewTrack && referenceTrack?.section_times?.length
            ? { section_times: [...referenceTrack.section_times] }
            : {}),
          visualConfig: preserveReferenceReviewTrack
            ? referenceVisualConfig
            : track.visualConfig ?? referenceVisualConfig,
        };
      }),
    };
  });
}
