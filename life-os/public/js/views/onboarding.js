// First run: four short steps (name → kids → money → habits & rhythm).

import * as C from '../core.js';
import { html, icon, attr, toast } from '../ui.js';
import { buildDemoState } from '../demo.js';

function ui(ctx) {
  ctx.ui.onb = ctx.ui.onb || {
    step: 0,
    name: ctx.state.profile.name || '',
    kids: [],
    goal: '',
    costs: '',
    streams: new Set(C.DEFAULT_STREAMS.map((s) => s.id)),
    habits: new Set(C.SUGGESTED_HABITS.filter((h) => h.preselect).map((h) => h.id)),
    familyStart: '16:30',
    familyEnd: '19:30',
    focusWindow: 'morning',
  };
  return ctx.ui.onb;
}

function dots(step) {
  return html`<div class="onb-dots" aria-label="Steg ${step + 1} av 4">${[0, 1, 2, 3].map((i) => html`<span class="${i <= step ? 'on' : ''}"></span>`)}</div>`;
}

function stepWelcome(u) {
  return html`<form class="onb-card" data-form="onb.next">
    <div class="onb-logo" aria-hidden="true">${icon('sun', 40)}</div>
    <h1>Life OS</h1>
    <p class="onb-lead">En app för hela din dag: att vara en närvarande pappa, få ekonomin att växa och må bra på vägen.</p>
    <ul class="onb-points">
      <li><span class="onb-emoji" aria-hidden="true">☀️</span><span>Morgon-check-in och <strong>dagens tre</strong>: familj, pengar, jag</span></li>
      <li><span class="onb-emoji" aria-hidden="true">💛</span><span>Pappa-uppdrag, aktiviteter efter barnens ålder och en minnesbank</span></li>
      <li><span class="onb-emoji" aria-hidden="true">💰</span><span>Månadsmål, pipeline, kronor per timme och sparmål</span></li>
      <li><span class="onb-emoji" aria-hidden="true">⏱️</span><span>Fokuspass, närvaroläge och veckogenomgång</span></li>
    </ul>
    <label class="field"><span>Vad heter du?</span><input name="name" value="${u.name}" maxlength="40" autocomplete="given-name" placeholder="Ditt förnamn"></label>
    <button class="btn btn-primary btn-block btn-large">Kom igång</button>
    <button type="button" class="btn-link center" data-action="onb.demo">Utforska först med exempeldata</button>
    <p class="small muted center">All data stannar på din enhet. Inga konton, ingen spårning.</p>
  </form>`;
}

function stepKids(ctx, u) {
  return html`<div class="onb-card">
    <h1>Dina barn</h1>
    <p class="onb-lead">Med födelsedag anpassas uppdrag, aktiviteter och samtalsfrågor efter ålder – automatiskt när de växer.</p>
    ${u.kids.length ? html`<ul class="settings-list">${u.kids.map((k, i) => html`<li>
        <span class="grow"><i class="kid-dot k${i % 8}" aria-hidden="true"></i><strong>${k.name}</strong> <span class="small muted">${C.formatAge(C.ageParts(k.birthdate, ctx.key))}</span></span>
        <button class="btn-icon" data-action="onb.kidRemove" data-i="${i}" aria-label="Ta bort ${k.name}">${icon('trash', 18)}</button>
      </li>`)}</ul>` : ''}
    <form class="stack" data-form="onb.kidAdd">
      <div class="grid-2">
        <label class="field"><span>Namn</span><input name="name" required maxlength="30" autocomplete="off"></label>
        <label class="field"><span>Födelsedag</span><input type="date" name="birthdate" required max="${ctx.key}"></label>
      </div>
      <button class="btn btn-ghost">${icon('plus', 18)} Lägg till barn</button>
    </form>
    <form data-form="onb.next" class="row between">
      <button type="button" class="btn btn-ghost" data-action="onb.back">Tillbaka</button>
      <button class="btn btn-primary">${u.kids.length ? 'Nästa' : 'Hoppa över'}</button>
    </form>
  </div>`;
}

function stepMoney(u) {
  return html`<form class="onb-card" data-form="onb.next">
    <h1>Pengar</h1>
    <p class="onb-lead">Ett tydligt mål gör varje dags pengasteg meningsfullt. Du kan ändra allt senare.</p>
    <label class="field"><span>Inkomstmål per månad (kr)</span><input name="goal" inputmode="decimal" value="${u.goal}" placeholder="T.ex. 30 000" autocomplete="off"></label>
    <label class="field"><span>Fasta kostnader per månad (kr, valfritt)</span><input name="costs" inputmode="decimal" value="${u.costs}" placeholder="Hyra, el, mat, försäkringar…" autocomplete="off"></label>
    <fieldset class="field"><legend>Dina inkomstströmmar</legend>
      <div class="chips">${C.DEFAULT_STREAMS.map((s) => html`<label class="chip-check"><input type="checkbox" name="streams" value="${s.id}"${attr(u.streams.has(s.id), 'checked')}><span>${s.name}</span></label>`)}</div>
    </fieldset>
    <div class="row between">
      <button type="button" class="btn btn-ghost" data-action="onb.back">Tillbaka</button>
      <button class="btn btn-primary">Nästa</button>
    </div>
  </form>`;
}

function stepHabits(u) {
  return html`<form class="onb-card" data-form="onb.finish">
    <h1>Vanor & rytm</h1>
    <p class="onb-lead">Välj några små saker du vill göra varje dag. Färre är bättre.</p>
    <div class="chips">${C.SUGGESTED_HABITS.map((h) => html`<label class="chip-check"><input type="checkbox" name="habits" value="${h.id}"${attr(u.habits.has(h.id), 'checked')}><span>${h.icon} ${h.name}</span></label>`)}</div>
    <div class="grid-2">
      <label class="field"><span>Familjetid från</span><input type="time" name="familyStart" value="${u.familyStart}"></label>
      <label class="field"><span>till</span><input type="time" name="familyEnd" value="${u.familyEnd}"></label>
    </div>
    <label class="field"><span>När fokuserar du bäst?</span><select name="focusWindow">
      ${Object.entries(C.FOCUS_WINDOWS).map(([id, w]) => html`<option value="${id}"${attr(u.focusWindow === id, 'selected')}>${w.name} (${w.start}–${w.end})</option>`)}
    </select></label>
    <div class="row between">
      <button type="button" class="btn btn-ghost" data-action="onb.back">Tillbaka</button>
      <button class="btn btn-primary">Starta min första dag</button>
    </div>
  </form>`;
}

export function render(ctx) {
  const u = ui(ctx);
  const steps = [() => stepWelcome(u), () => stepKids(ctx, u), () => stepMoney(u), () => stepHabits(u)];
  return html`<div class="onboarding">${u.step > 0 ? dots(u.step) : ''}${steps[u.step]()}</div>`;
}

export const actions = {
  'onb.back': (ctx) => {
    const u = ui(ctx);
    u.step = Math.max(0, u.step - 1);
    ctx.render();
  },
  'onb.kidRemove': (ctx, el) => {
    ui(ctx).kids.splice(Number(el.dataset.i), 1);
    ctx.render();
  },
  'onb.demo': (ctx) => {
    ctx.store.replace(buildDemoState(new Date()));
    ctx.ui.onb = null;
    location.hash = '#/idag';
    toast('Exempeldata laddad. Radera den under Inställningar → Data när du vill börja på riktigt.', { ms: 7000 });
  },
};

export const forms = {
  'onb.next': (ctx, fd) => {
    const u = ui(ctx);
    if (u.step === 0) u.name = String(fd.get('name') || '').trim();
    if (u.step === 2) {
      u.goal = String(fd.get('goal') || '');
      u.costs = String(fd.get('costs') || '');
      u.streams = new Set(fd.getAll('streams').map(String));
    }
    u.step = Math.min(3, u.step + 1);
    ctx.render();
    window.scrollTo(0, 0);
  },
  'onb.kidAdd': (ctx, fd) => {
    const name = String(fd.get('name') || '').trim();
    const birthdate = String(fd.get('birthdate') || '');
    if (!name || !C.parseKey(birthdate)) return toast('Ange namn och födelsedag');
    ui(ctx).kids.push({ name, birthdate });
    ctx.render();
  },
  'onb.finish': (ctx, fd) => {
    const u = ui(ctx);
    const habits = new Set(fd.getAll('habits').map(String));
    const time = (k, fallback) => (C.minutesOfDay(String(fd.get(k) || '')) != null ? String(fd.get(k)) : fallback);
    ctx.update((s) => {
      s.profile = { name: u.name, onboarded: true };
      s.kids = u.kids.map((k, i) => ({ id: C.uid('k'), name: k.name, birthdate: k.birthdate, color: i % 8 }));
      s.settings.monthlyIncomeGoal = Math.max(0, C.num(u.goal));
      s.settings.monthlyCosts = Math.max(0, C.num(u.costs));
      const streams = C.DEFAULT_STREAMS.filter((st) => u.streams.has(st.id)).map((st) => ({ ...st }));
      s.settings.streams = streams.length ? streams : C.DEFAULT_STREAMS.map((st) => ({ ...st }));
      s.settings.familyStart = time('familyStart', '16:30');
      s.settings.familyEnd = time('familyEnd', '19:30');
      s.settings.focusWindow = C.FOCUS_WINDOWS[String(fd.get('focusWindow'))] ? String(fd.get('focusWindow')) : 'morning';
      s.habits = C.SUGGESTED_HABITS.filter((h) => habits.has(h.id)).map((h) => ({ id: C.uid('hb'), name: h.name, icon: h.icon, archived: false, createdAt: new Date().toISOString() }));
    });
    ctx.ui.onb = null;
    ctx.requestPersistence();
    location.hash = '#/idag';
    toast(`Välkommen${u.name ? `, ${u.name}` : ''}! Börja med morgonens check-in ☀️`, { ms: 6000 });
  },
};
