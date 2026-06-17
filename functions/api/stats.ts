interface Env {
  DB: D1Database;
  STATS_TOKEN: string;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
};

const MAX_DAYS = 365;
const RESET_HEADER = 'x-confirm-reset';

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function readBearerToken(request: Request): string | null {
  const auth = request.headers.get('Authorization') ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function parseDays(value: string | null): number {
  if (!value) return 0;

  const days = Number(value);
  if (!Number.isInteger(days) || days < 0 || days > MAX_DAYS) {
    throw new RangeError(`days must be an integer between 0 and ${MAX_DAYS}`);
  }

  return days;
}

function buildDateFilter(days: number): { clause: string; bindValues: string[] } {
  if (days <= 0) {
    return { clause: '', bindValues: [] };
  }

  return {
    clause: "WHERE created_at >= datetime('now', ?)",
    bindValues: [`-${days} days`],
  };
}

function prepareStatsQuery(db: D1Database, sql: string, bindValues: string[]): D1PreparedStatement {
  const statement = db.prepare(sql);
  return bindValues.length > 0 ? statement.bind(...bindValues) : statement;
}

async function authorize(context: { request: Request; env: Env }): Promise<Response | null> {
  const token = readBearerToken(context.request);
  if (!context.env.STATS_TOKEN || !token || token !== context.env.STATS_TOKEN) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (!context.env.DB) {
    return jsonResponse({ error: 'Database unavailable' }, 503);
  }

  return null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const unauthorized = await authorize(context);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const url = new URL(context.request.url);
    const type = url.searchParams.get('type');
    const days = parseDays(url.searchParams.get('days'));

    if (url.searchParams.has('reset')) {
      return jsonResponse({ error: `Use POST with ${RESET_HEADER}: true to reset stats` }, 405);
    }

    const filter = buildDateFilter(days);

    if (type === 'plays') {
      const { results } = await prepareStatsQuery(context.env.DB, `
        SELECT track_id, track_title, album_name, COUNT(*) as play_count,
               MAX(created_at) as last_played
        FROM track_plays ${filter.clause}
        GROUP BY track_id, track_title, album_name
        ORDER BY play_count DESC
      `, filter.bindValues).all();

      return jsonResponse({ plays: results });
    }

    if (type === 'views') {
      const { results } = await prepareStatsQuery(context.env.DB, `
        SELECT path, COUNT(*) as view_count,
               MAX(created_at) as last_viewed
        FROM page_views ${filter.clause}
        GROUP BY path
        ORDER BY view_count DESC
      `, filter.bindValues).all();

      return jsonResponse({ views: results });
    }

    if (type && type !== 'summary') {
      return jsonResponse({ error: 'Unknown stats type' }, 400);
    }

    const totalViews = await prepareStatsQuery(
      context.env.DB,
      `SELECT COUNT(*) as count FROM page_views ${filter.clause}`,
      filter.bindValues,
    ).first<{ count: number }>();

    const totalPlays = await prepareStatsQuery(
      context.env.DB,
      `SELECT COUNT(*) as count FROM track_plays ${filter.clause}`,
      filter.bindValues,
    ).first<{ count: number }>();

    const topTracks = await prepareStatsQuery(context.env.DB, `
      SELECT track_id, track_title, album_name, COUNT(*) as play_count
      FROM track_plays ${filter.clause}
      GROUP BY track_id, track_title, album_name
      ORDER BY play_count DESC
      LIMIT 10
    `, filter.bindValues).all();

    const topPages = await prepareStatsQuery(context.env.DB, `
      SELECT path, COUNT(*) as view_count
      FROM page_views ${filter.clause}
      GROUP BY path
      ORDER BY view_count DESC
      LIMIT 10
    `, filter.bindValues).all();

    return jsonResponse({
      total_page_views: totalViews?.count ?? 0,
      total_track_plays: totalPlays?.count ?? 0,
      top_tracks: topTracks.results,
      top_pages: topPages.results,
      ...(days > 0 ? { period_days: days } : {}),
    });
  } catch (e) {
    if (e instanceof RangeError) {
      return jsonResponse({ error: e.message }, 400);
    }

    return jsonResponse({ error: 'Internal error' }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const unauthorized = await authorize(context);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const url = new URL(context.request.url);
    const reset = url.searchParams.get('reset');
    const confirmed = context.request.headers.get(RESET_HEADER)?.toLowerCase() === 'true';

    if (reset !== 'plays' && reset !== 'views' && reset !== 'all') {
      return jsonResponse({ error: 'reset must be plays, views, or all' }, 400);
    }

    if (!confirmed) {
      return jsonResponse({ error: `Reset requires ${RESET_HEADER}: true` }, 400);
    }

    if (reset === 'plays' || reset === 'all') {
      await context.env.DB.prepare('DELETE FROM track_plays').run();
    }
    if (reset === 'views' || reset === 'all') {
      await context.env.DB.prepare('DELETE FROM page_views').run();
    }

    return jsonResponse({ ok: true, reset });
  } catch {
    return jsonResponse({ error: 'Internal error' }, 500);
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': `Authorization, Content-Type, ${RESET_HEADER}`,
      'Access-Control-Max-Age': '86400',
    },
  });
};
