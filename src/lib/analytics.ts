/* ── Client-Side Analytics ──────────────────────────────────
   Fire-and-forget tracking. Never blocks UI.
──────────────────────────────────────────────────────────────── */

const API_URL = '/api/event';

let lastPageView = '';
let lastPageViewTime = 0;

function shouldSendAnalytics() {
  if (typeof window === 'undefined') return false;
  if (process.env.NODE_ENV !== 'production') return false;

  const { hostname, protocol } = window.location;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const isFileProtocol = protocol === 'file:';

  return !isLocalhost && !isFileProtocol;
}

function send(payload: Record<string, unknown>) {
  if (!shouldSendAnalytics()) return;

  try {
    const body = JSON.stringify(payload);
    // Prefer sendBeacon for reliability during page unload
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(API_URL, body);
    } else {
      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => { /* silent */ });
    }
  } catch {
    // Never throw from analytics
  }
}

/** Track a page view. Debounced: same path within 5s is ignored. */
export function trackPageView(path: string) {
  const now = Date.now();
  if (path === lastPageView && now - lastPageViewTime < 5000) return;
  lastPageView = path;
  lastPageViewTime = now;

  send({
    type: 'page_view',
    path,
    referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
  });
}

/** Track a track play start. */
export function trackPlay(
  trackId: number,
  trackTitle: string,
  albumName: string,
  duration?: number | null,
) {
  send({
    type: 'track_play',
    trackId,
    trackTitle,
    albumName,
    duration: duration ?? undefined,
  });
}
