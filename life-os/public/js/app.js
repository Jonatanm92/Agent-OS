// Life OS app shell: routing, rendering, event delegation, the 1-second timer
// tick, server detection, installability and the service worker.

import * as C from './core.js';
import * as store from './store.js';
import { html, icon, toast, closeSheet, sheetIsOpen } from './ui.js';
import { STARTERS } from './content.js';
import * as sheets from './sheets.js';
import * as today from './views/today.js';
import * as dad from './views/dad.js';
import * as money from './views/money.js';
import * as focus from './views/focus.js';
import * as week from './views/week.js';
import * as coachView from './views/coach.js';
import * as settings from './views/settings.js';
import * as onboarding from './views/onboarding.js';
import { finishTimer, cancelTimer, pauseTimer, resumeTimer, chime, notify } from './timer.js';

const VERSION = '1.0.0';

const ROUTES = {
  idag: { view: today, title: 'Idag', icon: 'sun', nav: true },
  pappa: { view: dad, title: 'Pappa', icon: 'heart', nav: true },
  pengar: { view: money, title: 'Pengar', icon: 'coin', nav: true },
  fokus: { view: focus, title: 'Fokus', icon: 'focus', nav: true },
  vecka: { view: week, title: 'Vecka', icon: 'week', nav: true },
  coach: { view: coachView, title: 'Coach' },
  installningar: { view: settings, title: 'Inställningar' },
};

const presenceActions = {
  'presence.pause': () => pauseTimer(store),
  'presence.resume': () => resumeTimer(store),
  'presence.stop': () => {
    const r = finishTimer(store);
    if (!r) return;
    const s = store.get();
    const names = r.kidIds.map((id) => (s.kids.find((k) => k.id === id) || {}).name).filter(Boolean);
    if (r.minutes >= 1) {
      toast(`${C.formatMinutes(r.minutes)} närvaro${names.length ? ` med ${names.join(' och ')}` : ''} 💛 Spara ett minne?`, {
        actionLabel: 'Spara minne',
        ms: 9000,
        action: () => sheets.actions['sheet.memory'](makeCtx(), { dataset: { kid: r.kidIds.length === 1 ? r.kidIds[0] : '' } }),
      });
    } else {
      toast('Kortare än en minut – inget loggades.');
    }
  },
  'presence.cancel': () => {
    cancelTimer(store);
    toast('Närvaroläget avbröts');
  },
};

const registry = { actions: { ...presenceActions }, forms: {}, changes: {}, binds: {} };
for (const mod of [sheets, today, dad, money, focus, week, coachView, settings, onboarding]) {
  for (const kind of Object.keys(registry)) {
    for (const [name, fn] of Object.entries(mod[kind] || {})) {
      if (registry[kind][name]) console.warn(`Duplicate ${kind} handler: ${name}`);
      registry[kind][name] = fn;
    }
  }
}

const uiState = {};
// Unsaved form input survives re-renders (and leaving the page and coming back)
// until the form is submitted. Keyed by form name + hidden fields.
const drafts = new Map();
const server = { available: false, tokenRequired: false, coach: false };
const install = { available: false, prompt: null };
let lastKey = null;

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = hash.split('?');
  return { name: ROUTES[path] ? path : 'idag', params: new URLSearchParams(query) };
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = store.get().settings.serverToken;
  if (token) headers['x-life-os-token'] = token;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`.${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 200) }; }
  if (!res.ok) throw Object.assign(new Error(res.status === 401 ? 'fel eller saknad servertoken' : data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

function applyTheme() {
  const t = store.get().settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

function makeCtx() {
  const now = new Date();
  const route = parseRoute();
  return {
    state: store.get(),
    store,
    key: C.toKey(now),
    now,
    hour: now.getHours(),
    route: route.name,
    params: route.params,
    ui: uiState,
    server,
    install,
    version: VERSION,
    update: (fn, opts) => store.update(fn, opts),
    render,
    closeSheet,
    applyTheme,
    api,
    requestPersistence: store.requestPersistence,
  };
}

// Remember which control had focus so keyboard users keep their place.
function focusSelector(el) {
  if (!el || el === document.body || !document.getElementById('view').contains(el)) return null;
  const d = el.dataset || {};
  const base = d.action ? `[data-action="${CSS.escape(d.action)}"]` : d.bind ? `[data-bind="${CSS.escape(d.bind)}"]` : d.change ? `[data-change="${CSS.escape(d.change)}"]` : null;
  if (!base) return null;
  return base + ['id', 'area', 'kid', 'min', 'k', 'v', 'dir'].filter((k) => d[k] != null).map((k) => `[data-${k}="${CSS.escape(d[k])}"]`).join('');
}

function renderHeader(ctx, title, onboardingMode) {
  const t = ctx.state.timer;
  const pill = t && t.kind === 'focus' && ctx.route !== 'fokus'
    ? html`<a class="timer-pill" href="#/fokus" aria-label="Pågående fokuspass">${icon('focus', 16)}<span data-timer-text>${C.formatClock(C.timerRemainingMs(t, Date.now()))}</span></a>`
    : '';
  document.getElementById('app-header').innerHTML = String(html`<div class="header-inner">
    <a class="brand" href="#/idag" aria-label="Life OS – gå till Idag"><span class="brand-mark">${icon('sun', 18)}</span><span class="brand-name">Life OS</span></a>
    ${!onboardingMode && title && !ROUTES[ctx.route].nav ? html`<span class="header-title">${title}</span>` : ''}
    <span class="header-spacer"></span>
    ${pill}
    ${onboardingMode ? '' : html`<a class="btn-icon ${ctx.route === 'coach' ? 'active' : ''}" href="#/coach" aria-label="Coach">${icon('spark')}</a>
      <a class="btn-icon ${ctx.route === 'installningar' ? 'active' : ''}" href="#/installningar" aria-label="Inställningar">${icon('settings')}</a>`}
  </div>`);
}

function renderNav(ctx, onboardingMode) {
  const nav = document.getElementById('nav');
  nav.hidden = onboardingMode;
  document.getElementById('fab').hidden = onboardingMode;
  if (onboardingMode) return;
  nav.innerHTML = String(html`${Object.entries(ROUTES).filter(([, r]) => r.nav).map(([id, r]) => html`<a class="nav-item" href="#/${id}"${ctx.route === id ? html` aria-current="page"` : ''}>${icon(r.icon)}<span>${r.title}</span></a>`)}`);
}

function renderOverlay(ctx) {
  const root = document.getElementById('overlay-root');
  const t = ctx.state.timer;
  if (!t || t.kind !== 'presence') {
    root.innerHTML = '';
    document.body.classList.remove('has-overlay');
    return;
  }
  const names = t.kidIds.map((id) => (ctx.state.kids.find((k) => k.id === id) || {}).name).filter(Boolean);
  const starter = C.starterFor(STARTERS, ctx.state, ctx.key, 7);
  document.body.classList.add('has-overlay');
  root.innerHTML = String(html`<div class="presence" role="dialog" aria-modal="true" aria-labelledby="presence-title">
    <div class="presence-inner">
      <p class="eyebrow">Närvaroläge${names.length ? ` · ${names.join(' & ')}` : ''}</p>
      <h2 id="presence-title">Lägg ifrån dig telefonen.<br>Var här.</h2>
      <p class="presence-time" data-timer-text role="timer">${C.formatClock(C.timerElapsedMs(t, Date.now()))}</p>
      ${t.label ? html`<p class="presence-label">${t.label}</p>` : ''}
      ${starter ? html`<p class="presence-starter">Fråga: ”${starter.text}”</p>` : ''}
      <div class="row center wrap">
        ${t.pausedAt
          ? html`<button class="btn btn-ghost" data-action="presence.resume">${icon('play', 18)} Fortsätt</button>`
          : html`<button class="btn btn-ghost" data-action="presence.pause">${icon('pause', 18)} Pausa</button>`}
        <button class="btn btn-primary" data-action="presence.stop">${icon('check', 18)} Avsluta & spara</button>
      </div>
      <button class="btn-link" data-action="presence.cancel">Avbryt utan att spara</button>
    </div>
  </div>`);
}

function render() {
  const ctx = makeCtx();
  const onboardingMode = !ctx.state.profile.onboarded;
  if (!onboardingMode && !ctx.state.days[ctx.key]) {
    store.update((s) => C.ensureDay(s, ctx.key), { silent: true });
  }
  lastKey = ctx.key;
  const route = ROUTES[ctx.route];
  const view = onboardingMode ? onboarding : route.view;
  const focusSel = focusSelector(document.activeElement);
  document.body.classList.toggle('is-onboarding', onboardingMode);
  const viewEl = document.getElementById('view');
  viewEl.innerHTML = String(view.render(ctx));
  restoreDrafts(viewEl);
  renderHeader(ctx, route.title, onboardingMode);
  renderNav(ctx, onboardingMode);
  renderOverlay(ctx);
  document.title = onboardingMode ? 'Life OS' : `${route.title} · Life OS`;
  if (focusSel) {
    const el = document.querySelector(`#view ${focusSel}`);
    if (el) el.focus({ preventScroll: true });
  }
}

function draftKey(form) {
  const hidden = [...form.querySelectorAll('input[type=hidden]')].map((h) => `${h.name}=${h.value}`).join('&');
  return `${form.dataset.form}|${hidden}`;
}

function rememberDraft(form) {
  const fields = [];
  for (const el of form.elements) {
    if (!el.name || ['hidden', 'file', 'submit', 'button'].includes(el.type) || el.dataset.bind) continue;
    fields.push(el.type === 'radio' || el.type === 'checkbox' ? [el.name, el.value, el.checked] : [el.name, el.value, null]);
  }
  drafts.set(draftKey(form), fields);
}

function restoreDrafts(root) {
  if (!drafts.size) return;
  for (const form of root.querySelectorAll('form[data-form]')) {
    const fields = drafts.get(draftKey(form));
    if (!fields) continue;
    const used = new Set();
    for (const [name, value, checked] of fields) {
      const candidates = [...form.elements].filter((el) => el.name === name && !used.has(el));
      if (checked === null) {
        const el = candidates.find((c) => c.type !== 'radio' && c.type !== 'checkbox');
        if (el) {
          el.value = value;
          used.add(el);
        }
      } else {
        const el = candidates.find((c) => c.value === value);
        if (el) {
          el.checked = checked;
          used.add(el);
        }
      }
    }
    // Keep the reflection open if it holds unsaved text.
    const details = form.closest('details');
    if (details) details.open = true;
  }
}

function isTyping() {
  const el = document.activeElement;
  return Boolean(el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(el.type))));
}

function completeFocus(silent = false) {
  const r = finishTimer(store, { complete: true });
  if (!r) return;
  if (silent) {
    toast(`Ett fokuspass (${r.minutes} min) blev klart medan appen var stängd ✓`);
    return;
  }
  chime();
  notify('Fokuspass klart!', `${r.minutes} min${r.label ? ` – ${r.label}` : ''}. Ta en paus.`);
  toast(`Fokuspass klart! ${r.minutes} min 💪 Res dig, drick vatten, titta ut.`, { ms: 8000 });
}

function tick() {
  const key = C.todayKey();
  if (lastKey && key !== lastKey && !sheetIsOpen() && !isTyping()) {
    render();
    return;
  }
  const t = store.get().timer;
  if (!t) return;
  const nowMs = Date.now();
  if (t.kind === 'focus') {
    const rem = C.timerRemainingMs(t, nowMs);
    for (const el of document.querySelectorAll('[data-timer-text]')) el.textContent = C.formatClock(rem);
    const ringEl = document.querySelector('[data-timer-ring]');
    if (ringEl) ringEl.setAttribute('stroke-dashoffset', (Number(ringEl.dataset.c) * (rem / (t.durationMin * 60_000))).toFixed(2));
    if (rem <= 0 && !t.pausedAt) completeFocus();
  } else {
    const elapsed = C.timerElapsedMs(t, nowMs);
    for (const el of document.querySelectorAll('[data-timer-text]')) el.textContent = C.formatClock(elapsed);
  }
}

function run(promiseOrValue) {
  Promise.resolve(promiseOrValue).catch((err) => {
    console.error(err);
    toast(`Något gick fel: ${err.message}`);
  });
}

function bindEvents() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = registry.actions[el.dataset.action];
    if (!fn) return;
    if (el.tagName === 'A' && el.getAttribute('href')) {
      // Links that also close the sheet: let the navigation happen.
      fn(makeCtx(), el, e);
      return;
    }
    e.preventDefault();
    run(fn(makeCtx(), el, e));
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    drafts.delete(draftKey(form));
    const fn = registry.forms[form.dataset.form];
    if (fn) run(fn(makeCtx(), new FormData(form), form));
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.change && registry.changes[el.dataset.change]) run(registry.changes[el.dataset.change](makeCtx(), el, e));
    else if (el.dataset.bind && registry.binds[el.dataset.bind]) run(registry.binds[el.dataset.bind](makeCtx(), el, { commit: true }));
  });

  const trackDraft = (e) => {
    const form = e.target.closest && e.target.closest('#view form[data-form]');
    if (form && !e.target.dataset.bind && e.target.type !== 'file') rememberDraft(form);
  };
  document.addEventListener('input', trackDraft, true);
  document.addEventListener('change', trackDraft, true);

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.bind && registry.binds[el.dataset.bind]) registry.binds[el.dataset.bind](makeCtx(), el, { commit: false });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.bind) {
      e.preventDefault();
      e.target.blur();
    }
  });

  const dlg = document.getElementById('sheet');
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) closeSheet();
  });

  window.addEventListener('hashchange', () => {
    closeSheet();
    render();
    window.scrollTo(0, 0);
    const target = new URLSearchParams(location.hash.split('?')[1] || '').get('s');
    const section = target && document.getElementById(`s-${target}`);
    if (section) section.scrollIntoView({ block: 'start' });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !sheetIsOpen() && !isTyping()) render();
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    install.prompt = e;
    install.available = true;
  });
}

async function detectServer() {
  if (!/^https?:$/.test(location.protocol)) return;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch('./api/health', { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.app === 'life-os') {
      server.available = true;
      server.tokenRequired = Boolean(data.tokenRequired);
      server.coach = Boolean(data.coach);
      if (!sheetIsOpen() && !isTyping()) render();
    }
  } catch { /* static hosting: no server features */ }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          toast('En ny version av Life OS finns', { actionLabel: 'Uppdatera', ms: 15000, action: () => location.reload() });
        }
      });
    });
  }).catch(() => { /* e.g. private mode */ });
}

function boot() {
  store.load();
  applyTheme();
  const t = store.get().timer;
  if (t && t.kind === 'focus' && !t.pausedAt && C.timerRemainingMs(t, Date.now()) <= 0) completeFocus(true);
  bindEvents();
  store.subscribe(() => {
    applyTheme();
    render();
  });
  store.watchOtherTabs();
  render();
  if (!store.saveOk()) toast('Kunde inte spara lokalt – är privat läge på? Exportera en backup innan du stänger.');
  setInterval(tick, 1000);
  detectServer();
  registerServiceWorker();
}

boot();
