import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateFixtureBatch, prepareWorkflow } from './workflow.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const publicRoot = path.join(projectRoot, 'public');
const fixturesPath = path.join(projectRoot, 'fixtures', 'inquiries.json');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const maxBodyBytes = 32 * 1024;

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function json(res, status, value) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(value));
}

async function parseJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBodyBytes) throw new Error('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) throw new Error('EMPTY_BODY');
  return JSON.parse(raw);
}

async function serveStatic(urlPath, res) {
  const requested = urlPath === '/' ? '/index.html' : urlPath;
  const decoded = decodeURIComponent(requested);
  const target = path.resolve(publicRoot, `.${decoded}`);
  if (!target.startsWith(`${publicRoot}${path.sep}`)) {
    json(res, 403, { error: 'Forbidden' });
    return;
  }
  try {
    const body = await readFile(target);
    res.writeHead(200, {
      'content-type': contentTypes[path.extname(target)] || 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
    });
    res.end(body);
  } catch {
    json(res, 404, { error: 'Not found' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, { ok: true, mode: 'synthetic-only', externalActions: false });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/demo') {
      const fixtures = JSON.parse(await readFile(fixturesPath, 'utf8'));
      json(res, 200, {
        generatedAt: '2026-08-19T12:00:00.000Z',
        notice: 'Synthetic demonstration. No message is sent and no customer system is changed.',
        cases: evaluateFixtureBatch(fixtures),
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/evaluate') {
      const inquiry = await parseJsonBody(req);
      json(res, 200, prepareWorkflow(inquiry, new Date().toISOString()));
      return;
    }
    if (req.method !== 'GET') {
      json(res, 405, { error: 'Method not allowed' });
      return;
    }
    await serveStatic(url.pathname, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'BODY_TOO_LARGE') {
      json(res, 413, { error: 'Request body exceeds 32 KiB.' });
      return;
    }
    if (message === 'EMPTY_BODY' || error instanceof SyntaxError) {
      json(res, 400, { error: 'A valid JSON inquiry is required.' });
      return;
    }
    json(res, 500, { error: 'Synthetic workflow evaluation failed.' });
  }
});

server.listen(port, host, () => {
  console.log(`Revenue 001 demo: http://${host}:${port}`);
  console.log('Synthetic-only mode. No external actions are available.');
});
