/* Aura — copy exactly what the Vercel deployment serves into dist/.
 *   node test/bundle.js   → aura/dist/
 *
 * dist/ mirrors the project root on Vercel. Copy its contents over the
 * project's own files; keep the project's api/ folder (the Gemini coach
 * function) and vercel.json (security headers) — neither is part of this. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const box = { self: { addEventListener() {} } };
vm.runInNewContext(`${fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')}\n;this.__CORE = CORE;`, box);

const files = new Set(['sw.js', 'manifest.webmanifest', 'icon.svg', 'index.html', 'install.html']);
for (const url of box.__CORE) if (url !== '/') files.add(url.slice(1).split('?')[0]);
for (const name of fs.readdirSync(ROOT)) if (/\.(js|css)$/.test(name)) files.add(name);
(function walk(dir) {
  for (const name of fs.readdirSync(path.join(ROOT, dir))) {
    const relPath = path.join(dir, name);
    if (fs.statSync(path.join(ROOT, relPath)).isDirectory()) walk(relPath); else files.add(relPath.split(path.sep).join('/'));
  }
}('assets'));

fs.rmSync(OUT, { recursive: true, force: true });
let bytes = 0;
for (const file of [...files].sort()) {
  const from = path.join(ROOT, file);
  if (!fs.existsSync(from)) { console.error(`missing: ${file}`); process.exitCode = 1; continue; }
  fs.mkdirSync(path.dirname(path.join(OUT, file)), { recursive: true });
  fs.copyFileSync(from, path.join(OUT, file));
  bytes += fs.statSync(from).size;
}
console.log(`dist/ — ${files.size} files, ${(bytes / 1024 / 1024).toFixed(1)} MB. Keep the project's api/ and vercel.json.`);
