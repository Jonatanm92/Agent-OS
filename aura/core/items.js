/* Aura — item queries: today's buckets, recurrence, lists.
 *
 * The user never files things. Each open item is classified for today:
 *   must      it genuinely matters today (deadline, reminder, chosen as must)
 *   good      planned for today, due chores, follow-ups
 *   later     can safely wait
 *   scheduled belongs to a later day
 *   null      not a doing-thing today (notes, ideas, waiting, undated shopping)
 *
 * Missed plans do not pile up: something planned for an earlier day without
 * a deadline falls back to "can wait" instead of stacking onto today.
 */
(function (root) {
  const A = root.Aura || (root.Aura = {});
  const U = A.util, M = A.model, I = A.i18n;

  function classify(state, item, today) {
    if (!item || item.status !== 'open') return null;
    if (item.kind === 'note' || item.kind === 'idea') return null;

    const overdue = !!item.dueDate && item.dueDate < today;
    const dueToday = item.dueDate === today;

    if (item.kind === 'shopping') {
      if (item.date && item.date > today) return 'scheduled';
      if (overdue || dueToday || item.date === today) return item.priority === 'must' || overdue || dueToday ? 'must' : 'good';
      return null;
    }
    if (item.kind === 'admin') {
      if (item.adminStatus === 'waiting') {
        return item.followUp && item.followUp <= today ? 'good' : null;
      }
      if (item.adminStatus === 'followup') {
        if (item.followUp && item.followUp > today) return 'scheduled';
        if (item.followUp && item.followUp <= today) return item.priority === 'must' ? 'must' : 'good';
      }
    }
    if (item.recur) {
      if (!item.dueDate || item.dueDate <= today) {
        if (item.date && item.date > today) return 'scheduled';
        return item.priority === 'must' || (overdue && U.daysBetween(item.dueDate, today) > 3 && item.priority !== 'later') ? 'must' : 'good';
      }
      return 'scheduled';
    }
    if (item.date && item.date > today) return 'scheduled';
    if (item.kind === 'reminder') {
      if (item.date === today || overdue || dueToday) return 'must';
      if (item.date && item.date < today) return 'must';
    }
    if (overdue || dueToday) return 'must';
    if (item.priority === 'must' && (!item.date || item.date >= today)) return 'must';
    if (item.priority === 'must' && item.date < today) return 'must';
    if (item.priority === 'later') return 'later';
    if (item.date === today) return 'good';
    if (item.priority === 'good' && !item.date) return 'good';
    return 'later';
  }

  /** Planned for an earlier day and quietly carried over into "can wait". */
  function isCarried(item, today) {
    return item.status === 'open' && !!item.date && item.date < today && classify({ prefs: {} }, item, today) === 'later';
  }

  function byOrderThenDue(a, b) {
    if ((a.order || 0) !== (b.order || 0)) return (a.order || 0) - (b.order || 0);
    const da = a.dueDate || '9999', db = b.dueDate || '9999';
    if (da !== db) return da.localeCompare(db);
    return String(a.createdAt).localeCompare(String(b.createdAt));
  }

  /** All of today's items, sorted, per bucket. */
  function dayBuckets(state, today) {
    const out = { must: [], good: [], later: [], scheduled: [], waiting: [], done: [] };
    for (const item of state.items) {
      if (item.status === 'done' && item.doneAt && doneOn(item, today)) { out.done.push(item); continue; }
      if (item.kind === 'admin' && item.adminStatus === 'waiting' && item.status === 'open') out.waiting.push(item);
      const b = classify(state, item, today);
      if (b && out[b]) out[b].push(item);
    }
    // Recurring items done today stay open (next due moved on); show them as done too.
    for (const item of state.items) {
      if (item.recur && item.lastDone === today && item.status === 'open' && !out.done.includes(item)) out.done.push(item);
    }
    out.must.sort(byOrderThenDue);
    out.good.sort(byOrderThenDue);
    out.later.sort((a, b) => laterScore(b, today) - laterScore(a, today));
    out.scheduled.sort((a, b) => (a.date || a.dueDate || a.followUp).localeCompare(b.date || b.dueDate || b.followUp));
    out.done.sort((a, b) => String(b.doneAt || '').localeCompare(String(a.doneAt || '')));
    return out;
  }

  function doneOn(item, today) {
    if (!item.doneAt) return false;
    try { return U.dateKey(new Date(item.doneAt)) === today; } catch (e) { return false; }
  }

  /** Rough order for "can wait": things with a date or a long wait rise first. */
  function laterScore(item, today) {
    let s = 0;
    if (item.dueDate) s += 40 - Math.min(35, U.daysBetween(today, item.dueDate));
    if (item.projectId) s += 8;
    if (item.postponed) s += Math.min(12, item.postponed * 3);
    const age = item.createdAt ? U.daysBetween(String(item.createdAt).slice(0, 10), today) : 0;
    s += Math.min(10, Math.max(0, age));
    return s;
  }

  /* ---------------- recurrence ---------------- */

  /** Next due date for a recurring item completed on `from`. */
  function recurNext(item, from) {
    const r = item.recur;
    if (!r) return '';
    if (r.unit === 'day') return U.addDays(from, r.every);
    if (r.unit === 'month') return U.addMonths(from, r.every);
    if (r.weekdays && r.weekdays.length) {
      if (r.every <= 1) {
        let best = null;
        for (const wd of r.weekdays) {
          const d = U.nextWeekday(from, wd, false);
          if (!best || d < best) best = d;
        }
        return best;
      }
      return U.nextWeekday(U.addDays(from, 7 * (r.every - 1)), r.weekdays[0], false);
    }
    return U.addDays(from, 7 * r.every);
  }

  function describeRecur(recur) {
    if (!recur) return '';
    const n = recur.every || 1;
    if (recur.unit === 'week' && recur.weekdays && recur.weekdays.length && n === 1) {
      if (recur.weekdays.length === 7) return I.t('every.day', { n: 1 });
      return I.t('every.weekdays', { days: I.list(recur.weekdays.map((d) => I.weekdayShort(d))) });
    }
    return I.t(`every.${recur.unit}`, { n });
  }

  /* ---------------- projects ---------------- */

  function projectActions(state, projectId) {
    return state.items.filter((i) => i.projectId === projectId && i.status === 'open')
      .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  function nextAction(state, projectId) {
    return projectActions(state, projectId)[0] || null;
  }

  function projectProgress(state, projectId) {
    const all = state.items.filter((i) => i.projectId === projectId && i.status !== 'dropped');
    return { done: all.filter((i) => i.status === 'done').length, total: all.length };
  }

  /* ---------------- lists ---------------- */

  function inbox(state) {
    return state.items.filter((i) => i.status === 'inbox').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function shoppingList(state) {
    const open = state.items.filter((i) => i.kind === 'shopping' && i.status === 'open');
    const groups = {};
    for (const item of open) {
      const cat = M.SHOP_CATEGORIES.includes(item.category) ? item.category : 'other';
      (groups[cat] || (groups[cat] = [])).push(item);
    }
    const ordered = M.SHOP_CATEGORIES.filter((c) => groups[c]).map((c) => ({ category: c, items: groups[c] }));
    const usuals = state.items.filter((i) => i.kind === 'shopping' && i.staple && i.status === 'done')
      .filter((u) => !open.some((o) => U.normalize(o.title) === U.normalize(u.title)));
    return { groups: ordered, count: open.length, usuals };
  }

  function adminList(state, today) {
    const open = state.items.filter((i) => i.kind === 'admin' && i.status === 'open');
    const action = open.filter((i) => i.adminStatus === 'action' || (i.adminStatus === 'followup' && (!i.followUp || i.followUp <= today)));
    const waiting = open.filter((i) => i.adminStatus === 'waiting');
    const later = open.filter((i) => i.adminStatus === 'followup' && i.followUp && i.followUp > today);
    const sortDue = (a, b) => (a.dueDate || a.followUp || '9999').localeCompare(b.dueDate || b.followUp || '9999');
    return { action: action.sort(sortDue), waiting: waiting.sort(sortDue), later: later.sort(sortDue) };
  }

  /** Household chores, most due first. */
  function choresList(state, today) {
    const chores = state.items.filter((i) => i.status === 'open' && (i.kind === 'chore' || (i.recur && i.category === 'home')));
    return chores.map((item) => ({
      item,
      dueIn: item.dueDate ? U.daysBetween(today, item.dueDate) : null,
    })).sort((a, b) => (a.dueIn == null ? 999 : a.dueIn) - (b.dueIn == null ? 999 : b.dueIn));
  }

  function upcoming(state, today, days) {
    const until = U.addDays(today, days || 7);
    return state.items.filter((i) => i.status === 'open' && ((i.date && i.date > today && i.date <= until)
      || (i.dueDate && i.dueDate > today && i.dueDate <= until)))
      .sort((a, b) => (a.date || a.dueDate).localeCompare(b.date || b.dueDate));
  }

  function counts(state, today) {
    const b = dayBuckets(state, today);
    return {
      must: b.must.length, good: b.good.length, later: b.later.length, done: b.done.length,
      inbox: inbox(state).length,
      shopping: state.items.filter((i) => i.kind === 'shopping' && i.status === 'open').length,
      adminAction: adminList(state, today).action.length,
      choresDue: choresList(state, today).filter((c) => c.dueIn != null && c.dueIn <= 0).length,
      projects: state.projects.filter((p) => p.status === 'active').length,
    };
  }

  A.items = {
    classify, isCarried, dayBuckets, laterScore, doneOn, recurNext, describeRecur,
    projectActions, nextAction, projectProgress, inbox, shoppingList, adminList, choresList,
    upcoming, counts,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
