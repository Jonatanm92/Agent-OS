/* Min vardag — datamodell, standardvärden och härledda frågor om dagen.
 * Viktig regel: "okänt" är alltid ett tillåtet värde och standardvärdet.
 * Appen hittar aldrig på barnschema, arbetsdagar, lämningar eller hämtningar. */
(function (root) {
  const MV = root.MinVardag || (root.MinVardag = {});
  const U = MV.util;

  const SCHEMA_VERSION = 1;

  /** Status för barnens behov. Tre tydligt åtskilda steg. */
  const NEED_STATUS = {
    behover: { id: 'behover', label: 'Behöver ordnas', short: 'Behövs', rank: 0 },
    planerat: { id: 'planerat', label: 'Planerat', short: 'Planerat', rank: 1 },
    bekraftat: { id: 'bekraftat', label: 'Bekräftat klart', short: 'Klart', rank: 2 },
  };

  /** Ork. 'okand' är giltigt och leder till en försiktig, normal plan. */
  const ENERGY = {
    okand: { id: 'okand', label: 'Okänd', capacity: 0.75 },
    lag: { id: 'lag', label: 'Låg', capacity: 0.35 },
    ok: { id: 'ok', label: 'Okej', capacity: 0.8 },
    god: { id: 'god', label: 'God', capacity: 1.0 },
  };

  const TRISTATE = ['ja', 'nej', 'okand'];

  function defaultSettings() {
    return {
      wakeTime: '05:00',
      bedtime: '21:30',
      // Arbetstider och lämning används bara de dagar som faktiskt är bekräftade.
      workStart: '07:00',
      workEnd: '16:00',
      dropOffTime: '06:00',
      pickUpTime: '',          // okänt tills det anges
      commuteMin: 20,          // marginal kring fasta åtaganden (resa)
      minFreeMarginPct: 0.3,   // minst 30 % av ledig tid lämnas oplanerad
      maxPriorities: 3,
      eveningQuietFrom: '20:00', // efter denna tid: högst en aktivitet + förberedelser
      meals: [
        { id: 'lunch', label: 'Lunch', time: '12:00', minutes: 40 },
        { id: 'middag', label: 'Middag', time: '17:00', minutes: 45 },
      ],
      // Egen tid: bara sådant Jonatan själv lagt in föreslås. Appen hittar
      // aldrig på städning eller nya projekt för att fylla ledig tid.
      ownTime: [],
      aiOptIn: true,
      calendarConnected: false,
    };
  }

  /** Veckomall: allt okänt tills det anges. Nyckel '0'=söndag ... '6'=lördag. */
  function defaultWeekTemplate() {
    const tpl = {};
    for (let d = 0; d < 7; d++) tpl[String(d)] = { work: 'okand', children: 'okand' };
    return tpl;
  }

  function emptyState() {
    return {
      version: SCHEMA_VERSION,
      settings: defaultSettings(),
      children: [],
      weekTemplate: defaultWeekTemplate(),
      days: {},
      needs: [],
      tasks: [],
      sizes: [],
      commitments: [],
      recurring: [],    // återkommande åtaganden (träning, aktiviteter, arbetspass)
      routines: [],     // morgon- och kvällsrutiner som återkommer av sig själva
      packLists: [],    // packlistor per barn och tillfälle
      updatedAt: null,
    };
  }

  /** Fyller i saknade fält efter inläsning, så gamla sparade data inte kraschar. */
  function migrate(raw) {
    const base = emptyState();
    if (!raw || typeof raw !== 'object') return base;
    const s = Object.assign(base, raw);
    s.settings = Object.assign(defaultSettings(), raw.settings || {});
    s.settings.meals = (raw.settings && raw.settings.meals) || defaultSettings().meals;
    s.settings.ownTime = (raw.settings && raw.settings.ownTime) || [];
    s.weekTemplate = Object.assign(defaultWeekTemplate(), raw.weekTemplate || {});
    for (const key of ['children', 'needs', 'tasks', 'sizes', 'commitments', 'recurring', 'routines', 'packLists']) {
      if (!Array.isArray(s[key])) s[key] = [];
    }
    if (!s.days || typeof s.days !== 'object') s.days = {};
    s.version = SCHEMA_VERSION;
    return s;
  }

  function newChild(name) {
    return { id: U.makeId('barn'), name: String(name).trim(), createdAt: new Date().toISOString() };
  }

  /** Ett behov: t.ex. "två par byxor" till ett visst barn. */
  function newNeed(fields) {
    const qty = Math.max(1, Number(fields.qty) || 1);
    return {
      id: U.makeId('behov'),
      childId: fields.childId || null,
      title: String(fields.title || '').trim(),
      garment: fields.garment || null,   // normaliserad plaggtyp, för språktolkning
      qty,
      doneQty: 0,
      status: fields.status || 'behover',
      note: fields.note || '',
      deadline: fields.deadline || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [],
    };
  }

  /** En uppgift i planen. */
  function newTask(fields) {
    return {
      id: U.makeId('uppg'),
      title: String(fields.title || '').trim(),
      kind: fields.kind || 'uppgift',          // uppgift | inkop | forberedelse | egen
      childId: fields.childId || null,
      needIds: fields.needIds || [],
      minutes: Math.max(5, Number(fields.minutes) || 30),
      load: fields.load || 'medel',            // latt | medel | tung
      context: fields.context || 'var som helst', // hemma | ute | butik | telefon | var som helst
      earliest: fields.earliest || '',         // 'HH:MM' tidigast
      deadline: fields.deadline || '',         // 'YYYY-MM-DD'
      mustToday: !!fields.mustToday,
      status: fields.status || 'oppen',        // oppen | klar | vilande
      scheduledDate: fields.scheduledDate || '',
      createdAt: new Date().toISOString(),
      doneAt: '',
      source: fields.source || 'manuell',
      lastOfferedDate: '',
    };
  }

  /** Storlek. Kroppsmått hålls strikt åtskilt från ett visst märkes plagg. */
  function newSize(fields) {
    return {
      id: U.makeId('storlek'),
      childId: fields.childId,
      kind: fields.kind === 'kropp' ? 'kropp' : 'marke', // kropp = uppmätt, marke = plaggstorlek
      brand: fields.kind === 'kropp' ? '' : (fields.brand || ''),
      label: fields.label || '',      // t.ex. "Kroppslängd" eller "Tjocktröja"
      value: String(fields.value || ''),
      preliminary: fields.preliminary !== false, // preliminärt tills det verifierats
      note: fields.note || '',
      updatedAt: new Date().toISOString(),
    };
  }

  function dayDefaults() {
    return {
      energy: 'okand', work: null, children: {}, note: '',
      prepDone: [], skipped: [],
      routineDone: {},   // { rutinId: [punktId, ...] } — nollställs av sig själv varje dag
      packDone: {},      // { packlistId: [punktId, ...] }
    };
  }

  /** Dagens kontext: dagsöverstyrning vinner över veckomall, annars okänt. */
  function getDay(state, dateKey) {
    const stored = state.days[dateKey] || {};
    return Object.assign(dayDefaults(), stored, {
      children: Object.assign({}, stored.children || {}),
      prepDone: (stored.prepDone || []).slice(),
      skipped: (stored.skipped || []).slice(),
      routineDone: Object.assign({}, stored.routineDone || {}),
      packDone: Object.assign({}, stored.packDone || {}),
    });
  }

  /** Är det arbetsdag? 'ja' | 'nej' | 'okand' — aldrig gissat. */
  function workdayFor(state, dateKey) {
    const day = getDay(state, dateKey);
    if (day.work === 'ja' || day.work === 'nej') return day.work;
    const tpl = state.weekTemplate[String(U.weekday(dateKey))];
    return (tpl && TRISTATE.includes(tpl.work)) ? tpl.work : 'okand';
  }

  /** Är ett visst barn hos mig? 'ja' | 'nej' | 'okand'. */
  function childPresence(state, dateKey, childId) {
    const day = getDay(state, dateKey);
    const override = day.children[childId];
    if (override === 'ja' || override === 'nej') return override;
    const tpl = state.weekTemplate[String(U.weekday(dateKey))];
    return (tpl && TRISTATE.includes(tpl.children)) ? tpl.children : 'okand';
  }

  /** Sammanfattning av barnens närvaro en viss dag. */
  function presenceSummary(state, dateKey) {
    const present = [], away = [], unknown = [];
    for (const child of state.children) {
      const value = childPresence(state, dateKey, child.id);
      (value === 'ja' ? present : value === 'nej' ? away : unknown).push(child);
    }
    return { present, away, unknown };
  }

  function energyFor(state, dateKey) {
    const day = getDay(state, dateKey);
    return ENERGY[day.energy] ? day.energy : 'okand';
  }

  function childById(state, id) {
    return state.children.find((c) => c.id === id) || null;
  }

  function childName(state, id) {
    const child = childById(state, id);
    return child ? child.name : '';
  }

  /** Återstående antal för ett behov (t.ex. 1 av 2 byxor kvar). */
  function needRemaining(need) {
    return Math.max(0, (Number(need.qty) || 1) - (Number(need.doneQty) || 0));
  }

  /** Öppna behov = allt som inte är bekräftat klart. */
  function openNeeds(state) {
    return state.needs.filter((n) => n.status !== 'bekraftat');
  }

  function openTasks(state) {
    return state.tasks.filter((t) => t.status === 'oppen');
  }

  /** Ett återkommande åtagande. Veckodagar: 0 = söndag ... 6 = lördag. */
  function newRecurring(fields) {
    return {
      id: U.makeId('ater'),
      title: String(fields.title || '').trim(),
      kind: fields.kind || 'annat',          // arbete | barn | egen | annat
      weekdays: (fields.weekdays || []).map(Number).filter((d) => d >= 0 && d <= 6),
      start: fields.start || '',
      end: fields.end || '',
      childIds: fields.childIds || [],
      travel: fields.travel !== false,
      active: fields.active !== false,
      note: fields.note || '',
      createdAt: new Date().toISOString(),
    };
  }

  /** En rutin: en kort lista som återkommer utan att skrivas in på nytt. */
  function newRoutine(fields) {
    return {
      id: U.makeId('rutin'),
      name: String(fields.name || '').trim(),
      when: fields.when === 'kvall' ? 'kvall' : 'morgon',
      items: (fields.items || []).map((label) => ({ id: U.makeId('punkt'), label: String(label).trim() })),
      weekdays: Array.isArray(fields.weekdays) ? fields.weekdays.map(Number) : null,  // null = alla dagar
      requiresChildren: !!fields.requiresChildren,
      active: fields.active !== false,
      createdAt: new Date().toISOString(),
    };
  }

  function newPackList(fields) {
    return {
      id: U.makeId('pack'),
      name: String(fields.name || '').trim(),
      childId: fields.childId || null,     // null = gäller alla barn
      items: (fields.items || []).map((label) => ({ id: U.makeId('punkt'), label: String(label).trim() })),
      createdAt: new Date().toISOString(),
    };
  }

  MV.model = {
    SCHEMA_VERSION, NEED_STATUS, ENERGY, TRISTATE,
    newRecurring, newRoutine, newPackList,
    emptyState, migrate, defaultSettings, defaultWeekTemplate, dayDefaults,
    newChild, newNeed, newTask, newSize,
    getDay, workdayFor, childPresence, presenceSummary, energyFor,
    childById, childName, needRemaining, openNeeds, openTasks,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
