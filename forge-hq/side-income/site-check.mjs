#!/usr/bin/env node
// Lead agent: fetches a small business's homepage once, finds concrete, fixable
// problems and drafts a personal outreach message (Swedish) around the best one.
// Usage: node forge-hq/side-income/site-check.mjs <url> [url…] | --file urls.txt

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const CURRENT_YEAR = new Date().getFullYear();

// Each check: severity 3 = visible to every visitor, 1 = minor.
export function analyze(html, { finalUrl = '', ms = 0, year = CURRENT_YEAR } = {}) {
  const findings = [];
  const add = (severity, issue, fix, price) => findings.push({ severity, issue, fix, price });
  const lower = html.toLowerCase();
  const text = lower.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');

  if (/lorem ipsum/.test(text)) {
    add(3, 'Det står platshållartext ("Lorem ipsum") på sidan', 'Skriva riktig text', '400–800 kr');
  }
  if (/hello world!|just another wordpress site|ännu en wordpress-webbplats|hej världen!/.test(text)) {
    add(3, 'Standardtext från WordPress ligger kvar ("Hello world" / "Just another WordPress site")', 'Ta bort/ersätta standardinnehåll', '300–600 kr');
  }
  if (finalUrl.startsWith('http://')) {
    add(3, 'Sidan saknar säker anslutning (https) – webbläsare varnar besökare', 'Aktivera SSL och omdirigering', '400–800 kr');
  }
  if (!/<meta[^>]+name=["']?viewport\b/.test(lower)) {
    add(3, 'Sidan är inte anpassad för mobil', 'Mobilanpassa (tema/viewport)', '600–1500 kr');
  }
  const years = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/g)].map((m) => Number(m[1]));
  if (years.length && Math.max(...years) < year - 1) {
    add(2, `Sidfoten visar ${Math.max(...years)} – sidan ser övergiven ut`, 'Uppdatera sidfot och gå igenom inaktuell info', '200–400 kr');
  }
  const title = (lower.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]?.trim() ?? '';
  if (title.length < 10) {
    add(2, title ? `Sidtiteln är bara "${title}" – syns dåligt på Google` : 'Sidtitel saknas – syns dåligt på Google', 'Skriva titel och beskrivning för Google', '300–600 kr');
  }
  if (!/<meta[^>]+name=["']?description\b/.test(lower)) {
    add(1, 'Beskrivning för Google (meta description) saknas', 'Skriva beskrivningar för huvudsidorna', '300–600 kr');
  }
  if (!/href=["']?tel:/.test(lower)) {
    add(2, 'Telefonnumret går inte att klicka på i mobilen', 'Klickbart nummer + tydlig kontaktknapp', '200–400 kr');
  }
  if (!/<form/.test(lower) && !/href=["']?mailto:/.test(lower)) {
    add(2, 'Inget kontaktformulär eller klickbar e-post på startsidan', 'Lägga till kontaktformulär', '400–800 kr');
  }
  if (ms > 4000) {
    add(2, `Startsidan tog ${(ms / 1000).toFixed(1)} s att ladda`, 'Optimera bilder/cache', '600–1500 kr');
  }
  return findings.sort((a, b) => b.severity - a.severity);
}

export function draftMessage(name, url, findings) {
  if (!findings.length) return null;
  const top = findings[0];
  return [
    `Hej${name ? ` ${name}` : ''}!`,
    '',
    `Jag var inne på ${url} och såg en sak: ${top.issue.charAt(0).toLowerCase()}${top.issue.slice(1)}.`,
    `Jag hjälper småföretag med sådant och kan fixa det inom ett dygn för ${top.price}. Du betalar först när du är nöjd.`,
    '',
    'Vill du att jag tar det?',
  ].join('\n');
}

async function check(url) {
  const started = Date.now();
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; site-check; one-time homepage review)' },
    signal: AbortSignal.timeout(15000),
  });
  const html = await res.text();
  const ms = Date.now() - started;
  return { finalUrl: res.url, status: res.status, findings: analyze(html, { finalUrl: res.url, ms }) };
}

async function main(argv) {
  let urls = argv;
  if (argv[0] === '--file') urls = fs.readFileSync(argv[1], 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!urls.length) {
    console.error('Användning: node site-check.mjs <url> [url…] | --file urls.txt');
    process.exit(1);
  }
  for (const raw of urls) {
    const url = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
    console.log(`\n## ${url}`);
    try {
      const r = await check(url);
      if (!r.findings.length) {
        console.log('Inga tydliga fel – hoppa över, lägg tiden på nästa.');
        continue;
      }
      for (const f of r.findings) console.log(`- [${'!'.repeat(f.severity)}] ${f.issue} → ${f.fix} (${f.price})`);
      console.log('\nUtkast till meddelande (kontrollera felet själv innan du skickar):\n');
      console.log(draftMessage('', r.finalUrl, r.findings));
    } catch (err) {
      console.log(`Kunde inte hämta sidan: ${err.message}`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
