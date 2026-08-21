import { activeMission, escapeHtml, formatMoney } from './utils.js';
import {
  candidateForm, eventForm, gateRow, metricCard, renderAudit, renderEvents,
  renderLatestGrill, renderMissionPortfolio, renderTasks, roleCard, scoreRow,
} from './render-parts.js';

export function renderDashboard(state, agentOsOnline) {
  const mission = activeMission(state);
  if (!mission) return '<div class="empty">No mission exists. Add one in Candidate Lab.</div>';

  const metrics = state.metrics;
  const evaluation = mission.evaluation;
  const completed = state.tasks.filter((task) => task.status === 'done').length;
  const nextTask = state.tasks.filter((task) => task.status === 'queued' && task.executionMode === 'internal').sort((a, b) => a.priority - b.priority)[0];

  return `
    <section id="overview" class="section">
      <div class="section-head"><div><h2>Company overview</h2><p>${escapeHtml(state.company.objective)}</p></div>
        <div class="section-actions"><button class="button ghost" data-action="refresh">Refresh</button>
          <button class="button primary" data-action="run-next" ${nextTask && agentOsOnline ? '' : 'disabled'}>${nextTask ? 'Run next internal task' : 'No internal task queued'}</button></div></div>
      <div class="grid metrics-grid">
        ${metricCard('Net revenue', formatMoney(metrics.netRevenueCents), `${formatMoney(metrics.grossRevenueCents)} gross`)}
        ${metricCard('Paying customers', metrics.payingCustomers, 'real payments only')}
        ${metricCard('Prospects contacted', metrics.prospectsContacted, `${metrics.positiveReplies} positive replies`)}
        ${metricCard('Mission verdict', evaluation.decision, `${evaluation.score}/100 commercial score`)}
        ${metricCard('Execution', `${completed}/${state.tasks.length}`, 'tasks completed')}
      </div>
    </section>

    <section id="mission" class="section">
      <div class="section-head"><div><h2>Active revenue mission</h2><p>Only one mission is allowed to consume build capacity.</p></div>
        <div class="section-actions"><button class="button warning" data-action="grill" data-ai="false">Deterministic grill</button>
          <button class="button" data-action="grill" data-ai="true" ${agentOsOnline ? '' : 'disabled'}>AI red team</button></div></div>
      <div class="grid two-col">
        <div class="card"><div class="card-body"><div class="mission-hero">
          <div class="score-ring" style="--score:${evaluation.score}"><div class="score-inner"><div class="score-number">${evaluation.score}</div><div class="score-label">score / 100</div></div></div>
          <div><div class="mission-title-row"><h3>${escapeHtml(mission.name)}</h3><span class="pill ${evaluation.decision.toLowerCase()}">${escapeHtml(evaluation.decision)}</span><span class="pill">${escapeHtml(mission.stage)}</span></div>
            <p class="copy-block">${escapeHtml(mission.thesis)}</p><div class="warning-box"><strong>Current bottleneck:</strong> ${escapeHtml(mission.nextAction)}</div></div></div>
          <dl class="definition-list"><dt>Buyer</dt><dd>${escapeHtml(mission.buyer)}</dd><dt>Problem</dt><dd>${escapeHtml(mission.problem)}</dd>
            <dt>Founder offer</dt><dd>${escapeHtml(mission.offer)}</dd><dt>Price</dt><dd>${escapeHtml(formatMoney(mission.priceCents, mission.currency))}${mission.priceLadder ? ` · ${mission.priceLadder.map(escapeHtml).join(' · ')}` : ''}</dd>
            <dt>Channel</dt><dd>${escapeHtml(mission.primaryChannel)}</dd><dt>Competition risk</dt><dd>${escapeHtml(mission.competitionRisk)}</dd><dt>CEO gate</dt><dd>${escapeHtml(mission.ownerDecision || 'No owner decision currently recorded.')}</dd></dl>
        </div></div>
        <div class="grid"><div class="card"><div class="card-head"><h3>Hard commercial gates</h3><span>${evaluation.openGates.length} open</span></div><div class="card-body gates">${state.reference.requiredGates.map((gate) => gateRow(state, mission, gate)).join('')}</div></div>
          <div class="card"><div class="card-head"><h3>Weighted scorecard</h3><span>GO ≥75 + every gate</span></div><div class="card-body score-list">${Object.entries(evaluation.breakdown).map(([key, item]) => scoreRow(state, key, item)).join('')}</div></div></div>
      </div>${renderLatestGrill(mission)}
    </section>

    <section id="tasks" class="section"><div class="section-head"><div><h2>Execution queue</h2><p>Internal agents can produce work. Human and external actions remain explicit CEO gates.</p></div>
      <div class="section-actions"><span class="pill internal">internal</span><span class="pill human">human</span><span class="pill external">external</span></div></div>
      <div class="card"><div class="card-body task-list">${renderTasks(state, mission.id, agentOsOnline)}</div></div></section>

    <section id="company" class="section"><div class="section-head"><div><h2>AI company structure</h2><p>Roles are operational identities mapped onto your existing Agent OS runtimes.</p></div></div>
      <div class="card"><div class="card-head"><h3>Authority model</h3><span>${state.roles.length} AI employees</span></div><div class="card-body">
        <div class="warning-box"><strong>CEO-only:</strong> ${state.company.ownerOnly.map(escapeHtml).join(' · ')}</div><div class="role-grid" style="margin-top:12px">${state.roles.map(roleCard).join('')}</div></div></div>
      <div class="card" style="margin-top:14px"><div class="card-head"><h3>Internal automation</h3><span>Never external</span></div><div class="card-body automation-box">
        <label class="switch" aria-label="Enable internal automation"><input id="automation-enabled" type="checkbox" ${state.automation.enabled ? 'checked' : ''} /><span class="switch-slider"></span></label>
        <div><strong>${state.automation.enabled ? 'Enabled' : 'Disabled'}</strong><div class="muted tiny">Runs only queued internal tasks while this server and Agent OS are online.</div></div>
        <label style="margin-left:auto; width:145px">DAILY RUN LIMIT<input id="automation-limit" type="number" min="1" max="24" value="${state.automation.dailyRunLimit}" /></label>
        <button class="button" data-action="save-automation">Save automation</button></div></div>
    </section>

    <section id="ledger" class="section"><div class="section-head"><div><h2>Revenue and evidence ledger</h2><p>Only real-world events improve commercial evidence.</p></div></div>
      <div class="grid two-col"><div class="card"><div class="card-head"><h3>Log an actual event</h3><span>No simulated revenue</span></div><div class="card-body">${eventForm(mission)}</div></div>
        <div class="card"><div class="card-head"><h3>Recent events</h3><span>${state.events.length} total</span></div><div class="ledger-wrap">${renderEvents(state)}</div></div></div></section>

    <section id="candidate-lab" class="section"><div class="section-head"><div><h2>Candidate lab</h2><p>Capture a software or service idea, score it, test it, or kill it before resources are committed.</p></div></div>
      <div class="grid two-col"><div class="card"><div class="card-head"><h3>Add candidate mission</h3><span>New candidate parks current mission</span></div><div class="card-body">${candidateForm(state)}</div></div>
        <div class="card"><div class="card-head"><h3>Portfolio</h3><span>${state.missions.length} missions</span></div><div class="card-body task-list">${renderMissionPortfolio(state)}</div></div></div></section>

    <section class="section"><div class="section-head"><div><h2>Audit trail</h2><p>What the system actually did.</p></div></div><div class="card"><div class="ledger-wrap">${renderAudit(state)}</div></div></section>`;
}
