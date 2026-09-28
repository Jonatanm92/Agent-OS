/* Aura — UI kernel.
 *
 * Views, sheets and actions register here; this file owns rendering,
 * navigation, drafts, toasts with undo and in-page confirmation (the viewer
 * blocks the browser's own confirm()). Mobile first: large touch targets,
 * few choices per screen, one obvious next thing.
 */
(function (root) {
  const A = root.Aura;
  const U = A.util, I = A.i18n, M = A.model, S = A.store, icon = A.icon;
  const doc = root.document;

  const views = {};
  const sheets = {};
  const actions = {};

  const ui = {
    view: 'home', params: {}, history: [],
    drafts: {}, sheet: null, toast: null, confirm: null,
    now: new Date(), open: {}, busy: {},
  };

  const $app = doc.getElementById('app');
  const $dock = doc.getElementById('dock');
  const $sheet = doc.getElementById('sheet');
  const $toast = doc.getElementById('toast');

  /* ---------------- helpers ---------------- */

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const t = I.t;

  function today() { return U.dateKey(ui.now); }
  function nowMin() { return U.minutesOfDay(ui.now); }

  function approx(min) { return `~${I.duration(min)}`; }

  /** Short human line under an item: "~20 min · due today · for Alva · every 2 weeks". */
  function itemMeta(item, opts) {
    const key = today();
    const bits = [];
    const o = opts || {};
    if (item.kind !== 'note' && item.kind !== 'idea' && item.kind !== 'shopping' && !o.noTime) bits.push(approx(item.background ? Math.min(5, item.minutes) : item.minutes));
    if (item.time && item.kind === 'reminder') bits.push(item.time);
    if (item.dueDate) {
      if (item.dueDate < key) bits.push(t('meta.overdue', { when: I.relativeDay(item.dueDate, key) }));
      else if (item.dueDate === key) bits.push(t('meta.dueToday'));
      else bits.push(t('meta.due', { when: I.relativeDay(item.dueDate, key) }));
    }
    if (item.date && item.date > key && !o.noDate) bits.push(I.relativeDay(item.date, key));
    if (item.date && item.date < key && A.items.isCarried(item, key)) bits.push(t('meta.carried'));
    if (item.forPerson) bits.push(t('meta.for', { name: item.forPerson }));
    if (item.recur) bits.push(A.items.describeRecur(item.recur));
    if (item.background) bits.push(t('meta.background'));
    if (item.kind === 'admin' && item.adminStatus === 'waiting') bits.push(item.waitingOn ? t('meta.waitingOn', { who: item.waitingOn }) : t('admin.waiting'));
    if (item.projectId && !o.noProject) { const p = M.projectById(S.state, item.projectId); if (p) bits.push(p.title); }
    return bits.join(' · ');
  }

  function kindTag(kind) {
    return `<span class="tag k-${esc(kind)}">${esc(t(`kind.${kind}`))}</span>`;
  }

  /** The standard row for an item: tick, title + meta (opens the item), optional trailing controls. */
  function itemRow(item, opts) {
    const o = opts || {};
    const done = item.status === 'done' || (item.recur && item.lastDone === today());
    const tick = o.noTick ? '' : `<button class="tick${done ? ' done' : ''}" data-action="${done ? 'item-reopen' : 'item-done'}" data-id="${esc(item.id)}" aria-label="${esc(t(done ? 'a.reopenX' : 'a.doneX', { title: item.title }))}"></button>`;
    const meta = o.meta != null ? o.meta : itemMeta(item, o);
    return `<div class="row item${done ? ' is-done' : ''}" data-row="${esc(item.id)}">
      ${tick}
      <button class="row-main" data-action="item-open" data-id="${esc(item.id)}">
        <span class="title">${o.showKind || (!o.noKindTag && ['shopping', 'reminder'].includes(item.kind)) ? `${kindTag(item.kind)} ` : ''}${esc(item.title)}</span>
        ${meta ? `<span class="sub">${esc(meta)}</span>` : ''}
      </button>
      ${o.trailing || ''}
    </div>`;
  }

  function emptyLine(text) { return `<div class="row empty-row"><p class="muted">${esc(text)}</p></div>`; }

  function sectionHead(title, extra) {
    return `<div class="section-head"><h2>${esc(title)}</h2>${extra || ''}</div>`;
  }

  function backHeader(title, eyebrow, extra) {
    return `<header class="top sub-top">
      <button class="icon-btn" data-action="back" aria-label="${esc(t('a.back'))}">${icon('back', 22)}</button>
      <div class="grow">${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}<h1>${esc(title)}</h1></div>
      ${extra || ''}
    </header>`;
  }

  /** The day band: wake → sleep, fixed blocks, a live now-marker. */
  function dayBand(state, plan) {
    const start = plan.wake;
    const end = Math.max(start + 60, plan.sleep);
    const span = end - start;
    const pct = (m) => Math.max(0, Math.min(100, ((m - start) / span) * 100));
    const blocks = plan.fixed.map((f) => {
      const left = pct(f.start), width = Math.max(1.6, pct(f.end) - left);
      const label = width >= 14 ? `<span>${esc(f.title)}</span>` : '';
      return `<div class="band-block k-${esc(f.kind)}" style="left:${left}%;width:${width}%" title="${esc(`${U.toClock(f.start)} ${f.title}`)}">${label}</div>`;
    }).join('');
    const nowPct = pct(plan.nowMin);
    const inDay = plan.nowMin >= start && plan.nowMin <= end;
    const labels = plan.fixed.map((f) => `${U.toClock(f.start)}–${U.toClock(f.end)} ${f.title}`).join(', ');
    return `<div class="band" role="img" aria-label="${esc(t('band.aria', { from: state.prefs.wake, to: state.prefs.sleep }))}${labels ? `: ${esc(labels)}` : ''}">
      <div class="band-track">${blocks}<div class="band-past" style="width:${nowPct}%"></div>${inDay ? `<div class="band-now" style="left:${nowPct}%"></div>` : ''}</div>
      <div class="band-scale mono"><span>${esc(U.toClock(start))}</span><span>${esc(U.toClock(start + span / 2))}</span><span>${esc(U.toClock(end))}</span></div>
    </div>`;
  }

  function chips(list, current, action, extra) {
    return `<div class="chips" role="group">${list.map((c) => `<button class="chip${String(current) === String(c.v) ? ' on' : ''}" data-action="${action}" data-value="${esc(c.v)}"${extra ? ` ${extra}` : ''} aria-pressed="${String(current) === String(c.v)}">${c.icon ? icon(c.icon, 15) : ''}${esc(c.t)}</button>`).join('')}</div>`;
  }

  function draft(key, fallback) { return Object.prototype.hasOwnProperty.call(ui.drafts, key) ? ui.drafts[key] : (fallback == null ? '' : fallback); }
  function setDraft(key, value) { ui.drafts[key] = value; }
  function clearDraft(key) { delete ui.drafts[key]; }

  /* ---------------- registration ---------------- */

  function view(name, def) { views[name] = def; }
  function sheet(name, def) { sheets[name] = def; }
  function action(name, fn) { actions[name] = fn; }

  /* ---------------- navigation ---------------- */

  const TABS = [
    { id: 'home', label: 'tab.now', icon: 'now' },
    { id: 'day', label: 'tab.day', icon: 'day' },
    { id: 'capture', label: 'tab.capture', icon: 'plus', fab: true },
    { id: 'aura', label: 'tab.aura', icon: 'aura' },
    { id: 'life', label: 'tab.life', icon: 'life' },
  ];

  function go(name, params, opts) {
    const o = opts || {};
    if (!views[name]) name = 'home';
    const isTab = TABS.some((tb) => tb.id === name);
    if (!o.replace && ui.view !== name) ui.history.push({ view: ui.view, params: ui.params });
    if (isTab && !o.keepHistory) ui.history = [];
    if (ui.history.length > 30) ui.history.shift();
    ui.view = name;
    ui.params = params || {};
    ui.sheet = null;
    try { if (!o.fromHash && root.location.hash !== `#${name}`) root.history.pushState(null, '', `#${name}`); } catch (e) { /* framed: navigation still works in-page */ }
    if (views[name].enter) views[name].enter(ui.params);
    render({ scrollTop: true, animate: true });
  }

  function back() {
    const prev = ui.history.pop();
    if (prev) {
      ui.view = prev.view; ui.params = prev.params || {};
      ui.sheet = null;
      try { root.history.replaceState(null, '', `#${prev.view}`); } catch (e) { /* ignore */ }
      render({ scrollTop: true, animate: true });
    } else {
      go(views[ui.view] && views[ui.view].tab && views[ui.view].tab !== ui.view ? views[ui.view].tab : 'home', {}, { replace: true });
    }
  }

  /* ---------------- sheets ---------------- */

  function openSheet(name, data) {
    if (!sheets[name]) return;
    ui.sheet = { name, data: data || {} };
    renderSheet(true);
  }

  function closeSheet() {
    const s = ui.sheet;
    ui.sheet = null;
    if (s && sheets[s.name] && sheets[s.name].onClose) sheets[s.name].onClose(s.data);
    renderSheet();
    render();
  }

  function renderSheet(fresh) {
    if (ui.confirm) { renderConfirm(); return; }
    doc.body.classList.toggle('sheet-open', !!ui.sheet);
    if (!ui.sheet) { $sheet.innerHTML = ''; return; }
    const def = sheets[ui.sheet.name];
    const spec = def.render(ui.sheet.data, S.state);
    if (!spec) { ui.sheet = null; $sheet.innerHTML = ''; return; }
    const keep = focusSnapshot($sheet);
    const scroller = $sheet.querySelector('.sheet');
    const scrollTop = scroller && !fresh ? scroller.scrollTop : 0;
    $sheet.innerHTML = `<div class="scrim" data-action="sheet-scrim">
      <div class="sheet${spec.tall ? ' tall' : ''}${fresh ? ' rise' : ''}" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div class="grab" aria-hidden="true"></div>
        <div class="sheet-head"><h2 id="sheet-title">${esc(spec.title)}</h2>
          <button class="icon-btn" data-action="sheet-close" aria-label="${esc(t('a.close'))}">${icon('close', 20)}</button></div>
        ${spec.lead ? `<p class="lead">${esc(spec.lead)}</p>` : ''}
        ${spec.body}
      </div></div>`;
    const sc = $sheet.querySelector('.sheet');
    if (sc && scrollTop) sc.scrollTop = scrollTop;
    if (!restoreFocus(keep)) {
      const first = $sheet.querySelector('[data-autofocus]');
      if (fresh && first) setTimeout(() => first.focus({ preventScroll: true }), 60);
      else if (fresh) { const btn = $sheet.querySelector('.sheet-head .icon-btn'); if (btn) btn.focus({ preventScroll: true }); }
    }
  }

  /** In-page confirmation. Resolves true/false. */
  function confirmAsk(opts) {
    return new Promise((resolve) => {
      ui.confirm = Object.assign({ resolve }, opts);
      renderConfirm();
    });
  }

  function renderConfirm() {
    const c = ui.confirm;
    doc.body.classList.add('sheet-open');
    $sheet.innerHTML = `<div class="scrim" data-action="confirm-no"><div class="sheet confirm rise" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
      <h2 id="confirm-title">${esc(c.title)}</h2>
      ${c.body ? `<p class="lead">${esc(c.body)}</p>` : ''}
      <div class="btnrow">
        <button class="btn ${c.danger ? 'danger-solid' : 'primary'}" data-action="confirm-yes">${esc(c.yes || t('a.confirm'))}</button>
        <button class="btn ghost" data-action="confirm-no" data-hard="1">${esc(c.no || t('a.cancel'))}</button>
      </div></div></div>`;
    const b = $sheet.querySelector('[data-action="confirm-no"][data-hard]');
    if (b) b.focus({ preventScroll: true });
  }

  function endConfirm(value) {
    const c = ui.confirm;
    ui.confirm = null;
    renderSheet();
    if (c) c.resolve(value);
  }

  /* ---------------- toasts ---------------- */

  function toast(message, opts) {
    const o = opts || {};
    ui.toast = { message, undo: !!o.undo, id: U.makeId('to') };
    renderToast();
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { ui.toast = null; renderToast(); }, o.undo ? 7000 : 3600);
  }

  function renderToast() {
    if (!ui.toast) { $toast.innerHTML = ''; return; }
    $toast.innerHTML = `<div class="toast" role="status"><span class="grow">${esc(ui.toast.message)}</span>
      ${ui.toast.undo ? `<button class="toast-btn" data-action="undo">${esc(t('a.undo'))}</button>` : ''}
      <button class="toast-x" data-action="toast-close" aria-label="${esc(t('a.close'))}">${icon('close', 16)}</button></div>`;
  }

  /* ---------------- changing state ---------------- */

  /** Commit ops with an undoable toast. Returns the result. */
  function commit(ops, opts) {
    const o = opts || {};
    const result = S.commit(ops, { now: new Date(), system: o.system });
    if (result.applied.length && !o.silent) {
      const msg = o.message || (result.applied.length === 1 ? result.applied[0] : t('toast.changes', { n: result.applied.length }));
      toast(msg, { undo: !o.system && o.undo !== false });
    } else if (!result.applied.length && result.skipped.length && !o.silent) {
      toast(t('toast.nothing'));
    }
    return result;
  }

  /* ---------------- rendering ---------------- */

  function focusSnapshot(scope) {
    const a = doc.activeElement;
    if (!a || !a.id || !scope.contains(a)) return null;
    if (!/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return { id: a.id };
    let start = null, end = null;
    try { start = a.selectionStart; end = a.selectionEnd; } catch (e) { /* number/date inputs */ }
    return { id: a.id, start, end };
  }

  function restoreFocus(keep) {
    if (!keep) return false;
    const el = doc.getElementById(keep.id);
    if (!el) return false;
    el.focus({ preventScroll: true });
    if (keep.start != null) { try { el.setSelectionRange(keep.start, keep.end); } catch (e) { /* not a text field */ } }
    return true;
  }

  let rendering = false;
  function render(opts) {
    const o = opts || {};
    const state = S.state;
    if (!state || rendering) return;
    rendering = true;
    try {
      ui.now = new Date();
      I.setLanguage(state.prefs.language || I.guessLanguage(root.navigator && root.navigator.language));
      U.setTimeZone(state.prefs.timeZone);
      doc.documentElement.lang = I.language();

      let name = ui.view;
      if (!state.prefs.onboarded && name !== 'onboarding' && S.ready) name = ui.view = 'onboarding';
      const def = views[name] || views.home;
      const keep = focusSnapshot($app);
      let html;
      try {
        html = def.render(state, ui.params);
      } catch (e) {
        // A broken view must never blank the app: show a way back instead.
        html = `<div class="calm-card pad-top"><h2>${esc(t('err.viewTitle'))}</h2><p class="lead">${esc(t('err.viewBody'))}</p>
          <div class="btnrow"><button class="btn primary" data-action="go" data-view="home">${esc(t('err.home'))}</button></div></div>`;
      }
      $app.innerHTML = html;
      $app.dataset.view = name;
      if (o.animate) { $app.classList.remove('enter'); void $app.offsetWidth; $app.classList.add('enter'); }
      if (o.scrollTop) root.scrollTo(0, 0);
      restoreFocus(keep);

      const tab = def.tab || name;
      const hideDock = typeof def.noDock === 'function' ? def.noDock() : def.noDock;
      $dock.hidden = !!hideDock;
      doc.body.classList.toggle('no-dock', !!hideDock);
      $dock.innerHTML = hideDock ? '' : `<nav class="nav" aria-label="${esc(t('nav.aria'))}">${TABS.map((tb) => tb.fab
        ? `<button class="fab" data-action="go" data-view="capture" aria-label="${esc(t('tab.captureLong'))}">${icon('plus', 26)}</button>`
        : `<button class="${tab === tb.id ? 'on' : ''}" data-action="go" data-view="${tb.id}" aria-current="${tab === tb.id ? 'page' : 'false'}">${icon(tb.icon, 22)}<span>${esc(t(tb.label))}</span></button>`).join('')}</nav>`;
      renderSheet();
      renderToast();
    } finally {
      rendering = false;
    }
  }

  /* ---------------- events ---------------- */

  doc.addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const name = el.dataset.action;
    const fn = actions[name];
    if (!fn) return;
    if (el.tagName === 'A' && !el.getAttribute('href')) event.preventDefault();
    if (el.tagName === 'BUTTON' || el.tagName === 'A') event.preventDefault();
    let result;
    try { result = fn(el, event); } catch (e) {
      toast(t('toast.error'));
      result = true;
    }
    if (result && typeof result.then === 'function') { result.then((r) => { if (!r) render(); }).catch(() => { toast(t('toast.error')); render(); }); return; }
    if (!result) render();
  });

  doc.addEventListener('input', (event) => {
    const el = event.target;
    if (el.dataset && el.dataset.model) {
      ui.drafts[el.dataset.model] = el.type === 'checkbox' ? el.checked : el.value;
      if (el.dataset.live) render();
    }
  });

  doc.addEventListener('change', (event) => {
    const el = event.target;
    if (el.dataset && el.dataset.model) ui.drafts[el.dataset.model] = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset && el.dataset.change && actions[el.dataset.change]) {
      const r = actions[el.dataset.change](el, event);
      if (!r) render();
    }
  });

  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (ui.confirm) { endConfirm(false); return; }
      if (ui.sheet) { closeSheet(); return; }
    }
    const el = event.target;
    if (event.key === 'Enter' && el.dataset && el.dataset.enter && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      ui.drafts[el.dataset.model] = el.value;
      const fn = actions[el.dataset.enter];
      if (fn) {
        const r = fn(el, event);
        if (r && typeof r.then === 'function') r.then((x) => { if (!x) render(); });
        else if (!r) render();
      }
    }
  });

  root.addEventListener('popstate', () => {
    const name = (root.location.hash || '').replace('#', '');
    if (ui.sheet) { ui.sheet = null; renderSheet(); }
    if (name && views[name] && name !== ui.view) {
      const prev = ui.history.length ? ui.history[ui.history.length - 1] : null;
      if (prev && prev.view === name) { ui.history.pop(); ui.view = name; ui.params = prev.params || {}; render({ scrollTop: true, animate: true }); }
      else go(name, {}, { fromHash: true, replace: true });
    } else if (!name && ui.view !== 'home') {
      go('home', {}, { fromHash: true, replace: true });
    }
  });

  /* ---------------- built-in actions ---------------- */

  action('go', (el) => { go(el.dataset.view, el.dataset.id ? { id: el.dataset.id } : {}); return true; });
  action('back', () => { back(); return true; });
  action('sheet-close', () => { closeSheet(); return true; });
  action('sheet-scrim', (el, ev) => { if (ev.target === el) closeSheet(); return true; });
  action('confirm-yes', () => { endConfirm(true); return true; });
  action('confirm-no', (el, ev) => { if (ev.target === el || el.dataset.hard) endConfirm(false); return true; });
  action('toast-close', () => { ui.toast = null; renderToast(); return true; });
  action('undo', () => { if (S.undo()) toast(t('toast.undone')); ui.toast = null; return false; });
  action('toggle', (el) => { ui.open[el.dataset.key] = !ui.open[el.dataset.key]; });
  action('sheet', (el) => { openSheet(el.dataset.sheet, Object.assign({}, el.dataset)); return true; });

  A.ui = {
    ui, views, sheets, actions, view, sheet, action, go, back, render, renderSheet, openSheet, closeSheet,
    toast, commit, confirm: confirmAsk, esc, t, today, nowMin, approx, itemMeta, itemRow, kindTag, emptyLine,
    sectionHead, backHeader, dayBand, chips, draft, setDraft, clearDraft, TABS,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
