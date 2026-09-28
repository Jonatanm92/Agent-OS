/* Aura — data model, defaults and migration.
 *
 * One person's Aura is one state object. It is persisted in slices
 * (core, items, days, log, cycle, journal) so no single stored document
 * grows without bound, but the app always works on the whole.
 *
 * Rules the model keeps:
 *  - Unknown is a valid value. Nothing about the user's schedule is invented.
 *  - One Item type covers tasks, shopping, admin, chores, reminders, notes and
 *    ideas. Kind decides how Aura treats it; the user never has to file it.
 *  - Nothing names a real person. Preferences hold whatever the user tells us.
 */
(function (root) {
  const A = root.Aura || (root.Aura = {});
  const U = A.util;

  const SCHEMA = 1;

  const KINDS = ['task', 'shopping', 'admin', 'chore', 'reminder', 'note', 'idea'];
  const STATUSES = ['inbox', 'open', 'done', 'dropped'];
  const PRIORITIES = ['must', 'good', 'later', ''];
  const ENERGIES = ['light', 'medium', 'heavy'];
  const CONTEXTS = ['home', 'out', 'phone', 'computer', 'anywhere'];
  const ADMIN_STATUSES = ['action', 'waiting', 'followup'];
  const MODES = ['normal', 'work', 'free', 'low', 'chaos', 'recovery'];
  const MANUAL_MODES = ['low', 'chaos', 'recovery'];
  const MODULES = ['shopping', 'admin', 'home', 'projects', 'routines', 'cycle', 'reflection'];
  const SHOP_CATEGORIES = ['produce', 'dairy', 'bread', 'meat', 'pantry', 'frozen', 'drinks', 'household', 'hygiene', 'pharmacy', 'baby', 'clothing', 'pets', 'other'];
  const ADMIN_CATEGORIES = ['appointment', 'call', 'form', 'payment', 'subscription', 'delivery', 'school', 'household', 'other'];
  const ROUTINE_KINDS = ['morning', 'evening', 'leaving', 'bedtime', 'reset', 'sunday', 'workday', 'freeday', 'custom'];

  function defaultPrefs() {
    return {
      language: '',               // '' until chosen; the app guesses from the device
      name: '',
      timeZone: U.deviceTimeZone(),
      tone: 'warm',               // warm | direct
      density: 'balanced',        // light | balanced | full — how much Aura puts in a day
      wake: '07:00',
      sleep: '23:00',
      workDays: [1, 2, 3, 4, 5],
      workStart: '',              // '' = no fixed working hours (unknown is fine)
      workEnd: '',
      commuteMin: 15,             // travel margin around fixed things away from home
      peakPeriod: '',             // '' | morning | afternoon | evening — learned or chosen
      modules: {
        shopping: true, admin: true, home: true, projects: true, routines: true,
        cycle: false, reflection: false,
      },
      notifications: 'minimal',   // off | minimal | helpful — in-app nudges only for now
      ai: { enabled: true },
      helpWith: [],
      hardThings: [],
      onboarded: false,
      onboardedAt: '',
    };
  }

  function emptyState() {
    return {
      schema: SCHEMA,
      app: 'aura',
      prefs: defaultPrefs(),
      items: [],
      events: [],
      routines: [],
      projects: [],
      people: [],
      days: {},
      log: [],
      cycle: { entries: [] },
      journal: [],
      meta: {
        createdAt: '', updatedAt: '', lastCompacted: '',
        dismissedPatterns: [], lastReviewWeek: '', importedFrom: '',
      },
    };
  }

  /* ------------------------------------------------------------ */
  /* factories                                                     */
  /* ------------------------------------------------------------ */

  const DEFAULT_MINUTES = { task: 20, shopping: 5, admin: 10, chore: 20, reminder: 5, note: 0, idea: 0 };

  function text(value, max) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max); }
  function oneOf(value, list, fallback) { return list.includes(value) ? value : fallback; }
  function dateOr(value) { return U.isDateKey(value) ? value : ''; }
  function clockOr(value) { return U.toMinutes(value) !== null ? U.toClock(U.toMinutes(value)) : ''; }

  function normRecur(r) {
    if (!r || typeof r !== 'object') return null;
    const unit = oneOf(r.unit, ['day', 'week', 'month'], 'week');
    const every = U.clamp(Math.round(Number(r.every) || 1), 1, 365);
    const weekdays = Array.isArray(r.weekdays) ? U.uniq(r.weekdays.map(Number).filter((d) => d >= 0 && d <= 6)).sort() : [];
    return { unit, every, weekdays };
  }

  function newItem(fields) {
    const f = fields || {};
    const kind = oneOf(f.kind, KINDS, 'task');
    const now = f.now || new Date().toISOString();
    const item = {
      id: f.id || U.makeId('it'),
      kind,
      title: text(f.title, 140),
      note: text(f.note, 600),
      status: oneOf(f.status, STATUSES, 'open'),
      priority: oneOf(f.priority, PRIORITIES, ''),
      date: dateOr(f.date),                 // the day it is planned for
      dueDate: dateOr(f.dueDate),           // a real deadline
      time: clockOr(f.time),                // time of day (reminders, earliest start)
      minutes: kind === 'note' || kind === 'idea' ? 0 : U.clamp(Math.round(Number(f.minutes) || DEFAULT_MINUTES[kind]), 1, 480),
      energy: oneOf(f.energy, ENERGIES, 'medium'),
      context: oneOf(f.context, CONTEXTS, 'anywhere'),
      background: !!f.background,           // runs by itself once started (laundry, dishwasher)
      recur: normRecur(f.recur),
      projectId: f.projectId || '',
      category: text(f.category, 30),
      adminStatus: kind === 'admin' ? oneOf(f.adminStatus, ADMIN_STATUSES, 'action') : '',
      waitingOn: text(f.waitingOn, 80),
      followUp: dateOr(f.followUp),
      forPerson: text(f.forPerson, 40),
      staple: !!f.staple,                   // shopping: something bought again and again
      avoidWeekdays: Array.isArray(f.avoidWeekdays) ? f.avoidWeekdays.map(Number).filter((d) => d >= 0 && d <= 6) : [],
      order: Number.isFinite(f.order) ? f.order : 0,
      postponed: Math.max(0, Number(f.postponed) || 0),
      lastPostponed: dateOr(f.lastPostponed),
      lastDone: dateOr(f.lastDone),
      source: text(f.source, 20) || 'manual',
      createdAt: now,
      updatedAt: now,
      doneAt: '',
    };
    if (item.recur && !item.dueDate && f.startDue !== false) item.dueDate = dateOr(f.date) || '';
    return item;
  }

  /* Stored compactly: fields at their default value are left out and restored on load.
   * This roughly halves the size of the items document. */
  const ITEM_KEEP = ['id', 'kind', 'title', 'status', 'createdAt', 'minutes'];
  function itemDefaults(kind) {
    return {
      note: '', status: 'open', priority: '', date: '', dueDate: '', time: '',
      minutes: DEFAULT_MINUTES[kind] != null ? DEFAULT_MINUTES[kind] : 20,
      energy: 'medium', context: 'anywhere', background: false, recur: null, projectId: '', category: '',
      adminStatus: kind === 'admin' ? 'action' : '', waitingOn: '', followUp: '', forPerson: '', staple: false,
      avoidWeekdays: [], order: 0, postponed: 0, lastPostponed: '', lastDone: '', source: 'manual', doneAt: '',
    };
  }

  function packItem(item) {
    const d = itemDefaults(item.kind);
    const out = {};
    for (const [k, v] of Object.entries(item)) {
      if (ITEM_KEEP.includes(k)) { out[k] = v; continue; }
      if (k === 'updatedAt' && v === item.createdAt) continue;
      if (Object.prototype.hasOwnProperty.call(d, k) && JSON.stringify(d[k]) === JSON.stringify(v)) continue;
      out[k] = v;
    }
    return out;
  }

  /* The field order newItem() produces; restored so stored and live items compare equal. */
  const ITEM_ORDER = ['id', 'kind', 'title', 'note', 'status', 'priority', 'date', 'dueDate', 'time', 'minutes', 'energy',
    'context', 'background', 'recur', 'projectId', 'category', 'adminStatus', 'waitingOn', 'followUp', 'forPerson', 'staple',
    'avoidWeekdays', 'order', 'postponed', 'lastPostponed', 'lastDone', 'source', 'createdAt', 'updatedAt', 'doneAt'];

  function fillItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const merged = Object.assign(itemDefaults(raw.kind), raw);
    if (!merged.updatedAt) merged.updatedAt = merged.createdAt || '';
    if (!Array.isArray(merged.avoidWeekdays)) merged.avoidWeekdays = [];
    const item = {};
    for (const k of ITEM_ORDER) if (k in merged) item[k] = merged[k];
    for (const k of Object.keys(merged)) if (!(k in item)) item[k] = merged[k];
    return item;
  }

  function newEvent(fields) {
    const f = fields || {};
    const now = f.now || new Date().toISOString();
    const recur = f.recur && Array.isArray(f.recur.weekdays) && f.recur.weekdays.length
      ? { weekdays: U.uniq(f.recur.weekdays.map(Number).filter((d) => d >= 0 && d <= 6)).sort() } : null;
    return {
      id: f.id || U.makeId('ev'),
      title: text(f.title, 120),
      date: recur ? '' : dateOr(f.date),
      start: clockOr(f.start),
      end: clockOr(f.end),
      recur,
      away: f.away !== false,           // away from home: travel margin applies
      location: text(f.location, 80),
      kind: oneOf(f.kind, ['appointment', 'work', 'activity', 'other'], 'other'),
      source: text(f.source, 20) || 'manual',
      active: f.active !== false,
      createdAt: now,
    };
  }

  function newRoutine(fields) {
    const f = fields || {};
    return {
      id: f.id || U.makeId('rt'),
      name: text(f.name, 60),
      kind: oneOf(f.kind, ROUTINE_KINDS, 'custom'),
      start: clockOr(f.start),
      end: clockOr(f.end),
      weekdays: Array.isArray(f.weekdays) ? U.uniq(f.weekdays.map(Number).filter((d) => d >= 0 && d <= 6)).sort() : [],
      dayType: oneOf(f.dayType, ['any', 'work', 'free'], 'any'),
      steps: (f.steps || []).map((s) => newStep(s)).filter((s) => s.label),
      active: f.active !== false,
      createdAt: f.now || new Date().toISOString(),
    };
  }

  function newStep(s) {
    const step = typeof s === 'string' ? { label: s } : (s || {});
    return {
      id: step.id || U.makeId('st'),
      label: text(step.label, 80),
      minutes: U.clamp(Math.round(Number(step.minutes) || 3), 1, 120),
      core: step.core !== false,        // core steps survive the short version
    };
  }

  function newProject(fields) {
    const f = fields || {};
    const now = f.now || new Date().toISOString();
    return {
      id: f.id || U.makeId('pr'),
      title: text(f.title, 80),
      outcome: text(f.outcome, 200),
      status: oneOf(f.status, ['active', 'paused', 'done'], 'active'),
      createdAt: now, updatedAt: now, doneAt: '',
    };
  }

  function newPerson(fields) {
    const f = fields || {};
    return { id: f.id || U.makeId('pe'), name: text(f.name, 40), relation: text(f.relation, 30) };
  }

  function dayDefaults() {
    return {
      pulses: [],          // [{at, energy, mood, stress, sleep, note}]
      mode: '',            // '' = automatic; or a manual mode
      focus: null,         // {itemId, startedAt}
      declined: [],        // item ids declined by "not now"/"something else" today
      quietUntil: null,    // minutes-of-day: Aura keeps the NOW card calm until then
      routineChecks: {},   // {routineId: [stepId]}
      routineSkips: {},    // {routineId: [stepId]}
      routineVariant: {},  // {routineId: 'full'|'short'} — the user's own choice wins
      planned: null,       // {picked: [itemId]} — what Aura pulled into today, for transparency
      evening: false,      // evening reset done
      chaos: null,         // {queue: [itemId], startedAt}
      intention: '',
      dismissed: [],       // nudge/suggestion keys dismissed today
    };
  }

  /** Day state with defaults filled — never mutates state. */
  function getDay(state, key) {
    const d = (state.days && state.days[key]) || {};
    const base = dayDefaults();
    return Object.assign(base, d, {
      pulses: (d.pulses || []).slice(),
      declined: (d.declined || []).slice(),
      routineChecks: Object.assign({}, d.routineChecks || {}),
      routineSkips: Object.assign({}, d.routineSkips || {}),
      routineVariant: Object.assign({}, d.routineVariant || {}),
      dismissed: (d.dismissed || []).slice(),
    });
  }

  /** Latest pulse of a day, merged so a later energy-only check-in keeps earlier mood. */
  function pulseFor(state, key) {
    const day = getDay(state, key);
    if (!day.pulses.length) return null;
    const merged = { at: '', energy: null, mood: null, stress: null, sleep: null, note: '' };
    for (const p of day.pulses) {
      for (const k of ['energy', 'mood', 'stress', 'sleep']) if (p[k] != null) merged[k] = p[k];
      if (p.note) merged.note = p.note;
      merged.at = p.at;
    }
    return merged;
  }

  /* ------------------------------------------------------------ */
  /* migration                                                     */
  /* ------------------------------------------------------------ */

  function migrate(raw) {
    const base = emptyState();
    if (!raw || typeof raw !== 'object') return base;
    if (raw.app !== 'aura' && (raw.children || raw.needs || raw.weekTemplate)) return fromMinVardag(raw);
    const s = Object.assign(base, raw);
    s.prefs = Object.assign(defaultPrefs(), raw.prefs || {});
    s.prefs.modules = Object.assign(defaultPrefs().modules, (raw.prefs && raw.prefs.modules) || {});
    s.prefs.ai = Object.assign(defaultPrefs().ai, (raw.prefs && raw.prefs.ai) || {});
    for (const key of ['items', 'events', 'routines', 'projects', 'people', 'log', 'journal']) {
      if (!Array.isArray(s[key])) s[key] = [];
    }
    s.items = s.items.map(fillItem).filter((i) => i && i.id && i.title);
    if (!s.days || typeof s.days !== 'object') s.days = {};
    if (!s.cycle || typeof s.cycle !== 'object' || !Array.isArray(s.cycle.entries)) s.cycle = { entries: [] };
    s.meta = Object.assign(emptyState().meta, raw.meta || {});
    s.schema = SCHEMA;
    s.app = 'aura';
    return s;
  }

  /**
   * Import a Min vardag export. Tasks, recurring commitments, one-off
   * commitments, routines and own-time ideas carry over. Children's open
   * needs become shopping items for that child. Nothing is invented.
   */
  function fromMinVardag(mv) {
    const s = emptyState();
    const set = mv.settings || {};
    s.prefs.language = 'sv';
    s.prefs.timeZone = 'Europe/Stockholm';
    if (U.toMinutes(set.wakeTime) !== null) s.prefs.wake = set.wakeTime;
    if (U.toMinutes(set.bedtime) !== null) s.prefs.sleep = set.bedtime;
    if (U.toMinutes(set.workStart) !== null) s.prefs.workStart = set.workStart;
    if (U.toMinutes(set.workEnd) !== null) s.prefs.workEnd = set.workEnd;
    if (Number.isFinite(set.commuteMin)) s.prefs.commuteMin = set.commuteMin;
    s.prefs.ai.enabled = set.aiOptIn !== false;
    const tpl = mv.weekTemplate || {};
    const workDays = Object.keys(tpl).filter((d) => tpl[d] && tpl[d].work === 'ja').map(Number);
    if (workDays.length) s.prefs.workDays = workDays.sort();

    const children = Array.isArray(mv.children) ? mv.children : [];
    const childName = (id) => (children.find((c) => c.id === id) || {}).name || '';
    s.people = children.map((c) => newPerson({ name: c.name, relation: 'child' }));

    const kindMap = { uppgift: 'task', inkop: 'shopping', forberedelse: 'task', egen: 'task' };
    for (const t of mv.tasks || []) {
      if (!t || !t.title) continue;
      const item = newItem({
        kind: kindMap[t.kind] || 'task', title: t.title, minutes: t.minutes,
        status: t.status === 'klar' ? 'done' : 'open',
        priority: t.mustToday ? 'must' : t.status === 'vilande' ? 'later' : '',
        date: t.scheduledDate, dueDate: t.deadline, time: t.earliest,
        energy: { latt: 'light', medel: 'medium', tung: 'heavy' }[t.load] || 'medium',
        context: { hemma: 'home', ute: 'out', butik: 'out', telefon: 'phone' }[t.context] || 'anywhere',
        forPerson: childName(t.childId), source: 'import',
      });
      if (t.kind === 'inkop') { item.kind = 'task'; item.context = 'out'; }
      if (item.status === 'done') item.doneAt = t.doneAt || new Date().toISOString();
      s.items.push(item);
    }
    for (const n of mv.needs || []) {
      if (!n || n.status === 'bekraftat' || !n.title) continue;
      s.items.push(newItem({
        kind: 'shopping', title: n.title, category: 'other', forPerson: childName(n.childId),
        note: n.note || '', source: 'import',
      }));
    }
    for (const r of mv.recurring || []) {
      if (!r || !r.title || !r.weekdays || !r.weekdays.length) continue;
      s.events.push(newEvent({
        title: r.title, start: r.start, end: r.end, recur: { weekdays: r.weekdays },
        away: r.travel !== false, kind: r.kind === 'arbete' ? 'work' : 'activity', active: r.active !== false, source: 'import',
      }));
    }
    for (const c of mv.commitments || []) {
      if (!c || !c.title || !U.isDateKey(c.date)) continue;
      s.events.push(newEvent({ title: c.title, date: c.date, start: c.start, end: c.end, source: 'import' }));
    }
    for (const r of mv.routines || []) {
      if (!r || !r.name) continue;
      s.routines.push(newRoutine({
        name: r.name, kind: r.when === 'kvall' ? 'evening' : 'morning',
        start: r.when === 'kvall' ? '19:30' : s.prefs.wake, end: r.when === 'kvall' ? '21:30' : '',
        weekdays: r.weekdays || [], steps: (r.items || []).map((i) => i.label),
      }));
    }
    for (const p of mv.packLists || []) {
      if (!p || !p.name) continue;
      const who = childName(p.childId);
      s.routines.push(newRoutine({
        name: who ? `${p.name} (${who})` : p.name, kind: 'leaving',
        steps: (p.items || []).map((i) => i.label),
      }));
    }
    s.meta.importedFrom = 'min-vardag';
    return s;
  }

  /* ------------------------------------------------------------ */
  /* small shared queries                                          */
  /* ------------------------------------------------------------ */

  function itemById(state, id) { return state.items.find((i) => i.id === id) || null; }
  function eventById(state, id) { return state.events.find((e) => e.id === id) || null; }
  function routineById(state, id) { return state.routines.find((r) => r.id === id) || null; }
  function projectById(state, id) { return state.projects.find((p) => p.id === id) || null; }

  function isOpen(item) { return item.status === 'open'; }

  function isWorkday(state, key) {
    const p = state.prefs;
    return (p.workDays || []).includes(U.weekday(key));
  }

  function hasWorkHours(state) {
    const p = state.prefs;
    return U.toMinutes(p.workStart) !== null && U.toMinutes(p.workEnd) !== null && U.toMinutes(p.workEnd) > U.toMinutes(p.workStart);
  }

  function moduleOn(state, name) { return !!(state.prefs.modules && state.prefs.modules[name]); }

  /** How many things a day should hold, by the user's chosen density. */
  function densityCaps(state) {
    return {
      light: { must: 2, good: 2 },
      balanced: { must: 3, good: 4 },
      full: { must: 5, good: 6 },
    }[state.prefs.density] || { must: 3, good: 4 };
  }

  A.model = {
    SCHEMA, KINDS, STATUSES, PRIORITIES, ENERGIES, CONTEXTS, ADMIN_STATUSES, MODES, MANUAL_MODES,
    MODULES, SHOP_CATEGORIES, ADMIN_CATEGORIES, ROUTINE_KINDS, DEFAULT_MINUTES,
    defaultPrefs, emptyState, newItem, newEvent, newRoutine, newStep, newProject, newPerson,
    dayDefaults, getDay, pulseFor, migrate, fromMinVardag,
    itemById, eventById, routineById, projectById, isOpen, isWorkday, hasWorkHours, moduleOn, densityCaps,
    normRecur, itemDefaults, packItem, fillItem,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
