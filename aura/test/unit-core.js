/* Unit tests: util, i18n, model, items, planner, engine, apply. */
const H = require('./harness');
const { suite, test, assert, equal, deepEqual, at, TODAY } = H;
const A = H.loadCore();
const U = A.util, I = A.i18n, M = A.model, It = A.items, P = A.planner, E = A.engine, AP = A.apply;

function st(prefs) { return H.freshState(A, prefs); }
function add(s, list, now) { return H.addItems(A, s, list, now); }
function ops(s, list, now) { return AP.applyOps(s, list, now || at(TODAY, '09:00')).state; }
function byTitle(s, title) { return s.items.find((i) => i.title === title); }

suite('1. Time and dates', () => {
  test('date key and minutes follow the chosen time zone, not the device', () => {
    U.setTimeZone('Europe/Stockholm');
    const d = at(TODAY, '00:30');
    equal(U.dateKey(d), TODAY);
    equal(U.minutesOfDay(d), 30);
    U.setTimeZone('America/New_York');
    equal(U.dateKey(d), '2026-09-28', 'same instant is still the previous day in New York');
    U.setTimeZone('Europe/Stockholm');
  });
  test('an invalid time zone is ignored', () => {
    U.setTimeZone('Europe/Stockholm');
    equal(U.setTimeZone('Not/AZone'), 'Europe/Stockholm');
  });
  test('weekday, week start and next weekday', () => {
    equal(U.weekday(TODAY), 2, 'Tuesday');
    equal(U.startOfWeek(TODAY), '2026-09-28');
    equal(U.nextWeekday(TODAY, 4), '2026-10-01');
    equal(U.nextWeekday(TODAY, 2, true), TODAY);
    equal(U.addMonths('2026-01-31', 1), '2026-02-28');
  });
  test('clock parsing accepts 14:30 and 14.30, rejects nonsense', () => {
    equal(U.toMinutes('14:30'), 870);
    equal(U.toMinutes('14.30'), 870);
    equal(U.toMinutes('25:00'), null);
    equal(U.toMinutes(''), null);
  });
});

suite('2. Language', () => {
  test('every string exists in both Swedish and English', () => {
    const bad = Object.entries(I._table).filter(([, v]) => !Array.isArray(v) || v.length !== 2 || !v[0] || !v[1]);
    deepEqual(bad.map(([k]) => k), []);
  });
  test('plurals and interpolation', () => {
    I.setLanguage('en');
    equal(I.t('count.things', { n: 1 }), '1 thing');
    equal(I.t('count.things', { n: 3 }), '3 things');
    I.setLanguage('sv');
    equal(I.t('count.things', { n: 3 }), '3 saker');
    equal(I.relativeDay('2026-09-30', TODAY), 'i morgon');
    equal(I.duration(90), '1 h 30 min');
    I.setLanguage('en');
    equal(I.relativeDay('2026-10-01', TODAY), 'on Thursday');
  });
  test('language guess from the device', () => {
    equal(I.guessLanguage('sv-SE'), 'sv');
    equal(I.guessLanguage('en-GB'), 'en');
  });
});

suite('3. Model', () => {
  test('a new state has no invented schedule: working hours unknown', () => {
    const s = M.emptyState();
    equal(s.prefs.workStart, '');
    equal(M.hasWorkHours(s), false);
  });
  test('items are sanitised: unknown kind becomes a task, title trimmed', () => {
    const it = M.newItem({ kind: 'weird', title: '  Call   the dentist  ' });
    equal(it.kind, 'task');
    equal(it.title, 'Call the dentist');
    equal(it.status, 'open');
  });
  test('migrate fills missing fields so old saves never crash', () => {
    const s = M.migrate({ app: 'aura', prefs: { name: 'Sam' }, items: null });
    equal(s.prefs.name, 'Sam');
    assert(Array.isArray(s.items));
    equal(s.prefs.modules.cycle, false, 'optional modules default off');
  });
  test('Min vardag export imports tasks, recurring and routines — nothing invented', () => {
    const mv = {
      settings: { wakeTime: '05:00', bedtime: '21:30', workStart: '07:00', workEnd: '16:00' },
      weekTemplate: { 1: { work: 'ja' }, 2: { work: 'ja' }, 3: { work: 'okand' } },
      children: [{ id: 'b1', name: 'Alva' }],
      needs: [{ childId: 'b1', title: '2 byxor', status: 'behover' }, { childId: 'b1', title: 'Jacka', status: 'bekraftat' }],
      tasks: [{ title: 'Boka tandläkare', kind: 'uppgift', minutes: 10, status: 'oppen', load: 'latt', context: 'telefon' }],
      recurring: [{ title: 'Träning', weekdays: [2], start: '19:00', end: '20:00', active: true }],
      routines: [{ name: 'Kvällsrutin', when: 'kvall', items: [{ label: 'Diska' }] }],
    };
    const s = M.migrate(mv);
    equal(s.app, 'aura');
    equal(s.prefs.language, 'sv');
    deepEqual(s.prefs.workDays, [1, 2]);
    equal(s.items.filter((i) => i.kind === 'shopping').length, 1, 'only the open need');
    equal(s.items.find((i) => i.kind === 'shopping').forPerson, 'Alva');
    equal(s.items.find((i) => i.title === 'Boka tandläkare').context, 'phone');
    equal(s.events[0].recur.weekdays[0], 2);
    equal(s.routines[0].kind, 'evening');
  });
});

suite('4. Buckets: must, good, can wait', () => {
  test('deadline today is must, planned today is good, no date can wait', () => {
    let s = st();
    s = add(s, [
      { title: 'Pay rent', dueDate: TODAY },
      { title: 'Wash jacket', date: TODAY },
      { title: 'Sort photos' },
    ]);
    const b = It.dayBuckets(s, TODAY);
    deepEqual(b.must.map((i) => i.title), ['Pay rent']);
    deepEqual(b.good.map((i) => i.title), ['Wash jacket']);
    deepEqual(b.later.map((i) => i.title), ['Sort photos']);
  });
  test('missed plans do not pile up: yesterday’s plan without a deadline can wait', () => {
    let s = st();
    s = add(s, [{ title: 'Clean oven', date: '2026-09-28' }]);
    const b = It.dayBuckets(s, TODAY);
    equal(b.good.length, 0);
    equal(b.later[0].title, 'Clean oven');
    assert(It.isCarried(b.later[0], TODAY));
  });
  test('an overdue deadline stays a must', () => {
    let s = st();
    s = add(s, [{ title: 'Return library books', dueDate: '2026-09-27' }]);
    equal(It.dayBuckets(s, TODAY).must[0].title, 'Return library books');
  });
  test('future plans are scheduled, not today', () => {
    let s = st();
    s = add(s, [{ title: 'Buy present', date: '2026-10-02' }]);
    const b = It.dayBuckets(s, TODAY);
    equal(b.scheduled.length, 1);
    equal(b.must.length + b.good.length + b.later.length, 0);
  });
  test('waiting admin is not a to-do until its follow-up date', () => {
    let s = st();
    s = add(s, [{ title: 'Insurance claim', kind: 'admin', adminStatus: 'waiting', followUp: '2026-10-03' }]);
    let b = It.dayBuckets(s, TODAY);
    equal(b.waiting.length, 1);
    equal(b.good.length, 0);
    b = It.dayBuckets(s, '2026-10-03');
    equal(b.good.length, 1, 'follow-up day brings it back');
  });
  test('undated shopping lives on the list, not in the day', () => {
    let s = st();
    s = add(s, [{ title: 'Shampoo', kind: 'shopping' }, { title: 'Nappies', kind: 'shopping', date: TODAY }]);
    const b = It.dayBuckets(s, TODAY);
    deepEqual([...b.must, ...b.good].map((i) => i.title), ['Nappies']);
  });
  test('moving between buckets', () => {
    let s = st();
    s = add(s, [{ title: 'Sort photos' }]);
    const id = byTitle(s, 'Sort photos').id;
    s = ops(s, [{ op: 'item.bucket', id, bucket: 'must' }]);
    equal(It.dayBuckets(s, TODAY).must.length, 1);
    s = ops(s, [{ op: 'item.bucket', id, bucket: 'later' }]);
    equal(It.dayBuckets(s, TODAY).later.length, 1);
  });
});

suite('5. Recurring chores', () => {
  test('done moves the next due date on and keeps it open', () => {
    let s = st();
    s = add(s, [{ title: 'Change bedding', kind: 'chore', recur: { unit: 'day', every: 14 }, dueDate: TODAY }]);
    const id = byTitle(s, 'Change bedding').id;
    equal(It.dayBuckets(s, TODAY).good.length, 1, 'due chore is good today');
    s = ops(s, [{ op: 'item.done', id }]);
    const it = byTitle(s, 'Change bedding');
    equal(it.status, 'open');
    equal(it.dueDate, '2026-10-13');
    equal(it.lastDone, TODAY);
    equal(It.dayBuckets(s, TODAY).done.length, 1, 'shows as done today');
  });
  test('skipping a recurring chore keeps the series and moves to the next time', () => {
    let s = st();
    s = add(s, [{ title: 'Change bedding', kind: 'chore', recur: { unit: 'day', every: 14 }, dueDate: TODAY }]);
    const id = byTitle(s, 'Change bedding').id;
    s = ops(s, [{ op: 'item.skip', id }]);
    equal(byTitle(s, 'Change bedding').status, 'open', 'never dropped');
    equal(byTitle(s, 'Change bedding').dueDate, '2026-10-13');
    equal(It.dayBuckets(s, TODAY).good.length, 0, 'gone from today');
    equal(It.dayBuckets(s, TODAY).done.length, 0, 'and not counted as done');
  });
  test('"later" on a recurring chore means skip this time, not a silent no-op', () => {
    let s = st();
    s = add(s, [{ title: 'Water plants', kind: 'chore', recur: { unit: 'day', every: 4 }, dueDate: TODAY }]);
    s = ops(s, [{ op: 'item.postpone', id: byTitle(s, 'Water plants').id, to: 'later' }]);
    equal(byTitle(s, 'Water plants').dueDate, '2026-10-03');
    equal(It.dayBuckets(s, TODAY).good.length, 0);
  });
  test('weekly on a weekday lands on the next such day', () => {
    const item = M.newItem({ title: 'Recycling', recur: { unit: 'week', every: 1, weekdays: [4] } });
    equal(It.recurNext(item, TODAY), '2026-10-01');
  });
  test('recurrence is described in words', () => {
    I.setLanguage('en');
    equal(It.describeRecur({ unit: 'day', every: 14 }), 'every 14 days');
    equal(It.describeRecur({ unit: 'week', every: 1, weekdays: [1, 4] }), 'on Mon and Thu');
  });
});

suite('6. Planner', () => {
  test('the plan starts now, not at wake-up', () => {
    const s = st();
    const plan = P.planDay(s, at(TODAY, '16:02'));
    equal(plan.windowStart, 16 * 60 + 5);
  });
  test('no working hours are invented when unknown', () => {
    const s = st();
    equal(P.planDay(s, at(TODAY, '09:00')).fixed.length, 0);
  });
  test('known working hours block the day on work days only', () => {
    const s = st({ workStart: '08:00', workEnd: '16:00' });
    equal(P.planDay(s, at(TODAY, '07:00')).fixed[0].kind, 'work');
    equal(P.planDay(s, at('2026-10-03', '07:00')).fixed.length, 0, 'Saturday');
  });
  test('a free day mode removes the work block', () => {
    let s = st({ workStart: '08:00', workEnd: '16:00' });
    s = ops(s, [{ op: 'day.mode', date: TODAY, mode: 'free' }]);
    equal(P.planDay(s, at(TODAY, '07:00')).fixed.length, 0);
  });
  test('recurring and one-off events appear on their days with travel margins', () => {
    let s = st({ commuteMin: 20 });
    s = ops(s, [
      { op: 'event.add', event: { title: 'Dentist', date: TODAY, start: '14:00', end: '14:45' } },
      { op: 'event.add', event: { title: 'Choir', start: '19:00', end: '20:30', recur: { weekdays: [2] } } },
    ]);
    const plan = P.planDay(s, at(TODAY, '13:00'));
    deepEqual(plan.fixed.map((f) => f.title), ['Dentist', 'Choir']);
    equal(plan.next.title, 'Dentist');
    equal(plan.minutesUntilNext, 40, 'leave 20 min before 14:00');
  });
  test('low energy shrinks capacity; margin always left', () => {
    let s = st();
    const full = P.planDay(s, at(TODAY, '09:00'));
    s = ops(s, [{ op: 'day.pulse', date: TODAY, energy: 1 }]);
    const low = P.planDay(s, at(TODAY, '09:00'));
    assert(low.budget < full.budget * 0.5, `${low.budget} vs ${full.budget}`);
    assert(full.budget < full.freeMinutes, 'never plans all free time');
  });
  test('auto-plan only picks from what exists and respects density', () => {
    let s = st({ density: 'light' });
    s = add(s, [{ title: 'A', minutes: 20 }, { title: 'B', minutes: 20 }, { title: 'C', minutes: 20 }, { title: 'Note', kind: 'note' }]);
    const { ops: o, picked } = P.autoPlan(s, at(TODAY, '09:00'));
    equal(picked.length, 2, 'light density = 2 good');
    assert(!picked.includes(byTitle(s, 'Note').id));
    s = ops(s, o);
    equal(It.dayBuckets(s, TODAY).good.length, 2);
    equal(s.items.length, 4, 'nothing new was created');
  });
  test('auto-plan does not pull office calls into a day after offices close', () => {
    let s = st();
    s = add(s, [{ title: 'Call the dentist', kind: 'admin', category: 'call', context: 'phone' }]);
    equal(P.autoPlan(s, at(TODAY, '17:30')).picked.length, 0, 'not at 17:30');
    equal(P.autoPlan(s, at('2026-10-03', '09:00')).picked.length, 0, 'not on a Saturday');
    equal(P.autoPlan(s, at(TODAY, '09:00')).picked.length, 1, 'yes on a weekday morning');
  });
  test('auto-plan skips days an item should avoid', () => {
    let s = st();
    s = add(s, [{ title: 'Clean bathroom', avoidWeekdays: [2] }]);
    equal(P.autoPlan(s, at(TODAY, '09:00')).picked.length, 0);
  });
  test('rebuild keeps musts, moves what does not fit, and moves it to a real date', () => {
    let s = st();
    s = add(s, [
      { title: 'Pay rent', dueDate: TODAY, minutes: 10 },
      { title: 'Big clean', date: TODAY, minutes: 120 },
      { title: 'Paint shelf', date: TODAY, minutes: 120 },
      { title: 'Tidy desk', date: TODAY, minutes: 15 },
    ]);
    const r = P.rebuild(s, at(TODAY, '20:30'));
    deepEqual(r.must.map((m) => m.title), ['Pay rent']);
    assert(r.moved.length >= 2, `moved ${r.moved.length}`);
    assert(r.moved.every((m) => U.isDateKey(m.to) && m.to > TODAY));
    const after = ops(s, r.ops, at(TODAY, '20:30'));
    equal(byTitle(after, 'Pay rent').date, '', 'must untouched');
  });
});

suite('7. Engine: what should I do now?', () => {
  test('one recommendation with a reason and a duration', () => {
    let s = st();
    s = add(s, [{ title: 'Pay rent', dueDate: TODAY, minutes: 10 }, { title: 'Sort photos', minutes: 60 }]);
    const r = E.whatNow(s, at(TODAY, '10:00'));
    equal(r.item.title, 'Pay rent');
    equal(r.minutes, 10);
    equal(I.msg(r.reason), 'It needs doing today.');
  });
  test('something else skips the current one', () => {
    let s = st();
    s = add(s, [{ title: 'Pay rent', dueDate: TODAY }, { title: 'Water plants', date: TODAY, minutes: 5 }]);
    const first = E.whatNow(s, at(TODAY, '10:00'));
    const other = E.whatNow(s, at(TODAY, '10:00'), { exclude: [first.item.id] });
    assert(other.item.id !== first.item.id);
  });
  test('something easier gives something lighter — or a tiny version', () => {
    let s = st();
    s = add(s, [{ title: 'Deep clean kitchen', date: TODAY, minutes: 90, energy: 'heavy' }, { title: 'Water plants', date: TODAY, minutes: 5, energy: 'light' }]);
    const heavy = byTitle(s, 'Deep clean kitchen');
    const easier = E.whatNow(s, at(TODAY, '10:00'), { easierThan: heavy.id });
    equal(easier.item.title, 'Water plants');
    let s2 = st();
    s2 = add(s2, [{ title: 'Deep clean kitchen', date: TODAY, minutes: 90, energy: 'heavy' }]);
    const only = byTitle(s2, 'Deep clean kitchen');
    const tiny = E.whatNow(s2, at(TODAY, '10:00'), { easierThan: only.id });
    assert(tiny.tiny, 'falls back to a tiny version');
    equal(tiny.minutes, 5);
  });
  test('a background task comes first and explains it can run alongside', () => {
    let s = st();
    s = add(s, [
      { title: 'Put the laundry on', date: TODAY, minutes: 3, background: true, energy: 'light' },
      { title: 'Make dinner', date: TODAY, minutes: 40 },
    ]);
    const r = E.whatNow(s, at(TODAY, '17:30'));
    equal(r.item.title, 'Put the laundry on');
    equal(I.msg(r.reason), 'It takes about 3 min and can run while you make dinner.');
  });
  test('low energy steers away from heavy things', () => {
    let s = st();
    s = add(s, [{ title: 'Move furniture', date: TODAY, minutes: 60, energy: 'heavy' }, { title: 'Reply to text', date: TODAY, minutes: 5, energy: 'light' }]);
    s = ops(s, [{ op: 'day.pulse', date: TODAY, energy: 2 }]);
    equal(E.whatNow(s, at(TODAY, '10:00')).item.title, 'Reply to text');
  });
  test('no phone calls suggested outside office hours', () => {
    let s = st();
    s = add(s, [{ title: 'Call the dentist', kind: 'admin', category: 'call', context: 'phone', date: TODAY, minutes: 10 }]);
    const evening = E.whatNow(s, at(TODAY, '21:00'));
    assert(!evening || evening.item.title !== 'Call the dentist', 'not at 21:00');
    equal(E.whatNow(s, at(TODAY, '10:00')).item.title, 'Call the dentist');
  });
  test('declined things are not offered again today', () => {
    let s = st();
    s = add(s, [{ title: 'Water plants', date: TODAY, minutes: 5 }]);
    const id = byTitle(s, 'Water plants').id;
    s = ops(s, [{ op: 'day.decline', date: TODAY, itemId: id }]);
    equal(E.whatNow(s, at(TODAY, '10:00')), null);
  });
});

suite('8. Engine: the NOW card', () => {
  test('nothing planned: calm, with the time until the next thing', () => {
    let s = st({ commuteMin: 15 });
    s = ops(s, [{ op: 'event.add', event: { title: 'Pick-up', date: TODAY, start: '16:00', end: '16:30' } }]);
    const c = E.nowCard(s, at(TODAY, '14:00'));
    equal(c.type, 'free');
    equal(c.plan.minutesUntilNext, 105);
  });
  test('leave soon: tells how long until leaving', () => {
    let s = st({ commuteMin: 15 });
    s = ops(s, [{ op: 'event.add', event: { title: 'Dentist', date: TODAY, start: '14:00', end: '14:45' } }]);
    const c = E.nowCard(s, at(TODAY, '13:20'));
    equal(c.type, 'leave');
    equal(c.leaveIn, 25);
  });
  test('an event in progress is shown as such', () => {
    let s = st();
    s = ops(s, [{ op: 'event.add', event: { title: 'Meeting', date: TODAY, start: '10:00', end: '11:00', away: false } }]);
    equal(E.nowCard(s, at(TODAY, '10:30')).type, 'event');
  });
  test('"do it" puts the task in focus until done', () => {
    let s = st();
    s = add(s, [{ title: 'Water plants', date: TODAY, minutes: 5 }]);
    const id = byTitle(s, 'Water plants').id;
    s = ops(s, [{ op: 'day.focus', date: TODAY, itemId: id }]);
    equal(E.nowCard(s, at(TODAY, '10:00')).type, 'focus');
    s = ops(s, [{ op: 'item.done', id }]);
    assert(E.nowCard(s, at(TODAY, '10:05')).type !== 'focus');
  });
  test('"not now" quiets the card for a while', () => {
    let s = st();
    s = add(s, [{ title: 'Water plants', date: TODAY, minutes: 5 }]);
    s = ops(s, [{ op: 'day.quiet', date: TODAY, until: 11 * 60 }]);
    equal(E.nowCard(s, at(TODAY, '10:00')).type, 'quiet');
    equal(E.nowCard(s, at(TODAY, '11:05')).type, 'task');
  });
  test('late evening: wind down, no tasks pushed', () => {
    let s = st();
    s = add(s, [{ title: 'Water plants', date: TODAY, minutes: 5 }]);
    equal(E.nowCard(s, at(TODAY, '22:45')).type, 'windDown');
  });
});

suite('9. Modes, Low Energy and Chaos', () => {
  test('a low pulse suggests Low Energy Mode — it is never forced', () => {
    let s = st();
    s = ops(s, [{ op: 'day.pulse', date: TODAY, energy: 2 }]);
    equal(E.modeSuggestion(s, at(TODAY, '09:00')).mode, 'low');
    equal(E.effectiveMode(s, TODAY), 'normal', 'not switched automatically');
    s = ops(s, [{ op: 'day.dismiss', date: TODAY, key: 'mode:low' }]);
    equal(E.modeSuggestion(s, at(TODAY, '09:00')), null, 'no nagging once dismissed');
  });
  test('workday and free day follow the week automatically', () => {
    const s = st({ workStart: '08:00', workEnd: '16:00' });
    equal(E.effectiveMode(s, TODAY), 'work');
    equal(E.effectiveMode(s, '2026-10-04'), 'free');
  });
  test('Low Energy plan: the necessary, one tiny win, and what moves where', () => {
    let s = st();
    s = add(s, [
      { title: 'Pick up package', dueDate: TODAY, minutes: 20 },
      { title: 'Start washing machine', date: TODAY, minutes: 3, energy: 'light', background: true },
      { title: 'Clean bathroom', date: TODAY, minutes: 40, energy: 'heavy' },
      { title: 'Call bank', date: TODAY, minutes: 15 },
    ]);
    const plan = E.lowEnergyPlan(s, at(TODAY, '10:00'));
    deepEqual(plan.must.map((i) => i.title), ['Pick up package']);
    equal(plan.tiny.title, 'Start washing machine');
    deepEqual(plan.moved.map((m) => m.title).sort(), ['Call bank', 'Clean bathroom']);
    s = ops(s, plan.ops, at(TODAY, '10:00'));
    equal(E.effectiveMode(s, TODAY), 'low');
    const b = It.dayBuckets(s, TODAY);
    deepEqual(b.must.map((i) => i.title), ['Pick up package']);
    deepEqual(b.good.map((i) => i.title), ['Start washing machine']);
  });
  test('Chaos queue puts urgent first, then quick wins', () => {
    let s = st();
    s = add(s, [
      { title: 'Sort wardrobe', date: TODAY, minutes: 60 },
      { title: 'Text the plumber', date: TODAY, minutes: 3 },
      { title: 'Pay invoice', dueDate: TODAY, minutes: 10 },
    ]);
    const q = E.chaosQueue(s, at(TODAY, '10:00')).map((id) => M.itemById(s, id).title);
    equal(q[0], 'Pay invoice');
    equal(q[1], 'Text the plumber');
    s = ops(s, [{ op: 'day.chaos', date: TODAY, queue: E.chaosQueue(s, at(TODAY, '10:00')) }]);
    let cs = E.chaosState(s, at(TODAY, '10:00'));
    equal(cs.current.title, 'Pay invoice');
    s = ops(s, [{ op: 'item.done', id: cs.current.id }]);
    cs = E.chaosState(s, at(TODAY, '10:10'));
    equal(cs.current.title, 'Text the plumber', 'finishing reveals the next one');
    equal(cs.doneCount, 1);
  });
});

suite('10. Ops', () => {
  test('every op is described in words before it happens', () => {
    let s = st();
    s = add(s, [{ title: 'Water plants' }]);
    const id = byTitle(s, 'Water plants').id;
    equal(AP.describe(s, { op: 'item.postpone', id, to: 'tomorrow' }, at(TODAY, '09:00')), 'Moved to tomorrow: Water plants');
    I.setLanguage('sv');
    equal(AP.describe(s, { op: 'item.done', id }, at(TODAY, '09:00')), 'Klart: Water plants');
    I.setLanguage('en');
  });
  test('postponing counts and logs; the log feeds patterns', () => {
    let s = st();
    s = add(s, [{ title: 'Clean oven', date: TODAY }]);
    const id = byTitle(s, 'Clean oven').id;
    s = ops(s, [{ op: 'item.postpone', id, to: 'tomorrow' }]);
    const it = byTitle(s, 'Clean oven');
    equal(it.date, '2026-09-30');
    equal(it.postponed, 1);
    assert(s.log.some((l) => l.ev === 'postpone' && l.id === id));
  });
  test('ops on missing things are skipped, never crash', () => {
    const s = st();
    const r = AP.applyOps(s, [{ op: 'item.done', id: 'nope' }, { op: 'bogus' }], at(TODAY, '09:00'));
    equal(r.applied.length, 0);
    equal(r.skipped.length, 2);
  });
  test('applyOps never mutates the input state', () => {
    const s = st();
    const before = JSON.stringify(s);
    AP.applyOps(s, [{ op: 'item.add', item: { title: 'X' } }], at(TODAY, '09:00'));
    equal(JSON.stringify(s), before);
  });
  test('updates are sanitised through the model', () => {
    let s = st();
    s = add(s, [{ title: 'X' }]);
    const id = byTitle(s, 'X').id;
    s = ops(s, [{ op: 'item.update', id, patch: { minutes: 99999, kind: 'bad', status: 'done' } }]);
    const it = s.items[0];
    equal(it.minutes, 480);
    equal(it.kind, 'task');
    equal(it.status, 'open', 'status cannot be changed through a patch');
  });
  test('making something smaller creates a first step and parks the rest', () => {
    let s = st();
    s = add(s, [{ title: 'Clean bathroom', date: TODAY, minutes: 45 }]);
    const id = byTitle(s, 'Clean bathroom').id;
    s = ops(s, [{ op: 'item.split', id, first: 'Just the sink', minutes: 5 }]);
    const b = It.dayBuckets(s, TODAY);
    deepEqual(b.good.map((i) => i.title), ['Just the sink']);
    deepEqual(b.later.map((i) => i.title), ['Clean bathroom']);
  });
  test('prefs.set only accepts known preference keys', () => {
    let s = st();
    s = ops(s, [{ op: 'prefs.set', patch: { name: 'Robin', hacker: true, modules: { cycle: true } } }]);
    equal(s.prefs.name, 'Robin');
    equal(s.prefs.hacker, undefined);
    equal(s.prefs.modules.cycle, true);
    equal(s.prefs.modules.shopping, true, 'other modules untouched');
  });
});

if (require.main === module) process.exit(H.report() ? 0 : 1);
module.exports = { A };
