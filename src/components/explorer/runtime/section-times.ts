/* ── Section-Time Normalizer ─────────────────────────────────
   Single source of truth for cleaning authored/detected song
   `section_times` before anything consumes them. Section boundaries
   drive the whole visual arc (storyboard roles, cues, transitions),
   and downstream code — getSectionIndex(), padSectionTimes() — assumes
   a sorted, in-bounds, deduplicated list. Detected data (and a large
   incoming dataset) can be unsorted, contain non-finite/≤0 values,
   sub-second jitter duplicates, edge markers at file start/end, or
   boundaries past the track end, so
   normalize once here and reuse everywhere (ingestion mirrors this in
   scripts/fetch-tracks.mjs).
──────────────────────────────────────────────────────────────── */

/** Collapse boundaries closer than this (seconds) — detection jitter, not real sections. */
const MIN_SECTION_GAP_SECONDS = 0.75;
/** Drop detector edge markers that only describe file start/end, not song sections. */
const MIN_EDGE_SECTION_SECONDS = 8;
/** A single remaining boundary must create two meaningful regions. */
const MIN_SINGLE_SECTION_REGION_SECONDS = 15;

/**
 * Clean a raw section-time list into a sorted, positive, in-bounds, de-jittered
 * array. Pure and allocation-light. Returns a new array (possibly empty — the
 * caller's fallback synthesizer, e.g. padSectionTimes, then takes over).
 *
 * @param sectionTimes raw boundaries in seconds (any order, any noise)
 * @param trackDuration optional finite track length in seconds; boundaries near
 *        either track edge are dropped when provided
 */
export function normalizeSectionTimes(
  sectionTimes: readonly number[] | null | undefined,
  trackDuration?: number | null,
): number[] {
  if (!Array.isArray(sectionTimes) || sectionTimes.length === 0) return [];

  const hasDuration = typeof trackDuration === 'number' && isFinite(trackDuration) && trackDuration > 0;
  const minTime = hasDuration ? MIN_EDGE_SECTION_SECONDS : 0;
  const maxTime = hasDuration ? Math.max(minTime, (trackDuration as number) - MIN_EDGE_SECTION_SECONDS) : Infinity;

  const sorted = sectionTimes
    .filter((time) => typeof time === 'number' && isFinite(time) && time > minTime && time <= maxTime)
    .sort((a, b) => a - b);

  // De-jitter: keep a boundary only if it is at least MIN_SECTION_GAP_SECONDS
  // past the previously kept one (also removes exact duplicates).
  const cleaned: number[] = [];
  for (const time of sorted) {
    const last = cleaned[cleaned.length - 1];
    if (last === undefined || time - last >= MIN_SECTION_GAP_SECONDS) cleaned.push(time);
  }

  if (hasDuration && cleaned.length === 1) {
    const only = cleaned[0] ?? 0;
    if (
      only < MIN_SINGLE_SECTION_REGION_SECONDS
      || (trackDuration as number) - only < MIN_SINGLE_SECTION_REGION_SECONDS
    ) {
      return [];
    }
  }

  return cleaned;
}
