const CACHE_NAME = 'productions-v6';

const SHOWCASE_PATH = '/data/showcase.json';

const PRECACHE_URLS = [
  '/',
  '/fonts/space-grotesk.woff2',
  '/fonts/outfit.woff2',
  '/q5.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') return;

  const url = new URL(event.request.url);

  // Never intercept audio requests — they use range headers that SWs can break
  if (url.pathname.match(/\.(mp3|wav|ogg|flac|m4a|aac)$/)) return;

  // Network-first for app navigations so installed PWAs receive the latest shell.
  if (url.origin === self.location.origin && (event.request.mode === 'navigate' || event.request.destination === 'document')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Network-first for showcase data so it stays fresh but works offline
  if (url.origin === self.location.origin && url.pathname === SHOWCASE_PATH) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(SHOWCASE_PATH, clone));
          return response;
        })
        .catch(() => caches.match(SHOWCASE_PATH))
    );
    return;
  }

  // Cache-first for album artwork from external CDN
  if (url.hostname !== self.location.hostname && url.pathname.includes('artwork')) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return response;
          })
      )
    );
    return;
  }

  // Runtime cache for Next.js static assets (JS/CSS chunks) — skip on localhost
  if (url.pathname.startsWith('/_next/static/') && url.hostname !== 'localhost') {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return response;
          })
      )
    );
    return;
  }

  // Pre-cached assets: cache-first, fall back to network
  event.respondWith(
    caches.match(event.request).then(
      (cached) => cached || fetch(event.request).catch(() => cached || Response.error())
    )
  );
});
