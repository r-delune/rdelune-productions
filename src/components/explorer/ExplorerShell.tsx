'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { SectionMoodOverride } from './SectionMoodLab';
import ShowcasePlayer from './ShowcasePlayer';
import ExplorerNav from './ExplorerNav';
import { trackPlay } from '@/lib/analytics';
import { mergeAlbumVisualConfigs, transformAlbums, type Album } from './showcase-data';
import { createAudioSignal } from './audio-signal';
import { EXPLORER_ALBUM_BROWSER_WIDTH_STYLE } from './runtime/layout';
import {
  getPreferredAlbumIndex,
  getRandomPlayableTrackIndex,
  getRandomPlayableSelection,
  getValidTrackIndex,
  isPlayableAlbum,
  type PlayableSelection,
} from './production-utils';
import {
  DEFAULT_PRODUCTIONS_VISUAL_SETTINGS,
  DEFAULT_AUTOMATIC_SKETCH_DECK,
  normalizeProductionsVisualSettings,
  pickAutomaticSketch,
  readProductionsVisualSettings,
  resetLocalProductionsVisualSettings,
  writeProductionsVisualSettings,
  type ProductionsVisualSettings,
} from './production-settings';
import { recipeIsDisabled, useProductionVisualPlan } from './useProductionVisualPlan';

interface Props {
  initialAlbums?: Album[];
}

const PLAYER_STATE_STORAGE_KEY = 'productions-player-state-v1';
const RANDOM_MODE_STORAGE_KEY = 'productions-random-mode-v1';
const RANDOM_HISTORY_STORAGE_KEY = 'productions-random-track-history-v1';
const RANDOM_HISTORY_LIMIT = 10;
const MOOD_LAB_STORAGE_KEY = 'productions-section-mood-lab-v1';
const SectionMoodLab = dynamic(() => import('./SectionMoodLab'), { ssr: false });
const CurationHUD = dynamic(() => import('./CurationHUD'), { ssr: false });
const ExplorerCanvas = dynamic(() => import('./ExplorerCanvas'), {
  ssr: false,
  loading: () => <ExplorerCanvasFallback />,
});

function ExplorerCanvasFallback() {
  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none"
      aria-hidden="true"
      style={{
        background: 'radial-gradient(circle at 24% 18%, rgba(118, 142, 180, 0.22) 0%, rgba(118, 142, 180, 0) 38%), radial-gradient(circle at 74% 78%, rgba(216, 172, 112, 0.14) 0%, rgba(216, 172, 112, 0) 44%), linear-gradient(180deg, rgb(9, 11, 15) 0%, rgb(15, 18, 24) 52%, rgb(4, 5, 8) 100%)',
        filter: 'grayscale(1) saturate(0)',
      }}
    />
  );
}

function readSavedPlayerState() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(PLAYER_STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { albumName?: string; trackIndex?: number };
    return parsed && typeof parsed.albumName === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function readSavedRandomMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(RANDOM_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function readRandomTrackHistory(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RANDOM_HISTORY_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((id): id is number => Number.isInteger(id)).slice(-RANDOM_HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}

function chooseRandomPlaybackSelection(albums: readonly Album[], highStarPriority = false): PlayableSelection {
  const selection = getRandomPlayableSelection(albums, readRandomTrackHistory(), Math.random, highStarPriority);
  const selectedTrackId = albums[selection.albumIndex]?.tracks[selection.trackIndex]?.id;

  if (typeof window !== 'undefined' && typeof selectedTrackId === 'number') {
    try {
      const history = [...readRandomTrackHistory(), selectedTrackId].slice(-RANDOM_HISTORY_LIMIT);
      window.localStorage.setItem(RANDOM_HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch {
      // Ignore local selection history persistence failures.
    }
  }

  return selection;
}

function resolveInitialPlayerSelection(albums: readonly Album[], savedState = readSavedPlayerState()): { albumIndex: number; trackIndex: number; restored: boolean } {
  const savedAlbumIndex = savedState?.albumName
    ? albums.findIndex((album) => album.name === savedState.albumName && isPlayableAlbum(album))
    : -1;
  const randomSelection = savedAlbumIndex < 0 ? chooseRandomPlaybackSelection(albums) : null;
  const resolvedAlbumIndex = savedAlbumIndex >= 0 ? savedAlbumIndex : randomSelection?.albumIndex ?? getPreferredAlbumIndex(albums);
  const resolvedTrackIndex = savedAlbumIndex >= 0
    ? getValidTrackIndex(albums[resolvedAlbumIndex], savedState?.trackIndex)
    : randomSelection?.trackIndex ?? getRandomPlayableTrackIndex(albums[resolvedAlbumIndex]);

  return {
    albumIndex: resolvedAlbumIndex,
    trackIndex: resolvedTrackIndex,
    restored: savedAlbumIndex >= 0,
  };
}

function readSavedMoodLabOverrides(): Record<string, SectionMoodOverride> {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(MOOD_LAB_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, SectionMoodOverride> : {};
  } catch {
    return {};
  }
}

function debugLabEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (process.env.NODE_ENV === 'production') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('debug') === '1' || params.get('lab') === '1';
}

function getDailyRotationSeed(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function scheduleIdleWork(callback: () => void, timeout = 1200): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let idleId: number | null = null;
  let cancelled = false;

  const run = () => {
    if (!cancelled) callback();
  };

  if ('requestIdleCallback' in window) {
    idleId = window.requestIdleCallback(run, { timeout });
  } else {
    timeoutId = setTimeout(run, Math.min(timeout, 600));
  }

  return () => {
    cancelled = true;
    if (idleId != null && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleId);
    if (timeoutId != null) clearTimeout(timeoutId);
  };
}

function getAlbumsSignature(albums: readonly Album[]): string {
  return JSON.stringify(albums);
}

export default function ExplorerShell({ initialAlbums }: Props) {
  const showDevSketchChip = process.env.NODE_ENV !== 'production';
  const seedAlbums = Array.isArray(initialAlbums) ? initialAlbums : [];
  const [albums, setAlbums] = useState<Album[]>(seedAlbums);
  const [albumIndex, setAlbumIndex] = useState(() => getPreferredAlbumIndex(seedAlbums));
  const [trackIndex, setTrackIndex] = useState(0);
  // Refs for analytics access inside memoized callbacks
  const albumsRef = useRef(albums);
  const albumIndexRef = useRef(albumIndex);
  const trackIndexRef = useRef(trackIndex);
  const [loading, setLoading] = useState(seedAlbums.length === 0);
  const [error, setError] = useState(false);
  const [visualPlaybackActive, setVisualPlaybackActive] = useState(false);
  const [trackProgress, setTrackProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playerCollapsed, setPlayerCollapsed] = useState(true);
  const [randomPlaybackRequest, setRandomPlaybackRequest] = useState<{ id: number; albumIndex: number; trackIndex: number } | null>(null);
  const [randomMode, setRandomMode] = useState(false);
  const [showMoodLab, setShowMoodLab] = useState(false);
  const [showCurationHUD, setShowCurationHUD] = useState(process.env.NODE_ENV !== 'production');
  const [sectionMoodOverrides, setSectionMoodOverrides] = useState<Record<string, SectionMoodOverride>>({});
  const [visualSettings, setVisualSettings] = useState<ProductionsVisualSettings>(DEFAULT_PRODUCTIONS_VISUAL_SETTINGS);
  const [automaticRecipeId, setAutomaticRecipeId] = useState(() => pickAutomaticSketch(DEFAULT_AUTOMATIC_SKETCH_DECK));
  const [initialSelectionReady, setInitialSelectionReady] = useState(seedAlbums.length === 0);
  const audioSignalRef = useRef(createAudioSignal());
  const hasInitializedAlbumRef = useRef(false);
  const skipNextVisualSettingsWriteRef = useRef(false);

  useEffect(() => { albumsRef.current = albums; }, [albums]);
  useEffect(() => { albumIndexRef.current = albumIndex; }, [albumIndex]);
  useEffect(() => { trackIndexRef.current = trackIndex; }, [trackIndex]);

  useEffect(() => {
    const enabled = debugLabEnabled();
    const savedVisualSettings = readProductionsVisualSettings();
    setShowMoodLab(enabled);
    setRandomMode(readSavedRandomMode());
    setVisualSettings(savedVisualSettings);
    setAutomaticRecipeId(pickAutomaticSketch(savedVisualSettings.automaticSketchDeck));

    if (enabled) {
      setSectionMoodOverrides(readSavedMoodLabOverrides());
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(RANDOM_MODE_STORAGE_KEY, randomMode ? '1' : '0');
    } catch {
      // Ignore local preference persistence failures.
    }
  }, [randomMode]);

  useEffect(() => {
    if (skipNextVisualSettingsWriteRef.current) {
      skipNextVisualSettingsWriteRef.current = false;
      return;
    }

    writeProductionsVisualSettings(visualSettings);
  }, [visualSettings]);

  useEffect(() => {
    if (!showMoodLab) return;

    try {
      window.localStorage.setItem(MOOD_LAB_STORAGE_KEY, JSON.stringify(sectionMoodOverrides));
    } catch {
      // Ignore local review persistence failures.
    }
  }, [sectionMoodOverrides, showMoodLab]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'D' && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setShowCurationHUD((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (hasInitializedAlbumRef.current) return;
    if (!albums.length) return;

    hasInitializedAlbumRef.current = true;

    const { albumIndex: resolvedAlbumIndex, trackIndex: resolvedTrackIndex } = resolveInitialPlayerSelection(albums);

    setAlbumIndex(resolvedAlbumIndex);
    setTrackIndex(resolvedTrackIndex);
    setCurrentTime(0);
    requestAnimationFrame(() => setInitialSelectionReady(true));
  }, [albums]);

  useEffect(() => {
    if (!loading && !albums.length) setInitialSelectionReady(true);
  }, [albums.length, loading]);

  useEffect(() => {
    if (!albums.length) return;
    const album = albums[albumIndex];
    if (!album) return;

    try {
      if (!isPlayableAlbum(album)) {
        window.localStorage.removeItem(PLAYER_STATE_STORAGE_KEY);
        return;
      }

      window.localStorage.setItem(PLAYER_STATE_STORAGE_KEY, JSON.stringify({
        albumName: album.name,
        trackIndex,
      }));
    } catch {
      // Ignore persistence failures.
    }
  }, [albumIndex, albums, trackIndex]);

  useEffect(() => {
    let cancelled = false;
    const cancelIdle = scheduleIdleWork(() => {
      fetch('/data/showcase.json', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        const list = data?.albums;
        if (!Array.isArray(list)) throw new Error('Invalid showcase data');
        const nextAlbums = mergeAlbumVisualConfigs(albumsRef.current, transformAlbums(list));
        if (!nextAlbums.length) throw new Error('Empty showcase data');
        if (cancelled) return;
        if (getAlbumsSignature(nextAlbums) === getAlbumsSignature(albumsRef.current)) {
          setError(false);
          setLoading(false);
          return;
        }

        const savedState = readSavedPlayerState();
        const savedAlbumIndex = savedState?.albumName
          ? nextAlbums.findIndex((album) => album.name === savedState.albumName && isPlayableAlbum(album))
          : -1;
        const savedAlbumStillCurrent = savedAlbumIndex >= 0 && savedState?.albumName === albumsRef.current[albumIndexRef.current]?.name;
        const effectiveSavedAlbumIndex = savedAlbumStillCurrent ? savedAlbumIndex : -1;
        const currentAlbumName = savedAlbumStillCurrent ? savedState?.albumName : albumsRef.current[albumIndexRef.current]?.name;
        const currentTrackTitle = albumsRef.current[albumIndexRef.current]?.tracks[trackIndexRef.current]?.title;
        const preservedAlbumIndex = effectiveSavedAlbumIndex >= 0
          ? effectiveSavedAlbumIndex
          : currentAlbumName
            ? nextAlbums.findIndex((album) => album.name === currentAlbumName && isPlayableAlbum(album))
            : -1;
        const randomFallbackSelection = effectiveSavedAlbumIndex < 0 && preservedAlbumIndex < 0
          ? chooseRandomPlaybackSelection(nextAlbums)
          : null;
        const resolvedAlbumIndex = effectiveSavedAlbumIndex >= 0
          ? effectiveSavedAlbumIndex
          : preservedAlbumIndex >= 0
            ? preservedAlbumIndex
            : randomFallbackSelection?.albumIndex ?? getPreferredAlbumIndex(nextAlbums);
        const nextTrackIndex = savedAlbumStillCurrent
          ? getValidTrackIndex(nextAlbums[resolvedAlbumIndex], savedState?.trackIndex)
          : currentTrackTitle
          ? nextAlbums[resolvedAlbumIndex]?.tracks.findIndex((item) => item.title === currentTrackTitle) ?? 0
          : randomFallbackSelection?.albumIndex === resolvedAlbumIndex
            ? randomFallbackSelection.trackIndex
            : getRandomPlayableTrackIndex(nextAlbums[resolvedAlbumIndex]);
        setAlbums(nextAlbums);
        setAlbumIndex(resolvedAlbumIndex);
        setTrackIndex(nextTrackIndex >= 0 ? nextTrackIndex : 0);
        setError(false);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(seedAlbums.length === 0);
        setLoading(false);
      });
    });

    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [seedAlbums.length]);

  const onAlbumChange = useCallback((i: number, nextTrackIndex = 0) => {
    setAlbumIndex(i);
    setTrackIndex(nextTrackIndex);
    setCurrentTime(0);
  }, []);

  const onPlayingChange = useCallback((playing: boolean) => {
    if (playing) {
      const a = albumsRef.current[albumIndexRef.current];
      const t = a?.tracks[trackIndexRef.current];
      if (a && t) trackPlay(t.id, t.title, a.name, t.duration);
    }
  }, []);

  const onProgressChange = useCallback((progress: number) => {
    setTrackProgress(progress);
  }, []);

  const onCurrentTimeChange = useCallback((seconds: number) => {
    setCurrentTime(seconds);
  }, []);

  const onTrackIndexChange = useCallback((index: number) => {
    setTrackIndex(index);
    setCurrentTime(0);
  }, []);

  const onRandomSong = useCallback(() => {
    const { albumIndex: nextAlbumIndex, trackIndex: nextTrackIndex } = chooseRandomPlaybackSelection(albumsRef.current, visualSettings.highStarTunePriority);
    setAlbumIndex(nextAlbumIndex);
    setTrackIndex(nextTrackIndex);
    setCurrentTime(0);
    setRandomPlaybackRequest((current) => ({
      id: (current?.id ?? 0) + 1,
      albumIndex: nextAlbumIndex,
      trackIndex: nextTrackIndex,
    }));
  }, [visualSettings.highStarTunePriority]);

  const onRandomPlaybackSelection = useCallback(() => chooseRandomPlaybackSelection(albumsRef.current, visualSettings.highStarTunePriority), [visualSettings.highStarTunePriority]);

  const onResetVisualSettings = useCallback(() => {
    skipNextVisualSettingsWriteRef.current = true;
    const resetSettings = resetLocalProductionsVisualSettings();
    setVisualSettings(resetSettings);
    setAutomaticRecipeId(pickAutomaticSketch(resetSettings.automaticSketchDeck));
  }, []);

  const onVisualSettingsChange = useCallback((settings: ProductionsVisualSettings) => {
    const nextSettings = normalizeProductionsVisualSettings(settings);
    setVisualSettings(nextSettings);
    setAutomaticRecipeId((currentRecipeId) => (
      nextSettings.automaticSketchDeck.includes(currentRecipeId)
        ? currentRecipeId
        : pickAutomaticSketch(nextSettings.automaticSketchDeck)
    ));
  }, []);

  const rotationSeed = useMemo(() => getDailyRotationSeed(), []);
  const {
    album,
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
    randomRecipePool,
  } = useProductionVisualPlan({
    album: albums[albumIndex],
    fallbackAlbum: albums[albumIndex],
    effectiveVisualTrackIndex: trackIndex,
    currentTime,
    trackProgress,
    visualSettings,
    automaticRecipeId,
    showMoodLab,
    sectionMoodOverrides,
    setSectionMoodOverrides,
    rotationSeed,
  });
  const { cardBg, cardBorder } = currentRecipe;

  return (
    <div data-productions-theme="dark" className="contents">
      <ExplorerCanvas
        albumName={albumName}
        trackTitle={trackTitle}
        isPlaying={visualPlaybackActive}
        trackProgress={visualTrackProgress}
        baseColor={baseColor}
        artworkUrl={album?.artworkUrl}
        sectionTimes={sectionTimes}
        sectionTimesSource={track?.section_times_source ?? null}
        beatGrid={beatGrid}
        trackDuration={track?.duration ?? undefined}
        currentTime={visualCurrentTime}
        panelCollapsed={playerCollapsed}
        visualConfig={moodLabVisualConfig}
        audioSignalRef={audioSignalRef}
        reviewMotion={showMoodLab}
        showSketchLabel={showDevSketchChip}
        initialSelectionReady={initialSelectionReady}
        colorOnlyWhilePlaying={visualSettings.colorOnlyWhilePlaying}
        rotationSeed={rotationSeed}
      />
      <ShowcasePlayer
        albums={albums}
        albumIndex={albumIndex}
        selectedTrackIndex={trackIndex}
        onAlbumChange={onAlbumChange}
        onPlayingChange={onPlayingChange}
        onPlaybackActiveChange={setVisualPlaybackActive}
        onProgressChange={onProgressChange}
        onCurrentTimeChange={onCurrentTimeChange}
        onTrackIndexChange={onTrackIndexChange}
        onRandomSong={onRandomSong}
        onRandomPlaybackSelection={onRandomPlaybackSelection}
        randomPlaybackRequest={randomPlaybackRequest}
        randomMode={randomMode}
        onRandomModeChange={setRandomMode}
        loading={loading}
        error={error}
        cardBg={cardBg}
        cardBorder={cardBorder}
        panelCollapsed={playerCollapsed}
        onPanelCollapsedChange={setPlayerCollapsed}
        audioSignalRef={audioSignalRef}
        initialSelectionReady={initialSelectionReady}
      />
      {showDevSketchChip ? (
        <div
          className="explorer-sketch-chip hidden lg:block"
          style={{
            ['--explorer-left-panel-width' as string]: EXPLORER_ALBUM_BROWSER_WIDTH_STYLE,
          }}
          title={`${visualChipPrefix}: ${currentRecipe.name}${productionChipDetail} · ${reviewRecipeId ?? currentRecipe.id} · section ${sectionIndex + 1}/${visualPlan.steps.length} · ${beatGrid.bpm} BPM ${beatGrid.bpmSource}`}
        >
          {visualChipPrefix}: {currentRecipe.name}{productionChipDetail} · section {sectionIndex + 1}/{visualPlan.steps.length}
          {` · ${beatGrid.bpm} BPM ${beatGrid.bpmSource}`}
          {moodLabVisualConfig?.events?.length ? ` · ${moodLabVisualConfig.events.length} events` : ''}
          {track?.section_times_source === 'fallback' ? <span style={{ color: '#fcd34d', fontWeight: 600 }}> · FALLBACK</span> : null}
        </div>
      ) : null}
      {showCurationHUD ? (
        <CurationHUD
          visualPlan={visualPlan}
          sectionTimes={sectionTimes}
          beatGrid={beatGrid}
          currentTime={visualCurrentTime}
          sectionIndex={sectionIndex}
          trackDuration={track?.duration ?? undefined}
          visualConfig={moodLabVisualConfig}
          audioSignalRef={audioSignalRef}
          isPlaying={visualPlaybackActive}
        />
      ) : null}
      {showMoodLab ? (
        <SectionMoodLab
          sectionIndex={sectionIndex}
          sectionCount={visualPlan.steps.length}
          step={visualPlan.steps[Math.max(0, Math.min(sectionIndex, visualPlan.steps.length - 1))]}
          baseParams={currentRecipe.baseParams}
          override={sectionMoodOverrides[moodOverrideKey]}
          albumName={albumName}
          trackTitle={trackTitle}
          trackNote={track?.notes}
          recipe={currentRecipe}
          reviewRecipeId={reviewRecipeId}
          currentTime={visualCurrentTime}
          beatGrid={beatGrid}
          visualConfig={moodLabVisualConfig}
          visualPlan={visualPlan}
          visualSettings={visualSettings}
          visualAssignmentMode={visualAssignmentMode}
          visualRotationLabel={rotationSeed}
          randomRecipePool={randomRecipePool}
          onVisualSettingsChange={onVisualSettingsChange}
          onResetVisualSettings={onResetVisualSettings}
          onClearAllOverrides={() => setSectionMoodOverrides({})}
          onRecipeChange={(recipeId) => {
            const nextRecipeId = recipeIsDisabled(recipeId) ? undefined : recipeId;
            setSectionMoodOverrides((current) => {
              const next = { ...current };
              if (nextRecipeId) next[moodTrackOverrideKey] = { recipeId: nextRecipeId };
              else delete next[moodTrackOverrideKey];
              return next;
            });
          }}
          onChange={(override) => {
            setSectionMoodOverrides((current) => {
              const next = { ...current };
              if (override) next[moodOverrideKey] = override;
              else delete next[moodOverrideKey];
              return next;
            });
          }}
        />
      ) : null}
      <ExplorerNav isPlaying={visualPlaybackActive} />
    </div>
  );
}
