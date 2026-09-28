/* Aura — personal patterns.
 *
 * Privacy-conscious and humble: patterns are computed on the device from
 * the user's own log, need several occurrences before Aura says anything,
 * and are phrased as observations ("you often…"), never as diagnoses or
 * judgments. Every observation can be dismissed for good.
 */
(function (root) {
  const A = root.Aura || (root.Aura = {});
  const U = A.util, M = A.model, I = A.i18n;

  I.add({
    'pat.postponeWeekday': ['Du flyttar ofta {title} på {day}ar. Ska jag sluta lägga den där?', 'You often move {title} on {day}s. Want me to stop putting it there?'],
    'pat.oftenPostponed': ['{title} har flyttats {n} gånger. Göra den mindre, ge den en dag, eller släppa den?', "{title} has been moved {n} times. Make it smaller, give it a day, or let it go?"],
    'pat.declined': ['Du säger ofta ”inte nu” till {title}.', 'You often say "not now" to {title}.'],
    'pat.energyPeak': ['Din energi brukar vara högst på {period}. Ska Aura lägga tyngre saker där?', 'Your energy tends to be highest in the {period}. Want Aura to put heavier things there?'],
    'pat.routineSticks': ['{name} blir oftast av. Den fungerar.', 'Your {name} routine usually happens. It works.'],
    'pat.routineStruggles': ['{name} blir sällan klar. En kortare version?', 'Your {name} routine rarely gets finished. A shorter version?'],
    'pat.overloaded': ['{day}ar blir ofta överfulla — saker flyttas vidare.', '{day}s often end up overloaded — things get moved on.'],
    'pat.act.stopPutting': ['Ja, undvik den dagen', 'Yes, avoid that day'],
    'pat.act.smaller': ['Gör mindre', 'Make it smaller'],
    'pat.act.drop': ['Släpp den', 'Let it go'],
    'pat.act.later': ['Kan vänta', 'Can wait'],
    'pat.act.peak': ['Ja, gör det', 'Yes, do that'],
    'pat.act.shorten': ['Gör den kortare', 'Shorten it'],
    'pat.act.lighter': ['Planera lättare dagar', 'Plan lighter days'],
    'period.morning': ['förmiddagen', 'morning'],
    'period.afternoon': ['eftermiddagen', 'afternoon'],
    'period.evening': ['kvällen', 'evening'],
  });

  function recentLog(state, today, days) {
    const from = U.addDays(today, -days);
    return state.log.filter((l) => l.d && l.d >= from && l.d <= today);
  }

  function observations(state, now) {
    const today = U.dateKey(now);
    const out = [];
    const log60 = recentLog(state, today, 60);
    const open = (id) => { const it = M.itemById(state, id); return it && it.status === 'open' ? it : null; };

    /* postponed on the same weekday, again and again */
    const byItemDay = {};
    for (const l of log60) {
      if (l.ev !== 'postpone' || !l.id) continue;
      const k = `${l.id}|${l.wd}`;
      byItemDay[k] = (byItemDay[k] || 0) + 1;
    }
    for (const [k, n] of Object.entries(byItemDay)) {
      if (n < 3) continue;
      const [id, wd] = k.split('|');
      const item = open(id);
      if (!item || (item.avoidWeekdays || []).includes(Number(wd))) continue;
      out.push({
        key: `pw:${id}:${wd}`, kind: 'postponeWeekday', strength: n,
        text: { key: 'pat.postponeWeekday', params: { title: item.title, day: I.weekdayName(Number(wd)) } },
        actions: [{ label: { key: 'pat.act.stopPutting' }, ops: stopPuttingOps(state, item, Number(wd), today) }],
      });
    }

    /* moved many times overall */
    for (const item of state.items) {
      if (item.status !== 'open' || (item.postponed || 0) < 3 || item.recur) continue;
      if (out.some((o) => o.key.startsWith(`pw:${item.id}:`))) continue;
      out.push({
        key: `pp:${item.id}:${item.postponed}`, kind: 'oftenPostponed', strength: item.postponed, itemId: item.id,
        text: { key: 'pat.oftenPostponed', params: { title: item.title, n: item.postponed } },
        actions: [
          { label: { key: 'pat.act.smaller' }, nav: { view: 'item', id: item.id, split: true } },
          { label: { key: 'pat.act.later' }, ops: [{ op: 'item.postpone', id: item.id, to: 'later' }] },
          { label: { key: 'pat.act.drop' }, ops: [{ op: 'item.drop', id: item.id }] },
        ],
      });
    }

    /* "not now" again and again */
    const declines = {};
    for (const l of recentLog(state, today, 30)) if (l.ev === 'decline' && l.id) declines[l.id] = (declines[l.id] || 0) + 1;
    for (const [id, n] of Object.entries(declines)) {
      const item = open(id);
      if (!item || n < 4 || out.some((o) => o.itemId === id)) continue;
      out.push({
        key: `dc:${id}:${n >= 8 ? 8 : 4}`, kind: 'declined', strength: n, itemId: id,
        text: { key: 'pat.declined', params: { title: item.title } },
        actions: [
          { label: { key: 'pat.act.smaller' }, nav: { view: 'item', id, split: true } },
          { label: { key: 'pat.act.later' }, ops: [{ op: 'item.postpone', id, to: 'later' }] },
          { label: { key: 'pat.act.drop' }, ops: [{ op: 'item.drop', id }] },
        ],
      });
    }

    /* energy by time of day, from the user's own check-ins */
    const periods = { morning: [], afternoon: [], evening: [] };
    for (const l of recentLog(state, today, 42)) {
      if (l.ev !== 'pulse' || !l.e) continue;
      const p = l.h < 12 ? 'morning' : l.h < 17 ? 'afternoon' : 'evening';
      periods[p].push(l.e);
    }
    const avgs = Object.entries(periods).filter(([, v]) => v.length >= 3).map(([p, v]) => [p, v.reduce((a, b) => a + b, 0) / v.length]);
    const totalPulses = Object.values(periods).reduce((n, v) => n + v.length, 0);
    if (avgs.length >= 2 && totalPulses >= 8) {
      avgs.sort((a, b) => b[1] - a[1]);
      const [best, bestAvg] = avgs[0];
      const worstAvg = avgs[avgs.length - 1][1];
      if (bestAvg - worstAvg >= 0.8 && state.prefs.peakPeriod !== best) {
        out.push({
          key: `peak:${best}`, kind: 'energyPeak', strength: bestAvg - worstAvg,
          text: { key: 'pat.energyPeak', params: { period: I.t(`period.${best}`) } },
          actions: [{ label: { key: 'pat.act.peak' }, ops: [{ op: 'prefs.set', patch: { peakPeriod: best } }] }],
        });
      }
    }

    /* routines */
    if (A.routines) {
      for (const r of state.routines) {
        if (!r.active) continue;
        const c = A.routines.completion(state, r, today, 21);
        if (c.applicable < 5) continue;
        if (c.rate >= 0.7) {
          out.push({ key: `rs:${r.id}`, kind: 'routineSticks', strength: c.rate, positive: true,
            text: { key: 'pat.routineSticks', params: { name: r.name } }, actions: [] });
        } else if (c.rate <= 0.3 && r.steps.length >= 3) {
          const shorter = r.steps.map((s, i) => ({ ...s, core: i < 2 }));
          out.push({ key: `rx:${r.id}`, kind: 'routineStruggles', strength: 1 - c.rate,
            text: { key: 'pat.routineStruggles', params: { name: r.name } },
            actions: [{ label: { key: 'pat.act.shorten' }, ops: [{ op: 'routine.update', id: r.id, patch: { steps: shorter } }] }] });
        }
      }
    }

    /* overloaded weekdays: several things moved on the same weekday, week after week */
    const movesByDay = {};
    for (const l of recentLog(state, today, 35)) {
      if (l.ev !== 'postpone' && l.ev !== 'move') continue;
      movesByDay[l.d] = (movesByDay[l.d] || 0) + 1;
    }
    const heavyByWd = {};
    for (const [d, n] of Object.entries(movesByDay)) if (n >= 3) heavyByWd[U.weekday(d)] = (heavyByWd[U.weekday(d)] || 0) + 1;
    for (const [wd, n] of Object.entries(heavyByWd)) {
      if (n < 2) continue;
      out.push({ key: `ov:${wd}`, kind: 'overloaded', strength: n,
        text: { key: 'pat.overloaded', params: { day: U.capitalize(I.weekdayName(Number(wd))) } },
        actions: state.prefs.density !== 'light' ? [{ label: { key: 'pat.act.lighter' }, ops: [{ op: 'prefs.set', patch: { density: state.prefs.density === 'full' ? 'balanced' : 'light' } }] }] : [] });
    }

    return out.filter((o) => !(state.meta.dismissedPatterns || []).includes(o.key))
      .sort((a, b) => (a.positive ? 1 : 0) - (b.positive ? 1 : 0) || b.strength - a.strength);
  }

  function stopPuttingOps(state, item, wd, today) {
    const ops = [{ op: 'item.update', id: item.id, patch: { avoidWeekdays: U.uniq([...(item.avoidWeekdays || []), wd]) } }];
    if (item.date && item.date >= today && U.weekday(item.date) === wd) {
      const probe = Object.assign({}, item, { avoidWeekdays: U.uniq([...(item.avoidWeekdays || []), wd]) });
      ops.push({ op: 'item.schedule', id: item.id, date: A.planner.nextGoodDay(state, item.date, probe) });
    }
    return ops;
  }

  A.patterns = { observations };
})(typeof globalThis !== 'undefined' ? globalThis : this);
