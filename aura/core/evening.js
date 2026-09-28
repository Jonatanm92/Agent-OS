/* Aura — evening reset.
 *
 * Fast on purpose: acknowledge what got done, decide quickly about what
 * didn't, empty the head into Aura, glance at tomorrow. No journaling
 * ritual unless the user chooses one, no scoring, no streaks.
 */
(function (root) {
  const A = root.Aura || (root.Aura = {});
  const U = A.util, M = A.model, It = A.items, P = A.planner;

  function eveningReset(state, now) {
    const today = U.dateKey(now);
    const tomorrow = U.addDays(today, 1);
    const day = M.getDay(state, today);
    const b = It.dayBuckets(state, today);

    const unfinished = [...b.must, ...b.good].map((item) => ({
      item,
      suggest: item.dueDate && item.dueDate <= today ? 'tomorrow' : (item.priority === 'must' ? 'tomorrow' : 'smart'),
    }));

    const tomorrowFixed = P.fixedFor(state, tomorrow).fixed;
    const tomorrowBuckets = It.dayBuckets(state, tomorrow);
    const routine = A.routines ? A.routines.byKind(state, today, ['evening', 'bedtime'], now) : null;

    const routineSteps = Object.values(day.routineChecks || {}).reduce((n, list) => n + list.length, 0);
    return {
      date: today, tomorrow,
      done: b.done, routineSteps,
      unfinished,
      tomorrow: {
        events: tomorrowFixed.map((f) => ({ title: f.title, at: U.toClock(f.start), away: f.away })),
        must: tomorrowBuckets.must.filter((i) => !unfinished.some((u) => u.item.id === i.id)),
        first: tomorrowFixed[0] ? { title: tomorrowFixed[0].title, at: U.toClock(tomorrowFixed[0].start) } : null,
        wake: state.prefs.wake,
      },
      routine,
      finished: !!day.evening,
      intention: M.getDay(state, tomorrow).intention || '',
    };
  }

  /** Ops that move every unfinished item: deadlines to tomorrow, the rest to calm days. */
  function moveAllOps(state, now) {
    const today = U.dateKey(now);
    const r = eveningReset(state, now);
    const load = {};
    return r.unfinished.map(({ item, suggest }) => {
      const to = suggest === 'tomorrow' ? U.addDays(today, 1) : P.nextGoodDay(state, today, item, load);
      load[to] = (load[to] || 0) + 1;
      return { op: 'item.postpone', id: item.id, to };
    });
  }

  A.evening = { eveningReset, moveAllOps };
})(typeof globalThis !== 'undefined' ? globalThis : this);
