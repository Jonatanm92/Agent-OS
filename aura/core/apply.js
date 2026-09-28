/* Aura — changes (ops).
 *
 * Every change to a person's Aura is an op: a small plain object that can
 * be described in words BEFORE it happens, applied to a copy of the state,
 * and undone afterwards. Brain dumps, the coach, Rebuild my day and the
 * buttons all go through here — so there is one place that decides what a
 * change means, and one place that logs it for patterns and the weekly review.
 */
(function (root) {
  const A = root.Aura || (root.Aura = {});
  const U = A.util, M = A.model, It = A.items, I = A.i18n;

  const ITEM_FIELDS = ['kind', 'title', 'note', 'priority', 'date', 'dueDate', 'time', 'minutes', 'energy',
    'context', 'background', 'recur', 'projectId', 'category', 'adminStatus', 'waitingOn', 'followUp',
    'forPerson', 'staple', 'avoidWeekdays', 'order'];
  const LOG_LIMIT = 1500;

  function findItem(state, id) { return M.itemById(state, id); }

  /** 'tomorrow' | 'weekend' | 'nextweek' | 'later' | 'YYYY-MM-DD' -> date key ('' = no date). */
  function resolveWhen(to, today) {
    if (U.isDateKey(to)) return to;
    switch (to) {
      case 'today': return today;
      case 'tomorrow': return U.addDays(today, 1);
      case 'weekend': {
        const wd = U.weekday(today);
        return wd === 6 || wd === 0 ? U.nextWeekday(today, 6, false) : U.nextWeekday(today, 6, true);
      }
      case 'nextweek': return U.addDays(U.startOfWeek(today), 7);
      default: return '';
    }
  }

  function whenLabel(to, today) {
    if (to === 'later') return I.t('when.later');
    const d = resolveWhen(to, today);
    return d ? I.relativeDay(d, today) : I.t('when.later');
  }

  /* ---------------- describing ---------------- */

  function describe(state, op, now) {
    const today = U.dateKey(now || new Date());
    const item = op.id ? findItem(state, op.id) : null;
    const title = item ? item.title : (op.item && op.item.title) || '';
    switch (op.op) {
      case 'item.add': {
        const k = op.item && op.item.kind;
        return k && k !== 'task' ? I.t('op.itemAddKind', { kind: I.t(`kind.${k}`).toLowerCase(), title }) : I.t('op.itemAdd', { title });
      }
      case 'item.update': return I.t('op.itemUpdate', { title: (op.patch && op.patch.title) || title });
      case 'item.done': return I.t('op.itemDone', { title });
      case 'item.reopen': return I.t('op.itemReopen', { title });
      case 'item.drop': return I.t('op.itemDrop', { title });
      case 'item.delete': return I.t('op.itemDelete', { title });
      case 'item.postpone':
        return op.to === 'later' ? I.t('op.itemLater', { title }) : I.t('op.itemPostpone', { title, when: whenLabel(op.to, today) });
      case 'item.schedule': return I.t('op.itemSchedule', { title, when: op.date ? I.relativeDay(op.date, today) : I.t('when.later') });
      case 'item.bucket': return I.t('op.itemBucket', { title, bucket: I.t(`bucket.${op.bucket}`) });
      case 'item.process': return I.t('op.itemProcess', { title });
      case 'item.admin': return I.t('op.itemAdmin', { title, status: I.t(`admin.${op.adminStatus}`) });
      case 'item.split': return I.t('op.itemSmaller', { title: op.first || title });
      case 'item.reorder': return I.t('op.itemReorder');
      case 'event.add': {
        const e = op.event || {};
        const when = e.recur ? '' : [e.date ? I.relativeDay(e.date, today) : '', e.start || ''].filter(Boolean).join(' ');
        return I.t('op.eventAdd', { title: e.title || '', when }).trim();
      }
      case 'event.update': { const e = M.eventById(state, op.id); return I.t('op.eventUpdate', { title: e ? e.title : '' }); }
      case 'event.delete': { const e = M.eventById(state, op.id); return I.t('op.eventDelete', { title: e ? e.title : '' }); }
      case 'routine.add': return I.t('op.routineAdd', { name: (op.routine && op.routine.name) || '' });
      case 'routine.update': { const r = M.routineById(state, op.id); return I.t('op.routineUpdate', { name: r ? r.name : '' }); }
      case 'routine.delete': { const r = M.routineById(state, op.id); return I.t('op.routineDelete', { name: r ? r.name : '' }); }
      case 'routine.check': case 'routine.skip': {
        const r = M.routineById(state, op.routineId);
        const s = r && r.steps.find((x) => x.id === op.stepId);
        const label = s ? s.label : '';
        if (op.op === 'routine.skip') return I.t('op.routineSkip', { label });
        return op.done ? I.t('op.routineCheck', { label }) : I.t('op.routineUncheck', { label });
      }
      case 'routine.variant': return I.t('op.routineUpdate', { name: (M.routineById(state, op.routineId) || {}).name || '' });
      case 'project.add': return I.t('op.projectAdd', { title: (op.project && op.project.title) || '' });
      case 'project.update': { const p = M.projectById(state, op.id); return I.t('op.projectUpdate', { title: (op.patch && op.patch.title) || (p ? p.title : '') }); }
      case 'project.delete': { const p = M.projectById(state, op.id); return I.t('op.projectDelete', { title: p ? p.title : '' }); }
      case 'day.pulse': return I.t('op.pulse');
      case 'day.mode': return op.mode ? I.t('op.mode', { mode: I.t(`mode.${op.mode}`) }) : I.t('op.modeOff');
      case 'day.focus': {
        const f = op.itemId ? findItem(state, op.itemId) : null;
        return f ? I.t('op.focus', { title: f.title }) : I.t('op.focusStop');
      }
      case 'day.decline': { const d = findItem(state, op.itemId); return I.t('op.decline', { title: d ? d.title : '' }); }
      case 'day.quiet': return I.t('op.quiet');
      case 'day.evening': return I.t('op.evening');
      case 'day.chaos': return I.t('op.chaos');
      case 'day.planned': case 'day.dismiss': case 'day.intention': case 'day.undecline': return I.t('op.dayNote');
      case 'prefs.set': return I.t('op.prefs');
      case 'person.add': return I.t('op.personAdd', { name: op.name || '' });
      case 'person.remove': { const p = state.people.find((x) => x.id === op.id); return I.t('op.personRemove', { name: p ? p.name : '' }); }
      case 'cycle.log': return I.t('op.cycleLog');
      case 'cycle.delete': return I.t('op.cycleDelete');
      case 'cycle.clear': return I.t('op.cycleClear');
      case 'journal.add': return I.t('op.journalAdd');
      case 'journal.delete': return I.t('op.journalDelete');
      case 'pattern.dismiss': return I.t('op.patternDismiss');
      case 'meta.review': return I.t('op.review');
      default: return I.t('op.unknown');
    }
  }

  /* ---------------- applicability ---------------- */

  function isApplicable(state, op) {
    switch (op.op) {
      case 'item.add': return !!(op.item && String(op.item.title || '').trim());
      case 'item.update': case 'item.done': case 'item.reopen': case 'item.drop': case 'item.delete':
      case 'item.postpone': case 'item.schedule': case 'item.bucket': case 'item.process': case 'item.admin':
      case 'item.split':
        return !!findItem(state, op.id);
      case 'item.reorder': return Array.isArray(op.ids);
      case 'event.add': return !!(op.event && String(op.event.title || '').trim());
      case 'event.update': case 'event.delete': return !!M.eventById(state, op.id);
      case 'routine.add': return !!(op.routine && String(op.routine.name || '').trim());
      case 'routine.update': case 'routine.delete': return !!M.routineById(state, op.id);
      case 'routine.check': case 'routine.skip': {
        const r = M.routineById(state, op.routineId);
        return !!(r && r.steps.some((s) => s.id === op.stepId));
      }
      case 'routine.variant': return !!M.routineById(state, op.routineId);
      case 'project.add': return !!(op.project && String(op.project.title || '').trim());
      case 'project.update': case 'project.delete': return !!M.projectById(state, op.id);
      case 'day.focus': return !op.itemId || !!findItem(state, op.itemId);
      case 'day.decline': case 'day.undecline': return !!op.itemId;
      case 'person.add': return !!String(op.name || '').trim();
      case 'person.remove': return state.people.some((p) => p.id === op.id);
      case 'cycle.log': case 'cycle.delete': return U.isDateKey(op.date);
      case 'journal.add': return !!(op.entry && String(op.entry.text || '').trim());
      case 'journal.delete': return state.journal.some((j) => j.id === op.id);
      default: return true;
    }
  }

  /* ---------------- applying ---------------- */

  function dayOf(next, key) {
    const d = next.days[key] || M.dayDefaults();
    next.days[key] = d;
    for (const [k, v] of Object.entries(M.dayDefaults())) if (d[k] === undefined) d[k] = U.clone(v);
    return d;
  }

  function pushLog(next, entry) {
    next.log.push(entry);
    if (next.log.length > LOG_LIMIT) next.log.splice(0, next.log.length - LOG_LIMIT);
  }

  function logEntry(ev, now, extra) {
    const key = U.dateKey(now);
    return Object.assign({ at: now.toISOString(), d: key, wd: U.weekday(key), h: Math.floor(U.minutesOfDay(now) / 60), ev }, extra || {});
  }

  function sanitizeItem(item, patch, stamp) {
    const merged = Object.assign({}, item);
    for (const k of ITEM_FIELDS) if (patch && Object.prototype.hasOwnProperty.call(patch, k)) merged[k] = patch[k];
    const clean = M.newItem(Object.assign({}, merged, { id: item.id, now: item.createdAt, startDue: false }));
    // Keep lifecycle fields exactly as they were.
    for (const k of ['status', 'createdAt', 'doneAt', 'postponed', 'lastPostponed', 'lastDone', 'source']) clean[k] = item[k];
    if (patch && patch.recur && !item.recur && !clean.dueDate) clean.dueDate = clean.date || '';
    clean.updatedAt = stamp;
    return clean;
  }

  function applyOne(next, op, now, today, stamp) {
    switch (op.op) {
      /* ----- items ----- */
      case 'item.add': {
        const item = M.newItem(Object.assign({}, op.item, { now: stamp }));
        if (op.item.status === 'inbox') item.status = 'inbox';
        next.items.push(item);
        pushLog(next, logEntry('add', now, { id: item.id, k: item.kind, src: item.source }));
        return item.id;
      }
      case 'item.update': {
        const idx = next.items.findIndex((i) => i.id === op.id);
        next.items[idx] = sanitizeItem(next.items[idx], op.patch || {}, stamp);
        if (op.patch && op.patch.status === 'open' && next.items[idx].status === 'inbox') next.items[idx].status = 'open';
        return op.id;
      }
      case 'item.process': {
        const idx = next.items.findIndex((i) => i.id === op.id);
        const cur = next.items[idx];
        const updated = sanitizeItem(cur, Object.assign({}, op.patch || {}), stamp);
        if (updated.kind === 'admin' && !updated.adminStatus) updated.adminStatus = 'action';
        updated.status = 'open';
        next.items[idx] = updated;
        return op.id;
      }
      case 'item.done': {
        const item = findItem(next, op.id);
        if (item.recur) {
          item.lastDone = today;
          item.dueDate = It.recurNext(item, today);
          item.date = '';
          item.postponed = 0;
        } else {
          item.status = 'done';
          item.doneAt = stamp;
        }
        item.updatedAt = stamp;
        const day = dayOf(next, today);
        if (day.focus && day.focus.itemId === item.id) day.focus = null;
        pushLog(next, logEntry('done', now, { id: item.id, k: item.kind, m: item.minutes, e: item.energy }));
        return item.id;
      }
      case 'item.reopen': {
        const item = findItem(next, op.id);
        item.status = 'open';
        item.doneAt = '';
        if (op.date !== undefined) item.date = op.date;
        item.updatedAt = stamp;
        return item.id;
      }
      case 'item.drop': {
        const item = findItem(next, op.id);
        item.status = 'dropped';
        item.updatedAt = stamp;
        pushLog(next, logEntry('drop', now, { id: item.id, k: item.kind }));
        return item.id;
      }
      case 'item.delete': {
        next.items = next.items.filter((i) => i.id !== op.id);
        return op.id;
      }
      case 'item.postpone': {
        const item = findItem(next, op.id);
        if (op.to === 'later') {
          item.priority = 'later';
          item.date = '';
        } else {
          const to = resolveWhen(op.to, today) || U.addDays(today, 1);
          if (item.recur) item.dueDate = to;
          item.date = to;
          if (item.priority === 'later') item.priority = '';
        }
        item.postponed = (item.postponed || 0) + 1;
        item.lastPostponed = today;
        item.updatedAt = stamp;
        const day = dayOf(next, today);
        if (day.focus && day.focus.itemId === item.id) day.focus = null;
        pushLog(next, logEntry('postpone', now, { id: item.id, k: item.kind, to: op.to }));
        return item.id;
      }
      case 'item.schedule': {
        const item = findItem(next, op.id);
        item.date = U.isDateKey(op.date) ? op.date : '';
        if (item.recur && op.date && item.dueDate && item.dueDate < op.date) item.dueDate = op.date;
        if (op.date && item.priority === 'later') item.priority = '';
        item.updatedAt = stamp;
        if (op.rebuild || op.lowEnergy) pushLog(next, logEntry('move', now, { id: item.id, k: item.kind, why: op.rebuild ? 'rebuild' : 'low' }));
        return item.id;
      }
      case 'item.bucket': {
        const item = findItem(next, op.id);
        if (op.bucket === 'must') { item.priority = 'must'; if (!item.date || item.date > today) item.date = today; }
        else if (op.bucket === 'good') { item.priority = 'good'; item.date = today; }
        else { item.priority = 'later'; item.date = ''; }
        if (item.status === 'inbox') item.status = 'open';
        item.updatedAt = stamp;
        return item.id;
      }
      case 'item.admin': {
        const item = findItem(next, op.id);
        item.adminStatus = M.ADMIN_STATUSES.includes(op.adminStatus) ? op.adminStatus : item.adminStatus;
        if (op.waitingOn !== undefined) item.waitingOn = String(op.waitingOn || '').slice(0, 80);
        if (op.followUp !== undefined) item.followUp = U.isDateKey(op.followUp) ? op.followUp : '';
        if (item.adminStatus === 'waiting' && !item.followUp) item.followUp = U.addDays(today, 5);
        item.updatedAt = stamp;
        return item.id;
      }
      case 'item.split': {
        const item = findItem(next, op.id);
        const first = M.newItem({
          kind: item.kind === 'chore' ? 'task' : item.kind, title: op.first || item.title,
          minutes: op.minutes || Math.max(5, Math.round(item.minutes / 3)), energy: 'light',
          priority: item.priority, date: item.date || today, projectId: item.projectId,
          context: item.context, source: 'split', now: stamp,
        });
        first.order = (item.order || 0) - 1;
        next.items.push(first);
        if (!item.recur) { item.date = ''; if (item.priority !== 'must') item.priority = 'later'; }
        item.updatedAt = stamp;
        return first.id;
      }
      case 'item.reorder': {
        op.ids.forEach((id, index) => { const it = findItem(next, id); if (it) it.order = index; });
        return null;
      }

      /* ----- events ----- */
      case 'event.add': {
        const e = M.newEvent(Object.assign({}, op.event, { now: stamp }));
        next.events.push(e);
        return e.id;
      }
      case 'event.update': {
        const idx = next.events.findIndex((e) => e.id === op.id);
        const merged = Object.assign({}, next.events[idx], op.patch || {});
        const clean = M.newEvent(Object.assign({}, merged, { id: op.id, now: next.events[idx].createdAt }));
        next.events[idx] = clean;
        return op.id;
      }
      case 'event.delete': {
        next.events = next.events.filter((e) => e.id !== op.id);
        return op.id;
      }

      /* ----- routines ----- */
      case 'routine.add': {
        const r = M.newRoutine(Object.assign({}, op.routine, { now: stamp }));
        next.routines.push(r);
        return r.id;
      }
      case 'routine.update': {
        const idx = next.routines.findIndex((r) => r.id === op.id);
        const merged = Object.assign({}, next.routines[idx], op.patch || {});
        next.routines[idx] = M.newRoutine(Object.assign({}, merged, { id: op.id, now: next.routines[idx].createdAt }));
        return op.id;
      }
      case 'routine.delete': {
        next.routines = next.routines.filter((r) => r.id !== op.id);
        return op.id;
      }
      case 'routine.check': {
        const key = op.date || today;
        const day = dayOf(next, key);
        const set = new Set(day.routineChecks[op.routineId] || []);
        if (op.done) set.add(op.stepId); else set.delete(op.stepId);
        day.routineChecks = Object.assign({}, day.routineChecks, { [op.routineId]: Array.from(set) });
        if (op.done) pushLog(next, logEntry('routine', now, { id: op.routineId, s: op.stepId }));
        return op.routineId;
      }
      case 'routine.skip': {
        const key = op.date || today;
        const day = dayOf(next, key);
        const set = new Set(day.routineSkips[op.routineId] || []);
        if (op.skip === false) set.delete(op.stepId); else set.add(op.stepId);
        day.routineSkips = Object.assign({}, day.routineSkips, { [op.routineId]: Array.from(set) });
        return op.routineId;
      }
      case 'routine.variant': {
        const day = dayOf(next, op.date || today);
        day.routineVariant = Object.assign({}, day.routineVariant, { [op.routineId]: op.variant === 'short' ? 'short' : 'full' });
        return op.routineId;
      }

      /* ----- projects ----- */
      case 'project.add': {
        const p = M.newProject(Object.assign({}, op.project, { now: stamp }));
        next.projects.push(p);
        return p.id;
      }
      case 'project.update': {
        const p = M.projectById(next, op.id);
        const patch = op.patch || {};
        if (patch.title !== undefined) p.title = String(patch.title).trim().slice(0, 80) || p.title;
        if (patch.outcome !== undefined) p.outcome = String(patch.outcome).trim().slice(0, 200);
        if (patch.status && ['active', 'paused', 'done'].includes(patch.status)) {
          p.status = patch.status;
          p.doneAt = patch.status === 'done' ? stamp : '';
        }
        p.updatedAt = stamp;
        return p.id;
      }
      case 'project.delete': {
        next.projects = next.projects.filter((p) => p.id !== op.id);
        for (const it of next.items) if (it.projectId === op.id) it.projectId = '';
        return op.id;
      }

      /* ----- day ----- */
      case 'day.pulse': {
        const day = dayOf(next, op.date || today);
        const pulse = { at: stamp };
        for (const k of ['energy', 'mood', 'stress', 'sleep']) {
          const v = Math.round(Number(op[k]));
          if (v >= 1 && v <= 5) pulse[k] = v;
        }
        if (op.note) pulse.note = String(op.note).slice(0, 280);
        day.pulses = [...(day.pulses || []), pulse].slice(-12);
        pushLog(next, logEntry('pulse', now, { e: pulse.energy, mo: pulse.mood, s: pulse.stress }));
        return null;
      }
      case 'day.mode': {
        const day = dayOf(next, op.date || today);
        day.mode = M.MODES.includes(op.mode) ? op.mode : '';
        if (day.mode !== 'chaos') day.chaos = null;
        // The user decided about today's mode: don't suggest one again today.
        day.dismissed = U.uniq([...(day.dismissed || []), 'mode:low', 'mode:chaos']);
        pushLog(next, logEntry('mode', now, { mode: day.mode || 'auto' }));
        return null;
      }
      case 'day.focus': {
        const day = dayOf(next, op.date || today);
        day.focus = op.itemId ? { itemId: op.itemId, startedAt: stamp } : null;
        if (op.itemId) pushLog(next, logEntry('focus', now, { id: op.itemId }));
        return null;
      }
      case 'day.decline': {
        const day = dayOf(next, op.date || today);
        day.declined = U.uniq([...(day.declined || []), op.itemId]);
        pushLog(next, logEntry('decline', now, { id: op.itemId }));
        return null;
      }
      case 'day.undecline': {
        const day = dayOf(next, op.date || today);
        day.declined = (day.declined || []).filter((id) => id !== op.itemId);
        return null;
      }
      case 'day.quiet': {
        const day = dayOf(next, op.date || today);
        day.quietUntil = Number.isFinite(op.until) ? op.until : null;
        return null;
      }
      case 'day.evening': {
        const day = dayOf(next, op.date || today);
        day.evening = op.done !== false;
        return null;
      }
      case 'day.planned': {
        const day = dayOf(next, op.date || today);
        day.planned = { picked: (op.picked || []).slice(0, 20) };
        return null;
      }
      case 'day.chaos': {
        const day = dayOf(next, op.date || today);
        day.chaos = Array.isArray(op.queue) ? { queue: op.queue.slice(0, 60), startedAt: stamp } : null;
        if (op.queue) day.mode = 'chaos';
        else if (day.mode === 'chaos') day.mode = '';
        return null;
      }
      case 'day.dismiss': {
        const day = dayOf(next, op.date || today);
        day.dismissed = U.uniq([...(day.dismissed || []), String(op.key)]);
        return null;
      }
      case 'day.intention': {
        const day = dayOf(next, op.date || today);
        day.intention = String(op.text || '').slice(0, 200);
        return null;
      }

      /* ----- prefs, people ----- */
      case 'prefs.set': {
        const patch = op.patch || {};
        const p = next.prefs;
        for (const [k, v] of Object.entries(patch)) {
          if (k === 'modules' || k === 'ai') p[k] = Object.assign({}, p[k], v);
          else if (Object.prototype.hasOwnProperty.call(M.defaultPrefs(), k)) p[k] = v;
        }
        return null;
      }
      case 'person.add': {
        next.people.push(M.newPerson({ name: op.name, relation: op.relation }));
        return null;
      }
      case 'person.remove': {
        next.people = next.people.filter((p) => p.id !== op.id);
        return null;
      }

      /* ----- cycle (optional module) ----- */
      case 'cycle.log': {
        const entries = next.cycle.entries.filter((e) => e.date !== op.date);
        const entry = { date: op.date };
        if (op.period !== undefined) entry.period = !!op.period;
        if (op.flow != null) entry.flow = U.clamp(Math.round(Number(op.flow)), 0, 3);
        if (Array.isArray(op.symptoms)) entry.symptoms = op.symptoms.map((s) => String(s).slice(0, 30)).slice(0, 12);
        if (op.note) entry.note = String(op.note).slice(0, 280);
        const old = next.cycle.entries.find((e) => e.date === op.date);
        const merged = Object.assign({}, old || {}, entry);
        entries.push(merged);
        entries.sort((a, b) => a.date.localeCompare(b.date));
        next.cycle.entries = entries;
        return null;
      }
      case 'cycle.delete': {
        next.cycle.entries = next.cycle.entries.filter((e) => e.date !== op.date);
        return null;
      }
      case 'cycle.clear': {
        next.cycle = { entries: [] };
        return null;
      }

      /* ----- journal (optional reflection module) ----- */
      case 'journal.add': {
        const e = op.entry;
        next.journal.push({
          id: U.makeId('jr'), date: U.isDateKey(e.date) ? e.date : today,
          kind: ['reflection', 'evening', 'ritual', 'note'].includes(e.kind) ? e.kind : 'reflection',
          prompt: String(e.prompt || '').slice(0, 200), text: String(e.text).slice(0, 2000), createdAt: stamp,
        });
        return null;
      }
      case 'journal.delete': {
        next.journal = next.journal.filter((j) => j.id !== op.id);
        return null;
      }

      /* ----- meta ----- */
      case 'pattern.dismiss': {
        next.meta.dismissedPatterns = U.uniq([...(next.meta.dismissedPatterns || []), String(op.key)]).slice(-200);
        return null;
      }
      case 'meta.review': {
        next.meta.lastReviewWeek = U.isDateKey(op.week) ? op.week : U.startOfWeek(today);
        return null;
      }
      default:
        throw new Error(`unknown op ${op.op}`);
    }
  }

  /**
   * Apply ops to a COPY of state.
   * @returns {{state, applied: string[], skipped: string[], ids: string[]}}
   */
  function applyOps(state, ops, now) {
    const at = now || new Date();
    const today = U.dateKey(at);
    const stamp = at.toISOString();
    const next = U.clone(state);
    const applied = [], skipped = [], ids = [];
    for (const op of ops || []) {
      if (!op || typeof op.op !== 'string' || !isApplicable(next, op)) {
        skipped.push(op && op.op ? describe(state, op, at) : I.t('op.unknown'));
        continue;
      }
      const text = describe(next, op, at);
      try {
        const id = applyOne(next, op, at, today, stamp);
        applied.push(text);
        if (id) ids.push(id);
      } catch (e) {
        skipped.push(I.t('op.unknown'));
      }
    }
    next.meta.updatedAt = stamp;
    if (!next.meta.createdAt) next.meta.createdAt = stamp;
    return { state: next, applied, skipped, ids };
  }

  A.apply = { applyOps, describe, isApplicable, resolveWhen, whenLabel, ITEM_FIELDS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
