'use strict';
/*
 * OMEGA dashboard. Vanilla JS, no build step, no third-party code.
 * Everything that comes from agents or projects is untrusted: it is only ever
 * inserted as text (textContent via h()), never as HTML.
 */

const TOKEN_KEY = 'omega.token';
const $view = document.getElementById('view');
const $status = document.getElementById('status');
const $badge = document.getElementById('badge');
const $modal = document.getElementById('modal');

const STATE_LABEL = {
  received: ['Mottaget', ''], blocked: ['Väntar på godkännande', 'warn'], running: ['Pågår', 'info'],
  awaiting_review: ['Klar för granskning', 'warn'], approved: ['Godkänt', 'ok'], rejected: ['Avvisat', 'bad'],
  failed: ['Misslyckades', 'bad'], cancelled: ['Avbrutet', ''],
};
const ROLE_LABEL = {
  product: 'Produkt', research: 'Research', architect: 'Arkitekt', 'test-author': 'Testförfattare',
  coder: 'Kodare', tester: 'Testare', security: 'Säkerhet', docs: 'Dokumentation',
};

// ── tiny DOM helper (text-only children) ─────────────────────────────────────
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'cssWidth') el.style.width = v; // CSSOM, permitted by the strict CSP
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const pill = (text, kind = '') => h('span', { class: `pill ${kind}` }, text);
const statePill = (s) => pill(...(STATE_LABEL[s] || [s, '']));
const usd = (n) => `$${(n || 0).toFixed(n >= 1 ? 2 : 4)}`;
const when = (iso) => (iso ? new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const short = (sha) => (sha ? sha.slice(0, 10) : '');

// ── API ──────────────────────────────────────────────────────────────────────
function token() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
function setToken(t) {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
}
async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { Authorization: `Bearer ${token()}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { setToken(''); render(); throw new Error('Inloggning krävs'); }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
function flash(msg) {
  $status.textContent = msg;
  clearTimeout(flash.t);
  flash.t = setTimeout(() => ($status.textContent = ''), 5000);
}
async function act(btn, fn) {
  btn.disabled = true;
  try { await fn(); } catch (err) { flash(`Fel: ${err.message}`); alert(err.message); } finally { btn.disabled = false; }
}
function showText(title, text) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = text;
  $modal.showModal();
}
document.getElementById('modal-close').addEventListener('click', () => $modal.close());

// ── views ────────────────────────────────────────────────────────────────────
function loginView() {
  const input = h('input', { type: 'password', id: 'tok', autocomplete: 'off', placeholder: 'Klistra in token' });
  return h('div', { class: 'card' },
    h('h1', {}, 'Logga in'),
    h('p', { class: 'muted' }, 'OMEGA kräver en API-token. Den skrivs ut när servern startar och finns i filen token i OMEGA_HOME.'),
    h('label', { for: 'tok' }, 'Token'), input,
    h('div', { class: 'row mt' },
      h('button', { class: 'btn', onclick: () => { setToken(input.value.trim()); route(); } }, 'Logga in')));
}

async function overviewView() {
  const [o, missions] = await Promise.all([api('/api/overview'), api('/api/missions')]);
  const lim = o.limits;
  return h('div', {},
    h('h1', {}, 'Översikt'),
    o.audit.ok ? null : h('div', { class: 'banner bad' }, `Granskningsloggen är bruten vid post ${o.audit.brokenAt}: ${o.audit.reason}`),
    h('div', { class: 'grid' },
      tile('Uppdrag', o.missions),
      tile('Väntar på dig', o.pendingApprovals),
      tile('I kö / körs', `${o.queued} / ${o.running}`),
      tile('Kostnad idag', `${usd(o.spentTodayUsd)} / $${lim.dailyBudgetUsd}`)),
    h('div', { class: 'card mt' },
      h('div', { class: 'row spread' }, h('h3', {}, 'Granskningslogg'), pill(o.audit.ok ? 'Kedjan intakt' : 'BRUTEN', o.audit.ok ? 'ok' : 'bad')),
      h('p', { class: 'small muted' }, `${o.audit.count} poster, senaste hash `, h('span', { class: 'mono' }, short(o.audit.headHash))),
      h('p', { class: 'small muted' }, `Gränser: $${lim.perRunBudgetUsd}/agentkörning, standard $${lim.defaultMissionBudgetUsd}/uppdrag, max ${lim.maxFixIterations} rättningsvarv. `,
        lim.autoApproveSpendUnderUsd > 0 ? `Utgifter under $${lim.autoApproveSpendUnderUsd} godkänns automatiskt.` : 'Alla AI-utgifter kräver manuellt godkännande.'),
      h('p', { class: 'small muted' }, o.workerBusy ? 'Arbetaren kör en uppgift just nu.' : 'Arbetaren är ledig. Den körs bara medan servern är igång – ingen bakgrundstjänst är installerad.')),
    h('h2', {}, 'Senaste uppdrag'),
    missionList(missions.slice(0, 8)));
}
function tile(k, v) { return h('div', { class: 'tile' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, String(v))); }

function missionList(missions) {
  if (!missions.length) return h('div', { class: 'card muted' }, 'Inga uppdrag ännu. ', h('a', { href: '#/new' }, 'Beställ ett'), '.');
  return h('div', { class: 'card' }, h('ul', { class: 'list' }, missions.map((m) =>
    h('li', {}, h('a', { class: 'mission-link', href: `#/m/${m.id}` },
      h('div', { class: 'row spread' }, h('span', { class: 'title' }, m.title), statePill(m.state)),
      h('div', { class: 'small muted' }, `${m.engine === 'claude-code' ? 'Claude Code' : 'Mall (offline)'} · ${usd(m.spentUsd)} · ${when(m.createdAt)}`))))));
}

async function missionsView() {
  return h('div', {}, h('h1', {}, 'Uppdrag'), missionList(await api('/api/missions')));
}

function newView() {
  const idea = h('textarea', { id: 'idea', required: true, maxlength: 4000, placeholder: 'Beskriv appen du vill ha, t.ex. "En app som delar upp en restaurangnota mellan flera personer, med dricks."' });
  const engine = h('select', { id: 'engine' },
    h('option', { value: 'claude-code' }, 'Claude Code – riktiga AI-agenter (kostar pengar, kräver godkännande)'),
    h('option', { value: 'template' }, 'Mall – offline, gratis, bara kända recept (ingen AI)'));
  const budget = h('input', { id: 'budget', type: 'number', min: '0.1', step: '0.1', value: '3' });
  const model = h('input', { id: 'model', placeholder: 'standard (claude-opus-5-5)' });
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Skapa uppdrag');
  const form = h('form', { class: 'card', onsubmit: (e) => {
    e.preventDefault();
    act(submit, async () => {
      const body = { idea: idea.value, engine: engine.value };
      if (engine.value === 'claude-code') { body.budgetUsd = Number(budget.value); if (model.value.trim()) body.model = model.value.trim(); }
      const m = await api('/api/missions', { method: 'POST', body });
      location.hash = `#/m/${m.id}`;
    });
  } },
    h('label', { for: 'idea' }, 'Produktidé'), idea,
    h('label', { for: 'engine' }, 'Motor'), engine,
    h('p', { class: 'help' }, 'Mall-motorn kan bara bygga temperaturomvandlare och textstatistik. Andra idéer avböjs ärligt i stället för att fejkas.'),
    h('label', { for: 'budget' }, 'Budgettak (USD)'), budget,
    h('p', { class: 'help' }, 'Hårt tak för hela uppdraget. Varje agentkörning får dessutom högst serverns tak per körning.'),
    h('label', { for: 'model' }, 'Modell (valfritt)'), model,
    h('div', { class: 'row mt' }, submit));
  return h('div', {}, h('h1', {}, 'Beställ en app'),
    h('p', { class: 'muted' }, 'Flöde: produkt → arkitektur → testförfattare → kodare → oberoende testkörning (med rättningsvarv) → säkerhetsgranskning → dokumentation → din granskning.'),
    form);
}

async function missionView(id) {
  const d = await api(`/api/missions/${id}`);
  const m = d.mission;
  const pending = d.approvals.filter((a) => a.state === 'pending');
  const el = h('div', {},
    h('div', { class: 'row spread' }, h('h1', {}, m.title), statePill(m.state)),
    h('p', { class: 'small muted' }, h('span', { class: 'mono' }, m.id), ` · ${m.engine === 'claude-code' ? `Claude Code (${m.model})` : 'Mallmotor (offline, ingen AI)'} · skapat ${when(m.createdAt)}`),
    m.error ? h('div', { class: 'banner bad' }, m.error) : null,
    pending.map((a) => approvalCard(a, m)),
    h('div', { class: 'card' },
      h('h3', {}, 'Beställning'), h('p', {}, m.idea),
      m.engine === 'claude-code' ? h('div', {},
        h('div', { class: 'row spread small' }, h('span', {}, `Förbrukat ${usd(m.spentUsd)} av $${m.budgetUsd.toFixed(2)}`), h('span', { class: 'muted' }, 'enligt Claude Codes egen kostnadsrapport')),
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': m.budgetUsd, 'aria-valuenow': m.spentUsd },
          h('span', { cssWidth: `${Math.min(100, (m.spentUsd / Math.max(m.budgetUsd, 0.0001)) * 100)}%` }))) : null),
    h('h2', {}, 'Pipeline'), pipeline(m, d.tasks),
    m.tests ? testsCard(m) : null,
    m.verifications.length ? h('div', { class: 'card' }, h('h3', {}, 'Omverifieringar'),
      h('ul', { class: 'list' }, m.verifications.map((v) => h('li', { class: 'row spread' },
        h('span', {}, `Körning ${v.runId}: ${v.pass}/${v.tests} godkända`), pill(v.ok ? 'OK' : 'FEL', v.ok ? 'ok' : 'bad'),
        h('button', { class: 'linkish small', onclick: () => artifact(m.id, v.logEvidence) }, 'logg'))))) : null,
    m.security ? securityCard(m) : null,
    h('h2', {}, 'Steg och evidens'), stagesCard(m),
    h('h2', {}, 'Versionshistorik (git)'), commitsCard(d.commits),
    h('h2', {}, 'Filer i projektet'), filesCard(m, d.files),
    h('h2', {}, 'Åtgärder'), actionsCard(m),
    h('details', {}, h('summary', {}, `Händelser (${d.audit.length})`), auditList(d.audit, false)));
  return el;
}

function pipeline(m, tasks) {
  const seen = m.stages.map((s) => s.role);
  const remaining = m.plan.filter((r) => !seen.includes(r) || (r === 'tester' && !m.stages.some((s) => s.role === 'tester' && s.state === 'succeeded')));
  const queued = tasks.filter((t) => t.state === 'queued');
  return h('div', { class: 'pipeline' },
    m.stages.map((s) => h('div', { class: 'step', title: s.summary || '' }, h('span', { class: `dot ${s.state}` }), `${ROLE_LABEL[s.role] || s.role}${s.iteration > 1 ? ` #${s.iteration}` : ''}`)),
    queued.map((t) => h('div', { class: 'step' }, h('span', { class: 'dot queued' }), `${ROLE_LABEL[t.role]} (kö)`)),
    ['running', 'blocked', 'received'].includes(m.state) ? remaining.filter((r) => !queued.some((t) => t.role === r)).map((r) => h('div', { class: 'step muted' }, h('span', { class: 'dot' }), ROLE_LABEL[r])) : null);
}

function testsCard(m) {
  const t = m.tests;
  return h('div', { class: 'card' },
    h('div', { class: 'row spread' }, h('h3', {}, `Oberoende testkörning #${t.runId}`), pill(t.ok ? `${t.pass}/${t.tests} godkända` : `${t.fail} fel`, t.ok ? 'ok' : 'bad')),
    h('p', { class: 'small muted' }, `Körd av OMEGA (inte av kodaren) med node --test, exitkod ${t.exitCode}. `,
      h('button', { class: 'linkish', onclick: () => artifact(m.id, t.logEvidence) }, 'Visa rå TAP-logg')),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Krav'), h('th', {}, 'Acceptanskriterium'), h('th', {}, 'Status'))),
      h('tbody', {}, (m.spec?.acceptanceCriteria || []).map((ac) => {
        const c = t.coverage.find((x) => x.id === ac.id) || { covered: false, passing: false, tests: [] };
        return h('tr', {}, h('td', { class: 'mono' }, ac.id), h('td', {}, ac.text, c.tests.length ? h('div', { class: 'small muted' }, c.tests.join(' · ')) : null),
          h('td', {}, pill(c.passing ? 'OK' : c.covered ? 'FEL' : 'Ej täckt', c.passing ? 'ok' : 'bad')));
      })))),
    t.failures.length ? h('div', { class: 'small error' }, t.failures.join(' · ')) : null);
}

function securityCard(m) {
  const s = m.security;
  return h('div', { class: 'card' },
    h('div', { class: 'row spread' }, h('h3', {}, 'Säkerhetsgranskning'), pill(`${s.high} höga · ${s.medium} medel`, s.high ? 'bad' : s.medium ? 'warn' : 'ok')),
    s.findings.length ? h('ul', { class: 'list small' }, s.findings.map((f) => h('li', {}, pill(f.severity, f.severity === 'high' ? 'bad' : f.severity === 'medium' ? 'warn' : ''), ' ', h('span', { class: 'mono' }, `${f.file}${f.line ? `:${f.line}` : ''}`), ` ${f.message} (${f.rule})`)))
      : h('p', { class: 'small muted' }, 'Inga fynd. (Statisk mönstergranskning – ersätter inte mänsklig granskning.)'));
}

function stagesCard(m) {
  if (!m.stages.length) return h('div', { class: 'card muted' }, 'Inga steg har körts ännu.');
  return h('div', { class: 'card' }, h('ul', { class: 'list' }, m.stages.map((s) => h('li', {},
    h('div', { class: 'row spread' }, h('strong', {}, `${ROLE_LABEL[s.role] || s.role}${s.iteration > 1 ? ` (varv ${s.iteration})` : ''}`),
      h('span', { class: 'row' }, s.costUsd ? pill(usd(s.costUsd), 'info') : null, pill(s.state, s.state === 'succeeded' ? 'ok' : s.state === 'failed' ? 'bad' : 'info'))),
    s.summary ? h('p', { class: 'small clamp', title: s.summary }, s.summary) : null,
    s.error ? h('p', { class: 'small error' }, s.error) : null,
    s.commit ? h('p', { class: 'small muted' }, 'Commit ', h('span', { class: 'mono' }, short(s.commit)), ` · ${(s.changedFiles || []).join(', ')}`) : null,
    s.evidence.map((e) => h('div', { class: 'evidence small' },
      h('button', { class: 'linkish', onclick: () => artifact(m.id, e.name) }, e.name),
      h('span', { class: 'mono muted' }, `sha256 ${e.sha256.slice(0, 16)}…`), h('span', { class: 'muted' }, e.summary)))))));
}

function commitsCard(commits) {
  if (!commits.length) return h('div', { class: 'card muted' }, 'Inga commits ännu.');
  return h('div', { class: 'card' }, h('ul', { class: 'list small' }, commits.map((c) => h('li', {},
    h('span', { class: 'mono' }, short(c.sha)), ' ', h('strong', {}, c.author), ` · ${when(c.date)}`, h('div', { class: 'muted' }, c.subject)))));
}

function filesCard(m, files) {
  if (!files.length) return h('div', { class: 'card muted' }, 'Inga filer ännu.');
  return h('div', { class: 'card' }, h('p', { class: 'small muted mono' }, m.projectDir),
    h('ul', { class: 'list small' }, files.map((f) => h('li', {}, h('button', { class: 'linkish mono', onclick: async () => {
      try { const r = await api(`/api/missions/${m.id}/file?path=${encodeURIComponent(f)}`); showText(f, r.content); } catch (err) { alert(err.message); }
    } }, f)))));
}

function actionsCard(m) {
  const btns = [];
  if (['awaiting_review', 'approved', 'rejected'].includes(m.state)) {
    const b = h('button', { class: 'btn ghost', onclick: () => act(b, async () => { const r = await api(`/api/missions/${m.id}/reverify`, { method: 'POST' }); flash(`Testerna kördes igen: ${r.pass}/${r.tests}`); route(); }) }, 'Kör testerna igen');
    btns.push(b);
  }
  const v = h('button', { class: 'btn ghost', onclick: () => act(v, async () => {
    const r = await api(`/api/missions/${m.id}/verify-evidence`, { method: 'POST' });
    showText(`Evidenskontroll: ${r.ok ? 'OK' : 'FEL'}`, r.checks.map((c) => `${c.ok ? '✔' : '✘'} ${c.name}: ${c.detail}`).join('\n'));
  }) }, 'Verifiera evidens');
  btns.push(v);
  if (m.state === 'failed') { const r = h('button', { class: 'btn ghost', onclick: () => act(r, async () => { await api(`/api/missions/${m.id}/retry`, { method: 'POST' }); route(); }) }, 'Försök igen'); btns.push(r); }
  if (['received', 'blocked', 'running', 'failed'].includes(m.state)) {
    const c = h('button', { class: 'btn danger', onclick: () => confirm('Avbryta uppdraget?') && act(c, async () => { await api(`/api/missions/${m.id}/cancel`, { method: 'POST' }); route(); }) }, 'Avbryt');
    btns.push(c);
  }
  return h('div', { class: 'card row' }, btns);
}

async function artifact(missionId, name) {
  try {
    const r = await api(`/api/missions/${missionId}/artifacts/${encodeURIComponent(name)}`);
    let text = r.content;
    if (name.endsWith('.json')) { try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* raw */ } }
    showText(name, text);
  } catch (err) { alert(err.message); }
}

function approvalCard(a, mission) {
  const note = h('textarea', { placeholder: a.kind === 'final_review' ? 'Kommentar (krävs vid avvisning)' : 'Kommentar (valfritt)', class: 'short' });
  const highRisk = a.kind === 'final_review' && (a.context.securityHigh || 0) > 0;
  const ack = h('input', { type: 'checkbox' });
  const ok = h('button', { class: 'btn', onclick: () => act(ok, async () => {
    await api(`/api/approvals/${a.id}/decide`, { method: 'POST', body: { decision: 'approve', note: note.value, acknowledgeRisks: ack.checked } });
    flash('Godkänt'); route();
  }) }, a.kind === 'spend_gate' ? 'Godkänn utgift och starta' : 'Godkänn resultatet');
  const no = h('button', { class: 'btn danger', onclick: () => act(no, async () => {
    await api(`/api/approvals/${a.id}/decide`, { method: 'POST', body: { decision: 'reject', note: note.value } });
    flash('Avvisat'); route();
  }) }, 'Avvisa');
  const ctx = Object.entries(a.context || {}).map(([k, v]) => h('div', { class: 'small' }, h('span', { class: 'muted' }, `${k}: `), Array.isArray(v) ? v.join(', ') : String(v)));
  return h('div', { class: 'card attention' },
    h('div', { class: 'row spread' }, h('h3', {}, a.title), pill(a.kind === 'spend_gate' ? 'Utgiftsgrind' : 'Slutgranskning', 'warn')),
    mission ? null : h('p', { class: 'small' }, h('a', { href: `#/m/${a.missionId}` }, 'Öppna uppdraget')),
    h('p', { class: 'small muted' }, a.reason), ctx,
    highRisk ? h('label', { class: 'check' }, ack, 'Jag har läst säkerhetsfynden med hög allvarlighet och godkänner ändå') : null,
    note, h('div', { class: 'row mt' }, ok, no));
}

async function approvalsView() {
  const list = await api('/api/approvals?state=pending');
  return h('div', {}, h('h1', {}, 'Godkännandekö'),
    list.length ? list.map((a) => approvalCard(a, null)) : h('div', { class: 'card muted' }, 'Inget väntar på dig.'),
    h('h2', {}, 'Beslutade'), decidedList(await api('/api/approvals')));
}
function decidedList(all) {
  const done = all.filter((a) => a.state !== 'pending').slice(0, 20);
  if (!done.length) return h('div', { class: 'card muted' }, 'Inga beslut ännu.');
  return h('div', { class: 'card' }, h('ul', { class: 'list small' }, done.map((a) => h('li', {},
    h('div', { class: 'row spread' }, h('a', { href: `#/m/${a.missionId}` }, a.title), pill(a.state === 'approved' ? 'Godkänd' : 'Avvisad', a.state === 'approved' ? 'ok' : 'bad')),
    h('div', { class: 'muted' }, `${a.decidedBy} · ${when(a.decidedAt)}${a.note ? ` · "${a.note}"` : ''}`)))));
}

function auditList(entries, withMission) {
  if (!entries.length) return h('div', { class: 'card muted' }, 'Inga händelser.');
  return h('div', { class: 'card' }, h('ul', { class: 'list small' }, [...entries].reverse().map((e) => h('li', {},
    h('div', { class: 'row spread' }, h('span', {}, h('strong', {}, e.type), ` · ${e.actor}`), h('span', { class: 'muted' }, when(e.ts))),
    h('div', { class: 'muted mono' }, `#${e.seq} ${e.hash.slice(0, 16)}`, withMission && e.missionId ? ` · ${e.missionId}` : ''),
    h('div', { class: 'muted' }, summarise(e.data))))));
}
function summarise(data) {
  const s = JSON.stringify(data);
  return s.length > 240 ? s.slice(0, 239) + '…' : s;
}

async function auditView() {
  const [v, entries] = await Promise.all([api('/api/audit/verify'), api('/api/audit?limit=150')]);
  return h('div', {}, h('h1', {}, 'Granskningslogg'),
    h('div', { class: `banner ${v.ok ? 'ok' : 'bad'}` }, v.ok ? `Hashkedjan verifierad: ${v.count} poster, inga ändringar upptäckta.` : `Kedjan bruten vid post ${v.brokenAt}: ${v.reason}`),
    h('p', { class: 'small muted' }, 'Varje post innehåller föregående posts SHA-256. Ändras, tas bort eller flyttas en rad bryts kedjan.'),
    auditList(entries, true));
}

async function systemView() {
  const [inv, roles] = await Promise.all([api('/api/inventory'), api('/api/roles')]);
  return h('div', {}, h('h1', {}, 'System'),
    h('div', { class: 'card' }, h('h3', {}, 'Dator'),
      h('p', { class: 'small' }, `${inv.system.platform} ${inv.system.release} · ${inv.system.cpus} CPU · ${inv.system.memoryGb} GB RAM · Node ${inv.system.node}`),
      h('p', { class: 'small muted mono' }, `OMEGA_HOME ${inv.omega.home}`),
      inv.disks.map((d) => h('p', { class: 'small' }, `${d.path}: ${d.freeGb} GB ledigt av ${d.totalGb} GB`))),
    inv.risks.length ? h('div', { class: 'banner warn' }, h('strong', {}, 'Risker'), h('ul', {}, inv.risks.map((r) => h('li', {}, r)))) : null,
    h('h2', {}, 'Agentverktyg'),
    h('div', { class: 'card table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Verktyg'), h('th', {}, 'Status'), h('th', {}, 'I OMEGA'), h('th', {}, 'Integration'))),
      h('tbody', {}, inv.tools.map((t) => h('tr', {}, h('td', {}, t.label), h('td', {}, pill(t.found ? (t.version || 'hittad') : 'saknas', t.found ? 'ok' : '')),
        h('td', {}, pill(t.omegaStatus, t.omegaStatus === 'integrated' ? 'ok' : t.omegaStatus === 'used' ? 'info' : '')), h('td', { class: 'small' }, t.integration)))))),
    h('h2', {}, 'Roller och behörigheter'),
    h('div', { class: 'card table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Roll'), h('th', {}, 'Ansvar'), h('th', {}, 'Rättigheter'), h('th', {}, 'Får skriva'))),
      h('tbody', {}, roles.roles.map((r) => h('tr', {},
        h('td', {}, h('strong', {}, r.title), h('div', {}, pill(r.status === 'implemented' ? 'implementerad' : 'planerad', r.status === 'implemented' ? 'ok' : ''))),
        h('td', { class: 'small' }, r.responsibility),
        h('td', { class: 'small mono' }, [...r.policy.capabilities, ...(r.policy.llmTools || []).map((x) => `tool:${x}`), ...r.policy.exec.map((x) => `exec:${x.cmd} ${(x.argsPrefix || []).join(' ')}`)].join(', ') || '—'),
        h('td', { class: 'small mono' }, r.policy.writePaths.join(', ') || '—')))))),
    inv.repos.length ? h('div', {}, h('h2', {}, 'Befintliga repon (endast läsning)'), h('div', { class: 'card' }, h('ul', { class: 'list small' }, inv.repos.map((r) => h('li', {},
      h('strong', {}, r.name), ` (${r.branch || '?'}) · ${r.dirtyFiles ?? '?'} ändrade filer · ${when(r.lastCommit)}`, h('div', { class: 'muted mono' }, r.remote || 'ingen remote')))))) : null,
    inv.notes.map((n) => h('p', { class: 'small muted' }, n)),
    h('div', { class: 'row mt' }, h('button', { class: 'btn ghost', onclick: () => { setToken(''); route(); } }, 'Logga ut')));
}

// ── router ───────────────────────────────────────────────────────────────────
let current = '';
let timer = null;
async function render() {
  if (!token()) { $view.replaceChildren(loginView()); setTab(''); return; }
  const hash = location.hash || '#/overview';
  const [, page, id] = hash.match(/^#\/([\w-]+)\/?([\w-]*)/) || [null, 'overview', ''];
  setTab(page === 'm' ? 'missions' : page);
  try {
    let el;
    if (page === 'overview') el = await overviewView();
    else if (page === 'new') el = newView();
    else if (page === 'missions') el = await missionsView();
    else if (page === 'm' && id) el = await missionView(id);
    else if (page === 'approvals') el = await approvalsView();
    else if (page === 'audit') el = await auditView();
    else if (page === 'system') el = await systemView();
    else el = h('p', {}, 'Okänd sida.');
    if (hash !== location.hash && location.hash) return; // navigated away meanwhile
    $view.replaceChildren(el);
    refreshBadge();
  } catch (err) {
    $view.replaceChildren(h('div', { class: 'banner bad' }, err.message));
  }
}
function setTab(page) {
  for (const a of document.querySelectorAll('.tabs a')) {
    if (a.dataset.tab === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}
async function refreshBadge() {
  try {
    const o = await api('/api/overview');
    $badge.hidden = !o.pendingApprovals;
    $badge.textContent = String(o.pendingApprovals);
  } catch { /* ignore */ }
}
// Token handed over in the URL fragment (never sent to the server) → store and strip.
// Runs on every navigation, not only on load: opening the link in an already-open tab
// is a same-document hash change.
function consumeTokenFragment() {
  const frag = new URLSearchParams(location.hash.replace(/^#/, ''));
  const t = frag.get('token');
  if (!t) return false;
  setToken(t);
  history.replaceState(null, '', `${location.pathname}#/overview`);
  return true;
}
function route() {
  consumeTokenFragment();
  const changed = current !== location.hash;
  current = location.hash;
  render().then(() => { if (changed) $view.focus({ preventScroll: true }); });
}
function autoRefresh() {
  clearInterval(timer);
  timer = setInterval(() => {
    const busyForm = document.activeElement && ['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement.tagName);
    if (document.visibilityState === 'visible' && !$modal.open && !busyForm && /^#\/(overview|m\/|missions|approvals)/.test(location.hash || '#/overview')) render();
  }, 4000);
}

window.addEventListener('hashchange', route);
route();
autoRefresh();
