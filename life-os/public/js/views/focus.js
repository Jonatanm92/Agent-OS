// Fokus: deep-work sessions tied to today's priorities, with a weekly chart.

import * as C from '../core.js';
import { html, icon, attr, columns, toast } from '../ui.js';
import { startTimer, pauseTimer, resumeTimer, finishTimer, cancelTimer, askNotificationPermission } from '../timer.js';

const PRESETS = [25, 50, 90];
const R = 108;
const CIRC = 2 * Math.PI * R;

function ui(ctx) {
  ctx.ui.focus = ctx.ui.focus || { minutes: 50, label: '' };
  return ctx.ui.focus;
}

export function timerView(ctx) {
  const t = ctx.state.timer;
  const now = Date.now();
  const remaining = C.timerRemainingMs(t, now);
  const pct = t.durationMin ? 1 - remaining / (t.durationMin * 60_000) : 0;
  return html`<section class="card timer-card">
    <p class="eyebrow">${t.pausedAt ? 'Pausad' : 'Fokus pågår'}</p>
    <div class="timer-wrap">
      <svg class="ring timer-ring" viewBox="0 0 240 240" aria-hidden="true">
        <circle class="ring-track" cx="120" cy="120" r="${R}" stroke-width="12" fill="none"/>
        <circle class="ring-fill" data-timer-ring data-c="${CIRC.toFixed(2)}" cx="120" cy="120" r="${R}" stroke-width="12" fill="none"
          stroke-dasharray="${CIRC.toFixed(2)}" stroke-dashoffset="${(CIRC * (1 - pct)).toFixed(2)}" transform="rotate(-90 120 120)" stroke-linecap="round"/>
      </svg>
      <div class="timer-center">
        <span class="timer-text" data-timer-text role="timer" aria-live="off">${C.formatClock(remaining)}</span>
        <span class="small muted">av ${t.durationMin} min</span>
      </div>
    </div>
    ${t.label ? html`<p class="timer-label">${t.label}</p>` : ''}
    <div class="row center wrap">
      ${t.pausedAt
        ? html`<button class="btn btn-primary" data-action="focus.resume">${icon('play', 18)} Fortsätt</button>`
        : html`<button class="btn btn-primary" data-action="focus.pause">${icon('pause', 18)} Pausa</button>`}
      <button class="btn btn-ghost" data-action="focus.finish">${icon('check', 18)} Klar nu</button>
      <button class="btn btn-ghost danger" data-action="focus.cancel">${icon('close', 18)} Avbryt</button>
    </div>
    <p class="small muted center">En flik. Notiser av. Vatten bredvid. Du får en signal när passet är slut.</p>
  </section>`;
}

function setupView(ctx) {
  const u = ui(ctx);
  const day = C.getDay(ctx.state, ctx.key) || C.emptyDay();
  const suggestions = C.AREAS.map((a) => day.priorities[a.id].text.trim()).filter(Boolean);
  return html`<form class="card" data-form="focus.start">
    <div class="card-head"><h2>Nytt fokuspass</h2></div>
    <div class="chips" role="radiogroup" aria-label="Längd">
      ${PRESETS.map((m) => html`<label class="chip-check big"><input type="radio" name="minutes" value="${m}"${attr(u.minutes === m, 'checked')}><span>${m} min</span></label>`)}
    </div>
    <label class="field"><span>Vad ska du göra?</span><input name="label" maxlength="120" value="${u.label}" placeholder="T.ex. Skriv offerten till …" autocomplete="off"></label>
    ${suggestions.length ? html`<div class="chips">${suggestions.map((s) => html`<button type="button" class="chip" data-action="sheet.fill" data-target="label" data-value="${s}">${s}</button>`)}</div>` : ''}
    <button class="btn btn-primary btn-block btn-large">${icon('play', 20)} Starta</button>
  </form>`;
}

export function render(ctx) {
  const t = ctx.state.timer;
  const todayMin = C.focusMinutesOn(ctx.state, ctx.key);
  const sessions = ctx.state.focus.filter((f) => f.date === ctx.key);
  const keys = C.weekDays(C.weekKey(ctx.key));
  const week = keys.map((k) => ({ label: C.formatWeekday(k), value: C.focusMinutesOn(ctx.state, k), title: C.formatDateLong(k), highlight: k === ctx.key, muted: k > ctx.key }));
  const weekTotal = C.sum(week.map((w) => w.value));
  return html`
    <section class="page-head">
      <h1>Fokus</h1>
      <p class="hero-sub">Djupt arbete på det som spelar roll – sedan helt ledig.</p>
    </section>
    ${t && t.kind === 'focus'
      ? timerView(ctx)
      : t && t.kind === 'presence'
        ? html`<section class="card"><p>Närvaroläget är igång. Avsluta det innan du startar ett fokuspass.</p></section>`
        : setupView(ctx)}
    <div class="stat-row">
      <div class="stat"><span class="stat-label">Idag</span><span class="stat-value">${C.formatMinutes(todayMin)}</span></div>
      <div class="stat"><span class="stat-label">Pass idag</span><span class="stat-value">${sessions.length}</span></div>
      <div class="stat"><span class="stat-label">Veckan</span><span class="stat-value">${C.formatMinutes(weekTotal)}</span></div>
    </div>
    <section class="card">
      <div class="card-head"><h2>Fokus per dag</h2><span class="small muted">vecka ${C.isoWeek(ctx.key).week}</span></div>
      ${columns(week, { format: (v) => C.formatMinutes(v), empty: 'Inga fokuspass den här veckan ännu.' })}
    </section>
    ${sessions.length
      ? html`<section class="card"><div class="card-head"><h2>Dagens pass</h2></div>
          <ul class="ledger">${sessions.map((f) => html`<li><div class="grow">${f.label || 'Fokus'}</div><span class="small muted">${f.minutes} min</span>
            <button class="btn-icon" data-action="focus.delete" data-id="${f.id}" aria-label="Ta bort pass">${icon('trash', 18)}</button></li>`)}</ul>
        </section>`
      : ''}
  `;
}

export const actions = {
  'focus.pause': (ctx) => pauseTimer(ctx.store),
  'focus.resume': (ctx) => resumeTimer(ctx.store),
  'focus.finish': (ctx) => {
    const r = finishTimer(ctx.store);
    if (r && r.minutes >= 5) toast(`${r.minutes} min fokus loggat 💪`);
    else toast('Passet var kortare än 5 min och loggades inte.');
  },
  'focus.cancel': (ctx) => {
    cancelTimer(ctx.store);
    toast('Passet avbröts');
  },
  'focus.delete': (ctx, el) => {
    const snap = ctx.store.snapshot();
    ctx.update((s) => {
      s.focus = s.focus.filter((f) => f.id !== el.dataset.id);
    });
    toast('Passet togs bort', { action: () => ctx.store.restore(snap) });
  },
};

export const forms = {
  'focus.start': (ctx, fd) => {
    const minutes = PRESETS.includes(Number(fd.get('minutes'))) ? Number(fd.get('minutes')) : 50;
    const label = String(fd.get('label') || '').trim();
    const u = ui(ctx);
    u.minutes = minutes;
    u.label = '';
    askNotificationPermission();
    startTimer(ctx.store, { kind: 'focus', label, durationMin: minutes });
  },
};
