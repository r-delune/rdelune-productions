/* ── Section-Time Normalizer ─────────────────────────────────
   Single source of truth for cleaning authored/detected song
   `section_times` before anything consumes them. Section boundaries
   drive the whole visual arc (storyboard roles, cues, transitions),
   and downstream code — getSectionIndex(), padSectionTimes() — assumes
   a sorted, in-bounds, deduplicated list. Detected data (and a large
   incoming dataset) can be unsorted, contain non-finite/≤0 values,
   sub-second jitter duplicates, or boundaries past the track end, so
   normalize once here and reuse everywhere (ingestion mirrors this in
   scripts/fetch-tracks.mjs).
──────────────────────────────────────────────────────────────── */

/** Collapse boundaries closer than this (seconds) — detection jitter, not real sections. */
const MIN_SECTION_GAP_SECONDS = 0.75;
/** Drop boundaries within this margin of the track end — a section at/after the end is meaningless. */
const END_EPSILON_SECONDS = 0.25;

/**
 * Clean a raw section-time list into a sorted, positive, in-bounds, de-jittered
 * array. Pure and allocation-light. Returns a new array (possibly empty — the
 * caller's fallback synthesizer, e.g. padSectionTimes, then takes over).
 *
 * @param sectionTimes raw boundaries in seconds (any order, any noise)
 * @param trackDuration optional finite track length in seconds; boundaries at or
 *        past `trackDuration - END_EPSILON_SECONDS` are dropped when provided
 */
export function normalizeSectionTimes(
  sectionTimes: readonly number[] | null | undefined,
  trackDuration?: number | null,
): number[] {
  if (!Array.isArray(sectionTimes) || sectionTimes.length === 0) return [];

  const hasDuration = typeof trackDuration === 'number' && isFinite(trackDuration) && trackDuration > 0;
  const maxTime = hasDuration ? (trackDuration as number) - END_EPSILON_SECONDS : Infinity;

  const sorted = sectionTimes
    .filter((time) => typeof time === 'number' && isFinite(time) && time > 0 && time < maxTime)
    .sort((a, b) => a - b);

  // De-jitter: keep a boundary only if it is at least MIN_SECTION_GAP_SECONDS
  // past the previously kept one (also removes exact duplicates).
  const cleaned: number[] = [];
  for (const time of sorted) {
    const last = cleaned[cleaned.length - 1];
    if (last === undefined || time - last >= MIN_SECTION_GAP_SECONDS) cleaned.push(time);
  }
  return cleaned;
}
