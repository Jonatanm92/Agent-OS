import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import {
  appendAudit,
  buildDeterministicGrill,
  computeMetrics,
  countAutomationAttempts,
  evaluateMission,
  GATE_LABELS,
  hydrateState,
  nextRunnableTask,
  REQUIRED_GATES,
  SCORE_LABELS,
  SCORE_WEIGHTS,
} from './core.mjs';
import { buildDefaultState } from './company.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CONFIG = Object.freeze({
  host: process.env.REVENUE_OS_HOST || '127.0.0.1',
  port: Number(process.env.REVENUE_OS_PORT || 3010),
  agentOsUrl: String(process.env.AGENT_OS_URL || 'http://127.0.0.1:3001').replace(/\/$/, ''),
  agentOsToken: process.env.AGENT_OS_TOKEN || '',
  revenueOsToken: process.env.REVENUE_OS_TOKEN || '',
  dataDir: path.resolve(process.env.REVENUE_OS_DATA_DIR || path.join(__dirname, 'data')),
  publicDir: path.join(__dirname, 'public'),
  automationIntervalMs: Number(process.env.REVENUE_OS_AUTOMATION_INTERVAL_MS || 60_000),
});

export const STATE_PATH = path.join(CONFIG.dataDir, 'state.json');
fs.mkdirSync(CONFIG.dataDir, { recursive: true });

let state = loadState();
let automationBusy = false;

function atomicWriteJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

function loadState() {
  const defaults = buildDefaultState();
  if (!fs.existsSync(STATE_PATH)) {
    const initial = hydrateState(null, defaults);
    atomicWriteJson(STATE_PATH, initial);
    return initial;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    const hydrated = hydrateState(parsed, defaults);
    atomicWriteJson(STATE_PATH, hydrated);
    return hydrated;
  } catch (error) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = `${STATE_PATH}.corrupt-${stamp}`;
    try { fs.copyFileSync(STATE_PATH, backup); } catch { /* best effort */ }
    const initial = hydrateState(null, defaults);
    appendAudit(initial, {
      type: 'system',
      title: 'State recovery',
      detail: `Invalid state was replaced. Backup: ${path.basename(backup)}. Error: ${error instanceof Error ? error.message : String(error)}`,
      status: 'warning',
    });
    atomicWriteJson(STATE_PATH, initial);
    return initial;
  }
}

export function getState() {
  return state;
}

export function saveState() {
  atomicWriteJson(STATE_PATH, state);
}

export function enrichState() {
  const result = JSON.parse(JSON.stringify(state));
  result.metrics = computeMetrics(state);
  result.reference = {
    scoreWeights: SCORE_WEIGHTS,
    scoreLabels: SCORE_LABELS,
    requiredGates: REQUIRED_GATES,
    gateLabels: GATE_LABELS,
  };
  result.missions = result.missions.map((mission) => ({
    ...mission,
    evaluation: evaluateMission(mission.scoreInput, mission.hardGates, mission.fatalRisks),
  }));
  result.runtime = {
    host: CONFIG.host,
    port: CONFIG.port,
    agentOsUrl: CONFIG.agentOsUrl,
    agentOsTokenConfigured: Boolean(CONFIG.agentOsToken),
    revenueOsTokenRequired: Boolean(CONFIG.revenueOsToken),
    persistedAt: fs.existsSync(STATE_PATH) ? fs.statSync(STATE_PATH).mtime.toISOString() : null,
  };
  return result;
}

export function findMission(id) {
  return state.missions.find((mission) => mission.id === id);
}

export function findTask(id) {
  return state.tasks.find((task) => task.id === id);
}

export function findRole(id) {
  return state.roles.find((role) => role.id === id);
}

export function ensureOneActiveMission(candidateId = '') {
  const active = state.missions.filter((mission) => mission.status === 'active' && mission.stage !== 'killed');
  if (active.length <= 1) return;
  for (const mission of active) {
    if (mission.id !== candidateId) mission.status = 'parked';
  }
}

function buildTaskPrompt(task, mission, role) {
  return [
    role.prompt,
    '',
    'COMPANY OPERATING RULES:',
    '- One active revenue mission.',
    '- Evidence before code; payment before scale.',
    '- Never fabricate research, prospects, tests, payments, integrations or customer responses.',
    '- Do not contact anyone, publish, spend money, accept legal terms or change financial accounts.',
    '- Clearly separate completed work, assumptions, unknowns and CEO-only actions.',
    '',
    `ACTIVE MISSION: ${mission.name}`,
    `BUYER: ${mission.buyer}`,
    `PROBLEM: ${mission.problem}`,
    `OFFER: ${mission.offer}`,
    `PRICE: ${(mission.priceCents / 100).toFixed(2)} ${mission.currency}`,
    `CURRENT NEXT ACTION: ${mission.nextAction}`,
    '',
    `YOUR TASK: ${task.title}`,
    `DEFINITION OF DONE: ${task.definitionOfDone}`,
    '',
    'Return a usable work product, not advice about doing the work. End with:',
    'VERIFICATION: what was actually checked',
    'OPEN RISKS: remaining uncertainties',
    'CEO ACTION: none, or the one unavoidable owner-only action',
  ].join('\n');
}

async function callAgentOs(agentId, message) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(`${CONFIG.agentOsUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(CONFIG.agentOsToken ? { 'x-agentos-token': CONFIG.agentOsToken } : {}),
      },
      body: JSON.stringify({ message, agentId, useMemory: true, agentic: false }),
      signal: controller.signal,
    });
    const raw = await response.text();
    let body;
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = { error: raw.slice(0, 500) }; }
    if (!response.ok) throw new Error(`Agent OS ${response.status}: ${body.error || 'request failed'}`);
    const reply = String(body.reply || '').trim();
    if (!reply) throw new Error('Agent OS returned no work product');
    return { reply, model: String(body.model || ''), agentId: String(body.agentId || agentId) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runTask(taskId, source = 'manual') {
  const task = findTask(taskId);
  if (!task) throw Object.assign(new Error('task not found'), { status: 404 });
  if (task.executionMode !== 'internal') {
    throw Object.assign(new Error('only internal tasks can be executed by Revenue OS'), { status: 409 });
  }
  if (!['queued', 'failed'].includes(task.status)) {
    throw Object.assign(new Error(`task is ${task.status}, not runnable`), { status: 409 });
  }
  const mission = findMission(task.missionId);
  const role = findRole(task.roleId);
  if (!mission || !role) throw Object.assign(new Error('task is missing its mission or role'), { status: 409 });

  task.status = 'running';
  task.error = '';
  task.updatedAt = new Date().toISOString();
  appendAudit(state, {
    type: 'task',
    title: `Started: ${task.title}`,
    detail: `${role.name} via ${role.agentId}; source=${source}`,
  });
  saveState();

  try {
    const result = await callAgentOs(role.agentId, buildTaskPrompt(task, mission, role));
    task.status = 'done';
    task.output = result.reply;
    task.error = '';
    task.completedAt = new Date().toISOString();
    task.updatedAt = task.completedAt;
    task.execution = {
      source,
      agentId: result.agentId,
      model: result.model,
      verifiedBy: 'Agent OS API response received; factual claims inside the output still require their stated verification.',
    };
    appendAudit(state, {
      type: 'task',
      title: `Completed: ${task.title}`,
      detail: `${role.name} produced ${task.output.length} characters through ${result.model || result.agentId}.`,
    });
    saveState();
    return task;
  } catch (error) {
    task.status = 'failed';
    task.error = error instanceof Error ? error.message : String(error);
    task.updatedAt = new Date().toISOString();
    appendAudit(state, { type: 'task', title: `Failed: ${task.title}`, detail: task.error, status: 'error' });
    saveState();
    throw Object.assign(new Error(task.error), { status: 502 });
  }
}

export async function runAiGrill(mission) {
  const role = findRole('qa-red-team');
  if (!role) throw new Error('QA / Red Team role missing');
  const deterministic = buildDeterministicGrill(mission);
  const prompt = [
    role.prompt,
    '',
    'RED-TEAM THE FOLLOWING REVENUE MISSION. Treat the deterministic score as an input, not truth.',
    'Do not brainstorm replacement businesses unless the current mission must be killed.',
    'Do not approve without external or direct buyer evidence.',
    '',
    JSON.stringify({ mission, deterministic }, null, 2),
    '',
    'Return: VERDICT (GO/TEST/KILL), strongest case against, hidden assumptions, cheapest falsification test, kill thresholds, and exact CEO decision if any.',
  ].join('\n');
  const result = await callAgentOs(role.agentId, prompt);
  return { text: result.reply, model: result.model, agentId: result.agentId };
}

function automationRunsToday() {
  return countAutomationAttempts(state.audit);
}

export async function automationTick() {
  if (automationBusy || !state.automation.enabled) return;
  const limit = Math.max(1, Math.min(24, Number(state.automation.dailyRunLimit) || 6));
  if (automationRunsToday() >= limit) return;
  const task = nextRunnableTask(state);
  if (!task) return;

  automationBusy = true;
  try {
    await runTask(task.id, 'automation');
    state.automation.lastRunAt = new Date().toISOString();
    appendAudit(state, {
      type: 'automation',
      title: `Automation completed: ${task.title}`,
      detail: 'Internal task only. No outreach, publishing, spending or legal action was performed.',
    });
  } catch (error) {
    appendAudit(state, {
      type: 'automation',
      title: `Automation stopped: ${task.title}`,
      detail: error instanceof Error ? error.message : String(error),
      status: 'error',
    });
  } finally {
    automationBusy = false;
    saveState();
  }
}

export function resetState() {
  const backup = `${STATE_PATH}.backup-${Date.now()}`;
  if (fs.existsSync(STATE_PATH)) fs.copyFileSync(STATE_PATH, backup);
  state = buildDefaultState();
  appendAudit(state, {
    type: 'system',
    title: 'Revenue OS reset',
    detail: `Previous state backed up to ${path.basename(backup)}.`,
    status: 'warning',
  });
  saveState();
  return path.basename(backup);
}

export function addAudit(entry) {
  appendAudit(state, entry);
}

export function newId() {
  return randomUUID();
}
