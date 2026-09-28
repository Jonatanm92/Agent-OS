/* Aura — static checks: syntax, strings, privacy and platform rules.
 *   node test/lint.js */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const files = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { if (name !== 'node_modules') walk(full); } else if (/\.(js|html)$/.test(name)) files.push(full);
  }
}(ROOT));
const source = files.filter((f) => !f.includes(`${path.sep}test${path.sep}`));
const rel = (f) => path.relative(ROOT, f);

let problems = 0;
function problem(msg) { problems += 1; console.log(`  ✗ ${msg}`); }
function ok(msg) { console.log(`  ✓ ${msg}`); }

console.log('\nSyntax');
let syntaxOk = true;
for (const f of files.filter((x) => x.endsWith('.js'))) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { syntaxOk = false; problem(`${rel(f)}: ${String(e.stderr).split('\n').slice(0, 4).join(' ')}`); }
}
if (syntaxOk) ok('every script parses');

console.log('\nStrings');
const defined = new Set();
const pairRe = /'([a-zA-Z][\w.]*)':\s*\[\s*(['"`])((?:\\.|(?!\2).)*)\2\s*,\s*(['"`])((?:\\.|(?!\4).)*)\4\s*\]/g;
for (const f of source) {
  const text = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = pairRe.exec(text))) {
    defined.add(m[1]);
    if (!m[3].trim() || !m[5].trim()) problem(`${rel(f)}: empty translation for ${m[1]}`);
    const sv = (m[3].match(/\{(\w+)\}/g) || []).sort().join(), en = (m[5].match(/\{(\w+)\}/g) || []).sort().join();
    const svSet = new Set(m[3].match(/\{(\w+)\}/g) || []), enSet = new Set(m[5].match(/\{(\w+)\}/g) || []);
    if ([...svSet].sort().join() !== [...enSet].sort().join()) problem(`${rel(f)}: ${m[1]} uses different placeholders in sv (${sv}) and en (${en})`);
  }
}
let missing = 0;
for (const f of source) {
  const text = fs.readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n');
  const useRe = /\bt\(\s*'([a-zA-Z][\w.]*)'/g;
  let m;
  while ((m = useRe.exec(text))) {
    if (!defined.has(m[1])) { missing += 1; problem(`${rel(f)}: string '${m[1]}' is used but not defined`); }
  }
}
if (!missing) ok(`every string used is defined in both languages (${defined.size} strings)`);

console.log('\nPrivacy and platform rules');
const rules = [
  [/\b(Jossan|Josefin|Jonatan)\b/, 'a real person’s name in code'],
  [/console\.(log|info|debug|warn)\(/, 'console logging (could leak private context)'],
  [/(^|[^.\w])(alert|confirm|prompt)\(/, 'a browser dialog (blocked inside artifacts)'],
  [/\son(click|submit|change|input|load)=/i, 'an inline event handler (CSP)'],
  [/https?:\/\/(?!fonts\.(googleapis|gstatic)\.com)[a-z0-9.-]+\.[a-z]{2,}/i, 'an external host other than Google Fonts'],
  [/\beval\(|new Function\(/, 'dynamic code evaluation'],
  [/innerHTML\s*=\s*[^`'"]*\+\s*[a-z]/i, 'string-concatenated innerHTML (use escaped templates)'],
];
let ruleHits = 0;
for (const f of source) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const [re, label] of rules) {
      if (re.test(line)) { ruleHits += 1; problem(`${rel(f)}:${i + 1} ${label}: ${line.trim().slice(0, 100)}`); }
    }
  });
}
if (!ruleHits) ok('no personal names, logging, browser dialogs, inline handlers, foreign hosts or eval');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = Array.from(html.matchAll(/<script src="([^"]+)"/g)).map((m) => m[1]);
const missingScripts = scripts.filter((s) => !fs.existsSync(path.join(ROOT, s)));
const unlisted = source.filter((f) => f.endsWith('.js')).map(rel).filter((r) => !scripts.includes(r.split(path.sep).join('/')));
if (missingScripts.length) problem(`index.html loads missing files: ${missingScripts.join(', ')}`);
if (unlisted.length) problem(`scripts not loaded by index.html: ${unlisted.join(', ')}`);
if (!missingScripts.length && !unlisted.length) ok(`index.html loads exactly the ${scripts.length} app scripts`);
if (!/<title>[^<]{2,40}<\/title>/.test(html.slice(0, 8000))) problem('index.html needs a <title> in its first 8 KB');

console.log(`\n${'─'.repeat(56)}\n${problems ? `${problems} problem(s)` : 'lint clean'}`);
process.exit(problems ? 1 : 0);
