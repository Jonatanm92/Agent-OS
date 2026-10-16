import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Load the page's inline script without a DOM. Its pure helpers and content tables
// become reachable in the context; boot() only runs when `document` exists.
const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
assert.equal(scripts.length, 1, 'expected exactly one inline script');
const ctx = vm.createContext({ console, Intl, setTimeout, clearTimeout });
vm.runInContext(scripts[0], ctx, { filename: 'app/index.html' });
const run = code => vm.runInContext(code, ctx);

test('page has a title and both theme blocks', () => {
  assert.match(html, /^<title>Kassasprint<\/title>/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.match(html, /:root\[data-theme="dark"\]/);
});

test('default due date is the last weekday of the month', () => {
  assert.equal(run("defaultDueDate('2026-10-16')"), '2026-10-30'); // 31 Oct 2026 is a Saturday
  assert.equal(run("defaultDueDate('2026-11-02')"), '2026-11-30');
  assert.equal(run("defaultDueDate('2026-10-31')"), '2026-11-30');
});

test('gap math counts logged income and spreads the rest per day', () => {
  const calc = run("computeGap({ rent: '7450', extra: '1000', startCash: '1200', dueDate: '2026-10-30' }, 2000, '2026-10-16')");
  assert.equal(calc.need, 8450);
  assert.equal(calc.have, 3200);
  assert.equal(calc.gap, 5250);
  assert.equal(calc.daysLeft, 14);
  assert.equal(calc.perDay, 375);
  const covered = run("computeGap({ rent: 5000, startCash: 6000, dueDate: '2026-10-30' }, 0, '2026-10-16')");
  assert.equal(covered.gap, 0);
});

test('num() reads Swedish-formatted amounts', () => {
  assert.equal(run("num('7 450')"), 7450);
  assert.equal(run("num('12,5')"), 12.5);
  assert.equal(run("num('abc')"), 0);
});

test('templates fill known values and keep visible placeholders for the rest', () => {
  const out = run("fillTemplate(SCRIPTS.find(s => s.id === 'hemsida_mejl').text, templateVars({ myName: 'Jonatan', myCity: 'Vänersborg' }, { name: 'Salong X', contact: '', link: '' }))");
  assert.match(out, /^Hej! Jag heter Jonatan och bor i Vänersborg/);
  assert.match(out, /Salong X/);
  assert.match(out, /\[länk till demo\]/);
  assert.match(out, /\[ditt nummer\]/);
  assert.match(out, /2\u00a0900 kr plus moms/);
  assert.doesNotMatch(out, /\{[a-z_]+\}/i);
});

test('every script fills without leftover tokens', () => {
  const leftovers = run("SCRIPTS.map(s => [s.id, fillTemplate(s.text, templateVars({}, null))]).filter(([, t]) => /\\{[A-Za-z_]+\\}/.test(t)).map(([id]) => id)");
  assert.deepEqual([...leftovers], []);
});

test('every play, task and offer points at scripts and plays that exist', () => {
  const missing = run(`(() => {
    const ids = new Set(SCRIPTS.map(s => s.id));
    const plays = new Set(PLAYS.map(p => p.id));
    const out = [];
    PLAYS.forEach(p => p.scripts.forEach(id => ids.has(id) || out.push('play ' + p.id + ' -> ' + id)));
    ONCE_TASKS.forEach(t => { if (t.script && !ids.has(t.script)) out.push('task ' + t.id); if (t.play && !plays.has(t.play)) out.push('task ' + t.id); });
    Object.entries(OFFERS).forEach(([k, o]) => { Object.values(o.first).concat(o.follow).forEach(id => ids.has(id) || out.push('offer ' + k + ' -> ' + id)); if (!INCOME_SOURCES.includes(o.income)) out.push('income ' + k); });
    if (ids.size !== SCRIPTS.length) out.push('duplicate script id');
    if (plays.size !== PLAYS.length) out.push('duplicate play id');
    return out;
  })()`);
  assert.deepEqual([...missing], []);
});

test('pipeline status moves schedule the next follow-up', () => {
  const contacted = run("statusPatch('kontaktad', '2026-10-16')");
  assert.equal(contacted.contactedAt, '2026-10-16');
  assert.equal(contacted.nextAt, '2026-10-19');
  assert.equal(run("isDue({ status: 'kontaktad', nextAt: '2026-10-19' }, '2026-10-19')"), true);
  assert.equal(run("isDue({ status: 'betalt', nextAt: '2026-10-01' }, '2026-10-19')"), false);
  assert.equal(run("scriptFor({ offer: 'hemsida', channel: 'telefon' }, 'first')"), 'hemsida_tel');
  assert.equal(run("scriptFor({ offer: 'hemsida', channel: 'mejl' }, 'first')"), 'hemsida_mejl');
  assert.equal(run("scriptFor({ offer: 'hemsida', channel: 'mejl' }, 'follow')"), 'hemsida_folj');
});

test('consent warning covers mail and sms to sole traders and unknown forms', () => {
  assert.equal(run("needsConsentWarning('ef', 'sms')"), true);
  assert.equal(run("needsConsentWarning('okand', 'mejl')"), true);
  assert.equal(run("needsConsentWarning('ab', 'mejl')"), false);
  assert.equal(run("needsConsentWarning('ef', 'besok')"), false);
});

test('escaping and URL checks used by the pipeline', () => {
  assert.equal(run("esc('<b>\"x\"</b>')"), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
  assert.equal(run("safeUrl('javascript:alert(1)')"), '');
  assert.equal(run("safeUrl('https://x.netlify.app')"), 'https://x.netlify.app');
});

test('demo links come from the lead or the demo base address', () => {
  assert.equal(run("leadLink({ demoPath: 'clippers-corner' }, { demoBase: 'https://x.netlify.app/' })"), 'https://x.netlify.app/clippers-corner/');
  assert.equal(run("leadLink({ link: 'https://own.example', demoPath: 'a' }, { demoBase: 'https://x.netlify.app' })"), 'https://own.example');
  assert.equal(run("leadLink({ demoPath: 'a' }, {})"), '');
});

test('invoiced work counts net in the plan', () => {
  assert.equal(run('netOf(2900)'), 1330);
  assert.equal(run("mixTotal({ mix: { sites: 2, sell: 1000 } })"), 2 * 1330 + 1000);
});
