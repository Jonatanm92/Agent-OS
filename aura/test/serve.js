/* Local server for Aura. Wraps index.html in the same skeleton the Artifact
 * platform adds at publish time, so tests run the page exactly as published.
 *   node test/serve.js [port]   → http://127.0.0.1:<port>/ */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

function wrap(body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0;font:14px system-ui,sans-serif;background:#fafafa}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>${body}</body></html>`;
}

function serve(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
      const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      const ext = path.extname(file);
      res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(ext === '.html' ? wrap(fs.readFileSync(file, 'utf8')) : fs.readFileSync(file));
    });
    server.listen(port || 0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

if (require.main === module) {
  serve(Number(process.argv[2]) || 4173).then(({ port }) => console.log(`Aura on http://127.0.0.1:${port}/`));
}

module.exports = { serve, wrap, ROOT };
