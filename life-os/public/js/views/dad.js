// Pappa: present time per child, presence mode, activity ideas that fit the
// kids' ages and the season, conversation starters and the memory bank.

import * as C from '../core.js';
import { ACTIVITIES, DAD_TIPS, MISSIONS, MISSION_CATEGORIES, STARTERS } from '../content.js';
import { html, icon, meter, attr, download, toast } from '../ui.js';
import { kidDot, MEMORY_KINDS } from '../sheets.js';

const TIME_FILTERS = [
  { id: 'all', name: 'All tid' },
  { id: 'short', name: '≤ 20 min', max: 20 },
  { id: 'mid', name: '≤ 60 min', max: 60 },
  { id: 'long', name: 'Längre', min: 61 },
];
const PLACE_FILTERS = [
  { id: 'all', name: 'Inne & ute' },
  { id: 'inne', name: 'Inne' },
  { id: 'ute', name: 'Ute' },
];

function ui(ctx) {
  ctx.ui.dad = ctx.ui.dad || { place: 'all', time: 'all', free: false, starter: 0, shuffle: 0, memKid: 'all', memLimit: 12, actLimit: 6 };
  return ctx.ui.dad;
}

function kidsCard(ctx, summary) {
  const goal = ctx.state.settings.dadGoalPerKid;
  return html`<section class="card">
    <div class="card-head"><h2>Närvarande tid · vecka ${C.isoWeek(ctx.key).week}</h2><span class="small muted">mål ${C.formatMinutes(goal)}/barn</span></div>
    <p class="hero-number">${C.formatMinutes(summary.dadMinutes)}</p>
    <ul class="kid-list">
      ${ctx.state.kids.map((k) => {
        const minutes = summary.dadByKid[k.id] || 0;
        const age = C.ageParts(k.birthdate, ctx.key);
        const bday = C.daysUntilBirthday(k.birthdate, ctx.key);
        return html`<li class="kid-row">
          <div class="row between">
            <span class="kid-name">${kidDot(k)}<strong>${k.name}</strong> <span class="muted small">${C.formatAge(age)}</span>
              ${bday != null && bday <= 30 ? html`<span class="tag">🎂 ${bday === 0 ? 'idag!' : `om ${bday} d`}</span>` : ''}</span>
            <span class="small">${C.formatMinutes(minutes)}</span>
          </div>
          ${meter(goal ? minutes / goal : 0, { label: `${k.name}: ${C.formatMinutes(minutes)} av ${C.formatMinutes(goal)}` })}
          <div class="row add-time" role="group" aria-label="Logga tid med ${k.name}">
            ${[15, 30, 60].map((m) => html`<button class="chip" data-action="dad.add" data-kid="${k.id}" data-min="${m}">+${m} min</button>`)}
            <button class="chip" data-action="sheet.memory" data-kid="${k.id}">+ minne</button>
          </div>
        </li>`;
      })}
    </ul>
  </section>`;
}

function missionTipCard(ctx) {
  const day = C.getDay(ctx.state, ctx.key) || C.emptyDay();
  const mission = C.dailyMission(MISSIONS, ctx.state, ctx.key);
  const tip = C.pickDaily(DAD_TIPS, ctx.key, 'tip');
  return html`<section class="card accent-family">
    ${mission ? html`<div class="card-head"><h2>💛 Dagens uppdrag</h2><span class="tag">${MISSION_CATEGORIES[mission.cat] || ''}</span></div>
      <p class="big-text">${mission.text}</p>
      <div class="row wrap">
        <button class="btn ${day.mission.done ? 'btn-done' : 'btn-primary'}" data-action="today.mission" aria-pressed="${day.mission.done}">${day.mission.done ? html`${icon('check', 18)} Klart` : 'Klart!'}</button>
        ${day.mission.done ? '' : html`<button class="btn btn-ghost" data-action="today.missionSwap">${icon('shuffle', 18)} Byt</button>`}
      </div>` : ''}
    <div class="tip"><p class="eyebrow">Dagens pappatips</p><p>${tip}</p></div>
  </section>`;
}

function starterCard(ctx) {
  const u = ui(ctx);
  const starter = C.starterFor(STARTERS, ctx.state, ctx.key, u.starter);
  if (!starter) return '';
  return html`<section class="card card-quiet">
    <div class="card-head"><h2>💬 Middagsfrågan</h2><button class="btn-link" data-action="dad.nextStarter">Ny fråga</button></div>
    <p class="starter">”${starter.text}”</p>
  </section>`;
}

function activitiesCard(ctx) {
  const u = ui(ctx);
  const t = TIME_FILTERS.find((x) => x.id === u.time) || TIME_FILTERS[0];
  let list = C.suitableActivities(ACTIVITIES, ctx.state, ctx.key, { place: u.place, maxMinutes: t.max, minMinutes: t.min, free: u.free });
  // Rotate the list daily (and on "Slumpa") so the top ideas change.
  if (list.length) {
    const start = (C.hashString(`acts:${ctx.key}`) + u.shuffle) % list.length;
    list = [...list.slice(start), ...list.slice(0, start)];
  }
  const shown = list.slice(0, u.actLimit);
  const ages = C.kidAges(ctx.state.kids, ctx.key);
  return html`<section class="card">
    <div class="card-head"><h2>🌳 Hitta på något</h2><button class="btn-link" data-action="dad.shuffle">${icon('shuffle', 16)} Slumpa</button></div>
    <p class="card-sub">${ages.length ? `Anpassat för ${ages.join(' och ')} år och årstiden` : 'Lägg till barn för åldersanpassade förslag'} · ${list.length} idéer</p>
    <div class="filter-row" role="group" aria-label="Filtrera aktiviteter">
      ${PLACE_FILTERS.map((p) => html`<button class="chip ${u.place === p.id ? 'on' : ''}" data-action="dad.filter" data-k="place" data-v="${p.id}" aria-pressed="${u.place === p.id}">${p.name}</button>`)}
    </div>
    <div class="filter-row" role="group" aria-label="Filtrera på tid">
      ${TIME_FILTERS.map((p) => html`<button class="chip ${u.time === p.id ? 'on' : ''}" data-action="dad.filter" data-k="time" data-v="${p.id}" aria-pressed="${u.time === p.id}">${p.name}</button>`)}
      <button class="chip ${u.free ? 'on' : ''}" data-action="dad.filter" data-k="free" data-v="${u.free ? '' : '1'}" aria-pressed="${u.free}">Gratis</button>
    </div>
    ${shown.length
      ? html`<ul class="activities">${shown.map((a) => html`<li class="activity">
          <div class="activity-main">
            <strong>${a.title}</strong>
            <p>${a.desc}</p>
            <p class="small muted">⏱ ${a.minutes} min · ${a.place === 'both' ? 'Inne/ute' : a.place === 'ute' ? 'Ute' : 'Inne'} · ${a.cost ? 'Liten kostnad' : 'Gratis'} · ${a.minAge}–${a.maxAge} år</p>
          </div>
          <button class="btn btn-small" data-action="sheet.activity" data-id="${a.id}">Gjort</button>
        </li>`)}</ul>
        ${list.length > shown.length ? html`<button class="btn btn-ghost btn-block" data-action="dad.moreActs">Visa fler (${list.length - shown.length})</button>` : ''}`
      : html`<p class="empty">Inga idéer matchar filtren. Testa ett annat filter.</p>`}
  </section>`;
}

function memoriesCard(ctx) {
  const u = ui(ctx);
  const all = ctx.state.memories.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  const list = u.memKid === 'all' ? all : all.filter((m) => (m.kidId || '') === (u.memKid === 'family' ? '' : u.memKid));
  const kindIcon = Object.fromEntries(MEMORY_KINDS.map((k) => [k.id, k.icon]));
  return html`<section class="card">
    <div class="card-head"><h2>📔 Minnesbanken</h2><span class="small muted">${all.length} minnen</span></div>
    <div class="row wrap">
      <button class="btn btn-primary" data-action="sheet.memory">${icon('plus', 18)} Nytt minne</button>
      ${all.length ? html`<button class="btn btn-ghost" data-action="dad.exportMemories">${icon('download', 18)} Exportera (Markdown)</button>` : ''}
    </div>
    ${ctx.state.kids.length && all.length
      ? html`<div class="filter-row" role="group" aria-label="Filtrera minnen">
          <button class="chip ${u.memKid === 'all' ? 'on' : ''}" data-action="dad.memKid" data-v="all">Alla</button>
          ${ctx.state.kids.map((k) => html`<button class="chip ${u.memKid === k.id ? 'on' : ''}" data-action="dad.memKid" data-v="${k.id}">${kidDot(k)}${k.name}</button>`)}
          <button class="chip ${u.memKid === 'family' ? 'on' : ''}" data-action="dad.memKid" data-v="family">Familjen</button>
        </div>`
      : ''}
    ${list.length
      ? html`<ul class="memories">${list.slice(0, u.memLimit).map((m) => {
          const kid = ctx.state.kids.find((k) => k.id === m.kidId);
          return html`<li class="memory">
            <span class="memory-icon" aria-hidden="true">${kindIcon[m.kind] || '💛'}</span>
            <div class="grow">
              <p class="memory-text">${m.kind === 'quote' ? `”${m.text}”` : m.text}</p>
              <p class="small muted">${C.formatDateShort(m.date)} ${m.date.slice(0, 4)}${kid ? html` · ${kidDot(kid)}${kid.name}` : ''}</p>
            </div>
            <button class="btn-icon" data-action="dad.memDelete" data-id="${m.id}" aria-label="Ta bort minne">${icon('trash', 18)}</button>
          </li>`;
        })}</ul>
        ${list.length > u.memLimit ? html`<button class="btn btn-ghost btn-block" data-action="dad.moreMems">Visa fler</button>` : ''}`
      : html`<p class="empty">Inga minnen ännu. Det roliga barnen säger glöms fortare än man tror – spara det här.</p>`}
  </section>`;
}

export function render(ctx) {
  const summary = C.weekSummary(ctx.state, C.weekKey(ctx.key), ctx.key);
  return html`
    <section class="page-head">
      <h1>Pappa</h1>
      <p class="hero-sub">Det barnen minns är tiden du var helt där.</p>
    </section>
    <button class="presence-cta" data-action="sheet.presence"${attr(Boolean(ctx.state.timer), 'disabled')}>
      <span class="presence-icon">${icon('leaf', 28)}</span>
      <span><strong>Starta närvaroläge</strong><span>Mobilen bort – tiden räknas som pappatid</span></span>
    </button>
    ${ctx.state.kids.length
      ? kidsCard(ctx, summary)
      : html`<section class="card"><h2>Lägg till dina barn</h2><p>Med namn och födelsedag anpassas uppdrag, aktiviteter och frågor efter deras ålder.</p><a class="btn btn-primary" href="#/installningar?s=barn">Lägg till barn</a></section>`}
    ${missionTipCard(ctx)}
    ${starterCard(ctx)}
    ${activitiesCard(ctx)}
    ${memoriesCard(ctx)}
  `;
}

export const actions = {
  'dad.add': (ctx, el) => {
    const min = Number(el.dataset.min) || 15;
    const kid = ctx.state.kids.find((k) => k.id === el.dataset.kid);
    ctx.update((s) => {
      const d = C.ensureDay(s, ctx.key);
      d.dadMinutes[el.dataset.kid] = (Number(d.dadMinutes[el.dataset.kid]) || 0) + min;
    });
    toast(`+${min} min med ${kid ? kid.name : 'barnen'} 💛`, {
      action: () => ctx.update((s) => {
        const d = C.ensureDay(s, ctx.key);
        d.dadMinutes[el.dataset.kid] = Math.max(0, (Number(d.dadMinutes[el.dataset.kid]) || 0) - min);
      }),
    });
  },
  'dad.filter': (ctx, el) => {
    const u = ui(ctx);
    if (el.dataset.k === 'free') u.free = Boolean(el.dataset.v);
    else u[el.dataset.k] = el.dataset.v;
    u.actLimit = 6;
    ctx.render();
  },
  'dad.shuffle': (ctx) => {
    const u = ui(ctx);
    u.shuffle += u.actLimit;
    ctx.render();
  },
  'dad.moreActs': (ctx) => {
    ui(ctx).actLimit += 6;
    ctx.render();
  },
  'dad.nextStarter': (ctx) => {
    ui(ctx).starter += 1;
    ctx.render();
  },
  'dad.memKid': (ctx, el) => {
    const u = ui(ctx);
    u.memKid = el.dataset.v;
    u.memLimit = 12;
    ctx.render();
  },
  'dad.moreMems': (ctx) => {
    ui(ctx).memLimit += 12;
    ctx.render();
  },
  'dad.memDelete': (ctx, el) => {
    const snap = ctx.store.snapshot();
    ctx.update((s) => {
      s.memories = s.memories.filter((m) => m.id !== el.dataset.id);
    });
    toast('Minnet togs bort', { action: () => ctx.store.restore(snap) });
  },
  'dad.exportMemories': (ctx) => {
    download(`minnesbank-${ctx.key}.md`, C.memoriesToMarkdown(ctx.state), 'text/markdown');
  },
};
