// Cloudflare Pages Function — markdown content negotiation for AI agents.
//
// - When a client sends `Accept: text/markdown`, serve the page's `.md`
//   companion (e.g. `/about/` -> `/about.md`, `/` -> `/index.md`) as markdown.
// - For normal HTML responses on page routes, advertise the markdown
//   alternate via a `Link` header and `Vary: Accept`.
//
// Static `.md` files live in `out/` (copied from `public/`) and are fetched
// through the Pages static-assets binding (`env.ASSETS`).

const ASSET_PREFIXES = ['/_next/', '/fonts/', '/images/', '/data/', '/.well-known/'];

function isPageRoute(pathname) {
  if (ASSET_PREFIXES.some((p) => pathname.startsWith(p))) return false;
  const lastSegment = pathname.split('/').pop() || '';
  // A dot in the final segment means it's a file (e.g. robots.txt, *.md, og.png).
  return !lastSegment.includes('.');
}

function toMarkdownPath(pathname) {
  if (pathname === '/' || pathname === '') return '/index.md';
  return `${pathname.replace(/\/+$/, '')}.md`;
}

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  if ((request.method !== 'GET' && request.method !== 'HEAD') || !isPageRoute(url.pathname)) {
    return next();
  }

  const accept = request.headers.get('Accept') || '';
  const mdPath = toMarkdownPath(url.pathname);

  // Agent asked for markdown — serve the .md companion if it exists. (GET only;
  // HEAD falls through to the HTML path so we don't return a body for HEAD.)
  if (request.method === 'GET' && accept.includes('text/markdown')) {
    const mdResponse = await env.ASSETS.fetch(new URL(mdPath, url.origin));
    if (mdResponse.ok) {
      const headers = new Headers(mdResponse.headers);
      headers.set('Content-Type', 'text/markdown; charset=utf-8');
      headers.set('Vary', 'Accept');
      headers.set('Link', `<${mdPath}>; rel="canonical"`);
      return new Response(mdResponse.body, { status: 200, headers });
    }
  }

  // Normal HTML response — advertise the markdown alternate.
  const response = await next();
  const headers = new Headers(response.headers);
  headers.append('Link', `<${mdPath}>; rel="alternate"; type="text/markdown"`);
  headers.set('Vary', 'Accept');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
