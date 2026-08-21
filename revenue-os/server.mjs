import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

import { handleApi } from './api.mjs';
import { automationTick, CONFIG, saveState, STATE_PATH } from './runtime.mjs';

const MAX_BODY_BYTES = 1_000_000;

function json(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': payload.length,
    'cache-control': 'no-store',
  });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw httpError(413, 'request body too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw httpError(400, 'invalid JSON'); }
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function authorized(req, pathname) {
  if (!CONFIG.revenueOsToken) return true;
  if (pathname === '/api/health' || pathname === '/api/auth/status' || pathname === '/api/auth/login') return true;
  return safeEqual(req.headers['x-revenue-os-token'] || '', CONFIG.revenueOsToken);
}

function mimeType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  }[ext] || 'application/octet-stream';
}

function serveStatic(pathname, res) {
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const normalized = path.normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
  const file = path.resolve(CONFIG.publicDir, normalized);
  if (!file.startsWith(`${CONFIG.publicDir}${path.sep}`) && file !== path.join(CONFIG.publicDir, 'index.html')) throw httpError(403, 'forbidden');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    const fallback = path.join(CONFIG.publicDir, 'index.html');
    if (path.extname(requested)) throw httpError(404, 'not found');
    const data = fs.readFileSync(fallback);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': data.length, 'cache-control': 'no-store' });
    return res.end(data);
  }
  const data = fs.readFileSync(file);
  res.writeHead(200, {
    'content-type': mimeType(file), 'content-length': data.length,
    'cache-control': file.endsWith('index.html') ? 'no-store' : 'public, max-age=300',
  });
  res.end(data);
}

const helpers = { json, readJson, httpError, safeEqual };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${CONFIG.host}:${CONFIG.port}`}`);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith('/api/')) {
      if (!authorized(req, pathname)) return json(res, 401, { error: 'unauthorized' });
      return await handleApi(req, res, pathname, helpers);
    }
    return serveStatic(pathname, res);
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error('[revenue-os]', error);
    return json(res, status, { error: error instanceof Error ? error.message : String(error) });
  }
});

const scheduler = setInterval(() => {
  automationTick().catch((error) => console.error('[revenue-os automation]', error));
}, Math.max(10_000, CONFIG.automationIntervalMs));
scheduler.unref();

function shutdown(signal) {
  console.log(`\n[revenue-os] ${signal}: saving state and stopping`);
  try { saveState(); } catch (error) { console.error(error); }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  server.listen(CONFIG.port, CONFIG.host, () => {
    console.log('\nRevenue OS v1 — commercial control plane');
    console.log(`Dashboard: http://${CONFIG.host}:${CONFIG.port}`);
    console.log(`Agent OS:  ${CONFIG.agentOsUrl}`);
    console.log(`Data:      ${STATE_PATH}`);
    console.log(`Auth:      ${CONFIG.revenueOsToken ? 'token required' : 'local open mode'}`);
    console.log('Rule:      evidence before code; payment before scale\n');
  });
}

export { server };
