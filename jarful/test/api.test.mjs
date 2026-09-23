import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.mjs';
import { Store } from '../lib/store.mjs';

let server, base, dir, store;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'jarful-'));
  store = await new Store(join(dir, 'db.json')).load();
  server = createServer(createApp(store)).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await rm(dir, { recursive: true, force: true }); });

const call = async (path, { token, ...opts } = {}) => {
  const res = await fetch(base + path, { ...opts, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};

test('household flow: create, join, recipes, plan, shared grocery list', async () => {
  const a = await call('/api/household', { method: 'POST', body: { memberName: 'Alex' } });
  assert.equal(a.status, 201);
  const code = a.body.household.inviteCode;
  const b = await call('/api/join', { method: 'POST', body: { code: code.toLowerCase(), memberName: 'Sam' } });
  assert.equal(b.status, 200);
  assert.equal(b.body.household.id, a.body.household.id);
  assert.equal((await call('/api/me', { token: 'nope' })).status, 401);

  const r1 = await call('/api/recipes', { method: 'POST', token: a.body.token, body: { title: 'Pancakes', servings: 4, ingredients: '2 cups flour\n2 eggs\n1 1/2 cups milk', steps: 'Mix\nCook' } });
  assert.equal(r1.status, 201);
  const r2 = await call('/api/recipes', { method: 'POST', token: b.body.token, body: { title: 'Omelette', servings: 1, ingredients: '3 eggs\n1 tbsp butter', steps: 'Whisk\nFry' } });

  const date = '2026-09-21';
  await call('/api/plan', { method: 'PUT', token: a.body.token, body: { date, entries: [{ recipeId: r1.body.recipe.id, servings: 8 }] } });
  await call('/api/plan', { method: 'PUT', token: b.body.token, body: { date: '2026-09-22', entries: [{ recipeId: r2.body.recipe.id, servings: 1 }, { recipeId: 'bogus' }] } });

  const g = await call(`/api/grocery?from=${date}`, { token: b.body.token });
  const eggs = g.body.items.find((i) => i.name.startsWith('egg'));
  assert.equal(eggs.qty, 7, 'pancakes doubled (4 eggs) + omelette (3)');
  assert.equal(g.body.items.find((i) => i.name === 'flour').qty, 4);

  await call('/api/grocery/check', { method: 'POST', token: a.body.token, body: { key: eggs.key, checked: true } });
  const g2 = await call(`/api/grocery?from=${date}`, { token: b.body.token });
  assert.equal(g2.body.items.find((i) => i.key === eggs.key).checked, true, 'ticks are shared across members');

  const del = await call(`/api/recipes/${r2.body.recipe.id}`, { method: 'DELETE', token: a.body.token });
  assert.equal(del.status, 200);
  const plan = await call(`/api/plan?from=${date}`, { token: a.body.token });
  assert.equal(plan.body.days[1].entries.length, 0, 'deleting a recipe removes it from the plan');
});

test('import validates input and does not charge failed imports', async () => {
  const a = await call('/api/household', { method: 'POST', body: {} });
  const bad = await call('/api/recipes/import', { method: 'POST', token: a.body.token, body: { url: 'http://127.0.0.1:1/x' } });
  assert.equal(bad.status, 400);
  const img = await call('/api/recipes/import', { method: 'POST', token: a.body.token, body: { image: 'data:text/html;base64,AAAA' } });
  assert.equal(img.status, 400);
  const me = await call('/api/me', { token: a.body.token });
  assert.equal(me.body.household.aiImportsUsed, 0);
});

test('stripe webhook rejects unsigned requests and serves the app shell', async () => {
  const res = await fetch(`${base}/api/stripe/webhook`, { method: 'POST', body: '{}' });
  assert.equal(res.status, 400);
  const html = await fetch(`${base}/`);
  assert.match(await html.text(), /Jarful/);
  const traversal = await fetch(`${base}/..%2f..%2fpackage.json`);
  assert.doesNotMatch(await traversal.text(), /"dependencies"/);
});

test('admin metrics are hidden without the admin token', async () => {
  process.env.ADMIN_TOKEN = 'x'.repeat(32);
  assert.equal((await fetch(`${base}/api/admin/metrics`)).status, 404);
  assert.equal((await fetch(`${base}/api/admin/metrics`, { headers: { 'x-admin-token': 'y'.repeat(32) } })).status, 404);
  const ok = await fetch(`${base}/api/admin/metrics`, { headers: { 'x-admin-token': 'x'.repeat(32) } });
  assert.equal(ok.status, 200);
  assert.ok((await ok.json()).households.total >= 1);
  assert.match(ok.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  delete process.env.ADMIN_TOKEN;
});

test('CORS is granted to native app origins only', async () => {
  const pre = await fetch(`${base}/api/me`, { method: 'OPTIONS', headers: { origin: 'capacitor://localhost', 'access-control-request-method': 'GET' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'capacitor://localhost');
  const evil = await fetch(`${base}/api/config`, { headers: { origin: 'https://evil.example' } });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
});
