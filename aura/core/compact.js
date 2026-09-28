/* Aura — retention.
 *
 * Keeps each stored slice bounded so a year of daily use never outgrows a
 * stored document, and so old personal detail does not linger forever.
 * Summaries that patterns need (a day's check-in, its mode) are kept longer
 * than the details (routine ticks, declined items).
 */
(function (root) {
  const A = root.Aura || (root.Aura = {});
  const U = A.util, M = A.model;

  const KEEP_DONE_DAYS = 60;
  const DAY_DETAIL_DAYS = 90;
  const DAY_SUMMARY_DAYS = 400;
  const LOG_DAYS = 180;
  const CYCLE_DAYS = 3 * 366;
  const JOURNAL_MAX = 300;

  function compact(state, now) {
    const today = U.dateKey(now);
    const next = U.clone(state);
    let changed = false;

    const doneCut = U.addDays(today, -KEEP_DONE_DAYS);
    const beforeItems = next.items.length;
    next.items = next.items.filter((i) => {
      if (i.status !== 'done' && i.status !== 'dropped') return true;
      const when = String(i.doneAt || i.updatedAt || '').slice(0, 10);
      return !when || when >= doneCut;
    });
    if (next.items.length !== beforeItems) changed = true;

    const detailCut = U.addDays(today, -DAY_DETAIL_DAYS);
    const summaryCut = U.addDays(today, -DAY_SUMMARY_DAYS);
    for (const key of Object.keys(next.days)) {
      if (key < summaryCut) { delete next.days[key]; changed = true; continue; }
      if (key < detailCut) {
        const d = next.days[key];
        if (d.routineChecks && Object.keys(d.routineChecks).length) changed = true;
        const pulse = M.pulseFor(next, key);
        next.days[key] = Object.assign({}, pulse ? { pulses: [pulse] } : {}, d.mode ? { mode: d.mode } : {},
          d.routineChecks ? { routineChecks: d.routineChecks } : {});
        if (key < U.addDays(today, -150)) delete next.days[key].routineChecks;
      }
    }

    const logCut = U.addDays(today, -LOG_DAYS);
    const beforeLog = next.log.length;
    next.log = next.log.filter((l) => !l.d || l.d >= logCut);
    if (next.log.length !== beforeLog) changed = true;

    const cycleCut = U.addDays(today, -CYCLE_DAYS);
    const beforeCycle = next.cycle.entries.length;
    next.cycle.entries = next.cycle.entries.filter((e) => e.date >= cycleCut);
    if (next.cycle.entries.length !== beforeCycle) changed = true;

    if (next.journal.length > JOURNAL_MAX) {
      next.journal = next.journal.slice(-JOURNAL_MAX);
      changed = true;
    }
    next.meta.lastCompacted = today;
    return { state: next, changed };
  }

  A.compact = { compact, KEEP_DONE_DAYS, DAY_DETAIL_DAYS, DAY_SUMMARY_DAYS, LOG_DAYS, JOURNAL_MAX };
})(typeof globalThis !== 'undefined' ? globalThis : this);
