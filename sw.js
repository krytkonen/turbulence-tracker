// ════════════════════════════════════════════════════════════════
// PIREPlog — Service Worker
// Makes the app installable and usable offline / in-flight without a-Shell.
//
//  • App shell (HTML, Leaflet, icons, manifest) is pre-cached on install,
//    so the whole UI works with no connection at all.
//  • Map tiles and web-fonts are cached at runtime as they are fetched,
//    so any area viewed while online stays available offline.
// ════════════════════════════════════════════════════════════════

const VERSION    = 'v1';
const SHELL_CACHE = `pireplog-shell-${VERSION}`;
const TILE_CACHE  = `pireplog-tiles-${VERSION}`;
const FONT_CACHE  = `pireplog-fonts-${VERSION}`;
// Deliberately UN-versioned: tiles the pilot explicitly saved for a route
// must survive app updates and are never evicted by the runtime tile trim.
const PRELOAD_CACHE = 'pireplog-preload';

// Same-origin assets that make up the installable app shell.
// Relative to the SW scope so it works on any GitHub Pages path.
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './vendor/leaflet.css',
  './vendor/leaflet.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

// Cross-origin hosts we cache at runtime.
const TILE_HOSTS = [
  'basemaps.cartocdn.com',
  'server.arcgisonline.com',
  'tile.opentopomap.org',
];
const FONT_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// Cap the tile cache so months of flying don't fill the device.
const TILE_MAX_ENTRIES = 1500;

// ── INSTALL ── pre-cache the shell ───────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ── drop caches from previous versions ───────────────
self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, TILE_CACHE, FONT_CACHE, PRELOAD_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('pireplog-') && !keep.has(k))
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Messages from the page:
//   'SKIP_WAITING'                      → activate a freshly installed SW now
//   { type:'PRELOAD_TILES', urls:[…] }  → fetch + store a route's tiles offline
self.addEventListener('message', (event) => {
  const data = event.data;
  if (data === 'SKIP_WAITING') { self.skipWaiting(); return; }
  if (data && data.type === 'PRELOAD_TILES' && Array.isArray(data.urls)) {
    event.waitUntil(preloadTiles(data.urls, event.source));
  }
});

// Fetch every tile URL (in bounded batches) into the un-evicted preload
// cache, reporting progress back to the requesting page. SW-initiated
// fetches bypass this SW's own fetch handler, so nothing is double-cached.
async function preloadTiles(urls, client) {
  const cache = await caches.open(PRELOAD_CACHE);
  const total = urls.length;
  let done = 0, failed = 0, saved = 0;
  const BATCH = 6;

  const post = (type) => client && client.postMessage({ type, done, total, failed, saved });

  for (let i = 0; i < urls.length; i += BATCH) {
    const slice = urls.slice(i, i + BATCH);
    await Promise.all(slice.map(async (url) => {
      try {
        // Serve from cache if we already have it, else fetch cross-origin no-cors.
        const existing = await cache.match(url);
        if (existing) { saved++; }
        else {
          const res = await fetch(url, { mode: 'no-cors', cache: 'no-store' });
          if (res && (res.ok || res.type === 'opaque')) { await cache.put(url, res); saved++; }
          else { failed++; }
        }
      } catch (e) {
        failed++;
      } finally {
        done++;
      }
    }));
    post('PRELOAD_PROGRESS');
  }
  post('PRELOAD_DONE');
}

// ── FETCH ── routing ─────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  const host = url.hostname;

  if (TILE_HOSTS.some((h) => host.endsWith(h))) {
    event.respondWith(tileStrategy(req));
    return;
  }
  if (FONT_HOSTS.some((h) => host.endsWith(h))) {
    event.respondWith(cacheFirst(req, FONT_CACHE));
    return;
  }

  // Same-origin app shell.
  if (url.origin === self.location.origin) {
    // Navigations always fall back to the cached shell when offline.
    if (req.mode === 'navigate') {
      event.respondWith(
        fetch(req).catch(() =>
          caches.match(req).then((r) => r || caches.match('./index.html'))
        )
      );
      return;
    }
    event.respondWith(cacheFirst(req, SHELL_CACHE));
  }
});

// ── TILE STRATEGY ── prefer explicitly saved route tiles ─────────
// Saved (preloaded) tiles are authoritative and never evicted; otherwise
// fall back to the runtime tile cache, then the network.
async function tileStrategy(req) {
  const preload = await caches.open(PRELOAD_CACHE);
  const saved   = await preload.match(req);
  if (saved) return saved;
  return cacheFirst(req, TILE_CACHE, TILE_MAX_ENTRIES);
}

// ── STRATEGY ── cache-first with background fill + LRU trim ───────
async function cacheFirst(req, cacheName, maxEntries) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;

  try {
    const res = await fetch(req);
    // Cache opaque (cross-origin no-cors) and OK responses; skip errors.
    if (res && (res.ok || res.type === 'opaque')) {
      cache.put(req, res.clone());
      if (maxEntries) trimCache(cacheName, maxEntries);
    }
    return res;
  } catch (err) {
    // Offline and not cached — return whatever we have, else a 504.
    return cached || Response.error();
  }
}

// Simple FIFO/LRU-ish trim: drop oldest entries once over the cap.
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys  = await cache.keys();
  if (keys.length <= maxEntries) return;
  const overflow = keys.length - maxEntries;
  for (let i = 0; i < overflow; i++) await cache.delete(keys[i]);
}
