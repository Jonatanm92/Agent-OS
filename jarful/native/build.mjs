#!/usr/bin/env node
// Copies the web app into www/ for Capacitor and points it at the hosted API.
//   JARFUL_API_BASE=https://your-domain.com node build.mjs
import { cp, rm, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const api = process.env.JARFUL_API_BASE;
if (!api || !/^https:\/\//.test(api)) {
  console.error('Set JARFUL_API_BASE to your deployed https:// URL, e.g. JARFUL_API_BASE=https://jarful.app node build.mjs');
  process.exit(1);
}
const www = join(HERE, 'www');
await rm(www, { recursive: true, force: true });
await cp(join(HERE, '..', 'public'), www, { recursive: true });
// Marketing and legal pages stay on the website.
for (const f of await readdir(www)) if (f.endsWith('.html') && f !== 'index.html') await rm(join(www, f));
await rm(join(www, 'sw.js'));
await writeFile(join(www, 'config.js'), `window.JARFUL_CONFIG = ${JSON.stringify({ apiBase: api.replace(/\/$/, ''), native: true })};\n`);
console.log(`www/ ready → API ${api}`);
