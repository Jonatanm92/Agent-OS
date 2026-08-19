import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AGENTS, getAgent } from '../services/agents.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');

function source(relative: string): string {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

describe('governed company registry', () => {
  it('exposes exactly the eight operating employees', () => {
    const visible = AGENTS.filter((agent) => agent.visible !== false).map((agent) => agent.id);
    expect(visible).toEqual([
      'ceo',
      'market-intelligence',
      'commercial-red-team',
      'product-lead',
      'software-architect',
      'build-engineer',
      'qa-security',
      'revenue-operations',
    ]);
  });

  it('maps legacy personal-project roles into governed employees', () => {
    expect(getAgent('orchestrator').id).toBe('ceo');
    expect(getAgent('reality-checker').id).toBe('qa-security');
    expect(getAgent('backend-architect').id).toBe('software-architect');
    expect(getAgent('growth-hacker').id).toBe('revenue-operations');
  });
});

describe('autonomous execution boundary', () => {
  it('does not expose arbitrary host command execution to agents or pipeline verification', () => {
    const agentic = source('server/src/services/agentic.ts');
    const pipeline = source('server/src/services/pipeline.ts');
    const registry = source('server/src/services/tool-registry.ts');
    const sandbox = source('server/src/services/sandbox.ts');

    expect(agentic).not.toContain('execSync(');
    expect(pipeline).not.toContain('execSync(');
    expect(registry).not.toContain('execSync(');
    expect(agentic).toContain('BLOCKED BY POLICY: arbitrary host-shell execution is disabled');
    expect(agentic).toContain('runSandboxTask(project.path, task, 180_000)');
    expect(pipeline).toContain("runVerificationTask(project.path, 'node-lock')");
    expect(pipeline).toContain('runVerificationTask(project.path, nodeTask.task)');
    expect(pipeline).toContain("task: 'node-test'");
    expect(pipeline).toContain("task: 'node-build'");
    expect(sandbox).toContain("'--pull=never'");
    expect(sandbox).toContain("network: 'none' | 'bridge'");
    expect(sandbox).toContain('`--network=${network}`');
    expect(sandbox).toContain("commonRestrictedRunArgs(containerName, 'none')");
    expect(sandbox).toContain("commonRestrictedRunArgs(containerName, 'bridge')");
    expect(sandbox).toContain("'--cap-drop=ALL'");
    expect(sandbox).toContain('validateNodeLockfile');
  });

  it('keeps Hermes out of YOLO mode and restricts its one-shot toolset', () => {
    const hermes = source('server/src/services/hermes.ts');
    expect(hermes).not.toContain("'--yolo'");
    expect(hermes).toContain("'--toolsets', 'todo'");
    expect(hermes).toContain("['HERMES_YOLO_MODE', '0']");
  });

  it('keeps untrusted workspace Git mutation blocked', () => {
    const git = source('server/src/services/git.ts');
    expect(git).toContain('Git mutation is owner-gated and disabled for untrusted workspaces');
    expect(git).toContain('mutationsEnabled: false');
  });
});

describe('owner control plane', () => {
  it('requires owner authentication for every state-changing API request', () => {
    const index = source('server/src/index.ts');
    expect(index).toContain('Mutating API operations require an authenticated owner.');
    expect(index).toContain("req.method === 'GET'");
    expect(index).toContain('return requireOwnerPassword(req, res, next);');
    expect(index).toContain("req.body?.agentId ?? 'product-lead'");
    expect(index).toContain("req.body?.agentId ?? 'build-engineer'");
    expect(index).not.toContain("api.get('/tunings'");
  });

  it('does not expose the legacy terminal or tuning tabs in the standard application', () => {
    const app = source('client/src/App.tsx');
    const sidebar = source('client/src/components/Sidebar.tsx');
    expect(app).toContain("useState<string>('ceo')");
    expect(app).not.toContain("import { TerminalTab }");
    expect(app).not.toContain("import { TuningTab }");
    expect(sidebar).not.toContain("id: 'terminal'");
    expect(sidebar).toContain('AI employees');
  });

  it('seeds the first revenue mission as an experiment, not a claimed sale', () => {
    const seed = source('server/src/db/seed.ts');
    expect(seed).toContain('DECISION: EXPERIMENT');
    expect(seed).toContain('PRODUCTION BUILD ALLOWED: NO');
    expect(seed).toContain('This is a commercial hypothesis');
    expect(seed).toContain('Do not contact prospects until the owner approves');
    expect(seed).toContain("'company-ceo-heartbeat'");
  });
});
