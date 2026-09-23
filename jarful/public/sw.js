// Offline shell + last-known API data so saved recipes open without signal.
const SHELL = 'jarful-shell-v2';
const DATA = 'jarful-data-v1';
const ASSETS = ['/', '/index.html', '/app.js', '/config.js', '/styles.css', '/icon.svg', '/manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => ![SHELL, DATA].includes(k)).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/export') return;
    e.respondWith(fetch(e.request).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(DATA).then((c) => c.put(e.request, copy)); } return res; })
      .catch(() => caches.open(DATA).then((c) => c.match(e.request)).then((r) => r || new Response(JSON.stringify({ error: 'You are offline.' }), { status: 503, headers: { 'content-type': 'application/json' } }))));
    return;
  }
  e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); return res; }).catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html'))));
});
