/* Liten testmotor utan externa beroenden.
 * Laddar kärnfilerna som vanliga skript, precis som webbläsaren gör,
 * så att testerna kör exakt samma kod som appen. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const CORE = ['util.js', 'model.js', 'planner.js', 'language.js', 'apply.js', 'evening.js'];

function loadCore() {
  for (const file of CORE) {
    const source = fs.readFileSync(path.join(ROOT, 'core', file), 'utf8');
    vm.runInThisContext(source, { filename: `core/${file}` });
  }
  return globalThis.MinVardag;
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
    console.log(`  ✗ ${name}`);
    console.log(`      ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Förväntade sant');
}

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Fel värde'}: fick ${JSON.stringify(actual)}, väntade ${JSON.stringify(expected)}`);
  }
}

function deepEqual(actual, expected, message) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message || 'Fel värde'}:\n  fick    ${a}\n  väntade ${b}`);
}

function report() {
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`${results.passed} godkända, ${results.failed} underkända`);
  if (results.failed) {
    console.log('\nFel:');
    for (const f of results.failures) console.log(`  ${f.suite} → ${f.name}\n    ${f.error.stack.split('\n').slice(0, 3).join('\n    ')}`);
  }
  return results.failed === 0;
}

/* --- Testdata: PÅHITTADE personer. Riktiga uppgifter hör inte hemma i kod. --- */
function fixtureState(MV) {
  const state = MV.model.emptyState();
  state.children = [
    { id: 'barn_alva', name: 'Alva', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'barn_noa', name: 'Noa', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'barn_vide', name: 'Vide', createdAt: '2026-01-01T00:00:00.000Z' },
  ];
  return state;
}

/** Fast tidpunkt i Stockholmstid: 2026-09-16 är en onsdag. */
function at(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  // September = CEST (UTC+2)
  return new Date(Date.UTC(2026, 8, 16, h - 2, m, 0));
}

module.exports = { loadCore, suite, test, assert, equal, deepEqual, report, fixtureState, at, ROOT };
