const CACHE = "aura-v35-enchanted-worlds-r1";
const TAROT_CORE = Array.from({ length: 22 }, (_, index) => `/assets/tarot/major-${String(index).padStart(2, "0")}-card.jpg`);
const CORE = [
  "/",
  "/index.html",
  "/install.html",
  "/install.css?v=2",
  "/install.js?v=1",
  "/styles.css?v=35",
  "/app.js?v=35",
  "/logic.js?v=31",
  "/storage.js?v=33",
  "/mystic-data.js?v=15",
  "/audio-scapes.js?v=33",
  "/care-tools.js?v=27.5",
  "/wellness-data.js?v=30.1",
  "/tarot-data.js?v=15",
  "/insights-engine.js?v=33",
  "/client-safety.js?v=15",
  "/coach-transcript.js?v=15",
  "/manifest.webmanifest",
  "/icon.svg",
  "/assets/app-icon-180.png",
  "/assets/app-icon-192.png",
  "/assets/app-icon-512.png",
  "/assets/forest-companions-mobile-deploy.jpg",
  "/assets/worlds/today-enchanted-v35.webp",
  "/assets/worlds/coach-enchanted-v35.webp",
  "/assets/worlds/cycle-enchanted-v35.webp",
  "/assets/worlds/insights-enchanted-v35.webp",
  "/assets/worlds/mystic-enchanted-v35.webp",
  "/assets/worlds/mystic-ui-veil.webp",
  "/assets/worlds/fireflies-overlay.webp",
  "/assets/companions/klara-coach.webp",
  "/assets/companions/klara-cycle-v11.webp",
  "/assets/companions/astrid-mystic.webp",
  "/assets/companions/astrid-mystic-motion.webp",
  "/assets/companions/maja-journal.webp",
  "/assets/audio/forest-birds-deploy.ogg",
  "/assets/audio/gentle-rain-deploy.ogg",
  "/assets/fonts/newsreader-latin.woff2",
  "/assets/fonts/nunito-sans-latin.woff2",
  "/assets/icons/home.svg",
  "/assets/icons/heart.svg",
  "/assets/icons/half-moon.svg",
  "/assets/icons/sparks.svg",
  "/assets/icons/stats-up-square.svg",
  "/assets/icons/sound-high.svg",
  "/assets/icons/sound-off.svg",
  "/assets/icons/settings.svg",
  "/assets/icons/nav-arrow-right.svg",
  "/assets/icons/xmark.svg",
  "/assets/icons/check-circle.svg",
  "/assets/icons/journal-page.svg",
  "/assets/icons/calendar.svg",
  ...TAROT_CORE
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    const url = new URL(event.request.url);
    const installRoute = url.pathname === "/install" || url.pathname === "/install.html";
    const fallbackPath = installRoute ? "/install.html" : "/index.html";
    event.respondWith(fetch(event.request).then((response) => {
      if (!response.ok) return response;
      return caches.open(CACHE).then((cache) => cache.put(fallbackPath, response.clone())).then(() => response);
    }).catch(() => caches.match(fallbackPath).then((cached) => cached || caches.match("/index.html"))));
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => {
    const fresh = fetch(event.request).then((response) => {
      if (!response.ok) return response;
      return caches.open(CACHE).then((cache) => cache.put(event.request, response.clone())).then(() => response);
    });
    if (cached) {
      event.waitUntil(fresh.catch(() => {}));
      return cached;
    }
    return fresh.catch(() => Response.error());
  }));
});
