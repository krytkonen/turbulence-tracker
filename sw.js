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
  const keep = new Set([SHELL_CACHE, TILE_CACHE, FONT_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('pireplog-') && !keep.has(k))
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Let the page trigger an immediate update after a new SW is installed.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ── FETCH ── routing ─────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  const host = url.hostname;

  if (TILE_HOSTS.some((h) => host.endsWith(h))) {
    event.respondWith(cacheFirst(req, TILE_CACHE, TILE_MAX_ENTRIES));
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
