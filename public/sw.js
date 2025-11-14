const CACHE_NAME = 'jsonbro-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/icon.svg',
  // Add other important assets here
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
