import test from 'node:test';
import assert from 'node:assert/strict';

import * as C from '../public/js/core.js';
import { morningAdvice, planDay, routeIntent, offlineReply, buildCoachContext, askAgentOs, weekendPlan } from '../public/js/coach.js';
import { buildDemoState } from '../public/js/demo.js';
import { html, md, esc, raw } from '../public/js/ui.js';

process.env.TZ = 'Europe/Stockholm';
const KEY = '2026-10-17';

function demo() {
  return buildDemoState(new Date(2026, 9, 17, 9, 0));
}

test('morning advice adapts to sleep, energy and mood', () => {
  assert.equal(morningAdvice(null), null);
  assert.equal(morningAdvice({ sleep: 4, energy: 4, mood: 1 }).tone, 'care');
  assert.match(morningAdvice({ sleep: 1, energy: 4, mood: 4 }).text, /Kort natt/);
  assert.match(morningAdvice({ sleep: 3, energy: 1, mood: 3 }).text, /Låg energi/);
  assert.match(morningAdvice({ sleep: 5, energy: 5, mood: 4 }).text, /Full tank/);
});

test('day plan is ordered by time and adapts to low energy', () => {
  const s = demo();
  const plan = planDay(s, KEY);
  assert.equal(plan.blocks.length, 5);
  const minutes = plan.blocks.map((b) => C.minutesOfDay(b.time));
  assert.deepEqual(minutes, minutes.slice().sort((a, b) => a - b));
  assert.ok(plan.blocks.some((b) => b.area === 'family' && b.time === s.settings.familyStart));
  s.days[KEY].checkin = { sleep: 1, energy: 1, mood: 3 };
  const tired = planDay(s, KEY);
  assert.equal(tired.tired, true);
  assert.match(tired.blocks.find((b) => b.area === 'money').detail, /2 × 25 min/);
});

test('free text is routed to the right offline intent', () => {
  assert.equal(routeIntent('Jag är så trött och stressad'), 'stress');
  assert.equal(routeIntent('Vad kan vi hitta på i helgen?'), 'weekend');
  assert.equal(routeIntent('Hur tjänar jag mer pengar?'), 'money');
  assert.equal(routeIntent('Hur går min vecka?'), 'week');
  assert.equal(routeIntent('Planera dagen'), 'plan');
  assert.equal(routeIntent('Berätta ett skämt'), null);
});

test('every offline intent returns useful Markdown', () => {
  const s = demo();
  for (const intent of ['plan', 'weekend', 'money', 'stress', 'week', null]) {
    const text = offlineReply(intent, s, KEY);
    assert.ok(text.length > 40, String(intent));
  }
  assert.match(offlineReply('money', s, KEY), /Tre steg idag/);
  assert.match(offlineReply('stress', s, KEY), /1177/);
  const noKids = C.createDefaultState();
  assert.match(weekendPlan(noKids, KEY), /Lägg till dina barn/);
});

test('coach context shares ages by default and names only when allowed', () => {
  const s = demo();
  const ctx = buildCoachContext(s, KEY);
  assert.ok(!ctx.includes('Elsa'));
  assert.match(ctx, /6 år/);
  assert.match(ctx, /Månadens inkomstmål/);
  s.settings.coach.shareNames = true;
  assert.match(buildCoachContext(s, KEY), /Elsa \(6 år\)/);
});

test('askAgentOs goes through the Life OS server by default and sends context once', async () => {
  const s = demo();
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts, body: JSON.parse(opts.body) });
    return { ok: true, status: 200, text: async () => JSON.stringify({ reply: 'Gör så här…', conversationId: 'conv-1', model: 'owl' }) };
  };
  const first = await askAgentOs({ question: 'Hjälp mig', state: s, key: KEY, settings: s.settings, serverToken: 'tok', fetchImpl: fakeFetch });
  assert.equal(first.reply, 'Gör så här…');
  assert.equal(first.conversationId, 'conv-1');
  assert.equal(calls[0].url, './api/coach');
  assert.equal(calls[0].opts.headers['x-life-os-token'], 'tok');
  assert.match(calls[0].body.message, /Min fråga: Hjälp mig/);
  assert.equal(calls[0].body.agentic, false);

  await askAgentOs({ question: 'Och sen?', state: s, key: KEY, conversationId: 'conv-1', settings: s.settings, fetchImpl: fakeFetch });
  assert.equal(calls[1].body.message, 'Och sen?');
  assert.equal(calls[1].body.conversationId, 'conv-1');

  s.settings.coach.agentOsUrl = 'http://127.0.0.1:3001/';
  s.settings.coach.agentOsToken = 'secret';
  await askAgentOs({ question: 'Direkt', state: s, key: KEY, settings: s.settings, fetchImpl: fakeFetch });
  assert.equal(calls[2].url, 'http://127.0.0.1:3001/api/chat');
  assert.equal(calls[2].opts.headers['x-agentos-token'], 'secret');

  const failing = async () => ({ ok: false, status: 502, text: async () => JSON.stringify({ error: 'Agent OS unreachable' }) });
  await assert.rejects(askAgentOs({ question: 'x', state: s, key: KEY, settings: s.settings, fetchImpl: failing }), /Agent OS unreachable/);
});

test('the HTML template escapes interpolations and Markdown stays safe', () => {
  const evil = '<img src=x onerror=alert(1)>';
  assert.equal(String(html`<p>${evil}</p>`), `<p>${esc(evil)}</p>`);
  assert.equal(String(html`<p>${raw('<b>ok</b>')}</p>`), '<p><b>ok</b></p>');
  assert.equal(String(html`${[1, 2].map((n) => html`<i>${n}</i>`)}`), '<i>1</i><i>2</i>');
  assert.equal(String(html`${null}${false}${undefined}`), '');
  const out = String(md(`## Rubrik\n- **fet** <script>alert(1)</script>\n1. ett\n\nText med _kursiv_ och \`kod\``));
  assert.ok(!out.includes('<script>'));
  assert.match(out, /<h3>Rubrik<\/h3>/);
  assert.match(out, /<ul><li><strong>fet<\/strong> &lt;script&gt;/);
  assert.match(out, /<ol><li>ett<\/li><\/ol>/);
  assert.match(out, /<em>kursiv<\/em>/);
  assert.match(out, /<code>kod<\/code>/);
});
