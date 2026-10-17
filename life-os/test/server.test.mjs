import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createLifeOsServer, loadConfig } from '../server.mjs';

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function startLifeOs(env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'life-os-test-'));
  const config = { ...loadConfig({}), dataDir, ...env };
  const server = createLifeOsServer(config);
  const base = await listen(server);
  return { base, dataDir, stop: () => close(server) };
}

// A stand-in for Agent OS: /api/health, /api/chat and /api/memory/note.
async function startFakeAgentOs() {
  const seen = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    seen.push({ url: req.url, method: req.method, headers: req.headers, body: body ? JSON.parse(body) : null });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/health') return res.end(JSON.stringify({ ok: true }));
    if (req.url === '/api/chat') return res.end(JSON.stringify({ reply: 'Hej från Agent OS', conversationId: 'c1', model: 'owl-alpha', agentId: 'free-claude-code' }));
    if (req.url === '/api/memory/note') return res.end(JSON.stringify({ note: { path: JSON.parse(body).path } }));
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'nope' }));
  });
  const base = await listen(server);
  return { base, seen, stop: () => close(server) };
}

const sampleState = { schema: 1, days: {}, settings: { theme: 'system' }, kids: [] };

test('serves the app shell with security headers and an SPA fallback', async () => {
  const app = await startLifeOs();
  try {
    const health = await (await fetch(`${app.base}/api/health`)).json();
    assert.equal(health.app, 'life-os');
    assert.equal(health.tokenRequired, false);

    const index = await fetch(`${app.base}/`);
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-type'), /text\/html/);
    assert.match(index.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(await index.text(), /<title>Life OS<\/title>/);

    const js = await fetch(`${app.base}/js/core.js`);
    assert.match(js.headers.get('content-type'), /javascript/);
    const manifest = await fetch(`${app.base}/manifest.webmanifest`);
    assert.match(manifest.headers.get('content-type'), /manifest\+json/);

    const fallback = await fetch(`${app.base}/vecka`);
    assert.equal(fallback.status, 200);
    assert.match(await fallback.text(), /Life OS/);
    assert.equal((await fetch(`${app.base}/missing.js`)).status, 404);
  } finally {
    await app.stop();
  }
});

test('never serves files outside public/', async () => {
  const app = await startLifeOs();
  try {
    for (const p of ['/%2e%2e/server.mjs', '/..%2fserver.mjs', '/%2e%2e%2fpackage.json', '/js/%2e%2e/%2e%2e/server.mjs']) {
      const res = await fetch(`${app.base}${p}`);
      const text = await res.text();
      assert.ok([400, 403, 404].includes(res.status), `${p} → ${res.status}`);
      assert.ok(!text.includes('createLifeOsServer') && !text.includes('"name": "life-os"'), p);
    }
  } finally {
    await app.stop();
  }
});

test('backup round-trip keeps rotating history copies', async () => {
  const app = await startLifeOs();
  try {
    assert.equal((await fetch(`${app.base}/api/backup`)).status, 404);
    const bad = await fetch(`${app.base}/api/backup`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: { nope: 1 } }) });
    assert.equal(bad.status, 400);
    const put = await fetch(`${app.base}/api/backup`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: sampleState }) });
    assert.equal(put.status, 200);
    const saved = await put.json();
    assert.ok(saved.savedAt);
    const got = await (await fetch(`${app.base}/api/backup`)).json();
    assert.deepEqual(got.state, sampleState);
    assert.equal(fs.readdirSync(path.join(app.dataDir, 'backups')).length, 1);
    const broken = await fetch(`${app.base}/api/backup`, { method: 'PUT', body: '{not json' });
    assert.equal(broken.status, 400);
  } finally {
    await app.stop();
  }
});

test('LIFE_OS_TOKEN protects every API route except health', async () => {
  const app = await startLifeOs({ token: 'long-random-token' });
  try {
    assert.equal((await fetch(`${app.base}/api/health`)).status, 200);
    assert.equal((await (await fetch(`${app.base}/api/health`)).json()).tokenRequired, true);
    assert.equal((await fetch(`${app.base}/api/backup`)).status, 401);
    assert.equal((await fetch(`${app.base}/api/backup`, { headers: { 'x-life-os-token': 'wrong' } })).status, 401);
    assert.equal((await fetch(`${app.base}/api/backup`, { headers: { 'x-life-os-token': 'long-random-token' } })).status, 404);
    assert.equal((await fetch(`${app.base}/`)).status, 200, 'the static shell holds no data and stays public');
  } finally {
    await app.stop();
  }
});

test('coach and vault bridge to Agent OS', async () => {
  const agent = await startFakeAgentOs();
  const app = await startLifeOs({ agentOsUrl: agent.base, agentOsToken: 'agent-secret' });
  try {
    const status = await (await fetch(`${app.base}/api/coach/status`)).json();
    assert.equal(status.ok, true);

    const res = await fetch(`${app.base}/api/coach`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Planera min dag', agentId: 'local' }) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.reply, 'Hej från Agent OS');
    assert.equal(body.conversationId, 'c1');
    const chat = agent.seen.find((s) => s.url === '/api/chat');
    assert.equal(chat.body.agentId, 'local');
    assert.equal(chat.body.agentic, false);
    assert.equal(chat.headers['x-agentos-token'], 'agent-secret');

    const empty = await fetch(`${app.base}/api/coach`, { method: 'POST', body: JSON.stringify({ message: ' ' }) });
    assert.equal(empty.status, 400);

    const vault = await fetch(`${app.base}/api/vault`, { method: 'POST', body: JSON.stringify({ name: '2026-W42', content: '# Vecka 42' }) });
    assert.equal(vault.status, 200);
    assert.equal(agent.seen.find((s) => s.url === '/api/memory/note').body.path, 'Life OS/2026-W42.md');
    const evil = await fetch(`${app.base}/api/vault`, { method: 'POST', body: JSON.stringify({ name: '../../etc', content: 'x' }) });
    assert.equal(evil.status, 400);
  } finally {
    await app.stop();
    await agent.stop();
  }
});

test('coach reports a clear 502 when Agent OS is down', async () => {
  const app = await startLifeOs({ agentOsUrl: 'http://127.0.0.1:9' });
  try {
    const res = await fetch(`${app.base}/api/coach`, { method: 'POST', body: JSON.stringify({ message: 'Hej' }) });
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /Agent OS unreachable/);
    const status = await (await fetch(`${app.base}/api/coach/status`)).json();
    assert.equal(status.ok, false);
  } finally {
    await app.stop();
  }
});
