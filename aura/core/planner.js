/* Aura — day planning.
 *
 * Carried over from Min vardag, and still tested:
 *  1. A plan starts at the current time. Nothing already past is suggested.
 *  2. Fixed commitments are never removed; margins are kept around them.
 *  3. Free time is not filled to the brim — a share is always left open.
 *  4. Aura never invents chores to fill gaps. It only picks from what the
 *     user already has.
 *  5. Low energy shrinks the day and says what moved, instead of hiding it.
 */
(function (root) {
  const A = root.Aura || (root.Aura = {});
  const U = A.util, M = A.model, It = A.items;

  const MIN_SLOT = 10;
  const MARGIN_SHARE = 0.25;   // a quarter of free time is never planned

  /* ---------------- intervals ---------------- */

  function subtract(intervals, busy) {
    let result = intervals;
    for (const b of busy) {
      const next = [];
      for (const it of result) {
        if (b.end <= it.start || b.start >= it.end) { next.push(it); continue; }
        if (b.start > it.start) next.push({ start: it.start, end: b.start });
        if (b.end < it.end) next.push({ start: b.end, end: it.end });
      }
      result = next;
    }
    return result.filter((it) => it.end - it.start >= MIN_SLOT);
  }

  function total(intervals) { return intervals.reduce((s, it) => s + (it.end - it.start), 0); }

  /* ---------------- fixed things ---------------- */

  function eventsOn(state, key) {
    const wd = U.weekday(key);
    return state.events.filter((e) => e.active !== false && (
      (e.recur && e.recur.weekdays.includes(wd)) || (!e.recur && e.date === key)));
  }

  /** Fixed blocks for a day: working hours (when known) and events with a time. */
  function fixedFor(state, key) {
    const day = M.getDay(state, key);
    const fixed = [];
    const allDay = [];
    const offMode = day.mode === 'free' || day.mode === 'recovery';
    if (M.isWorkday(state, key) && M.hasWorkHours(state) && !offMode) {
      fixed.push({
        id: `work:${key}`, title: A.i18n.t('mode.work'), kind: 'work', source: 'work',
        start: U.toMinutes(state.prefs.workStart), end: U.toMinutes(state.prefs.workEnd), away: true,
      });
    }
    for (const e of eventsOn(state, key)) {
      const start = U.toMinutes(e.start);
      if (start === null) { allDay.push(e); continue; }
      const end = U.toMinutes(e.end);
      fixed.push({
        id: `ev:${e.id}:${key}`, eventId: e.id, title: e.title, kind: e.kind, source: 'event',
        start, end: end !== null && end > start ? end : start + 60, away: e.away !== false, location: e.location,
      });
    }
    fixed.sort((a, b) => a.start - b.start);
    return { fixed, allDay };
  }

  /* ---------------- capacity ---------------- */

  const ENERGY_CAP = { 1: 0.3, 2: 0.45, 3: 0.7, 4: 0.85, 5: 1.0 };

  /** 0..1 — how much of the free time can reasonably hold tasks today. */
  function capacity(state, key) {
    const pulse = M.pulseFor(state, key);
    const day = M.getDay(state, key);
    let cap = pulse && pulse.energy ? ENERGY_CAP[pulse.energy] || 0.7 : 0.75;
    if (pulse && pulse.stress >= 5) cap *= 0.85;
    if (pulse && pulse.sleep === 1) cap *= 0.85;
    if (day.mode === 'low') cap = Math.min(cap, 0.4);
    if (day.mode === 'recovery') cap = Math.min(cap, 0.35);
    return Math.round(cap * 100) / 100;
  }

  function energyLevel(state, key) {
    const pulse = M.pulseFor(state, key);
    return pulse && pulse.energy ? pulse.energy : null;
  }

  /* ---------------- the plan ---------------- */

  function planDay(state, now) {
    const key = U.dateKey(now);
    const nowMin = U.minutesOfDay(now);
    const p = state.prefs;
    const wake = U.toMinutes(p.wake) ?? 420;
    let sleep = U.toMinutes(p.sleep) ?? 1380;
    if (sleep <= wake) sleep = 1439;   // late sleepers: plan to midnight

    const { fixed, allDay } = fixedFor(state, key);
    const windowStart = Math.max(U.roundUp5(nowMin), wake);
    const windowEnd = Math.max(windowStart, sleep);

    const busy = fixed.map((f) => {
      const pad = f.away ? (p.commuteMin || 0) : 5;
      return { start: f.start - pad, end: f.end + pad };
    });
    const free = subtract([{ start: windowStart, end: windowEnd }], busy);
    const freeMinutes = total(free);
    const cap = capacity(state, key);
    const budget = Math.floor(freeMinutes * cap * (1 - MARGIN_SHARE));

    const buckets = It.dayBuckets(state, key);
    const sum = (list) => list.reduce((s, i) => s + (i.background ? Math.min(5, i.minutes) : i.minutes), 0);
    const mustMinutes = sum(buckets.must);
    const goodMinutes = sum(buckets.good);

    const running = fixed.find((f) => f.start <= nowMin && f.end > nowMin) || null;
    const next = fixed.find((f) => f.start > nowMin) || null;
    let leaveAt = null, minutesUntilNext = null;
    if (next) {
      leaveAt = next.away ? next.start - (p.commuteMin || 0) : next.start;
      minutesUntilNext = Math.max(0, leaveAt - nowMin);
    }

    return {
      dateKey: key, nowMin, wake, sleep, windowStart, windowEnd,
      fixed, allDay, free, freeMinutes, capacity: cap, energy: energyLevel(state, key), budget,
      buckets, mustMinutes, goodMinutes,
      load: budget > 0 ? (mustMinutes + goodMinutes) / budget : (mustMinutes + goodMinutes > 0 ? 9 : 0),
      running, next, leaveAt, minutesUntilNext,
      minutesLeft: Math.max(0, windowEnd - windowStart),
    };
  }

  /* ---------------- choosing a day to move things to ---------------- */

  function plannedCount(state, key) {
    return state.items.filter((i) => i.status === 'open' && i.date === key).length;
  }

  /** A calm day in the next week for an item: respects deadlines and days it should avoid. */
  function nextGoodDay(state, from, item, extra) {
    const caps = M.densityCaps(state);
    const load = Object.assign({}, extra || {});
    let fallback = U.addDays(from, 1);
    for (let i = 1; i <= 10; i += 1) {
      const d = U.addDays(from, i);
      if (item.dueDate && d > item.dueDate) break;
      if ((item.avoidWeekdays || []).includes(U.weekday(d))) continue;
      if (i === 1) fallback = d;
      const count = plannedCount(state, d) + (load[d] || 0);
      if (count < caps.good) return d;
    }
    if (item.dueDate && item.dueDate > from) return item.dueDate;
    return fallback;
  }

  /* ---------------- helpers for choosing ---------------- */

  function isActionableKind(item) {
    return ['task', 'admin', 'chore', 'reminder'].includes(item.kind);
  }

  function energyOk(item, level) {
    if (level == null) return true;
    if (level <= 2) return item.energy !== 'heavy';
    return true;
  }

  /** Calls to offices only fit a weekday before about half past four. */
  function officeClosedForToday(item, key, nowMin) {
    const officeCall = item.kind === 'admin' && (item.context === 'phone' || item.category === 'call');
    if (!officeCall) return false;
    const wd = U.weekday(key);
    return wd === 0 || wd === 6 || (nowMin != null && nowMin >= 16 * 60 + 30);
  }

  /** Items from "can wait" that Aura may pull into today when there is room. */
  function promotable(state, key, nowMin) {
    const wd = U.weekday(key);
    const buckets = It.dayBuckets(state, key);
    const firstActions = new Set(state.projects.filter((p) => p.status === 'active')
      .map((p) => { const n = It.nextAction(state, p.id); return n && n.id; }).filter(Boolean));
    return buckets.later.filter((i) => isActionableKind(i)
      && !(i.avoidWeekdays || []).includes(wd)
      && !officeClosedForToday(i, key, nowMin)
      && i.priority !== 'later'
      && (!i.projectId || firstActions.has(i.id)));
  }

  /**
   * Morning plan: when today has room, Aura picks a few things from
   * "can wait" into "good". It never adds anything new.
   */
  function autoPlan(state, now) {
    const plan = planDay(state, now);
    const caps = M.densityCaps(state);
    const room = plan.budget - plan.mustMinutes - plan.goodMinutes;
    const ops = [];
    const picked = [];
    if (room < 15 || plan.buckets.good.length >= caps.good) return { ops, picked, plan };
    let used = 0;
    let count = plan.buckets.good.length;
    for (const item of promotable(state, plan.dateKey, plan.nowMin)) {
      if (count >= caps.good) break;
      if (!energyOk(item, plan.energy)) continue;
      const minutes = item.background ? 5 : item.minutes;
      if (used + minutes > room) continue;
      ops.push({ op: 'item.schedule', id: item.id, date: plan.dateKey, auto: true });
      picked.push(item.id);
      used += minutes;
      count += 1;
    }
    if (ops.length) ops.push({ op: 'day.planned', date: plan.dateKey, picked });
    return { ops, picked, plan };
  }

  /**
   * "Rebuild my day": keeps every must, keeps as many good things as fit the
   * time and energy left, moves the rest to calm days, and — when there is
   * room — pulls a few things forward. Returns a proposal; nothing changes
   * until the user accepts it.
   */
  function rebuild(state, now) {
    const plan = planDay(state, now);
    const caps = M.densityCaps(state);
    const key = plan.dateKey;
    const ops = [];
    const kept = [], moved = [], added = [];
    let used = plan.mustMinutes;
    const extraLoad = {};
    const level = plan.energy;

    const scoreGood = (i) => (i.dueDate ? 50 : 0) + (i.postponed || 0) * 4 + (i.recur ? 10 : 0) + (i.kind === 'reminder' ? 30 : 0) - (i.order || 0);
    const goods = plan.buckets.good.slice().sort((a, b) => scoreGood(b) - scoreGood(a));

    for (const item of goods) {
      const minutes = item.background ? 5 : item.minutes;
      const fits = used + minutes <= plan.budget && kept.length < caps.good && energyOk(item, level);
      if (fits) { kept.push(item); used += minutes; continue; }
      const to = nextGoodDay(state, key, item, extraLoad);
      extraLoad[to] = (extraLoad[to] || 0) + 1;
      ops.push({ op: 'item.schedule', id: item.id, date: to, rebuild: true });
      moved.push({ id: item.id, title: item.title, to });
    }

    if (!moved.length && used < plan.budget) {
      for (const item of promotable(state, key, plan.nowMin)) {
        if (kept.length + added.length >= caps.good) break;
        if (!energyOk(item, level)) continue;
        const minutes = item.background ? 5 : item.minutes;
        if (used + minutes > plan.budget) continue;
        ops.push({ op: 'item.schedule', id: item.id, date: key, auto: true });
        added.push({ id: item.id, title: item.title });
        used += minutes;
      }
    }

    return {
      ops, kept: kept.map((i) => ({ id: i.id, title: i.title })), moved, added,
      must: plan.buckets.must.map((i) => ({ id: i.id, title: i.title })),
      tight: plan.mustMinutes > plan.budget,
      budget: plan.budget, used, freeMinutes: plan.freeMinutes,
    };
  }

  A.planner = {
    subtract, total, eventsOn, fixedFor, capacity, energyLevel, planDay,
    plannedCount, nextGoodDay, isActionableKind, energyOk, promotable, officeClosedForToday, autoPlan, rebuild,
    MARGIN_SHARE,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
