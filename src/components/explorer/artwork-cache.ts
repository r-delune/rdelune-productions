/* ── Artwork Image Pre-loader Cache ──────────────────────────
   Shared module-level cache so album artwork is pre-fetched
   before a datamosh sketch starts, eliminating the 2-3 s
   blank/fallback period caused by async image loading in setup.

   Usage:
     preloadArtworkImage(url)   — call when artwork URL is known
     getCachedArtworkImage(url) — returns loaded element or null
──────────────────────────────────────────────────────────────── */

// null  = fetch in-progress or failed
// Image = successfully loaded
const cache = new Map<string, HTMLImageElement | null>();

export function preloadArtworkImage(url: string): void {
  if (!url || cache.has(url)) return;
  // Mark in-progress immediately so concurrent callers don't double-fetch.
  cache.set(url, null);

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';

  img.onload = () => {
    cache.set(url, img);
  };

  img.onerror = () => {
    // CORS failure — retry without crossOrigin (some CDNs block it).
    const img2 = new Image();
    img2.decoding = 'async';
    img2.onload = () => { cache.set(url, img2); };
    img2.onerror = () => { cache.set(url, null); };
    img2.src = url;
  };

  img.src = url;
}

/**
 * Returns the cached HTMLImageElement if it has finished loading,
 * or null if loading is still in progress or the fetch failed.
 */
export function getCachedArtworkImage(url: string): HTMLImageElement | null {
  const entry = cache.get(url);
  // Map returns undefined when key is absent, null when in-progress/failed.
  return entry ?? null;
}
