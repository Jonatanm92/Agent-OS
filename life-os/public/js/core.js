// Life OS core — pure, DOM-free logic shared by the browser app and the Node tests.
// Everything here takes plain data in and returns plain data out, so it can be
// verified deterministically with `node --test`.

export const SCHEMA_VERSION = 1;
export const LOCALE = 'sv-SE';

export const AREAS = [
  { id: 'family', name: 'Familj', icon: '👨‍👧', hint: 'Något för familjen' },
  { id: 'money', name: 'Pengar', icon: '💰', hint: 'Något som drar in pengar' },
  { id: 'self', name: 'Jag', icon: '🌱', hint: 'Något för dig själv' },
];

export const DEFAULT_STREAMS = [
  { id: 'bidsprint', name: 'BidSprint 48' },
  { id: 'forge', name: 'ForgeHQ – fixar' },
  { id: 'wp', name: 'WordPress-produkter' },
  { id: 'job', name: 'Lön / jobb' },
  { id: 'other', name: 'Övrigt' },
];

export const SUGGESTED_HABITS = [
  { id: 'training', name: 'Träning', icon: '🏃', preselect: true },
  { id: 'walk', name: 'Promenad ute', icon: '🚶', preselect: true },
  { id: 'nophone', name: 'Ingen mobil första timmen', icon: '📵', preselect: true },
  { id: 'sleep', name: 'I säng före 23', icon: '😴', preselect: true },
  { id: 'guitar', name: 'Gitarr 20 min', icon: '🎸', preselect: true },
  { id: 'water', name: '2 liter vatten', icon: '💧', preselect: false },
  { id: 'read', name: 'Läsa 10 min', icon: '📖', preselect: false },
  { id: 'breathe', name: 'Andning 5 min', icon: '🧘', preselect: false },
  { id: 'veggies', name: 'Grönt till varje måltid', icon: '🥗', preselect: false },
  { id: 'sober', name: 'Alkoholfri dag', icon: '🚫', preselect: false },
  { id: 'journal', name: 'Skriva 5 min', icon: '✍️', preselect: false },
];

export const STAGES = [
  { id: 'lead', name: 'Lead', probability: 0.1, open: true },
  { id: 'contact', name: 'Kontakt', probability: 0.25, open: true },
  { id: 'offer', name: 'Offert', probability: 0.5, open: true },
  { id: 'won', name: 'Vunnen', probability: 0.9, open: true },
  { id: 'paid', name: 'Betald', probability: 1, open: false },
  { id: 'lost', name: 'Förlorad', probability: 0, open: false },
];

export const FOCUS_WINDOWS = {
  morning: { start: '08:30', end: '10:00', name: 'Morgon' },
  afternoon: { start: '13:00', end: '14:30', name: 'Eftermiddag' },
  evening: { start: '20:30', end: '21:30', name: 'Kväll (när barnen sover)' },
};

// ── Small utilities ───────────────────────────────────────────────────────────

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const pad = (n) => String(n).padStart(2, '0');

export function num(value, fallback = 0) {
  const n = typeof value === 'string' ? Number(value.replace(/\s/g, '').replace(',', '.')) : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function uid(prefix = '') {
  const c = globalThis.crypto;
  const raw = c && typeof c.randomUUID === 'function'
    ? c.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return prefix ? `${prefix}_${raw}` : raw;
}

// FNV-1a: a stable, dependency-free hash so "today's pick" is the same on every device.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function sum(values) {
  return values.reduce((a, b) => a + (Number(b) || 0), 0);
}

function avg(values) {
  const list = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  return list.length ? sum(list) / list.length : null;
}

// ── Dates (local calendar days as YYYY-MM-DD keys) ───────────────────────────

export function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

// Noon avoids DST edge cases where local midnight does not exist.
export function fromKey(key) {
  const p = parseKey(key);
  if (!p) throw new Error(`invalid date key: ${key}`);
  return new Date(p.y, p.m - 1, p.d, 12, 0, 0, 0);
}

export function todayKey(now = new Date()) {
  return toKey(now);
}

export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function diffDays(fromK, toK) {
  return Math.round((fromKey(toK) - fromKey(fromK)) / 86_400_000);
}

export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function monthKey(key) {
  return String(key).slice(0, 7);
}

export function isoWeek(key) {
  const d = fromKey(key);
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86_400_000 + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}

export function weekKey(key) {
  const { year, week } = isoWeek(key);
  return `${year}-W${pad(week)}`;
}

export function weekStartKey(key) {
  const dow = (fromKey(key).getDay() + 6) % 7;
  return addDays(key, -dow);
}

export function weekDays(wk) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(wk || ''));
  if (!m) throw new Error(`invalid week key: ${wk}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = `${year}-01-04`;
  const monday = addDays(weekStartKey(jan4), (week - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function shiftWeek(wk, n) {
  return weekKey(addDays(weekDays(wk)[0], n * 7));
}

export function weekNumber(wk) {
  return Number(String(wk).slice(-2));
}

const fmtCache = new Map();
function fmt(options) {
  const k = JSON.stringify(options);
  if (!fmtCache.has(k)) fmtCache.set(k, new Intl.DateTimeFormat(LOCALE, options));
  return fmtCache.get(k);
}

export function formatDateLong(key) {
  return fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(fromKey(key));
}

export function formatDateShort(key) {
  return fmt({ day: 'numeric', month: 'short' }).format(fromKey(key)).replace('.', '');
}

export function formatWeekday(key) {
  return fmt({ weekday: 'short' }).format(fromKey(key)).replace('.', '');
}

export function formatMonth(mk) {
  const [y, m] = mk.split('-').map(Number);
  return fmt({ month: 'long' }).format(new Date(y, m - 1, 15));
}

export function formatMonthShort(mk) {
  const [y, m] = mk.split('-').map(Number);
  return fmt({ month: 'short' }).format(new Date(y, m - 1, 15)).replace('.', '');
}

export function greeting(hour) {
  if (hour >= 5 && hour < 10) return 'God morgon';
  if (hour >= 10 && hour < 17) return 'Hej';
  if (hour >= 17 && hour < 23) return 'God kväll';
  return 'God natt';
}

export function minutesOfDay(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// ── Number formatting ────────────────────────────────────────────────────────

const sekFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const decFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export function formatSek(n) {
  return `${sekFormat.format(Math.round(num(n)))} kr`;
}

export function formatNumber(n) {
  return sekFormat.format(Math.round(num(n)));
}

export function formatDecimal(n) {
  return decFormat.format(num(n));
}

export function formatMinutes(total) {
  const m = Math.max(0, Math.round(num(total)));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export function formatClock(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// ── Kids & ages ──────────────────────────────────────────────────────────────

export function ageParts(birthdate, onKey) {
  const b = parseKey(birthdate);
  const t = parseKey(onKey);
  if (!b || !t || birthdate > onKey) return null;
  let years = t.y - b.y;
  let months = t.m - b.m;
  let days = t.d - b.d;
  if (days < 0) {
    months -= 1;
    const prevMonth = t.m === 1 ? 12 : t.m - 1;
    const prevYear = t.m === 1 ? t.y - 1 : t.y;
    days += daysInMonth(prevYear, prevMonth);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days, totalMonths: years * 12 + months, totalDays: diffDays(birthdate, onKey) };
}

export function formatAge(parts) {
  if (!parts) return '';
  if (parts.years >= 6) return `${parts.years} år`;
  if (parts.years >= 1) return parts.months ? `${parts.years} år ${parts.months} mån` : `${parts.years} år`;
  if (parts.totalMonths >= 1) return `${parts.totalMonths} mån`;
  const weeks = Math.floor(parts.totalDays / 7);
  if (weeks >= 1) return `${weeks} v`;
  return parts.totalDays === 0 ? 'nyfödd' : `${parts.totalDays} dagar`;
}

export function kidAges(kids, onKey) {
  return kids
    .map((k) => ageParts(k.birthdate, onKey))
    .filter(Boolean)
    .map((p) => p.years);
}

export function ageBand(years) {
  if (years <= 2) return 'small';
  if (years <= 6) return 'small';
  if (years <= 12) return 'mid';
  return 'teen';
}

export function daysUntilBirthday(birthdate, onKey) {
  const b = parseKey(birthdate);
  const t = parseKey(onKey);
  if (!b || !t) return null;
  const safeDay = (y) => Math.min(b.d, daysInMonth(y, b.m));
  let next = `${t.y}-${pad(b.m)}-${pad(safeDay(t.y))}`;
  if (next < onKey) next = `${t.y + 1}-${pad(b.m)}-${pad(safeDay(t.y + 1))}`;
  return diffDays(onKey, next);
}

// ── State shape ──────────────────────────────────────────────────────────────

export function emptyPriorities() {
  return Object.fromEntries(AREAS.map((a) => [a.id, { text: '', done: false }]));
}

export function emptyDay() {
  return {
    checkin: null,
    priorities: emptyPriorities(),
    mission: { offset: 0, done: false },
    money: { offset: 0, done: false },
    habits: {},
    dadMinutes: {},
    reflection: null,
    seeded: false,
  };
}

export function createDefaultState(nowIso = new Date().toISOString()) {
  return {
    schema: SCHEMA_VERSION,
    createdAt: nowIso,
    updatedAt: nowIso,
    profile: { name: '', onboarded: false },
    kids: [],
    settings: {
      theme: 'system',
      monthlyIncomeGoal: 0,
      monthlyCosts: 0,
      dadGoalPerKid: 180,
      streams: DEFAULT_STREAMS.map((s) => ({ ...s })),
      includePartner: true,
      focusWindow: 'morning',
      familyStart: '16:30',
      familyEnd: '19:30',
      reminders: { morning: '07:00', evening: '21:00', weekly: '19:00' },
      coach: { mode: 'offline', agentOsUrl: '', agentOsToken: '', agentId: 'free-claude-code', shareNames: false },
      serverToken: '',
      lastBackupAt: null,
    },
    habits: [],
    days: {},
    memories: [],
    income: [],
    hours: [],
    deals: [],
    savings: [],
    focus: [],
    weeks: {},
    timer: null,
    coachLog: [],
  };
}

function normalizeDay(input) {
  const base = emptyDay();
  if (!isObj(input)) return base;
  const day = { ...base, ...input };
  day.priorities = emptyPriorities();
  for (const a of AREAS) {
    const p = isObj(input.priorities) ? input.priorities[a.id] : null;
    if (isObj(p)) day.priorities[a.id] = { text: String(p.text || ''), done: Boolean(p.done) };
  }
  day.mission = { ...base.mission, ...(isObj(input.mission) ? input.mission : {}) };
  day.money = { ...base.money, ...(isObj(input.money) ? input.money : {}) };
  day.habits = isObj(input.habits) ? input.habits : {};
  day.dadMinutes = isObj(input.dadMinutes) ? input.dadMinutes : {};
  day.checkin = isObj(input.checkin) ? input.checkin : null;
  day.reflection = isObj(input.reflection) ? input.reflection : null;
  return day;
}

const COLLECTIONS = ['kids', 'habits', 'memories', 'income', 'hours', 'deals', 'savings', 'focus', 'coachLog'];

export function normalizeState(input, nowIso = new Date().toISOString()) {
  const base = createDefaultState(nowIso);
  if (!isObj(input)) return base;
  const settingsIn = isObj(input.settings) ? input.settings : {};
  const s = { ...base, ...input, schema: SCHEMA_VERSION };
  s.profile = { ...base.profile, ...(isObj(input.profile) ? input.profile : {}) };
  s.settings = {
    ...base.settings,
    ...settingsIn,
    coach: { ...base.settings.coach, ...(isObj(settingsIn.coach) ? settingsIn.coach : {}) },
    reminders: { ...base.settings.reminders, ...(isObj(settingsIn.reminders) ? settingsIn.reminders : {}) },
  };
  const streams = Array.isArray(settingsIn.streams) ? settingsIn.streams.filter((x) => isObj(x) && x.id && x.name) : [];
  s.settings.streams = streams.length ? streams : base.settings.streams;
  s.settings.monthlyIncomeGoal = Math.max(0, num(s.settings.monthlyIncomeGoal));
  s.settings.monthlyCosts = Math.max(0, num(s.settings.monthlyCosts));
  s.settings.dadGoalPerKid = Math.max(0, num(s.settings.dadGoalPerKid, 180));
  if (!FOCUS_WINDOWS[s.settings.focusWindow]) s.settings.focusWindow = 'morning';
  for (const key of COLLECTIONS) s[key] = Array.isArray(input[key]) ? input[key].filter(isObj) : [];
  s.days = {};
  if (isObj(input.days)) {
    for (const [key, day] of Object.entries(input.days)) {
      if (parseKey(key)) s.days[key] = normalizeDay(day);
    }
  }
  s.weeks = isObj(input.weeks) ? input.weeks : {};
  s.timer = isObj(input.timer) && Number.isFinite(input.timer.startedAt) ? input.timer : null;
  return s;
}

export function getDay(state, key) {
  return state.days[key] || null;
}

// Creates the day on first touch. If yesterday's evening reflection named
// "tomorrow's most important thing", it is carried into today's matching slot.
export function ensureDay(state, key) {
  if (!state.days[key]) {
    const day = emptyDay();
    const prev = state.days[addDays(key, -1)];
    const carry = prev && prev.reflection && String(prev.reflection.tomorrow || '').trim();
    if (carry) {
      const area = AREAS.some((a) => a.id === prev.reflection.tomorrowArea) ? prev.reflection.tomorrowArea : 'money';
      day.priorities[area] = { text: carry, done: false };
      day.seeded = true;
    }
    state.days[key] = day;
  }
  return state.days[key];
}

export function activeHabits(state) {
  return state.habits.filter((h) => !h.archived);
}

// ── Daily picks (deterministic per date, with a "swap" offset) ───────────────

export function pickDaily(list, key, salt = '', offset = 0) {
  if (!list.length) return null;
  const idx = (hashString(`${salt}:${key}`) + Math.max(0, Math.floor(offset))) % list.length;
  return list[idx];
}

function anyKidInRange(ages, min, max) {
  return ages.some((a) => a >= min && a <= max);
}

export function eligibleMissions(missions, state, key) {
  const ages = kidAges(state.kids, key);
  return missions.filter((m) => {
    if (m.cat === 'partner' && !state.settings.includePartner) return false;
    if (!ages.length) return m.minAge === 0 && m.maxAge >= 18;
    return anyKidInRange(ages, m.minAge, m.maxAge);
  });
}

export function dailyMission(missions, state, key) {
  const day = getDay(state, key);
  return pickDaily(eligibleMissions(missions, state, key), key, 'mission', day ? day.mission.offset : 0);
}

export function eligibleMoneyActions(actions, state) {
  const streamIds = new Set(state.settings.streams.map((s) => s.id));
  return actions.filter((a) => !a.stream || streamIds.has(a.stream));
}

export function dailyMoneyAction(actions, state, key) {
  const day = getDay(state, key);
  return pickDaily(eligibleMoneyActions(actions, state), key, 'money', day ? day.money.offset : 0);
}

export function starterFor(starters, state, key, offset = 0) {
  const ages = kidAges(state.kids, key);
  const bands = new Set(ages.length ? ages.map(ageBand) : ['mid']);
  const pool = starters.filter((s) => bands.has(s.band));
  return pickDaily(pool, key, 'starter', offset);
}

export function activityFits(activity, ages, key) {
  if (activity.months && !activity.months.includes(parseKey(key).m)) return false;
  if (!ages.length) return true;
  return anyKidInRange(ages, activity.minAge, activity.maxAge);
}

export function suitableActivities(activities, state, key, filters = {}) {
  const ages = kidAges(state.kids, key);
  return activities.filter((a) => {
    if (!activityFits(a, ages, key)) return false;
    if (filters.place && filters.place !== 'all' && a.place !== filters.place && a.place !== 'both') return false;
    if (filters.maxMinutes && a.minutes > filters.maxMinutes) return false;
    if (filters.minMinutes && a.minutes < filters.minMinutes) return false;
    if (filters.free && a.cost > 0) return false;
    return true;
  });
}

// ── Scores & streaks ─────────────────────────────────────────────────────────

export function dayScore(day, habitIds = []) {
  const d = day || emptyDay();
  const prioritiesDone = AREAS.filter((a) => d.priorities[a.id] && d.priorities[a.id].text.trim() && d.priorities[a.id].done).length;
  const habitsDone = habitIds.filter((id) => d.habits[id]).length;
  const parts = [
    { key: 'checkin', label: 'Check-in', earned: d.checkin ? 15 : 0, max: 15 },
    { key: 'priorities', label: 'Dagens tre', earned: prioritiesDone * 10, max: 30 },
    { key: 'mission', label: 'Pappa-uppdrag', earned: d.mission.done ? 15 : 0, max: 15 },
    { key: 'money', label: 'Pengasteg', earned: d.money.done ? 15 : 0, max: 15 },
    { key: 'habits', label: 'Vanor', earned: habitIds.length ? Math.round((15 * habitsDone) / habitIds.length) : 0, max: habitIds.length ? 15 : 0 },
    { key: 'reflection', label: 'Kvällsreflektion', earned: d.reflection ? 10 : 0, max: 10 },
  ];
  const max = sum(parts.map((p) => p.max));
  const earned = sum(parts.map((p) => p.earned));
  return { score: max ? Math.round((earned / max) * 100) : 0, parts, prioritiesDone, habitsDone };
}

// Counts consecutive days satisfying `pred`. Today counts if done; if today is
// not done yet the streak is still alive from yesterday.
export function streak(state, key, pred) {
  let cur = key;
  if (!pred(getDay(state, cur), cur)) cur = addDays(cur, -1);
  let count = 0;
  while (count < 3650 && pred(getDay(state, cur), cur)) {
    count += 1;
    cur = addDays(cur, -1);
  }
  return count;
}

export const PREDICATES = {
  checkin: (day) => Boolean(day && day.checkin),
  mission: (day) => Boolean(day && day.mission.done),
  money: (day) => Boolean(day && day.money.done),
  reflection: (day) => Boolean(day && day.reflection),
  habit: (id) => (day) => Boolean(day && day.habits[id]),
};

// ── Time ─────────────────────────────────────────────────────────────────────

export function focusMinutesOn(state, key) {
  return sum(state.focus.filter((f) => f.date === key).map((f) => f.minutes));
}

export function dadMinutesOn(state, key) {
  const day = getDay(state, key);
  const byKid = {};
  let total = 0;
  if (day) {
    for (const [kidId, minutes] of Object.entries(day.dadMinutes)) {
      const m = Math.max(0, num(minutes));
      byKid[kidId] = m;
      total += m;
    }
  }
  return { total, byKid };
}

export function timerElapsedMs(timer, nowMs) {
  if (!timer) return 0;
  const end = timer.pausedAt || nowMs;
  return Math.max(0, end - timer.startedAt - (timer.pausedMs || 0));
}

export function timerRemainingMs(timer, nowMs) {
  if (!timer || !timer.durationMin) return null;
  return Math.max(0, timer.durationMin * 60_000 - timerElapsedMs(timer, nowMs));
}

// ── Money ────────────────────────────────────────────────────────────────────

export function streamName(state, id) {
  const s = state.settings.streams.find((x) => x.id === id);
  return s ? s.name : 'Övrigt';
}

export function incomeInRange(state, fromK, toK) {
  return sum(state.income.filter((i) => i.date >= fromK && i.date <= toK).map((i) => i.amount));
}

export function incomeForMonth(state, mk) {
  return sum(state.income.filter((i) => monthKey(i.date) === mk).map((i) => i.amount));
}

export function streamStats(state, mk) {
  return state.settings.streams
    .map((s) => {
      const income = sum(state.income.filter((i) => i.streamId === s.id && monthKey(i.date) === mk).map((i) => i.amount));
      const hours = sum(state.hours.filter((h) => h.streamId === s.id && monthKey(h.date) === mk).map((h) => h.hours));
      return { id: s.id, name: s.name, income, hours, rate: hours > 0 ? income / hours : null };
    })
    .filter((s) => s.income > 0 || s.hours > 0);
}

export function moneyForecast(goal, earned, key) {
  const p = parseKey(key);
  const dim = daysInMonth(p.y, p.m);
  const pace = p.d ? (earned / p.d) * dim : earned;
  const remaining = Math.max(0, goal - earned);
  const daysLeft = dim - p.d + 1;
  const perDay = daysLeft ? remaining / daysLeft : remaining;
  return {
    goal,
    earned,
    pct: goal > 0 ? clamp(earned / goal, 0, 1) : 0,
    pace,
    remaining,
    daysLeft,
    perDay,
    perWeek: perDay * 7,
    onTrack: goal > 0 ? pace >= goal : true,
    reached: goal > 0 && earned >= goal,
  };
}

export function stageById(id) {
  return STAGES.find((s) => s.id === id) || STAGES[0];
}

export function pipelineSummary(deals, key) {
  const stages = STAGES.map((st) => {
    const list = deals.filter((d) => d.stage === st.id);
    return { id: st.id, name: st.name, count: list.length, value: sum(list.map((d) => d.value)) };
  });
  const open = deals.filter((d) => stageById(d.stage).open);
  const byNext = (a, b) => String(a.nextDate || '9999').localeCompare(String(b.nextDate || '9999'));
  return {
    stages,
    openCount: open.length,
    openValue: sum(open.map((d) => d.value)),
    weighted: sum(open.map((d) => num(d.value) * stageById(d.stage).probability)),
    overdue: open.filter((d) => d.nextDate && d.nextDate < key).sort(byNext),
    dueToday: open.filter((d) => d.nextDate === key),
    open: open.slice().sort(byNext),
  };
}

export function nextStage(id, dir) {
  const flow = ['lead', 'contact', 'offer', 'won', 'paid'];
  const i = flow.indexOf(id);
  if (i === -1) return dir > 0 ? 'lead' : id;
  return flow[clamp(i + dir, 0, flow.length - 1)];
}

export function monthlyIncomeSeries(state, key, months = 6) {
  const p = parseKey(key);
  const out = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(p.y, p.m - 1 - i, 15);
    const mk = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    out.push({ month: mk, label: formatMonthShort(mk), value: incomeForMonth(state, mk) });
  }
  return out;
}

export function savingsTotals(savings) {
  const saved = sum(savings.map((s) => s.saved));
  const target = sum(savings.map((s) => s.target));
  return { saved, target, pct: target > 0 ? clamp(saved / target, 0, 1) : 0 };
}

export function bufferMonths(saved, monthlyCosts) {
  return monthlyCosts > 0 ? saved / monthlyCosts : null;
}

// ── Week summary & insights ──────────────────────────────────────────────────

export function weekSummary(state, wk, today) {
  const keys = weekDays(wk);
  const habits = activeHabits(state);
  const habitIds = habits.map((h) => h.id);
  // Days before you started using Life OS are not counted as misses.
  const firstKey = Object.keys(state.days).sort()[0] || today;
  const elapsed = keys.filter((k) => k <= today && k >= firstKey);
  const days = keys.map((key) => {
    const day = getDay(state, key);
    const dad = dadMinutesOn(state, key);
    return {
      key,
      label: formatWeekday(key),
      future: key > today,
      score: day ? dayScore(day, habitIds).score : 0,
      energy: day && day.checkin ? day.checkin.energy : null,
      mood: day && day.checkin ? day.checkin.mood : null,
      sleep: day && day.checkin ? day.checkin.sleep : null,
      focus: focusMinutesOn(state, key),
      dad: dad.total,
      checkin: Boolean(day && day.checkin),
      reflection: Boolean(day && day.reflection),
    };
  });
  const dadByKid = Object.fromEntries(state.kids.map((k) => [k.id, 0]));
  for (const key of keys) {
    for (const [kidId, m] of Object.entries(dadMinutesOn(state, key).byKid)) dadByKid[kidId] = (dadByKid[kidId] || 0) + m;
  }
  const dayObjs = keys.map((k) => getDay(state, k)).filter(Boolean);
  const habitStats = habits.map((h) => ({
    id: h.id,
    name: h.name,
    icon: h.icon,
    done: elapsed.filter((k) => getDay(state, k) && getDay(state, k).habits[h.id]).length,
    of: elapsed.length,
    days: keys.map((k) => Boolean(getDay(state, k) && getDay(state, k).habits[h.id])),
  }));
  const habitDone = sum(habitStats.map((h) => h.done));
  const habitOf = sum(habitStats.map((h) => h.of));
  const scored = days.filter((d) => !d.future);
  return {
    weekKey: wk,
    keys,
    elapsedDays: elapsed.length,
    days,
    focusMinutes: sum(days.map((d) => d.focus)),
    dadMinutes: sum(days.map((d) => d.dad)),
    dadByKid,
    income: incomeInRange(state, keys[0], keys[6]),
    checkinDays: days.filter((d) => d.checkin).length,
    reflectionDays: days.filter((d) => d.reflection).length,
    missionsDone: dayObjs.filter((d) => d.mission.done).length,
    moneyDone: dayObjs.filter((d) => d.money.done).length,
    prioritiesDone: sum(dayObjs.map((d) => AREAS.filter((a) => d.priorities[a.id].text.trim() && d.priorities[a.id].done).length)),
    prioritiesSet: sum(dayObjs.map((d) => AREAS.filter((a) => d.priorities[a.id].text.trim()).length)),
    habitStats,
    habitRate: habitOf ? habitDone / habitOf : null,
    avgEnergy: avg(days.map((d) => d.energy)),
    avgMood: avg(days.map((d) => d.mood)),
    avgSleep: avg(days.map((d) => d.sleep)),
    avgScore: scored.length ? Math.round(sum(scored.map((d) => d.score)) / scored.length) : 0,
    wins: keys
      .map((k) => ({ key: k, text: getDay(state, k) && getDay(state, k).reflection ? String(getDay(state, k).reflection.wins || '').trim() : '' }))
      .filter((w) => w.text),
    memories: state.memories.filter((m) => m.date >= keys[0] && m.date <= keys[6]),
  };
}

export function weeklyInsights(summary, prev, state) {
  const out = [];
  const kidName = (id) => (state.kids.find((k) => k.id === id) || {}).name || 'Ett barn';
  const enough = summary.elapsedDays >= 3;

  if (summary.checkinDays === 0 && summary.elapsedDays >= 2) {
    out.push({ tone: 'tip', text: 'Börja med morgon-check-in – 30 sekunder som gör hela veckan synlig.' });
  }

  const pairs = summary.days.filter((d) => d.sleep != null && d.energy != null);
  const good = pairs.filter((d) => d.sleep >= 4).map((d) => d.energy);
  const poor = pairs.filter((d) => d.sleep <= 2).map((d) => d.energy);
  if (good.length && poor.length && avg(good) - avg(poor) >= 1) {
    out.push({ tone: 'good', text: `Sömn är din superkraft: energi ${formatDecimal(avg(good))} efter bra nätter mot ${formatDecimal(avg(poor))} efter dåliga.` });
  } else if (pairs.length >= 3 && summary.avgSleep < 3) {
    out.push({ tone: 'tip', text: `Sömnen har varit låg (snitt ${formatDecimal(summary.avgSleep)}/5). Testa läggdags 30 minuter tidigare tre kvällar i rad.` });
  }

  if (prev && prev.dadMinutes > 0) {
    const change = summary.dadMinutes - prev.dadMinutes;
    if (change >= prev.dadMinutes * 0.15 && change >= 20) {
      out.push({ tone: 'good', text: `Pappatiden ökade med ${formatMinutes(change)} jämfört med förra veckan. 💛` });
    }
  }
  const kidTotals = Object.entries(summary.dadByKid);
  if (kidTotals.length >= 2) {
    const sorted = kidTotals.slice().sort((a, b) => a[1] - b[1]);
    const [minId, minVal] = sorted[0];
    const [maxId, maxVal] = sorted[sorted.length - 1];
    if (maxVal >= 60 && minVal < maxVal * 0.5) {
      out.push({ tone: 'tip', text: `${kidName(minId)} fick mindre egen tid (${formatMinutes(minVal)}) än ${kidName(maxId)} (${formatMinutes(maxVal)}). Planera en 1:1-stund.` });
    }
  }
  if (summary.dadMinutes === 0 && enough && state.kids.length) {
    out.push({ tone: 'tip', text: 'Ingen pappatid loggad än. Starta närvaroläget nästa gång ni ses – mobilen bort, timern på.' });
  }

  if (summary.focusMinutes >= 300) {
    out.push({ tone: 'good', text: `${formatMinutes(summary.focusMinutes)} fokuserat arbete. Det är så pengar och projekt flyttar sig.` });
  } else if (summary.focusMinutes === 0 && enough) {
    out.push({ tone: 'tip', text: 'Inga fokuspass ännu. Boka två 50-minuterspass där du gör veckans viktigaste pengasteg.' });
  }

  const goal = state.settings.monthlyIncomeGoal;
  if (goal > 0) {
    const p = parseKey(summary.keys[0]);
    const weekTarget = (goal * 7) / daysInMonth(p.y, p.m);
    if (summary.income >= weekTarget) {
      out.push({ tone: 'good', text: `Över veckans pengamål: ${formatSek(summary.income)} av ${formatSek(weekTarget)}.` });
    } else if (summary.moneyDone >= 4) {
      out.push({ tone: 'good', text: `Pengasteg ${summary.moneyDone} dagar. Intäkter släpar ofta efter aktivitet – fortsätt.` });
    } else if (enough) {
      out.push({ tone: 'tip', text: `Pengasteg ${summary.moneyDone} av ${summary.elapsedDays} dagar. Små steg varje dag slår stora ryck.` });
    }
  }

  const rated = summary.habitStats.filter((h) => h.of > 0);
  if (rated.length) {
    const best = rated.reduce((a, b) => (b.done / b.of > a.done / a.of ? b : a));
    const worst = rated.reduce((a, b) => (b.done / b.of < a.done / a.of ? b : a));
    if (best.done / best.of >= 0.8 && best.of >= 3) {
      out.push({ tone: 'good', text: `${best.icon} ${best.name} sitter som en smäck (${best.done}/${best.of}).` });
    }
    if (worst !== best && worst.done / worst.of < 0.4 && worst.of >= 3) {
      out.push({ tone: 'tip', text: `${worst.icon} ${worst.name} har varit svår (${worst.done}/${worst.of}). Gör den mindre – två minuter räknas.` });
    }
  }

  const moods = summary.days.filter((d) => d.mood != null);
  if (moods.length >= 3 && summary.avgMood < 2.5) {
    out.push({ tone: 'care', text: 'Humöret har varit lågt den här veckan. Prata med någon du litar på – och om det håller i sig, kontakta vårdcentralen eller 1177.' });
  }

  return out;
}

// ── Exports: calendar reminders & Markdown (Obsidian) ────────────────────────

function icsEscape(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// RFC 5545 line folding: max 75 octets per line, continuation lines start with a space.
export function icsFold(line) {
  const enc = new TextEncoder();
  const out = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const len = enc.encode(ch).length;
    if (bytes + len > 73) {
      out.push(current);
      current = ' ';
      bytes = 1;
    }
    current += ch;
    bytes += len;
  }
  out.push(current);
  return out.join('\r\n');
}

function icsLocal(key, hhmm) {
  return `${key.replace(/-/g, '')}T${hhmm.replace(':', '')}00`;
}

function icsUtcStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildReminderIcs({ reminders, appUrl = '', now = new Date() }) {
  const today = toKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const firstDaily = (hhmm) => ((minutesOfDay(hhmm) ?? 0) > nowMin ? today : addDays(today, 1));
  const dow = fromKey(today).getDay();
  let sunday = addDays(today, (7 - dow) % 7);
  if (sunday === today && (minutesOfDay(reminders.weekly) ?? 0) <= nowMin) sunday = addDays(today, 7);
  const link = appUrl ? ` Öppna Life OS: ${appUrl}` : '';
  const events = [
    { id: 'morning', time: reminders.morning, start: firstDaily(reminders.morning), rule: 'FREQ=DAILY', title: '☀️ Life OS: Morgon-check-in', text: `Sömn, energi och dagens tre (familj, pengar, jag).${link}` },
    { id: 'evening', time: reminders.evening, start: firstDaily(reminders.evening), rule: 'FREQ=DAILY', title: '🌙 Life OS: Kvällsreflektion', text: `Dagens vinst, tacksamhet och ett minne med barnen.${link}` },
    { id: 'weekly', time: reminders.weekly, start: sunday, rule: 'FREQ=WEEKLY;BYDAY=SU', title: '🗓️ Life OS: Veckogenomgång', text: `Titta på veckan och planera nästa: fokus, familj och pengar.${link}` },
  ].filter((e) => minutesOfDay(e.time) != null);
  const stamp = icsUtcStamp(now);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Life OS//Agent OS//SV', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:life-os-${e.id}-${stamp}@life-os.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsLocal(e.start, e.time)}`,
      'DURATION:PT10M',
      `RRULE:${e.rule}`,
      `SUMMARY:${icsEscape(e.title)}`,
      `DESCRIPTION:${icsEscape(e.text)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(e.title)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(icsFold).join('\r\n')}\r\n`;
}

const MEMORY_KINDS = { moment: 'Stund', quote: 'Citat', milestone: 'Milstolpe' };

export function memoriesToMarkdown(state, now = new Date()) {
  const lines = ['# Minnesbank – Life OS', '', `Exporterad ${toKey(now)}`, ''];
  const groups = [...state.kids.map((k) => ({ id: k.id, title: k.birthdate ? `${k.name} (f. ${k.birthdate})` : k.name })), { id: '', title: 'Hela familjen' }];
  for (const g of groups) {
    const list = state.memories.filter((m) => (m.kidId || '') === g.id).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (!list.length) continue;
    lines.push(`## ${g.title}`, '');
    for (const m of list) {
      const text = m.kind === 'quote' ? `”${m.text}”` : m.text;
      lines.push(`- **${m.date}** · ${MEMORY_KINDS[m.kind] || 'Stund'}: ${String(text).replace(/\n+/g, ' ')}`);
    }
    lines.push('');
  }
  if (!state.memories.length) lines.push('_Inga minnen sparade ännu._', '');
  return lines.join('\n');
}

export function weekToMarkdown(summary, review, state) {
  const { year, week } = { year: summary.weekKey.slice(0, 4), week: weekNumber(summary.weekKey) };
  const kidParts = state.kids.map((k) => `${k.name} ${formatMinutes(summary.dadByKid[k.id] || 0)}`).join(', ');
  const lines = [
    `# Vecka ${week} · ${year}`,
    '',
    `_${summary.keys[0]} – ${summary.keys[6]} · från Life OS_`,
    '',
    '## Siffror',
    '',
    `- Snittpoäng: ${summary.avgScore}/100`,
    `- Fokus: ${formatMinutes(summary.focusMinutes)}`,
    `- Pappatid: ${formatMinutes(summary.dadMinutes)}${kidParts ? ` (${kidParts})` : ''}`,
    `- Inkomst: ${formatSek(summary.income)}`,
    `- Pengasteg: ${summary.moneyDone} dagar · Pappa-uppdrag: ${summary.missionsDone} dagar`,
    `- Vanor: ${summary.habitRate == null ? '–' : `${Math.round(summary.habitRate * 100)} %`}`,
    `- Energi/humör/sömn (snitt): ${[summary.avgEnergy, summary.avgMood, summary.avgSleep].map((v) => (v == null ? '–' : formatDecimal(v))).join(' / ')}`,
    '',
  ];
  if (summary.wins.length) {
    lines.push('## Vinster', '');
    for (const w of summary.wins) lines.push(`- ${formatWeekday(w.key)}: ${w.text.replace(/\n+/g, ' ')}`);
    lines.push('');
  }
  if (summary.memories.length) {
    lines.push('## Minnen', '');
    for (const m of summary.memories) lines.push(`- ${m.date}: ${String(m.text).replace(/\n+/g, ' ')}`);
    lines.push('');
  }
  if (review) {
    lines.push('## Reflektion', '');
    if (review.wentWell) lines.push(`**Vad gick bra:** ${review.wentWell}`, '');
    if (review.improve) lines.push(`**Gör annorlunda:** ${review.improve}`, '');
    const top = (review.top3 || []).filter((t) => String(t).trim());
    if (top.length) {
      lines.push('**Nästa veckas tre:**', '');
      top.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
      lines.push('');
    }
    if (review.familyPlan) lines.push(`**Familjeplan:** ${review.familyPlan}`, '');
    if (review.moneyPlan) lines.push(`**Pengaplan:** ${review.moneyPlan}`, '');
  }
  return lines.join('\n');
}
