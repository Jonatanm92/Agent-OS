import { renderDashboard } from './render.js';
import { activeMission } from './utils.js';

const TOKEN_KEY = 'revenue_os_token';
let state = null;
let agentOsOnline = false;
let busy = false;

const appEl = document.querySelector('#app');
const authEl = document.querySelector('#auth-screen');
const contentEl = document.querySelector('#content');
const bannerEl = document.querySelector('#banner');
const runtimeBadge = document.querySelector('#runtime-badge');
const modalEl = document.querySelector('#modal');
const modalTitle = document.querySelector('#modal-title');
const modalOutput = document.querySelector('#modal-output');

const token = () => localStorage.getItem(TOKEN_KEY) || '';

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(token() ? { 'x-revenue-os-token': token() } : {}), ...(options.headers || {}) },
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { error: raw || `HTTP ${response.status}` }; }
  if (!response.ok) {
    if (response.status === 401) showLogin();
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return body;
}

function showBanner(message, type = 'success') {
  bannerEl.textContent = message;
  bannerEl.className = `banner ${type}`;
  bannerEl.classList.remove('hidden');
  clearTimeout(showBanner.timer);
  showBanner.timer = setTimeout(() => bannerEl.classList.add('hidden'), 7000);
}

function setBusy(value) {
  busy = value;
  document.querySelectorAll('[data-action]').forEach((button) => { if (button.dataset.allowBusy !== 'true') button.disabled = value; });
}

function showLogin(error = '') {
  appEl.classList.add('hidden');
  authEl.classList.remove('hidden');
  document.querySelector('#login-error').textContent = error;
  setTimeout(() => document.querySelector('#login-token')?.focus(), 0);
}

function showApp() {
  authEl.classList.add('hidden');
  appEl.classList.remove('hidden');
}

function render() {
  if (state) contentEl.innerHTML = renderDashboard(state, agentOsOnline);
}

async function loadState({ silent = false } = {}) {
  try { state = await request('/api/state'); showApp(); render(); checkAgentOs(); }
  catch (error) { if (!silent) showBanner(error.message, 'error'); }
}

async function checkAgentOs() {
  const previous = agentOsOnline;
  try { agentOsOnline = Boolean((await request('/api/agent-os/status')).ok); }
  catch { agentOsOnline = false; }
  runtimeBadge.textContent = agentOsOnline ? 'Agent OS online' : 'Agent OS offline';
  runtimeBadge.className = `runtime-badge ${agentOsOnline ? 'online' : 'offline'}`;
  if (state && previous !== agentOsOnline) render();
}

function openModal(title, output) {
  modalTitle.textContent = title;
  modalOutput.textContent = output || '(no output recorded)';
  modalEl.classList.remove('hidden');
}
const closeModal = () => modalEl.classList.add('hidden');

async function withBusy(work, successMessage = '') {
  if (busy) return;
  setBusy(true);
  try { await work(); await loadState({ silent: true }); if (successMessage) showBanner(successMessage); }
  catch (error) { showBanner(error.message, 'error'); }
  finally { setBusy(false); }
}

contentEl.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'refresh') return loadState();
  if (action === 'run-next') return withBusy(() => request('/api/tasks/run-next', { method: 'POST', body: '{}' }), 'Internal work product completed.');
  if (action === 'run-task') return withBusy(() => request(`/api/tasks/${encodeURIComponent(button.dataset.taskId)}/run`, { method: 'POST', body: '{}' }), 'Task completed by the assigned AI employee.');
  if (action === 'record-task') {
    const task = state.tasks.find((item) => item.id === button.dataset.taskId);
    const output = window.prompt(`Record what was actually completed for:\n${task?.title || ''}\n\nDo not mark it done unless the real-world action occurred.`);
    if (!output?.trim()) return;
    return withBusy(() => request(`/api/tasks/${encodeURIComponent(button.dataset.taskId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'done', output }) }), 'Completion recorded.');
  }
  if (action === 'view-task') {
    const task = state.tasks.find((item) => item.id === button.dataset.taskId);
    return openModal(task?.title || 'Task output', task?.output || task?.error || '');
  }
  if (action === 'grill') {
    const mission = activeMission(state);
    const useAi = button.dataset.ai === 'true';
    return withBusy(() => request(`/api/missions/${encodeURIComponent(mission.id)}/grill`, { method: 'POST', body: JSON.stringify({ useAi }) }), useAi ? 'AI red-team and deterministic grill completed.' : 'Deterministic grill completed.');
  }
  if (action === 'view-grill') {
    const mission = state.missions.find((item) => item.id === button.dataset.missionId);
    const report = mission?.grillReports?.[0];
    return openModal('AI red-team output', report?.ai?.text || report?.aiError || 'No AI output.');
  }
  if (action === 'save-automation') {
    const enabled = document.querySelector('#automation-enabled').checked;
    const dailyRunLimit = Number(document.querySelector('#automation-limit').value);
    return withBusy(() => request('/api/automation', { method: 'PATCH', body: JSON.stringify({ enabled, dailyRunLimit }) }), `Internal automation ${enabled ? 'enabled' : 'disabled'}.`);
  }
  if (action === 'focus-mission') {
    const mission = state.missions.find((item) => item.id === button.dataset.missionId);
    if (!mission) return;
    if (mission.status !== 'active') {
      if (!window.confirm(`Make “${mission.name}” the single active mission? The current mission will be parked.`)) return;
      await withBusy(() => request(`/api/missions/${encodeURIComponent(mission.id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'active' }) }), 'Active mission changed.');
    }
    document.querySelector('#mission')?.scrollIntoView({ behavior: 'smooth' });
  }
});

contentEl.addEventListener('change', async (event) => {
  const input = event.target.closest('[data-action="toggle-gate"]');
  if (!input) return;
  const mission = state.missions.find((item) => item.id === input.dataset.missionId);
  if (!mission) return;
  const hardGates = { ...mission.hardGates, [input.dataset.gate]: input.checked };
  await withBusy(() => request(`/api/missions/${encodeURIComponent(mission.id)}`, { method: 'PATCH', body: JSON.stringify({ hardGates }) }), input.checked ? 'Gate marked closed. Keep the supporting evidence.' : 'Gate reopened.');
});

contentEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.id === 'event-form') {
    const values = Object.fromEntries(new FormData(form));
    return withBusy(() => request('/api/events', { method: 'POST', body: JSON.stringify({
      missionId: values.missionId, kind: values.kind, customerKey: values.customerKey,
      amountCents: Math.round(Number(values.amount || 0) * 100), currency: values.currency, detail: values.detail,
    }) }), 'Real-world event logged.');
  }
  if (form.id === 'candidate-form') {
    const values = Object.fromEntries(new FormData(form));
    if (!window.confirm('Create this candidate and park the current active mission?')) return;
    const scoreInput = {};
    for (const key of Object.keys(state.reference.scoreLabels)) scoreInput[key] = Number(values[`score_${key}`]);
    return withBusy(() => request('/api/missions', { method: 'POST', body: JSON.stringify({
      name: values.name, brand: values.brand, buyer: values.buyer, problem: values.problem, offer: values.offer,
      priceCents: Math.round(Number(values.price || 0) * 100), currency: values.currency, primaryChannel: values.primaryChannel, scoreInput,
    }) }), 'Candidate created. It remains blocked from coding until evidence and hard gates justify it.');
  }
});

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = document.querySelector('#login-token').value;
  document.querySelector('#login-error').textContent = '';
  try {
    const result = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ token: value }) });
    localStorage.setItem(TOKEN_KEY, result.token || value);
    await loadState();
  } catch (error) { document.querySelector('#login-error').textContent = error.message; }
});

document.querySelector('#modal-close').addEventListener('click', closeModal);
modalEl.addEventListener('click', (event) => { if (event.target === modalEl) closeModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
document.querySelector('#menu-button').addEventListener('click', () => document.body.classList.toggle('nav-open'));
document.querySelectorAll('[data-scroll]').forEach((button) => button.addEventListener('click', () => {
  document.querySelector(`#${button.dataset.scroll}`)?.scrollIntoView({ behavior: 'smooth' });
  document.body.classList.remove('nav-open');
  document.querySelectorAll('[data-scroll]').forEach((item) => item.classList.toggle('active', item === button));
}));

async function init() {
  try {
    const status = await request('/api/auth/status');
    if (status.required && !token()) return showLogin();
    await loadState();
    setInterval(() => loadState({ silent: true }), 30_000);
    setInterval(checkAgentOs, 15_000);
  } catch (error) { showLogin(error.message); }
}

init();
