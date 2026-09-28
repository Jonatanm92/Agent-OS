/* Local server for Aura — the same files, headers and clean URLs as the
 * Vercel deployment, so tests run the page under the live Content Security
 * Policy.
 *   node test/serve.js [port]   → http://127.0.0.1:<port>/
 *
 * /api/* is the Vercel function's territory (Gemini for Klara and Liv).
 * Locally it answers 503, so the app shows its honest local fallback; it
 * never pretends to be the AI. End-to-end tests stub it per test instead. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.woff2': 'font/woff2',
};

/* Copied from the live deployment's response headers (aura-josefin-demo.vercel.app). */
const LIVE_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; media-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

/* What deploys: everything the page loads. Tests, docs and the earlier
   claude.ai build are not served. */
const PRIVATE = [/^\/test\//, /^\/app\//, /^\/node_modules\//, /^\/README\.md$/, /^\/package\.json$/, /^\/\./];

function resolve(urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  if (rel === '/') rel = '/index.html';
  if (PRIVATE.some((re) => re.test(rel))) return null;
  let file = path.join(ROOT, rel);
  if (!path.extname(file) && fs.existsSync(`${file}.html`)) file = `${file}.html`;
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return null;
  return file;
}

function serve(port) {
  return new Promise((done) => {
    const server = http.createServer((req, res) => {
      if (req.url.startsWith('/api/')) {
        res.writeHead(503, { 'Content-Type': 'application/json', ...LIVE_HEADERS });
        res.end(JSON.stringify({ error: 'ai_unavailable' }));
        return;
      }
      const file = resolve(req.url);
      if (!file) { res.writeHead(404, LIVE_HEADERS); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', ...LIVE_HEADERS });
      res.end(fs.readFileSync(file));
    });
    server.listen(port || 0, '127.0.0.1', () => done({ server, port: server.address().port }));
  });
}

if (require.main === module) {
  serve(Number(process.argv[2]) || 4173).then(({ port }) => console.log(`Aura on http://127.0.0.1:${port}/`));
}

module.exports = { serve, ROOT, LIVE_HEADERS };
