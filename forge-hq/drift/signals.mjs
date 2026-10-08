#!/usr/bin/env node
// Signal agent: pulls recent Swedish job ads (JobTech/Platsbanken open API) that point
// to ERP/WMS/order-flow pain at retailers and distributors, skips ones already logged
// in signals.csv, appends the new ones and prints them as JSON.
// Usage: node forge-hq/drift/signals.mjs [--days 14] [--dry-run]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.join(DIR, 'signals.csv');
const API = 'https://jobsearch.api.jobtechdev.se/search';

export const QUERIES = ['Infor M3', 'M3 e-handel', 'WMS', 'WM6', 'SAP e-handel', 'e-handel orderflöde', 'e-handel integration affärssystem', 'lagersystem e-handel'];
const SYSTEMS = /\b(infor m3|m3|wms|wm6|sap|astro|ongoing|centiro|business central|navision|dynamics 365)\b/i;
// Profile queries: office roles in logistics/e-commerce in Västra Götaland that value
// user-side experience, whether or not the ad names a system.
export const PROFILE_QUERIES = ['logistik', 'e-handel', 'order', 'supply chain'];
const REGION_VG = 'zdoY_6u5_Krt'; // Västra Götalands län (JobTech taxonomy)
const ROLE = /koordinator|coordinator|planerare|planner|administratör|specialist|analytiker|master ?data|support|ansvarig|superuser|kundservice|orderhandl|e-handel|e-commerce|logistik|supply|fulfil/i;
// Hands-on roles are not targets for either track.
const NOISE = /lagermedarbetare|lagerarbetare|truckförare|plockare|chaufför|terminalarbetare|packare|operatör|montör|svetsare|cnc/i;

export function toSignal(hit, query) {
  const text = `${hit.headline} ${hit.description?.text ?? ''}`;
  const systems = [...new Set((text.match(new RegExp(SYSTEMS.source, 'gi')) ?? []).map((s) => s.toUpperCase()))];
  return {
    id: String(hit.id),
    date: (hit.publication_date ?? '').slice(0, 10),
    employer: hit.employer?.name ?? '',
    headline: hit.headline ?? '',
    url: hit.webpage_url ?? '',
    systems: systems.join(' '),
    query,
    municipality: hit.workplace_address?.municipality ?? '',
  };
}

export function isRelevant(signal, track = 'system') {
  if (NOISE.test(signal.headline)) return false;
  return track === 'profil' ? ROLE.test(signal.headline) : Boolean(signal.systems);
}

export function readSeen(file = LOG) {
  if (!fs.existsSync(file)) return new Set();
  return new Set(fs.readFileSync(file, 'utf8').split('\n').slice(1).filter(Boolean).map((l) => l.split(',')[0].replaceAll('"', '')));
}

const csv = (v) => `"${String(v).replaceAll('"', '""')}"`;

async function fetchQuery(query, days, region) {
  const after = new Date(Date.now() - days * 864e5).toISOString().slice(0, 19);
  const params = new URLSearchParams({ q: query, limit: '100', 'published-after': after });
  if (region) params.set('region', region);
  const url = `${API}?${params}`;
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${query}: HTTP ${res.status}`);
  return (await res.json()).hits.map((h) => toSignal(h, query));
}

async function main(argv) {
  const days = Number(argv[argv.indexOf('--days') + 1]) || 14;
  const dry = argv.includes('--dry-run');
  const seen = readSeen();
  const fresh = new Map();
  const runs = [...QUERIES.map((q) => [q, 'system', null]), ...PROFILE_QUERIES.map((q) => [q, 'profil', REGION_VG])];
  for (const [q, track, region] of runs) {
    try {
      for (const s of await fetchQuery(q, days, region)) {
        if (isRelevant(s, track) && !seen.has(s.id) && !fresh.has(s.id)) fresh.set(s.id, { ...s, query: `${track}:${q}` });
      }
    } catch (err) {
      console.error(`varning: ${err.message}`);
    }
  }
  const list = [...fresh.values()].sort((a, b) => b.date.localeCompare(a.date));
  if (!dry && list.length) {
    if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, 'id,datum,arbetsgivare,rubrik,url,system,sokord,status\n');
    fs.appendFileSync(LOG, list.map((s) => [s.id, s.date, s.employer, `${s.headline}${s.municipality ? ` (${s.municipality})` : ''}`, s.url, s.systems, s.query, 'ny'].map(csv).join(',')).join('\n') + '\n');
  }
  console.log(JSON.stringify(list, null, 2));
  console.error(`${list.length} nya signaler (${days} dagar)${dry ? ' – dry run, inget sparat' : ''}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
