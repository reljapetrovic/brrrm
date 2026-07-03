const CACHE = 'brrrm-v2'; // bump this on every deploy
const PRECACHE = [
  '.', 'index.html', 'manifest.webmanifest',
  'src/main.js', 'src/mapping.js', 'src/sensors.js', 'src/audio.js',
  'src/renderer.js', 'src/world.js',
  'src/vehicles/index.js', 'src/vehicles/tractor.js',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first; anything fetched later (e.g. assets/sfx samples) gets cached too.
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }))
  );
});
