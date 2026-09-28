import { localDateKey } from "./logic.js?v=31";

const STORAGE_KEY = "min-dag:josefin-edition:v1";

export function createInitialState() {
  return {
    version: 8,
    profile: { name: "Josefin", onboarded: false, waterTarget: 6, cycleLength: 28, periodLength: 5, birthDate: "" },
    preferences: { audioEnabled: false, audioVolume: 78, activeExperiment: null, experimentHistory: [] },
    cycle: { lastPeriod: "", events: [] },
    forest: { moments: [] },
    logs: {},
    journal: [],
    tarotReadings: [],
    toolbox: [],
    reminders: [],
    createdAt: new Date().toISOString()
  };
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

export function normalizeState(value) {
  const base = createInitialState();
  if (!isObject(value)) return base;
  const incomingCycle = isObject(value.cycle) ? value.cycle : {};
  const lastPeriod = typeof incomingCycle.lastPeriod === "string" ? incomingCycle.lastPeriod : "";
  const cycleEvents = Array.isArray(incomingCycle.events)
    ? incomingCycle.events.filter((event) => isObject(event) && typeof event.date === "string" && event.type === "period_start").slice(0, 100)
    : lastPeriod
      ? [{ id: `migrated-${lastPeriod}`, date: lastPeriod, type: "period_start" }]
      : [];
  const toolbox = Array.isArray(value.toolbox)
    ? value.toolbox.filter((item) => isObject(item) && typeof item.id === "string" && typeof item.title === "string" && typeof item.body === "string").slice(0, 20)
    : [];
  const reminders = Array.isArray(value.reminders)
    ? value.reminders.filter((item) => isObject(item) && typeof item.id === "string" && typeof item.title === "string" && typeof item.scheduledAt === "string" && ["pending", "delivered", "cancelled"].includes(item.status)).slice(0, 50)
    : [];
  const incomingForest = isObject(value.forest) ? value.forest : {};
  const forestMoments = Array.isArray(incomingForest.moments)
    ? incomingForest.moments
      .filter((item) => isObject(item) && typeof item.id === "string" && typeof item.title === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date || ""))
      .map((item) => ({
        id: item.id.slice(0, 120),
        date: item.date,
        title: item.title.trim().slice(0, 120),
        kind: ["done", "helped", "reflection"].includes(item.kind) ? item.kind : "done",
        characterId: ["klara", "liv", "maja", "astrid"].includes(item.characterId) ? item.characterId : "maja",
        route: ["today", "coach", "cycle", "ritual", "insights"].includes(item.route) ? item.route : "today",
        createdAt: typeof item.createdAt === "string" ? item.createdAt : `${item.date}T12:00:00.000Z`
      }))
      .filter((item) => item.title)
      .slice(0, 40)
    : [];
  const logs = isObject(value.logs)
    ? Object.fromEntries(Object.entries(value.logs).map(([date, rawLog]) => {
      const log = isObject(rawLog) ? rawLog : {};
      const checkIns = Array.isArray(log.checkIns)
        ? log.checkIns.map((entry) => isObject(entry) ? { ...entry, sleepHours: null } : entry)
        : [];
      return [date, { ...log, sleepHours: null, checkIns }];
    }))
    : {};
  const incomingPreferences = isObject(value.preferences) ? value.preferences : {};
  const audioVolume = Number(incomingPreferences.audioVolume);
  const experimentHistory = Array.isArray(incomingPreferences.experimentHistory)
    ? incomingPreferences.experimentHistory.filter((item) => isObject(item) && typeof item.title === "string" && ["helped", "unclear"].includes(item.outcome)).slice(0, 12)
    : [];
  return {
    ...base,
    ...value,
    profile: { ...base.profile, ...(isObject(value.profile) ? value.profile : {}) },
    preferences: {
      ...base.preferences,
      ...incomingPreferences,
      audioVolume: Number.isFinite(audioVolume) ? Math.round(Math.min(100, Math.max(20, audioVolume))) : base.preferences.audioVolume,
      experimentHistory
    },
    version: 8,
    cycle: { ...base.cycle, ...incomingCycle, lastPeriod, events: cycleEvents },
    forest: { ...base.forest, ...incomingForest, moments: forestMoments },
    logs,
    journal: Array.isArray(value.journal) ? value.journal.slice(0, 500) : [],
    tarotReadings: Array.isArray(value.tarotReadings) ? value.tarotReadings.slice(0, 100) : [],
    toolbox,
    reminders
  };
}

export function loadState(storage = window.localStorage) {
  try {
    return normalizeState(JSON.parse(storage.getItem(STORAGE_KEY) || "null"));
  } catch {
    return createInitialState();
  }
}

export function saveState(state, storage = window.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
}

export function getTodayLog(state, date = new Date()) {
  const key = localDateKey(date);
  const base = { mood: null, energy: 5, stress: 3, sleepHours: null, water: 0, ate: null, habits: {}, symptoms: [], gratitude: [], checkIns: [], tipFeedback: [] };
  const saved = isObject(state.logs[key]) ? state.logs[key] : {};
  return { ...base, ...saved, checkIns: Array.isArray(saved.checkIns) ? saved.checkIns : [] };
}

export function setTodayLog(state, patch, date = new Date()) {
  const key = localDateKey(date);
  const current = getTodayLog(state, date);
  state.logs[key] = { ...current, ...patch, updatedAt: new Date().toISOString() };
  return state.logs[key];
}

export function appendCheckIn(state, snapshot, date = new Date()) {
  const current = getTodayLog(state, date);
  const entry = {
    ...snapshot,
    id: snapshot.id || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: snapshot.createdAt || new Date().toISOString()
  };
  setTodayLog(state, { checkIns: [entry, ...(Array.isArray(current.checkIns) ? current.checkIns : [])].slice(0, 48) }, date);
  return entry;
}

export function setCheckInFeedback(state, id, feedback, date = new Date()) {
  const current = getTodayLog(state, date);
  const checkIns = (Array.isArray(current.checkIns) ? current.checkIns : []).map((entry) => entry.id === id
    ? { ...entry, feedback, feedbackAt: new Date().toISOString() }
    : entry);
  setTodayLog(state, { checkIns }, date);
  return checkIns.find((entry) => entry.id === id) || null;
}

export function setCheckInAI(state, id, patch, date = new Date()) {
  const current = getTodayLog(state, date);
  const checkIns = (Array.isArray(current.checkIns) ? current.checkIns : []).map((entry) => entry.id === id
    ? { ...entry, ...patch, aiUpdatedAt: new Date().toISOString() }
    : entry);
  setTodayLog(state, { checkIns }, date);
  return checkIns.find((entry) => entry.id === id) || null;
}

export function forestMomentsForDate(state, date = new Date()) {
  const key = localDateKey(date);
  return (Array.isArray(state?.forest?.moments) ? state.forest.moments : []).filter((moment) => moment.date === key);
}

export function rememberForestMoment(state, moment, date = new Date()) {
  if (!isObject(moment) || typeof moment.title !== "string" || !moment.title.trim()) return null;
  const key = localDateKey(date);
  const id = String(moment.id || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(0, 120);
  const entry = {
    id,
    date: key,
    title: moment.title.trim().slice(0, 120),
    kind: ["done", "helped", "reflection"].includes(moment.kind) ? moment.kind : "done",
    characterId: ["klara", "liv", "maja", "astrid"].includes(moment.characterId) ? moment.characterId : "maja",
    route: ["today", "coach", "cycle", "ritual", "insights"].includes(moment.route) ? moment.route : "today",
    createdAt: typeof moment.createdAt === "string" ? moment.createdAt : date.toISOString()
  };
  const current = Array.isArray(state?.forest?.moments) ? state.forest.moments : [];
  state.forest = { ...(isObject(state.forest) ? state.forest : {}), moments: [entry, ...current.filter((item) => item?.id !== id)].slice(0, 40) };
  return entry;
}

export function clearAll(storage = window.localStorage) {
  storage.removeItem(STORAGE_KEY);
}

export { STORAGE_KEY };
