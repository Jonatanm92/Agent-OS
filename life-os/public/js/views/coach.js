// Coach: quick prompts answered by the offline engine, or free-form questions
// sent to Agent OS (which routes to whatever model you run behind it).

import * as C from '../core.js';
import { QUICK_PROMPTS, offlineReply, routeIntent, askAgentOs } from '../coach.js';
import { html, icon, md, toast } from '../ui.js';

function ui(ctx) {
  ctx.ui.coach = ctx.ui.coach || { pending: false, conversationId: null };
  return ctx.ui.coach;
}

function aiEnabled(ctx) {
  const c = ctx.state.settings.coach;
  return c.mode === 'agentos' && (Boolean(String(c.agentOsUrl || '').trim()) || ctx.server.coach);
}

export function render(ctx) {
  const u = ui(ctx);
  const ai = aiEnabled(ctx);
  const log = ctx.state.coachLog.slice().reverse();
  return html`
    <section class="page-head">
      <h1>Coach</h1>
      <p class="hero-sub">${ai ? `Kopplad till Agent OS (${ctx.state.settings.coach.agentId}). Snabbvalen svarar direkt, offline.` : 'Inbyggd coach som läser din egen data – helt offline.'}</p>
    </section>
    <div class="prompt-grid">
      ${QUICK_PROMPTS.map((p) => html`<button class="prompt" data-action="coach.quick" data-id="${p.id}"${u.pending ? ' disabled' : ''}><span aria-hidden="true">${p.icon}</span>${p.label}</button>`)}
    </div>
    <form class="card" data-form="coach.ask">
      <label class="field"><span>${ai ? 'Fråga vad som helst' : 'Skriv en fråga'}</span>
        <textarea name="q" rows="3" maxlength="1500" placeholder="${ai ? 'T.ex. Hur kan jag få in 10 000 kr extra i november utan att tappa tid med barnen?' : 'T.ex. Ge mig en helgplan med barnen'}" required></textarea></label>
      <div class="row between">
        <button class="btn btn-primary"${u.pending ? ' disabled' : ''}>${u.pending ? 'Tänker…' : html`${icon('spark', 18)} Fråga`}</button>
        ${ai ? '' : html`<a class="btn-link" href="#/installningar?s=coach">Koppla Agent OS</a>`}
      </div>
    </form>
    ${u.pending ? html`<section class="card"><p class="muted" aria-live="polite">Coachen tänker… det kan ta en stund med en gratis modell.</p></section>` : ''}
    ${log.length
      ? html`${log.map((e) => html`<article class="card coach-entry">
          <p class="coach-q"><strong>Du:</strong> ${e.q}</p>
          ${md(e.a)}
          <p class="small muted">${e.source === 'agentos' ? `Agent OS${e.model ? ` · ${e.model}` : ''}` : 'Inbyggd coach'} · ${new Date(e.at).toLocaleString(C.LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
        </article>`)}
        <button class="btn btn-ghost btn-block" data-action="coach.clear">Rensa historik</button>`
      : html`<section class="card card-quiet"><p class="muted">Välj ett snabbval ovan för att börja. Coachen använder din check-in, dina prioriteringar, barnens åldrar, pengamål och pipeline – inget lämnar enheten i offlineläge.</p></section>`}
  `;
}

function pushLog(ctx, entry) {
  ctx.update((s) => {
    s.coachLog.push({ id: C.uid('c'), at: new Date().toISOString(), ...entry });
    if (s.coachLog.length > 30) s.coachLog = s.coachLog.slice(-30);
  });
}

async function ask(ctx, question, intentHint = null) {
  const u = ui(ctx);
  const intent = intentHint || routeIntent(question);
  if (!aiEnabled(ctx) || intentHint) {
    pushLog(ctx, { q: question, a: offlineReply(intent, ctx.state, ctx.key), source: 'offline' });
    return;
  }
  u.pending = true;
  ctx.render();
  try {
    const r = await askAgentOs({ question, state: ctx.state, key: ctx.key, conversationId: u.conversationId, settings: ctx.state.settings, serverToken: ctx.state.settings.serverToken });
    u.conversationId = r.conversationId;
    u.pending = false;
    pushLog(ctx, { q: question, a: r.reply, source: 'agentos', model: r.model });
  } catch (e) {
    u.pending = false;
    const fallback = intent ? offlineReply(intent, ctx.state, ctx.key) : 'Jag nådde inte Agent OS just nu. Kontrollera att Agent OS och FCC-proxyn körs, eller använd snabbvalen ovan som fungerar offline.';
    pushLog(ctx, { q: question, a: `${fallback}\n\n_Agent OS svarade inte (${e.message}). Svaret kommer från den inbyggda coachen._`, source: 'offline' });
    toast('Agent OS nåddes inte – visade offline-svar');
  }
}

export const actions = {
  'coach.quick': (ctx, el) => {
    const p = QUICK_PROMPTS.find((x) => x.id === el.dataset.id);
    if (p) ask(ctx, p.label, p.id);
  },
  'coach.clear': (ctx) => {
    const snap = ctx.store.snapshot();
    ui(ctx).conversationId = null;
    ctx.update((s) => {
      s.coachLog = [];
    });
    toast('Historiken rensades', { action: () => ctx.store.restore(snap) });
  },
};

export const forms = {
  'coach.ask': (ctx, fd, form) => {
    const q = String(fd.get('q') || '').trim();
    if (!q) return;
    form.reset();
    ask(ctx, q);
  },
};
