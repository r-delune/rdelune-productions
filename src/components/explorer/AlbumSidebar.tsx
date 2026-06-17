'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import AlbumArtwork from './AlbumArtwork';
import type { Album } from './showcase-data';
import { C1, C2, C3, ACCENT, ACCENT_DIM } from './theme';
import { EXPLORER_ALBUM_BROWSER_WIDTH_STYLE } from './runtime/layout';
import { albumPlayableDurationLabel, archivePlayableDurationLabel, getAlbumYear, isPlayableAlbum, sortAlbumsByDate, trackDurationLabel } from './production-utils';
import { Pause, Play, SkipBack, SkipForward, Sparkles } from 'lucide-react';

interface Props {
  albums: Album[];
  albumIndex: number;
  playingAlbumIndex?: number;
  playingTrackIndex?: number;
  onSelectAlbum: (index: number) => void;
  onSelectTrack?: (albumIndex: number, trackIndex: number) => void;
  onOpenInfo?: () => void;
  onRandomSong?: () => void;
  randomMode?: boolean;
  onRandomModeChange?: (enabled: boolean) => void;
  isPlaying?: boolean;
  mode?: 'desktop' | 'mobile';
  open?: boolean;
  onClose?: () => void;
  miniPlayerTitle?: string;
  miniPlayerMeta?: string;
  miniPlayerProgress?: number;
  miniPlayerElapsed?: string;
  miniPlayerDuration?: string;
  activePlayback?: boolean;
  onMiniPlayerSeek?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onTogglePlay?: () => void;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
}

function getAlbumAudioIssues(album: Album): string[] {
  return album.tracks
    .map((track) => track.audioError)
    .filter((issue): issue is string => !!issue);
}

const ARCHIVE_SOCIAL_LINKS = [
  {
    href: 'https://rdelune.bandcamp.com',
    label: 'Bandcamp',
    color: '#1da0c3',
    icon: (
      <svg width="14" height="14" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
        <path d="M99.2 332.8h200.4l113.2-153.6H212.4L99.2 332.8Z" />
      </svg>
    ),
  },
  {
    href: 'https://soundcloud.com/rdelune',
    label: 'SoundCloud',
    color: '#ff5500',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M9.6 7.2c.38-.15.8-.24 1.24-.24 1.78 0 3.26 1.32 3.5 3.04a3.06 3.06 0 0 1 1.27-.28A3.39 3.39 0 0 1 19 13.1a3.39 3.39 0 0 1-3.39 3.39H8.82V7.53c.23-.13.49-.24.78-.33Zm-2.26.98c.27-.19.56-.36.86-.5v8.81h-.86V8.18Zm-1.42 1.56c.22-.33.48-.65.78-.94v7.69h-.78V9.74Zm-1.31 2.23c.15-.49.36-.97.64-1.4v5.92h-.64v-4.52Zm-1.24 1.2c.17-.18.38-.33.62-.42v3.74h-.38A2.12 2.12 0 0 1 1.5 14.38c0-.48.16-.9.43-1.25v3.2h.57v-3.68c.18-.06.37-.09.57-.09h.3v.61Z" />
      </svg>
    ),
  },
  {
    href: 'https://www.mixcloud.com/rdelune/',
    label: 'Mixcloud',
    color: '#52aad8',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M7.4 15.98a3.9 3.9 0 1 1 1.18-7.62 5.72 5.72 0 0 1 10.73 2.29 2.68 2.68 0 0 1-.58 5.33h-3.26a4.6 4.6 0 0 0-8.07 0Zm3.86-1.95a2.47 2.47 0 0 1 2.31 1.6h-4.6a2.47 2.47 0 0 1 2.29-1.6Zm0-1.58a4.08 4.08 0 0 0-3.82 2.64H7.4a2.31 2.31 0 1 1 1.3-4.21l.9.62.23-1.07a4.14 4.14 0 0 1 8.16.79v.78h.78a1.1 1.1 0 0 1 0 2.19h-2.34a4.08 4.08 0 0 0-5.17-1.74Z" />
      </svg>
    ),
  },
  {
    href: 'https://www.instagram.com/rdelune/',
    label: 'Instagram',
    color: '#e1306c',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="3.7" />
        <path d="M17.3 6.8h.01" />
      </svg>
    ),
  },
];

export default function AlbumSidebar({ albums, albumIndex, playingAlbumIndex = albumIndex, playingTrackIndex = 0, onSelectAlbum, onSelectTrack, onRandomSong, isPlaying = false, mode = 'desktop', open = false, onClose, miniPlayerTitle, miniPlayerMeta, miniPlayerProgress = 0, miniPlayerElapsed = '--:--', miniPlayerDuration = '--:--', activePlayback = false, onMiniPlayerSeek, onTogglePlay, onPreviousTrack, onNextTrack }: Props) {
  const sortedAlbums = useMemo(() => sortAlbumsByDate(albums), [albums]);
  const archiveDuration = useMemo(() => archivePlayableDurationLabel(albums), [albums]);
  const isMobile = mode === 'mobile';
  const [blockedAlbumIndex, setBlockedAlbumIndex] = useState<number | null>(null);
  const [scrollbarVisible, setScrollbarVisible] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState(albumIndex);
  const blockedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollbarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (blockedTimeoutRef.current) {
        clearTimeout(blockedTimeoutRef.current);
      }
      if (scrollbarTimeoutRef.current) {
        clearTimeout(scrollbarTimeoutRef.current);
      }
    };
  }, []);

  // Sync expanded album when external selection changes (e.g. random pick, restore from storage)
  useEffect(() => {
    if (albumIndex >= 0) {
      setExpandedIndex(albumIndex);
    }
  }, [albumIndex]);

  if (!albums.length) return null;

  const flashBlockedAlbum = (index: number) => {
    setBlockedAlbumIndex(index);
    if (blockedTimeoutRef.current) {
      clearTimeout(blockedTimeoutRef.current);
    }
    blockedTimeoutRef.current = setTimeout(() => setBlockedAlbumIndex(null), 650);
  };

  const showScrollbarBriefly = () => {
    setScrollbarVisible(true);
    if (scrollbarTimeoutRef.current) {
      clearTimeout(scrollbarTimeoutRef.current);
    }
    scrollbarTimeoutRef.current = setTimeout(() => setScrollbarVisible(false), 1400);
  };

  const content = (
    <div className={`flex min-h-0 flex-1 flex-col overflow-x-hidden px-4 pb-5 ${isMobile ? 'pt-4' : 'pt-6'}`}>
      <header className="explorer-sidebar-intro mb-5">
        {/* <p className="explorer-sidebar-kicker">roam</p> */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="explorer-sidebar-title">Roam Archive</h1>
          {onRandomSong ? (
            <button
              type="button"
              onClick={onRandomSong}
              aria-label="Play a random track"
              title="Play a random track"
              className="explorer-surprise-button"
              style={{ color: ACCENT }}
            >
              <Sparkles size={13} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {!isMobile ? (
          <>
            <p className="explorer-sidebar-description">
              This project began as a home for buried A/V work, but since became a way to sequence + make sense of my internal world since I began making music around 17 years ago.
            </p>

            <p className="explorer-sidebar-description">
              A lot of the material is recovered from corrupt or incomplete project files, so expect rough edges! While I created most the initial visuals myself, a background process is working continously to expand + improve them day by day.  This is a living project - more content TBD 🙂
              {/* The visual sketches were created in P5.js during a period when I was losing my hearing, so it feels good to finally give them a home here alongside more recent music.  */}
            </p>
          </>
        ) : null}

        {isMobile ? (
          <div className="explorer-sidebar-socials mt-4 flex items-center gap-2">
            <Link
              href="/"
              aria-label="Open rdelune home"
              title="rdelune"
              className="explorer-sidebar-social-link"
              style={{ color: C2 }}
            >
              <Logo className="h-4 w-4" />
              <span>rdelune</span>
            </Link>
            {ARCHIVE_SOCIAL_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open rdelune on ${link.label}`}
                title={link.label}
                className="explorer-sidebar-social-icon"
                style={{ color: link.color }}
              >
                {link.icon}
              </a>
            ))}
          </div>
        ) : null}
      </header>

      <div className="explorer-album-list-shell min-h-0 flex-1">
        <div
          className={`explorer-album-list h-full min-h-0 overflow-y-auto overflow-x-hidden ${scrollbarVisible ? 'is-scrolling' : ''}`}
          onScroll={showScrollbarBriefly}
          onPointerMove={showScrollbarBriefly}
          onFocus={showScrollbarBriefly}
        >
        <div className="explorer-sidebar-section-heading">
          {archiveDuration ? (
            <p className="explorer-sidebar-total-time" title="Total play time across playable tracks with known durations">
              <span>Total Play time</span>
              <strong>{archiveDuration}</strong>
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          {sortedAlbums.map(({ album, index }, visibleIndex) => {
            const isSelected = index === albumIndex;
            const isExpanded = index === expandedIndex;
            const isPlayingAlbum = index === playingAlbumIndex;
            const isActivelyPlayingAlbum = isPlayingAlbum && isPlaying;
            const isAvailable = isPlayableAlbum(album);
            const isBlocked = blockedAlbumIndex === index;
            const audioIssues = getAlbumAudioIssues(album);
            const statusTitle = audioIssues.length
              ? `${album.name}\n${audioIssues.join('\n')}`
              : album.name;
            const year = getAlbumYear(album.date);
            const artist = album.artist ?? null;
            const duration = albumPlayableDurationLabel(album.tracks) ?? null;

            return (
              <article key={album.name} className={`explorer-album-card ${isExpanded ? 'is-open' : ''} ${isActivelyPlayingAlbum ? 'is-playing' : ''} ${!isAvailable ? 'is-unavailable' : ''}`}>
                <button
                  type="button"
                  onClick={() => {
                    if (!isAvailable) {
                      flashBlockedAlbum(index);
                      return;
                    }
                    if (isExpanded) {
                      setExpandedIndex(-1);
                    } else {
                      setExpandedIndex(index);
                      onSelectAlbum(index);
                    }
                  }}
                  aria-disabled={!isAvailable}
                  aria-expanded={isExpanded}
                  aria-current={isPlayingAlbum ? 'true' : undefined}
                  title={statusTitle}
                  className="explorer-album-row group flex w-full max-w-full items-center gap-2.5 rounded-[12px] px-2 py-2 text-left transition-all duration-200"
                  style={{
                    ['--album-row-delay' as string]: `${Math.min(visibleIndex, 18) * 18}ms`,
                    ['--album-row-opacity' as string]: isAvailable ? 1 : 0.8,
                    color: isBlocked ? 'rgba(255, 140, 140, 0.98)' : isSelected ? C1 : isAvailable ? C2 : 'var(--explorer-track-muted)',
                    background: isBlocked ? 'rgba(110, 34, 34, 0.2)' : 'transparent',
                    border: `1px solid ${isBlocked ? 'rgba(255, 120, 120, 0.35)' : 'transparent'}`,
                    boxShadow: isBlocked
                      ? '0 0 18px rgba(255, 70, 70, 0.18), inset 0 0 0 1px rgba(255, 80, 80, 0.08)'
                      : 'none',
                  }}
                >
                  <div
                    className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-[8px]"
                    style={{
                      background: 'var(--explorer-artwork-surface)',
                      border: '1px solid var(--explorer-artwork-border)',
                      boxShadow: isPlayingAlbum
                        ? '0 0 14px rgba(90,170,230,0.08)'
                        : 'none',
                    }}
                  >
                    <AlbumArtwork
                      album={album}
                      className="h-full w-full object-cover"
                      priority={isSelected || isPlayingAlbum}
                      deferMs={Math.min(visibleIndex, 18) * 55 + 260}
                      style={{ filter: isAvailable ? 'none' : 'grayscale(1) saturate(0.5)', opacity: isAvailable || isPlayingAlbum ? 1 : 0.62 }}
                      fallbackLabel={isAvailable ? undefined : 'TBD'}
                    />
                    {!isAvailable ? (
                      <span className="explorer-artwork-status-badge" aria-hidden="true">TBD</span>
                    ) : null}
                    {isActivelyPlayingAlbum ? (
                      <span className="absolute bottom-1 right-1 flex h-[18px] w-[18px] items-center justify-center rounded-[4px]" style={{ color: C1, background: 'var(--explorer-control-surface-strong)', border: '1px solid var(--explorer-control-border)' }}>
                        <span className="explorer-waveform-icon" aria-hidden="true">
                          <span /><span /><span />
                        </span>
                      </span>
                    ) : null}
                  </div>

                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="explorer-album-title block min-w-0 text-[13px] font-medium leading-[1.25] break-words" style={{ color: isBlocked ? 'rgba(255, 140, 140, 0.98)' : isSelected ? C1 : undefined, textShadow: isBlocked ? '0 0 14px rgba(255, 70, 70, 0.45)' : 'none' }}>
                        {album.name}
                      </span>
                      <p className="mt-0.5 text-[10.5px] leading-snug break-words" style={{ color: isAvailable ? C3 : 'var(--explorer-track-muted)' }}>
                        {artist || 'Archive entry'}
                      </p>
                    </div>
                    <span className="flex flex-shrink-0 flex-col items-end gap-1">
                        <span className="text-[10px] font-medium leading-none tabular-nums" style={{ color: isActivelyPlayingAlbum ? ACCENT : C3, opacity: isActivelyPlayingAlbum ? 0.92 : 0.86 }}>
                          {duration || year}
                        </span>
                        {duration ? (
                          <span className="text-[9px] font-medium leading-none tabular-nums" style={{ color: C3, opacity: 0.58 }}>
                            {year}
                          </span>
                        ) : null}
                        {!isAvailable && (
                          <span
                            className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[8px] uppercase tracking-[0.14em]"
                            style={{
                              color: isBlocked ? 'rgba(255, 160, 160, 0.85)' : 'var(--explorer-c3)',
                              opacity: isBlocked ? 1 : 0.82,
                              border: `1px solid ${isBlocked ? 'rgba(255, 120, 120, 0.3)' : 'var(--explorer-control-border)'}`,
                            }}
                          >
                            TBD
                          </span>
                        )}
                      </span>
                  </div>
                </button>

                {isAvailable ? (
                  <div className={`explorer-sidebar-tracklist ${isExpanded ? 'is-open' : ''}`} aria-hidden={!isExpanded}>
                    {album.tracks.map((t, i) => {
                      const isCurrentTrack = isPlayingAlbum && i === playingTrackIndex;
                      const isActivelyPlayingTrack = isCurrentTrack && isPlaying;
                      const isDraft = t.isPublished === false;
                      const isUnavailable = !t.src || isDraft;
                      const stateLabel = t.audioError ? 'Issue' : isDraft ? 'Draft' : !t.src ? 'Unavailable' : null;
                      const durationLabel = trackDurationLabel(t);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            onSelectTrack?.(index, i);
                            if (isMobile) onClose?.();
                          }}
                          disabled={isUnavailable}
                          aria-disabled={isUnavailable}
                          aria-label={`${isUnavailable ? stateLabel ?? 'Unavailable' : isActivelyPlayingTrack ? 'Now playing' : 'Play'} ${t.title}`}
                          title={t.audioError ?? t.title}
                          className="explorer-sidebar-track-row"
                          style={{
                            color: isUnavailable ? 'var(--explorer-track-muted)' : isCurrentTrack ? C1 : C2,
                            background: isCurrentTrack ? 'var(--explorer-row-playing-surface)' : 'transparent',
                            borderLeftColor: isActivelyPlayingTrack ? ACCENT : 'transparent',
                          }}
                        >
                          <span className="flex h-5 items-center justify-center text-[11px] tabular-nums" style={{ color: isActivelyPlayingTrack ? ACCENT : C3 }}>
                            {isActivelyPlayingTrack ? (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                            ) : i + 1}
                          </span>
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="min-w-0 text-[12.5px] font-medium leading-snug break-words">{t.title}</span>
                            {stateLabel && !t.audioError ? <span className="explorer-track-state">{stateLabel}</span> : null}
                          </span>
                          <span className="text-right text-[10.5px] tabular-nums" style={{ color: isUnavailable ? 'var(--explorer-track-muted)' : C3 }}>
                            {durationLabel}
                          </span>
                        </button>
                      );
                    })}
                    <div className="">
                      <div className="flex items-center gap-2">
                        {album.bandcampUrl ? (
                          <a href={album.bandcampUrl} target="_blank" rel="noopener noreferrer" title="Bandcamp" style={{ color: C3, opacity: 0.72 }} className="transition-opacity hover:opacity-100">
                            <svg width="14" height="14" viewBox="0 0 512 512" fill="currentColor"><path d="M99.2 332.8h200.4l113.2-153.6H212.4L99.2 332.8Z" /></svg>
                          </a>
                        ) : null}
                        {album.appleMusicUrl ? (
                          <a href={album.appleMusicUrl} target="_blank" rel="noopener noreferrer" title="Apple Music" style={{ color: C3, opacity: 0.72 }} className="transition-opacity hover:opacity-100">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v12.3A3.5 3.5 0 1 1 10.5 12V5.7l8-1.7v8.2a3.5 3.5 0 1 1-1.5-2.87V6.16L12 7.22Z" /></svg>
                          </a>
                        ) : null}
                      </div>
                      {/* {onRandomModeChange ? (
                        <button
                          type="button"
                          onClick={() => onRandomModeChange(!randomMode)}
                          className={`explorer-sidebar-autoplay-btn ${randomMode ? 'is-on' : ''}`}
                          style={{ color: randomMode ? ACCENT : C3 }}
                          title="Shuffle playback"
                        >
                          <Shuffle size={10} aria-hidden="true" />
                          Shuffle
                        </button>
                      ) : null} */}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className={`fixed inset-0 z-40 lg:hidden transition-opacity duration-300 ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}>
        <button
          type="button"
          aria-label="Close albums"
          onClick={onClose}
          className="absolute inset-0"
          style={{ background: 'var(--explorer-mobile-scrim)' }}
        />
        <aside
          className={`explorer-side-panel absolute inset-0 flex w-full flex-col border transition-transform duration-300 ${open ? 'translate-y-0' : 'translate-y-full'}`}
          style={{
            borderColor: 'var(--explorer-panel-border)',
            background: 'var(--explorer-panel-surface)',
            boxShadow: 'var(--explorer-right-panel-shadow)',
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <div className="flex flex-shrink-0 justify-center pb-1 pt-3" aria-hidden="true">
            <div className="rounded-full" style={{ width: 36, height: 4, background: 'var(--explorer-control-border)' }} />
          </div>
          {content}
          {activePlayback ? (
            <div className="explorer-sidebar-mini-player" style={{ background: 'var(--explorer-panel-surface)', borderTop: '1px solid var(--explorer-control-border)' }}>
              <div
                className="explorer-sidebar-mini-progress"
                onPointerDown={onMiniPlayerSeek}
                role="slider"
                aria-label="Track progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(miniPlayerProgress)}
                style={{ touchAction: 'none' }}
              >
                <div className="explorer-sidebar-mini-progress-track" style={{ background: 'rgba(255,255,255,0.12)' }}>
                  <div style={{ width: `${miniPlayerProgress}%`, background: ACCENT, height: '100%', transition: 'width 0.1s linear' }} />
                </div>
                <div className="explorer-sidebar-mini-time" style={{ color: C3 }}>
                  <span>{miniPlayerElapsed}</span>
                  <span>{miniPlayerDuration}</span>
                </div>
              </div>
              <div className="explorer-sidebar-mini-body">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium leading-tight" style={{ color: C1 }}>{miniPlayerTitle ?? 'Now playing'}</p>
                  {miniPlayerMeta ? <p className="truncate text-[11px]" style={{ color: C3, opacity: 0.65 }}>{miniPlayerMeta}</p> : null}
                </div>
                <div className="explorer-sidebar-mini-controls">
                  <button
                    type="button"
                    onClick={onPreviousTrack}
                    aria-label="Previous track"
                    title="Previous track"
                    className="explorer-sidebar-mini-control"
                    style={{ color: C3 }}
                  >
                    <SkipBack size={17} fill="currentColor" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={onTogglePlay}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    title={isPlaying ? 'Pause' : 'Play'}
                    className="explorer-sidebar-mini-play"
                    style={{ color: C1, borderColor: isPlaying ? ACCENT_DIM : 'var(--explorer-control-border)', background: 'var(--explorer-control-surface)' }}
                  >
                    {isPlaying ? <Pause size={18} fill="currentColor" aria-hidden="true" /> : <Play size={18} fill="currentColor" aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    onClick={onNextTrack}
                    aria-label="Next track"
                    title="Next track"
                    className="explorer-sidebar-mini-control"
                    style={{ color: C3 }}
                  >
                    <SkipForward size={17} fill="currentColor" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    );
  }

  return (
    <aside
      className="explorer-side-panel hidden lg:flex fixed inset-y-0 left-0 z-10 flex-col overflow-hidden border-r"
      style={{
        width: EXPLORER_ALBUM_BROWSER_WIDTH_STYLE,
        borderColor: 'var(--explorer-panel-border)',
        background: 'var(--explorer-panel-surface)',
        boxShadow: 'var(--explorer-panel-shadow)',
      }}
    >
      {content}
    </aside>
  );
}
