interface Env {
  DB: D1Database;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
};

const MAX_BODY_BYTES = 4096;

interface PageViewEvent {
  type: 'page_view';
  path: string;
  referrer?: string;
}

interface TrackPlayEvent {
  type: 'track_play';
  trackId: number;
  trackTitle: string;
  albumName: string;
  duration?: number;
}

type AnalyticsEvent = PageViewEvent | TrackPlayEvent;

interface CfRequest extends Request {
  cf?: {
    country?: string;
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function truncate(s: string | undefined, max: number): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

async function readAnalyticsEvent(request: Request): Promise<AnalyticsEvent | null> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    throw new RangeError('Request body too large');
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    throw new RangeError('Request body too large');
  }
  if (!rawBody.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as AnalyticsEvent;
  } catch {
    return null;
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    if (!context.env.DB) {
      return jsonResponse({ error: 'Database unavailable' }, 503);
    }

    const body = await readAnalyticsEvent(context.request);

    if (!body || !body.type) {
      return jsonResponse({ error: 'Invalid event payload' }, 400);
    }

    const ua = truncate(context.request.headers.get('user-agent') ?? undefined, 512);
    const country = (context.request as CfRequest).cf?.country ?? null;

    if (body.type === 'page_view') {
      const path = truncate(body.path, 256);
      if (!path) {
        return jsonResponse({ error: 'Missing path' }, 400);
      }

      await context.env.DB.prepare(
        'INSERT INTO page_views (path, referrer, user_agent, country) VALUES (?, ?, ?, ?)'
      )
        .bind(
          path,
          truncate(body.referrer, 512),
          ua,
          truncate(country ?? undefined, 8),
        )
        .run();

      return jsonResponse({ ok: true });
    }

    if (body.type === 'track_play') {
      const trackTitle = truncate(body.trackTitle, 256);
      const albumName = truncate(body.albumName, 256);
      const duration = body.duration;

      if (!Number.isInteger(body.trackId) || body.trackId < 0 || !trackTitle || !albumName) {
        return jsonResponse({ error: 'Invalid track fields' }, 400);
      }
      if (duration !== undefined && duration !== null && (!isFiniteNumber(duration) || duration < 0)) {
        return jsonResponse({ error: 'Invalid duration' }, 400);
      }

      await context.env.DB.prepare(
        'INSERT INTO track_plays (track_id, track_title, album_name, duration_seconds) VALUES (?, ?, ?, ?)'
      )
        .bind(
          body.trackId,
          trackTitle,
          albumName,
          duration ?? null,
        )
        .run();

      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Unknown event type' }, 400);
  } catch (e) {
    if (e instanceof RangeError) {
      return jsonResponse({ error: e.message }, 413);
    }
    return jsonResponse({ error: 'Internal error' }, 500);
  }
};

export const onRequestGet: PagesFunction = async () => {
  return jsonResponse({ error: 'Method not allowed' }, 405);
};

export const onRequestPut: PagesFunction = async () => {
  return jsonResponse({ error: 'Method not allowed' }, 405);
};

export const onRequestDelete: PagesFunction = async () => {
  return jsonResponse({ error: 'Method not allowed' }, 405);
};

export const onRequestPatch: PagesFunction = async () => {
  return jsonResponse({ error: 'Method not allowed' }, 405);
};

export const onRequestHead: PagesFunction = async () => {
  return new Response(null, {
    status: 405,
    headers: JSON_HEADERS,
  });
};

// Handle CORS preflight
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
};
