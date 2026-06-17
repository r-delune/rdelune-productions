'use client';

import { useState, useRef, useEffect, useCallback, type ChangeEvent, type MouseEvent as ReactMouseEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import Image from 'next/image';
import AlbumArtwork from './AlbumArtwork';
import AlbumSidebar from './AlbumSidebar';
import {
  FastForward,
  List,
  LoaderCircle,
  Pause,
  Play,
  Rewind,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { Album } from './showcase-data';
import { C1, C2, C3, ACCENT, ACCENT_DIM, ACCENT_BG } from './theme';
import { clamp01, createAudioSignal, resetAudioSignal, smoothAudioSignal, type AudioSignal } from './audio-signal';
import { EXPLORER_DESKTOP_BREAKPOINT } from './runtime/layout';
import { useProductionMediaSession } from './useProductionMediaSession';
import { getProductionPlaybackMode } from './playback-capability';
import {
  albumPlayableDurationLabel,
  findFirstPlayableTrackIndex,
  formatTime,
  getAdjacentPlayableSelection,
  getNextPlayableAlbumIndex,
  getPreviousPlayableAlbumIndex,
  getSectionIndexFromTime,
  getSectionWindow,
  isPlayableAlbum,
  trackDurationLabel,
  trackStatusTitle,
  type PlayableSelection,
} from './production-utils';

interface Props {
  albums: Album[];
  albumIndex: number;
  selectedTrackIndex: number;
  onAlbumChange: (i: number, trackIndex?: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onPlaybackActiveChange: (active: boolean) => void;
  onProgressChange: (progress: number) => void;
  onCurrentTimeChange?: (seconds: number) => void;
  onTrackIndexChange?: (index: number) => void;
  onRandomSong: () => void;
  onRandomPlaybackSelection: () => PlayableSelection;
  randomPlaybackRequest?: { id: number; albumIndex: number; trackIndex: number } | null;
  randomMode: boolean;
  onRandomModeChange: (enabled: boolean) => void;
  loading: boolean;
  error?: boolean;
  cardBg: string;
  cardBorder: string;
  panelCollapsed: boolean;
  onPanelCollapsedChange: (collapsed: boolean) => void;
  audioSignalRef: MutableRefObject<AudioSignal>;
  initialSelectionReady?: boolean;
}

interface BandRange {
  start: number;
  end: number;
}

interface FrequencyBands {
  bass: BandRange;
  mids: BandRange;
  highs: BandRange;
}

type BrowserAudioContext = typeof AudioContext;

interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: BrowserAudioContext;
}

interface HTMLAudioElementWithCapture extends HTMLAudioElement {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
}

interface AnalysisSource {
  node: AudioNode;
  connectAnalyserToOutput: boolean;
}

interface PlaybackTarget {
  albumIndex: number;
  trackIndex: number;
  src: string;
  duration: number;
}

interface WakeLockSentinelLike extends EventTarget {
  released: boolean;
  release: () => Promise<void>;
}

type NavigatorWithWakeLock = Omit<Navigator, 'wakeLock'> & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
  };
};

function encodeSrc(url: string): string {
  try { return new URL(url).href; } catch { return url; }
}

function selectionsMatch(left: PlayableSelection | undefined, right: PlayableSelection): boolean {
  return !!left && left.albumIndex === right.albumIndex && left.trackIndex === right.trackIndex;
}

function safePlay(audio: HTMLAudioElement, onBlocked?: () => void): Promise<boolean> {
  return audio.play()
    .then(() => true)
    .catch(() => {
      onBlocked?.();
      return false;
    });
}

function normalizePlaybackRate(audio: HTMLAudioElement) {
  try {
    audio.defaultPlaybackRate = 1;
    audio.playbackRate = 1;
    audio.preservesPitch = true;
  } catch {
    // Some browsers reject rate/pitch writes while media is changing source.
  }
}

function averageBand(data: Uint8Array<ArrayBuffer>, range: BandRange): number {
  let sum = 0;
  let count = 0;

  for (let i = range.start; i <= range.end; i++) {
    sum += data[i];
    count++;
  }

  return count > 0 ? sum / count / 255 : 0;
}

function shapeBand(value: number, floor: number, gain: number, exponent: number): number {
  const normalized = clamp01((value - floor) * gain);
  return Math.pow(normalized, exponent);
}

function createBandRange(sampleRate: number, fftSize: number, minHz: number, maxHz: number): BandRange {
  const binCount = fftSize / 2;
  const nyquist = sampleRate * 0.5;
  const start = Math.max(1, Math.min(binCount - 1, Math.floor(minHz / nyquist * binCount)));
  const end = Math.max(start, Math.min(binCount - 1, Math.ceil(maxHz / nyquist * binCount)));
  return { start, end };
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

const INFO_SECTIONS = [
  {
    title: 'Roam Archive',
    body: 'This project began as an effort to reclaim buried A/V projects, but since became a means to sequence and make sense of my internal experience since I began making music about 17 years ago.',
  },
  {
    title: 'Working Material',
    body: 'A good portion of this material is salvaged from corrupt or incomplete project files, so expect rough edges. The visual sketches were created with P5js during a period when I was losing my hearing, so it feels nice to finally give them a home. Very much a WIP.',
  },
  {
    title: 'Visual System',
    body: 'Each track can drive a generative sketch. The visuals respond to playback, section timing, album artwork, and authored or rotating visual recipes.',
  },
  {
    title: 'Listening Notes',
    body: 'Use the album drawer to move through years, preview records, and play from the track list. The interface remembers the last playable album on this device.',
  },
] as const;

/* ── Showcase Player ────────────────────────────────────────
   The player is the UI shell for the explorer route.
   It owns transport, audio analysis, and album navigation.
   Album browsing lives in the library; listening controls stay
   in the compact persistent transport.
──────────────────────────────────────────────────────────────── */

export default function ShowcasePlayer({ albums, albumIndex, selectedTrackIndex, onAlbumChange, onPlayingChange, onPlaybackActiveChange, onProgressChange, onCurrentTimeChange, onTrackIndexChange, onRandomSong, onRandomPlaybackSelection, randomPlaybackRequest, randomMode, onRandomModeChange, loading, error, cardBg, cardBorder, panelCollapsed, onPanelCollapsedChange, audioSignalRef, initialSelectionReady = true }: Props) {
  const playbackMode = getProductionPlaybackMode();
  const iosListeningMode = playbackMode === 'ios-listening';
  const [trackIndex, setTrackIndex] = useState(0);
  const [browsingAlbumIndex, setBrowsingAlbumIndex] = useState(albumIndex);
  const [browsingTrackIndex, setBrowsingTrackIndex] = useState(selectedTrackIndex);
  const [isPlaying, setIsPlayingRaw] = useState(false);
  const setIsPlaying = useCallback((v: boolean) => {
    setIsPlayingRaw(v);
    onPlayingChange(v);
  }, [onPlayingChange]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [trackError, setTrackError] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [mobileAlbumsOpen, setMobileAlbumsOpen] = useState(false);
  const [mobileTransportUnlocked, setMobileTransportUnlocked] = useState(false);
  const [hoveredTrack, setHoveredTrack] = useState<number | null>(null);
  const [erroredTracks, setErroredTracks] = useState<number[]>([]);
  const [infoOpen, setInfoOpen] = useState(false);
  const [studioImageFailed, setStudioImageFailed] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const erroredRef = useRef<Set<number>>(new Set());
  const skipEffectRef = useRef(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const desktopMiniProgressRef = useRef<HTMLDivElement>(null);
  const isPlayingRef = useRef(false);
  const albumsRef = useRef(albums);
  const albumIndexRef = useRef(albumIndex);
  const trackIndexRef = useRef(trackIndex);
  const randomModeRef = useRef(randomMode);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analysisSourceRef = useRef<AudioNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const prevFreqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const bandRangesRef = useRef<FrequencyBands | null>(null);
  const analysisFrameRef = useRef<number | null>(null);
  const startAnalysisLoopRef = useRef<() => void>(() => undefined);
  const stopAnalysisLoopRef = useRef<() => void>(() => undefined);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const lastAnalysisTimeRef = useRef(0);
  const fluxBaselineRef = useRef(0);
  const peakEnvelopeRef = useRef(0);
  // Per-band onset detection state: adaptive flux baselines + refractory timestamps
  // so a single kick/hat doesn't double-trigger across adjacent frames.
  const bandOnsetStateRef = useRef({
    bassBaseline: 0,
    highBaseline: 0,
    lastBassOnsetAt: 0,
    lastHighOnsetAt: 0,
  });
  const targetSignalRef = useRef(createAudioSignal());
  const playbackRequestIdRef = useRef(0);
  const playbackIntentRef = useRef(false);
  const playPromiseRef = useRef<Promise<boolean> | null>(null);
  const didReportTrackIndexRef = useRef(false);
  const mobileProgressRef = useRef<HTMLDivElement>(null);
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null);
  const internalTransitionRef = useRef(false);
  const shuffleHistoryRef = useRef<PlayableSelection[]>([]);
  const shuffleCursorRef = useRef(-1);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { albumsRef.current = albums; }, [albums]);
  useEffect(() => { albumIndexRef.current = albumIndex; }, [albumIndex]);
  useEffect(() => { trackIndexRef.current = trackIndex; }, [trackIndex]);
  useEffect(() => { randomModeRef.current = randomMode; }, [randomMode]);
  useEffect(() => {
    if (!infoOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setInfoOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [infoOpen]);
  useEffect(() => {
    if (!didReportTrackIndexRef.current) {
      didReportTrackIndexRef.current = true;
      return;
    }
    onTrackIndexChange?.(trackIndex);
  }, [trackIndex, onTrackIndexChange]);
  useEffect(() => {
    const album = albums[albumIndex];
    const preferredTrackIndex = album?.tracks[selectedTrackIndex]?.src
      ? selectedTrackIndex
      : findFirstPlayableTrackIndex(album);
    setTrackIndex(preferredTrackIndex);
    setCurrentTime(0);
    setDuration(album?.tracks[preferredTrackIndex]?.duration || 0);
    setTrackError(false);
    setBuffering(false);
  }, [albumIndex, albums, selectedTrackIndex]);
  useEffect(() => {
    setBrowsingAlbumIndex(albumIndex);
    setBrowsingTrackIndex(selectedTrackIndex);
  }, [albumIndex, selectedTrackIndex]);
  useEffect(() => {
    const media = window.matchMedia(`(min-width: ${EXPLORER_DESKTOP_BREAKPOINT}px)`);
    const syncViewport = () => setIsDesktopViewport(media.matches);

    syncViewport();
    media.addEventListener('change', syncViewport);
    return () => media.removeEventListener('change', syncViewport);
  }, []);

  useEffect(() => {
    if (isDesktopViewport) {
      setMobileAlbumsOpen(false);
    }
  }, [isDesktopViewport]);

  const createAnalysisSource = useCallback((context: AudioContext, audio: HTMLAudioElement): AnalysisSource | null => {
    const captureAudio = audio as HTMLAudioElementWithCapture;

    try {
      const stream = captureAudio.captureStream?.() ?? captureAudio.mozCaptureStream?.();
      if (stream && stream.getAudioTracks().length > 0) {
        return {
          node: context.createMediaStreamSource(stream),
          connectAnalyserToOutput: false,
        };
      }
    } catch {
      // Ignore and fall back to MediaElementSource.
    }

    try {
      return {
        node: context.createMediaElementSource(audio),
        connectAnalyserToOutput: true,
      };
    } catch {
      return null;
    }
  }, []);

  const ensureAudioAnalysis = useCallback(() => {
    if (iosListeningMode) return;

    const audio = audioRef.current;
    if (!audio || analyserRef.current) return;

    const AudioContextCtor = window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AudioContextCtor) return;

    try {
      const context = new AudioContextCtor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.minDecibels = -92;
      analyser.maxDecibels = -12;
      analyser.smoothingTimeConstant = 0.36;

      const analysisSource = createAnalysisSource(context, audio);
      if (!analysisSource) {
        void context.close().catch(() => undefined);
        return;
      }

      const { node: source, connectAnalyserToOutput } = analysisSource;
      source.connect(analyser);
      if (connectAnalyserToOutput) {
        analyser.connect(context.destination);
      }

      const binCount = analyser.frequencyBinCount;
      audioContextRef.current = context;
      analysisSourceRef.current = source;
      analyserRef.current = analyser;
      timeDataRef.current = new Uint8Array(analyser.fftSize);
      freqDataRef.current = new Uint8Array(binCount);
      prevFreqDataRef.current = new Uint8Array(binCount);
      bandRangesRef.current = {
        bass: createBandRange(context.sampleRate, analyser.fftSize, 24, 180),
        mids: createBandRange(context.sampleRate, analyser.fftSize, 180, 2200),
        highs: createBandRange(context.sampleRate, analyser.fftSize, 2200, 9000),
      };
    } catch {
      analyserRef.current = null;
    }
  }, [createAnalysisSource, iosListeningMode]);

  const resumeAudioAnalysis = useCallback(() => {
    ensureAudioAnalysis();
    const context = audioContextRef.current;
    if (context?.state === 'suspended') {
      void context.resume().catch(() => undefined);
    }
  }, [ensureAudioAnalysis]);

  const suspendAudioAnalysis = useCallback(() => {
    const context = audioContextRef.current;
    if (context?.state === 'running') {
      void context.suspend().catch(() => undefined);
    }
  }, []);

  const resetAnalysisState = useCallback(() => {
    fluxBaselineRef.current = 0;
    peakEnvelopeRef.current = 0;
    bandOnsetStateRef.current.bassBaseline = 0;
    bandOnsetStateRef.current.highBaseline = 0;
    bandOnsetStateRef.current.lastBassOnsetAt = 0;
    bandOnsetStateRef.current.lastHighOnsetAt = 0;
    const prevFreqData = prevFreqDataRef.current;
    if (prevFreqData) prevFreqData.fill(0);
    resetAudioSignal(targetSignalRef.current);
    resetAudioSignal(audioSignalRef.current);
  }, [audioSignalRef]);

  const releaseWakeLock = useCallback(() => {
    const wakeLock = wakeLockRef.current;
    wakeLockRef.current = null;
    if (wakeLock && !wakeLock.released) {
      void wakeLock.release().catch(() => undefined);
    }
  }, []);

  const requestWakeLock = useCallback(() => {
    if (iosListeningMode) return;
    if (typeof document === 'undefined') return;
    if (document.visibilityState !== 'visible') return;
    if (wakeLockRef.current && !wakeLockRef.current.released) return;

    const navigatorWithWakeLock = navigator as unknown as NavigatorWithWakeLock;
    if (!navigatorWithWakeLock.wakeLock) return;

    void navigatorWithWakeLock.wakeLock.request('screen')
      .then((wakeLock) => {
        wakeLockRef.current = wakeLock;
        wakeLock.addEventListener('release', () => {
          if (wakeLockRef.current === wakeLock) {
            wakeLockRef.current = null;
          }
        }, { once: true });
      })
      .catch(() => undefined);
  }, [iosListeningMode]);

  const stopAudioPlayback = useCallback((
    audio: HTMLAudioElement,
    options: { clearSource?: boolean; resetTime?: boolean; preserveIntent?: boolean } = {},
  ) => {
    const preservingIntent = options.preserveIntent === true;
    if (preservingIntent) {
      internalTransitionRef.current = true;
    } else {
      internalTransitionRef.current = false;
      playbackIntentRef.current = false;
    }
    playbackRequestIdRef.current += 1;
    playPromiseRef.current = null;
    onPlaybackActiveChange(false);
    normalizePlaybackRate(audio);
    audio.pause();
    if (options.resetTime) {
      try { audio.currentTime = 0; } catch {
        // Ignore media elements that are not seekable yet.
      }
    }
    if (options.clearSource) {
      audio.removeAttribute('src');
      audio.load();
    }
    if (preservingIntent) {
      setBuffering(true);
      return;
    }
    setBuffering(false);
    setIsPlaying(false);
    resetAnalysisState();
    suspendAudioAnalysis();
    stopAnalysisLoopRef.current();
    releaseWakeLock();
  }, [onPlaybackActiveChange, releaseWakeLock, resetAnalysisState, setIsPlaying, suspendAudioAnalysis]);

  const requestPlayback = useCallback((audio: HTMLAudioElement) => {
    if (playPromiseRef.current && playbackIntentRef.current) {
      setBuffering(true);
      return;
    }

    const requestId = playbackRequestIdRef.current + 1;
    playbackRequestIdRef.current = requestId;
    playbackIntentRef.current = true;
    setMobileTransportUnlocked(true);
    normalizePlaybackRate(audio);
    if (!iosListeningMode) {
      resumeAudioAnalysis();
      startAnalysisLoopRef.current();
    }
    setBuffering(true);
    onPlaybackActiveChange(false);
    const playPromise = safePlay(audio);
    playPromiseRef.current = playPromise;
    void playPromise.then((started) => {
      if (playPromiseRef.current === playPromise) {
        playPromiseRef.current = null;
      }
      const isCurrentRequest = requestId === playbackRequestIdRef.current && playbackIntentRef.current;
      if (!started || !isCurrentRequest || audio.paused || audio.ended) {
        if (requestId === playbackRequestIdRef.current) {
          internalTransitionRef.current = false;
          playbackIntentRef.current = false;
          setBuffering(false);
          setIsPlaying(false);
          onPlaybackActiveChange(false);
          resetAnalysisState();
          suspendAudioAnalysis();
          stopAnalysisLoopRef.current();
        }
        if (started && !isCurrentRequest && !playbackIntentRef.current) {
          audio.pause();
        }
        return;
      }

      internalTransitionRef.current = false;
      setBuffering(false);
      setIsPlaying(true);
      requestWakeLock();
    });
  }, [iosListeningMode, onPlaybackActiveChange, requestWakeLock, resetAnalysisState, resumeAudioAnalysis, setIsPlaying, suspendAudioAnalysis]);

  const playAudioTarget = useCallback((target: PlaybackTarget) => {
    const audio = audioRef.current;
    if (!audio) return;

    stopAudioPlayback(audio, { clearSource: true, resetTime: true, preserveIntent: true });
    setBuffering(true);
    setCurrentTime(0);
    onCurrentTimeChange?.(0);
    onProgressChange(0);
    setDuration(target.duration || 0);
    setTrackError(false);
    audio.preload = 'auto';
    audio.src = encodeSrc(target.src);
    normalizePlaybackRate(audio);
    audio.load();
    requestPlayback(audio);
  }, [onCurrentTimeChange, onProgressChange, requestPlayback, stopAudioPlayback]);

  const loadPausedAudioTarget = useCallback((target: PlaybackTarget) => {
    const audio = audioRef.current;
    if (!audio) return;

    stopAudioPlayback(audio, { clearSource: true, resetTime: true });
    setCurrentTime(0);
    onCurrentTimeChange?.(0);
    onProgressChange(0);
    setDuration(target.duration || 0);
    setTrackError(false);
    audio.preload = 'auto';
    audio.src = encodeSrc(target.src);
    normalizePlaybackRate(audio);
    audio.load();
  }, [onCurrentTimeChange, onProgressChange, stopAudioPlayback]);

  const selectionToPlaybackTarget = useCallback((selection: PlayableSelection | null): PlaybackTarget | null => {
    if (!selection) return null;
    const nextTrack = albumsRef.current[selection.albumIndex]?.tracks[selection.trackIndex];
    if (!nextTrack?.src) return null;

    return {
      albumIndex: selection.albumIndex,
      trackIndex: selection.trackIndex,
      src: nextTrack.src,
      duration: nextTrack.duration || 0,
    };
  }, []);

  const commitManualShuffleSelection = useCallback((selection: PlayableSelection) => {
    if (!randomModeRef.current) return;
    const history = shuffleHistoryRef.current.slice(0, shuffleCursorRef.current + 1);
    if (!selectionsMatch(history[history.length - 1], selection)) history.push(selection);
    shuffleHistoryRef.current = history;
    shuffleCursorRef.current = history.length - 1;
  }, []);

  const getShuffleSelection = useCallback((sourceAlbumIndex: number, sourceTrackIndex: number, direction: 1 | -1, commitSelection = true): PlayableSelection | null => {
    if (!commitSelection) return null;

    const currentSelection = { albumIndex: sourceAlbumIndex, trackIndex: sourceTrackIndex };
    let history = shuffleHistoryRef.current;
    let cursor = shuffleCursorRef.current;
    if (!selectionsMatch(history[cursor], currentSelection)) {
      history = history.slice(0, cursor + 1);
      if (!selectionsMatch(history[history.length - 1], currentSelection)) history.push(currentSelection);
      shuffleHistoryRef.current = history;
      cursor = history.length - 1;
      shuffleCursorRef.current = cursor;
    }

    if (direction < 0) {
      if (cursor <= 0) return null;
      shuffleCursorRef.current = cursor - 1;
      return history[cursor - 1] ?? null;
    }

    if (cursor < history.length - 1) {
      shuffleCursorRef.current = cursor + 1;
      return history[cursor + 1] ?? null;
    }

    const nextSelection = onRandomPlaybackSelection();
    shuffleHistoryRef.current = [...history, nextSelection];
    shuffleCursorRef.current = history.length;
    return nextSelection;
  }, [onRandomPlaybackSelection]);

  const getNextPlaybackTarget = useCallback((sourceAlbumIndex: number, sourceTrackIndex: number, shuffleEnabled = false, commitShuffleSelection = true): PlaybackTarget | null => {
    const nextSelection = shuffleEnabled
      ? getShuffleSelection(sourceAlbumIndex, sourceTrackIndex, 1, commitShuffleSelection)
      : getAdjacentPlayableSelection(albumsRef.current, sourceAlbumIndex, sourceTrackIndex, 1);
    return selectionToPlaybackTarget(nextSelection);
  }, [getShuffleSelection, selectionToPlaybackTarget]);

  const getPreviousPlaybackTarget = useCallback((sourceAlbumIndex: number, sourceTrackIndex: number, shuffleEnabled = false): PlaybackTarget | null => {
    const previousSelection = shuffleEnabled
      ? getShuffleSelection(sourceAlbumIndex, sourceTrackIndex, -1)
      : getAdjacentPlayableSelection(albumsRef.current, sourceAlbumIndex, sourceTrackIndex, -1);
    return selectionToPlaybackTarget(previousSelection);
  }, [getShuffleSelection, selectionToPlaybackTarget]);

  useEffect(() => {
    const audio = new Audio();
    const preloadAudio = new Audio();
    const sharedSignal = audioSignalRef.current;
    const cleanupTargetSignal = targetSignalRef.current;
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    normalizePlaybackRate(audio);
    preloadAudio.crossOrigin = 'anonymous';
    preloadAudio.preload = 'auto';
    audioRef.current = audio;
    preloadAudioRef.current = preloadAudio;

    const handleTimeUpdate = () => {
      const fallbackDuration = albumsRef.current[albumIndexRef.current]?.tracks[trackIndexRef.current]?.duration || 0;
      const progressDuration = audio.duration && isFinite(audio.duration) ? audio.duration : fallbackDuration;
      setCurrentTime(audio.currentTime);
      onCurrentTimeChange?.(audio.currentTime);
      if (progressDuration) {
        onProgressChange(audio.currentTime / progressDuration);
      }
      // Watchdog: if audio advances while the analysis loop is parked
      // (it self-terminates when the signal idles out), restart it.
      if (!audio.paused && analysisFrameRef.current == null) {
        startAnalysisLoopRef.current();
      }
    };
    const handleLoadedMetadata = () => {
      const fallbackDuration = albumsRef.current[albumIndexRef.current]?.tracks[trackIndexRef.current]?.duration || 0;
      setDuration(audio.duration && isFinite(audio.duration) ? audio.duration : fallbackDuration);
      setTrackError(false);
      setBuffering(false);
    };
    const handleCanPlay = () => { if (playbackIntentRef.current) setBuffering(false); };
    const handlePlaying = () => {
      if (!playbackIntentRef.current) return;
      internalTransitionRef.current = false;
      setIsPlaying(true);
      setBuffering(false);
      onPlaybackActiveChange(true);
      requestWakeLock();
      if (analysisFrameRef.current == null) {
        startAnalysisLoopRef.current();
      }
    };
    const handleWaiting = () => {
      if (!playbackIntentRef.current) return;
      setBuffering(true);
      onPlaybackActiveChange(false);
    };
    const handleStalled = () => {
      if (!playbackIntentRef.current) return;
      setBuffering(true);
      onPlaybackActiveChange(false);
    };
    const handleSuspend = () => {
      if (playbackIntentRef.current && audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        setBuffering(false);
      }
    };
    const handlePlay = () => {
      if (!playbackIntentRef.current) {
        audio.pause();
        return;
      }
      normalizePlaybackRate(audio);
      internalTransitionRef.current = false;
      setIsPlaying(true);
      setBuffering(false);
      requestWakeLock();
    };
    const handlePause = () => {
      if (internalTransitionRef.current && playbackIntentRef.current) {
        return;
      }
      if (!audio.ended) {
        playbackIntentRef.current = false;
        playbackRequestIdRef.current += 1;
        setIsPlaying(false);
        onPlaybackActiveChange(false);
        resetAnalysisState();
        suspendAudioAnalysis();
        stopAnalysisLoopRef.current();
        releaseWakeLock();
      }
      setBuffering(false);
    };
    const handleRateChange = () => {
      if (Math.abs(audio.playbackRate - 1) > 0.001 || Math.abs(audio.defaultPlaybackRate - 1) > 0.001) {
        normalizePlaybackRate(audio);
      }
    };
    const handleEnded = () => {
      const currentAlbumIndex = albumIndexRef.current;
      const currentTrackIndex = trackIndexRef.current;
      const currentAlbum = albumsRef.current[currentAlbumIndex];
      if (!currentAlbum) return;

      setCurrentTime(0);
      onCurrentTimeChange?.(0);
      setDuration(0);

      const nextTarget = getNextPlaybackTarget(currentAlbumIndex, currentTrackIndex, randomModeRef.current);
      if (!nextTarget) {
        stopAudioPlayback(audio, { clearSource: true, resetTime: true });
        return;
      }

      if (nextTarget.albumIndex !== currentAlbumIndex) {
        onAlbumChange(nextTarget.albumIndex, nextTarget.trackIndex);
      }

      skipEffectRef.current = true;
      setTrackIndex(nextTarget.trackIndex);
      playAudioTarget(nextTarget);
    };
    const handleError = () => {
      setTrackError(true);
      setBuffering(false);
      onPlaybackActiveChange(false);
      setDuration(0);
      setCurrentTime(0);
      resetAnalysisState();
      stopAnalysisLoopRef.current();
      const failedTrackIndex = trackIndexRef.current;
      erroredRef.current.add(failedTrackIndex);
      setErroredTracks((prev) => (prev.includes(failedTrackIndex) ? prev : [...prev, failedTrackIndex]));

      const nextTarget = getNextPlaybackTarget(albumIndexRef.current, failedTrackIndex, randomModeRef.current);
      if (nextTarget && (nextTarget.albumIndex !== albumIndexRef.current || nextTarget.trackIndex !== failedTrackIndex)) {
        if (nextTarget.albumIndex !== albumIndexRef.current) {
          onAlbumChange(nextTarget.albumIndex, nextTarget.trackIndex);
        }
        skipEffectRef.current = true;
        setTrackIndex(nextTarget.trackIndex);
        playAudioTarget(nextTarget);
        return;
      }

      setTrackIndex((i) => {
        stopAudioPlayback(audio, { clearSource: true, resetTime: true });
        return i;
      });
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('stalled', handleStalled);
    audio.addEventListener('suspend', handleSuspend);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ratechange', handleRateChange);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    // ~30Hz is plenty: the canvas reads the smoothed signal at a 45fps cap and
    // onset consumers hold their own multi-hundred-ms cooldowns. Running the
    // analysis loop at full RAF rate just burns CPU on identical conclusions.
    const ANALYSIS_MIN_INTERVAL_MS = 1000 / 30 - 2;
    const updateAnalysis = (now: number) => {
      if (lastAnalysisTimeRef.current > 0 && now - lastAnalysisTimeRef.current < ANALYSIS_MIN_INTERVAL_MS) {
        analysisFrameRef.current = window.requestAnimationFrame(updateAnalysis);
        return;
      }
      const analyser = analyserRef.current;
      const freqData = freqDataRef.current;
      const prevFreqData = prevFreqDataRef.current;
      const timeData = timeDataRef.current;
      const bandRanges = bandRangesRef.current;
      const signal = sharedSignal;
      const target = targetSignalRef.current;

      const dt = lastAnalysisTimeRef.current > 0
        ? Math.min((now - lastAnalysisTimeRef.current) / 1000, 0.05)
        : 1 / 60;
      lastAnalysisTimeRef.current = now;

      const isActive = !!audio.src && !audio.paused && !audio.ended && audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;

      if (analyser && freqData && prevFreqData && timeData && bandRanges && isActive) {
        analyser.getByteTimeDomainData(timeData);
        analyser.getByteFrequencyData(freqData);

        let sumSquares = 0;
        for (let i = 0; i < timeData.length; i++) {
          const sample = (timeData[i] - 128) / 128;
          sumSquares += sample * sample;
        }

        const rms = Math.sqrt(sumSquares / timeData.length);
        const bassRaw = averageBand(freqData, bandRanges.bass);
        const midsRaw = averageBand(freqData, bandRanges.mids);
        const highsRaw = averageBand(freqData, bandRanges.highs);

        let positiveFlux = 0;
        let bassFlux = 0;
        let highFlux = 0;
        for (let i = 1; i < freqData.length; i++) {
          const current = freqData[i] / 255;
          const previous = prevFreqData[i] / 255;
          if (current > previous) {
            const delta = current - previous;
            positiveFlux += delta;
            if (i >= bandRanges.bass.start && i <= bandRanges.bass.end) bassFlux += delta;
            else if (i >= bandRanges.highs.start && i <= bandRanges.highs.end) highFlux += delta;
          }
          prevFreqData[i] = freqData[i];
        }
        bassFlux /= Math.max(1, bandRanges.bass.end - bandRanges.bass.start + 1);
        highFlux /= Math.max(1, bandRanges.highs.end - bandRanges.highs.start + 1);

        const energyRaw = clamp01((rms - 0.01) * 3.6);
        const flux = clamp01(positiveFlux / 5.6);
        fluxBaselineRef.current += (flux - fluxBaselineRef.current) * Math.min(1, dt * 2.4);

        const fluxExcite = Math.max(0, flux - (fluxBaselineRef.current * 1.08 + 0.008));
        const peakBeforeDecay = peakEnvelopeRef.current;
        peakEnvelopeRef.current = Math.max(peakEnvelopeRef.current * Math.exp(-dt * 2.8), energyRaw);
        const peakExcite = Math.max(0, energyRaw - peakBeforeDecay * 0.82 - 0.018);

        // Per-band onsets: fire when band flux exceeds its adaptive baseline by a
        // multiplicative threshold, with a refractory hold per band.
        const onsetState = bandOnsetStateRef.current;
        const baselineBlend = Math.min(1, dt * 2.4);
        onsetState.bassBaseline += (bassFlux - onsetState.bassBaseline) * baselineBlend;
        onsetState.highBaseline += (highFlux - onsetState.highBaseline) * baselineBlend;
        const bassExcess = bassFlux - (onsetState.bassBaseline * 1.35 + 0.012);
        const highExcess = highFlux - (onsetState.highBaseline * 1.25 + 0.008);
        let bassOnset = 0;
        let highOnset = 0;
        if (bassExcess > 0 && now - onsetState.lastBassOnsetAt >= 140) {
          bassOnset = clamp01(bassExcess * 9);
          onsetState.lastBassOnsetAt = now;
        }
        if (highExcess > 0 && now - onsetState.lastHighOnsetAt >= 90) {
          highOnset = clamp01(highExcess * 11);
          onsetState.lastHighOnsetAt = now;
        }

        target.bass = shapeBand(bassRaw, 0.025, 2.2, 0.8);
        target.mids = shapeBand(midsRaw, 0.02, 1.9, 0.86);
        target.highs = shapeBand(highsRaw, 0.012, 2.15, 0.8);
        target.energy = clamp01(energyRaw * 0.72 + target.bass * 0.2 + target.mids * 0.16);
        target.transient = clamp01(fluxExcite * (6.5 + target.highs * 2.6) + peakExcite * 4.8);
        target.activity = clamp01(target.energy * 0.82 + target.transient * 0.18);
        target.bassOnset = bassOnset;
        target.highOnset = highOnset;
        target.onsetStrength = Math.max(bassOnset, highOnset * 0.7);
        target.playing = 1;
      } else if (isActive) {
        const fallbackDuration = albumsRef.current[albumIndexRef.current]?.tracks[trackIndexRef.current]?.duration || audio.duration || 0;
        const progress = fallbackDuration > 0 ? clamp01(audio.currentTime / fallbackDuration) : 0;
        const pulse = 0.5 + Math.sin(audio.currentTime * 2.8 + progress * Math.PI * 2) * 0.5;
        const slow = 0.5 + Math.sin(audio.currentTime * 0.72 + progress * Math.PI) * 0.5;
        target.energy = 0.12 + pulse * 0.08;
        target.bass = 0.09 + slow * 0.08;
        target.mids = 0.08 + pulse * 0.06;
        target.highs = 0.04 + (1 - slow) * 0.04;
        target.transient = Math.max(0, Math.sin(audio.currentTime * 5.6)) > 0.985 ? 0.22 : 0.02;
        target.activity = 0.2 + pulse * 0.1;
        target.bassOnset = 0;
        target.highOnset = 0;
        target.onsetStrength = 0;
        target.playing = 1;
      } else {
        target.energy = 0;
        target.bass = 0;
        target.mids = 0;
        target.highs = 0;
        target.transient = 0;
        target.activity = 0;
        target.bassOnset = 0;
        target.highOnset = 0;
        target.onsetStrength = 0;
        target.playing = 0;
        fluxBaselineRef.current *= Math.exp(-dt * 4);
        peakEnvelopeRef.current *= Math.exp(-dt * 5);
        bandOnsetStateRef.current.bassBaseline *= Math.exp(-dt * 4);
        bandOnsetStateRef.current.highBaseline *= Math.exp(-dt * 4);
      }

      smoothAudioSignal(signal, target, dt);
      const signalIsIdle = (signal.playing ?? 0) <= 0.001
        && (signal.energy ?? 0) <= 0.001
        && (signal.bass ?? 0) <= 0.001
        && (signal.mids ?? 0) <= 0.001
        && (signal.highs ?? 0) <= 0.001
        && (signal.transient ?? 0) <= 0.001
        && (signal.activity ?? 0) <= 0.001;

      if (isActive || !signalIsIdle) {
        analysisFrameRef.current = window.requestAnimationFrame(updateAnalysis);
      } else {
        analysisFrameRef.current = null;
        lastAnalysisTimeRef.current = 0;
      }
    };

    startAnalysisLoopRef.current = () => {
      if (analysisFrameRef.current != null) return;
      lastAnalysisTimeRef.current = 0;
      analysisFrameRef.current = window.requestAnimationFrame(updateAnalysis);
    };
    stopAnalysisLoopRef.current = () => {
      if (analysisFrameRef.current != null) {
        window.cancelAnimationFrame(analysisFrameRef.current);
        analysisFrameRef.current = null;
      }
      lastAnalysisTimeRef.current = 0;
    };
    if (!iosListeningMode) {
      startAnalysisLoopRef.current();
    }

    return () => {
      startAnalysisLoopRef.current = () => undefined;
      stopAnalysisLoopRef.current = () => undefined;
      if (analysisFrameRef.current != null) window.cancelAnimationFrame(analysisFrameRef.current);
      analysisFrameRef.current = null;
      lastAnalysisTimeRef.current = 0;
      releaseWakeLock();
      playbackIntentRef.current = false;
      playbackRequestIdRef.current += 1;
      playPromiseRef.current = null;
      internalTransitionRef.current = false;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      preloadAudio.pause();
      preloadAudio.removeAttribute('src');
      preloadAudio.load();
      preloadAudioRef.current = null;
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('stalled', handleStalled);
      audio.removeEventListener('suspend', handleSuspend);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ratechange', handleRateChange);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      if (analysisSourceRef.current) {
        analysisSourceRef.current.disconnect();
        analysisSourceRef.current = null;
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        void audioContextRef.current.close().catch(() => undefined);
      }
      audioContextRef.current = null;
      bandRangesRef.current = null;
      timeDataRef.current = null;
      freqDataRef.current = null;
      prevFreqDataRef.current = null;
      resetAudioSignal(cleanupTargetSignal);
      resetAudioSignal(sharedSignal);
    };
  }, [audioSignalRef, ensureAudioAnalysis, getNextPlaybackTarget, iosListeningMode, onAlbumChange, onCurrentTimeChange, onPlaybackActiveChange, onProgressChange, playAudioTarget, releaseWakeLock, requestWakeLock, resetAnalysisState, setIsPlaying, stopAudioPlayback, suspendAudioAnalysis]);

  useEffect(() => {
    const preloadAudio = preloadAudioRef.current;
    if (!preloadAudio) return;

    const nextTarget = getNextPlaybackTarget(albumIndex, trackIndex, randomMode, false);
    if (!nextTarget?.src || nextTarget.src === albums[albumIndex]?.tracks[trackIndex]?.src) {
      preloadAudio.pause();
      preloadAudio.removeAttribute('src');
      preloadAudio.load();
      return;
    }

    const nextSrc = encodeSrc(nextTarget.src);
    if (preloadAudio.src === nextSrc) return;

    preloadAudio.pause();
    preloadAudio.src = nextSrc;
    preloadAudio.load();
  }, [albumIndex, albums, getNextPlaybackTarget, randomMode, trackIndex]);

  useEffect(() => {
    if (skipEffectRef.current) { skipEffectRef.current = false; return; }
    const audio = audioRef.current; const album = albums[albumIndex];
    if (!audio || !album) return;
    if (album.active !== true || album.tracks.length === 0) {
      stopAudioPlayback(audio, { clearSource: true, resetTime: true });
      setTrackError(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }
    const track = album.tracks[trackIndex]; setTrackError(false);
    if (track?.src) {
      stopAudioPlayback(audio, { clearSource: true, resetTime: true });
      setBuffering(false);
      setDuration(track.duration || 0);
      audio.preload = 'auto';
      audio.src = encodeSrc(track.src);
      normalizePlaybackRate(audio);
      audio.load();
    } else {
      stopAudioPlayback(audio, { clearSource: true, resetTime: true });
      setCurrentTime(0);
      setDuration(0);
    }
  }, [trackIndex, albumIndex, albums, stopAudioPlayback]);

  useEffect(() => {
    if (iosListeningMode) {
      releaseWakeLock();
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isPlayingRef.current) {
        requestWakeLock();
      } else if (document.visibilityState !== 'visible') {
        releaseWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (isPlaying) requestWakeLock();
    else releaseWakeLock();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [iosListeningMode, isPlaying, releaseWakeLock, requestWakeLock]);

  const browseAlbum = useCallback((i: number) => {
    if (!isPlayableAlbum(albums[i])) return;
    setBrowsingAlbumIndex(i);
    setBrowsingTrackIndex(findFirstPlayableTrackIndex(albums[i]));
  }, [albums]);

  const playAlbumFromStart = useCallback((i: number, preferredTrackIndex?: number) => {
    const nextAlbum = albums[i];
    if (!isPlayableAlbum(nextAlbum)) {
      return;
    }

    const nextTrackIndex = nextAlbum.tracks[preferredTrackIndex ?? -1]?.src
      ? preferredTrackIndex ?? 0
      : findFirstPlayableTrackIndex(nextAlbum);
    commitManualShuffleSelection({ albumIndex: i, trackIndex: nextTrackIndex });
    setMobileAlbumsOpen(false);
    setBrowsingAlbumIndex(i);
    setBrowsingTrackIndex(nextTrackIndex);
    erroredRef.current.clear();
    setErroredTracks([]);
    skipEffectRef.current = true;
    onAlbumChange(i, nextTrackIndex);
    setTrackIndex(nextTrackIndex);
    setCurrentTime(0);
    setDuration(nextAlbum.tracks[nextTrackIndex]?.duration || 0);
    setTrackError(false);
    const nextTrack = nextAlbum.tracks[nextTrackIndex];
    if (nextTrack?.src) {
      playAudioTarget({
        albumIndex: i,
        trackIndex: nextTrackIndex,
        src: nextTrack.src,
        duration: nextTrack.duration || 0,
      });
    }
  }, [albums, commitManualShuffleSelection, onAlbumChange, playAudioTarget]);

  useEffect(() => {
    if (!randomPlaybackRequest) return;
    playAlbumFromStart(randomPlaybackRequest.albumIndex, randomPlaybackRequest.trackIndex);
  }, [playAlbumFromStart, randomPlaybackRequest]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current; const album = albums[albumIndex];
    if (!audio || album?.active !== true || !album?.tracks[trackIndex]?.src) return;
    if (playbackIntentRef.current && (playPromiseRef.current || buffering)) {
      stopAudioPlayback(audio);
    }
    else if (!audio.paused && !audio.ended) { stopAudioPlayback(audio); }
    else {
      if (!audio.src || audio.src === '') { const t = album.tracks[trackIndex]; if (t?.src) { resetAnalysisState(); setBuffering(true); audio.src = encodeSrc(t.src); } }
      requestPlayback(audio);
    }
  }, [albumIndex, trackIndex, albums, buffering, requestPlayback, resetAnalysisState, stopAudioPlayback]);

  const playCurrentFromMediaSession = useCallback(() => {
    const audio = audioRef.current;
    if (playbackIntentRef.current && playPromiseRef.current) return;
    if (!audio || (!audio.paused && !audio.ended)) return;
    togglePlay();
  }, [togglePlay]);

  const pauseCurrentFromMediaSession = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || (audio.paused && !playbackIntentRef.current)) return;
    stopAudioPlayback(audio);
  }, [stopAudioPlayback]);

  const seekBy = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const fallbackDuration = albumsRef.current[albumIndexRef.current]?.tracks[trackIndexRef.current]?.duration || 0;
    const seekDuration = audio.duration && isFinite(audio.duration)
      ? audio.duration
      : duration || fallbackDuration;
    const upperBound = seekDuration > 0 ? seekDuration : Number.POSITIVE_INFINITY;
    const nextTime = Math.max(0, Math.min(audio.currentTime + seconds, upperBound));
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
    onCurrentTimeChange?.(nextTime);
    if (seekDuration > 0) onProgressChange(nextTime / seekDuration);
  }, [duration, onCurrentTimeChange, onProgressChange]);

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const fallbackDuration = albumsRef.current[albumIndexRef.current]?.tracks[trackIndexRef.current]?.duration || 0;
    const seekDuration = audio.duration && isFinite(audio.duration)
      ? audio.duration
      : duration || fallbackDuration;
    const upperBound = seekDuration > 0 ? seekDuration : Number.POSITIVE_INFINITY;
    const nextTime = Math.max(0, Math.min(seconds, upperBound));
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
    onCurrentTimeChange?.(nextTime);
    if (seekDuration > 0) onProgressChange(nextTime / seekDuration);
  }, [duration, onCurrentTimeChange, onProgressChange]);

  const playTrack = useCallback((i: number) => {
    const displayedAlbumIndex = albums[browsingAlbumIndex] ? browsingAlbumIndex : albumIndex;
    if (displayedAlbumIndex !== albumIndex) {
      playAlbumFromStart(displayedAlbumIndex, i);
      return;
    }

    const album = albums[albumIndex];
    if (album?.active !== true || !album.tracks[i]?.src) return;
    if (i === trackIndex) {
      const audio = audioRef.current;
      if (audio) togglePlay();
      return;
    }
    commitManualShuffleSelection({ albumIndex, trackIndex: i });
    erroredRef.current.delete(i); setErroredTracks((prev) => prev.filter((idx) => idx !== i)); skipEffectRef.current = true; setTrackIndex(i);
    const t = album.tracks[i];
    if (t?.src) {
      playAudioTarget({
        albumIndex,
        trackIndex: i,
        src: t.src,
        duration: t.duration || 0,
      });
    }
  }, [albumIndex, albums, browsingAlbumIndex, commitManualShuffleSelection, playAlbumFromStart, playAudioTarget, togglePlay, trackIndex]);

  useEffect(() => { const a = audioRef.current; if (a) a.volume = muted ? 0 : volume; }, [volume, muted]);

  const seekToClientX = useCallback((clientX: number, bar: HTMLDivElement | null, seekDuration: number) => {
    const audio = audioRef.current;
    if (!audio || !bar || !seekDuration) return;
    const rect = bar.getBoundingClientRect();
    if (rect.width <= 0) return;
    const nextTime = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * seekDuration;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
    onCurrentTimeChange?.(nextTime);
    onProgressChange(seekDuration > 0 ? nextTime / seekDuration : 0);
  }, [onCurrentTimeChange, onProgressChange]);

  const startSeek = useCallback((e: ReactPointerEvent<HTMLDivElement>, bar: HTMLDivElement | null, seekDuration: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsSeeking(true);
    seekToClientX(e.clientX, bar, seekDuration);
    const onMove = (ev: PointerEvent) => seekToClientX(ev.clientX, bar, seekDuration);
    const onUp = () => {
      setIsSeeking(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [seekToClientX]);

  const handleVolumeChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value); setVolume(v); if (v > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => { setMuted((m) => !m); }, []);

  const navigateAlbum = useCallback((direction: 1 | -1) => {
    const currentBrowseIndex = albums[browsingAlbumIndex] ? browsingAlbumIndex : albumIndex;
    const nextAlbumIndex = direction > 0
      ? getNextPlayableAlbumIndex(albums, currentBrowseIndex)
      : getPreviousPlayableAlbumIndex(albums, currentBrowseIndex);
    browseAlbum(nextAlbumIndex);
  }, [albumIndex, albums, browseAlbum, browsingAlbumIndex]);

  const navigateTrack = useCallback((direction: 1 | -1) => {
    const target = direction > 0
      ? getNextPlaybackTarget(albumIndex, trackIndex, randomMode)
      : getPreviousPlaybackTarget(albumIndex, trackIndex, randomMode);
    if (!target) return;

    if (target.albumIndex !== albumIndex) {
      onAlbumChange(target.albumIndex, target.trackIndex);
    }
    setTrackIndex(target.trackIndex);
    if (isPlayingRef.current) {
      skipEffectRef.current = true;
      playAudioTarget(target);
    } else {
      loadPausedAudioTarget(target);
    }
  }, [albumIndex, getNextPlaybackTarget, getPreviousPlaybackTarget, loadPausedAudioTarget, onAlbumChange, playAudioTarget, randomMode, trackIndex]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.target instanceof HTMLElement) {
        if (e.target.isContentEditable) return;
        if (e.target.closest('button, a, select, [role="dialog"], .explorer-info-modal')) return;
      }
      if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        togglePlay();
        return;
      }
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) navigateAlbum(-1);
          else { const a = audioRef.current; if (a) a.currentTime = Math.max(0, a.currentTime - 5); }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) navigateAlbum(1);
          else { const a = audioRef.current; if (a?.duration) a.currentTime = Math.min(a.duration, a.currentTime + 5); }
          break;
        case 'ArrowUp':
          e.preventDefault();
          navigateTrack(-1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          navigateTrack(1);
          break;
        case 'm': toggleMute(); break;
      }
    };
    window.addEventListener('keydown', handleKey, { capture: true });
    return () => window.removeEventListener('keydown', handleKey, { capture: true });
  }, [togglePlay, toggleMute, navigateAlbum, navigateTrack]);

  const playingAlbum = albums[albumIndex];
  const playingTrack = playingAlbum?.tracks[trackIndex];
  const displayedBrowsingAlbumIndex = albums[browsingAlbumIndex] ? browsingAlbumIndex : albumIndex;
  const playingAlbumIsAvailable = isPlayableAlbum(playingAlbum);
  const panelTargetAlbumIndex = displayedBrowsingAlbumIndex;
  const [panelAlbumIndex, setPanelAlbumIndex] = useState(panelTargetAlbumIndex);
  const [panelContentVisible, setPanelContentVisible] = useState(true);
  const panelTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!albums.length) return;
    if (panelTargetAlbumIndex === panelAlbumIndex) {
      setPanelContentVisible(true);
      return;
    }

    setPanelContentVisible(false);
    if (panelTransitionTimeoutRef.current) {
      clearTimeout(panelTransitionTimeoutRef.current);
    }
    panelTransitionTimeoutRef.current = setTimeout(() => {
      setPanelAlbumIndex(panelTargetAlbumIndex);
      requestAnimationFrame(() => setPanelContentVisible(true));
    }, 170);

    return () => {
      if (panelTransitionTimeoutRef.current) {
        clearTimeout(panelTransitionTimeoutRef.current);
      }
    };
  }, [albums.length, panelTargetAlbumIndex, panelAlbumIndex]);

  const renderedAlbumIndex = albums[panelAlbumIndex]
    ? panelAlbumIndex
    : panelTargetAlbumIndex;
  const album = albums[renderedAlbumIndex];
  const isPreviewingDifferentAlbum = renderedAlbumIndex !== albumIndex;
  const displayedTrackIndex = isPreviewingDifferentAlbum
    ? album?.tracks[browsingTrackIndex]?.src ? browsingTrackIndex : findFirstPlayableTrackIndex(album)
    : trackIndex;
  const track = isPreviewingDifferentAlbum ? album?.tracks[displayedTrackIndex] : playingTrack;
  const albumDescription = album?.blurb?.trim() ?? '';
  const albumCredits = album?.credits?.trim() ?? '';
  const descriptionParagraphs = albumDescription.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const hasDescription = descriptionParagraphs.length > 0;
  const hasCredits = albumCredits.length > 0;
  const albumIsAvailable = isPlayableAlbum(album);
  const playbackControlsAvailable = albumIsAvailable && (!isPreviewingDifferentAlbum || album.tracks.some((item) => !!item.src));
  const activePlaybackControlsAvailable = playingAlbumIsAvailable && !!playingTrack?.src;
  const miniAlbum = playingAlbum ?? album;
  const miniTrack = playingTrack ?? track;
  const nowPlayingAlbum = playingAlbum ?? album;
  const nowPlayingTrack = playingTrack ?? track;
  const nowPlayingTrackIndex = playingAlbum?.tracks.findIndex((item) => item.id === playingTrack?.id && item.title === playingTrack?.title) ?? -1;
  const nowPlayingTitle = nowPlayingTrack
    ? `${nowPlayingTrackIndex >= 0 ? `${nowPlayingTrackIndex + 1}. ` : ''}${nowPlayingTrack.title}`
    : 'Select a track';
  const nowPlayingAlbumMeta = [
    nowPlayingAlbum?.artist,
    nowPlayingAlbum?.date,
    nowPlayingAlbum && isPlayableAlbum(nowPlayingAlbum) ? `${nowPlayingAlbum.tracks.length} tracks` : '',
    nowPlayingAlbum ? albumPlayableDurationLabel(nowPlayingAlbum.tracks) : '',
  ].filter((item): item is string => Boolean(item));
  const activeDuration = duration || playingTrack?.duration || 0;
  const activeProgress = activeDuration > 0 ? Math.max(0, Math.min(100, (currentTime / activeDuration) * 100)) : 0;
  const miniMeta = [miniAlbum?.name ?? 'Roam', miniAlbum?.artist].filter(Boolean).join(' · ');
  const miniTimeLabel = activeDuration ? `${formatTime(currentTime)} / ${formatTime(activeDuration)}` : '--:--';
  const showMobileTransport = mobileTransportUnlocked && activePlaybackControlsAvailable;

  const prevTrackCb = useCallback(() => navigateTrack(-1), [navigateTrack]);
  const nextTrackCb = useCallback(() => navigateTrack(1), [navigateTrack]);
  useProductionMediaSession({
    album: playingAlbum,
    track: playingTrack,
    isPlaying,
    duration: activeDuration,
    currentTime,
    onPlay: playCurrentFromMediaSession,
    onPause: pauseCurrentFromMediaSession,
    onPreviousTrack: prevTrackCb,
    onNextTrack: nextTrackCb,
    onSeekTo: seekTo,
  });

  const handleDesktopSeekStart = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    startSeek(e, progressRef.current, activeDuration);
  }, [activeDuration, startSeek]);
  const handleMobileSeekStart = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    startSeek(e, mobileProgressRef.current, activeDuration);
  }, [activeDuration, startSeek]);
  const handleMiniSeekStart = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    startSeek(e, e.currentTarget, activeDuration);
  }, [activeDuration, startSeek]);
  const handleDesktopMiniSeekStart = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    startSeek(e, desktopMiniProgressRef.current, activeDuration);
  }, [activeDuration, startSeek]);
  const handlePlayerShellPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.closest('.explorer-info-control, .explorer-info-modal')) return;

  }, []);
  const handlePlayerShellClick = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.detail === 0) return;

    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const button = target.closest('button');
    if (!(button instanceof HTMLButtonElement)) return;
    if (button.matches('.explorer-info-control') || button.closest('.explorer-info-modal')) return;

    button.blur();
  }, []);
  const toggleRandomMode = useCallback(() => {
    onRandomModeChange(!randomMode);
  }, [onRandomModeChange, randomMode]);
  const returnToPlayingAlbum = useCallback(() => {
    setBrowsingAlbumIndex(albumIndex);
    setBrowsingTrackIndex(trackIndex);
  }, [albumIndex, trackIndex]);
  const handleSidebarTrackSelect = useCallback((targetAlbumIdx: number, targetTrackIdx: number) => {
    if (targetAlbumIdx !== albumIndex) {
      playAlbumFromStart(targetAlbumIdx, targetTrackIdx);
      return;
    }
    const a = albums[albumIndex];
    if (a?.active !== true || !a.tracks[targetTrackIdx]?.src) return;
    if (targetTrackIdx === trackIndex) {
      togglePlay();
      return;
    }
    commitManualShuffleSelection({ albumIndex: targetAlbumIdx, trackIndex: targetTrackIdx });
    erroredRef.current.delete(targetTrackIdx);
    setErroredTracks((prev) => prev.filter((idx) => idx !== targetTrackIdx));
    skipEffectRef.current = true;
    setTrackIndex(targetTrackIdx);
    const t = a.tracks[targetTrackIdx];
    if (t?.src) {
      playAudioTarget({ albumIndex, trackIndex: targetTrackIdx, src: t.src, duration: t.duration || 0 });
    }
  }, [albumIndex, albums, commitManualShuffleSelection, playAlbumFromStart, playAudioTarget, togglePlay, trackIndex]);
  const playbackSectionTimes = playingTrack?.section_times;
  const playbackSectionCount = playbackSectionTimes?.length ? playbackSectionTimes.length + 1 : 0;
  const playbackSectionIndex = getSectionIndexFromTime(playbackSectionTimes, currentTime);
  const activeSectionNumber = playbackSectionCount > 0 ? Math.min(playbackSectionIndex + 1, playbackSectionCount) : 0;
  const sectionWindow = getSectionWindow(playbackSectionTimes, playbackSectionIndex);
  const sectionSummary = playbackSectionCount > 0
    ? `Section ${activeSectionNumber}/${playbackSectionCount}`
    : 'No sections';
  const sectionTiming = playbackSectionCount > 0
    ? `${formatTime(sectionWindow.start)}–${sectionWindow.end != null ? formatTime(sectionWindow.end) : 'end'}`
    : '—';
  const panelSurface = cardBg !== 'transparent'
    ? cardBg
    : 'var(--explorer-panel-surface)';
  const panelBorder = cardBorder || 'var(--explorer-panel-border)';
  const panelShadow = 'var(--explorer-right-panel-shadow)';
  const panelSheen = 'var(--explorer-panel-sheen)';

  if (loading && !albums.length) return (
    <div className="relative z-10 flex h-full flex-col justify-end">
      <div
        className="relative z-[2] mx-auto flex max-h-[min(72vh,680px)] min-h-0 w-[calc(100%-1rem)] flex-col overflow-hidden rounded-[30px] border sm:w-[calc(100%-3rem)] md:max-w-[520px] lg:fixed lg:bottom-6 lg:right-6 lg:mx-0 lg:w-[clamp(320px,30vw,440px)]"
        style={{
          borderColor: panelBorder,
        }}
      >
        <div
          className="absolute inset-0 -z-10"
          style={{
            background: panelSurface,
            boxShadow: panelShadow,
          }}
        />

        <div
          className="absolute inset-0 -z-10 pointer-events-none"
          style={{
            background: panelSheen,
          }}
        />

          <div className="flex flex-col h-full px-5 lg:px-6 pt-5 lg:pt-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}>
            <div className="w-full max-w-[200px] lg:max-w-[280px] mx-auto aspect-square rounded-xl mb-5" style={{ background: 'var(--explorer-artwork-surface)', border: '1px solid var(--explorer-artwork-border)' }} />
            <div className="text-center mb-6">
              <div className="h-8 w-40 mx-auto rounded-full mb-3" style={{ background: 'var(--explorer-control-surface)' }} />
              <div className="h-3 w-52 mx-auto rounded-full" style={{ background: 'var(--explorer-row-surface)' }} />
            </div>
            <div className="h-16 rounded-2xl mb-4" style={{ background: 'var(--explorer-control-surface)', border: '1px solid var(--explorer-control-border)' }} />
            <div className="flex-1 rounded-2xl" style={{ background: 'var(--explorer-row-surface)', border: '1px solid var(--explorer-row-border)' }} />
            <p className="text-xs text-center mt-4" style={{ color: C3, opacity: 0.72 }}>Loading archive…</p>
          </div>
      </div>
    </div>
  );

  if (error && !albums.length) return (
    <div className="relative z-10 flex items-center justify-center h-full">
      <p className="text-sm" style={{ color: C3 }}>Unable to load albums.</p>
    </div>
  );

  if (!albums.length) return null;

  return (
    <div className={`explorer-ui-shell relative z-10 flex flex-col h-full ${initialSelectionReady ? 'is-ready' : ''}`} aria-busy={!initialSelectionReady} onPointerDownCapture={handlePlayerShellPointerDown} onClick={handlePlayerShellClick}>
      <AlbumSidebar
        albums={albums}
        albumIndex={displayedBrowsingAlbumIndex}
        playingAlbumIndex={albumIndex}
        playingTrackIndex={trackIndex}
        onSelectAlbum={browseAlbum}
        onSelectTrack={handleSidebarTrackSelect}
        onOpenInfo={() => setInfoOpen(true)}
        onRandomSong={onRandomSong}
        randomMode={randomMode}
        onRandomModeChange={onRandomModeChange}
        isPlaying={isPlaying}
      />
      <AlbumSidebar
        albums={albums}
        albumIndex={displayedBrowsingAlbumIndex}
        playingAlbumIndex={albumIndex}
        playingTrackIndex={trackIndex}
        onSelectAlbum={browseAlbum}
        onSelectTrack={handleSidebarTrackSelect}
        onOpenInfo={() => setInfoOpen(true)}
        onRandomSong={() => {
          onRandomSong();
          setMobileAlbumsOpen(false);
        }}
        isPlaying={isPlaying}
        mode="mobile"
        open={mobileAlbumsOpen}
        onClose={() => setMobileAlbumsOpen(false)}
        miniPlayerTitle={miniTrack?.title}
        miniPlayerMeta={miniMeta}
        miniPlayerProgress={activeProgress}
        miniPlayerElapsed={showMobileTransport ? formatTime(currentTime) : '--:--'}
        miniPlayerDuration={formatTime(activeDuration || null)}
        activePlayback={showMobileTransport}
        onMiniPlayerSeek={handleMiniSeekStart}
        onTogglePlay={togglePlay}
        onPreviousTrack={() => navigateTrack(-1)}
        onNextTrack={() => navigateTrack(1)}
      />

      {infoOpen ? (
        <div className="explorer-info-modal fixed inset-0 z-[70] flex items-center justify-center px-4 py-5 lg:px-8" role="presentation">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close information dialog"
            onClick={() => setInfoOpen(false)}
            style={{ background: 'var(--explorer-mobile-scrim)' }}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="productions-info-title"
            className="explorer-info-dialog productions-mobile-interactive relative flex max-h-[min(88dvh,760px)] w-full max-w-[720px] flex-col overflow-hidden rounded-[28px] border"
            style={{
              borderColor: 'var(--explorer-panel-border)',
              background: 'var(--explorer-panel-surface)',
              boxShadow: 'var(--explorer-right-panel-shadow)',
            }}
          >
            <div className="flex items-center justify-between gap-4 border-b px-5 py-4 lg:px-6" style={{ borderColor: 'var(--explorer-control-border)' }}>
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em]" style={{ color: C3, opacity: 0.7 }}>Roam</p>
                <h2 id="productions-info-title" className="mt-1 text-xl font-semibold leading-tight" style={{ color: C1 }}>About this site</h2>
              </div>
              <button
                type="button"
                onClick={() => setInfoOpen(false)}
                aria-label="Close information dialog"
                className="explorer-info-close flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border"
                style={{ color: C2, borderColor: 'var(--explorer-control-border)', background: 'var(--explorer-control-surface)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto p-5 lg:p-6">
              <div className="explorer-info-image mb-5 overflow-hidden rounded-[20px] border" style={{ borderColor: 'var(--explorer-artwork-border)', background: 'var(--explorer-artwork-surface)' }}>
                {studioImageFailed ? (
                  <div className="flex aspect-[16/9] min-h-[190px] items-center justify-center px-6 text-center">
                    <p className="max-w-sm text-sm leading-6" style={{ color: C3, opacity: 0.82 }}>
                      Studio image placeholder. Add a physical studio image to the repo when it is ready.
                    </p>
                  </div>
                ) : (
                  <Image
                    src="/images/roam-studio/hero.png"
                    alt="Roam Studio workspace"
                    width={1280}
                    height={720}
                    className="aspect-[16/9] h-auto w-full object-cover"
                    onError={() => setStudioImageFailed(true)}
                  />
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {INFO_SECTIONS.map((section) => (
                  <article key={section.title} className="explorer-info-section rounded-[18px] border p-4" style={{ borderColor: 'var(--explorer-control-border)', background: 'var(--explorer-control-surface)' }}>
                    <h3 className="text-[12px] font-semibold uppercase tracking-[0.18em]" style={{ color: C1 }}>{section.title}</h3>
                    <p className="mt-2 text-sm leading-6" style={{ color: C3, opacity: 0.82 }}>{section.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      <div className={`productions-mobile-shell lg:hidden ${showMobileTransport ? 'has-transport' : ''}`}>
        <div
          className="productions-mobile-player-bg"
          aria-hidden="true"
          style={{ backgroundImage: (showMobileTransport ? nowPlayingAlbum : album)?.artworkUrl ? `url(${(showMobileTransport ? nowPlayingAlbum : album)!.artworkUrl})` : undefined }}
        />
        <div className="productions-mobile-topbar productions-mobile-interactive explorer-player-stage" style={{ ['--player-stage-delay' as string]: '90ms' }}>
          <div className="productions-mobile-topbar-group">
            <button type="button" onClick={() => setMobileAlbumsOpen(true)} aria-label="Open album library" title="Open album library" className="productions-mobile-chip productions-mobile-library-chip" style={{ color: C2 }}>
              <List size={13} aria-hidden="true" />
              Albums
            </button>
          </div>
          <div className="productions-mobile-topbar-actions">
            <button type="button" onClick={() => setInfoOpen(true)} aria-label="About Roam Archive" title="About Roam Archive" className="productions-mobile-chip productions-mobile-icon-chip" style={{ color: C2 }}>
              <InfoIcon />
            </button>
          </div>
        </div>


        <div className="productions-mobile-player-scroll productions-mobile-interactive">
        <header className="productions-mobile-archive-header">
          <div className="productions-mobile-archive-mark" aria-hidden="true">
            <AlbumArtwork
              album={album}
              alt=""
              className="h-full w-full object-cover"
              priority
              style={{ filter: albumIsAvailable ? 'none' : 'grayscale(1) saturate(0.55)', opacity: albumIsAvailable ? 1 : 0.72 }}
              fallbackClassName="flex h-full w-full items-center justify-center"
              fallbackLabel={albumIsAvailable ? undefined : 'TBD'}
            />
            {!albumIsAvailable ? (
              <span className="explorer-artwork-status-badge" aria-hidden="true">TBD</span>
            ) : null}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold leading-tight" style={{ color: C1 }}>Roam Archive</h1>
            <p className="mt-1 text-sm leading-5" style={{ color: C2, opacity: 0.84 }}>
              {album.name} · {album.artist || 'Roam'} · {album.date || `${album.tracks.length} tracks`}
            </p>
          </div>
        </header>

        {albumIsAvailable ? (
          <div className="productions-mobile-player-tracklist">
            <div className="productions-mobile-player-tracklist-header">
              <span className="text-[9px] uppercase tracking-[0.3em]" style={{ color: C3, opacity: 0.6 }}>Tracks</span>
              <span className="text-[11px]" style={{ color: C3, opacity: 0.5 }}>{album.tracks.length}</span>
            </div>
            <div className="explorer-mobile-track-rows">
              {album.tracks.map((t, i) => {
                const isCurrent = !isPreviewingDifferentAlbum && i === trackIndex;
                const isActive = isCurrent && isPlaying;
                const hasError = (isCurrent && trackError) || erroredTracks.includes(i);
                const isDraft = t.isPublished === false;
                const isUnavailable = !t.src || isDraft;
                const statusTitle = trackStatusTitle(t, album.name);
                const durationLabel = trackDurationLabel(t);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => playTrack(i)}
                    disabled={isUnavailable}
                    aria-disabled={isUnavailable}
                    aria-label={`${isUnavailable ? 'Unavailable' : 'Play'} ${t.title}`}
                    title={statusTitle}
                    className="explorer-mobile-track-row grid w-full grid-cols-[1.75rem_minmax(0,1fr)_5.25rem] items-center gap-3 px-3 py-2 text-left disabled:cursor-not-allowed"
                    style={{
                      color: hasError || isUnavailable ? 'var(--explorer-track-muted)' : isActive ? C1 : C2,
                      background: isActive ? ACCENT_BG : isCurrent ? 'var(--explorer-row-hover-surface)' : 'transparent',
                      borderLeftColor: isActive ? ACCENT : 'transparent',
                    }}
                  >
                    <span className="flex h-6 items-center text-[13px] tabular-nums" style={{ color: isActive ? ACCENT : C3, opacity: isUnavailable ? 0.62 : 0.86 }}>
                      {isActive ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                      ) : i + 1}
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="text-[14px] font-medium leading-snug break-words">{t.title}</span>
                    </span>
                    <span className="text-right text-[12px] tabular-nums" style={{ color: isUnavailable ? 'var(--explorer-track-muted)' : C3 }}>{durationLabel}</span>
                  </button>
                );
              })}
            </div>
            {(album.bandcampUrl || album.appleMusicUrl || hasCredits) ? (
              <footer className="productions-mobile-footer productions-mobile-interactive">
                <div className="flex items-center gap-3">
                  {album.bandcampUrl ? (
                    <a href={album.bandcampUrl} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-100" style={{ color: C3, opacity: 0.8 }} title="Bandcamp">
                      <svg width="15" height="15" viewBox="0 0 512 512" fill="currentColor"><path d="M256 0C114.6 0 0 114.6 0 256s114.6 256 256 256 256-114.6 256-256S397.4 0 256 0zm-47.5 350H108l98-188h100.5L208.5 350z" /></svg>
                    </a>
                  ) : null}
                  {album.appleMusicUrl ? (
                    <a href={album.appleMusicUrl} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-100" style={{ color: C3, opacity: 0.8 }} title="Apple Music">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v12.3A3.5 3.5 0 1 1 10.5 12V5.7l8-1.7v8.2a3.5 3.5 0 1 1-1.5-2.87V6.16L12 7.22Z" /></svg>
                    </a>
                  ) : null}
                </div>
                {hasCredits ? (
                  <p className="min-w-0 whitespace-pre-wrap break-words text-[11px] leading-5" style={{ color: C3, opacity: 0.66 }} title={albumCredits}>
                    {albumCredits}
                  </p>
                ) : null}
              </footer>
            ) : null}
          </div>
        ) : null}
        </div>

        {showMobileTransport ? (
          <section className="productions-mobile-visual-transport productions-mobile-interactive" aria-label="Now playing controls">
            <div
              ref={mobileProgressRef}
              onPointerDown={handleMobileSeekStart}
              className="productions-mobile-mini-progress cursor-pointer"
              role="slider"
              aria-label="Track progress"
              aria-valuemin={0}
              aria-valuemax={Math.round(activeDuration || 0)}
              aria-valuenow={Math.round(currentTime || 0)}
              style={{ touchAction: 'none' }}
            >
              <div className="productions-mobile-mini-progress-track">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${activeProgress}%`,
                    background: ACCENT,
                    transition: isSeeking ? 'none' : 'width 0.1s linear',
                  }}
                />
              </div>
            </div>
            <div className="productions-mobile-transport-art h-[42px] w-[42px] overflow-hidden" aria-hidden="true">
              <AlbumArtwork album={miniAlbum} alt="" className="h-full w-full object-cover" priority />
            </div>
            <div className="productions-mobile-mini-copy min-w-0">
              <p className="truncate text-[13px] font-semibold leading-tight" style={{ color: C1 }}>
                {miniTrack?.title ?? 'Select a track'}
              </p>
              <p className="explorer-mini-meta-line mt-1 text-[10px] leading-snug" style={{ color: C3 }} title={miniMeta ? `${miniMeta} · ${miniTimeLabel}` : miniTimeLabel}>
                {miniMeta ? <span className="explorer-mini-meta-text">{miniMeta}</span> : null}
                <span className="explorer-mini-time">{miniTimeLabel}</span>
              </p>
            </div>
            <div className="productions-mobile-mini-actions">
              <button type="button" role="switch" aria-checked={randomMode} onClick={toggleRandomMode} aria-label={`Shuffle ${randomMode ? 'on' : 'off'}`} title="Shuffle playback" className="productions-mobile-mini-button" style={{ color: randomMode ? ACCENT : C3 }}>
                <Shuffle size={15} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => navigateTrack(-1)} aria-label="Previous track" title="Previous track" className="productions-mobile-mini-button" style={{ color: C1 }}>
                <SkipBack size={17} fill="currentColor" aria-hidden="true" />
              </button>
              <button type="button" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause' : 'Play'} className="productions-mobile-mini-play" style={{ color: C1, borderColor: isPlaying ? ACCENT_DIM : 'var(--explorer-control-border)', background: isPlaying ? ACCENT_BG : 'var(--explorer-control-surface)' }}>
                {buffering ? (
                  <LoaderCircle size={17} className="animate-spin" style={{ animationDuration: '1s' }} aria-hidden="true" />
                ) : isPlaying ? (
                  <Pause size={17} fill="currentColor" aria-hidden="true" />
                ) : (
                  <Play size={17} fill="currentColor" aria-hidden="true" />
                )}
              </button>
              <button type="button" onClick={() => navigateTrack(1)} aria-label="Next track" title="Next track" className="productions-mobile-mini-button" style={{ color: C1 }}>
                <SkipForward size={17} fill="currentColor" aria-hidden="true" />
              </button>
            </div>
          </section>
        ) : null}
      </div>


      {/* Desktop keeps a single persistent compact transport. */}
        <aside
          className="explorer-side-panel explorer-mini-player hidden lg:flex"
          style={{
            borderColor: panelBorder,
            background: 'var(--explorer-mini-player-surface)',
            boxShadow: 'var(--explorer-mini-player-shadow)',
          }}
          aria-label="Now playing controls"
        >
          <div className="explorer-mini-player-row">
            <div className="explorer-mini-player-open">
              <div className="explorer-mini-art" aria-hidden="true">
                <AlbumArtwork album={miniAlbum} alt="" className="h-full w-full object-cover" priority />
              </div>
              <div className="explorer-mini-copy min-w-0 text-left">
                <p className="explorer-mini-title truncate font-semibold leading-tight" style={{ color: C1 }} title={miniTrack?.title ?? 'Select a track'}>
                  {miniTrack?.title ?? 'Select a track'}
                </p>
                <p className="explorer-mini-meta explorer-mini-meta-line mt-1 leading-snug" style={{ color: C3 }} title={miniMeta}>
                  {miniMeta ? <span className="explorer-mini-meta-text">{miniMeta}</span> : null}
                </p>
              </div>
            </div>

            <div className="explorer-mini-controls">
              <button
                type="button"
                onClick={() => navigateTrack(-1)}
                disabled={!activePlaybackControlsAvailable}
                aria-label="Previous track"
                title="Previous track"
                className="explorer-btn explorer-mini-control"
              >
                <SkipBack size={13} fill="currentColor" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={togglePlay}
                disabled={!activePlaybackControlsAvailable}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                title={isPlaying ? 'Pause' : 'Play'}
                className={`explorer-btn-play explorer-mini-play ${isPlaying ? 'explorer-playing-glow' : ''}`}
                style={{
                  color: C1,
                  borderColor: isPlaying ? ACCENT_DIM : 'var(--explorer-control-border)',
                  background: isPlaying ? ACCENT_BG : 'var(--explorer-control-surface)',
                }}
              >
                {buffering ? (
                  <LoaderCircle size={15} className="animate-spin" style={{ animationDuration: '1s' }} aria-hidden="true" />
                ) : isPlaying ? (
                  <Pause size={14} fill="currentColor" aria-hidden="true" />
                ) : (
                  <Play size={14} fill="currentColor" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() => navigateTrack(1)}
                disabled={!activePlaybackControlsAvailable}
                aria-label="Next track"
                title="Next track"
                className="explorer-btn explorer-mini-control"
              >
                <SkipForward size={13} fill="currentColor" aria-hidden="true" />
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={randomMode}
                onClick={toggleRandomMode}
                aria-label={`Shuffle ${randomMode ? 'on' : 'off'}`}
                title="Shuffle playback"
                className={`explorer-btn explorer-mini-control ${randomMode ? 'explorer-random-active' : ''}`}
                style={{ color: randomMode ? ACCENT : C3 }}
              >
                <Shuffle size={13} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div
            ref={desktopMiniProgressRef}
            onPointerDown={activePlaybackControlsAvailable ? handleDesktopMiniSeekStart : undefined}
            className={`explorer-mini-progress ${activePlaybackControlsAvailable ? 'cursor-pointer' : 'cursor-default'}`}
            role="slider"
            aria-label="Track progress"
            aria-valuemin={0}
            aria-valuemax={Math.round(activeDuration || 0)}
            aria-valuenow={Math.round(currentTime || 0)}
            style={{ touchAction: 'none' }}
          >
            <div className="explorer-mini-progress-track">
              <div className="explorer-mini-progress-fill" style={{ width: `${activeProgress}%`, background: ACCENT }}>
                <div className="explorer-progress-thumb absolute right-0 top-1/2" />
              </div>
            </div>
          </div>
          <div className="explorer-mini-time-row" style={{ color: C3 }}>
            <span>{activePlaybackControlsAvailable ? formatTime(currentTime) : '--:--'}</span>
            <span>{formatTime(activeDuration || null)}</span>
          </div>
        </aside>
      {false ? (
        <aside
          className="explorer-side-panel explorer-player-popout hidden lg:flex"
          style={{
            borderColor: panelBorder,
            background: panelSurface,
            boxShadow: panelShadow,
          }}
          aria-label="Queue and track details"
        >
          <div className="pointer-events-none absolute inset-0 -z-10" style={{ background: panelSheen }} />
          <div className={`explorer-panel-content flex min-h-0 flex-1 flex-col ${panelContentVisible ? 'is-visible' : 'is-exiting'}`}>
            <header className="explorer-popout-header">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.2em]" style={{ color: isPreviewingDifferentAlbum ? ACCENT : C3, opacity: isPreviewingDifferentAlbum ? 0.9 : 0.45 }}>
                  {isPreviewingDifferentAlbum ? 'Browsing album' : 'Now playing'}
                </p>
                <h2 className="mt-1 text-[18px] font-semibold leading-tight" style={{ color: C1 }}>
                  {isPreviewingDifferentAlbum ? album.name : nowPlayingAlbum?.name ?? album.name}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onPanelCollapsedChange(true)}
                  className="explorer-btn explorer-popout-icon"
                  aria-label="Close queue and track details"
                  title="Close queue and track details"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            </header>

            <section className="explorer-popout-now">
              <div className="explorer-popout-art">
                <AlbumArtwork
                  album={album}
                  alt={`${album.name} artwork`}
                  className="h-full w-full object-cover"
                  priority
                  style={{ filter: albumIsAvailable ? 'none' : 'grayscale(1) saturate(0.55)', opacity: albumIsAvailable ? 1 : 0.72 }}
                  fallbackClassName="flex h-full w-full items-center justify-center text-2xl font-semibold"
                  fallbackLabel={albumIsAvailable ? undefined : 'TBD'}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-tight" style={{ color: C1 }}>
                  {isPreviewingDifferentAlbum ? album.name : nowPlayingTitle}
                </p>
                <p className="mt-1 text-[11px] leading-snug" style={{ color: C3, opacity: 0.78 }}>
                  {(isPreviewingDifferentAlbum
                    ? [album.artist, album.date, albumIsAvailable ? `${album.tracks.length} tracks` : '', albumIsAvailable ? albumPlayableDurationLabel(album.tracks) : '']
                    : nowPlayingAlbumMeta
                  ).filter(Boolean).join(' · ')}
                </p>
                {isPreviewingDifferentAlbum ? (
                  <div className="explorer-browsing-now mt-2">
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase tracking-[0.2em]" style={{ color: C3, opacity: 0.45 }}>Now playing</p>
                      <p className="mt-0.5 break-words text-[11px] font-medium leading-snug" style={{ color: C2 }}>
                        {nowPlayingTitle} · {playingAlbum?.name ?? 'Roam'}
                      </p>
                    </div>
                    <button type="button" onClick={returnToPlayingAlbum} className="explorer-browsing-return" style={{ color: ACCENT }}>
                      Return
                    </button>
                  </div>
                ) : null}
                {hasDescription ? (
                  <p className="mt-2 line-clamp-2 text-[12px] leading-5" style={{ color: C2, opacity: 0.78 }}>
                    {descriptionParagraphs[0]}
                  </p>
                ) : null}
                {isPreviewingDifferentAlbum && playbackControlsAvailable ? (
                  <button
                    type="button"
                    onClick={() => playAlbumFromStart(renderedAlbumIndex)}
                    className="explorer-browsing-play mt-3"
                    style={{ color: C1, borderColor: ACCENT_DIM, background: ACCENT_BG }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                    Play this album
                  </button>
                ) : null}
              </div>
            </section>

            <section className="explorer-popout-transport" aria-label="Playback controls">
              <div
                ref={progressRef}
                onPointerDown={activePlaybackControlsAvailable ? handleDesktopSeekStart : undefined}
                role="slider"
                aria-label="Track progress"
                aria-valuemin={0}
                aria-valuemax={Math.round(activeDuration || 0)}
                aria-valuenow={Math.round(currentTime || 0)}
                className={`explorer-popout-scrubber group ${activePlaybackControlsAvailable ? 'cursor-pointer' : 'cursor-default'}`}
                style={{ touchAction: 'none' }}
              >
                <div className="explorer-popout-scrubber-track">
                  <div className="explorer-progress-fill relative h-full rounded-full" style={{ width: `${activeProgress}%`, background: activePlaybackControlsAvailable ? ACCENT : 'var(--explorer-track-muted)', transition: isSeeking ? 'none' : 'width 0.1s linear' }}>
                    <div className="explorer-progress-thumb absolute right-0 top-1/2" />
                  </div>
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px]" style={{ color: C3, opacity: 0.68 }}>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{activePlaybackControlsAvailable ? formatTime(currentTime) : '--:--'}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatTime(activeDuration || null)}</span>
              </div>

              <div className="mt-3 flex items-center justify-center gap-1.5">
                <button type="button" onClick={() => seekBy(-5)} disabled={!activePlaybackControlsAvailable} aria-label="Rewind 5 seconds" title="Rewind 5 seconds" className="explorer-btn explorer-popout-secondary">
                  <Rewind size={14} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => navigateTrack(-1)} disabled={!activePlaybackControlsAvailable} aria-label="Previous track" title="Previous track" className="explorer-btn explorer-popout-secondary">
                  <SkipBack size={15} fill="currentColor" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={activePlaybackControlsAvailable ? togglePlay : () => playAlbumFromStart(renderedAlbumIndex)}
                  disabled={!activePlaybackControlsAvailable && !playbackControlsAvailable}
                  aria-label={activePlaybackControlsAvailable ? isPlaying ? 'Pause' : 'Play' : `Play ${album.name}`}
                  className={`explorer-btn-play explorer-popout-play ${isPlaying ? 'explorer-playing-glow' : ''}`}
                  style={{
                    color: C1,
                    borderColor: activePlaybackControlsAvailable && isPlaying ? ACCENT_DIM : 'var(--explorer-control-border)',
                    background: activePlaybackControlsAvailable && isPlaying ? ACCENT_BG : 'var(--explorer-control-surface)',
                    opacity: activePlaybackControlsAvailable || playbackControlsAvailable ? 1 : 0.45,
                  }}
                >
                  {buffering ? (
                    <LoaderCircle size={19} className="animate-spin" style={{ animationDuration: '1s' }} aria-hidden="true" />
                  ) : isPlaying ? (
                    <Pause size={19} fill="currentColor" aria-hidden="true" />
                  ) : (
                    <Play size={20} fill="currentColor" aria-hidden="true" />
                  )}
                </button>
                <button type="button" onClick={() => navigateTrack(1)} disabled={!activePlaybackControlsAvailable} aria-label="Next track" title="Next track" className="explorer-btn explorer-popout-secondary">
                  <SkipForward size={15} fill="currentColor" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => seekBy(5)} disabled={!activePlaybackControlsAvailable} aria-label="Forward 5 seconds" title="Forward 5 seconds" className="explorer-btn explorer-popout-secondary">
                  <FastForward size={14} aria-hidden="true" />
                </button>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <button type="button" onClick={toggleMute} disabled={!activePlaybackControlsAvailable} aria-label={muted ? 'Unmute' : 'Mute'} title="Mute (m)" className="explorer-btn explorer-popout-volume-button">
                  {muted || volume === 0 ? (
                    <VolumeX size={14} aria-hidden="true" />
                  ) : (
                    <Volume2 size={14} aria-hidden="true" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  aria-label="Volume"
                  disabled={!activePlaybackControlsAvailable}
                  value={muted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="explorer-popout-volume appearance-none"
                  style={{
                    background: `linear-gradient(to right, ${ACCENT_DIM} ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.12) ${(muted ? 0 : volume) * 100}%)`,
                  }}
                />
                <span className="w-8 text-right text-[10px] tabular-nums" style={{ color: C3, opacity: 0.68 }}>
                  {Math.round((muted ? 0 : volume) * 100)}%
                </span>
              </div>

              {!isPreviewingDifferentAlbum ? (
                <div className="mt-3 flex justify-center">
                  <div className="inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-[9px] uppercase tracking-[0.16em]" style={{ color: C3, background: 'var(--explorer-row-surface)', border: '1px solid var(--explorer-row-border)', opacity: 0.72 }}>
                    <span>{sectionSummary}</span>
                    <span style={{ opacity: 0.35 }}>•</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.08em' }}>{sectionTiming}</span>
                  </div>
                </div>
              ) : null}
              <button type="button" role="switch" aria-checked={randomMode} onClick={toggleRandomMode} className="explorer-autoplay-random">
                <span className="explorer-autoplay-random-copy">
                  <Shuffle size={14} aria-hidden="true" />
                  <span><strong>Shuffle</strong><small>Randomise Next and track completion</small></span>
                </span>
                <span className={`explorer-switch ${randomMode ? 'is-on' : ''}`} aria-hidden="true"><span /></span>
              </button>
            </section>

            <section className="explorer-popout-tracklist" aria-label="Tracklist">
              <div className="explorer-popout-tracklist-header">
                <span>Tracks</span>
                <span>{albumIsAvailable ? `${album.tracks.length}` : 'Unavailable'}</span>
              </div>
              {albumIsAvailable ? (
                <div className="min-h-0 flex-1 overflow-y-auto explorer-tracklist">
                  {album.tracks.map((t, i) => {
                    const isCurrent = !isPreviewingDifferentAlbum && i === trackIndex;
                    const isActive = isCurrent && isPlaying;
                    const hasError = (isCurrent && trackError) || erroredTracks.includes(i);
                    const isDraft = t.isPublished === false;
                    const isUnavailable = !t.src || isDraft;
                    const isHovered = hoveredTrack === i;
                    const statusTitle = trackStatusTitle(t, album.name);
                    const durationLabel = trackDurationLabel(t);

                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => playTrack(i)}
                        disabled={isUnavailable}
                        onMouseEnter={() => setHoveredTrack(i)}
                        onMouseLeave={() => setHoveredTrack(null)}
                        aria-disabled={isUnavailable}
                        aria-label={`${isUnavailable ? 'Unavailable' : isActive ? 'Now playing' : 'Play'} ${t.title}`}
                        title={statusTitle}
                        className="explorer-popout-track-row"
                        style={{
                          color: hasError || isUnavailable ? 'var(--explorer-track-muted)' : isActive ? C1 : C2,
                          background: isActive ? ACCENT_BG : isCurrent ? 'var(--explorer-row-surface)' : isHovered ? 'var(--explorer-row-hover-surface)' : 'transparent',
                          borderLeftColor: isActive ? ACCENT : 'transparent',
                        }}
                      >
                        <span className="explorer-popout-track-index" style={{ color: isActive ? ACCENT : C3, opacity: isUnavailable ? 0.42 : isHovered || isActive ? 1 : 0.64 }}>
                          {isActive ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                          ) : isHovered && !isUnavailable ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                          ) : (
                            i + 1
                          )}
                        </span>
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="text-[13px] font-medium leading-snug break-words">{t.title}</span>
                        </span>
                        <span className="text-right text-[11px] tabular-nums" style={{ color: C3, opacity: 0.58 }}>
                          {durationLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                  <h3 className="text-sm font-semibold" style={{ color: C1 }}>Select a playable album.</h3>
                  <p className="mt-2 text-[12px] leading-5" style={{ color: C3, opacity: 0.8 }}>
                    Archive-only entries stay in the album list and do not open here.
                  </p>
                </div>
              )}
            </section>

            {(album.bandcampUrl || album.appleMusicUrl || hasCredits) ? (
              <footer className="explorer-popout-footer">
                <div className="flex items-center gap-3">
                  {album.bandcampUrl ? (
                    <a href={album.bandcampUrl} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-100" style={{ color: C3, opacity: 0.72 }} title="Bandcamp">
                      <svg width="15" height="15" viewBox="0 0 512 512" fill="currentColor"><path d="M256 0C114.6 0 0 114.6 0 256s114.6 256 256 256 256-114.6 256-256S397.4 0 256 0zm-47.5 350H108l98-188h100.5L208.5 350z" /></svg>
                    </a>
                  ) : null}
                  {album.appleMusicUrl ? (
                    <a href={album.appleMusicUrl} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-100" style={{ color: C3, opacity: 0.72 }} title="Apple Music">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v12.3A3.5 3.5 0 1 1 10.5 12V5.7l8-1.7v8.2a3.5 3.5 0 1 1-1.5-2.87V6.16L12 7.22Z" /></svg>
                    </a>
                  ) : null}
                </div>
                {hasCredits ? (
                  <p className="min-w-0 whitespace-pre-wrap break-words text-[11px] leading-5" style={{ color: C3, opacity: 0.62 }} title={albumCredits}>
                    {albumCredits}
                  </p>
                ) : null}
              </footer>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
