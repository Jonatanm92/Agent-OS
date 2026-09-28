/* Unit tests: capture parser, routines, evening, patterns, review, search, cycle, reflection, notifications, retention. */
const H = require('./harness');
const { suite, test, assert, equal, deepEqual, at, TODAY } = H;
const A = H.loadCore();
const U = A.util, I = A.i18n, M = A.model, It = A.items, E = A.engine, AP = A.apply, PA = A.parse;

function st(prefs) { return H.freshState(A, prefs); }
function add(s, list, now) { return H.addItems(A, s, list, now); }
function ops(s, list, now) { return AP.applyOps(s, list, now || at(TODAY, '09:00')).state; }
function byTitle(s, title) { return s.items.find((i) => i.title === title); }
function parse(s, text, lang) {
  I.setLanguage(lang || 'en');
  return PA.parse(s, text, at(TODAY, '10:00')).candidates.map((c) => `${c.kind}:${c.title}`);
}

suite('11. Capture parser — the spec examples', () => {
  test('messy English brain dump becomes typed candidates', () => {
    const s = st();
    deepEqual(parse(s, "I need shampoo, need to book the dentist, wash the jacket and remember Mum's birthday present."), [
      'shopping:Shampoo', 'admin:Book the dentist', 'task:Wash the jacket', "reminder:Mum's birthday present",
    ]);
  });
  test('voice-style sentence: dates are understood', () => {
    const s = st();
    const c = PA.parse(s, 'Remind me to buy nappies tomorrow and I need to call the dentist this week.', at(TODAY, '10:00')).candidates;
    equal(c[0].kind, 'shopping'); equal(c[0].title, 'Nappies'); equal(c[0].date, '2026-09-30'); equal(c[0].category, 'baby');
    equal(c[1].kind, 'admin'); equal(c[1].title, 'Call the dentist'); equal(c[1].dueDate, '2026-10-02'); equal(c[1].context, 'phone');
  });
  test('the same in Swedish', () => {
    const s = st({ language: 'sv' });
    deepEqual(parse(s, 'Jag behöver schampo, boka tandläkaren, tvätta jackan och komma ihåg mammas födelsedagspresent.', 'sv'), [
      'shopping:Schampo', 'admin:Boka tandläkaren', 'task:Tvätta jackan', 'reminder:Mammas födelsedagspresent',
    ]);
    const c = PA.parse(s, 'Påminn mig att köpa blöjor imorgon och jag måste ringa tandläkaren i veckan.', at(TODAY, '10:00')).candidates;
    equal(c[0].title, 'Blöjor'); equal(c[0].date, '2026-09-30');
    equal(c[1].title, 'Ringa tandläkaren'); equal(c[1].dueDate, '2026-10-02');
  });
  test('ambiguous or high-impact candidates are flagged for review', () => {
    const s = st();
    const c = PA.parse(s, "remember Mum's birthday present and dentist appointment Thursday at 14:00", at(TODAY, '10:00')).candidates;
    assert(c.every((x) => x.review), 'reminder without a date and an event both need a look');
    equal(c[1].kind, 'event'); equal(c[1].time, '14:00'); equal(c[1].date, '2026-10-01');
  });
  test('a list after "buy" becomes separate shopping items with categories', () => {
    const s = st();
    const c = PA.parse(s, 'buy milk, bread and eggs', at(TODAY, '10:00')).candidates;
    deepEqual(c.map((x) => `${x.title}/${x.category}`), ['Milk/dairy', 'Bread/bread', 'Eggs/dairy']);
  });
  test('a date said once applies to the whole shopping list', () => {
    const s = st();
    const c = PA.parse(s, 'köp mjölk och bröd till helgen', at(TODAY, '10:00')).candidates;
    assert(c.every((x) => x.date === '2026-10-03'), JSON.stringify(c.map((x) => x.date)));
  });
  test('recurrence, deadlines, durations and background tasks', () => {
    const s = st();
    const [bed] = PA.parse(s, 'change the bedding every 2 weeks', at(TODAY, '10:00')).candidates;
    equal(bed.kind, 'chore'); deepEqual(bed.recur, { unit: 'week', every: 2, weekdays: [] });
    const [bill] = PA.parse(s, 'pay the electricity bill by Friday', at(TODAY, '10:00')).candidates;
    equal(bill.dueDate, '2026-10-02'); equal(bill.category, 'payment');
    const [vac] = PA.parse(s, 'vacuum the living room 20 min', at(TODAY, '10:00')).candidates;
    equal(vac.minutes, 20);
    const [wash] = PA.parse(s, 'Put the laundry on', at(TODAY, '10:00')).candidates;
    equal(wash.title, 'Put the laundry on'); equal(wash.background, true);
  });
  test('people the user named are recognised; nobody is hardcoded', () => {
    const s = st();
    s.people = [M.newPerson({ name: 'Robin', relation: 'child' })];
    const [c] = PA.parse(s, 'Robin needs new rain trousers', at(TODAY, '10:00')).candidates;
    equal(c.kind, 'shopping'); equal(c.forPerson, 'Robin'); equal(c.category, 'clothing');
    const s2 = st();
    const [d] = PA.parse(s2, 'Robin needs new rain trousers', at(TODAY, '10:00')).candidates;
    equal(d.forPerson, '', 'unknown names are not guessed as people');
  });
  test('a question is recognised and not turned into tasks', () => {
    const r = PA.parse(st(), 'what was I supposed to buy?', at(TODAY, '10:00'));
    equal(r.question, true);
    equal(r.candidates.length, 0);
  });
  test('ideas and notes stay out of the day', () => {
    deepEqual(parse(st(), 'idea: paint the hallway green'), ['idea:Paint the hallway green']);
    deepEqual(parse(st(), 'note: wifi password is on the router'), ['note:Wifi password is on the router']);
  });
  test('times: 3pm, kl 15, 14.30', () => {
    const s = st();
    equal(PA.extractWhen('call at 3pm', TODAY).time, '15:00');
    equal(PA.extractWhen('möte kl 15', TODAY).time, '15:00');
    equal(PA.extractWhen('tid 14.30', TODAY).time, '14:30');
    equal(PA.extractWhen('on 5 October', TODAY).date, '2026-10-05');
    equal(PA.extractWhen('senast fredag', TODAY).dueDate, '2026-10-02');
    equal(PA.extractWhen('every monday', TODAY).recur.weekdays[0], 1);
    equal(PA.extractWhen('på måndag', TODAY).recur, null, '"på måndag" is once, not every week');
  });
  test('candidates become ops; events become events', () => {
    const s = st();
    const c = PA.parse(s, 'Dentist appointment Thursday at 14:00 and buy milk', at(TODAY, '10:00')).candidates;
    const o = c.map((x) => PA.toOp(x, { today: TODAY }));
    equal(o[0].op, 'event.add'); equal(o[0].event.end, '15:00');
    equal(o[1].op, 'item.add'); equal(o[1].item.kind, 'shopping');
    const after = ops(s, o, at(TODAY, '10:00'));
    equal(after.events.length, 1); equal(after.items.length, 1);
  });
  test('inbox capture keeps things unsorted until processed', () => {
    const s = st();
    const [c] = PA.parse(s, 'look into swimming lessons', at(TODAY, '10:00')).candidates;
    let after = ops(s, [PA.toOp(c, { inbox: true })]);
    equal(It.inbox(after).length, 1);
    equal(It.dayBuckets(after, TODAY).later.length, 0, 'inbox is not in the day');
    after = ops(after, [{ op: 'item.process', id: after.items[0].id, patch: { kind: 'task', priority: 'good', date: TODAY } }]);
    equal(It.inbox(after).length, 0);
    equal(It.dayBuckets(after, TODAY).good.length, 1);
  });
});

suite('12. Routines', () => {
  function withMorning(prefs) {
    let s = st(prefs);
    const t = A.routines.template('morning');
    s = ops(s, [{ op: 'routine.add', routine: t }]);
    return s;
  }
  test('templates exist in both languages and are only added on request', () => {
    I.setLanguage('sv');
    equal(A.routines.template('morning').name, 'Morgon');
    I.setLanguage('en');
    equal(st().routines.length, 0);
  });
  test('opened at 10:45 the morning routine offers the short version, without complaint', () => {
    const s = withMorning();
    const v = A.routines.view(s, s.routines[0], at(TODAY, '10:45'));
    equal(v.variant, 'short');
    equal(I.t(v.reason), 'Short version — just the essentials.');
    assert(v.steps.every((x) => x.core));
  });
  test('in its window it is the full routine and shows as the NOW card', () => {
    const s = withMorning();
    const v = A.routines.view(s, s.routines[0], at(TODAY, '07:30'));
    equal(v.variant, 'full');
    equal(E.nowCard(s, at(TODAY, '07:30')).type, 'routine');
  });
  test('check-offs are per day: tomorrow starts fresh', () => {
    let s = withMorning();
    const r = s.routines[0];
    s = ops(s, [{ op: 'routine.check', routineId: r.id, stepId: r.steps[0].id, done: true, date: TODAY }]);
    equal(A.routines.view(s, s.routines[0], at(TODAY, '07:30')).done, 1);
    equal(A.routines.view(s, s.routines[0], at('2026-09-30', '07:30')).done, 0);
  });
  test('skipping a step is allowed and counts as handled', () => {
    let s = withMorning();
    const r = s.routines[0];
    for (const step of r.steps) s = ops(s, [{ op: step.core ? 'routine.skip' : 'routine.check', routineId: r.id, stepId: step.id, done: true, date: TODAY }]);
    assert(A.routines.view(s, s.routines[0], at(TODAY, '07:30')).complete);
  });
  test('low energy offers the short version', () => {
    let s = withMorning();
    s = ops(s, [{ op: 'day.pulse', date: TODAY, energy: 2 }]);
    equal(A.routines.view(s, s.routines[0], at(TODAY, '07:30')).variant, 'short');
  });
  test('day type: a workday routine does not appear on free days', () => {
    let s = st();
    s = ops(s, [{ op: 'routine.add', routine: A.routines.template('workday') }]);
    assert(A.routines.appliesOn(s, s.routines[0], TODAY));
    assert(!A.routines.appliesOn(s, s.routines[0], '2026-10-03'));
  });
});

suite('13. Evening reset', () => {
  test('acknowledges what got done and lists what did not', () => {
    let s = st();
    s = add(s, [{ title: 'Pay rent', dueDate: TODAY }, { title: 'Wash jacket', date: TODAY }, { title: 'Water plants', date: TODAY }]);
    s = ops(s, [{ op: 'item.done', id: byTitle(s, 'Water plants').id }], at(TODAY, '12:00'));
    const r = A.evening.eveningReset(s, at(TODAY, '21:00'));
    deepEqual(r.done.map((i) => i.title), ['Water plants']);
    deepEqual(r.unfinished.map((u) => u.item.title).sort(), ['Pay rent', 'Wash jacket']);
  });
  test('move everything: deadlines to tomorrow, the rest to calm days', () => {
    let s = st();
    s = add(s, [{ title: 'Pay rent', dueDate: TODAY }, { title: 'Wash jacket', date: TODAY }]);
    const o = A.evening.moveAllOps(s, at(TODAY, '21:00'));
    s = ops(s, o, at(TODAY, '21:00'));
    equal(byTitle(s, 'Pay rent').date, '2026-09-30');
    assert(byTitle(s, 'Wash jacket').date > TODAY);
    equal(It.dayBuckets(s, TODAY).good.length, 0);
  });
  test('tomorrow preview shows fixed things and musts', () => {
    let s = st({ commuteMin: 10 });
    s = ops(s, [{ op: 'event.add', event: { title: 'Dentist', date: '2026-09-30', start: '09:00' } }]);
    s = add(s, [{ title: 'Return books', dueDate: '2026-09-30' }]);
    const r = A.evening.eveningReset(s, at(TODAY, '21:00'));
    equal(r.tomorrow.first.title, 'Dentist');
    equal(r.tomorrow.must[0].title, 'Return books');
  });
});

suite('14. Patterns', () => {
  function postponeOnTuesdays(s, id, times) {
    let cur = s;
    for (let w = 0; w < times; w += 1) {
      const day = U.addDays(TODAY, -7 * w);
      cur = ops(cur, [{ op: 'item.postpone', id, to: 'tomorrow' }], at(day, '19:00'));
    }
    return cur;
  }
  test('"you often move X on Tuesdays" appears only after repeated moves, and can act', () => {
    let s = st();
    s = add(s, [{ title: 'Clean bathroom' }]);
    const id = byTitle(s, 'Clean bathroom').id;
    s = postponeOnTuesdays(s, id, 2);
    assert(!A.patterns.observations(s, at(TODAY, '20:00')).some((o) => o.kind === 'postponeWeekday'), 'two times is not a pattern');
    s = postponeOnTuesdays(s, id, 3);
    const obs = A.patterns.observations(s, at(TODAY, '20:00')).find((o) => o.kind === 'postponeWeekday');
    assert(obs, 'three times is');
    equal(I.msg(obs.text), 'You often move Clean bathroom on Tuesdays. Want me to stop putting it there?');
    s = ops(s, obs.actions[0].ops, at(TODAY, '20:00'));
    deepEqual(byTitle(s, 'Clean bathroom').avoidWeekdays, [2]);
  });
  test('observations can be dismissed for good', () => {
    let s = st();
    s = add(s, [{ title: 'Clean bathroom' }]);
    const id = byTitle(s, 'Clean bathroom').id;
    for (let i = 0; i < 4; i += 1) s = ops(s, [{ op: 'item.postpone', id, to: 'tomorrow' }], at(U.addDays(TODAY, -i), '10:00'));
    const obs = A.patterns.observations(s, at(TODAY, '20:00'));
    assert(obs.length >= 1);
    s = ops(s, obs.map((o) => ({ op: 'pattern.dismiss', key: o.key })));
    equal(A.patterns.observations(s, at(TODAY, '20:00')).length, 0);
  });
  test('energy peak comes from the user’s own check-ins', () => {
    let s = st();
    for (let i = 0; i < 5; i += 1) {
      s = ops(s, [{ op: 'day.pulse', date: U.addDays(TODAY, -i), energy: 5 }], at(U.addDays(TODAY, -i), '09:00'));
      s = ops(s, [{ op: 'day.pulse', date: U.addDays(TODAY, -i), energy: 2 }], at(U.addDays(TODAY, -i), '20:00'));
    }
    const obs = A.patterns.observations(s, at(TODAY, '21:00')).find((o) => o.kind === 'energyPeak');
    assert(obs);
    equal(I.msg(obs.text), 'Your energy tends to be highest in the morning. Want Aura to put heavier things there?');
  });
  test('wording is observational, never diagnostic or judging', () => {
    const texts = Object.entries(I._table).filter(([k]) => k.startsWith('pat.')).map(([, v]) => v[1].toLowerCase());
    assert(!texts.some((t) => /should have|lazy|fail|bad at|disorder|diagnos|symptom of/.test(t)), texts.join(' | '));
  });
});

suite('15. Weekly review', () => {
  test('done, often postponed and unfinished important', () => {
    let s = st();
    s = add(s, [{ title: 'A' }, { title: 'B', priority: 'must' }, { title: 'C' }], at('2026-09-22', '09:00'));
    s = ops(s, [{ op: 'item.done', id: byTitle(s, 'A').id }], at('2026-09-23', '10:00'));
    for (const d of ['2026-09-22', '2026-09-24', '2026-09-25']) s = ops(s, [{ op: 'item.postpone', id: byTitle(s, 'C').id, to: 'tomorrow' }], at(d, '18:00'));
    const r = A.review.weeklyReview(s, at('2026-09-27', '17:00'));
    equal(r.week, '2026-09-21');
    equal(r.doneCount, 1);
    equal(r.postponed[0].item.title, 'C');
    equal(r.postponed[0].count, 3);
    assert(r.unfinishedImportant.some((i) => i.title === 'B'));
  });
  test('Sunday afternoon suggests the review once', () => {
    let s = st();
    s = add(s, [{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }, { title: 'E' }], at('2026-09-22', '09:00'));
    equal(E.suggestion(s, at('2026-10-04', '16:00')).kind, 'review');
    s = ops(s, [{ op: 'meta.review', week: '2026-09-28' }], at('2026-10-04', '16:00'));
    assert(!E.suggestion(s, at('2026-10-04', '16:30')) || E.suggestion(s, at('2026-10-04', '16:30')).kind !== 'review');
  });
});

suite('16. Ask Aura (no AI needed)', () => {
  function world() {
    let s = st();
    s = add(s, [
      { title: 'Shampoo', kind: 'shopping', category: 'hygiene' },
      { title: 'Insurance claim', kind: 'admin', adminStatus: 'waiting' },
      { title: 'Pay invoice', kind: 'admin', dueDate: '2026-10-01' },
      { title: 'Paint bedroom wall' },
      { title: 'Buy bedroom curtains', kind: 'shopping' },
      { title: 'Book passport renewal', kind: 'admin', dueDate: '2026-09-25' },
    ]);
    s = ops(s, [{ op: 'item.postpone', id: byTitle(s, 'Paint bedroom wall').id, to: 'tomorrow' }]);
    return s;
  }
  test('what was I supposed to buy?', () => {
    const r = A.search.ask(world(), 'What was I supposed to buy?', at(TODAY, '10:00'));
    equal(r.intent, 'shopping');
    deepEqual(r.items.map((i) => i.title).sort(), ['Buy bedroom curtains', 'Shampoo']);
  });
  test('what have I postponed this week?', () => {
    const r = A.search.ask(world(), 'What have I postponed this week?', at(TODAY, '10:00'));
    equal(r.intent, 'postponed');
    deepEqual(r.items.map((i) => i.title), ['Paint bedroom wall']);
  });
  test('what do I need to do before Friday?', () => {
    const r = A.search.ask(world(), 'What do I need to do before Friday?', at(TODAY, '10:00'));
    equal(r.intent, 'before');
    assert(r.items.some((i) => i.title === 'Pay invoice'));
  });
  test('which things am I waiting for? (Swedish too)', () => {
    equal(A.search.ask(world(), 'Which things am I waiting for?', at(TODAY, '10:00')).items[0].title, 'Insurance claim');
    equal(A.search.ask(world(), 'Vad väntar jag på?', at(TODAY, '10:00')).intent, 'waiting');
  });
  test('what did I plan for the bedroom? — text search', () => {
    const r = A.search.ask(world(), 'What did I plan for the bedroom?', at(TODAY, '10:00'));
    deepEqual(r.items.map((i) => i.title).sort(), ['Buy bedroom curtains', 'Paint bedroom wall']);
  });
  test('what have I forgotten? — overdue first', () => {
    const r = A.search.ask(world(), 'What have I forgotten?', at(TODAY, '10:00'));
    equal(r.items[0].title, 'Book passport renewal');
  });
});

suite('17. Cycle (optional, not medical)', () => {
  test('off by default and data only from the user', () => {
    const s = st();
    equal(s.prefs.modules.cycle, false);
    equal(A.cycle.summary(s, TODAY).averageLength, null);
  });
  test('estimate appears only after two full cycles, from logged days', () => {
    let s = st();
    const logPeriod = (start) => { for (let i = 0; i < 4; i += 1) s = ops(s, [{ op: 'cycle.log', date: U.addDays(start, i), period: true }]); };
    logPeriod('2026-07-06');
    logPeriod('2026-08-03');
    let sum = A.cycle.summary(s, TODAY);
    equal(sum.next, null, 'one length is not enough');
    logPeriod('2026-08-31');
    sum = A.cycle.summary(s, TODAY);
    equal(sum.averageLength, 28);
    equal(sum.periodLength, 4);
    equal(sum.next.expected, '2026-09-28');
    equal(sum.cycleDay, 30);
  });
  test('clearing removes every cycle entry', () => {
    let s = st();
    s = ops(s, [{ op: 'cycle.log', date: TODAY, period: true, symptoms: ['cramps'] }, { op: 'cycle.clear' }]);
    equal(s.cycle.entries.length, 0);
  });
  test('observations are framed as the user’s own logs, never medical fact', () => {
    const en = I._table['cyc.obsEnergy'][1];
    assert(/your own logs/i.test(en));
  });
});

suite('18. Reflection and notifications', () => {
  test('theme of the day is stable for a date and exists in both languages', () => {
    I.setLanguage('en');
    const a = A.reflect.themeOfDay(TODAY), b = A.reflect.themeOfDay(TODAY);
    deepEqual(a, b);
    I.setLanguage('sv');
    assert(A.reflect.themeOfDay(TODAY).name.length > 0);
    I.setLanguage('en');
  });
  test('a notification only exists with a decision behind it: leaving with things left', () => {
    let s = st({ commuteMin: 10 });
    s = ops(s, [{ op: 'event.add', event: { title: 'Dentist', date: TODAY, start: '14:00' } }]);
    s = add(s, [{ title: 'Clean oven', date: TODAY, minutes: 45 }]);
    const c = A.notify.candidates(s, at(TODAY, '13:30'));
    equal(c.length, 1);
    equal(I.msg(c[0].text), "You need to leave in about 20 min. 1 thing is still on today's plan. Move it?");
    assert(c[0].actions[0].ops.length === 1);
  });
  test('nothing to decide, nothing to say', () => {
    const s = st();
    equal(A.notify.candidates(s, at(TODAY, '13:30')).length, 0);
  });
  test('notifications off means off', () => {
    let s = st({ commuteMin: 10, notifications: 'off' });
    s = ops(s, [{ op: 'event.add', event: { title: 'Dentist', date: TODAY, start: '14:00' } }]);
    s = add(s, [{ title: 'Clean oven', date: TODAY, minutes: 45 }]);
    equal(A.notify.candidates(s, at(TODAY, '13:30')).length, 0);
  });
  test('no motivational filler anywhere in the strings', () => {
    const all = Object.values(I._table).map((v) => v[1].toLowerCase()).join(' | ');
    assert(!/be productive|you got this|crush it|streak|keep it up|don't give up|hustle/.test(all));
  });
});

suite('19. Retention', () => {
  test('old done items, logs and day details are pruned; open items never', () => {
    let s = st();
    s = add(s, [{ title: 'Old done' }, { title: 'Still open' }], at('2026-05-01', '09:00'));
    s = ops(s, [{ op: 'item.done', id: byTitle(s, 'Old done').id }, { op: 'day.pulse', date: '2026-05-01', energy: 3 }], at('2026-05-01', '10:00'));
    const r = A.compact.compact(s, at(TODAY, '09:00'));
    assert(r.changed);
    equal(byTitle(r.state, 'Old done'), undefined);
    assert(byTitle(r.state, 'Still open'));
    assert(r.state.days['2026-05-01'].pulses.length === 1, 'the check-in summary is kept');
  });
});

if (require.main === module) process.exit(H.report() ? 0 : 1);
