/* Aura Engine — what matters right now.
 *
 * Combines the time, today's fixed things, the buckets, the latest Pulse,
 * the mode and what the user already declined, and returns ONE useful
 * thing — with a one-sentence reason and a duration — instead of a list.
 *
 * Deterministic on purpose: it runs on every screen, costs nothing and
 * behaves the same every time. AI is used elsewhere, where it adds value.
 */
(function (root) {
  const A = root.Aura || (root.Aura = {});
  const U = A.util, M = A.model, It = A.items, P = A.planner, I = A.i18n;

  const ENERGY_RANK = { light: 0, medium: 1, heavy: 2 };
  const LEAVE_WINDOW = 45;

  function effort(item) { return item.background ? Math.min(5, item.minutes) : item.minutes; }

  function period(nowMin) {
    if (nowMin < 12 * 60) return 'morning';
    if (nowMin < 17 * 60) return 'afternoon';
    return 'evening';
  }

  /** Modes: a manual choice wins; otherwise work/free follows the week. */
  function effectiveMode(state, key) {
    const day = M.getDay(state, key);
    if (day.mode) return day.mode;
    if (M.isWorkday(state, key) && M.hasWorkHours(state)) return 'work';
    return M.isWorkday(state, key) ? 'normal' : 'free';
  }

  /** Calls to offices and services only make sense when they are open. */
  function isOfficeCall(item) {
    return item.kind === 'admin' && (item.context === 'phone' || item.category === 'call');
  }

  function businessHours(key, nowMin) {
    const wd = U.weekday(key);
    return wd >= 1 && wd <= 5 && nowMin >= 8 * 60 && nowMin < 17 * 60;
  }

  /* ---------------- candidates ---------------- */

  function candidatePool(state, now, plan, opts) {
    const key = plan.dateKey;
    const day = M.getDay(state, key);
    const exclude = new Set([...(day.declined || []), ...((opts && opts.exclude) || [])]);
    if (day.focus && day.focus.itemId) exclude.add(day.focus.itemId);
    const mode = effectiveMode(state, key);
    const b = plan.buckets;

    const tag = (list, bucket) => list.map((item) => ({ item, bucket }));
    let pool = [...tag(b.must, 'must'), ...tag(b.good, 'good')];
    const actionableLater = b.later.filter((i) => P.isActionableKind(i));
    if (mode !== 'low' && mode !== 'recovery') pool = pool.concat(tag(actionableLater.slice(0, 25), 'later'));

    return pool.filter(({ item, bucket }) => {
      if (exclude.has(item.id)) return false;
      if (item.kind === 'note' || item.kind === 'idea') return false;
      if (item.kind === 'admin' && item.adminStatus === 'waiting' && !(item.followUp && item.followUp <= key)) return false;
      const t = U.toMinutes(item.time);
      if (t !== null && t > plan.nowMin && (item.kind === 'reminder' || item.date === key)) return false;
      if (isOfficeCall(item) && !businessHours(key, plan.nowMin)) return false;
      if ((mode === 'low' || mode === 'recovery') && bucket !== 'must' && (item.energy !== 'light' || effort(item) > 15)) return false;
      return true;
    });
  }

  function score(entry, ctx) {
    const { item, bucket } = entry;
    const m = effort(item);
    let s = { must: 100, good: 55, later: 18 }[bucket] || 10;
    const overdue = item.dueDate && item.dueDate < ctx.key;
    const dueToday = item.dueDate === ctx.key;
    if (overdue) s += 35;
    if (dueToday) s += 25;
    if (item.kind === 'reminder') s += 20;
    if (isOfficeCall(item)) s += 8;
    else if (item.context === 'phone' && ctx.lateEvening) s -= 10;
    if (ctx.minutesUntilNext != null) {
      if (m <= ctx.minutesUntilNext) s += ctx.minutesUntilNext <= 60 ? 18 : 8;
      else if (!item.background) s -= 45;
    }
    if (ctx.minutesLeft < m && !item.background) s -= 30;
    const L = ctx.energy;
    if (L != null) {
      if (item.energy === 'heavy') s += L <= 2 ? -60 : L >= 4 ? 10 : -4;
      if (item.energy === 'medium' && L <= 2) s -= 12;
      if (item.energy === 'light' && L <= 2) s += 18;
    }
    if (ctx.peak && ctx.peak === ctx.period && item.energy === 'heavy') s += 8;
    if (ctx.lateEvening) {
      if (item.energy === 'heavy') s -= 25;
      if (item.context === 'out') s -= 20;
    }
    if (item.background) s += 14;
    if (item.postponed >= 2) s += 6;
    if (m <= 10) s += ctx.mode === 'chaos' ? 22 : 6;
    if (item.projectId) s += 4;
    s -= (item.order || 0) * 2;
    return s;
  }

  function reasonFor(entry, ctx, following) {
    const { item, bucket } = entry;
    const m = effort(item);
    if (item.dueDate && item.dueDate < ctx.key) return { key: 'why.overdue', params: { when: I.relativeDay(item.dueDate, ctx.key) } };
    if (item.dueDate === ctx.key) return { key: 'why.dueToday' };
    if (item.kind === 'reminder') return { key: 'why.reminder' };
    if (item.background) {
      if (following) return { key: 'why.backgroundBefore', params: { min: I.duration(m), next: lowerFirst(following.title) } };
      return { key: 'why.background', params: { min: I.duration(m) } };
    }
    if (item.kind === 'admin' && item.adminStatus === 'waiting') return { key: 'why.followup' };
    if (ctx.next && ctx.minutesUntilNext != null && ctx.minutesUntilNext <= 60 && m <= ctx.minutesUntilNext) {
      return { key: 'why.fitsBefore', params: { mins: I.duration(ctx.minutesUntilNext), what: ctx.next.title } };
    }
    if (item.postponed >= 3) return { key: 'why.postponed', params: { n: item.postponed } };
    if (ctx.energy != null && ctx.energy <= 2 && item.energy === 'light') return { key: 'why.lowEnergy' };
    if (ctx.energy != null && ctx.energy >= 4 && item.energy === 'heavy') return { key: 'why.highEnergy' };
    if (item.recur) return { key: 'why.chore', params: { every: It.describeRecur(item.recur) } };
    if (isOfficeCall(item) && ctx.business) return { key: 'why.phoneHours' };
    if (bucket === 'must') return { key: 'why.must' };
    if (item.projectId) {
      const p = M.projectById(ctx.state, item.projectId);
      if (p) return { key: 'why.project', params: { project: p.title } };
    }
    if (m <= 10) return { key: 'why.quick' };
    if (bucket === 'good') return { key: 'why.good' };
    return { key: 'why.waiting' };
  }

  function lowerFirst(s) {
    const str = String(s || '');
    // Keep capitalised words (names, "I") as they are.
    if (/^[A-ZÅÄÖ][a-zåäö]/.test(str) && I.language() === 'en') return str.charAt(0).toLowerCase() + str.slice(1);
    if (I.language() === 'sv') return str.charAt(0).toLowerCase() + str.slice(1);
    return str;
  }

  function buildCtx(state, now, plan) {
    const key = plan.dateKey;
    return {
      state, key, nowMin: plan.nowMin,
      energy: plan.energy, mode: effectiveMode(state, key),
      business: businessHours(key, plan.nowMin),
      minutesUntilNext: plan.minutesUntilNext, next: plan.next,
      minutesLeft: plan.windowEnd - plan.nowMin,
      lateEvening: plan.nowMin >= plan.sleep - 120,
      period: period(plan.nowMin), peak: state.prefs.peakPeriod || '',
    };
  }

  /** Ranked candidates for "now", best first. */
  function rank(state, now, opts) {
    const plan = (opts && opts.plan) || P.planDay(state, now);
    const ctx = buildCtx(state, now, plan);
    const pool = candidatePool(state, now, plan, opts);
    const scored = pool.map((entry) => ({ ...entry, score: score(entry, ctx) }))
      .filter((e) => e.score > -40)
      .sort((a, b) => b.score - a.score);
    return { scored, ctx, plan };
  }

  /**
   * What should I do now? ONE recommendation with a reason and a duration.
   * opts.exclude: ids to skip ("something else")
   * opts.easierThan: id — only lighter or shorter things ("something easier")
   */
  function whatNow(state, now, opts) {
    const o = opts || {};
    const { scored, ctx, plan } = rank(state, now, o);
    let list = scored;
    let easierFallback = null;
    if (o.easierThan) {
      const cur = M.itemById(state, o.easierThan);
      if (cur) {
        list = scored.filter((e) => e.item.id !== cur.id && (ENERGY_RANK[e.item.energy] < ENERGY_RANK[cur.energy]
          || effort(e.item) <= Math.max(5, effort(cur) * 0.6)));
        if (!list.length) easierFallback = cur;
      }
    }
    if (easierFallback) {
      return {
        item: easierFallback, tiny: true, minutes: 5,
        title: I.t('now.tinyVersion', { title: easierFallback.title }),
        reason: { key: 'why.tiny' }, remaining: 0, plan,
      };
    }
    const best = list[0];
    if (!best) return null;
    const following = list.slice(1).find((e) => !e.item.background && effort(e.item) >= 10);
    return {
      item: best.item, bucket: best.bucket, minutes: effort(best.item), title: best.item.title,
      reason: reasonFor(best, ctx, best.item.background ? (following && following.item) : null),
      remaining: list.length - 1, plan,
    };
  }

  /* ---------------- routines in their window ---------------- */

  function routineNow(state, now, plan) {
    if (!A.routines || !M.moduleOn(state, 'routines')) return null;
    const views = A.routines.dueNow(state, now);
    return views.find((v) => v.remainingCore > 0) || null;
  }

  /* ---------------- the NOW card ---------------- */

  function nowCard(state, now) {
    const plan = P.planDay(state, now);
    const key = plan.dateKey;
    const day = M.getDay(state, key);
    const nowMin = plan.nowMin;
    const mode = effectiveMode(state, key);

    if (day.focus && day.focus.itemId) {
      const item = M.itemById(state, day.focus.itemId);
      if (item && item.status === 'open') {
        return { type: 'focus', item, startedAt: day.focus.startedAt, minutes: effort(item), plan, mode };
      }
    }
    if (plan.running) {
      return { type: 'event', event: plan.running, until: plan.running.end, plan, mode };
    }
    if (plan.next && plan.next.away && plan.minutesUntilNext != null && plan.minutesUntilNext <= LEAVE_WINDOW) {
      const quick = plan.minutesUntilNext > 12
        ? whatNow(state, now, { plan }) : null;
      const also = quick && quick.minutes <= plan.minutesUntilNext - 5 ? quick : null;
      return { type: 'leave', event: plan.next, leaveIn: plan.minutesUntilNext, also, plan, mode };
    }
    if (plan.next && !plan.next.away && plan.next.start - nowMin <= 15) {
      return { type: 'soon', event: plan.next, startsIn: plan.next.start - nowMin, plan, mode };
    }
    if (day.quietUntil != null && nowMin < day.quietUntil) {
      return { type: 'quiet', plan, mode };
    }
    if (nowMin >= plan.sleep - 30 || nowMin < Math.max(0, plan.wake - 60)) {
      const bed = A.routines ? A.routines.byKind(state, key, ['bedtime', 'evening'], now) : null;
      return { type: 'windDown', routine: bed && bed.remainingCore > 0 ? bed : null, plan, mode };
    }
    const routine = routineNow(state, now, plan);
    const rec = whatNow(state, now, { plan });
    const urgent = rec && (rec.bucket === 'must') && (rec.item.dueDate && rec.item.dueDate <= key);
    if (routine && !urgent) return { type: 'routine', routine, plan, mode };
    if (rec) return { type: 'task', rec, plan, mode };

    const mustLeft = plan.buckets.must.length;
    if ((mode === 'low' || mode === 'recovery') && !mustLeft) return { type: 'rest', plan, mode };
    return { type: 'free', plan, mode };
  }

  /* ---------------- modes and suggestions ---------------- */

  function modeSuggestion(state, now) {
    const key = U.dateKey(now);
    const day = M.getDay(state, key);
    if (day.mode) return null;
    const pulse = M.pulseFor(state, key);
    if (!pulse) return null;
    const c = It.counts(state, key);
    if (pulse.stress >= 4 && c.must + c.good + c.inbox >= 8 && !day.dismissed.includes('mode:chaos')) {
      return { mode: 'chaos' };
    }
    if ((pulse.energy != null && pulse.energy <= 2) || (pulse.stress >= 4 && pulse.energy != null && pulse.energy <= 3)) {
      if (!day.dismissed.includes('mode:low')) return { mode: 'low' };
    }
    return null;
  }

  /** At most one contextual suggestion for the home screen. */
  function suggestion(state, now) {
    const key = U.dateKey(now);
    const day = M.getDay(state, key);
    const nowMin = U.minutesOfDay(now);
    const sleep = U.toMinutes(state.prefs.sleep) ?? 1380;
    const dismissed = new Set(day.dismissed);

    const ms = modeSuggestion(state, now);
    if (ms) return { key: `mode:${ms.mode}`, kind: 'mode', mode: ms.mode };

    const b = It.dayBuckets(state, key);
    const eveningFrom = Math.max(18 * 60 + 30, sleep - 180);
    if (nowMin >= eveningFrom && !day.evening && !dismissed.has('evening') && (b.done.length || b.must.length || b.good.length)) {
      return { key: 'evening', kind: 'evening' };
    }
    const week = U.startOfWeek(key);
    const wd = U.weekday(key);
    const reviewTime = (wd === 0 && nowMin >= 15 * 60) || (wd === 1 && nowMin < 12 * 60);
    const reviewWeek = wd === 1 ? U.addDays(week, -7) : week;
    if (reviewTime && state.meta.lastReviewWeek !== reviewWeek && state.log.length >= 5 && !dismissed.has('review')) {
      return { key: 'review', kind: 'review', week: reviewWeek };
    }
    const inbox = It.inbox(state);
    if (inbox.length >= 5 && !dismissed.has('inbox')) return { key: 'inbox', kind: 'inbox', n: inbox.length };
    if (A.patterns && !dismissed.has('pattern')) {
      const obs = A.patterns.observations(state, now).find((o) => !state.meta.dismissedPatterns.includes(o.key));
      if (obs && U.hash(key + obs.key) % 3 === 0) return { key: 'pattern', kind: 'pattern', observation: obs };
    }
    return null;
  }

  /* ---------------- Low Energy Mode ---------------- */

  /** "Let's make today smaller": the necessary, one tiny win, and what moves. */
  function lowEnergyPlan(state, now) {
    const plan = P.planDay(state, now);
    const key = plan.dateKey;
    const b = plan.buckets;
    const hard = (i) => (i.dueDate && i.dueDate <= key) || i.kind === 'reminder' || i.priority === 'must';
    const must = b.must.filter(hard);
    const softMust = b.must.filter((i) => !hard(i));

    const pool = [...b.good, ...b.later.filter((i) => P.isActionableKind(i))]
      .filter((i) => i.energy === 'light' || effort(i) <= 10)
      .sort((x, y) => effort(x) - effort(y) || (y.background ? 1 : 0) - (x.background ? 1 : 0));
    let tiny = pool.find((i) => effort(i) <= 10) || null;
    let tinyText = null;
    if (!tiny && b.good.length) { tiny = b.good[0]; tinyText = I.t('now.tinyVersion', { title: tiny.title }); }

    const ops = [{ op: 'day.mode', date: key, mode: 'low' }];
    const moved = [];
    const load = {};
    for (const item of [...softMust, ...b.good]) {
      if (tiny && item.id === tiny.id) continue;
      const to = P.nextGoodDay(state, key, item, load);
      load[to] = (load[to] || 0) + 1;
      ops.push({ op: 'item.schedule', id: item.id, date: to, lowEnergy: true });
      moved.push({ id: item.id, title: item.title, to });
    }
    return { must, tiny, tinyText, moved, ops };
  }

  /* ---------------- Chaos Mode ---------------- */

  /** Order for working through overload one thing at a time. */
  function chaosQueue(state, now, ids) {
    const plan = P.planDay(state, now);
    const ctx = Object.assign(buildCtx(state, now, plan), { mode: 'chaos' });
    const key = plan.dateKey;
    const wanted = ids ? new Set(ids) : null;
    const pool = [];
    for (const item of state.items) {
      if (item.status !== 'open' || !P.isActionableKind(item)) continue;
      if (wanted && !wanted.has(item.id)) continue;
      const bucket = It.classify(state, item, key);
      if (!wanted && !['must', 'good'].includes(bucket)) continue;
      if (bucket === 'scheduled' && !wanted) continue;
      pool.push({ item, bucket: bucket === 'scheduled' ? 'later' : bucket || 'later' });
    }
    const urgent = (e) => (e.item.dueDate && e.item.dueDate <= key) || e.item.kind === 'reminder' || e.bucket === 'must';
    return pool
      .map((e) => ({ ...e, score: score(e, ctx) + (urgent(e) ? 200 : 0) }))
      .sort((a, b) => b.score - a.score)
      .map((e) => e.item.id);
  }

  function chaosState(state, now) {
    const key = U.dateKey(now);
    const day = M.getDay(state, key);
    if (!day.chaos || !Array.isArray(day.chaos.queue)) return null;
    const open = day.chaos.queue.map((id) => M.itemById(state, id)).filter((i) => i && i.status === 'open'
      && !(i.recur && i.lastDone === key));
    const doneCount = day.chaos.queue.length - open.length;
    return { current: open[0] || null, rest: open.slice(1), doneCount, total: day.chaos.queue.length };
  }

  A.engine = {
    effectiveMode, period, businessHours, isOfficeCall, effort, rank, whatNow, nowCard, routineNow,
    modeSuggestion, suggestion, lowEnergyPlan, chaosQueue, chaosState, score, reasonFor, LEAVE_WINDOW,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
