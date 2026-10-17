// Pengar: monthly goal and pace, kronor per hour per income stream, a small
// sales pipeline with next steps, savings goals and buffer.

import * as C from '../core.js';
import { html, icon, meter, columns, toast } from '../ui.js';

function ui(ctx) {
  ctx.ui.money = ctx.ui.money || { showClosed: false, incomeLimit: 8 };
  return ctx.ui.money;
}

function monthCard(ctx) {
  const mk = C.monthKey(ctx.key);
  const goal = ctx.state.settings.monthlyIncomeGoal;
  const earned = C.incomeForMonth(ctx.state, mk);
  const f = C.moneyForecast(goal, earned, ctx.key);
  if (!goal) {
    return html`<form class="card" data-form="money.goal">
      <div class="card-head"><h2>${C.formatMonth(mk)}</h2></div>
      <p class="hero-number">${C.formatSek(earned)}</p>
      <p>Sätt ett månadsmål så räknar appen takt och vad som behövs per vecka.</p>
      <div class="row">
        <label class="field grow"><span>Inkomstmål per månad (kr)</span><input name="goal" inputmode="decimal" placeholder="30 000" required autocomplete="off"></label>
      </div>
      <button class="btn btn-primary">Sätt mål</button>
    </form>`;
  }
  return html`<section class="card">
    <div class="card-head"><h2>${C.formatMonth(mk)}</h2><span class="small muted">mål ${C.formatSek(goal)}</span></div>
    <p class="hero-number">${C.formatSek(earned)} <span class="hero-of">${Math.round(f.pct * 100)} %</span></p>
    ${meter(f.pct, { label: 'Andel av månadsmålet', tone: f.reached ? 'meter-good' : '' })}
    <div class="stat-row compact">
      <div class="stat"><span class="stat-label">Takt</span><span class="stat-value">${C.formatSek(f.pace)}</span></div>
      <div class="stat"><span class="stat-label">${f.reached ? 'Över mål' : 'Per vecka'}</span><span class="stat-value">${f.reached ? C.formatSek(earned - goal) : C.formatSek(f.perWeek)}</span></div>
      <div class="stat"><span class="stat-label">Dagar kvar</span><span class="stat-value">${f.daysLeft}</span></div>
    </div>
    <p class="note ${f.reached ? 'note-good' : f.onTrack ? 'note-good' : 'note-tip'}">${f.reached
      ? 'Målet är nått! Bestäm nu vart överskottet ska: buffert, skuld eller något för familjen.'
      : f.onTrack
        ? 'Du ligger i fas med målet. Håll pengastegen igång.'
        : `I nuvarande takt landar du på ${C.formatSek(f.pace)}. Ett extra sälj- eller uppföljningssteg om dagen gör skillnad.`}</p>
  </section>`;
}

function streamsCard(ctx) {
  const stats = C.streamStats(ctx.state, C.monthKey(ctx.key));
  const best = stats.filter((s) => s.rate != null).sort((a, b) => b.rate - a.rate)[0];
  return html`<section class="card">
    <div class="card-head"><h2>Per ström</h2><span class="small muted">denna månad</span></div>
    ${stats.length
      ? html`<table class="table">
          <thead><tr><th scope="col">Ström</th><th scope="col" class="num">Inkomst</th><th scope="col" class="num">Tid</th><th scope="col" class="num">kr/h</th></tr></thead>
          <tbody>${stats.map((s) => html`<tr>
            <th scope="row">${s.name}${best && best.id === s.id && stats.length > 1 ? html` <span class="tag">★ bäst/h</span>` : ''}</th>
            <td class="num">${C.formatSek(s.income)}</td>
            <td class="num">${s.hours ? `${C.formatDecimal(s.hours)} h` : '–'}</td>
            <td class="num">${s.rate != null ? C.formatNumber(s.rate) : '–'}</td>
          </tr>`)}</tbody>
        </table>
        <p class="small muted">Logga timmar per ström för att se vad som faktiskt lönar sig per timme.</p>`
      : html`<p class="empty">Inga inkomster eller timmar loggade den här månaden.</p>`}
  </section>`;
}

function dealItem(ctx, d) {
  const stage = C.stageById(d.stage);
  const overdue = stage.open && d.nextDate && d.nextDate < ctx.key;
  const today = stage.open && d.nextDate === ctx.key;
  return html`<li class="deal ${overdue ? 'overdue' : ''}">
    <div class="deal-main">
      <div class="row between"><strong>${d.title}</strong><span class="deal-value">${d.value ? C.formatSek(d.value) : ''}</span></div>
      <p class="small"><span class="tag stage-${d.stage}">${stage.name}</span> ${C.streamName(ctx.state, d.streamId)}</p>
      ${stage.open && (d.nextStep || d.nextDate)
        ? html`<p class="small ${overdue ? 'warn-text' : 'muted'}">${overdue ? '⚠️ ' : today ? '📌 ' : '→ '}${d.nextStep || 'Nästa steg'}${d.nextDate ? ` · ${overdue ? 'skulle gjorts ' : ''}${C.formatDateShort(d.nextDate)}` : ''}</p>`
        : ''}
    </div>
    <div class="deal-actions">
      ${stage.open ? html`<button class="btn-icon" data-action="money.stage" data-id="${d.id}" data-dir="-1" aria-label="Flytta bakåt"${d.stage === 'lead' ? ' disabled' : ''}>${icon('left', 18)}</button>
        <button class="btn-icon" data-action="money.stage" data-id="${d.id}" data-dir="1" aria-label="Flytta framåt">${icon('right', 18)}</button>` : ''}
      <button class="btn-icon" data-action="sheet.deal" data-id="${d.id}" aria-label="Redigera ${d.title}">${icon('edit', 18)}</button>
    </div>
  </li>`;
}

function pipelineCard(ctx) {
  const u = ui(ctx);
  const p = C.pipelineSummary(ctx.state.deals, ctx.key);
  const closed = ctx.state.deals.filter((d) => !C.stageById(d.stage).open).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return html`<section class="card">
    <div class="card-head"><h2>🤝 Pipeline</h2><button class="btn-link" data-action="sheet.deal">+ Ny affär</button></div>
    ${ctx.state.deals.length
      ? html`<div class="pipe-stages">${p.stages.filter((s) => s.id !== 'lost').map((s) => html`<div class="pipe-stage stage-${s.id}">
            <span class="small muted">${s.name}</span><strong>${s.count}</strong><span class="small">${s.value ? C.formatNumber(s.value) : '–'}</span>
          </div>`)}</div>
        <p class="small muted">Öppet värde ${C.formatSek(p.openValue)} · viktat ${C.formatSek(p.weighted)} (sannolikhet per steg)</p>
        ${p.overdue.length ? html`<p class="note note-tip">⚠️ ${p.overdue.length} ${p.overdue.length === 1 ? 'affär har' : 'affärer har'} ett försenat nästa steg. Ta dem först.</p>` : ''}
        <ul class="deals">${p.open.map((d) => dealItem(ctx, d))}</ul>
        ${closed.length
          ? html`<button class="btn btn-ghost btn-block" data-action="money.toggleClosed">${u.showClosed ? 'Dölj' : 'Visa'} avslutade (${closed.length})</button>
            ${u.showClosed ? html`<ul class="deals closed">${closed.map((d) => dealItem(ctx, d))}</ul>` : ''}`
          : ''}`
      : html`<p class="empty">Inga affärer ännu. Lägg in ditt första lead – ett namn, ett värde och ett nästa steg.</p>`}
  </section>`;
}

function savingsCard(ctx) {
  const totals = C.savingsTotals(ctx.state.savings);
  const months = C.bufferMonths(totals.saved, ctx.state.settings.monthlyCosts);
  return html`<section class="card">
    <div class="card-head"><h2>🐷 Sparmål</h2><button class="btn-link" data-action="sheet.saving">+ Nytt mål</button></div>
    ${months != null && totals.saved > 0 ? html`<p class="note ${months >= 3 ? 'note-good' : 'note-tip'}">Buffert: <strong>${C.formatDecimal(months)} månader</strong> av dina fasta kostnader (${C.formatSek(ctx.state.settings.monthlyCosts)}/mån). ${months >= 3 ? 'Tryggt.' : 'Sikta på minst tre månader.'}</p>` : ''}
    ${ctx.state.savings.length
      ? html`<ul class="savings">${ctx.state.savings.map((s) => html`<li>
          <div class="row between"><strong>${s.name}</strong><span class="small">${C.formatSek(s.saved)} / ${C.formatSek(s.target)}</span></div>
          ${meter(s.target ? s.saved / s.target : 0, { label: s.name, tone: s.target && s.saved >= s.target ? 'meter-good' : '' })}
          <div class="row"><button class="chip" data-action="sheet.deposit" data-id="${s.id}">+ Sätt in</button><button class="chip" data-action="sheet.saving" data-id="${s.id}">Redigera</button></div>
        </li>`)}</ul>`
      : html`<p class="empty">Inget sparmål ännu. Börja med en buffert – den köper lugn.</p>`}
  </section>`;
}

function historyCard(ctx) {
  const u = ui(ctx);
  const series = C.monthlyIncomeSeries(ctx.state, ctx.key, 6);
  const recent = ctx.state.income.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  return html`<section class="card">
    <div class="card-head"><h2>Inkomst per månad</h2><span class="small muted">6 månader</span></div>
    ${columns(series.map((s, i) => ({ label: s.label, value: s.value, title: C.formatMonth(s.month), highlight: i === series.length - 1 })), { format: (v) => C.formatSek(v), empty: 'Inga inkomster loggade ännu.' })}
    ${recent.length
      ? html`<h3 class="sub-h">Senaste</h3><ul class="ledger">${recent.slice(0, u.incomeLimit).map((i) => html`<li>
          <div class="grow"><strong>${C.formatSek(i.amount)}</strong> <span class="small muted">${C.streamName(ctx.state, i.streamId)}${i.note ? ` · ${i.note}` : ''}</span></div>
          <span class="small muted">${C.formatDateShort(i.date)}</span>
          <button class="btn-icon" data-action="money.incomeDelete" data-id="${i.id}" aria-label="Ta bort inkomst">${icon('trash', 18)}</button>
        </li>`)}</ul>
        ${recent.length > u.incomeLimit ? html`<button class="btn btn-ghost btn-block" data-action="money.moreIncome">Visa fler</button>` : ''}`
      : ''}
  </section>`;
}

export function render(ctx) {
  return html`
    <section class="page-head">
      <h1>Pengar</h1>
      <p class="hero-sub">Trygghet för familjen – ett pengasteg om dagen.</p>
    </section>
    <div class="quick-row">
      <button class="quick" data-action="sheet.income">${icon('plus', 20)}<span>Inkomst</span></button>
      <button class="quick" data-action="sheet.hours">${icon('focus', 20)}<span>Timmar</span></button>
      <button class="quick" data-action="sheet.deal">${icon('star', 20)}<span>Affär</span></button>
    </div>
    ${monthCard(ctx)}
    ${pipelineCard(ctx)}
    ${streamsCard(ctx)}
    ${savingsCard(ctx)}
    ${historyCard(ctx)}
  `;
}

export const actions = {
  'money.stage': (ctx, el) => {
    const deal = ctx.state.deals.find((d) => d.id === el.dataset.id);
    if (!deal) return;
    const to = C.nextStage(deal.stage, Number(el.dataset.dir));
    if (to === deal.stage) return;
    ctx.update((s) => {
      const d = s.deals.find((x) => x.id === deal.id);
      d.stage = to;
      d.updatedAt = new Date().toISOString();
    });
    if (to === 'paid' && deal.value > 0) {
      toast(`Betald! Logga ${C.formatSek(deal.value)} som inkomst?`, {
        actionLabel: 'Logga',
        ms: 8000,
        action: () => ctx.update((s) => {
          s.income.push({ id: C.uid('i'), date: ctx.key, amount: deal.value, streamId: deal.streamId, note: deal.title, createdAt: new Date().toISOString() });
        }),
      });
    } else {
      toast(`${deal.title} → ${C.stageById(to).name}`);
    }
  },
  'money.dealDelete': (ctx, el) => {
    const snap = ctx.store.snapshot();
    ctx.update((s) => {
      s.deals = s.deals.filter((d) => d.id !== el.dataset.id);
    });
    ctx.closeSheet();
    toast('Affären togs bort', { action: () => ctx.store.restore(snap) });
  },
  'money.savingDelete': (ctx, el) => {
    const snap = ctx.store.snapshot();
    ctx.update((s) => {
      s.savings = s.savings.filter((x) => x.id !== el.dataset.id);
    });
    ctx.closeSheet();
    toast('Sparmålet togs bort', { action: () => ctx.store.restore(snap) });
  },
  'money.incomeDelete': (ctx, el) => {
    const snap = ctx.store.snapshot();
    ctx.update((s) => {
      s.income = s.income.filter((i) => i.id !== el.dataset.id);
    });
    toast('Inkomsten togs bort', { action: () => ctx.store.restore(snap) });
  },
  'money.toggleClosed': (ctx) => {
    const u = ui(ctx);
    u.showClosed = !u.showClosed;
    ctx.render();
  },
  'money.moreIncome': (ctx) => {
    ui(ctx).incomeLimit += 10;
    ctx.render();
  },
};

export const forms = {
  'money.goal': (ctx, fd) => {
    const goal = Math.max(0, C.num(fd.get('goal')));
    if (!goal) return;
    ctx.update((s) => {
      s.settings.monthlyIncomeGoal = goal;
    });
    toast('Målet är satt. Nu kör vi 💪');
  },
};
