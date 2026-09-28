/* Aura — static checks: syntax, strings, privacy rules and offline coverage.
 *   node test/lint.js
 *
 * "Shipped" means what the Vercel deployment serves: the root page, its
 * modules, core/ and assets/. The earlier claude.ai build in app/ and the
 * tests are not shipped and not checked here. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const rootJs = fs.readdirSync(ROOT).filter((name) => name.endsWith('.js'));
const html = ['index.html', 'install.html'];
const swSource = read('sw.js');

/* The engine files the page loads, taken from the service worker (one list). */
const box = { self: { addEventListener() {} } };
vm.runInNewContext(`${swSource}\n;this.__CORE = CORE; this.__ENGINE = ENGINE;`, box);
const CORE = box.__CORE;
const ENGINE = box.__ENGINE.map((url) => url.slice(1).split('?')[0]);
const shippedJs = [...rootJs, ...ENGINE];

let problems = 0;
function problem(msg) { problems += 1; console.log(`  ✗ ${msg}`); }
function ok(msg) { console.log(`  ✓ ${msg}`); }

console.log('\nSyntax');
let syntaxOk = true;
for (const f of [...shippedJs, ...fs.readdirSync(path.join(ROOT, 'test')).filter((n) => n.endsWith('.js')).map((n) => `test/${n}`)]) {
  try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' }); } catch (e) { syntaxOk = false; problem(`${f}: ${String(e.stderr).split('\n').slice(0, 4).join(' ')}`); }
}
if (syntaxOk) ok(`every script parses (${shippedJs.length} shipped)`);

console.log('\nEngine strings');
const defined = new Set();
const pairRe = /'([a-zA-Z][\w.]*)':\s*\[\s*(['"`])((?:\\.|(?!\2).)*)\2\s*,\s*(['"`])((?:\\.|(?!\4).)*)\4\s*\]/g;
for (const f of ENGINE) {
  const text = read(f);
  let m;
  while ((m = pairRe.exec(text))) {
    defined.add(m[1]);
    if (!m[3].trim() || !m[5].trim()) problem(`${f}: empty translation for ${m[1]}`);
    const sv = new Set(m[3].match(/\{(\w+)\}/g) || []), en = new Set(m[5].match(/\{(\w+)\}/g) || []);
    if ([...sv].sort().join() !== [...en].sort().join()) problem(`${f}: ${m[1]} uses different placeholders in sv and en`);
  }
}
let missing = 0;
for (const f of [...ENGINE, 'everyday.js', 'life.js']) {
  const text = read(f).split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n');
  for (const m of text.matchAll(/\b(?:I\.)?t\(\s*[`'"]([a-zA-Z][\w.]*)[`'"]/g)) {
    if (!defined.has(m[1])) { missing += 1; problem(`${f}: string '${m[1]}' is used but not defined`); }
  }
}
if (!missing) ok(`every engine string used is defined in Swedish and English (${defined.size} strings)`);

console.log('\nPrivacy and security rules');
const rules = [
  [/\b(Jossan|Josefin|Jonatan)\b/, 'a real person’s name in code (it belongs in stored preferences)'],
  [/console\.(log|info|debug|warn|error)\(/, 'console logging (could leak private context)'],
  [/(^|[^.\w])(alert|confirm|prompt)\(/, 'a blocking browser dialog'],
  [/\beval\(|new Function\(/, 'dynamic code evaluation (blocked by the CSP)'],
  [/fetch\(\s*[`'"]https?:/, 'a request to another host (connect-src is self only)'],
  [/innerHTML\s*=\s*[^`'"]*\+\s*[a-z]/i, 'string-concatenated innerHTML (use escaped templates)'],
  [/localStorage\.setItem\((?!STORAGE_KEY)/, 'a second localStorage key (everything lives in one private state)'],
];
let ruleHits = 0;
for (const f of shippedJs) {
  read(f).split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const [re, label] of rules) if (re.test(line)) { ruleHits += 1; problem(`${f}:${i + 1} ${label}: ${line.trim().slice(0, 100)}`); }
  });
}
for (const f of html) {
  read(f).split('\n').forEach((line, i) => {
    if (/\son(click|submit|change|input|load|error)=/i.test(line)) { ruleHits += 1; problem(`${f}:${i + 1} an inline event handler (blocked by the CSP)`); }
    if (/<script>(?!\s*<\/script>)/.test(line)) { ruleHits += 1; problem(`${f}:${i + 1} an inline script (blocked by the CSP)`); }
  });
}
if (!ruleHits) ok('no personal names, logging, dialogs, eval, foreign requests, inline handlers or inline scripts');

console.log('\nPage, modules and offline cache');
const page = read('index.html');
const classic = Array.from(page.matchAll(/<script src="\/([^"?]+)(?:\?[^"]*)?"><\/script>/g)).map((m) => m[1]);
if (classic.join() !== ENGINE.join()) problem(`index.html loads engine scripts ${classic.join(', ')} but the service worker caches ${ENGINE.join(', ')}`);
else ok(`index.html loads the ${ENGINE.length} engine scripts in the order the service worker caches them`);
for (const f of ENGINE) if (!fs.existsSync(path.join(ROOT, f))) problem(`missing engine file ${f}`);

const cached = new Set(CORE);
const needed = new Set();
for (const m of page.matchAll(/(?:src|href)="(\/[^"#]+)"/g)) needed.add(m[1]);
for (const f of rootJs) {
  for (const m of read(f).matchAll(/(?:import|from)\s*["'](\.\/[^"']+)["']/g)) needed.add(m[1].replace(/^\./, ''));
}
const uncached = [...needed].filter((url) => !cached.has(url) && !/^\/(sw\.js)$/.test(url));
if (uncached.length) problem(`not in the service worker cache (offline would break): ${uncached.join(', ')}`);
else ok(`every page asset and module import is cached for offline use (${needed.size} checked)`);
const missingFiles = CORE.filter((url) => url !== '/' && !fs.existsSync(path.join(ROOT, url.split('?')[0])));
if (missingFiles.length) problem(`the service worker caches files that do not exist: ${missingFiles.join(', ')}`);

const iconNames = new Set();
for (const f of rootJs) {
  for (const m of read(f).matchAll(/\bicon\(\s*"([a-z0-9-]+)"/g)) iconNames.add(m[1]);
  for (const m of read(f).matchAll(/\bicon:\s*"([a-z0-9-]+)"/g)) iconNames.add(m[1]);
}
const missingIcons = [...iconNames].filter((name) => !fs.existsSync(path.join(ROOT, 'assets/icons', `${name}.svg`)));
if (missingIcons.length) problem(`icons used but missing: ${missingIcons.join(', ')}`);
else ok(`all ${iconNames.size} icons used exist`);
if (!/<title>[^<]{2,60}<\/title>/.test(page.slice(0, 8000))) problem('index.html needs a <title>');

console.log(`\n${'─'.repeat(56)}\n${problems ? `${problems} problem(s)` : 'lint clean'}`);
process.exit(problems ? 1 : 0);
