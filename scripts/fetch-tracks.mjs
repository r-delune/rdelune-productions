#!/usr/bin/env node

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.SHOWCASE_OUT_DIR || join(__dirname, '..', 'public', 'data');
const OUT_FILE = process.env.SHOWCASE_OUT_FILE || join(OUT_DIR, 'showcase.json');
const SOURCE_URL = process.env.SHOWCASE_SOURCE_URL || 'https://audio.rdelune.dev/showcase.json';
const FETCH_TIMEOUT_MS = Number.parseInt(process.env.SHOWCASE_FETCH_TIMEOUT_MS ?? '10000', 10);
const RUNNING_ON_CLOUDFLARE_PAGES = process.env.CF_PAGES === '1';
const SHOULD_VALIDATE_TRACK_URLS = process.env.VALIDATE_TRACK_URLS === '1' || !RUNNING_ON_CLOUDFLARE_PAGES;
const REQUIRE_PUBLIC_MP3 = process.env.REQUIRE_PUBLIC_MP3 !== '0';
const TRUST_DETECTED_SECTION_TIMES = process.env.TRUST_DETECTED_SECTION_TIMES === '1';

/** Pick first defined value (handles snake_case → camelCase transition) */
const pick = (...vals) => vals.find((v) => v !== undefined) ?? null;

function assignIfDefined(target, key, value) {
  if (value !== undefined && value !== null) target[key] = value;
}

// Mirror of src/components/explorer/runtime/section-times.ts so showcase.json
// ships clean, sorted, in-bounds, de-jittered boundaries. Keep the two in sync.
const MIN_SECTION_GAP_SECONDS = 0.75;
const MIN_EDGE_SECTION_SECONDS = 8;
const MIN_SINGLE_SECTION_REGION_SECONDS = 15;

function normalizeSectionTimes(sectionTimes, trackDuration) {
  if (!Array.isArray(sectionTimes) || sectionTimes.length === 0) return [];
  const hasDuration = typeof trackDuration === 'number' && Number.isFinite(trackDuration) && trackDuration > 0;
  const minTime = hasDuration ? MIN_EDGE_SECTION_SECONDS : 0;
  const maxTime = hasDuration ? Math.max(minTime, trackDuration - MIN_EDGE_SECTION_SECONDS) : Infinity;
  const sorted = sectionTimes
    .filter((time) => typeof time === 'number' && Number.isFinite(time) && time > minTime && time <= maxTime)
    .sort((a, b) => a - b);
  const cleaned = [];
  for (const time of sorted) {
    const last = cleaned[cleaned.length - 1];
    if (last === undefined || time - last >= MIN_SECTION_GAP_SECONDS) cleaned.push(time);
  }
  if (hasDuration && cleaned.length === 1) {
    const only = cleaned[0] ?? 0;
    if (only < MIN_SINGLE_SECTION_REGION_SECONDS || trackDuration - only < MIN_SINGLE_SECTION_REGION_SECONDS) {
      return [];
    }
  }
  return cleaned;
}

function loadExistingShowcase() {
  if (!existsSync(OUT_FILE)) return null;

  try {
    const raw = readFileSync(OUT_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed?.albums)) {
      throw new Error('Existing showcase file is malformed');
    }

    return parsed;
  } catch (error) {
    console.warn('Unable to read existing showcase cache:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

function normalizeLookupKey(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function applyPersistedVisualFields(target, source, { includeBaseColor = false } = {}) {
  if (!source || typeof source !== 'object') return;

  if (includeBaseColor) assignIfDefined(target, 'base_color', source.base_color);
  assignIfDefined(target, 'visual_config', pick(source.visual_config, source.visualConfig));
  assignIfDefined(target, 'visual_sequence', pick(source.visual_sequence, source.visualSequence));
  assignIfDefined(target, 'technique_sequence', pick(source.technique_sequence, source.techniqueSequence));
  assignIfDefined(target, 'visual_steps', pick(source.visual_steps, source.visualSteps));
  assignIfDefined(target, 'technique_steps', pick(source.technique_steps, source.techniqueSteps));
  assignIfDefined(target, 'fallback_recipe_id', pick(source.fallback_recipe_id, source.fallbackRecipeId));
  assignIfDefined(target, 'recipe_id', pick(source.recipe_id, source.recipeId));
  assignIfDefined(target, 'visualizer', source.visualizer);
  assignIfDefined(target, 'debug_label', pick(source.debug_label, source.debugLabel));
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function cacheBustedSourceUrl() {
  if (!SOURCE_URL.startsWith('http://') && !SOURCE_URL.startsWith('https://')) return SOURCE_URL;
  const separator = SOURCE_URL.includes('?') ? '&' : '?';
  return `${SOURCE_URL}${separator}v=${Date.now()}`;
}

/** Check if a URL is reachable via HEAD request */
async function checkUrl(url) {
  try {
    const res = await fetchWithTimeout(url, { method: 'HEAD' });
    return res.ok || res.status === 206;
  } catch {
    return null;
  }
}

function audioFormatFromUrl(url) {
  if (typeof url !== 'string') return '';
  try {
    return new URL(url).pathname.split('.').pop()?.toLowerCase() ?? '';
  } catch {
    return url.split('?', 1)[0].split('.').pop()?.toLowerCase() ?? '';
  }
}

function trackAudioFormat(track, sourceTrack) {
  const explicit = pick(sourceTrack?.format, track.format);
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim().toLowerCase().replace(/^\./, '');
  }
  return audioFormatFromUrl(track.src);
}

function getTrackAudioIssue(track) {
  const format = trackAudioFormat(track, track.sourceTrack);
  if (track.is_published === false) {
    return {
      audio_status: 'unpublished',
      audio_error: null,
      audio_format: format || null,
    };
  }

  if (track.audio_status && track.audio_status !== 'ok') {
    return {
      audio_status: track.audio_status,
      audio_error: track.audio_error || `"${track.title}" in "${track.albumName}" is unavailable`,
      audio_format: track.audio_format ?? (format || null),
      source_url: track.source_url,
    };
  }

  if (!track.src) {
    return {
      audio_status: 'missing',
      audio_error: `"${track.title}" in "${track.albumName}" has no public audio URL`,
      audio_format: format || null,
    };
  }

  if (REQUIRE_PUBLIC_MP3 && format !== 'mp3') {
    return {
      audio_status: 'format',
      audio_error: `"${track.title}" in "${track.albumName}" is ${format || 'unknown format'}, expected mp3`,
      audio_format: format || null,
      source_url: track.src,
    };
  }

  return {
    audio_status: 'ok',
    audio_error: null,
    audio_format: format || null,
  };
}

function annotateTrackAudioStatus(albums, label) {
  const issues = [];
  const allowedDisabledStatuses = new Set(['unpublished']);
  for (const album of albums) {
    for (const track of album.tracks ?? []) {
      track.albumName = album.name;
      const issue = getTrackAudioIssue(track);
      track.audio_status = issue.audio_status;
      track.audio_error = issue.audio_error;
      track.audio_format = issue.audio_format;
      assignIfDefined(track, 'source_url', issue.source_url);

      if (issue.audio_status !== 'ok') {
        if (!allowedDisabledStatuses.has(issue.audio_status)) {
          issues.push(issue.audio_error);
        }
        track.src = null;
      }
      delete track.albumName;
    }
  }

  if (!issues.length) return [];

  console.warn(`${label}: ${issues.length} track status issue(s):`);
  for (const issue of issues) console.warn(`  - ${issue}`);
  return issues;
}

function failOnTrackAudioIssues(albums, label) {
  const issues = annotateTrackAudioStatus(albums, label);
  if (!issues.length) return;
  throw new Error('Showcase audio contract failed');
}

async function main() {
  console.log('Fetching showcase from', SOURCE_URL);
  let data;
  const existing = loadExistingShowcase();

  try {
    const isLocalFile = !SOURCE_URL.startsWith('http://') && !SOURCE_URL.startsWith('https://');
    if (isLocalFile) {
      const localPath = SOURCE_URL.startsWith('file://') ? fileURLToPath(SOURCE_URL) : SOURCE_URL;
      data = JSON.parse(readFileSync(localPath, 'utf8'));
    } else {
      const res = await fetchWithTimeout(cacheBustedSourceUrl(), { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      data = await res.json();
    }
  } catch (error) {
    if (existing) {
      failOnTrackAudioIssues(existing.albums ?? [], 'Checked-in showcase fallback status');
      console.warn('Remote showcase fetch failed, using checked-in cache instead.');
      console.warn(error instanceof Error ? error.message : String(error));
      console.log(`Using ${OUT_FILE}`);
      return;
    }

    throw error;
  }

  const sourceAlbums = data.albums ?? [];
  console.log(`Source: ${data.total_albums ?? sourceAlbums.length} albums, ${data.total_tracks ?? '?'} tracks`);

  const sectionStats = { tracksWithSections: 0, tracksCleaned: 0, boundariesDropped: 0, tracksEmptied: 0, detectedIgnored: 0 };

  const albums = sourceAlbums.map((a) => {
    const existingAlbum = existing?.albums?.find((album) => normalizeLookupKey(album.name) === normalizeLookupKey(a.name));
    const existingTrackMap = new Map(
      (existingAlbum?.tracks ?? []).map((track) => [normalizeLookupKey(track.title), track]),
    );

    const tracks = (a.tracks ?? []).map((t) => {
      const track = {
        id: t.id,
        title: (t.title || 'Untitled').trim(),
        duration: pick(t.duration_seconds, t.duration) || null,
        src: pick(t.r2_url, t.src) || null,
        source_url: pick(t.r2_url, t.src) || null,
        sourceTrack: t,
      };

      assignIfDefined(track, 'notes', typeof t.notes === 'string' && t.notes.trim() ? t.notes.trim() : undefined);
      assignIfDefined(track, 'is_published', pick(t.is_published, t.isPublished));

      // Sanitize authored section boundaries once, at ingestion, so all
      // downstream consumers get sorted, in-bounds, de-jittered data.
      let sectionTimesSource = t.section_times_source ?? undefined;
      const sectionTimesAreTrusted = sectionTimesSource === 'manual' || TRUST_DETECTED_SECTION_TIMES;
      if (Array.isArray(t.section_times) && t.section_times.length && sectionTimesAreTrusted) {
        sectionStats.tracksWithSections += 1;
        const cleaned = normalizeSectionTimes(t.section_times, track.duration ?? undefined);
        const dropped = t.section_times.length - cleaned.length;
        if (dropped > 0) {
          sectionStats.tracksCleaned += 1;
          sectionStats.boundariesDropped += dropped;
          console.warn(`  ⚠ section_times "${track.title}": ${t.section_times.length} → ${cleaned.length} (dropped ${dropped} invalid/duplicate/out-of-bounds)`);
        }
        if (cleaned.length) {
          track.section_times = cleaned;
        } else {
          // Nothing survived — let the runtime fallback synthesize the arc.
          sectionStats.tracksEmptied += 1;
          sectionTimesSource = 'fallback';
          console.warn(`  ⚠ section_times "${track.title}": all ${t.section_times.length} boundaries invalid → synthesized arc`);
        }
      } else if (Array.isArray(t.section_times) && t.section_times.length && sectionTimesSource === 'detected') {
        sectionStats.detectedIgnored += 1;
        sectionTimesSource = 'fallback';
      }
      assignIfDefined(track, 'section_times_source', sectionTimesSource);
      if (t.bpm !== undefined) {
        track.bpm = typeof t.bpm === 'number' && Number.isFinite(t.bpm) ? t.bpm : null;
      }
      if (t.beat_start_at !== undefined || t.beatStartAt !== undefined) {
        const beatStartAt = pick(t.beat_start_at, t.beatStartAt);
        track.beat_start_at = typeof beatStartAt === 'number' && Number.isFinite(beatStartAt) ? beatStartAt : null;
      }
      if (t.star_rating !== undefined || t.starRating !== undefined) {
        const starRating = pick(t.star_rating, t.starRating);
        track.star_rating = typeof starRating === 'number' && Number.isFinite(starRating) ? starRating : null;
      }
      assignIfDefined(track, 'visual_config', pick(t.visual_config, t.visualConfig));
      assignIfDefined(track, 'visual_sequence', pick(t.visual_sequence, t.visualSequence));
      assignIfDefined(track, 'technique_sequence', pick(t.technique_sequence, t.techniqueSequence));
      assignIfDefined(track, 'visual_steps', pick(t.visual_steps, t.visualSteps));
      assignIfDefined(track, 'technique_steps', pick(t.technique_steps, t.techniqueSteps));
      assignIfDefined(track, 'fallback_recipe_id', pick(t.fallback_recipe_id, t.fallbackRecipeId));
      assignIfDefined(track, 'recipe_id', pick(t.recipe_id, t.recipeId));
      assignIfDefined(track, 'visualizer', t.visualizer);
      assignIfDefined(track, 'debug_label', pick(t.debug_label, t.debugLabel));
      applyPersistedVisualFields(track, existingTrackMap.get(normalizeLookupKey(track.title)));

      return track;
    });

    // Skip .heic artwork (not browser-displayable)
    const rawArtwork = pick(a.artwork_url, a.artworkUrl);
    const artworkUrl = rawArtwork && !rawArtwork.endsWith('.heic') ? rawArtwork : null;

    const name = (a.name || '').trim();

    const album = {
      name,
      active: pick(a.active, a.isActive) ?? true,
      artist: pick(a.artist_name, a.artist) || null,
      date: pick(a.release_date, a.date) || null,
      status: a.status,
      artworkUrl,
      blurb: pick(a.blurb, a.description) || null,
      bandcampUrl: pick(a.bandcamp_url, a.bandcampUrl) || null,
      appleMusicUrl: pick(a.apple_music_url, a.appleMusicUrl) || null,
      trackCount: pick(a.track_count, a.trackCount) || tracks.length,
      totalDuration: pick(a.total_duration_formatted, a.totalDuration) || null,
      tracks,
    };

    assignIfDefined(album, 'base_color', a.base_color);
    assignIfDefined(album, 'visual_config', pick(a.visual_config, a.visualConfig));
    assignIfDefined(album, 'visual_sequence', pick(a.visual_sequence, a.visualSequence));
    assignIfDefined(album, 'technique_sequence', pick(a.technique_sequence, a.techniqueSequence));
    assignIfDefined(album, 'visual_steps', pick(a.visual_steps, a.visualSteps));
    assignIfDefined(album, 'technique_steps', pick(a.technique_steps, a.techniqueSteps));
    assignIfDefined(album, 'fallback_recipe_id', pick(a.fallback_recipe_id, a.fallbackRecipeId));
    assignIfDefined(album, 'recipe_id', pick(a.recipe_id, a.recipeId));
    assignIfDefined(album, 'visualizer', a.visualizer);
    assignIfDefined(album, 'debug_label', pick(a.debug_label, a.debugLabel));
    applyPersistedVisualFields(album, existingAlbum, { includeBaseColor: true });

    return album;
  });

  failOnTrackAudioIssues(albums, 'Remote showcase status');

  if (SHOULD_VALIDATE_TRACK_URLS) {
    console.log('Validating track URLs...');
    let broken = 0;
    let skippedValidation = 0;
    for (const album of albums) {
      const checks = album.tracks.map(async (track) => {
        if (!track.src) return;
        const ok = await checkUrl(track.src);
        if (ok === false) {
          broken++;
          console.warn(`  [404] "${track.title}" in "${album.name}" — ${track.src}`);
          track.source_url = track.src;
          track.src = null;
          track.audio_status = 'broken';
          track.audio_error = `"${track.title}" in "${album.name}" URL returned 404`;
          return;
        }

        if (ok === null) {
          skippedValidation++;
        }
      });
      await Promise.all(checks);
    }
    if (broken > 0) console.warn(`${broken} track(s) have broken URLs and were marked unavailable.`);
    else console.log('All track URLs valid.');
    if (skippedValidation > 0) console.warn(`Skipped validation for ${skippedValidation} track URL(s) due to network restrictions.`);
  } else {
    console.log('Skipping track URL validation on Cloudflare Pages.');
  }

  failOnTrackAudioIssues(albums, 'Post-fetch showcase status');

  const totalTracks = albums.reduce((sum, a) => sum + a.tracks.length, 0);
  const outputAlbums = albums.map((album) => ({
    ...album,
    tracks: (album.tracks ?? []).map(({ sourceTrack, ...track }) => track),
  }));

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify({ albums: outputAlbums }, null, 2));
  console.log(`Wrote ${albums.length} albums, ${totalTracks} tracks to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error('fetch-tracks failed:', err.message);
  process.exit(1);
});
