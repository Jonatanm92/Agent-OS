import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Omega } from '../src/engine/orchestrator.ts';
import { startServer } from '../src/server/http.ts';
import { testConfig } from './helpers.ts';

async function boot() {
  const cfg = testConfig();
  const omega = new Omega(cfg);
  const srv = await startServer(cfg, omega, { worker: false });
  const call = (path: string, opts: { method?: string; body?: unknown; token?: string | null; headers?: Record<string, string> } = {}) =>
    fetch(srv.url + path, {
      method: opts.method ?? 'GET',
      headers: {
        ...(opts.token === null ? {} : { Authorization: `Bearer ${opts.token ?? srv.token}` }),
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers ?? {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  return { cfg, omega, srv, call };
}

test('server: refuses non-loopback binding unless explicitly allowed', async () => {
  const cfg = testConfig({ host: '0.0.0.0' });
  await assert.rejects(startServer(cfg, new Omega(cfg), { worker: false }), /Refusing to bind/);
});

test('server: auth required, headers hardened, failed attempts rate limited', async () => {
  const { srv, call } = await boot();
  try {
    assert.equal((await call('/api/health', { token: null })).status, 200);
    assert.equal((await call('/api/missions', { token: null })).status, 401);
    assert.equal((await call('/api/missions', { token: 'wrong-token-wrong-token-xx' })).status, 401);
    const ok = await call('/api/missions');
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    assert.equal(ok.headers.get('x-frame-options'), 'DENY');
    const page = await call('/', { token: null });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<title>OMEGA<\/title>/);
    assert.equal((await call('/../../etc/passwd', { token: null })).status, 404);
    for (let i = 0; i < 10; i++) await call('/api/overview', { token: 'x'.repeat(30) });
    assert.equal((await call('/api/overview')).status, 429, 'locked out after repeated failures');
  } finally {
    await srv.stop();
  }
});

test('server: mission lifecycle over the API, with input validation and path protection', async () => {
  const { omega, srv, call } = await boot();
  try {
    assert.equal((await call('/api/missions', { method: 'POST', body: { idea: 'kort' } })).status, 400);
    assert.equal((await call('/api/missions', { method: 'POST', body: { idea: 'En temperaturomvandlare', engine: 'shell' } })).status, 400);
    const formPost = await call('/api/missions', { method: 'POST', headers: { 'Content-Type': 'text/plain' } });
    assert.equal(formPost.status, 415, 'non-JSON bodies are refused');

    const created = await call('/api/missions', { method: 'POST', body: { idea: 'En temperaturomvandlare för celsius', engine: 'template' } });
    assert.equal(created.status, 201);
    const mission = (await created.json()) as { id: string };
    await omega.runUntilIdle();

    const detail = (await (await call(`/api/missions/${mission.id}`)).json()) as { mission: { state: string }; files: string[]; commits: unknown[] };
    assert.equal(detail.mission.state, 'awaiting_review');
    assert.ok(detail.files.includes('src/index.js'));
    assert.ok(detail.commits.length >= 4);

    const file = await call(`/api/missions/${mission.id}/file?path=${encodeURIComponent('src/index.js')}`);
    assert.equal(file.status, 200);
    for (const bad of ['../../../../etc/passwd', '.git/config', '/etc/hosts']) {
      assert.equal((await call(`/api/missions/${mission.id}/file?path=${encodeURIComponent(bad)}`)).status, 403, bad);
    }
    assert.equal((await call(`/api/missions/${mission.id}/artifacts/..%2F..%2Fstate.json`)).status, 404);
    assert.equal((await call(`/api/missions/${mission.id}/artifacts/spec.json`)).status, 200);

    const pending = (await (await call('/api/approvals?state=pending')).json()) as { id: string; kind: string }[];
    const review = pending.find((a) => a.kind === 'final_review')!;
    assert.equal((await call(`/api/approvals/${review.id}/decide`, { method: 'POST', body: { decision: 'reject' } })).status, 400, 'rejection needs a note');
    const approved = await call(`/api/approvals/${review.id}/decide`, { method: 'POST', body: { decision: 'approve', note: 'ok' } });
    assert.equal(approved.status, 200);
    assert.equal((await call(`/api/approvals/${review.id}/decide`, { method: 'POST', body: { decision: 'approve' } })).status, 409, 'cannot decide twice');

    const reverify = (await (await call(`/api/missions/${mission.id}/reverify`, { method: 'POST' })).json()) as { ok: boolean };
    assert.equal(reverify.ok, true);
    const audit = (await (await call('/api/audit/verify')).json()) as { ok: boolean; count: number };
    assert.equal(audit.ok, true);
    assert.ok(audit.count > 10);
  } finally {
    await srv.stop();
  }
});
