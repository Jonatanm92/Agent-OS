import { className, escapeHtml, formatDate, formatMoney } from './utils.js';

export function metricCard(label, value, sub) {
  return `<div class="card metric"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${escapeHtml(value)}</div><div class="metric-sub">${escapeHtml(sub)}</div></div>`;
}

export function gateRow(state, mission, gate) {
  const checked = mission.hardGates?.[gate] === true;
  return `<label class="gate ${checked ? 'closed' : ''}">
    <input type="checkbox" data-action="toggle-gate" data-mission-id="${escapeHtml(mission.id)}" data-gate="${escapeHtml(gate)}" ${checked ? 'checked' : ''} />
    <span>${escapeHtml(state.reference.gateLabels[gate] || gate)}<small>${checked ? 'Evidence recorded / closed' : 'Open — blocks GO'}</small></span>
  </label>`;
}

export function scoreRow(state, key, item) {
  return `<div class="score-row"><span class="score-name">${escapeHtml(state.reference.scoreLabels[key] || key)}</span><span class="score-track"><span class="score-fill" style="width:${item.rating * 20}%"></span></span><span class="score-rating">${item.rating}/5</span></div>`;
}

export function renderTasks(state, missionId, agentOsOnline) {
  const tasks = state.tasks.filter((task) => task.missionId === missionId).sort((a, b) => a.priority - b.priority);
  if (!tasks.length) return '<div class="empty">No tasks for this mission.</div>';
  return tasks.map((task) => {
    const role = state.roles.find((item) => item.id === task.roleId);
    const runnable = task.executionMode === 'internal' && ['queued', 'failed'].includes(task.status);
    const recordable = task.executionMode !== 'internal' && ['blocked', 'queued', 'failed'].includes(task.status);
    return `<article class="task">
      <div>
        <h4 class="task-title">${task.priority}. ${escapeHtml(task.title)}</h4>
        <div class="task-meta">
          <span class="pill ${className(task.executionMode)}">${escapeHtml(task.executionMode)}</span>
          <span class="pill ${className(task.status)}">${escapeHtml(task.status)}</span>
          <span class="muted tiny">${escapeHtml(role?.name || task.roleId)} → ${escapeHtml(role?.agentId || 'manual')}</span>
        </div>
        <p class="task-description"><strong>Done when:</strong> ${escapeHtml(task.definitionOfDone)}</p>
        ${task.blockedBy && task.status === 'blocked' ? `<div class="task-blocker">Blocked: ${escapeHtml(task.blockedBy)}</div>` : ''}
        ${task.error ? `<div class="task-blocker">Error: ${escapeHtml(task.error)}</div>` : ''}
      </div>
      <div class="task-actions">
        ${runnable ? `<button class="button primary" data-action="run-task" data-task-id="${escapeHtml(task.id)}" ${agentOsOnline ? '' : 'disabled'}>${task.status === 'failed' ? 'Retry' : 'Run'}</button>` : ''}
        ${recordable ? `<button class="button" data-action="record-task" data-task-id="${escapeHtml(task.id)}">Record done</button>` : ''}
        ${task.output || task.error ? `<button class="button ghost" data-action="view-task" data-task-id="${escapeHtml(task.id)}">View output</button>` : ''}
      </div>
    </article>`;
  }).join('');
}

export function roleCard(role) {
  return `<article class="role"><h4>${escapeHtml(role.name)}</h4><div class="role-agent">Agent OS: ${escapeHtml(role.agentId)}</div><p>${escapeHtml(role.remit)}</p><p class="role-authority"><strong>Authority:</strong> ${escapeHtml(role.authority)}</p></article>`;
}

export function renderLatestGrill(mission) {
  const report = mission.grillReports?.[0];
  if (!report) return '';
  const aiText = report.ai?.text || report.aiError || '';
  return `<div class="card" style="margin-top:14px">
    <div class="card-head"><h3>Latest grill report</h3><span>${formatDate(report.generatedAt)}</span></div>
    <div class="card-body grill-report">
      <div class="mission-title-row"><span class="pill ${className(report.verdict)}">${escapeHtml(report.verdict)}</span><strong>${report.score}/100</strong></div>
      <p class="copy-block"><strong>Strongest case against:</strong> ${escapeHtml(report.strongestCaseAgainst)}</p>
      <p class="copy-block"><strong>Next falsification test:</strong> ${escapeHtml(report.nextTest)}</p>
      ${report.openGates?.length ? `<strong class="small">Open gates</strong><ul class="grill-list">${report.openGates.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : ''}
      <strong class="small">Kill conditions</strong><ul class="grill-list">${report.killConditions.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
      ${aiText ? `<button class="button ghost" data-action="view-grill" data-mission-id="${escapeHtml(mission.id)}">View AI red-team output</button>` : ''}
    </div>
  </div>`;
}

export function eventForm(mission) {
  return `<form id="event-form" class="form-grid">
    <input type="hidden" name="missionId" value="${escapeHtml(mission.id)}" />
    <label>EVENT TYPE<select name="kind" required>
      <option value="prospect_contacted">Prospect contacted</option><option value="positive_reply">Positive reply</option>
      <option value="sales_call">Sales call</option><option value="payment">Payment</option><option value="refund">Refund</option>
      <option value="delivery">Delivery completed</option><option value="testimonial">Testimonial</option><option value="note">Evidence note</option>
    </select></label>
    <label>CUSTOMER / PROSPECT KEY<input name="customerKey" placeholder="Creator handle or internal ID" /></label>
    <label>AMOUNT (major units)<input name="amount" type="number" step="0.01" min="0" placeholder="29.00" /></label>
    <label>CURRENCY<input name="currency" value="USD" maxlength="8" /></label>
    <label class="full">DETAIL<textarea name="detail" placeholder="Record only what actually happened."></textarea></label>
    <div class="form-actions"><button class="button primary" type="submit">Log real event</button></div>
  </form>`;
}

export function renderEvents(state) {
  if (!state.events.length) return '<div class="empty">No real-world events logged yet.</div>';
  return `<table class="ledger-table"><thead><tr><th>When</th><th>Event</th><th>Party</th><th>Amount</th><th>Detail</th></tr></thead><tbody>${state.events.slice(0, 20).map((event) => `<tr>
    <td>${escapeHtml(formatDate(event.at))}</td><td><strong>${escapeHtml(event.kind.replaceAll('_', ' '))}</strong></td>
    <td>${escapeHtml(event.customerKey || '—')}</td><td>${event.amountCents ? escapeHtml(formatMoney(event.amountCents, event.currency)) : '—'}</td>
    <td>${escapeHtml(event.detail || '—')}</td></tr>`).join('')}</tbody></table>`;
}

export function candidateForm(state) {
  const scoreInputs = Object.entries(state.reference.scoreLabels).map(([key, label]) => `
    <label>${escapeHtml(label.toUpperCase())} (0–5)<input name="score_${escapeHtml(key)}" type="number" min="0" max="5" step="1" value="2" required /></label>`).join('');
  return `<form id="candidate-form" class="form-grid">
    <div class="warning-box" style="grid-column:1/-1">Creating a candidate parks the current mission. A candidate is not approved for coding; it begins at the evidence gate.</div>
    <label>MISSION NAME<input name="name" required placeholder="Specific outcome, not a vague category" /></label><label>BRAND<input name="brand" value="TBD" /></label>
    <label class="full">SPECIFIC BUYER<textarea name="buyer" required></textarea></label><label class="full">PAINFUL PROBLEM<textarea name="problem" required></textarea></label>
    <label class="full">PAID OFFER<textarea name="offer" required></textarea></label><label>FOUNDER PRICE<input name="price" type="number" min="0" step="0.01" value="29" /></label>
    <label>CURRENCY<input name="currency" value="USD" /></label><label class="full">PRIMARY CHANNEL<input name="primaryChannel" placeholder="Where the first 30 qualified buyers are reachable" /></label>
    ${scoreInputs}<div class="form-actions"><button class="button warning" type="submit">Create and score candidate</button></div>
  </form>`;
}

export function renderMissionPortfolio(state) {
  return state.missions.map((mission) => `<article class="task"><div><h4 class="task-title">${escapeHtml(mission.name)}</h4>
    <div class="task-meta"><span class="pill ${className(mission.evaluation.decision)}">${mission.evaluation.decision} ${mission.evaluation.score}/100</span><span class="pill">${escapeHtml(mission.status)}</span><span class="muted tiny">${mission.evaluation.openGates.length} gates open</span></div>
    <p class="task-description">${escapeHtml(mission.buyer)}</p></div><div class="task-actions"><button class="button ghost" data-action="focus-mission" data-mission-id="${escapeHtml(mission.id)}">View</button></div></article>`).join('');
}

export function renderAudit(state) {
  if (!state.audit.length) return '<div class="empty">No audit entries.</div>';
  return `<table class="ledger-table"><thead><tr><th>When</th><th>Type</th><th>Action</th><th>Detail</th><th>Status</th></tr></thead><tbody>${state.audit.slice(0, 30).map((entry) => `<tr>
    <td>${escapeHtml(formatDate(entry.at))}</td><td>${escapeHtml(entry.type || entry.kind || 'system')}</td><td><strong>${escapeHtml(entry.title)}</strong></td><td>${escapeHtml(entry.detail)}</td><td>${escapeHtml(entry.status)}</td></tr>`).join('')}</tbody></table>`;
}
