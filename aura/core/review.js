/* Aura — weekly review.
 *
 * Useful, not vanity: what got done, what keeps getting moved, which days
 * were too full, which routines actually help, what important thing is
 * still open — and changes the user can apply with one tap.
 */
(function (root) {
  const A = root.Aura || (root.Aura = {});
  const U = A.util, M = A.model;

  /** The week to review: this week on Sunday, otherwise the week before. */
  function reviewWeek(today) {
    const start = U.startOfWeek(today);
    return U.weekday(today) === 0 ? start : U.addDays(start, -7);
  }

  function weeklyReview(state, now, weekStart) {
    const today = U.dateKey(now);
    const start = weekStart || reviewWeek(today);
    const end = U.addDays(start, 6);
    const inWeek = (d) => d >= start && d <= end;
    const log = state.log.filter((l) => l.d && inWeek(l.d));

    const doneIds = [];
    const doneByDay = {};
    for (const l of log) {
      if (l.ev !== 'done') continue;
      doneByDay[l.d] = (doneByDay[l.d] || 0) + 1;
      if (l.id && !doneIds.includes(l.id)) doneIds.push(l.id);
    }
    const done = doneIds.map((id) => M.itemById(state, id)).filter(Boolean);

    const postponeCount = {};
    for (const l of log) if (l.ev === 'postpone' && l.id) postponeCount[l.id] = (postponeCount[l.id] || 0) + 1;
    const postponed = Object.entries(postponeCount)
      .map(([id, count]) => ({ item: M.itemById(state, id), count }))
      .filter((p) => p.item && p.item.status === 'open' && p.count >= 2)
      .sort((a, b) => b.count - a.count);

    const movesByDay = {};
    for (const l of log) if (l.ev === 'postpone' || l.ev === 'move') movesByDay[l.d] = (movesByDay[l.d] || 0) + 1;
    const overloaded = Object.entries(movesByDay).filter(([, n]) => n >= 3)
      .map(([date, moves]) => ({ date, moves, done: doneByDay[date] || 0 }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const routines = A.routines ? state.routines.filter((r) => r.active).map((r) => {
      const c = A.routines.completion(state, r, U.addDays(end, 1), 7);
      return { routine: r, rate: c.rate, completed: c.completed, applicable: c.applicable };
    }).filter((r) => r.applicable >= 2) : [];

    const unfinishedImportant = state.items.filter((i) => i.status === 'open' && !i.recur
      && ((i.priority === 'must') || (i.dueDate && i.dueDate <= end))).slice(0, 8);

    const energies = log.filter((l) => l.ev === 'pulse' && l.e).map((l) => l.e);
    const moods = log.filter((l) => l.ev === 'pulse' && l.mo).map((l) => l.mo);
    const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

    const observations = A.patterns ? A.patterns.observations(state, now) : [];

    return {
      week: start, end, reviewed: state.meta.lastReviewWeek === start,
      done, doneCount: log.filter((l) => l.ev === 'done').length, doneByDay,
      postponed, overloaded, routines, unfinishedImportant,
      energy: avg(energies), mood: avg(moods), pulses: energies.length,
      observations,
    };
  }

  A.review = { weeklyReview, reviewWeek };
})(typeof globalThis !== 'undefined' ? globalThis : this);
