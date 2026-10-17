// Life OS server — zero dependencies. Serves the PWA, keeps an optional backup
// copy of your data on this computer, and bridges the coach and weekly notes to
// Agent OS. The app itself is local-first and also works fully without it.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8')).version;
const MAX_BODY_BYTES = 5_000_000;
const KEEP_BACKUPS = 10;

export function loadConfig(env = process.env) {
  return {
    host: env.LIFE_OS_HOST || '127.0.0.1',
    port: Number(env.LIFE_OS_PORT || 3020),
    token: env.LIFE_OS_TOKEN || '',
    dataDir: path.resolve(env.LIFE_OS_DATA_DIR || path.join(HERE, 'data')),
    publicDir: path.join(HERE, 'public'),
    agentOsUrl: String(env.AGENT_OS_URL || 'http://127.0.0.1:3001').replace(/\/+$/, ''),
    agentOsToken: env.AGENT_OS_TOKEN || '',
    agentId: env.LIFE_OS_AGENT_ID || '',
    coachEnabled: env.LIFE_OS_COACH !== 'off',
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self' http: https:",
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
};

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

function json(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  send(res, status, payload, { 'content-type': 'application/json; charset=utf-8', 'content-length': payload.length, 'cache-control': 'no-store' });
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw httpError(413, 'request body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError(400, 'invalid JSON');
  }
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function rotateBackups(dir) {
  const files = fs.readdirSync(dir).filter((f) => /^backup-\d+\.json$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) fs.rmSync(path.join(dir, f), { force: true });
}

async function callAgentOs(config, route, payload, timeoutMs = 180_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.agentOsUrl}${route}`, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: {
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
        ...(config.agentOsToken ? { 'x-agentos-token': config.agentOsToken } : {}),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text.slice(0, 300) }; }
    if (!res.ok) throw httpError(502, `Agent OS ${res.status}: ${body.error || 'request failed'}`);
    return body;
  } catch (err) {
    if (err.status) throw err;
    throw httpError(502, `Agent OS unreachable at ${config.agentOsUrl} (${err.name === 'AbortError' ? 'timeout' : err.message})`);
  } finally {
    clearTimeout(timer);
  }
}

async function handleApi(req, res, url, config) {
  const route = `${req.method} ${url.pathname}`;
  if (route === 'GET /api/health') {
    return json(res, 200, { ok: true, app: 'life-os', version: VERSION, tokenRequired: Boolean(config.token), coach: config.coachEnabled });
  }
  if (config.token && !safeEqual(req.headers['x-life-os-token'] || '', config.token)) {
    throw httpError(401, 'unauthorized');
  }
  const backupFile = path.join(config.dataDir, 'backup.json');
  switch (route) {
    case 'GET /api/backup': {
      if (!fs.existsSync(backupFile)) throw httpError(404, 'no backup yet');
      return json(res, 200, JSON.parse(fs.readFileSync(backupFile, 'utf8')));
    }
    case 'PUT /api/backup': {
      const body = await readJson(req);
      const state = body && body.state;
      if (!state || typeof state !== 'object' || typeof state.days !== 'object' || typeof state.settings !== 'object') {
        throw httpError(400, 'body must be { state } with a Life OS state');
      }
      const savedAt = new Date().toISOString();
      const text = JSON.stringify({ app: 'life-os', savedAt, state });
      writeAtomic(backupFile, text);
      const histDir = path.join(config.dataDir, 'backups');
      writeAtomic(path.join(histDir, `backup-${Date.now()}.json`), text);
      rotateBackups(histDir);
      return json(res, 200, { ok: true, savedAt });
    }
    case 'GET /api/coach/status': {
      if (!config.coachEnabled) return json(res, 200, { ok: false, error: 'coach disabled on this server' });
      try {
        await callAgentOs(config, '/api/health', undefined, 5000);
        return json(res, 200, { ok: true, agentOsUrl: config.agentOsUrl });
      } catch (err) {
        return json(res, 200, { ok: false, error: err.message });
      }
    }
    case 'POST /api/coach': {
      if (!config.coachEnabled) throw httpError(404, 'coach disabled on this server');
      const body = await readJson(req);
      const message = String(body.message || '').trim();
      if (!message) throw httpError(400, 'message required');
      if (message.length > 20_000) throw httpError(413, 'message too long');
      const payload = {
        message,
        agentId: config.agentId || String(body.agentId || 'free-claude-code'),
        useMemory: false,
        agentic: false,
      };
      if (body.conversationId) payload.conversationId = String(body.conversationId);
      const reply = await callAgentOs(config, '/api/chat', payload);
      return json(res, 200, { reply: String(reply.reply || ''), conversationId: reply.conversationId || null, model: reply.model || '', agentId: reply.agentId || payload.agentId });
    }
    case 'POST /api/vault': {
      if (!config.coachEnabled) throw httpError(404, 'Agent OS bridge disabled on this server');
      const body = await readJson(req);
      const name = String(body.name || '');
      if (!/^[\w-]{1,40}$/.test(name)) throw httpError(400, 'invalid note name');
      const content = String(body.content || '');
      if (!content.trim() || content.length > 200_000) throw httpError(400, 'content required (max 200 kB)');
      await callAgentOs(config, '/api/memory/note', { path: `Life OS/${name}.md`, content }, 15_000);
      return json(res, 200, { ok: true, path: `Life OS/${name}.md` });
    }
    default:
      throw httpError(404, 'not found');
  }
}

function serveStatic(res, pathname, config) {
  let requested;
  try {
    requested = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  } catch {
    throw httpError(400, 'bad path');
  }
  if (requested.includes('\0')) throw httpError(400, 'bad path');
  const file = path.resolve(config.publicDir, `.${path.posix.normalize(requested)}`);
  if (!file.startsWith(config.publicDir + path.sep)) throw httpError(403, 'forbidden');
  let target = file;
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    if (path.extname(requested)) throw httpError(404, 'not found');
    target = path.join(config.publicDir, 'index.html');
  }
  const data = fs.readFileSync(target);
  const base = path.basename(target);
  const noCache = base === 'index.html' || base === 'sw.js' || base.endsWith('.webmanifest');
  send(res, 200, data, {
    'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
    'content-length': data.length,
    'cache-control': noCache ? 'no-cache' : 'public, max-age=300',
  });
}

export function createLifeOsServer(config = loadConfig()) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url, config);
      if (req.method !== 'GET' && req.method !== 'HEAD') throw httpError(405, 'method not allowed');
      return serveStatic(res, url.pathname, config);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500 && status !== 502) console.error(err);
      if (!res.headersSent) json(res, status, { error: status === 500 ? 'internal error' : err.message });
    }
  });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const config = loadConfig();
  if (config.host !== '127.0.0.1' && config.host !== 'localhost' && !config.token) {
    console.warn('⚠️  Life OS listens beyond localhost without LIFE_OS_TOKEN. Set a long random token to protect backups and the coach bridge.');
  }
  createLifeOsServer(config).listen(config.port, config.host, () => {
    console.log(`Life OS ${VERSION} → http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
    console.log(`Coach bridge → ${config.coachEnabled ? config.agentOsUrl : 'off'} · data → ${config.dataDir}`);
  });
}
