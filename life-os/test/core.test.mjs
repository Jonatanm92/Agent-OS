import test from 'node:test';
import assert from 'node:assert/strict';

import * as C from '../public/js/core.js';
import { buildDemoState } from '../public/js/demo.js';

// Swedish local time, including the DST switches in March and October.
process.env.TZ = 'Europe/Stockholm';

const nbsp = (s) => s.replace(/[  ]/g, ' ');

test('date keys survive DST transitions', () => {
  assert.equal(C.addDays('2026-03-28', 1), '2026-03-29');
  assert.equal(C.addDays('2026-03-29', 1), '2026-03-30');
  assert.equal(C.addDays('2026-10-24', 2), '2026-10-26');
  assert.equal(C.addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(C.diffDays('2026-03-28', '2026-03-31'), 3);
  assert.equal(C.diffDays('2026-10-31', '2026-10-24'), -7);
  assert.equal(C.parseKey('2026-02-30'), null);
  assert.equal(C.parseKey('nope'), null);
});

test('ISO weeks follow the Swedish calendar', () => {
  assert.deepEqual(C.isoWeek('2026-10-17'), { year: 2026, week: 42 });
  assert.deepEqual(C.isoWeek('2021-01-03'), { year: 2020, week: 53 });
  assert.deepEqual(C.isoWeek('2026-01-01'), { year: 2026, week: 1 });
  assert.deepEqual(C.isoWeek('2024-12-30'), { year: 2025, week: 1 });
  assert.equal(C.weekKey('2026-10-17'), '2026-W42');
  const days = C.weekDays('2026-W42');
  assert.equal(days.length, 7);
  assert.equal(days[0], '2026-10-12');
  assert.equal(days[6], '2026-10-18');
  assert.equal(C.weekDays('2026-W01')[0], '2025-12-29');
  assert.equal(C.shiftWeek('2026-W01', -1), '2025-W52');
  assert.equal(C.shiftWeek('2020-W53', 1), '2021-W01');
  assert.equal(C.weekStartKey('2026-10-18'), '2026-10-12');
});

test('ages are computed in years, months and days', () => {
  assert.deepEqual(
    (({ years, months, days }) => ({ years, months, days }))(C.ageParts('2020-03-02', '2026-10-17')),
    { years: 6, months: 7, days: 15 },
  );
  assert.equal(C.formatAge(C.ageParts('2020-03-02', '2026-10-17')), '6 år');
  assert.equal(C.formatAge(C.ageParts('2023-08-17', '2026-10-17')), '3 år 2 mån');
  assert.equal(C.formatAge(C.ageParts('2026-09-01', '2026-10-17')), '1 mån');
  assert.equal(C.formatAge(C.ageParts('2026-10-10', '2026-10-17')), '1 v');
  assert.equal(C.formatAge(C.ageParts('2026-10-17', '2026-10-17')), 'nyfödd');
  assert.equal(C.ageParts('2027-01-01', '2026-10-17'), null);
  const leap = C.ageParts('2020-02-29', '2021-02-28');
  assert.equal(leap.years, 0);
  assert.equal(leap.months, 11);
  assert.equal(C.daysUntilBirthday('2020-02-29', '2021-02-28'), 0);
  assert.equal(C.daysUntilBirthday('2020-10-20', '2026-10-17'), 3);
  assert.equal(C.daysUntilBirthday('2020-10-10', '2026-10-17'), 358);
});

test('formatting uses Swedish conventions', () => {
  assert.equal(nbsp(C.formatSek(12400)), '12 400 kr');
  assert.equal(C.formatMinutes(45), '45 min');
  assert.equal(C.formatMinutes(80), '1 h 20 min');
  assert.equal(C.formatMinutes(120), '2 h');
  assert.equal(C.formatDecimal(3.456), '3,5');
  assert.equal(C.formatClock(65_000), '01:05');
  assert.equal(C.formatClock(3_725_000), '1:02:05');
  assert.equal(C.formatDateLong('2026-10-17'), 'lördag 17 oktober');
  assert.equal(C.num('30 000'), 30000);
  assert.equal(C.num('1,5'), 1.5);
  assert.equal(C.num('abc', 7), 7);
  assert.equal(C.greeting(7), 'God morgon');
  assert.equal(C.greeting(19), 'God kväll');
  assert.equal(C.greeting(2), 'God natt');
});

test('day score balances check-in, three priorities, mission, money, habits and reflection', () => {
  const habits = ['a', 'b'];
  assert.equal(C.dayScore(C.emptyDay(), habits).score, 0);
  const day = C.emptyDay();
  day.checkin = { sleep: 4, energy: 4, mood: 4 };
  day.priorities.family = { text: 'Lek', done: true };
  day.priorities.money = { text: '', done: true }; // empty text never counts
  day.mission.done = true;
  assert.equal(C.dayScore(day, habits).score, 40);
  day.priorities.money = { text: 'Offert', done: true };
  day.priorities.self = { text: 'Löpning', done: true };
  day.money.done = true;
  day.habits = { a: true, b: true };
  day.reflection = { wins: 'x' };
  assert.equal(C.dayScore(day, habits).score, 100);
  // Without habits the score is normalised over the remaining 85 points.
  assert.equal(C.dayScore(day, []).score, 100);
});

test('streaks stay alive until today is over', () => {
  const s = C.createDefaultState();
  for (const key of ['2026-10-17', '2026-10-16', '2026-10-15', '2026-10-13']) {
    C.ensureDay(s, key).checkin = { sleep: 3, energy: 3, mood: 3 };
  }
  assert.equal(C.streak(s, '2026-10-17', C.PREDICATES.checkin), 3);
  assert.equal(C.streak(s, '2026-10-18', C.PREDICATES.checkin), 3);
  assert.equal(C.streak(s, '2026-10-19', C.PREDICATES.checkin), 0);
});

test('tomorrow\'s most important thing carries into the next day', () => {
  const s = C.createDefaultState();
  C.ensureDay(s, '2026-10-16').reflection = { wins: '', tomorrow: 'Ring kommunen', tomorrowArea: 'money' };
  const next = C.ensureDay(s, '2026-10-17');
  assert.equal(next.priorities.money.text, 'Ring kommunen');
  assert.equal(next.seeded, true);
  assert.equal(C.ensureDay(s, '2026-10-18').priorities.money.text, '');
});

test('money forecast reports pace and what is needed per week', () => {
  const f = C.moneyForecast(30000, 12000, '2026-10-15');
  assert.equal(Math.round(f.pace), 24800);
  assert.equal(f.remaining, 18000);
  assert.equal(f.daysLeft, 17);
  assert.equal(Math.round(f.perWeek), Math.round((18000 / 17) * 7));
  assert.equal(f.onTrack, false);
  assert.equal(C.moneyForecast(30000, 31000, '2026-10-15').reached, true);
  assert.equal(C.moneyForecast(0, 500, '2026-10-15').pct, 0);
});

test('pipeline summary weights open deals and flags overdue next steps', () => {
  const deals = [
    { id: '1', stage: 'offer', value: 1000, nextDate: '2026-10-16' },
    { id: '2', stage: 'lead', value: 2000, nextDate: '2026-10-20' },
    { id: '3', stage: 'paid', value: 5000, nextDate: '2026-10-01' },
    { id: '4', stage: 'won', value: 1000, nextDate: '2026-10-17' },
  ];
  const p = C.pipelineSummary(deals, '2026-10-17');
  assert.equal(p.openCount, 3);
  assert.equal(p.openValue, 4000);
  assert.equal(p.weighted, 1000 * 0.5 + 2000 * 0.1 + 1000 * 0.9);
  assert.deepEqual(p.overdue.map((d) => d.id), ['1']);
  assert.deepEqual(p.dueToday.map((d) => d.id), ['4']);
  assert.deepEqual(p.open.map((d) => d.id), ['1', '4', '2']);
  assert.equal(C.nextStage('offer', 1), 'won');
  assert.equal(C.nextStage('lead', -1), 'lead');
  assert.equal(C.nextStage('paid', 1), 'paid');
  assert.equal(C.nextStage('lost', 1), 'lead');
});

test('kronor per hour per income stream', () => {
  const s = C.createDefaultState();
  s.income.push({ date: '2026-10-03', amount: 1900, streamId: 'bidsprint' }, { date: '2026-09-30', amount: 9999, streamId: 'bidsprint' });
  s.hours.push({ date: '2026-10-03', hours: 4, streamId: 'bidsprint' }, { date: '2026-10-05', hours: 2, streamId: 'forge' });
  const stats = C.streamStats(s, '2026-10');
  const bid = stats.find((x) => x.id === 'bidsprint');
  assert.equal(bid.income, 1900);
  assert.equal(bid.rate, 475);
  const forge = stats.find((x) => x.id === 'forge');
  assert.equal(forge.rate, 0);
  assert.equal(stats.some((x) => x.id === 'wp'), false);
  assert.equal(C.incomeForMonth(s, '2026-09'), 9999);
  assert.deepEqual(C.monthlyIncomeSeries(s, '2026-10-17', 3).map((m) => m.value), [0, 9999, 1900]);
});

test('normalizeState repairs partial or hostile input', () => {
  assert.equal(C.normalizeState(null).schema, C.SCHEMA_VERSION);
  const s = C.normalizeState({
    days: { bad: {}, '2026-10-17': { priorities: { family: { text: 'x', done: 1 } }, habits: 'nope' } },
    settings: { monthlyIncomeGoal: '30 000', streams: [], coach: { mode: 'agentos' }, focusWindow: 'midnight' },
    kids: [{ id: 'k', name: 'A' }, 'junk', null],
    timer: { startedAt: 'yesterday' },
  });
  assert.deepEqual(Object.keys(s.days), ['2026-10-17']);
  assert.equal(s.days['2026-10-17'].priorities.family.done, true);
  assert.deepEqual(s.days['2026-10-17'].habits, {});
  assert.equal(s.settings.monthlyIncomeGoal, 30000);
  assert.equal(s.settings.streams.length, C.DEFAULT_STREAMS.length);
  assert.equal(s.settings.coach.mode, 'agentos');
  assert.equal(s.settings.coach.agentId, 'free-claude-code');
  assert.equal(s.settings.focusWindow, 'morning');
  assert.equal(s.kids.length, 1);
  assert.equal(s.timer, null);
});

test('daily picks are deterministic per date and swap with an offset', () => {
  const list = ['a', 'b', 'c', 'd', 'e'];
  assert.equal(C.pickDaily(list, '2026-10-17', 'x'), C.pickDaily(list, '2026-10-17', 'x'));
  assert.notEqual(C.pickDaily(list, '2026-10-17', 'x', 0), C.pickDaily(list, '2026-10-17', 'x', 1));
  assert.equal(C.pickDaily([], '2026-10-17'), null);
});

test('timer math handles pauses', () => {
  const t = { durationMin: 25, startedAt: 1_000_000, pausedAt: null, pausedMs: 60_000 };
  assert.equal(C.timerElapsedMs(t, 1_000_000 + 5 * 60_000), 4 * 60_000);
  assert.equal(C.timerRemainingMs(t, 1_000_000 + 5 * 60_000), 21 * 60_000);
  assert.equal(C.timerRemainingMs({ ...t, pausedAt: 1_000_000 + 2 * 60_000 }, 1_000_000 + 50 * 60_000), 24 * 60_000);
  assert.equal(C.timerRemainingMs(t, 1_000_000 + 99 * 60_000), 0);
  assert.equal(C.timerRemainingMs({ ...t, durationMin: 0 }, 0), null);
});

test('calendar reminders are valid, folded iCalendar', () => {
  const now = new Date(2026, 9, 17, 8, 0); // Saturday 08:00
  const ics = C.buildReminderIcs({ reminders: { morning: '07:00', evening: '21:00', weekly: '19:00' }, appUrl: 'https://example.github.io/Agent-OS/life-os/', now });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.ok(ics.includes('DTSTART:20261018T070000'), 'morning already passed → starts tomorrow');
  assert.ok(ics.includes('DTSTART:20261017T210000'), 'evening still ahead → starts today');
  assert.ok(ics.includes('DTSTART:20261018T190000'), 'weekly → next Sunday');
  assert.ok(ics.includes('RRULE:FREQ=WEEKLY;BYDAY=SU'));
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line}`);
  assert.ok(!/[^\r]\n/.test(ics), 'only CRLF line endings');
});

test('week summary and coach insights work on realistic data', () => {
  const now = new Date(2026, 9, 17, 20, 0);
  const s = buildDemoState(now);
  const wk = C.weekKey('2026-10-17');
  const summary = C.weekSummary(s, wk, '2026-10-17');
  assert.equal(summary.days.length, 7);
  assert.equal(summary.elapsedDays, 6);
  assert.ok(summary.dadMinutes > 0);
  assert.ok(summary.focusMinutes > 0);
  assert.ok(summary.habitRate > 0 && summary.habitRate <= 1);
  assert.equal(summary.days[6].future, true);
  const prev = C.weekSummary(s, C.shiftWeek(wk, -1), '2026-10-17');
  const insights = C.weeklyInsights(summary, prev, s);
  assert.ok(Array.isArray(insights));
  for (const i of insights) {
    assert.ok(['good', 'tip', 'care'].includes(i.tone));
    assert.ok(i.text.length > 10);
  }
  const md = C.weekToMarkdown(summary, s.weeks[wk], s);
  assert.ok(md.startsWith('# Vecka 42 · 2026'));
  assert.ok(md.includes('Pappatid'));
  assert.ok(md.includes('Nästa veckas tre'));
});

test('weekly insights spot uneven dad time and low sleep', () => {
  const s = C.createDefaultState();
  s.kids = [{ id: 'a', name: 'Elsa', birthdate: '2020-01-01' }, { id: 'b', name: 'Leo', birthdate: '2023-01-01' }];
  for (const key of C.weekDays('2026-W42').slice(0, 5)) {
    const d = C.ensureDay(s, key);
    d.dadMinutes = { a: 60, b: 5 };
    d.checkin = { sleep: 2, energy: 2, mood: 3 };
  }
  const summary = C.weekSummary(s, '2026-W42', '2026-10-16');
  const texts = C.weeklyInsights(summary, null, s).map((i) => i.text).join('\n');
  assert.match(texts, /Leo fick mindre egen tid/);
  assert.match(texts, /Sömnen har varit låg/);
});

test('memory bank exports to Markdown grouped per child', () => {
  const s = C.createDefaultState();
  s.kids = [{ id: 'a', name: 'Elsa', birthdate: '2020-01-01' }];
  s.memories = [
    { id: '1', date: '2026-10-01', kidId: 'a', kind: 'quote', text: 'Månen följer bilen' },
    { id: '2', date: '2026-10-02', kidId: '', kind: 'moment', text: 'Familjebandet' },
  ];
  const md = C.memoriesToMarkdown(s, new Date(2026, 9, 17));
  assert.match(md, /## Elsa \(f\. 2020-01-01\)/);
  assert.match(md, /”Månen följer bilen”/);
  assert.match(md, /## Hela familjen/);
});
