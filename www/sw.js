/* HomeTrack service worker — offline cache */
const CACHE = 'hometrack-v1';
const ASSETS = ['./', './index.html', './styles.css', './manifest.json', './icon-512.png',
  './js/core.js', './js/power.js', './js/water.js', './js/budget.js', './js/overview.js',
  './js/settings.js', './js/sms.js', './js/config.js', './js/sync.js', './js/studio.js', './js/notify.js', './js/i18n.js', './js/app.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network-first: always try fresh (so app updates land immediately),
// fall back to cache when offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then((cached) => cached || caches.match('./index.html')))
  );
});
