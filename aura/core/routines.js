/* Aura — adaptive routines.
 *
 * A routine is written once and comes back by itself. Check-offs are stored
 * per date, so tomorrow starts fresh without the user doing anything.
 *
 * Adaptive, not mechanical: open the morning routine at 10:45 and Aura
 * offers the short version — the core steps — without a word about the
 * time. Low energy or a tight window does the same. Steps can be skipped,
 * and the whole routine edited, at any point.
 */
(function (root) {
  const A = root.Aura || (root.Aura = {});
  const U = A.util, M = A.model, I = A.i18n;

  I.add({
    'rt.morning': ['Morgon', 'Morning'],
    'rt.evening': ['Kväll', 'Evening'],
    'rt.leaving': ['Gå hemifrån', 'Leaving home'],
    'rt.bedtime': ['Läggdags', 'Bedtime'],
    'rt.reset': ['Snabbstäd', 'Cleaning reset'],
    'rt.sunday': ['Söndagsnollställning', 'Sunday reset'],
    'rt.workday': ['Arbetsdagsstart', 'Workday start'],
    'rt.freeday': ['Ledig dag', 'Free day'],
    'rt.custom': ['Egen rutin', 'Custom routine'],
    'rt.short': ['Kort version — bara det viktigaste.', 'Short version — just the essentials.'],
    'rt.shortLow': ['Kort version i dag. Det räcker.', 'Short version today. That is enough.'],
    'rt.shortTight': ['Kort version — du har ont om tid.', 'Short version — time is tight.'],
    'rt.full': ['Hela rutinen.', 'The full routine.'],
    'rt.complete': ['Klart för i dag.', 'Done for today.'],
  });

  /* Templates are offered, never added on the user's behalf. */
  const TEMPLATES = {
    morning: {
      start: '07:00', end: '09:00',
      sv: [['Vatten och fönster', 1, true], ['Duscha och klä på dig', 12, true], ['Frukost', 15, true], ['Titta på dagen i Aura', 2, false], ['Plocka ihop det du ska ha med', 3, false]],
      en: [['Water and some daylight', 1, true], ['Shower and get dressed', 12, true], ['Breakfast', 15, true], ['Look at today in Aura', 2, false], ['Gather what you need to bring', 3, false]],
    },
    evening: {
      start: '19:30', end: '22:00',
      sv: [['Plocka undan i köket', 10, true], ['Lägg fram det du behöver i morgon', 3, false], ['Kvällsavstämning i Aura', 3, true], ['Telefonen på laddning utanför sovrummet', 1, false]],
      en: [['Tidy the kitchen', 10, true], ["Lay out what you'll need tomorrow", 3, false], ['Evening reset in Aura', 3, true], ['Phone on charge outside the bedroom', 1, false]],
    },
    leaving: {
      start: '', end: '',
      sv: [['Nycklar, plånbok, telefon', 1, true], ['Väska och det som ska med', 2, true], ['Spis och fönster', 1, false], ['Sopor med ut', 1, false]],
      en: [['Keys, wallet, phone', 1, true], ['Bag and anything that needs to come', 2, true], ['Hob and windows', 1, false], ['Take the rubbish out', 1, false]],
    },
    bedtime: {
      start: '22:00', end: '23:30',
      sv: [['Borsta tänderna', 3, true], ['Skärmen bort', 1, true], ['Något lugnt i tio minuter', 10, false]],
      en: [['Brush your teeth', 3, true], ['Screen away', 1, true], ['Something calm for ten minutes', 10, false]],
    },
    reset: {
      start: '', end: '',
      sv: [['Disken', 10, true], ['Plocka upp från golven', 5, true], ['Torka av ytorna i köket', 5, false], ['Töm soporna', 3, false], ['Vädra', 1, false]],
      en: [['The dishes', 10, true], ['Pick things up off the floor', 5, true], ['Wipe the kitchen surfaces', 5, false], ['Empty the bins', 3, false], ['Open a window', 1, false]],
    },
    sunday: {
      start: '16:00', end: '20:00',
      sv: [['Kolla veckan som kommer', 5, true], ['Veckogenomgång i Aura', 5, true], ['Handla eller beställ mat', 20, false], ['Tvätt igång', 5, false], ['Lägg fram det till måndag', 5, false]],
      en: [['Look at the week ahead', 5, true], ['Weekly review in Aura', 5, true], ['Shop or order food', 20, false], ['Start a wash', 5, false], ['Lay out things for Monday', 5, false]],
    },
    workday: {
      start: '08:00', end: '10:00',
      sv: [['Välj dagens viktigaste sak', 2, true], ['Stäng det du inte behöver', 2, false], ['Första fokuspasset', 25, true]],
      en: [["Pick today's most important thing", 2, true], ["Close what you don't need", 2, false], ['First focus block', 25, true]],
    },
    freeday: {
      start: '09:00', end: '12:00',
      sv: [['Sov ut om du kan', 1, false], ['Något som ger energi', 30, true], ['En liten sak hemma', 15, false]],
      en: [['Sleep in if you can', 1, false], ['Something that gives you energy', 30, true], ['One small thing at home', 15, false]],
    },
  };

  function template(kind) {
    const t = TEMPLATES[kind];
    if (!t) return null;
    const lang = I.language() === 'sv' ? 'sv' : 'en';
    return {
      name: I.t(`rt.${kind}`), kind, start: t.start, end: t.end,
      dayType: kind === 'workday' ? 'work' : kind === 'freeday' ? 'free' : 'any',
      weekdays: kind === 'sunday' ? [0] : [],
      steps: t[lang].map(([label, minutes, core]) => ({ label, minutes, core })),
    };
  }

  function templateKinds() { return Object.keys(TEMPLATES); }

  /** Does the routine belong to this day? Weekdays and day type decide. */
  function appliesOn(state, routine, key) {
    if (!routine.active) return false;
    if (routine.weekdays && routine.weekdays.length && !routine.weekdays.includes(U.weekday(key))) return false;
    if (routine.dayType === 'work' && !M.isWorkday(state, key)) return false;
    if (routine.dayType === 'free' && M.isWorkday(state, key)) return false;
    return true;
  }

  function windowOf(routine) {
    const start = U.toMinutes(routine.start);
    if (start === null) return null;
    const end = U.toMinutes(routine.end);
    return { start, end: end !== null && end > start ? end : start + 90 };
  }

  /** The routine as it should be offered right now: full or short, with today's check-offs. */
  function view(state, routine, now) {
    const key = U.dateKey(now);
    const nowMin = U.minutesOfDay(now);
    const day = M.getDay(state, key);
    const checks = new Set(day.routineChecks[routine.id] || []);
    const skips = new Set(day.routineSkips[routine.id] || []);
    const win = windowOf(routine);
    const pulse = M.pulseFor(state, key);
    const mode = day.mode;

    const steps = routine.steps.map((s) => ({ ...s, done: checks.has(s.id), skipped: skips.has(s.id) }));
    const allLeft = steps.filter((s) => !s.done && !s.skipped);
    const leftMinutes = allLeft.reduce((sum, s) => sum + s.minutes, 0);

    let variant = 'full';
    let reason = 'rt.full';
    const late = !!win && nowMin > win.end;
    const low = (pulse && pulse.energy != null && pulse.energy <= 2) || mode === 'low' || mode === 'recovery';
    let tight = false;
    if (A.planner) {
      const plan = A.planner.planDay(state, now);
      tight = plan.minutesUntilNext != null && plan.minutesUntilNext < leftMinutes;
    }
    const hasOptional = steps.some((s) => !s.core);
    if (hasOptional && (late || low || tight)) {
      variant = 'short';
      reason = low ? 'rt.shortLow' : tight ? 'rt.shortTight' : 'rt.short';
    }
    if (day.routineVariant && day.routineVariant[routine.id]) variant = day.routineVariant[routine.id];

    const shown = variant === 'short' ? steps.filter((s) => s.core) : steps;
    const remaining = shown.filter((s) => !s.done && !s.skipped);
    const remainingCore = steps.filter((s) => s.core && !s.done && !s.skipped).length;
    return {
      routine, steps: shown, allSteps: steps, variant, reason: remaining.length ? reason : 'rt.complete',
      remaining: remaining.length, remainingCore,
      minutesLeft: remaining.reduce((sum, s) => sum + s.minutes, 0),
      total: shown.length, done: shown.filter((s) => s.done).length,
      complete: remaining.length === 0, inWindow: !!win && nowMin >= win.start - 15 && nowMin <= win.end, late,
    };
  }

  /** Routines whose usual window is now, today, not yet finished. */
  function dueNow(state, now) {
    const key = U.dateKey(now);
    const nowMin = U.minutesOfDay(now);
    return state.routines
      .filter((r) => appliesOn(state, r, key))
      .filter((r) => { const w = windowOf(r); return w && nowMin >= w.start - 15 && nowMin <= w.end; })
      .map((r) => view(state, r, now))
      .filter((v) => !v.complete);
  }

  function byKind(state, key, kinds, now) {
    const r = state.routines.find((x) => kinds.includes(x.kind) && appliesOn(state, x, key));
    return r ? view(state, r, now) : null;
  }

  function todays(state, now) {
    const key = U.dateKey(now);
    return state.routines.filter((r) => appliesOn(state, r, key)).map((r) => view(state, r, now));
  }

  /** Share of days a routine's core steps were finished, over the last `days` applicable days. */
  function completion(state, routine, today, days) {
    let applicable = 0, completed = 0;
    const core = routine.steps.filter((s) => s.core).map((s) => s.id);
    for (let i = 1; i <= (days || 14); i += 1) {
      const key = U.addDays(today, -i);
      if (!appliesOn(state, routine, key)) continue;
      const d = state.days[key];
      if (!d) continue;   // days Aura was not opened say nothing
      applicable += 1;
      const checks = new Set(((d.routineChecks || {})[routine.id]) || []);
      const skips = new Set(((d.routineSkips || {})[routine.id]) || []);
      if (core.length && core.every((id) => checks.has(id) || skips.has(id))) completed += 1;
    }
    return { applicable, completed, rate: applicable ? completed / applicable : null };
  }

  A.routines = { TEMPLATES, template, templateKinds, appliesOn, windowOf, view, dueNow, byKind, todays, completion };
})(typeof globalThis !== 'undefined' ? globalThis : this);
