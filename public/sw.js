/* Belote Royale — service worker.
   Precaches the whole app shell so the game (menus, solo vs AI, high scores)
   works with no network at all. Online tables obviously still need one. */
const VERSION = 'v2.1.0';
const CACHE = 'belote-' + VERSION;

const SHELL = [
  '.', 'index.html', 'manifest.webmanifest',
  'css/style.css',
  'js/config.js', 'js/engine.js', 'js/rooms.js', 'js/local.js',
  'js/store.js', 'js/fx.js', 'js/cards.js', 'js/learn.js', 'js/net.js', 'js/game.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
  'icons/icon-180.png', 'icons/icon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // never cache the API or websockets
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;

  // navigations: cache-first on the shell, so a cold offline start works
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('index.html').then((hit) => hit || fetch(req).catch(() => caches.match('.')))
    );
    return;
  }

  // same-origin assets: cache-first, refresh in the background
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // cross-origin (fonts): stale-while-revalidate, fall back to the local stack
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
