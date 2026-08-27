// sw.js — caches the app shell (HTML/CSS/JS) so the UI itself loads with
// no signal at a mine/plant site. Module CONTENT caching (the actual AR
// scene JSON) is handled separately in offline.js via localStorage, since
// that data needs an auth token and is refreshed explicitly by the user
// from Settings -> "Download modules for offline use".
const CACHE_NAME = "suraksha-ar-shell-v1";
const SHELL_FILES = [
  "/",
  "/static/css/style.css",
  "/static/js/i18n.js",
  "/static/js/api.js",
  "/static/js/offline.js",
  "/static/js/ar-engine.js",
  "/static/js/app.js",
  "/static/icon-192.png",
  "/static/icon-512.png",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // never cache API calls — those must reflect live/queued state
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => cached);
    })
  );
});
