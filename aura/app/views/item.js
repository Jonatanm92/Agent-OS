/* Aura — the item sheet: everything about one thing, changed in place, every change undoable. */
(function (root) {
  const A = root.Aura;
  const U = A.util, I = A.i18n, M = A.model, It = A.items, S = A.store, icon = A.icon;
  const UI = A.ui;
  const { esc, t } = UI;

  const KIND_CHOICES = ['task', 'shopping', 'admin', 'chore', 'reminder', 'note', 'idea'];

  function actionable(item) { return ['task', 'admin', 'chore', 'reminder', 'shopping'].includes(item.kind); }

  function field(label, inner, forId) {
    return `<div class="field">${forId ? `<label class="label" for="${forId}">${esc(label)}</label>` : `<div class="label">${esc(label)}</div>`}${inner}</div>`;
  }

  function mini(list, current, actionName, id, extra) {
    return `<div class="chips">${list.map((c) => `<button class="chip${String(current) === String(c.v) ? ' on' : ''}" data-action="${actionName}" data-id="${esc(id)}" data-value="${esc(c.v)}" aria-pressed="${String(current) === String(c.v)}"${extra || ''}>${esc(c.t)}</button>`).join('')}</div>`;
  }

  function repeatValue(r) {
    if (!r) return 'none';
    if (r.unit === 'day' && r.every === 1) return 'day';
    if (r.unit === 'week' && r.every === 1) return 'week';
    if (r.unit === 'week' && r.every === 2) return '2week';
    if (r.unit === 'month' && r.every === 1) return 'month';
    return 'custom';
  }

  UI.sheet('item', {
    render(data, state) {
      const item = M.itemById(state, data.id);
      if (!item) return { title: t('item.gone'), body: `<button class="btn wide" data-action="sheet-close">${esc(t('a.close'))}</button>` };
      const key = UI.today();
      const id = item.id;
      const bucket = It.classify(state, item, key);
      const titleKey = `item.title:${id}`;
      const noteKey = `item.note:${id}`;
      const parts = [];

      parts.push(`<div class="field"><label class="label" for="it-title">${esc(t('item.title'))}</label>
        <input id="it-title" class="input big" data-model="${titleKey}" data-enter="item-save-text" data-id="${esc(id)}" value="${esc(UI.draft(titleKey, item.title))}" maxlength="140"></div>`);

      if (item.status === 'inbox') {
        parts.push(field(t('item.processLead'), mini(KIND_CHOICES.map((k) => ({ v: k, t: t(`kind.${k}`) })), '', 'item-process', id)));
      } else {
        parts.push(field(t('item.kind'), mini(KIND_CHOICES.map((k) => ({ v: k, t: t(`kind.${k}`) })), item.kind, 'item-kind', id)));
      }

      if (actionable(item) && item.status !== 'inbox') {
        const b = ['must', 'good', 'later'].includes(bucket) ? bucket : '';
        if (item.kind !== 'shopping') parts.push(field(t('item.bucket'), mini(['must', 'good', 'later'].map((v) => ({ v, t: t(`bucket.${v}`) })), b, 'item-bucket', id)));
        const whenVal = item.date === key ? 'today' : item.date === U.addDays(key, 1) ? 'tomorrow' : item.date ? 'date' : 'none';
        parts.push(field(t('item.when'), `${mini([
          { v: 'today', t: t('when.today') }, { v: 'tomorrow', t: t('when.tomorrow') },
          { v: 'weekend', t: t('when.weekend') }, { v: 'nextweek', t: t('when.nextWeek') }, { v: 'none', t: t('item.noDue') },
        ], whenVal, 'item-when', id)}
          <input id="it-date" class="input date" type="date" value="${esc(item.date)}" data-change="item-date" data-id="${esc(id)}" aria-label="${esc(t('item.pickDate'))}">`));
        parts.push(field(t('item.due'), `<div class="inline"><input id="it-due" class="input date" type="date" value="${esc(item.dueDate)}" data-change="item-due" data-id="${esc(id)}">
          ${item.dueDate ? `<button class="btn tiny quiet" data-action="item-due-clear" data-id="${esc(id)}">${esc(t('item.noDue'))}</button>` : ''}</div>`, 'it-due'));
        if (item.kind !== 'shopping') {
          parts.push(field(t('item.duration'), mini([5, 15, 30, 60, 90].map((m) => ({ v: m, t: I.duration(m) })), item.minutes, 'item-minutes', id)));
          parts.push(field(t('item.energy'), mini(['light', 'medium', 'heavy'].map((v) => ({ v, t: t(`item.energy.${v}`) })), item.energy, 'item-energy', id)));
          parts.push(`<button class="toggle${item.background ? ' on' : ''}" data-action="item-bg" data-id="${esc(id)}" aria-pressed="${item.background}"><span class="knob"></span>${esc(t('item.background'))}</button>`);
          parts.push(field(t('item.repeat'), mini(['none', 'day', 'week', '2week', 'month'].map((v) => ({ v, t: t(`item.repeat.${v}`) })), repeatValue(item.recur), 'item-repeat', id)));
        }
      }

      if (item.kind === 'admin' && item.status === 'open') {
        parts.push(field(t('item.admin'), mini(M.ADMIN_STATUSES.map((v) => ({ v, t: t(`admin.${v}`) })), item.adminStatus, 'item-admin', id)));
        if (item.adminStatus !== 'action') {
          parts.push(`<div class="grid2">
            <div class="field"><label class="label" for="it-wait">${esc(t('item.waitingOn'))}</label>
              <input id="it-wait" class="input" data-model="item.wait:${id}" value="${esc(UI.draft(`item.wait:${id}`, item.waitingOn))}" data-change="item-wait" data-id="${esc(id)}" maxlength="80"></div>
            <div class="field"><label class="label" for="it-fu">${esc(t('item.followUp'))}</label>
              <input id="it-fu" class="input date" type="date" value="${esc(item.followUp)}" data-change="item-followup" data-id="${esc(id)}"></div></div>`);
        }
      }

      if (item.kind === 'shopping') {
        parts.push(field(t('shop.category'), `<select id="it-cat" class="input" data-change="item-cat" data-id="${esc(id)}">${M.SHOP_CATEGORIES.map((c) => `<option value="${c}"${item.category === c ? ' selected' : ''}>${esc(t(`shop.cat.${c}`))}</option>`).join('')}</select>`, 'it-cat'));
        parts.push(`<button class="toggle${item.staple ? ' on' : ''}" data-action="item-staple" data-id="${esc(id)}" aria-pressed="${item.staple}"><span class="knob"></span>${esc(t('item.staple'))}</button>`);
      }

      const people = state.people || [];
      if (people.length && item.kind !== 'note' && item.kind !== 'idea') {
        parts.push(field(t('item.person'), mini([{ v: '', t: '—' }, ...people.map((p) => ({ v: p.name, t: p.name }))], item.forPerson, 'item-person', id)));
      }

      const projects = state.projects.filter((p) => p.status !== 'done');
      if (projects.length && actionable(item) && item.kind !== 'shopping') {
        parts.push(field(t('item.project'), `<select id="it-proj" class="input" data-change="item-project" data-id="${esc(id)}">
          <option value="">${esc(t('item.noProject'))}</option>
          ${projects.map((p) => `<option value="${esc(p.id)}"${item.projectId === p.id ? ' selected' : ''}>${esc(p.title)}</option>`).join('')}</select>`, 'it-proj'));
      }

      parts.push(`<div class="field"><label class="label" for="it-note">${esc(t('item.note'))}</label>
        <textarea id="it-note" class="input" rows="2" data-model="${noteKey}" maxlength="600">${esc(UI.draft(noteKey, item.note))}</textarea></div>`);

      /* actions */
      const done = item.status === 'done' || (item.recur && item.lastDone === key);
      const row1 = [];
      if (actionable(item) && item.status !== 'inbox') {
        row1.push(done
          ? `<button class="btn ghost" data-action="item-reopen-sheet" data-id="${esc(id)}">${esc(t('item.reopenBtn'))}</button>`
          : `<button class="btn primary" data-action="item-done-sheet" data-id="${esc(id)}">${icon('check', 18)}${esc(t('item.doneBtn'))}</button>`);
        if (!done && item.kind !== 'shopping') row1.push(`<button class="btn ghost" data-action="item-focus" data-id="${esc(id)}">${esc(t('item.focus'))}</button>`);
      }
      parts.push(`<div class="btnrow">${row1.join('')}</div>`);

      if (actionable(item) && item.kind !== 'shopping' && !done && item.status === 'open') {
        const open = data.split;
        parts.push(open ? `<div class="subpanel"><label class="label" for="it-split">${esc(t('item.smallerLead'))}</label>
            <input id="it-split" class="input" data-model="item.split:${id}" data-enter="item-split" data-id="${esc(id)}" placeholder="${esc(t('item.smallerPh'))}" value="${esc(UI.draft(`item.split:${id}`))}" data-autofocus>
            <button class="btn primary wide" data-action="item-split" data-id="${esc(id)}">${esc(t('item.smallerGo'))}</button></div>`
          : `<button class="btn ghost wide" data-action="item-split-open" data-id="${esc(id)}">${icon('leaf', 17)}${esc(t('item.smaller'))}</button>`);
      }

      if (['must', 'good'].includes(bucket)) {
        parts.push(`<div class="btnrow"><button class="btn quiet small" data-action="item-move" data-dir="-1" data-id="${esc(id)}">${icon('up', 16)}${esc(t('item.moveUp'))}</button>
          <button class="btn quiet small" data-action="item-move" data-dir="1" data-id="${esc(id)}">${icon('down', 16)}${esc(t('item.moveDown'))}</button></div>`);
      }

      parts.push(`<div class="btnrow danger-row">
        ${item.recur && item.status === 'open' ? `<button class="btn quiet small" data-action="item-skip" data-id="${esc(id)}">${esc(t('item.skip'))}</button>` : ''}
        ${item.status === 'open' && actionable(item) ? `<button class="btn quiet small" data-action="item-drop" data-id="${esc(id)}">${esc(item.recur ? t('item.stopRepeat') : t('item.drop'))}</button>` : ''}
        <button class="btn quiet small danger" data-action="item-delete" data-id="${esc(id)}">${icon('trash', 16)}${esc(t('a.delete'))}</button></div>`);

      const created = String(item.createdAt || '').slice(0, 10);
      parts.push(`<p class="faint center">${esc(t('item.created', { when: U.isDateKey(created) ? I.relativeDay(created, key) : '' }))}${item.postponed ? ` · ${esc(t('item.postponedN', { n: item.postponed }))}` : ''}</p>`);

      return { title: t(`kind.${item.kind}`), body: `<div class="stack">${parts.join('')}</div>`, tall: true };
    },
    onClose(data) { saveText(data.id, true); },
  });

  I.add({
    'item.postponedN': ['flyttad {n} gång|flyttad {n} gånger', 'moved {n} time|moved {n} times'],
    'item.recurDone': ['Klar för den här gången — nästa gång {when}.', 'Done for this time — next due {when}.'],
    'item.skip': ['Hoppa över den här gången', 'Skip this time'],
    'item.stopRepeat': ['Sluta upprepa', 'Stop repeating'],
  });

  function saveText(id, silent) {
    const item = M.itemById(S.state, id);
    if (!item) return;
    const tk = `item.title:${id}`, nk = `item.note:${id}`;
    const patch = {};
    const title = UI.draft(tk, item.title).trim();
    const note = UI.draft(nk, item.note);
    if (title && title !== item.title) patch.title = title;
    if (note !== item.note) patch.note = note;
    UI.clearDraft(tk); UI.clearDraft(nk);
    if (Object.keys(patch).length) UI.commit([{ op: 'item.update', id, patch }], { silent });
  }

  const upd = (id, patch) => UI.commit([{ op: 'item.update', id, patch }], { silent: true });
  const rerender = () => { UI.renderSheet(); UI.render(); return true; };

  UI.action('item-open', (el) => { UI.openSheet('item', { id: el.dataset.id }); return true; });
  UI.action('item-save-text', (el) => { saveText(el.dataset.id); return rerender(); });
  UI.action('item-kind', (el) => {
    const kind = el.dataset.value;
    const patch = { kind };
    if (kind === 'admin') patch.adminStatus = 'action';
    if (kind === 'chore') { const it = M.itemById(S.state, el.dataset.id); if (it && !it.recur) patch.recur = { unit: 'week', every: 1, weekdays: [] }; patch.category = 'home'; }
    if (kind === 'shopping') { const it = M.itemById(S.state, el.dataset.id); patch.category = A.parse.productCategory(it ? it.title : '') || 'other'; }
    upd(el.dataset.id, patch);
    return rerender();
  });
  UI.action('item-process', (el) => {
    const kind = el.dataset.value;
    const it = M.itemById(S.state, el.dataset.id);
    const patch = { kind };
    if (kind === 'shopping') patch.category = A.parse.productCategory(it ? it.title : '') || 'other';
    if (kind === 'admin') patch.adminStatus = 'action';
    UI.commit([{ op: 'item.process', id: el.dataset.id, patch }]);
    return rerender();
  });
  UI.action('item-bucket', (el) => { UI.commit([{ op: 'item.bucket', id: el.dataset.id, bucket: el.dataset.value }]); return rerender(); });
  UI.action('item-when', (el) => {
    const id = el.dataset.id, v = el.dataset.value;
    const key = UI.today();
    const item = M.itemById(S.state, id);
    if (!item) return true;
    if (v === 'none') UI.commit([{ op: 'item.schedule', id, date: '' }]);
    else if (v === 'today') UI.commit([{ op: 'item.schedule', id, date: key }]);
    else {
      const inToday = ['must', 'good'].includes(It.classify(S.state, item, key));
      UI.commit([inToday ? { op: 'item.postpone', id, to: v } : { op: 'item.schedule', id, date: A.apply.resolveWhen(v, key) }]);
    }
    return rerender();
  });
  UI.action('item-date', (el) => {
    const id = el.dataset.id, d = el.value;
    const item = M.itemById(S.state, id);
    if (!item) return true;
    const inToday = ['must', 'good'].includes(It.classify(S.state, item, UI.today()));
    UI.commit([inToday && d > UI.today() ? { op: 'item.postpone', id, to: d } : { op: 'item.schedule', id, date: d }]);
    return rerender();
  });
  UI.action('item-due', (el) => { upd(el.dataset.id, { dueDate: el.value }); return rerender(); });
  UI.action('item-due-clear', (el) => { upd(el.dataset.id, { dueDate: '' }); return rerender(); });
  UI.action('item-minutes', (el) => { upd(el.dataset.id, { minutes: Number(el.dataset.value) }); return rerender(); });
  UI.action('item-energy', (el) => { upd(el.dataset.id, { energy: el.dataset.value }); return rerender(); });
  UI.action('item-bg', (el) => { const it = M.itemById(S.state, el.dataset.id); if (it) upd(it.id, { background: !it.background }); return rerender(); });
  UI.action('item-staple', (el) => { const it = M.itemById(S.state, el.dataset.id); if (it) upd(it.id, { staple: !it.staple }); return rerender(); });
  UI.action('item-repeat', (el) => {
    const v = el.dataset.value;
    const map = { none: null, day: { unit: 'day', every: 1 }, week: { unit: 'week', every: 1 }, '2week': { unit: 'week', every: 2 }, month: { unit: 'month', every: 1 } };
    const it = M.itemById(S.state, el.dataset.id);
    const patch = { recur: map[v] };
    if (map[v] && it && !it.dueDate) patch.dueDate = it.date || UI.today();
    upd(el.dataset.id, patch);
    return rerender();
  });
  UI.action('item-admin', (el) => { UI.commit([{ op: 'item.admin', id: el.dataset.id, adminStatus: el.dataset.value }]); return rerender(); });
  UI.action('item-wait', (el) => { UI.commit([{ op: 'item.admin', id: el.dataset.id, adminStatus: (M.itemById(S.state, el.dataset.id) || {}).adminStatus || 'waiting', waitingOn: el.value }], { silent: true }); UI.clearDraft(`item.wait:${el.dataset.id}`); return rerender(); });
  UI.action('item-followup', (el) => { UI.commit([{ op: 'item.admin', id: el.dataset.id, adminStatus: (M.itemById(S.state, el.dataset.id) || {}).adminStatus || 'waiting', followUp: el.value }], { silent: true }); return rerender(); });
  UI.action('item-cat', (el) => { upd(el.dataset.id, { category: el.value }); return rerender(); });
  UI.action('item-person', (el) => { upd(el.dataset.id, { forPerson: el.dataset.value }); return rerender(); });
  UI.action('item-project', (el) => { upd(el.dataset.id, { projectId: el.value }); return rerender(); });
  UI.action('item-done-sheet', (el) => { saveText(el.dataset.id, true); UI.closeSheet(); UI.commit([{ op: 'item.done', id: el.dataset.id }]); return true; });
  UI.action('item-reopen-sheet', (el) => { UI.commit([{ op: 'item.reopen', id: el.dataset.id }]); return rerender(); });
  UI.action('item-focus', (el) => {
    saveText(el.dataset.id, true);
    UI.ui.sheet = null;
    UI.commit([{ op: 'day.focus', date: UI.today(), itemId: el.dataset.id }], { silent: true });
    UI.go('home');
    return true;
  });
  UI.action('item-split-open', () => { if (UI.ui.sheet) UI.ui.sheet.data.split = true; UI.renderSheet(); return true; });
  UI.action('item-split', (el) => {
    const id = el.dataset.id;
    const first = UI.draft(`item.split:${id}`).trim();
    if (!first) return true;
    UI.clearDraft(`item.split:${id}`);
    UI.closeSheet();
    UI.commit([{ op: 'item.split', id, first, minutes: 10 }]);
    return true;
  });
  UI.action('item-move', (el) => {
    const id = el.dataset.id, dir = Number(el.dataset.dir);
    const item = M.itemById(S.state, id);
    const bucket = It.classify(S.state, item, UI.today());
    const list = It.dayBuckets(S.state, UI.today())[bucket] || [];
    const ids = list.map((i) => i.id);
    const idx = ids.indexOf(id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= ids.length) return true;
    [ids[idx], ids[to]] = [ids[to], ids[idx]];
    UI.commit([{ op: 'item.reorder', ids }], { silent: true });
    return rerender();
  });
  UI.action('item-skip', (el) => { if (UI.ui.sheet) UI.closeSheet(); UI.commit([{ op: 'item.skip', id: el.dataset.id }]); return true; });
  UI.action('item-drop', (el) => { UI.closeSheet(); UI.commit([{ op: 'item.drop', id: el.dataset.id }]); return true; });
  UI.action('item-delete', (el) => { UI.closeSheet(); UI.commit([{ op: 'item.delete', id: el.dataset.id }]); return true; });

  /* tick buttons everywhere */
  UI.action('item-done', (el) => {
    const row = el.closest('.row');
    if (row) row.classList.add('leaving');
    el.classList.add('done');
    setTimeout(() => { UI.commit([{ op: 'item.done', id: el.dataset.id }]); UI.render(); }, 170);
    return true;
  });
  UI.action('item-reopen', (el) => {
    const item = M.itemById(S.state, el.dataset.id);
    if (item && item.recur) { UI.toast(t('item.recurDone', { when: I.relativeDay(item.dueDate, UI.today()) })); return true; }
    UI.commit([{ op: 'item.reopen', id: el.dataset.id }]);
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
