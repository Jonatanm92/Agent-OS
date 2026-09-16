import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Read-only: never imports runtime.mjs (which initializes state), starts workers,
// sends prompts, prints tokens, or changes a deployment.
const dir = path.dirname(fileURLToPath(import.meta.url));
const stateFile = path.join(process.env.REVENUE_OS_DATA_DIR || path.join(dir, 'data'), 'state.json');
const revenueUrl = `http://${process.env.REVENUE_OS_HOST || '127.0.0.1'}:${process.env.REVENUE_OS_PORT || 3010}`;
const agentUrl = process.env.AGENT_OS_URL || 'http://127.0.0.1:3001';
async function health(url, token, header) {
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/api/health`, {
      headers: token ? { [header]: token } : {}, signal: AbortSignal.timeout(3000), redirect: 'error',
    });
    const body = await response.json();
    return { reachable: response.ok && body.ok === true, httpStatus: response.status };
  } catch { return { reachable: false, reason: 'Service unavailable or health response invalid' }; }
}
let saved;
try { saved = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { saved = null; }
const [revenue, agent] = await Promise.all([
  health(revenueUrl, process.env.REVENUE_OS_TOKEN, 'x-revenue-os-token'),
  health(agentUrl, process.env.AGENT_OS_TOKEN, 'x-agentos-token'),
]);
const active = (saved?.missions ?? []).filter((m) => m.status === 'active' && m.stage !== 'killed');
const output = {
  checkedAt: new Date().toISOString(),
  revenueService: revenue,
  agentService: agent,
  stateReadable: Boolean(saved),
  schedulerEnabledInSavedState: saved?.automation?.enabled ?? null,
  activeMissionCount: active.length,
  tasksAwaitingQa: (saved?.tasks ?? []).filter((t) => t.status === 'review').length,
  blockedTasks: (saved?.tasks ?? []).filter((t) => ['blocked', 'failed'].includes(t.status)).length,
  modelExecutionVerified: false,
  customerDeliveryVerified: false,
  note: 'HTTP health is not proof of model execution or customer delivery. No prompt or paid provider call was made.',
};
console.log(JSON.stringify(output, null, 2));
if (!revenue.reachable || !agent.reachable || active.length !== 1) process.exitCode = 1;
