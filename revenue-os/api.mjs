import {
  buildDeterministicGrill,
  computeMetrics,
  createCandidateMission,
  evaluateMission,
  REQUIRED_GATES,
} from './core.mjs';
import {
  addAudit,
  CONFIG,
  ensureOneActiveMission,
  enrichState,
  findMission,
  findTask,
  getState,
  newId,
  resetState,
  runAiGrill,
  runTask,
  saveState,
} from './runtime.mjs';

function normalizeTaskPatch(body, httpError) {
  const patch = {};
  const statuses = new Set(['queued', 'running', 'done', 'blocked', 'failed', 'cancelled']);
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!statuses.has(status)) throw httpError(400, 'invalid task status');
    patch.status = status;
  }
  if (body.output !== undefined) patch.output = String(body.output).slice(0, 100_000);
  if (body.error !== undefined) patch.error = String(body.error).slice(0, 20_000);
  if (body.blockedBy !== undefined) patch.blockedBy = String(body.blockedBy).slice(0, 2_000);
  if (body.priority !== undefined) patch.priority = Math.max(1, Math.min(99, Number(body.priority) || 99));
  return patch;
}

export async function handleApi(req, res, pathname, helpers) {
  const { json, readJson, httpError } = helpers;
  const state = getState();

  if (req.method === 'GET' && pathname === '/api/health') {
    return json(res, 200, { ok: true, service: 'revenue-os', time: new Date().toISOString() });
  }
  if (req.method === 'GET' && pathname === '/api/auth/status') {
    return json(res, 200, { required: Boolean(CONFIG.revenueOsToken) });
  }
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readJson(req);
    if (!CONFIG.revenueOsToken || helpers.safeEqual(body.token || '', CONFIG.revenueOsToken)) {
      return json(res, 200, { ok: true, token: CONFIG.revenueOsToken ? String(body.token || '') : '' });
    }
    return json(res, 401, { error: 'invalid token' });
  }
  if (req.method === 'GET' && pathname === '/api/state') {
    return json(res, 200, enrichState());
  }
  if (req.method === 'GET' && pathname === '/api/agent-os/status') {
    try {
      const response = await fetch(`${CONFIG.agentOsUrl}/api/health`, {
        headers: CONFIG.agentOsToken ? { 'x-agentos-token': CONFIG.agentOsToken } : {},
        signal: AbortSignal.timeout(5_000),
      });
      return json(res, response.ok ? 200 : 502, { ok: response.ok, url: CONFIG.agentOsUrl, status: response.status });
    } catch (error) {
      return json(res, 502, { ok: false, url: CONFIG.agentOsUrl, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (req.method === 'POST' && pathname === '/api/missions') {
    const mission = createCandidateMission(await readJson(req));
    state.missions.push(mission);
    ensureOneActiveMission(mission.id);
    addAudit({ type: 'mission', title: `Candidate created: ${mission.name}`, detail: 'The previous active mission was parked. Candidate starts in evidence stage.' });
    saveState();
    return json(res, 201, { mission, evaluation: evaluateMission(mission.scoreInput, mission.hardGates, mission.fatalRisks) });
  }

  let match = pathname.match(/^\/api\/missions\/([^/]+)$/);
  if (match && req.method === 'PATCH') {
    const mission = findMission(decodeURIComponent(match[1]));
    if (!mission) throw httpError(404, 'mission not found');
    const body = await readJson(req);
    const fields = ['name', 'brand', 'thesis', 'buyer', 'problem', 'offer', 'currency', 'primaryChannel', 'stage', 'status', 'competitionRisk', 'nextAction', 'ownerDecision'];
    for (const field of fields) if (body[field] !== undefined) mission[field] = String(body[field]).slice(0, 10_000);
    if (body.priceCents !== undefined) mission.priceCents = Math.max(0, Number(body.priceCents) || 0);
    if (body.scoreInput && typeof body.scoreInput === 'object') mission.scoreInput = { ...mission.scoreInput, ...body.scoreInput };
    if (body.hardGates && typeof body.hardGates === 'object') {
      const allowed = Object.fromEntries(REQUIRED_GATES
        .filter((key) => Object.prototype.hasOwnProperty.call(body.hardGates, key))
        .map((key) => [key, Boolean(body.hardGates[key])]));
      mission.hardGates = { ...mission.hardGates, ...allowed };
    }
    if (Array.isArray(body.fatalRisks)) mission.fatalRisks = body.fatalRisks.map(String).slice(0, 20);
    mission.updatedAt = new Date().toISOString();
    ensureOneActiveMission(mission.id);
    const evaluation = evaluateMission(mission.scoreInput, mission.hardGates, mission.fatalRisks);
    addAudit({ type: 'mission', title: `Mission updated: ${mission.name}`, detail: `Decision is now ${evaluation.decision}.` });
    saveState();
    return json(res, 200, { mission, evaluation });
  }

  match = pathname.match(/^\/api\/missions\/([^/]+)\/grill$/);
  if (match && req.method === 'POST') {
    const mission = findMission(decodeURIComponent(match[1]));
    if (!mission) throw httpError(404, 'mission not found');
    const body = await readJson(req);
    const report = buildDeterministicGrill(mission);
    if (body.useAi === true) {
      try { report.ai = await runAiGrill(mission); }
      catch (error) { report.aiError = error instanceof Error ? error.message : String(error); }
    }
    mission.grillReports = Array.isArray(mission.grillReports) ? mission.grillReports : [];
    mission.grillReports.unshift(report);
    if (mission.grillReports.length > 20) mission.grillReports.length = 20;
    mission.updatedAt = new Date().toISOString();
    addAudit({
      type: 'grill',
      title: `Grill completed: ${mission.name}`,
      detail: `${report.verdict} at ${report.score}/100${report.ai ? '; AI red team included' : report.aiError ? '; AI unavailable, deterministic report retained' : ''}.`,
      status: report.verdict === 'KILL' ? 'warning' : 'ok',
    });
    saveState();
    return json(res, 200, { report });
  }

  match = pathname.match(/^\/api\/tasks\/([^/]+)\/run$/);
  if (match && req.method === 'POST') return json(res, 200, { task: await runTask(decodeURIComponent(match[1]), 'manual') });
  if (req.method === 'POST' && pathname === '/api/tasks/run-next') {
    const task = state.tasks.filter((item) => item.status === 'queued' && item.executionMode === 'internal').sort((a, b) => a.priority - b.priority)[0];
    if (!task) return json(res, 409, { error: 'no queued internal task' });
    return json(res, 200, { task: await runTask(task.id, 'manual') });
  }

  match = pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (match && req.method === 'PATCH') {
    const task = findTask(decodeURIComponent(match[1]));
    if (!task) throw httpError(404, 'task not found');
    Object.assign(task, normalizeTaskPatch(await readJson(req), httpError));
    task.updatedAt = new Date().toISOString();
    if (task.status === 'done' && !task.completedAt) task.completedAt = task.updatedAt;
    addAudit({ type: 'task', title: `Task updated: ${task.title}`, detail: `Status: ${task.status}. Updated manually by CEO/project manager.` });
    saveState();
    return json(res, 200, { task });
  }

  if (req.method === 'POST' && pathname === '/api/events') {
    const body = await readJson(req);
    const allowed = new Set(['prospect_contacted', 'positive_reply', 'sales_call', 'payment', 'refund', 'delivery', 'testimonial', 'note']);
    const kind = String(body.kind || '');
    if (!allowed.has(kind)) throw httpError(400, 'invalid event kind');
    const event = {
      id: newId(), kind, missionId: String(body.missionId || ''),
      customerKey: String(body.customerKey || '').slice(0, 200),
      amountCents: Math.max(0, Number(body.amountCents) || 0),
      currency: String(body.currency || 'USD').toUpperCase().slice(0, 8),
      detail: String(body.detail || '').slice(0, 10_000), at: new Date().toISOString(),
    };
    state.events.unshift(event);
    if (state.events.length > 2_000) state.events.length = 2_000;
    addAudit({ type: 'event', title: `Logged: ${kind}`, detail: kind === 'payment' ? `Payment ${(event.amountCents / 100).toFixed(2)} ${event.currency}.` : event.detail || 'No detail.' });
    saveState();
    return json(res, 201, { event, metrics: computeMetrics(state) });
  }

  if (req.method === 'PATCH' && pathname === '/api/automation') {
    const body = await readJson(req);
    if (body.enabled !== undefined) state.automation.enabled = Boolean(body.enabled);
    if (body.dailyRunLimit !== undefined) state.automation.dailyRunLimit = Math.max(1, Math.min(24, Number(body.dailyRunLimit) || 6));
    state.automation.allowExternalActions = false;
    state.automation.note = 'Internal analysis only. Outreach, publishing, spending and legal acceptance remain human-gated.';
    addAudit({ type: 'automation-setting', title: `Automation ${state.automation.enabled ? 'enabled' : 'disabled'}`, detail: `Daily internal-task limit: ${state.automation.dailyRunLimit}. External actions: disabled.` });
    saveState();
    return json(res, 200, { automation: state.automation });
  }

  if (req.method === 'POST' && pathname === '/api/reset') {
    const body = await readJson(req);
    if (body.confirm !== 'RESET REVENUE OS') throw httpError(400, 'exact confirmation required');
    return json(res, 200, { ok: true, backup: resetState() });
  }

  throw httpError(404, 'API route not found');
}
