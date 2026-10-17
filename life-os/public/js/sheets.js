// Shared bottom-sheet forms used from several screens and the + button:
// memories, income, hours, deals, savings, priorities, check-in, presence mode
// and logging an activity with the kids.

import * as C from './core.js';
import { ACTIVITIES } from './content.js';
import { html, icon, attr, scale, sheetHead, openSheet, closeSheet, toast } from './ui.js';
import { startTimer } from './timer.js';

export const MEMORY_KINDS = [
  { id: 'moment', name: 'Stund', icon: '💛' },
  { id: 'quote', name: 'Citat', icon: '💬' },
  { id: 'milestone', name: 'Milstolpe', icon: '⭐' },
];

export function kidColor(kid) {
  return Number.isInteger(kid.color) ? kid.color % 8 : 0;
}

export function kidDot(kid) {
  return html`<i class="kid-dot k${kidColor(kid)}" aria-hidden="true"></i>`;
}

export function kidChecks(kids, selected = [], name = 'kids') {
  if (!kids.length) return html`<p class="small muted">Lägg till barn under Inställningar för att logga per barn.</p>`;
  return html`<div class="chips">${kids.map((k) => html`<label class="chip-check">
    <input type="checkbox" name="${name}" value="${k.id}"${attr(selected.includes(k.id), 'checked')}>
    <span>${kidDot(k)}${k.name}</span>
  </label>`)}</div>`;
}

function streamOptions(state, selected) {
  return state.settings.streams.map((s) => html`<option value="${s.id}"${attr(s.id === selected, 'selected')}>${s.name}</option>`);
}

const str = (fd, k) => String(fd.get(k) ?? '').trim();

// ── Sheet renderers ──────────────────────────────────────────────────────────

function captureMenu() {
  const items = [
    ['sheet.memory', '💛', 'Minne med barnen', 'Ett citat, en stund eller en milstolpe'],
    ['sheet.income', '💰', 'Inkomst', 'Pengar som kommit in'],
    ['sheet.hours', '⏱️', 'Timmar', 'Tid lagd på en inkomstström'],
    ['sheet.deal', '🤝', 'Ny affär / lead', 'Till pipelinen'],
    ['sheet.priority', '🎯', 'Prioritet idag', 'Byt en av dagens tre'],
    ['sheet.presence', '🌿', 'Närvaroläge', 'Mobilen bort, tiden räknas'],
  ];
  return html`${sheetHead('Snabbanteckning')}
    <div class="menu-list">
      ${items.map(([action, emoji, title, sub]) => html`<button type="button" class="menu-item" data-action="${action}">
        <span class="menu-emoji" aria-hidden="true">${emoji}</span>
        <span><strong>${title}</strong><span class="small muted">${sub}</span></span>
        ${icon('right', 18)}
      </button>`)}
    </div>`;
}

export function memorySheet(state, { kidId = '', text = '', kind = 'moment', date } = {}) {
  const key = date || C.todayKey();
  return html`<form data-form="sheet.memory" class="stack">
    ${sheetHead('Spara ett minne', 'Små stunder blir stora minnen. Allt sparas bara på din enhet.')}
    <div class="chips" role="radiogroup" aria-label="Typ av minne">
      ${MEMORY_KINDS.map((k) => html`<label class="chip-check"><input type="radio" name="kind" value="${k.id}"${attr(k.id === kind, 'checked')}><span>${k.icon} ${k.name}</span></label>`)}
    </div>
    <label class="field"><span>Vad hände?</span>
      <textarea name="text" rows="4" maxlength="2000" required placeholder="”Pappa, vet du att månen följer efter bilen?”">${text}</textarea></label>
    <div class="grid-2">
      <label class="field"><span>Vem</span>
        <select name="kidId">
          <option value="">Hela familjen</option>
          ${state.kids.map((k) => html`<option value="${k.id}"${attr(k.id === kidId, 'selected')}>${k.name}</option>`)}
        </select></label>
      <label class="field"><span>Datum</span><input type="date" name="date" value="${key}" max="${C.todayKey()}" required></label>
    </div>
    <button class="btn btn-primary btn-block">Spara minne</button>
  </form>`;
}

function incomeSheet(state) {
  return html`<form data-form="sheet.income" class="stack">
    ${sheetHead('Logga inkomst', 'Allt som kommer in – faktura betald, lön, sålda prylar.')}
    <label class="field"><span>Belopp (kr)</span><input name="amount" inputmode="decimal" required placeholder="1 900" autocomplete="off"></label>
    <div class="grid-2">
      <label class="field"><span>Ström</span><select name="streamId">${streamOptions(state, state.settings.streams[0].id)}</select></label>
      <label class="field"><span>Datum</span><input type="date" name="date" value="${C.todayKey()}" required></label>
    </div>
    <label class="field"><span>Notering (valfritt)</span><input name="note" maxlength="140" placeholder="T.ex. Pilot – Kommun X"></label>
    <button class="btn btn-primary btn-block">Spara inkomst</button>
  </form>`;
}

function hoursSheet(state) {
  return html`<form data-form="sheet.hours" class="stack">
    ${sheetHead('Logga timmar', 'Så ser du vad varje ström ger per timme.')}
    <div class="grid-2">
      <label class="field"><span>Timmar</span><input name="hours" inputmode="decimal" required placeholder="1,5" autocomplete="off"></label>
      <label class="field"><span>Datum</span><input type="date" name="date" value="${C.todayKey()}" required></label>
    </div>
    <label class="field"><span>Ström</span><select name="streamId">${streamOptions(state, state.settings.streams[0].id)}</select></label>
    <label class="field"><span>Vad gjorde du? (valfritt)</span><input name="note" maxlength="140"></label>
    <button class="btn btn-primary btn-block">Spara timmar</button>
  </form>`;
}

export function dealSheet(state, deal = null) {
  const d = deal || { title: '', streamId: state.settings.streams[0].id, value: '', stage: 'lead', nextStep: '', nextDate: C.addDays(C.todayKey(), 2) };
  return html`<form data-form="sheet.deal" class="stack">
    ${sheetHead(deal ? 'Redigera affär' : 'Ny affär', 'Varje affär ska ha ett nästa steg och ett datum.')}
    <input type="hidden" name="id" value="${deal ? deal.id : ''}">
    <label class="field"><span>Kund / affär</span><input name="title" required maxlength="80" value="${d.title}" placeholder="T.ex. Byggfirma AB – anbud"></label>
    <div class="grid-2">
      <label class="field"><span>Värde (kr)</span><input name="value" inputmode="decimal" value="${d.value}" placeholder="1 900"></label>
      <label class="field"><span>Steg</span><select name="stage">${C.STAGES.map((s) => html`<option value="${s.id}"${attr(s.id === d.stage, 'selected')}>${s.name}</option>`)}</select></label>
    </div>
    <label class="field"><span>Ström</span><select name="streamId">${streamOptions(state, d.streamId)}</select></label>
    <div class="grid-2">
      <label class="field"><span>Nästa steg</span><input name="nextStep" maxlength="100" value="${d.nextStep}" placeholder="Ring och fråga om beslut"></label>
      <label class="field"><span>Datum</span><input type="date" name="nextDate" value="${d.nextDate || ''}"></label>
    </div>
    <div class="row">
      <button class="btn btn-primary grow">${deal ? 'Spara' : 'Lägg till'}</button>
      ${deal ? html`<button type="button" class="btn btn-ghost danger" data-action="money.dealDelete" data-id="${deal.id}">${icon('trash', 18)} Ta bort</button>` : ''}
    </div>
  </form>`;
}

function savingSheet(saving = null) {
  const s = saving || { name: '', target: '', saved: '' };
  return html`<form data-form="sheet.saving" class="stack">
    ${sheetHead(saving ? 'Redigera sparmål' : 'Nytt sparmål', 'Buffert först, sedan drömmar.')}
    <input type="hidden" name="id" value="${saving ? saving.id : ''}">
    <label class="field"><span>Namn</span><input name="name" required maxlength="60" value="${s.name}" placeholder="Buffert, semester, ny gitarr…"></label>
    <div class="grid-2">
      <label class="field"><span>Mål (kr)</span><input name="target" inputmode="decimal" required value="${s.target}"></label>
      <label class="field"><span>Sparat hittills (kr)</span><input name="saved" inputmode="decimal" value="${s.saved}"></label>
    </div>
    <div class="row">
      <button class="btn btn-primary grow">Spara</button>
      ${saving ? html`<button type="button" class="btn btn-ghost danger" data-action="money.savingDelete" data-id="${saving.id}">${icon('trash', 18)} Ta bort</button>` : ''}
    </div>
  </form>`;
}

function depositSheet(saving) {
  return html`<form data-form="sheet.deposit" class="stack">
    ${sheetHead(`Sätt in på ${saving.name}`, `${C.formatSek(saving.saved)} av ${C.formatSek(saving.target)}`)}
    <input type="hidden" name="id" value="${saving.id}">
    <label class="field"><span>Belopp (kr) – negativt för uttag</span><input name="amount" inputmode="decimal" required autocomplete="off" placeholder="500"></label>
    <div class="chips">${[100, 250, 500, 1000].map((v) => html`<button type="button" class="chip" data-action="sheet.fill" data-target="amount" data-value="${v}">+${C.formatNumber(v)}</button>`)}</div>
    <button class="btn btn-primary btn-block">Spara</button>
  </form>`;
}

function prioritySheet(state, key) {
  const day = C.getDay(state, key) || C.emptyDay();
  return html`<form data-form="sheet.priority" class="stack">
    ${sheetHead('Prioritet idag', 'Dagens tre: en för familjen, en för pengarna, en för dig.')}
    <div class="chips" role="radiogroup" aria-label="Område">
      ${C.AREAS.map((a, i) => html`<label class="chip-check"><input type="radio" name="area" value="${a.id}"${attr(i === 0, 'checked')}><span>${a.icon} ${a.name}${day.priorities[a.id].text ? ' •' : ''}</span></label>`)}
    </div>
    <label class="field"><span>Vad är viktigast?</span><input name="text" required maxlength="140" autocomplete="off"></label>
    <p class="small muted">• = området har redan en prioritet som ersätts.</p>
    <button class="btn btn-primary btn-block">Spara</button>
  </form>`;
}

export function checkinFields(checkin = {}) {
  return html`${scale('sleep', 'Sömn i natt', checkin.sleep, ['😫', '😴', '😐', '🙂', '🌟'])}
    ${scale('energy', 'Energi just nu', checkin.energy, ['🪫', '😮‍💨', '😐', '⚡', '🚀'])}
    ${scale('mood', 'Humör', checkin.mood, ['😞', '😕', '😐', '🙂', '😄'])}
    <label class="field"><span>Dagens intention (valfritt)</span>
      <input name="intention" maxlength="120" value="${checkin.intention || ''}" placeholder="T.ex. Lugn, närvarande och ett modigt säljsamtal" autocomplete="off"></label>`;
}

function checkinSheet(state, key) {
  const day = C.getDay(state, key) || C.emptyDay();
  return html`<form data-form="today.checkin" class="stack">
    ${sheetHead('Ändra check-in')}
    ${checkinFields(day.checkin || {})}
    <button class="btn btn-primary btn-block">Spara</button>
  </form>`;
}

function presenceSheet(state) {
  return html`<form data-form="sheet.presence" class="stack">
    ${sheetHead('Närvaroläge', 'Lägg ifrån dig mobilen. Tiden räknas som pappatid för de barn du väljer.')}
    ${kidChecks(state.kids, state.kids.map((k) => k.id))}
    <label class="field"><span>Vad ska ni göra? (valfritt)</span><input name="label" maxlength="80" placeholder="Lek, middag, läggning…" autocomplete="off"></label>
    <button class="btn btn-primary btn-block">${icon('leaf', 18)} Starta närvaro</button>
  </form>`;
}

function activitySheet(state, activity) {
  return html`<form data-form="sheet.activity" class="stack">
    ${sheetHead(`Gjort: ${activity.title}`, 'Loggas som pappatid och kan sparas som ett minne.')}
    <input type="hidden" name="activityId" value="${activity.id}">
    ${kidChecks(state.kids, state.kids.map((k) => k.id))}
    <label class="field"><span>Minuter</span><input name="minutes" inputmode="numeric" value="${activity.minutes}" required></label>
    <label class="field"><span>Ett minne från stunden (valfritt)</span><textarea name="memory" rows="3" maxlength="2000" placeholder="Vad sa eller gjorde barnen?"></textarea></label>
    <button class="btn btn-primary btn-block">Spara</button>
  </form>`;
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const actions = {
  'sheet.close': () => closeSheet(),
  'sheet.capture': () => openSheet(captureMenu()),
  'sheet.memory': (ctx, el) => openSheet(memorySheet(ctx.state, { kidId: el.dataset.kid || '', text: el.dataset.text || '' })),
  'sheet.income': (ctx) => openSheet(incomeSheet(ctx.state)),
  'sheet.hours': (ctx) => openSheet(hoursSheet(ctx.state)),
  'sheet.deal': (ctx, el) => openSheet(dealSheet(ctx.state, ctx.state.deals.find((d) => d.id === el.dataset.id) || null)),
  'sheet.saving': (ctx, el) => openSheet(savingSheet(ctx.state.savings.find((s) => s.id === el.dataset.id) || null)),
  'sheet.deposit': (ctx, el) => {
    const s = ctx.state.savings.find((x) => x.id === el.dataset.id);
    if (s) openSheet(depositSheet(s));
  },
  'sheet.priority': (ctx) => openSheet(prioritySheet(ctx.state, ctx.key)),
  'sheet.checkin': (ctx) => openSheet(checkinSheet(ctx.state, ctx.key)),
  'sheet.presence': (ctx) => {
    if (ctx.state.timer) return toast('Avsluta pågående timer först.');
    openSheet(presenceSheet(ctx.state));
  },
  'sheet.activity': (ctx, el) => {
    const a = ACTIVITIES.find((x) => x.id === el.dataset.id);
    if (a) openSheet(activitySheet(ctx.state, a));
  },
  'sheet.fill': (_ctx, el) => {
    const input = el.closest('form').querySelector(`[name="${el.dataset.target}"]`);
    if (input) input.value = el.dataset.value;
  },
};

export const forms = {
  'sheet.memory': (ctx, fd) => {
    const text = str(fd, 'text');
    if (!text) return;
    ctx.update((s) => {
      s.memories.push({ id: C.uid('m'), date: str(fd, 'date') || ctx.key, kidId: str(fd, 'kidId'), kind: str(fd, 'kind') || 'moment', text, createdAt: new Date().toISOString() });
    });
    closeSheet();
    toast('Minnet är sparat 💛');
  },
  'sheet.income': (ctx, fd) => {
    const amount = C.num(str(fd, 'amount'), NaN);
    if (!Number.isFinite(amount) || amount === 0) return toast('Ange ett belopp.');
    ctx.update((s) => {
      s.income.push({ id: C.uid('i'), date: str(fd, 'date') || ctx.key, amount, streamId: str(fd, 'streamId'), note: str(fd, 'note'), createdAt: new Date().toISOString() });
    });
    closeSheet();
    toast(`${C.formatSek(amount)} loggat 💰`);
  },
  'sheet.hours': (ctx, fd) => {
    const hours = C.num(str(fd, 'hours'), NaN);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return toast('Ange timmar mellan 0 och 24.');
    ctx.update((s) => {
      s.hours.push({ id: C.uid('h'), date: str(fd, 'date') || ctx.key, hours, streamId: str(fd, 'streamId'), note: str(fd, 'note') });
    });
    closeSheet();
    toast(`${C.formatDecimal(hours)} h loggade`);
  },
  'sheet.deal': (ctx, fd) => {
    const id = str(fd, 'id');
    const fields = {
      title: str(fd, 'title'),
      value: Math.max(0, C.num(str(fd, 'value'))),
      stage: str(fd, 'stage') || 'lead',
      streamId: str(fd, 'streamId'),
      nextStep: str(fd, 'nextStep'),
      nextDate: str(fd, 'nextDate'),
      updatedAt: new Date().toISOString(),
    };
    if (!fields.title) return;
    ctx.update((s) => {
      const existing = s.deals.find((d) => d.id === id);
      if (existing) Object.assign(existing, fields);
      else s.deals.push({ id: C.uid('d'), createdAt: fields.updatedAt, ...fields });
    });
    closeSheet();
    toast(id ? 'Affären är uppdaterad' : 'Affären ligger i pipelinen 🤝');
  },
  'sheet.saving': (ctx, fd) => {
    const id = str(fd, 'id');
    const fields = { name: str(fd, 'name'), target: Math.max(0, C.num(str(fd, 'target'))), saved: Math.max(0, C.num(str(fd, 'saved'))) };
    if (!fields.name) return;
    ctx.update((s) => {
      const existing = s.savings.find((x) => x.id === id);
      if (existing) Object.assign(existing, fields);
      else s.savings.push({ id: C.uid('s'), ...fields });
    });
    closeSheet();
  },
  'sheet.deposit': (ctx, fd) => {
    const amount = C.num(str(fd, 'amount'), NaN);
    if (!Number.isFinite(amount) || amount === 0) return;
    ctx.update((s) => {
      const target = s.savings.find((x) => x.id === str(fd, 'id'));
      if (target) target.saved = Math.max(0, C.num(target.saved) + amount);
    });
    closeSheet();
    toast(amount > 0 ? `${C.formatSek(amount)} sparat. Snyggt!` : 'Uttaget är registrerat');
  },
  'sheet.priority': (ctx, fd) => {
    const area = str(fd, 'area');
    const text = str(fd, 'text');
    if (!text || !C.AREAS.some((a) => a.id === area)) return;
    ctx.update((s) => {
      C.ensureDay(s, ctx.key).priorities[area] = { text, done: false };
    });
    closeSheet();
  },
  'sheet.presence': (ctx, fd) => {
    startTimer(ctx.store, { kind: 'presence', label: str(fd, 'label'), kidIds: fd.getAll('kids').map(String) });
    closeSheet();
  },
  'sheet.activity': (ctx, fd) => {
    const minutes = Math.max(0, Math.min(600, Math.round(C.num(str(fd, 'minutes')))));
    const kids = fd.getAll('kids').map(String);
    const memory = str(fd, 'memory');
    const activity = ACTIVITIES.find((a) => a.id === str(fd, 'activityId'));
    ctx.update((s) => {
      const day = C.ensureDay(s, ctx.key);
      for (const id of kids.length ? kids : ['family']) day.dadMinutes[id] = (Number(day.dadMinutes[id]) || 0) + minutes;
      if (memory) {
        s.memories.push({ id: C.uid('m'), date: ctx.key, kidId: kids.length === 1 ? kids[0] : '', kind: 'moment', text: activity ? `${activity.title}: ${memory}` : memory, createdAt: new Date().toISOString() });
      }
    });
    closeSheet();
    toast(`${C.formatMinutes(minutes)} pappatid loggad 💛`);
  },
};
