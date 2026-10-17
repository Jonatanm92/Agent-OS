// Vecka: the Sunday review. Numbers, patterns the offline coach finds, the
// week's wins and memories, habits grid and next week's plan.

import * as C from '../core.js';
import { html, icon, columns, download, toast } from '../ui.js';
import { kidDot, kidColor } from '../sheets.js';

function ui(ctx) {
  ctx.ui.week = ctx.ui.week || { offset: 0 };
  return ctx.ui.week;
}

const fmt1 = (v) => (v == null ? '–' : C.formatDecimal(v));

function reviewForm(ctx, wk, review) {
  const r = review || {};
  const top = r.top3 || ['', '', ''];
  return html`<form class="card" data-form="week.review">
    <div class="card-head"><h2>✍️ Veckogenomgång</h2>${r.savedAt ? html`<span class="small muted">sparad ${C.formatDateShort(r.savedAt.slice(0, 10))}</span>` : ''}</div>
    <input type="hidden" name="week" value="${wk}">
    <label class="field"><span>Vad gick bra den här veckan?</span><textarea name="wentWell" rows="2" maxlength="600">${r.wentWell || ''}</textarea></label>
    <label class="field"><span>Vad gör jag annorlunda nästa vecka?</span><textarea name="improve" rows="2" maxlength="600">${r.improve || ''}</textarea></label>
    <fieldset class="field"><legend>Nästa veckas tre viktigaste</legend>
      ${[0, 1, 2].map((i) => html`<input name="top${i}" maxlength="140" value="${top[i] || ''}" placeholder="${['Familj…', 'Pengar…', 'Jag…'][i]}" aria-label="Viktigast ${i + 1}" autocomplete="off">`)}
    </fieldset>
    <label class="field"><span>Familjeplan (1:1 med varje barn, en familjeaktivitet)</span><textarea name="familyPlan" rows="2" maxlength="600" placeholder="Lördag: pappa-dejt med … Söndag: skogsbingo">${r.familyPlan || ''}</textarea></label>
    <label class="field"><span>Pengaplan (veckans pengamål och viktigaste säljsteg)</span><textarea name="moneyPlan" rows="2" maxlength="600">${r.moneyPlan || ''}</textarea></label>
    <p class="small muted">Nästa veckas tre visas på Idag-sidan hela veckan.</p>
    <button class="btn btn-primary btn-block">Spara veckan</button>
  </form>`;
}

export function render(ctx) {
  const u = ui(ctx);
  const current = C.weekKey(ctx.key);
  const wk = C.shiftWeek(current, u.offset);
  const s = C.weekSummary(ctx.state, wk, ctx.key);
  const prev = C.weekSummary(ctx.state, C.shiftWeek(wk, -1), ctx.key);
  const insights = C.weeklyInsights(s, prev, ctx.state);
  // The plan written during week N is for week N+1, so it is stored on N+1.
  const planWeek = C.shiftWeek(wk, 1);
  const review = ctx.state.weeks[planWeek];
  const kids = ctx.state.kids;
  const toneClass = { good: 'note-good', tip: 'note-tip', care: 'note-care' };
  return html`
    <section class="page-head row between">
      <div>
        <h1>Vecka ${C.weekNumber(wk)}</h1>
        <p class="hero-sub">${C.formatDateShort(s.keys[0])} – ${C.formatDateShort(s.keys[6])}${u.offset === 0 ? ' · denna vecka' : ''}</p>
      </div>
      <div class="row">
        <button class="btn-icon" data-action="week.shift" data-dir="-1" aria-label="Föregående vecka">${icon('left')}</button>
        <button class="btn-icon" data-action="week.shift" data-dir="1" aria-label="Nästa vecka"${u.offset >= 0 ? ' disabled' : ''}>${icon('right')}</button>
      </div>
    </section>
    <div class="stat-grid">
      <div class="stat"><span class="stat-label">Snittpoäng</span><span class="stat-value">${s.avgScore}</span></div>
      <div class="stat"><span class="stat-label">Pappatid</span><span class="stat-value">${C.formatMinutes(s.dadMinutes)}</span></div>
      <div class="stat"><span class="stat-label">Fokus</span><span class="stat-value">${C.formatMinutes(s.focusMinutes)}</span></div>
      <div class="stat"><span class="stat-label">Inkomst</span><span class="stat-value">${C.formatSek(s.income)}</span></div>
      <div class="stat"><span class="stat-label">Vanor</span><span class="stat-value">${s.habitRate == null ? '–' : `${Math.round(s.habitRate * 100)} %`}</span></div>
      <div class="stat"><span class="stat-label">Energi snitt</span><span class="stat-value">${fmt1(s.avgEnergy)}</span></div>
    </div>
    <section class="card">
      <div class="card-head"><h2>Dagspoäng</h2><span class="small muted">0–100</span></div>
      ${columns(s.days.map((d) => ({ label: d.label, value: d.score, title: C.formatDateLong(d.key), highlight: d.key === ctx.key, muted: d.future })), { format: (v) => String(v), empty: 'Inga loggade dagar den här veckan.' })}
      <table class="table mini">
        <thead><tr><th scope="col"></th>${s.days.map((d) => html`<th scope="col">${d.label}</th>`)}</tr></thead>
        <tbody>
          <tr><th scope="row">Sömn</th>${s.days.map((d) => html`<td>${d.sleep ?? '·'}</td>`)}</tr>
          <tr><th scope="row">Energi</th>${s.days.map((d) => html`<td>${d.energy ?? '·'}</td>`)}</tr>
          <tr><th scope="row">Humör</th>${s.days.map((d) => html`<td>${d.mood ?? '·'}</td>`)}</tr>
        </tbody>
      </table>
    </section>
    ${insights.length
      ? html`<section class="card"><div class="card-head"><h2>✦ Det här ser coachen</h2></div>
          ${insights.map((i) => html`<p class="note ${toneClass[i.tone] || 'note-tip'}">${i.text}</p>`)}
        </section>`
      : ''}
    ${kids.length
      ? html`<section class="card"><div class="card-head"><h2>Pappatid per barn</h2></div>
          <ul class="bar-list">${kids.map((k) => {
            const m = s.dadByKid[k.id] || 0;
            const max = Math.max(1, ...kids.map((x) => s.dadByKid[x.id] || 0), ctx.state.settings.dadGoalPerKid);
            return html`<li><span class="bar-name">${kidDot(k)}${k.name}</span><span class="bar-track"><span class="bar-fill k${kidColor(k)}" style="width:${Math.round((m / max) * 100)}%"></span></span><span class="bar-val">${C.formatMinutes(m)}</span></li>`;
          })}</ul>
        </section>`
      : ''}
    ${s.habitStats.length
      ? html`<section class="card"><div class="card-head"><h2>Vanor</h2></div>
          <table class="table habit-grid">
            <thead><tr><th scope="col">Vana</th>${s.days.map((d) => html`<th scope="col">${d.label.slice(0, 2)}</th>`)}<th scope="col" class="num">Klart</th></tr></thead>
            <tbody>${s.habitStats.map((h) => html`<tr><th scope="row">${h.icon} ${h.name}</th>${h.days.map((on, i) => html`<td><span class="dot ${on ? 'on' : ''} ${s.days[i].future ? 'future' : ''}" aria-label="${on ? 'klar' : 'ej klar'}"></span></td>`)}<td class="num">${h.done}/${h.of}</td></tr>`)}</tbody>
          </table>
        </section>`
      : ''}
    ${s.wins.length || s.memories.length
      ? html`<section class="card"><div class="card-head"><h2>🏆 Veckans höjdpunkter</h2></div>
          <ul class="highlights">
            ${s.wins.map((w) => html`<li><span class="tag">${C.formatWeekday(w.key)}</span> ${w.text}</li>`)}
            ${s.memories.map((m) => html`<li><span class="tag">💛</span> ${m.kind === 'quote' ? `”${m.text}”` : m.text}</li>`)}
          </ul>
        </section>`
      : ''}
    ${reviewForm(ctx, planWeek, review)}
    <section class="card card-quiet">
      <div class="card-head"><h2>Spara veckan</h2></div>
      <p class="small muted">Som Markdown – perfekt för din Obsidian-vault, eller direkt till Agent OS-minnet så att dina agenter vet hur veckan gick.</p>
      <div class="row wrap">
        <button class="btn btn-ghost" data-action="week.export" data-week="${wk}">${icon('download', 18)} Ladda ner .md</button>
        ${ctx.server.available ? html`<button class="btn btn-ghost" data-action="week.vault" data-week="${wk}">${icon('upload', 18)} Spara i Agent OS-minnet</button>` : ''}
      </div>
    </section>
  `;
}

function markdownFor(ctx, wk) {
  const summary = C.weekSummary(ctx.state, wk, ctx.key);
  return C.weekToMarkdown(summary, ctx.state.weeks[C.shiftWeek(wk, 1)], ctx.state);
}

export const actions = {
  'week.shift': (ctx, el) => {
    const u = ui(ctx);
    u.offset = Math.min(0, u.offset + Number(el.dataset.dir));
    ctx.render();
  },
  'week.export': (ctx, el) => download(`life-os-${el.dataset.week}.md`, markdownFor(ctx, el.dataset.week), 'text/markdown'),
  'week.vault': async (ctx, el) => {
    try {
      await ctx.api('/api/vault', { method: 'POST', body: { name: el.dataset.week, content: markdownFor(ctx, el.dataset.week) } });
      toast('Sparat i Agent OS-minnet under ”Life OS/” 🧠');
    } catch (e) {
      toast(`Kunde inte spara: ${e.message}`);
    }
  },
};

export const forms = {
  'week.review': (ctx, fd) => {
    const wk = String(fd.get('week'));
    ctx.update((s) => {
      s.weeks[wk] = {
        wentWell: String(fd.get('wentWell') || '').trim(),
        improve: String(fd.get('improve') || '').trim(),
        top3: [0, 1, 2].map((i) => String(fd.get(`top${i}`) || '').trim()),
        familyPlan: String(fd.get('familyPlan') || '').trim(),
        moneyPlan: String(fd.get('moneyPlan') || '').trim(),
        savedAt: new Date().toISOString(),
      };
    });
    toast(`Vecka ${C.weekNumber(wk)} är planerad ✓`);
  },
};
