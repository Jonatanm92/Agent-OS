/* Aura — vardagsmotorn i Auras eget tillstånd.
 *
 * The everyday engine (core/*.js, loaded as classic scripts on globalThis.Aura)
 * keeps its own state: items, fixed events, routines, projects, day notes and
 * a small log. Here it lives as `state.life`, inside the same browser storage
 * as the journal, the cycle and the check-ins — nothing new leaves the device.
 *
 * How the two halves meet:
 *  - Body state has one source: Klara's check-ins and Aura Pulse
 *    (state.logs). The engine reads them as its Pulse, so Klara's coach and the
 *    planner never disagree about how much energy there is today.
 *  - Every change is an op (core/apply.js): described before it happens,
 *    applied to a copy, and undoable here.
 */

const A = globalThis.Aura;

const UNDO_LIMIT = 20;
const undoStack = [];
const redoStack = [];

export function engineReady() {
  return Boolean(A?.model && A?.engine && A?.apply);
}

/** Make sure state.life exists and speaks Swedish with the user's own name. */
export function ensureLife(state, now = new Date()) {
  if (!engineReady()) return null;
  const fresh = !state.life || typeof state.life !== "object";
  const life = A.model.migrate(fresh ? null : state.life);
  if (fresh) {
    // This edition ships with Liv's cycle support and Astrid's Mystik switched on.
    life.prefs.modules.cycle = true;
    life.prefs.modules.reflection = true;
    life.meta.createdAt = now.toISOString();
  }
  life.prefs.language = "sv";
  life.prefs.onboarded = true;
  life.prefs.name = String(state.profile?.name || "").slice(0, 40);
  // Like the rest of Aura, the engine follows the phone's clock — also when travelling.
  life.prefs.timeZone = A.util.deviceTimeZone();
  // Cycle and journal live in Aura's own slices; the engine's copies stay empty.
  life.cycle = { entries: [] };
  life.journal = [];
  A.i18n.setLanguage("sv");
  A.util.setTimeZone(life.prefs.timeZone);
  state.life = life;
  return life;
}

export function moduleOn(state, name) {
  const modules = state.life?.prefs?.modules;
  return !modules || modules[name] !== false;
}

/* ---------------- Pulse from the check-ins ---------------- */

const SLEEP_TO_FIVE = { rough: 1, restless: 2, okay: 3, good: 4 };

function toFive(value, scale = 5) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const five = scale === 10 ? Math.round(number / 2) : Math.round(number);
  return Math.min(5, Math.max(1, five));
}

/** The day's pulses as the engine expects them, oldest first. */
export function pulsesFromLog(log) {
  if (!log || typeof log !== "object") return [];
  const pulses = [];
  const checkIns = Array.isArray(log.checkIns) ? [...log.checkIns].reverse() : [];
  for (const entry of checkIns) {
    if (!entry || typeof entry !== "object") continue;
    const pulse = { at: String(entry.createdAt || "") };
    const energy = toFive(entry.energy, 10);
    const mood = toFive(entry.mood);
    const stress = toFive(entry.stress);
    const sleep = SLEEP_TO_FIVE[entry.sleepQuality] || null;
    if (energy) pulse.energy = energy;
    if (mood) pulse.mood = mood;
    if (stress) pulse.stress = stress;
    if (sleep) pulse.sleep = sleep;
    pulses.push(pulse);
  }
  // Aura Pulse (and the older one-tap energy) — already on the 1–5 scale.
  const quick = Array.isArray(log.pulses) ? log.pulses : log.pulse && typeof log.pulse === "object" ? [log.pulse] : [];
  for (const entry of quick) {
    if (!entry || typeof entry !== "object") continue;
    const pulse = { at: String(entry.at || "") };
    for (const field of ["energy", "mood", "stress", "sleep"]) {
      const value = toFive(entry[field]);
      if (value) pulse[field] = value;
    }
    if (Object.keys(pulse).length > 1) pulses.push(pulse);
  }
  return pulses.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/** Today's merged pulse (latest value per field), for display. */
export function pulseToday(state, now = new Date()) {
  const view = engineView(state, now);
  return view ? A.model.pulseFor(view, A.util.dateKey(now)) : null;
}

/**
 * The life state as the engine should see it right now: the stored slice
 * with today's Pulse taken from the check-ins. Read-only — never persisted.
 */
export function engineView(state, now = new Date()) {
  const life = state.life || ensureLife(state, now);
  if (!life) return null;
  const key = A.util.dateKey(now);
  const pulses = pulsesFromLog(state.logs?.[key]);
  if (!pulses.length) return life;
  const day = A.model.getDay(life, key);
  return { ...life, days: { ...life.days, [key]: { ...day, pulses } } };
}

/** Today's energy on the engine's 1–5 scale, or null when unknown. */
export function energyToday(state, now = new Date()) {
  const view = engineView(state, now);
  const pulse = view ? A.model.pulseFor(view, A.util.dateKey(now)) : null;
  return pulse?.energy ?? null;
}

/* ---------------- changes ---------------- */

/**
 * Apply ops to state.life. System commits (daily housekeeping) are not
 * undoable; everything the user does is.
 * @returns {{applied: string[], skipped: string[], ids: string[]}}
 */
export function commitLife(state, ops, { now = new Date(), system = false } = {}) {
  if (!engineReady() || !Array.isArray(ops) || !ops.length) return { applied: [], skipped: [], ids: [] };
  const before = state.life || ensureLife(state, now);
  const result = A.apply.applyOps(before, ops, now);
  if (!result.applied.length) return result;
  if (!system) {
    undoStack.push(before);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
  }
  state.life = result.state;
  return result;
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

export function undoLife(state) {
  const previous = undoStack.pop();
  if (!previous) return false;
  redoStack.push(state.life);
  state.life = previous;
  return true;
}

export function redoLife(state) {
  const next = redoStack.pop();
  if (!next) return false;
  undoStack.push(state.life);
  state.life = next;
  return true;
}

/** Forget undo history, e.g. after "Radera allt". */
export function resetHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
}

/* ---------------- the daily rhythm ---------------- */

/**
 * Once per day, quietly: prune old details, then — from an hour before
 * waking — let Aura pick a few things from "kan vänta" into today when there
 * is room. It never invents anything. Returns true when state changed.
 */
export function housekeepLife(state, now = new Date()) {
  const life = state.life || ensureLife(state, now);
  if (!life) return false;
  let changed = false;
  const key = A.util.dateKey(now);
  if (life.meta.lastCompacted !== key) {
    state.life = A.compact.compact(life, now).state;
    changed = true;
  }
  const day = A.model.getDay(state.life, key);
  const wake = A.util.toMinutes(state.life.prefs.wake) ?? 420;
  if (!day.planned && A.util.minutesOfDay(now) >= wake - 60) {
    const view = engineView(state, now);
    const plan = A.planner.autoPlan(view, now);
    commitLife(state, plan.ops.length ? plan.ops : [{ op: "day.planned", date: key, picked: [] }], { now, system: true });
    changed = true;
  }
  return changed;
}
