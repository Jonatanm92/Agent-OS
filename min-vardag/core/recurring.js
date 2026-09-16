/* Min vardag — återkommande åtaganden och veckoöversikt.
 *
 * Ett återkommande åtagande skrivs in en gång och gäller sedan de veckodagar
 * du valt. Det gör INTE någon dag till arbetsdag eller barndag av sig självt —
 * den frågan svarar du på separat, och okänt förblir okänt.
 */
(function (root) {
  const MV = root.MinVardag || (root.MinVardag = {});
  const U = MV.util, M = MV.model;

  /** De återkommande åtaganden som infaller ett visst datum. */
  function forDate(state, dateKey) {
    const weekday = U.weekday(dateKey);
    const out = [];
    for (const r of state.recurring || []) {
      if (!r.active) continue;
      if (!r.weekdays.includes(weekday)) continue;
      const start = U.toMinutes(r.start);
      if (start === null) continue;

      // Gäller åtagandet ett visst barn, kräver det att barnet faktiskt är här.
      if (r.childIds && r.childIds.length) {
        const anyPresent = r.childIds.some((id) => M.childPresence(state, dateKey, id) === 'ja');
        if (!anyPresent) continue;
      }
      const end = U.toMinutes(r.end);
      out.push({
        id: `ater:${r.id}:${dateKey}`,
        recurringId: r.id,
        title: r.title,
        kind: r.kind,
        start,
        end: end !== null && end > start ? end : start + 60,
        travel: r.travel !== false,
        generated: true,
        recurringSource: true,
      });
    }
    return out.sort((a, b) => a.start - b.start);
  }

  /** Läsbar beskrivning: "Tisdagar och torsdagar 19:00". */
  function describe(r) {
    const names = ['söndagar', 'måndagar', 'tisdagar', 'onsdagar', 'torsdagar', 'fredagar', 'lördagar'];
    const days = (r.weekdays || []).slice().sort();
    if (!days.length) return 'Ingen dag vald';
    const isWeekdays = days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d));
    const isWeekend = days.length === 2 && days.includes(0) && days.includes(6);
    let when;
    if (isWeekdays) when = 'Vardagar';
    else if (isWeekend) when = 'Helger';
    else if (days.length === 1) when = names[days[0]].charAt(0).toUpperCase() + names[days[0]].slice(1);
    else {
      const labels = days.map((d) => names[d]);
      when = `${labels.slice(0, -1).join(', ')} och ${labels[labels.length - 1]}`;
      when = when.charAt(0).toUpperCase() + when.slice(1);
    }
    return r.start ? `${when} ${r.start}` : when;
  }

  /**
   * Översikt över kommande dagar. Visar bara vad som faktiskt är känt —
   * okänt redovisas som okänt, aldrig som antagande.
   */
  function weekOverview(state, now, dayCount) {
    const today = U.dateKey(now);
    const days = [];
    for (let i = 0; i < (dayCount || 7); i += 1) {
      const dateKey = U.addDays(today, i);
      const presence = M.presenceSummary(state, dateKey);
      const work = M.workdayFor(state, dateKey);
      const fixed = MV.planner.buildFixed(state, dateKey, { nowMinutes: 0, isToday: i === 0 }).fixed
        .filter((f) => f.id !== 'morgon');
      const tasks = M.openTasks(state).filter((t) => t.scheduledDate === dateKey);
      const deadlines = M.openTasks(state).filter((t) => t.deadline === dateKey);
      days.push({
        dateKey,
        isToday: i === 0,
        weekday: U.weekday(dateKey),
        dayName: U.dayName(dateKey),
        dayNumber: Number(dateKey.slice(8)),
        relative: U.relativeDay(dateKey, today),
        work,
        energy: M.energyFor(state, dateKey),
        present: presence.present,
        unknownChildren: presence.unknown,
        fixed: fixed.map((f) => ({ title: f.title, at: U.toClock(f.start), kind: f.kind })),
        taskCount: tasks.length,
        deadlines: deadlines.map((t) => ({ id: t.id, title: t.title })),
      });
    }
    return days;
  }

  MV.recurring = { forDate, describe, weekOverview };
})(typeof globalThis !== 'undefined' ? globalThis : this);
