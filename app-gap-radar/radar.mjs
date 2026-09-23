#!/usr/bin/env node
// App Gap Radar — pulls top-grossing App Store apps per category, harvests their
// recent reviews, and scores where paying users are angriest and why.
// Zero dependencies (Node >= 20, global fetch). Public Apple RSS endpoints only.
//
//   node radar.mjs collect   [--country us] [--per-category 15] [--pages 10]
//   node radar.mjs analyze   -> data/report.json + data/report.md

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, 'data');

// Non-game genres a small team can realistically ship into.
export const GENRES = {
  6013: 'Health & Fitness', 6007: 'Productivity', 6012: 'Lifestyle', 6017: 'Education',
  6008: 'Photo & Video', 6015: 'Finance', 6002: 'Utilities', 6016: 'Entertainment',
  6011: 'Music', 6000: 'Business', 6020: 'Medical', 6005: 'Social Networking',
  6023: 'Food & Drink', 6003: 'Travel', 6010: 'Navigation', 6026: 'Graphics & Design',
};

// Complaint taxonomy. Each theme = regexes over lowercased title+body.
export const THEMES = {
  pricing:       [/\b(too )?(expensive|overpriced|pricey|price (hike|increase)|raised the price)\b/, /\$\d+/, /\bnot worth\b/, /\bcost(s)? (too )?much\b/],
  paywall:       [/\bpaywall/, /\bbehind a pay/, /\bhave to pay\b/, /\bpremium only\b/, /\bused to be free\b/, /\bnothing (is )?free\b/, /\bfree trial\b/, /\bsubscri(be|ption) to (use|do|see)\b/],
  billing_trap:  [/\bcancel/, /\brefund/, /\bcharged\b/, /\bauto[- ]?renew/, /\bscam\b/, /\bunauthori[sz]ed\b/, /\bcan'?t unsubscribe\b/, /\bstole\b/],
  ads:           [/\bads?\b/, /\badvert/, /\bcommercials?\b/, /\bpop[- ]?ups?\b/],
  crashes_bugs:  [/\bcrash/, /\bbug(gy|s)?\b/, /\bglitch/, /\bfreez/, /\bwon'?t (load|open|work)\b/, /\bdoesn'?t work\b/, /\bbroken\b/, /\bstuck\b/, /\blag(gy)?\b/],
  sync_data_loss:[/\bsync/, /\blost (all )?(my )?(data|progress|notes|photos|history|streak)/, /\bdeleted my\b/, /\bdata (is )?gone\b/, /\bbackup/],
  login_account: [/\blog ?in\b/, /\bsign ?in\b/, /\bpassword\b/, /\blocked out\b/, /\baccount (was )?(banned|suspended|disabled|locked)\b/, /\bverification code\b/],
  support:       [/\bcustomer (service|support)\b/, /\bno (one|response|reply)\b/, /\bsupport (team )?(is|never|won'?t)\b/, /\bemailed\b/, /\bcontacted\b/],
  bad_update:    [/\b(latest|new|recent) update\b/, /\bafter (the )?update\b/, /\bredesign\b/, /\bnew (ui|layout|interface|design)\b/, /\bbring back\b/, /\bold version\b/],
  privacy:       [/\bprivacy\b/, /\bselling (my )?data\b/, /\btracking\b/, /\bspy/, /\bpermissions?\b/],
  ai_quality:    [/\bai\b.*\b(wrong|inaccurate|useless|terrible|hallucinat)/, /\bhallucinat/, /\bwrong answers?\b/, /\binaccurate\b/],
  missing_feature:[/\bplease add\b/, /\bwish (it|there|they|you)\b/, /\bwould be (nice|great)\b/, /\bneeds? (a|an|to have)\b/, /\bno (option|way) to\b/, /\bcan'?t even\b/, /\bwhy (can'?t|isn'?t|is there no)\b/],
  accuracy:      [/\binaccurate\b/, /\bnot accurate\b/, /\bwrong (count|data|number|reading|calories|steps)\b/, /\bmiscalculat/],
  offline:       [/\boffline\b/, /\bno (internet|wifi|signal)\b/, /\brequires? (an )?internet\b/],
};

// Signals the user would pay/switch for a fix — the money in a gap.
const WTP = [/\bwould (gladly |happily )?pay\b/, /\bwilling to pay\b/, /\bone[- ]time (purchase|payment|fee)\b/, /\blifetime\b/, /\bswitch(ing|ed)? to\b/, /\blooking for (an )?alternative/, /\buninstall(ed|ing)?\b/, /\bdelet(ed|ing) (the|this) app\b/];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : def; };

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'app-gap-radar/1.0' } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === tries - 1) { console.warn(`  ! ${url}: ${err.message}`); return null; }
      await sleep(1000 * 2 ** i);
    }
  }
}

async function topGrossing(country, genre, limit) {
  const d = await getJSON(`https://itunes.apple.com/${country}/rss/topgrossingapplications/limit=${limit}/genre=${genre}/json`);
  return (d?.feed?.entry ?? []).map((e, rank) => ({
    id: e.id.attributes['im:id'], name: e['im:name'].label, developer: e['im:artist']?.label,
    genre: GENRES[genre], genreId: Number(genre), grossingRank: rank + 1,
    price: e['im:price']?.attributes?.amount,
  }));
}

async function reviews(country, id, pages) {
  const out = [];
  for (let p = 1; p <= pages; p++) {
    const d = await getJSON(`https://itunes.apple.com/${country}/rss/customerreviews/page=${p}/id=${id}/sortby=mostrecent/json`);
    const entries = d?.feed?.entry;
    if (!entries?.length) break;
    for (const e of [].concat(entries)) {
      if (!e['im:rating']) continue;
      out.push({ rating: Number(e['im:rating'].label), title: e.title.label, body: e.content.label, date: e.updated.label, version: e['im:version']?.label, votes: Number(e['im:voteSum']?.label ?? 0) });
    }
    await sleep(150);
  }
  return out;
}

async function lookup(country, ids) {
  const meta = {};
  for (let i = 0; i < ids.length; i += 150) {
    const d = await getJSON(`https://itunes.apple.com/lookup?country=${country}&id=${ids.slice(i, i + 150).join(',')}`);
    for (const r of d?.results ?? []) meta[r.trackId] = { ratingCount: r.userRatingCount, avgRating: r.averageUserRating, released: r.releaseDate, url: r.trackViewUrl, description: r.description?.slice(0, 600) };
  }
  return meta;
}

async function collect() {
  const country = arg('country', 'us');
  const per = Number(arg('per-category', 15));
  const pages = Number(arg('pages', 10));
  await mkdir(DATA, { recursive: true });
  const apps = new Map();
  for (const g of Object.keys(GENRES)) {
    const list = await topGrossing(country, g, per);
    console.log(`${GENRES[g]}: ${list.length} apps`);
    for (const a of list) if (!apps.has(a.id)) apps.set(a.id, a);
  }
  const meta = await lookup(country, [...apps.keys()]);
  let n = 0;
  for (const a of apps.values()) {
    Object.assign(a, meta[a.id] ?? {});
    a.reviews = await reviews(country, a.id, pages);
    console.log(`[${++n}/${apps.size}] ${a.name} — ${a.reviews.length} reviews`);
  }
  const file = join(DATA, `raw-${country}.json`);
  await writeFile(file, JSON.stringify({ country, collectedAt: new Date().toISOString(), apps: [...apps.values()] }));
  console.log(`saved ${file}`);
}

export function tagThemes(text) {
  const t = text.toLowerCase();
  return Object.entries(THEMES).filter(([, rx]) => rx.some((r) => r.test(t))).map(([k]) => k);
}
export const wantsToPayOrSwitch = (text) => WTP.some((r) => r.test(text.toLowerCase()));

async function analyze() {
  const country = arg('country', 'us');
  const file = join(DATA, `raw-${country}.json`);
  if (!existsSync(file)) throw new Error(`run collect first (${file} missing)`);
  const { apps, collectedAt } = JSON.parse(await readFile(file, 'utf8'));

  const appRows = [];
  const genreAgg = {};
  const quotes = {};
  for (const a of apps) {
    const neg = a.reviews.filter((r) => r.rating <= 2);
    const themeCounts = {};
    let wtp = 0;
    for (const r of neg) {
      const text = `${r.title}. ${r.body}`;
      const tags = tagThemes(text);
      if (wantsToPayOrSwitch(text)) wtp++;
      for (const t of tags) {
        themeCounts[t] = (themeCounts[t] ?? 0) + 1;
        (quotes[`${a.genre}|${t}`] ??= []).push({ app: a.name, rating: r.rating, text: text.slice(0, 280), votes: r.votes });
      }
    }
    const row = {
      name: a.name, developer: a.developer, genre: a.genre, grossingRank: a.grossingRank,
      ratingCount: a.ratingCount, avgRating: a.avgRating, sampled: a.reviews.length,
      negShare: a.reviews.length ? +(neg.length / a.reviews.length).toFixed(3) : null,
      negCount: neg.length, switchSignals: wtp, themes: themeCounts, url: a.url,
    };
    appRows.push(row);
    const g = (genreAgg[a.genre] ??= { genre: a.genre, apps: 0, reviews: 0, neg: 0, wtp: 0, themes: {} });
    g.apps++; g.reviews += a.reviews.length; g.neg += neg.length; g.wtp += wtp;
    for (const [t, c] of Object.entries(themeCounts)) g.themes[t] = (g.themes[t] ?? 0) + c;
  }

  // Gap score: how angry paying users are (neg share) × how much money is in the
  // category (# grossing apps sampled) × how actionable the anger is for a new
  // entrant (pricing/paywall/billing/ads/bugs/update/sync are all fixable by product
  // choices, unlike e.g. "I miss my friends on this network").
  const FIXABLE = ['pricing', 'paywall', 'billing_trap', 'ads', 'crashes_bugs', 'bad_update', 'sync_data_loss', 'missing_feature', 'accuracy', 'offline', 'support'];
  const genres = Object.values(genreAgg).map((g) => {
    const fixable = FIXABLE.reduce((s, t) => s + (g.themes[t] ?? 0), 0);
    const negShare = g.neg / Math.max(g.reviews, 1);
    return { ...g, negShare: +negShare.toFixed(3), fixablePerNeg: +(fixable / Math.max(g.neg, 1)).toFixed(2), switchRate: +(g.wtp / Math.max(g.neg, 1)).toFixed(3), gapScore: +(negShare * 100 * (fixable / Math.max(g.neg, 1)) * (1 + g.wtp / Math.max(g.neg, 1))).toFixed(1) };
  }).sort((a, b) => b.gapScore - a.gapScore);

  const topQuotes = {};
  for (const [k, list] of Object.entries(quotes)) topQuotes[k] = list.sort((a, b) => b.votes - a.votes || b.text.length - a.text.length).slice(0, 6);

  const report = { country, collectedAt, analyzedAt: new Date().toISOString(), totals: { apps: apps.length, reviews: apps.reduce((s, a) => s + a.reviews.length, 0) }, genres, apps: appRows.sort((a, b) => b.negShare - a.negShare), quotes: topQuotes };
  await writeFile(join(DATA, 'report.json'), JSON.stringify(report, null, 1));

  const md = [`# App Gap Radar — ${country.toUpperCase()} (${collectedAt.slice(0, 10)})`, '', `${report.totals.apps} top-grossing apps, ${report.totals.reviews} recent reviews.`, '', '## Categories by gap score', '', '| Category | Apps | Reviews | 1–2★ share | Switch/WTP rate | Top complaints | Gap score |', '|---|---|---|---|---|---|---|'];
  for (const g of genres) {
    const top = Object.entries(g.themes).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, c]) => `${t} (${c})`).join(', ');
    md.push(`| ${g.genre} | ${g.apps} | ${g.reviews} | ${(g.negShare * 100).toFixed(0)}% | ${(g.switchRate * 100).toFixed(0)}% | ${top} | ${g.gapScore} |`);
  }
  md.push('', '## Angriest big apps (≥100 reviews sampled)', '', '| App | Category | Grossing # | Ratings | 1–2★ share | Top complaints |', '|---|---|---|---|---|---|');
  for (const a of appRows.filter((a) => a.sampled >= 100).slice(0, 40)) {
    const top = Object.entries(a.themes).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([t, c]) => `${t} (${c})`).join(', ');
    md.push(`| ${a.name} | ${a.genre} | ${a.grossingRank} | ${a.ratingCount ?? '?'} | ${(a.negShare * 100).toFixed(0)}% | ${top} |`);
  }
  await writeFile(join(DATA, 'report.md'), md.join('\n') + '\n');
  console.log(md.slice(0, 30).join('\n'));
}

const cmd = process.argv[2];
if (cmd === 'collect') await collect();
else if (cmd === 'analyze') await analyze();
else if (import.meta.url === `file://${process.argv[1]}`) console.log('usage: node radar.mjs collect|analyze [--country us]');
