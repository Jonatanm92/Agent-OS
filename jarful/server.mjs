#!/usr/bin/env node
// Jarful server: JSON API + static PWA. Zero framework, one dependency (Anthropic SDK).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, newId, monthKey } from './lib/store.mjs';
import { importRecipe, ImportError } from './lib/importer.mjs';
import { aiAvailable } from './lib/ai.mjs';
import { parseIngredient, buildGroceryList, scaleIngredient } from './lib/ingredients.mjs';
import { computeMetrics } from './lib/metrics.mjs';
import { timingSafeEqual } from 'node:crypto';
import { aiImportsLeft, recordAiImport, checkoutLinks, freeAiLimit, isPro, verifyStripeSignature, applyStripeEvent, PRICES } from './lib/billing.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, 'public');

// minimal .env loader (no dependency)
if (existsSync(join(HERE, '.env'))) {
  for (const line of readFileSync(join(HERE, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const MIME = { '.xml': 'application/xml; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

async function readBody(req, limit = 12 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) throw new HttpError(413, 'Request too large'); chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}
// Behind one reverse proxy (Render, Fly) the socket address is the proxy's. With TRUST_PROXY=1 we
// take the LAST X-Forwarded-For entry: the one our proxy appended. Earlier entries are client-supplied.
const clientIp = (req) => (process.env.TRUST_PROXY === '1' ? String(req.headers['x-forwarded-for'] ?? '').split(',').pop().trim() : '') || req.socket.remoteAddress || '';

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(self), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
const json = (res, status, body) => { res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };

// naive in-memory rate limiter: key -> timestamps
const hits = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) throw new HttpError(429, 'Slow down a little and try again in a minute.');
  list.push(now); hits.set(key, list);
}

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '');
function weekDates(from) {
  const start = isDate(from) ? new Date(`${from}T00:00:00Z`) : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  return Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 864e5).toISOString().slice(0, 10));
}

function publicHousehold(store, h) {
  return {
    id: h.id, name: h.name, inviteCode: h.inviteCode, members: store.membersOf(h.id),
    plan: h.billing.plan, interval: h.billing.interval, pro: isPro(h),
    aiImportsUsed: h.usage[monthKey()] ?? 0, aiImportsLeft: isPro(h) ? null : aiImportsLeft(h), freeAiLimit: freeAiLimit(h),
    recipeCount: Object.keys(h.recipes).length,
    refCode: store.ensureRefCode(h), referredCount: h.referredCount ?? 0, bonusAiImports: h.bonusAiImports ?? 0,
  };
}

function recipeFromInput(body, existing = {}) {
  const lines = (v) => (Array.isArray(v) ? v : String(v ?? '').split('\n')).map((s) => String(s).trim()).filter(Boolean);
  const r = {
    ...existing,
    title: String(body.title ?? existing.title ?? 'Untitled recipe').slice(0, 200),
    servings: body.servings === undefined ? existing.servings ?? null : (Number(body.servings) || null),
    totalMinutes: body.totalMinutes === undefined ? existing.totalMinutes ?? null : (Number(body.totalMinutes) || null),
    notes: body.notes === undefined ? existing.notes ?? '' : String(body.notes).slice(0, 5000),
    tags: body.tags === undefined ? existing.tags ?? [] : lines(Array.isArray(body.tags) ? body.tags : String(body.tags).split(',')).map((t) => t.toLowerCase()).slice(0, 12),
    favorite: body.favorite === undefined ? existing.favorite ?? false : Boolean(body.favorite),
  };
  if (body.ingredients !== undefined) r.ingredients = lines(body.ingredients).slice(0, 200).map(parseIngredient);
  if (body.steps !== undefined) r.steps = lines(body.steps).slice(0, 200);
  r.ingredients ??= []; r.steps ??= [];
  return r;
}

export function createApp(store) {
  async function api(req, res, url) {
    const path = url.pathname;
    const method = req.method;

    if (path === '/api/health') return json(res, 200, { ok: true });
    if (path === '/api/config' && method === 'GET') return json(res, 200, { aiAvailable: aiAvailable(), freeAiImports: freeAiLimit(), prices: Object.fromEntries(Object.entries(PRICES).map(([k, p]) => [k, p.label])) });

    if (path === '/api/stripe/webhook' && method === 'POST') {
      const raw = await readBody(req, 1024 * 1024);
      if (!verifyStripeSignature(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)) throw new HttpError(400, 'bad signature');
      const result = applyStripeEvent(store, JSON.parse(raw));
      await store.save();
      console.log(`[stripe] ${result}`);
      return json(res, 200, { received: true });
    }

    if (path === '/api/admin/metrics' && method === 'GET') {
      const want = process.env.ADMIN_TOKEN ?? '';
      const got = String(req.headers['x-admin-token'] ?? ''); // header only: URLs end up in logs
      if (want.length < 16 || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) throw new HttpError(404, 'Not found');
      return json(res, 200, computeMetrics(store.data));
    }

    const ip = clientIp(req);
    if (path === '/api/household' && method === 'POST') {
      rateLimit(`create:${ip}`, 10, 3600e3);
      const b = JSON.parse(await readBody(req) || '{}');
      const { household, token } = store.createHousehold(b.name, b.memberName);
      if (b.ref) store.applyReferral(household, b.ref);
      await store.save();
      return json(res, 201, { token, household: publicHousehold(store, household) });
    }
    if (path === '/api/join' && method === 'POST') {
      rateLimit(`join:${ip}`, 20, 3600e3);
      const b = JSON.parse(await readBody(req) || '{}');
      const r = store.join(b.code, b.memberName);
      if (!r) throw new HttpError(404, 'No kitchen with that invite code.');
      await store.save();
      return json(res, 200, { token: r.token, household: publicHousehold(store, r.household) });
    }

    // ---- authenticated ----
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const who = store.byToken(token);
    if (!who) throw new HttpError(401, 'Please sign in again.');
    const h = who.household;

    if (path === '/api/me' && method === 'GET') return json(res, 200, { household: publicHousehold(store, h), member: { name: who.member.name } });
    if (path === '/api/me' && method === 'PATCH') {
      const b = JSON.parse(await readBody(req) || '{}');
      if (b.name) h.name = String(b.name).slice(0, 60);
      await store.save();
      return json(res, 200, { household: publicHousehold(store, h) });
    }
    if (path === '/api/me' && method === 'DELETE') {
      const b = JSON.parse(await readBody(req) || '{}');
      if (String(b.confirm ?? '').trim().toUpperCase() !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm.');
      if (h.billing.plan === 'pro' && h.billing.interval === 'subscription') throw new HttpError(409, 'Cancel your subscription first (Kitchen → Manage or cancel), then delete.');
      store.deleteHousehold(h.id); await store.save();
      return json(res, 200, { deleted: true });
    }
    if (path === '/api/billing' && method === 'GET') return json(res, 200, { plan: h.billing.plan, interval: h.billing.interval, links: checkoutLinks(h.id), portalUrl: process.env.STRIPE_PORTAL_URL || null });
    if (path === '/api/export' && method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json', 'content-disposition': `attachment; filename="jarful-export-${new Date().toISOString().slice(0, 10)}.json"` });
      return res.end(JSON.stringify({ exportedAt: new Date().toISOString(), name: h.name, recipes: Object.values(h.recipes), mealPlan: h.mealPlan }, null, 2));
    }

    if (path === '/api/recipes' && method === 'GET') {
      const list = Object.values(h.recipes).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return json(res, 200, { recipes: list });
    }
    if (path === '/api/recipes' && method === 'POST') {
      const b = JSON.parse(await readBody(req) || '{}');
      const r = { id: newId(), createdAt: new Date().toISOString(), method: 'manual', flags: [], ...recipeFromInput(b) };
      h.recipes[r.id] = r; await store.save();
      return json(res, 201, { recipe: r });
    }
    if (path === '/api/recipes/import' && method === 'POST') {
      rateLimit(`import:${h.id}`, 40, 3600e3);
      const b = JSON.parse(await readBody(req) || '{}');
      let image = null;
      if (b.image) {
        const m = String(b.image).match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
        if (!m) throw new HttpError(400, 'Unsupported image. Use a JPG, PNG or WebP photo.');
        image = { mediaType: m[1], data: m[2] };
      }
      const { recipe, usedAi } = await importRecipe({ url: b.url, text: b.text, image }, { allowAi: aiImportsLeft(h) > 0 });
      if (usedAi) recordAiImport(h);
      const r = { id: newId(), createdAt: new Date().toISOString(), favorite: false, notes: '', ...recipe };
      h.recipes[r.id] = r; await store.save();
      return json(res, 201, { recipe: r, usedAi, aiImportsLeft: isPro(h) ? null : aiImportsLeft(h) });
    }
    const rm = path.match(/^\/api\/recipes\/([\w-]+)$/);
    if (rm) {
      const r = Object.hasOwn(h.recipes, rm[1]) ? h.recipes[rm[1]] : null;
      if (!r) throw new HttpError(404, 'Recipe not found');
      if (method === 'GET') return json(res, 200, { recipe: r });
      if (method === 'PUT') {
        const b = JSON.parse(await readBody(req) || '{}');
        h.recipes[r.id] = { ...recipeFromInput(b, r), flags: b.ingredients !== undefined ? [] : r.flags, updatedAt: new Date().toISOString() };
        await store.save();
        return json(res, 200, { recipe: h.recipes[r.id] });
      }
      if (method === 'DELETE') {
        delete h.recipes[r.id];
        for (const d of Object.keys(h.mealPlan)) h.mealPlan[d] = h.mealPlan[d].filter((e) => e.recipeId !== r.id);
        await store.save();
        return json(res, 200, { ok: true });
      }
    }

    if (path === '/api/plan' && method === 'GET') {
      const days = weekDates(url.searchParams.get('from'));
      return json(res, 200, { days: days.map((date) => ({ date, entries: h.mealPlan[date] ?? [] })) });
    }
    if (path === '/api/plan' && method === 'PUT') {
      const b = JSON.parse(await readBody(req) || '{}');
      if (!isDate(b.date)) throw new HttpError(400, 'date must be YYYY-MM-DD');
      const entries = (Array.isArray(b.entries) ? b.entries : []).filter((e) => Object.hasOwn(h.recipes, String(e?.recipeId))).slice(0, 10).map((e) => ({ recipeId: e.recipeId, servings: Number(e.servings) || h.recipes[e.recipeId].servings || null }));
      if (entries.length) h.mealPlan[b.date] = entries; else delete h.mealPlan[b.date];
      await store.save();
      return json(res, 200, { date: b.date, entries });
    }

    if (path === '/api/grocery' && method === 'GET') {
      const days = weekDates(url.searchParams.get('from'));
      const items = [];
      for (const d of days) for (const e of h.mealPlan[d] ?? []) {
        const r = h.recipes[e.recipeId]; if (!r) continue;
        const factor = r.servings && e.servings ? e.servings / r.servings : 1;
        for (const ing of r.ingredients) items.push({ ingredient: scaleIngredient(ing, factor), recipeTitle: r.title });
      }
      const list = buildGroceryList(items).map((i) => ({ ...i, checked: Boolean(h.grocery.checked[i.key]) }));
      return json(res, 200, { from: days[0], to: days[6], items: list, extras: h.grocery.extras });
    }
    if (path === '/api/grocery/check' && method === 'POST') {
      const b = JSON.parse(await readBody(req) || '{}');
      if (b.extraId) { const x = h.grocery.extras.find((e) => e.id === b.extraId); if (x) x.checked = Boolean(b.checked); }
      else if (b.key) { if (b.checked) h.grocery.checked[String(b.key).slice(0, 200)] = true; else delete h.grocery.checked[b.key]; }
      await store.save();
      return json(res, 200, { ok: true });
    }
    if (path === '/api/grocery/extra' && method === 'POST') {
      const b = JSON.parse(await readBody(req) || '{}');
      const text = String(b.text ?? '').trim().slice(0, 120);
      if (!text) throw new HttpError(400, 'Empty item');
      const x = { id: newId(6), text, checked: false };
      h.grocery.extras.push(x); await store.save();
      return json(res, 201, { extra: x });
    }
    if (path === '/api/grocery/clear' && method === 'POST') {
      h.grocery = { checked: {}, extras: h.grocery.extras.filter((e) => !e.checked) };
      await store.save();
      return json(res, 200, { ok: true });
    }
    throw new HttpError(404, 'Not found');
  }

  const SEO_PAGES = ['/', '/save-tiktok-recipes.html', '/save-instagram-recipes.html', '/meal-planner-with-grocery-list.html', '/recipe-app-without-subscription.html'];
  async function serveStatic(req, res, url) {
    const origin = (process.env.PUBLIC_URL || `http://${req.headers.host}`).replace(/\/$/, '');
    if (url.pathname === '/robots.txt') {
      res.writeHead(200, { 'content-type': MIME['.txt'] });
      return res.end(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`);
    }
    if (url.pathname === '/sitemap.xml') {
      res.writeHead(200, { 'content-type': MIME['.xml'] });
      return res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${SEO_PAGES.map((p) => `<url><loc>${origin}${p}</loc></url>`).join('')}</urlset>\n`);
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p === '/' || p === '') p = '/index.html';
    let file = join(PUBLIC, p);
    if (!file.startsWith(PUBLIC)) throw new HttpError(403, 'Forbidden');
    if (!existsSync(file) || (await stat(file)).isDirectory()) file = join(PUBLIC, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': file.endsWith('sw.js') || file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600' });
    res.end(body);
  }

  // CORS only for the native app shells (Capacitor serves from these origins).
  const NATIVE_ORIGINS = new Set(['capacitor://localhost', 'https://localhost', 'http://localhost', 'ionic://localhost']);
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const origin = req.headers.origin;
    if (origin && NATIVE_ORIGINS.has(origin) && url.pathname.startsWith('/api/') && url.pathname !== '/api/stripe/webhook') {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'Origin');
      res.setHeader('access-control-allow-headers', 'authorization, content-type');
      res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    }
    try {
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else await serveStatic(req, res, url);
    } catch (err) {
      const status = err instanceof HttpError || err instanceof ImportError ? err.status : err instanceof SyntaxError ? 400 : 500;
      if (status >= 500 && !(err instanceof ImportError)) console.error(err);
      json(res, status, { error: status === 500 ? 'Something went wrong on our side.' : err.message });
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const store = await new Store(process.env.JARFUL_DB ?? join(HERE, 'data', 'db.json')).load();
  const port = Number(process.env.PORT ?? 8787);
  createServer(createApp(store)).listen(port, () => {
    console.log(`Jarful on http://localhost:${port}  (AI import: ${aiAvailable() ? 'on' : 'off — set ANTHROPIC_API_KEY'})`);
  });
}
