import type { Album } from './showcase-data';

export interface SectionWindow {
  start: number;
  end: number | null;
}

export interface PlayableSelection {
  albumIndex: number;
  trackIndex: number;
}

const RANDOM_RATING_WEIGHTS: Record<number, number> = {
  0: 1,
  1: 1,
  2: 4,
  3: 8,
  4: 16,
  5: 32,
};

export function formatTime(seconds: number | null): string {
  if (seconds == null || !isFinite(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function albumDuration(tracks: Album['tracks']): string {
  const total = tracks.reduce((sum, track) => (
    sum + (track.src && track.duration != null ? track.duration : 0)
  ), 0);
  if (total === 0) return '';
  return formatTime(total);
}

export function albumPlayableDurationLabel(tracks: Album['tracks']): string {
  return albumDuration(tracks);
}

export function archivePlayableDurationLabel(albums: readonly Album[]): string {
  const total = albums.reduce((albumSum, album) => (
    albumSum + album.tracks.reduce((trackSum, track) => (
      trackSum + (track.src && track.duration != null ? track.duration : 0)
    ), 0)
  ), 0);
  if (total === 0) return '';

  const roundedMinutes = Math.round(total / 60);
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function trackDurationLabel(track: Album['tracks'][number]): string {
  if (track.isPublished === false) return 'TBD';
  if (!track.src) return 'Unavailable';
  return formatTime(track.duration);
}

export function getAlbumYear(date?: string): string {
  if (!date) return 'TBD';
  const match = date.match(/(?:19|20)\d{2}/);
  return match?.[0] ?? 'TBD';
}

export function isPlayableAlbum(album: Album | undefined): boolean {
  return album?.active === true && album.tracks.some((track) => !!track.src && track.isPublished !== false);
}

export function getPlayableTrackIndices(album: Album | undefined): number[] {
  if (!album || album.active !== true) return [];
  return album.tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => !!track.src && track.isPublished !== false)
    .map(({ index }) => index);
}

export function findFirstPlayableTrackIndex(album: Album | undefined): number {
  return getPlayableTrackIndices(album)[0] ?? 0;
}

export function getRandomPlayableTrackIndex(album: Album | undefined): number {
  const playableTrackIndices = getPlayableTrackIndices(album);
  if (!playableTrackIndices.length) return 0;
  return playableTrackIndices[Math.floor(Math.random() * playableTrackIndices.length)] ?? playableTrackIndices[0] ?? 0;
}

export function getRandomPlayableAlbumIndex(albums: readonly Album[]): number {
  const playableAlbums = albums
    .map((album, index) => ({ album, index }))
    .filter(({ album }) => isPlayableAlbum(album))
    .map(({ index }) => index);

  if (!playableAlbums.length) return getPreferredAlbumIndex(albums);
  return playableAlbums[Math.floor(Math.random() * playableAlbums.length)] ?? playableAlbums[0] ?? getPreferredAlbumIndex(albums);
}

export function getDifferentRandomPlayableAlbumIndex(albums: readonly Album[], currentIndex: number): number {
  const playableAlbums = albums
    .map((album, index) => ({ album, index }))
    .filter(({ album }) => isPlayableAlbum(album))
    .map(({ index }) => index);

  if (!playableAlbums.length) return getPreferredAlbumIndex(albums);

  const otherPlayableAlbums = playableAlbums.filter((index) => index !== currentIndex);
  const candidates = otherPlayableAlbums.length ? otherPlayableAlbums : playableAlbums;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? candidates[0] ?? getPreferredAlbumIndex(albums);
}

export function getPlayableAlbumSequence(albums: readonly Album[]): number[] {
  return sortAlbumsByDate(albums)
    .filter(({ album }) => isPlayableAlbum(album))
    .map(({ index }) => index);
}

export function getRandomPlayableSelection(
  albums: readonly Album[],
  recentTrackIds: readonly number[] = [],
  random: () => number = Math.random,
  highStarPriority = false,
): PlayableSelection {
  const playableTracks = albums.flatMap((album, albumIndex) => (
    getPlayableTrackIndices(album).map((trackIndex) => ({
      albumIndex,
      trackIndex,
      track: album.tracks[trackIndex],
    }))
  ));

  if (!playableTracks.length) {
    const albumIndex = getPreferredAlbumIndex(albums);
    return { albumIndex, trackIndex: findFirstPlayableTrackIndex(albums[albumIndex]) };
  }

  const recentIdSet = new Set(recentTrackIds);
  const freshTracks = playableTracks.filter(({ track }) => !recentIdSet.has(track.id));
  const candidates = freshTracks.length ? freshTracks : playableTracks;
  const candidatesByTier = new Map<number, typeof candidates>();

  for (const candidate of candidates) {
    const authoredRating = candidate.track.starRating;
    const tier = typeof authoredRating === 'number' && isFinite(authoredRating)
      ? Math.max(1, Math.min(5, Math.round(authoredRating)))
      : 0;
    const bucket = candidatesByTier.get(tier) ?? [];
    bucket.push(candidate);
    candidatesByTier.set(tier, bucket);
  }

  const tiers = Array.from(candidatesByTier.entries());
  const totalWeight = tiers.reduce((sum, [tier]) => sum + (highStarPriority ? RANDOM_RATING_WEIGHTS[tier] : 1), 0);
  let roll = Math.max(0, Math.min(0.999999999, random())) * totalWeight;
  const selectedTier = tiers.find(([tier]) => {
    roll -= highStarPriority ? RANDOM_RATING_WEIGHTS[tier] : 1;
    return roll < 0;
  })?.[1] ?? tiers[tiers.length - 1]?.[1] ?? candidates;
  const selected = selectedTier[Math.floor(Math.max(0, Math.min(0.999999999, random())) * selectedTier.length)]
    ?? selectedTier[0]
    ?? candidates[0];

  return { albumIndex: selected.albumIndex, trackIndex: selected.trackIndex };
}

export function getAdjacentPlayableTrackIndex(album: Album | undefined, currentIndex: number, direction: 1 | -1): number {
  const playableTrackIndices = getPlayableTrackIndices(album);
  if (!playableTrackIndices.length) return currentIndex;

  const currentPlayablePosition = playableTrackIndices.indexOf(currentIndex);
  const basePosition = currentPlayablePosition >= 0
    ? currentPlayablePosition
    : playableTrackIndices.findIndex((index) => index > currentIndex);
  const normalizedBase = basePosition >= 0 ? basePosition : 0;
  const nextPosition = (normalizedBase + direction + playableTrackIndices.length) % playableTrackIndices.length;

  return playableTrackIndices[nextPosition] ?? currentIndex;
}

export function getAdjacentPlayableSelection(
  albums: readonly Album[],
  currentAlbumIndex: number,
  currentTrackIndex: number,
  direction: 1 | -1,
  randomForwardAlbum = false,
): { albumIndex: number; trackIndex: number } | null {
  const currentAlbum = albums[currentAlbumIndex];
  const tracks = getPlayableTrackIndices(currentAlbum);
  if (!tracks.length) return null;

  const position = tracks.indexOf(currentTrackIndex);
  const normalizedPosition = position >= 0 ? position : 0;
  const adjacentPosition = normalizedPosition + direction;
  if (adjacentPosition >= 0 && adjacentPosition < tracks.length) {
    return { albumIndex: currentAlbumIndex, trackIndex: tracks[adjacentPosition] };
  }

  const albumIndex = direction > 0 && randomForwardAlbum
    ? getDifferentRandomPlayableAlbumIndex(albums, currentAlbumIndex)
    : direction > 0
      ? getNextPlayableAlbumIndex(albums, currentAlbumIndex)
      : getPreviousPlayableAlbumIndex(albums, currentAlbumIndex);
  const adjacentTracks = getPlayableTrackIndices(albums[albumIndex]);
  if (!adjacentTracks.length) return null;

  return {
    albumIndex,
    trackIndex: direction > 0
      ? adjacentTracks[0]
      : adjacentTracks[adjacentTracks.length - 1],
  };
}

export function getValidTrackIndex(album: Album | undefined, preferredTrackIndex: number | undefined): number {
  const playableTrackIndices = getPlayableTrackIndices(album);
  if (!playableTrackIndices.length) return 0;
  if (typeof preferredTrackIndex === 'number') {
    const clampedIndex = Math.max(0, Math.min(Math.floor(preferredTrackIndex), (album?.tracks.length ?? 1) - 1));
    if (album?.tracks[clampedIndex]?.src) return clampedIndex;
  }
  return playableTrackIndices[0] ?? 0;
}

export function getPreferredAlbumIndex(albums: readonly Album[]): number {
  const firstAvailableIndex = albums.findIndex((album) => isPlayableAlbum(album));
  if (firstAvailableIndex >= 0) return firstAvailableIndex;
  return albums.length > 0 ? 0 : 0;
}

export function getPriorityRandomPlayableAlbumIndex(
  albums: readonly Album[],
  priorityAlbumNames: readonly string[],
): number {
  const priorityKeys = new Set(priorityAlbumNames.map((name) => name.toLowerCase()));
  const priorityAlbums = albums
    .map((album, index) => ({ album, index }))
    .filter(({ album }) => priorityKeys.has(album.name.toLowerCase()) && isPlayableAlbum(album))
    .map(({ index }) => index);

  if (priorityAlbums.length) {
    return priorityAlbums[Math.floor(Math.random() * priorityAlbums.length)] ?? priorityAlbums[0] ?? getPreferredAlbumIndex(albums);
  }

  const playableAlbums = albums
    .map((album, index) => ({ album, index }))
    .filter(({ album }) => isPlayableAlbum(album))
    .map(({ index }) => index);

  if (!playableAlbums.length) return getPreferredAlbumIndex(albums);

  return playableAlbums[Math.floor(Math.random() * playableAlbums.length)] ?? getPreferredAlbumIndex(albums);
}

export function getNextPlayableAlbumIndex(albums: readonly Album[], currentIndex: number): number {
  const playableSequence = getPlayableAlbumSequence(albums);
  if (!playableSequence.length) return currentIndex;
  const position = playableSequence.indexOf(currentIndex);
  if (position < 0) return playableSequence[0];
  return playableSequence[(position + 1) % playableSequence.length] ?? currentIndex;
}

export function getPreviousPlayableAlbumIndex(albums: readonly Album[], currentIndex: number): number {
  const playableSequence = getPlayableAlbumSequence(albums);
  if (!playableSequence.length) return currentIndex;
  const position = playableSequence.indexOf(currentIndex);
  if (position < 0) return playableSequence[playableSequence.length - 1] ?? currentIndex;
  return playableSequence[(position - 1 + playableSequence.length) % playableSequence.length] ?? currentIndex;
}

export function getSectionWindow(sectionTimes: readonly number[] | undefined, sectionIndex: number): SectionWindow {
  const times = Array.isArray(sectionTimes) ? sectionTimes : [];
  const safeIndex = Math.max(0, sectionIndex);
  return {
    start: safeIndex > 0 ? (times[safeIndex - 1] ?? 0) : 0,
    end: times[safeIndex] ?? null,
  };
}

export function getSectionIndexFromTime(sectionTimes: readonly number[] | undefined, currentTime: number): number {
  const times = Array.isArray(sectionTimes) ? sectionTimes : [];
  let index = 0;
  while (index < times.length && times[index] <= currentTime) index += 1;
  return index;
}

export function trackStatusTitle(track: Album['tracks'][number], albumName: string): string {
  if (track.audioError) return track.audioError;
  if (!track.src) return `"${track.title}" in "${albumName}" is unavailable`;
  return track.title;
}

export function sortAlbumsByDate(albums: readonly Album[]): Array<{ album: Album; index: number }> {
  return albums
    .map((album, index) => ({ album, index }))
    .sort((left, right) => {
      const yearA = getAlbumYear(left.album.date);
      const yearB = getAlbumYear(right.album.date);
      if (yearA !== yearB) {
        if (yearA === 'TBD') return 1;
        if (yearB === 'TBD') return -1;
        return Number(yearB) - Number(yearA);
      }
      const dateA = left.album.date ?? '';
      const dateB = right.album.date ?? '';
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return left.album.name.localeCompare(right.album.name);
    });
}
