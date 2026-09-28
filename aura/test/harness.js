/* Minimal test runner with no dependencies.
 * Loads the core files as plain scripts — exactly as the browser does — so
 * the tests run the same code the app runs. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const CORE = [
  'util.js', 'i18n.js', 'model.js', 'items.js', 'planner.js', 'routines.js', 'engine.js', 'apply.js',
  'parse.js', 'evening.js', 'patterns.js', 'review.js', 'search.js', 'cycle.js', 'reflect.js',
  'notify.js', 'compact.js',
];

function loadCore() {
  if (globalThis.Aura && globalThis.Aura.__loaded) return globalThis.Aura;
  for (const file of CORE) {
    const full = path.join(ROOT, 'core', file);
    if (!fs.existsSync(full)) continue;
    vm.runInThisContext(fs.readFileSync(full, 'utf8'), { filename: `core/${file}` });
  }
  globalThis.Aura.__loaded = true;
  return globalThis.Aura;
}

function loadApp(files) {
  for (const file of files) {
    vm.runInThisContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), { filename: file });
  }
  return globalThis.Aura;
}

const results = { passed: 0, failed: 0, failures: [] };
let current = '';

function suite(name, fn) {
  current = name;
  console.log(`\n${name}`);
  fn();
}

function test(name, fn) {
  try {
    fn();
    results.passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.failed += 1;
    results.failures.push({ suite: current, name, error });
    console.log(`  ✗ ${name}\n      ${error.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    results.passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.failed += 1;
    results.failures.push({ suite: current, name, error });
    console.log(`  ✗ ${name}\n      ${error.message}`);
  }
}

function assert(condition, message) { if (!condition) throw new Error(message || 'expected true'); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message || 'wrong value'}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}
function deepEqual(actual, expected, message) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message || 'wrong value'}:\n  got      ${a}\n  expected ${b}`);
}

function report() {
  console.log(`\n${'─'.repeat(56)}\n${results.passed} passed, ${results.failed} failed`);
  if (results.failed) {
    console.log('\nFailures:');
    for (const f of results.failures) console.log(`  ${f.suite} → ${f.name}\n    ${f.error.stack.split('\n').slice(0, 4).join('\n    ')}`);
  }
  return results.failed === 0;
}

/* Fixed time in Europe/Stockholm. 2026-09-29 is a Tuesday (CEST, UTC+2). */
function at(dateKey, hhmm) {
  const [y, mo, d] = dateKey.split('-').map(Number);
  const [h, m] = hhmm.split(':').map(Number);
  const offset = mo >= 4 && mo <= 10 ? 2 : 1;   // good enough for test dates away from DST switches
  return new Date(Date.UTC(y, mo - 1, d, h - offset, m, 0));
}

const TODAY = '2026-09-29';

/* Test data uses invented people only. Real personal data never belongs in code. */
function freshState(A, prefs) {
  const s = A.model.emptyState();
  s.prefs = Object.assign(s.prefs, {
    language: 'en', timeZone: 'Europe/Stockholm', wake: '07:00', sleep: '23:00',
    workDays: [1, 2, 3, 4, 5], workStart: '', workEnd: '', onboarded: true,
  }, prefs || {});
  A.util.setTimeZone('Europe/Stockholm');
  A.i18n.setLanguage(s.prefs.language);
  return s;
}

function addItems(A, state, list, now) {
  const r = A.apply.applyOps(state, list.map((item) => ({ op: 'item.add', item })), now || at(TODAY, '08:00'));
  return r.state;
}

module.exports = {
  loadCore, loadApp, suite, test, testAsync, assert, equal, deepEqual, report, at, TODAY, freshState, addItems, ROOT,
};
