// Idag: the daily loop. Morning check-in → today's three → dad mission →
// money step → habits → evening reflection. Everything feeds the day score.

import * as C from '../core.js';
import { MISSIONS, MONEY_ACTIONS, MISSION_CATEGORIES, MONEY_CATEGORIES } from '../content.js';
import { morningAdvice, planDay } from '../coach.js';
import { html, icon, ring, meter, attr, openSheet, sheetHead, closeSheet, toast } from '../ui.js';
import { checkinFields, kidDot } from '../sheets.js';

function noteTone(tone) {
  return { good: 'note-good', tip: 'note-tip', care: 'note-care' }[tone] || 'note-tip';
}

function resurfacedMemory(state, key) {
  const md5 = key.slice(5);
  const sameDay = state.memories.filter((m) => m.date && m.date.slice(5) === md5 && m.date < key);
  if (sameDay.length) {
    const m = C.pickDaily(sameDay, key, 'onthisday');
    const years = Number(key.slice(0, 4)) - Number(m.date.slice(0, 4));
    return { memory: m, title: years === 1 ? 'För ett år sedan' : `För ${years} år sedan` };
  }
  const older = state.memories.filter((m) => m.date && C.diffDays(m.date, key) >= 21);
  if (!older.length) return null;
  return { memory: C.pickDaily(older, key, 'resurface'), title: 'Ett minne att le åt' };
}

function checkinCard(day) {
  if (!day.checkin) {
    return html`<form class="card checkin" data-form="today.checkin">
      <div class="card-head"><h2>☀️ Morgon-check-in</h2><span class="small muted">30 sekunder</span></div>
      ${checkinFields({})}
      <button class="btn btn-primary btn-block">Starta dagen</button>
    </form>`;
  }
  const advice = morningAdvice(day.checkin);
  return html`<section class="card">
    <div class="card-head">
      <h2>☀️ Check-in</h2>
      <button class="btn-link" data-action="sheet.checkin">Ändra</button>
    </div>
    <div class="checkin-summary">
      <span>Sömn <strong>${day.checkin.sleep}</strong>/5</span>
      <span>Energi <strong>${day.checkin.energy}</strong>/5</span>
      <span>Humör <strong>${day.checkin.mood}</strong>/5</span>
    </div>
    ${day.checkin.intention ? html`<p class="intention">”${day.checkin.intention}”</p>` : ''}
    ${advice ? html`<p class="note ${noteTone(advice.tone)}">${advice.text}</p>` : ''}
  </section>`;
}

function prioritiesCard(day) {
  return html`<section class="card">
    <div class="card-head"><h2>🎯 Dagens tre</h2><span class="small muted">Familj · Pengar · Jag</span></div>
    <ul class="prios">
      ${C.AREAS.map((a) => {
        const p = day.priorities[a.id];
        const has = Boolean(p.text.trim());
        return html`<li class="prio area-${a.id} ${p.done ? 'done' : ''}">
          <input type="checkbox" class="check" data-change="today.prioDone" data-area="${a.id}"${attr(p.done, 'checked')}${attr(!has, 'disabled')} aria-label="Markera ${a.name} som klar">
          <div class="prio-body">
            <span class="prio-area">${a.icon} ${a.name}</span>
            <input class="prio-text" data-bind="today.prio" data-area="${a.id}" value="${p.text}" placeholder="${a.hint}" maxlength="140" aria-label="Prioritet för ${a.name}" enterkeyhint="done">
          </div>
        </li>`;
      })}
    </ul>
  </section>`;
}

function missionCard(ctx, day) {
  const mission = C.dailyMission(MISSIONS, ctx.state, ctx.key);
  if (!mission) return '';
  const s = C.streak(ctx.state, ctx.key, C.PREDICATES.mission);
  return html`<section class="card accent-family ${day.mission.done ? 'is-done' : ''}">
    <div class="card-head"><h2>💛 Dagens pappa-uppdrag</h2><span class="tag">${MISSION_CATEGORIES[mission.cat] || ''}</span></div>
    <p class="big-text">${mission.text}</p>
    <div class="row wrap">
      ${day.mission.done
        ? html`<button class="btn btn-done" data-action="today.mission" aria-pressed="true">${icon('check', 18)} Klart</button>
               <button class="btn btn-ghost" data-action="sheet.memory">Spara som minne</button>`
        : html`<button class="btn btn-primary" data-action="today.mission" aria-pressed="false">Klart!</button>
               <button class="btn btn-ghost" data-action="today.missionSwap">${icon('shuffle', 18)} Byt</button>`}
    </div>
    ${s ? html`<p class="small muted streak">🔥 ${s} ${s === 1 ? 'dag' : 'dagar'} i rad</p>` : ''}
  </section>`;
}

function moneyCard(ctx, day) {
  const action = C.dailyMoneyAction(MONEY_ACTIONS, ctx.state, ctx.key);
  const goal = ctx.state.settings.monthlyIncomeGoal;
  const mk = C.monthKey(ctx.key);
  const earned = C.incomeForMonth(ctx.state, mk);
  const f = C.moneyForecast(goal, earned, ctx.key);
  const s = C.streak(ctx.state, ctx.key, C.PREDICATES.money);
  return html`<section class="card accent-money ${day.money.done ? 'is-done' : ''}">
    <div class="card-head"><h2>💰 Dagens pengasteg</h2>${action ? html`<span class="tag">${MONEY_CATEGORIES[action.cat] || ''}</span>` : ''}</div>
    ${action ? html`<p class="big-text">${action.text}</p>` : ''}
    <div class="row wrap">
      ${day.money.done
        ? html`<button class="btn btn-done" data-action="today.money" aria-pressed="true">${icon('check', 18)} Klart</button>`
        : html`<button class="btn btn-primary" data-action="today.money" aria-pressed="false">Klart!</button>
               <button class="btn btn-ghost" data-action="today.moneySwap">${icon('shuffle', 18)} Byt</button>`}
      <button class="btn btn-ghost" data-action="sheet.income">+ Inkomst</button>
    </div>
    ${goal > 0
      ? html`<div class="month-progress">
          <div class="row between small"><span>${C.formatMonth(mk)}: <strong>${C.formatSek(earned)}</strong> av ${C.formatSek(goal)}</span><span class="muted">${Math.round(f.pct * 100)} %</span></div>
          ${meter(f.pct, { label: 'Månadens inkomstmål', tone: f.reached ? 'meter-good' : '' })}
        </div>`
      : html`<p class="small muted">Sätt ett månadsmål under Inställningar → Pengar för att följa takten.</p>`}
    ${s ? html`<p class="small muted streak">🔥 ${s} ${s === 1 ? 'dag' : 'dagar'} i rad</p>` : ''}
  </section>`;
}

function habitsCard(ctx, day) {
  const habits = C.activeHabits(ctx.state);
  return html`<section class="card">
    <div class="card-head"><h2>🌱 Vanor</h2><a class="btn-link" href="#/installningar?s=vanor">Ändra</a></div>
    ${habits.length
      ? html`<div class="habits">${habits.map((h) => {
          const on = Boolean(day.habits[h.id]);
          const st = C.streak(ctx.state, ctx.key, C.PREDICATES.habit(h.id));
          return html`<button class="habit ${on ? 'on' : ''}" data-action="today.habit" data-id="${h.id}" aria-pressed="${on}">
            <span class="habit-icon" aria-hidden="true">${h.icon}</span>
            <span class="habit-name">${h.name}</span>
            ${st ? html`<span class="habit-streak" aria-label="${st} dagar i rad">🔥${st}</span>` : ''}
          </button>`;
        })}</div>`
      : html`<p class="empty">Inga vanor ännu. <a href="#/installningar?s=vanor">Välj några</a> – små saker du vill göra varje dag.</p>`}
  </section>`;
}

function reflectionCard(ctx, day) {
  if (day.reflection) {
    const r = day.reflection;
    return html`<section class="card">
      <div class="card-head"><h2>🌙 Kvällsreflektion</h2><button class="btn-link" data-action="today.reflectionEdit">Ändra</button></div>
      <dl class="reflection">
        ${r.wins ? html`<dt>Dagens vinst</dt><dd>${r.wins}</dd>` : ''}
        ${r.gratitude ? html`<dt>Tacksam för</dt><dd>${r.gratitude}</dd>` : ''}
        ${r.lesson ? html`<dt>Lärdom</dt><dd>${r.lesson}</dd>` : ''}
        ${r.tomorrow ? html`<dt>Viktigast imorgon</dt><dd>${r.tomorrow}</dd>` : ''}
      </dl>
    </section>`;
  }
  const evening = ctx.hour >= 17 || ctx.hour < 4;
  return html`<details class="card reflect"${attr(evening, 'open')}>
    <summary><h2>🌙 Kvällsreflektion</h2><span class="small muted">${evening ? '2 minuter' : 'Efter kl. 17'}</span></summary>
    ${reflectionForm(ctx.state, day.reflection || {})}
  </details>`;
}

function reflectionForm(state, r) {
  return html`<form data-form="today.reflection" class="stack">
    <label class="field"><span>Dagens vinst – stor eller liten</span><input name="wins" maxlength="200" value="${r.wins || ''}" autocomplete="off"></label>
    <label class="field"><span>Jag är tacksam för…</span><input name="gratitude" maxlength="200" value="${r.gratitude || ''}" autocomplete="off"></label>
    <label class="field"><span>Ett minne med barnen idag (sparas i minnesbanken)</span>
      <textarea name="memory" rows="2" maxlength="2000" placeholder="Något de sa, gjorde eller lärde sig"></textarea></label>
    ${state.kids.length ? html`<label class="field"><span>Vem gällde minnet?</span><select name="kidId"><option value="">Hela familjen</option>${state.kids.map((k) => html`<option value="${k.id}">${k.name}</option>`)}</select></label>` : ''}
    <label class="field"><span>Det här lärde jag mig / gör annorlunda</span><input name="lesson" maxlength="200" value="${r.lesson || ''}" autocomplete="off"></label>
    <label class="field"><span>Viktigast imorgon</span><input name="tomorrow" maxlength="140" value="${r.tomorrow || ''}" autocomplete="off"></label>
    <div class="chips" role="radiogroup" aria-label="Område för morgondagen">
      ${C.AREAS.map((a) => html`<label class="chip-check"><input type="radio" name="tomorrowArea" value="${a.id}"${attr((r.tomorrowArea || 'money') === a.id, 'checked')}><span>${a.icon} ${a.name}</span></label>`)}
    </div>
    <button class="btn btn-primary btn-block">Avsluta dagen</button>
  </form>`;
}

function weekFocusCard(ctx) {
  const review = ctx.state.weeks[C.weekKey(ctx.key)];
  const top = review ? (review.top3 || []).filter((t) => String(t).trim()) : [];
  if (!top.length) return '';
  return html`<section class="card card-quiet">
    <div class="card-head"><h2>🗓️ Veckans fokus</h2><a class="btn-link" href="#/vecka">Vecka ${C.isoWeek(ctx.key).week}</a></div>
    <ol class="week-top">${top.map((t) => html`<li>${t}</li>`)}</ol>
  </section>`;
}

function memoryCard(ctx) {
  const r = resurfacedMemory(ctx.state, ctx.key);
  if (!r) return '';
  const kid = ctx.state.kids.find((k) => k.id === r.memory.kidId);
  return html`<section class="card card-memory">
    <p class="eyebrow">${r.title} · ${C.formatDateShort(r.memory.date)}${r.memory.date.slice(0, 4) !== ctx.key.slice(0, 4) ? ` ${r.memory.date.slice(0, 4)}` : ''}</p>
    <p class="memory-text">${r.memory.kind === 'quote' ? `”${r.memory.text}”` : r.memory.text}</p>
    ${kid ? html`<p class="small muted">${kidDot(kid)} ${kid.name}</p>` : ''}
  </section>`;
}

export function render(ctx) {
  const { state, key } = ctx;
  const day = C.getDay(state, key) || C.emptyDay();
  const habitIds = C.activeHabits(state).map((h) => h.id);
  const score = C.dayScore(day, habitIds);
  const checkinStreak = C.streak(state, key, C.PREDICATES.checkin);
  const dad = C.dadMinutesOn(state, key).total;
  const focus = C.focusMinutesOn(state, key);
  const name = state.profile.name ? `, ${state.profile.name}` : '';
  return html`
    <section class="hero">
      <div class="hero-text">
        <p class="eyebrow">${C.formatDateLong(key)} · v. ${C.isoWeek(key).week}</p>
        <h1>${C.greeting(ctx.hour)}${name}</h1>
        <p class="hero-sub">${score.score >= 80 ? 'Stark dag. Fortsätt så.' : score.score >= 40 ? 'Bra fart – ett steg i taget.' : 'En ny dag. Börja litet.'}</p>
      </div>
      <button class="score" data-action="today.scoreInfo" aria-label="Dagspoäng ${score.score} av 100. Visa detaljer.">
        ${ring(score.score / 100, { label: String(score.score), sub: 'dagspoäng' })}
      </button>
    </section>
    <div class="stat-row">
      <div class="stat"><span class="stat-label">Check-in-svit</span><span class="stat-value">${checkinStreak ? `🔥 ${checkinStreak}` : '–'}</span></div>
      <div class="stat"><span class="stat-label">Fokus idag</span><span class="stat-value">${focus ? C.formatMinutes(focus) : '–'}</span></div>
      <div class="stat"><span class="stat-label">Pappatid idag</span><span class="stat-value">${dad ? C.formatMinutes(dad) : '–'}</span></div>
    </div>
    <div class="quick-row">
      <button class="quick" data-action="today.plan">${icon('week', 20)}<span>Planera dagen</span></button>
      <a class="quick" href="#/fokus">${icon('focus', 20)}<span>Fokuspass</span></a>
      <button class="quick" data-action="sheet.presence">${icon('leaf', 20)}<span>Närvaroläge</span></button>
    </div>
    ${checkinCard(day)}
    ${prioritiesCard(day)}
    ${weekFocusCard(ctx)}
    ${missionCard(ctx, day)}
    ${moneyCard(ctx, day)}
    ${habitsCard(ctx, day)}
    ${memoryCard(ctx)}
    ${reflectionCard(ctx, day)}
  `;
}

function scoreSheet(ctx) {
  const day = C.getDay(ctx.state, ctx.key) || C.emptyDay();
  const score = C.dayScore(day, C.activeHabits(ctx.state).map((h) => h.id));
  return html`${sheetHead(`Dagspoäng ${score.score}/100`, 'Poängen mäter balans, inte prestation. 70+ är en riktigt bra dag.')}
    <ul class="score-parts">
      ${score.parts.filter((p) => p.max > 0).map((p) => html`<li>
        <div class="row between"><span>${p.label}</span><span class="muted">${p.earned}/${p.max}</span></div>
        ${meter(p.earned / p.max, { label: p.label })}
      </li>`)}
    </ul>`;
}

function planSheet(ctx) {
  const plan = planDay(ctx.state, ctx.key);
  return html`${sheetHead('Din plan för idag', plan.tired ? 'Anpassad efter låg energi.' : 'Byggd av dina prioriteringar, uppdrag och tider.')}
    <ol class="timeline">
      ${plan.blocks.map((b) => html`<li class="area-${b.area}">
        <span class="tl-time">${b.time}${b.end ? html`<br><span class="muted">${b.end}</span>` : ''}</span>
        <span class="tl-body"><strong>${b.title}</strong><span>${b.detail}</span></span>
      </li>`)}
    </ol>
    <div class="row wrap">
      <a class="btn btn-ghost" href="#/coach" data-action="sheet.close">${icon('spark', 18)} Fråga coachen</a>
      <a class="btn btn-ghost" href="#/installningar?s=rytm" data-action="sheet.close">Ändra tider</a>
    </div>`;
}

const str = (fd, k) => String(fd.get(k) ?? '').trim();

export const actions = {
  'today.scoreInfo': (ctx) => openSheet(scoreSheet(ctx)),
  'today.plan': (ctx) => openSheet(planSheet(ctx)),
  'today.mission': (ctx) => {
    ctx.update((s) => {
      const d = C.ensureDay(s, ctx.key);
      d.mission.done = !d.mission.done;
    });
    if (C.getDay(ctx.store.get(), ctx.key).mission.done) toast('Snyggt, pappa! 💛');
  },
  'today.missionSwap': (ctx) => ctx.update((s) => { C.ensureDay(s, ctx.key).mission.offset += 1; }),
  'today.money': (ctx) => {
    ctx.update((s) => {
      const d = C.ensureDay(s, ctx.key);
      d.money.done = !d.money.done;
    });
    if (C.getDay(ctx.store.get(), ctx.key).money.done) toast('Ett steg närmare målet 💰');
  },
  'today.moneySwap': (ctx) => ctx.update((s) => { C.ensureDay(s, ctx.key).money.offset += 1; }),
  'today.habit': (ctx, el) => ctx.update((s) => {
    const d = C.ensureDay(s, ctx.key);
    if (d.habits[el.dataset.id]) delete d.habits[el.dataset.id];
    else d.habits[el.dataset.id] = true;
  }),
  'today.reflectionEdit': (ctx) => {
    const day = C.getDay(ctx.state, ctx.key);
    openSheet(html`${sheetHead('Ändra reflektion')}${reflectionForm(ctx.state, (day && day.reflection) || {})}`);
  },
};

export const changes = {
  'today.prioDone': (ctx, el) => ctx.update((s) => {
    C.ensureDay(s, ctx.key).priorities[el.dataset.area].done = el.checked;
  }),
};

// Priority text saves silently on every keystroke. Re-rendering on blur would
// swallow the tap that moved focus to the next field, so only the row's own
// checkbox is patched in place.
export const binds = {
  'today.prio': (ctx, el) => {
    ctx.update((s) => {
      const p = C.ensureDay(s, ctx.key).priorities[el.dataset.area];
      p.text = el.value.slice(0, 140);
      if (!p.text.trim()) p.done = false;
    }, { silent: true });
    const box = el.closest('.prio') && el.closest('.prio').querySelector('input[type=checkbox]');
    if (box) {
      box.disabled = !el.value.trim();
      if (box.disabled) box.checked = false;
    }
  },
};

export const forms = {
  'today.checkin': (ctx, fd) => {
    const val = (k) => C.clamp(Math.round(C.num(fd.get(k), 3)), 1, 5);
    const wasEmpty = !(C.getDay(ctx.state, ctx.key) || {}).checkin;
    ctx.update((s) => {
      C.ensureDay(s, ctx.key).checkin = { sleep: val('sleep'), energy: val('energy'), mood: val('mood'), intention: str(fd, 'intention'), at: new Date().toISOString() };
    });
    closeSheet();
    if (wasEmpty) toast('Dagen är igång ☀️ Skriv dagens tre nedan.');
  },
  'today.reflection': (ctx, fd) => {
    const memory = str(fd, 'memory');
    ctx.update((s) => {
      const d = C.ensureDay(s, ctx.key);
      const prev = d.reflection || {};
      d.reflection = {
        wins: str(fd, 'wins'),
        gratitude: str(fd, 'gratitude'),
        lesson: str(fd, 'lesson'),
        tomorrow: str(fd, 'tomorrow'),
        tomorrowArea: str(fd, 'tomorrowArea') || 'money',
        at: prev.at || new Date().toISOString(),
      };
      if (memory) s.memories.push({ id: C.uid('m'), date: ctx.key, kidId: str(fd, 'kidId'), kind: 'moment', text: memory, createdAt: new Date().toISOString() });
      // If tomorrow already exists (edited late), keep it in sync with the new plan.
      const next = s.days[C.addDays(ctx.key, 1)];
      if (next && d.reflection.tomorrow && !Object.values(next.priorities).some((p) => p.text.trim())) {
        next.priorities[d.reflection.tomorrowArea] = { text: d.reflection.tomorrow, done: false };
      }
    });
    closeSheet();
    toast('Bra jobbat idag. Sov gott 🌙');
  },
};
