/* Aura — cycle (optional module, off by default).
 *
 * Personal tracking and wellbeing support. Not medical:
 *  - Estimates come only from the user's own logged days and say so.
 *  - Observations are phrased as "in your own logs", with the counts behind
 *    them, and are never presented as medical fact.
 *  - Nothing here diagnoses anything. Turning the module off hides it, and
 *    all cycle data can be deleted with one action.
 */
(function (root) {
  const A = root.Aura || (root.Aura = {});
  const U = A.util, I = A.i18n;

  I.add({
    'cyc.symptom.cramps': ['Kramper', 'Cramps'],
    'cyc.symptom.headache': ['Huvudvärk', 'Headache'],
    'cyc.symptom.fatigue': ['Trötthet', 'Fatigue'],
    'cyc.symptom.bloating': ['Uppblåst', 'Bloating'],
    'cyc.symptom.tender': ['Ömma bröst', 'Tender breasts'],
    'cyc.symptom.mood': ['Humörsvängningar', 'Mood swings'],
    'cyc.symptom.skin': ['Hud', 'Skin'],
    'cyc.symptom.back': ['Ryggont', 'Back pain'],
    'cyc.symptom.cravings': ['Sug', 'Cravings'],
    'cyc.symptom.sleep': ['Sömnbesvär', 'Sleep trouble'],
    'cyc.obsEnergy': ['I dina egna anteckningar har energin i snitt varit {a} på mensdagar och {b} andra dagar ({n} incheckningar).', 'In your own logs, energy has averaged {a} on period days and {b} on other days ({n} check-ins).'],
    'cyc.obsMood': ['I dina egna anteckningar har humöret i snitt varit {a} på mensdagar och {b} andra dagar ({n} incheckningar).', 'In your own logs, mood has averaged {a} on period days and {b} on other days ({n} check-ins).'],
  });

  const SYMPTOMS = ['cramps', 'headache', 'fatigue', 'bloating', 'tender', 'mood', 'skin', 'back', 'cravings', 'sleep'];

  function periodDays(state) {
    return (state.cycle.entries || []).filter((e) => e.period).map((e) => e.date).sort();
  }

  /** First day of each period: a period day with no period day in the three days before it. */
  function starts(state) {
    const days = periodDays(state);
    const set = new Set(days);
    return days.filter((d) => ![1, 2, 3].some((k) => set.has(U.addDays(d, -k))));
  }

  function summary(state, today) {
    const s = starts(state);
    const set = new Set(periodDays(state));
    const lengths = [];
    for (let i = 1; i < s.length; i += 1) {
      const len = U.daysBetween(s[i - 1], s[i]);
      if (len >= 15 && len <= 60) lengths.push(len);
    }
    const recent = lengths.slice(-6);
    const avg = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : null;
    const spread = recent.length >= 2 ? Math.ceil((Math.max(...recent) - Math.min(...recent)) / 2) : null;

    const periodLengths = s.map((start) => { let n = 0; while (set.has(U.addDays(start, n))) n += 1; return n; }).filter((n) => n > 0);
    const periodLength = periodLengths.length ? Math.round(periodLengths.slice(-6).reduce((a, b) => a + b, 0) / Math.min(6, periodLengths.length)) : null;

    const last = s[s.length - 1] || null;
    const cycleDay = last && last <= today ? U.daysBetween(last, today) + 1 : null;
    let next = null;
    if (last && avg && recent.length >= 2) {
      const expected = U.addDays(last, avg);
      const margin = Math.max(2, spread || 0);
      next = { expected, from: U.addDays(expected, -margin), to: U.addDays(expected, margin), basedOn: recent.length };
    }
    const todayEntry = (state.cycle.entries || []).find((e) => e.date === today) || null;
    return {
      starts: s, cycleLengths: recent, averageLength: avg, spread, periodLength, lastStart: last, cycleDay, next,
      today: todayEntry, onPeriod: set.has(today), enoughData: recent.length >= 2,
    };
  }

  /** Observations from the user's own check-ins, only with enough data. */
  function observations(state) {
    const set = new Set(periodDays(state));
    if (starts(state).length < 3) return [];
    const onE = [], offE = [], onM = [], offM = [];
    for (const [d, day] of Object.entries(state.days || {})) {
      for (const p of day.pulses || []) {
        if (p.energy) (set.has(d) ? onE : offE).push(p.energy);
        if (p.mood) (set.has(d) ? onM : offM).push(p.mood);
      }
    }
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const fmt = (n) => (Math.round(n * 10) / 10).toString().replace('.', I.language() === 'sv' ? ',' : '.');
    const out = [];
    if (onE.length >= 6 && offE.length >= 10 && Math.abs(avg(onE) - avg(offE)) >= 0.6) {
      out.push({ key: 'cyc.obsEnergy', params: { a: fmt(avg(onE)), b: fmt(avg(offE)), n: onE.length + offE.length } });
    }
    if (onM.length >= 6 && offM.length >= 10 && Math.abs(avg(onM) - avg(offM)) >= 0.6) {
      out.push({ key: 'cyc.obsMood', params: { a: fmt(avg(onM)), b: fmt(avg(offM)), n: onM.length + offM.length } });
    }
    return out;
  }

  A.cycle = { SYMPTOMS, periodDays, starts, summary, observations };
})(typeof globalThis !== 'undefined' ? globalThis : this);
