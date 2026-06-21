const CACHE_VERSION = 'v1.4.9-wallet-rpc';
const CACHE_NAME = `shashki-royale-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/icon/icon-192.png',
  '/icon/icon-512.png',
  '/icon/icon-maskable-192.png',
  '/icon/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 1) Drop ALL old caches (anything that isn't current CACHE_NAME)
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((name) => (name !== CACHE_NAME ? caches.delete(name) : null)),
      );
      // 2) Take control of every open tab immediately
      await self.clients.claim();
      // 3) Tell every open client to reload itself so it picks up the fresh bundle
      const all = await self.clients.matchAll({ type: 'window' });
      for (const client of all) {
        try {
          client.navigate(client.url);
        } catch {
          /* ignore */
        }
      }
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Skip auth flow — never intercept
  try {
    const url = new URL(event.request.url);
    if (url.pathname.startsWith('/auth')) return;
    // Skip Supabase / external API calls — always go network
    if (
      url.hostname.includes('supabase.co') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('gstatic.com') ||
      url.hostname.includes('hercules.app') ||
      url.hostname.includes('convex.cloud')
    ) {
      return;
    }
  } catch {
    return;
  }

  // Navigation: network-first, fallback to cached index
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/index.html').then((r) => r ?? fetch(event.request)),
      ),
    );
    return;
  }

  // Static assets: cache-first, update in background
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
      return cached ?? networkFetch;
    }),
  );
});
