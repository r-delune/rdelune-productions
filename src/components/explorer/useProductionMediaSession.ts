import { useEffect } from 'react';
import type { Album } from './showcase-data';

type MediaSessionActionName =
  | 'play'
  | 'pause'
  | 'previoustrack'
  | 'nexttrack'
  | 'seekbackward'
  | 'seekforward'
  | 'seekto';

type NavigatorWithOptionalMediaSession = Omit<Navigator, 'mediaSession'> & {
  mediaSession?: MediaSession;
};

interface UseProductionMediaSessionOptions {
  album: Album | undefined;
  track: Album['tracks'][number] | undefined;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  onPlay: () => void;
  onPause: () => void;
  onPreviousTrack: () => void;
  onNextTrack: () => void;
  onSeekTo?: (seconds: number) => void;
}

export function useProductionMediaSession({
  album,
  track,
  isPlaying,
  duration,
  currentTime,
  onPlay,
  onPause,
  onPreviousTrack,
  onNextTrack,
  onSeekTo,
}: UseProductionMediaSessionOptions): void {
  useEffect(() => {
    const mediaSession = (navigator as unknown as NavigatorWithOptionalMediaSession).mediaSession;
    if (!mediaSession || !album || !track) return;

    const artwork = album.artworkUrl
      ? [{ src: new URL(album.artworkUrl, window.location.href).href, sizes: '512x512' }]
      : undefined;

    if ('MediaMetadata' in window) {
      mediaSession.metadata = new window.MediaMetadata({
        title: track.title,
        artist: album.artist || 'Roam',
        album: album.name,
        artwork,
      });
    }

    const handlers: Array<[MediaSessionActionName, MediaSessionActionHandler]> = [
      ['play', onPlay],
      ['pause', onPause],
      ['previoustrack', onPreviousTrack],
      ['nexttrack', onNextTrack],
      ['seekto', (details) => {
        if (typeof details.seekTime === 'number') {
          onSeekTo?.(details.seekTime);
        }
      }],
    ];

    handlers.forEach(([action, handler]) => {
      try {
        mediaSession.setActionHandler(action as MediaSessionAction, handler);
      } catch {
        // Some browsers expose Media Session but reject individual handlers.
      }
    });

    return () => {
      handlers.forEach(([action]) => {
        try {
          mediaSession.setActionHandler(action as MediaSessionAction, null);
        } catch {
          // Ignore unsupported actions.
        }
      });
    };
  }, [album, onNextTrack, onPause, onPlay, onPreviousTrack, onSeekTo, track]);

  useEffect(() => {
    const mediaSession = (navigator as unknown as NavigatorWithOptionalMediaSession).mediaSession;
    if (!mediaSession) return;

    mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    if (duration > 0 && mediaSession.setPositionState) {
      try {
        mediaSession.setPositionState({
          duration,
          playbackRate: 1,
          position: Math.max(0, Math.min(currentTime, duration)),
        });
      } catch {
        // Ignore browsers with partial Media Session position support.
      }
    }
  }, [currentTime, duration, isPlaying]);
}
