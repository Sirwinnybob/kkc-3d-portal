// Minimal Service Worker for PWA compliance
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // Pass-through (no caching for now to keep things simple)
  event.respondWith(fetch(event.request));
});
