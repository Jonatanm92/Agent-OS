// Turns a URL, pasted text or a photo into a normalized recipe.
// Order of preference (cheapest first): schema.org JSON-LD (free, exact) -> Claude.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { extractRecipeWithClaude, aiAvailable, ImportError } from './ai.mjs';
import { parseIngredient } from './ingredients.mjs';

export { ImportError };

const UA = 'Mozilla/5.0 (compatible; JarfulBot/1.0; +https://jarful.app/bot)';
const MAX_BYTES = 4 * 1024 * 1024;

// ---------- normalization ----------

export function isoDurationToMinutes(v) {
  if (!v || typeof v !== 'string') return null;
  const m = v.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/i);
  if (!m) return null;
  const mins = (Number(m[1] ?? 0) * 24 * 60) + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return mins || null;
}

const decodeEntities = (s) => String(s ?? '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/\s+/g, ' ').trim();

function flattenInstructions(ins) {
  if (!ins) return [];
  if (typeof ins === 'string') return ins.split(/\n+|(?<=\.)\s+(?=[A-Z])/).map(decodeEntities).filter(Boolean);
  if (Array.isArray(ins)) return ins.flatMap(flattenInstructions);
  if (ins['@type'] === 'HowToSection') return flattenInstructions(ins.itemListElement);
  if (ins.text) return [decodeEntities(ins.text)];
  if (ins.name) return [decodeEntities(ins.name)];
  return [];
}

function firstImage(img) {
  if (!img) return null;
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return firstImage(img[0]);
  return img.url ?? null;
}

function servingsFrom(y) {
  const v = Array.isArray(y) ? y[0] : y;
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 && n < 200 ? n : null;
}

// Common checks that catch the "it missed half the ingredients" failure.
export function qualityFlags(recipe) {
  const flags = [];
  if (recipe.ingredients.length < 2) flags.push('Very few ingredients found — double-check against the source.');
  if (!recipe.steps.length) flags.push('No steps found.');
  const listed = recipe.ingredients.map((i) => i.name).join(' ');
  const staples = ['salt', 'pepper', 'oil', 'butter', 'garlic', 'onion', 'sugar', 'flour', 'egg', 'water'];
  const stepsText = recipe.steps.join(' ').toLowerCase();
  const missing = staples.filter((s) => new RegExp(`\\b${s}s?\\b`).test(stepsText) && !listed.includes(s) && s !== 'water');
  if (missing.length) flags.push(`Steps mention ${missing.join(', ')} but the ingredient list doesn't.`);
  return flags;
}

export function normalizeRecipe(r, meta = {}) {
  const ingredients = (r.ingredients ?? []).map(decodeEntities).filter(Boolean).map(parseIngredient);
  const recipe = {
    title: decodeEntities(r.title) || 'Untitled recipe',
    sourceUrl: meta.sourceUrl ?? null,
    sourceName: meta.sourceName ?? null,
    image: meta.image ?? r.image ?? null,
    servings: r.servings ?? null,
    totalMinutes: r.totalMinutes ?? null,
    ingredients,
    steps: (r.steps ?? []).map(decodeEntities).filter(Boolean),
    tags: [...new Set((r.tags ?? []).map((t) => String(t).toLowerCase().trim()).filter(Boolean))].slice(0, 8),
    method: meta.method,
    uncertain: r.uncertain ?? [],
  };
  recipe.flags = [...qualityFlags(recipe), ...recipe.uncertain];
  return recipe;
}

// ---------- JSON-LD ----------

function* walk(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) yield* walk(n); return; }
  yield node;
  if (node['@graph']) yield* walk(node['@graph']);
  if (node.mainEntity) yield* walk(node.mainEntity);
}

export function extractJsonLdRecipe(html) {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, body] of blocks) {
    let json;
    try { json = JSON.parse(body.trim()); } catch { continue; }
    for (const node of walk(json)) {
      const type = [].concat(node['@type'] ?? []);
      if (!type.includes('Recipe')) continue;
      const kw = typeof node.keywords === 'string' ? node.keywords.split(',') : node.keywords ?? [];
      return {
        title: node.name,
        image: firstImage(node.image),
        servings: servingsFrom(node.recipeYield),
        totalMinutes: isoDurationToMinutes(node.totalTime) ?? ((isoDurationToMinutes(node.prepTime) ?? 0) + (isoDurationToMinutes(node.cookTime) ?? 0) || null),
        ingredients: node.recipeIngredient ?? node.ingredients ?? [],
        steps: flattenInstructions(node.recipeInstructions),
        tags: [...[].concat(node.recipeCategory ?? []), ...[].concat(node.recipeCuisine ?? []), ...kw].map((t) => String(t).trim()).slice(0, 6),
      };
    }
  }
  return null;
}

export function metaTag(html, prop) {
  const rx = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i');
  const tag = html.match(rx)?.[0];
  return tag ? decodeEntities(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '') || null : null;
}

export function visibleText(html) {
  return decodeEntities(html
    .replace(/<(script|style|noscript|svg|header|footer|nav|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|li|h\d|div|br)>/gi, '\n'))
    .slice(0, 30000);
}

// ---------- safe fetching (blocks SSRF into private networks) ----------

function isPrivateAddress(ip) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true;
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export async function assertPublicUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new ImportError('That doesn\'t look like a link.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new ImportError('Only http(s) links are supported.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => { throw new ImportError('Could not reach that website.'); });
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new ImportError('That address is not allowed.');
  return url;
}

export async function safeFetch(raw, { accept = 'text/html,application/json' } = {}) {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': UA, accept, 'accept-language': 'en-US,en;q=0.8' }, signal: AbortSignal.timeout(12000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = await assertPublicUrl(new URL(res.headers.get('location'), url).href);
      continue;
    }
    if (!res.ok) throw new ImportError(`The website answered ${res.status}. Paste the recipe text instead.`, 424);
    const reader = res.body.getReader();
    const chunks = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { reader.cancel(); break; }
      chunks.push(value);
    }
    return { url: url.href, body: Buffer.concat(chunks).toString('utf8') };
  }
  throw new ImportError('Too many redirects.');
}

// ---------- source-specific text capture ----------

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

async function captureSource(rawUrl) {
  const h = host(rawUrl);
  if (/(^|\.)tiktok\.com$/.test(h)) {
    const { body } = await safeFetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(rawUrl)}`, { accept: 'application/json' });
    const o = JSON.parse(body);
    return { text: o.title ?? '', title: null, image: o.thumbnail_url ?? null, sourceName: o.author_name ? `@${o.author_unique_id ?? o.author_name} on TikTok` : 'TikTok' };
  }
  const { url, body: html } = await safeFetch(rawUrl);
  const ld = extractJsonLdRecipe(html);
  const image = metaTag(html, 'og:image');
  const siteName = metaTag(html, 'og:site_name') ?? host(url);
  if (ld) return { ld, image: ld.image ?? image, sourceName: siteName, url };
  let text = '';
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(h)) {
    const desc = html.match(/"shortDescription":"((?:\\.|[^"\\])*)"/)?.[1];
    if (desc) text = JSON.parse(`"${desc}"`);
  }
  const og = [metaTag(html, 'og:title'), metaTag(html, 'og:description') ?? metaTag(html, 'description')].filter(Boolean).join('\n');
  text = [text, og, visibleText(html)].filter(Boolean).join('\n\n').slice(0, 30000);
  return { text, image, sourceName: siteName, url };
}

// ---------- public API ----------

// Returns { recipe, usedAi }
export async function importRecipe({ url, text, image }, { allowAi = true } = {}) {
  if (url) {
    const src = await captureSource(url.trim());
    if (src.ld) return { recipe: normalizeRecipe(src.ld, { sourceUrl: src.url, sourceName: src.sourceName, image: src.image, method: 'structured' }), usedAi: false };
    if (!src.text || src.text.length < 40) throw new ImportError('Couldn\'t find a recipe at that link. Paste the caption or recipe text instead.', 422);
    return aiImport({ text: src.text, sourceUrl: url }, { sourceUrl: src.url ?? url, sourceName: src.sourceName, image: src.image, method: 'ai-link' }, allowAi);
  }
  if (image) return aiImport({ image }, { method: 'ai-photo' }, allowAi);
  if (text && text.trim().length >= 20) return aiImport({ text: text.slice(0, 30000) }, { method: 'ai-text' }, allowAi);
  throw new ImportError('Send a link, some recipe text or a photo.');
}

async function aiImport(input, meta, allowAi) {
  if (!allowAi) throw new ImportError('You\'ve used this month\'s free AI imports. Website imports stay unlimited — or go Pro for unlimited AI imports.', 402);
  if (!aiAvailable()) throw new ImportError('AI import isn\'t configured on this server yet (missing ANTHROPIC_API_KEY).', 503);
  const { data } = await extractRecipeWithClaude(input);
  if (!data.is_recipe) throw new ImportError('That doesn\'t seem to contain a recipe.', 422);
  return { recipe: normalizeRecipe({ title: data.title, servings: data.servings, totalMinutes: data.total_minutes, ingredients: data.ingredients, steps: data.steps, tags: data.tags, uncertain: data.uncertain }, meta), usedAi: true };
}
