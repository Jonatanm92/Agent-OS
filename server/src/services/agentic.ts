import * as fcc from './fcc.js';
import type { ChatTurn } from './fcc.js';
import * as workspace from './workspace.js';
import * as toolRegistry from './tool-registry.js';
import {
  formatSandboxResult,
  normalizeSandboxTask,
  runSandboxTask,
} from './sandbox.js';

/**
 * Component 4/5 — a model-agnostic tool loop (ReAct style).
 *
 * Instead of relying on a model's native tool-calling format (which breaks for
 * some providers through proxies), we instruct the model to emit a single JSON
 * action per turn. The dashboard executes it against the active Workspace
 * project and feeds the result back, looping until the model says it is done.
 * This works with any model, including Owl Alpha.
 *
 * Security boundary: models may write inside the selected workspace, but they
 * cannot execute arbitrary host-shell commands. Deterministic tasks run only in
 * the deny-by-default Docker sandbox defined in sandbox.ts. npm dependency
 * resolution is a separate fixed capability: registry-only, scripts disabled,
 * validated lockfile output, then networkless install/rebuild/test execution.
 */

const TOOL_INSTRUCTIONS = `
You are operating as an autonomous agent with tools that act on the user's
workspace project. To take an action, reply with EXACTLY ONE JSON object and
nothing else (no prose, no markdown fences):

  {"tool":"write_file","args":{"path":"index.html","content":"<file contents>"}}
  {"tool":"read_file","args":{"path":"index.html"}}
  {"tool":"list_files","args":{}}
  {"tool":"run_task","args":{"task":"node-lock"}}
  {"tool":"run_task","args":{"task":"node-test"}}
  {"tool":"<custom_tool>","args":{"input":"..."}}

Allowed run_task values:
- node-lock (resolve/refresh package-lock.json from npm registry declarations only)
- node-test
- node-build
- node-lint
- node-typecheck
- python-test

When the task is fully complete, reply with:

  {"tool":"done","args":{"message":"a short summary for the user"}}

Rules:
- Output ONLY the JSON object. No explanations around it.
- Paths are relative to the project root.
- Arbitrary shell commands, unrestricted network access, public deployment,
  customer contact, secrets, and spending are unavailable to this loop.
- When package.json adds or changes dependencies, run node-lock before Node
  verification. node-lock can write only a validated package-lock.json.
- npm resolution/install phases accept registry.npmjs.org artifacts only and run
  with package scripts disabled. Lifecycle scripts and verification run later
  with the network disabled and without host secrets.
- run_task commands are fixed; never try to pass shell text as a task.
- Custom tools from tools.json are capability-limited built-ins or sandbox tasks.
- Do one action per reply; you'll get the result before your next step.
- Prefer writing complete, working files in one write_file call.
- A code task is not done until at least one relevant deterministic run_task has
  returned PASS after the latest material code/dependency change.
`.trim();

interface Action {
  tool: string;
  args: Record<string, unknown>;
}

const VERIFICATION_TASKS = new Set([
  'node-test',
  'node-build',
  'node-lint',
  'node-typecheck',
  'python-test',
]);

/** Robustly pull the first JSON action object out of a model reply. */
export function parseAction(text: string): Action | null {
  if (!text) return null;
  let t = text.trim();
  // Strip surrounding markdown code fences if present.
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const obj = JSON.parse(t.slice(start, end + 1));
    if (obj && typeof obj.tool === 'string') {
      return { tool: obj.tool, args: (obj.args as Record<string, unknown>) ?? {} };
    }
  } catch {
    /* not a JSON action */
  }
  return null;
}

function executeTool(projectId: string, action: Action): string {
  const args = action.args ?? {};
  try {
    if (action.tool === 'write_file') {
      const f = workspace.writeFileContent(
        projectId,
        String(args.path ?? ''),
        String(args.content ?? '')
      );
      return `OK: wrote ${f.path} (${f.size} bytes)`;
    }
    if (action.tool === 'read_file') {
      const { content } = workspace.readFileContent(projectId, String(args.path ?? ''));
      const s = content.toString('utf8');
      return s.length > 4000 ? s.slice(0, 4000) + '\n...[truncated]' : s;
    }
    if (action.tool === 'list_files') {
      const files = workspace.listFiles(projectId);
      return files.length ? files.map((f) => f.path).join('\n') : '(project is empty)';
    }
    if (action.tool === 'run_task') {
      const project = workspace.getProject(projectId);
      if (!project) return 'ERROR: no active project';
      const task = normalizeSandboxTask(args.task);
      if (!task) {
        return (
          'ERROR: unsupported sandbox task. Use node-lock, node-test, node-build, ' +
          'node-lint, node-typecheck, or python-test.'
        );
      }
      return formatSandboxResult(runSandboxTask(project.path, task, 180_000));
    }
    if (action.tool === 'run_command') {
      return 'BLOCKED BY POLICY: arbitrary host-shell execution is disabled. Use a supported run_task value.';
    }
    // Check the capability-limited tool registry (tools.json).
    const customTool = toolRegistry.findTool(action.tool);
    if (customTool) {
      const project = workspace.getProject(projectId);
      return toolRegistry.executeTool(customTool, args, project?.path ?? process.cwd());
    }
    return `ERROR: unknown tool "${action.tool}"`;
  } catch (e) {
    return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function codeProject(projectId: string): boolean {
  return workspace
    .listFiles(projectId)
    .some((file) => file.path === 'package.json' || file.path === 'pyproject.toml');
}

function verifiedAfterLatestWrite(steps: AgenticStep[]): boolean {
  let lastMaterialWrite = -1;
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    if (step.tool === 'write_file' && step.args.path !== 'package-lock.json') {
      lastMaterialWrite = index;
    }
  }
  return steps.some((step, index) => {
    if (index <= lastMaterialWrite || step.tool !== 'run_task') return false;
    const task = String(step.args.task ?? '');
    return VERIFICATION_TASKS.has(task) && /^PASS:/m.test(step.result);
  });
}

export interface AgenticStep {
  tool: string;
  args: Record<string, unknown>;
  result: string;
}
export interface AgenticResult {
  reply: string;
  steps: AgenticStep[];
  model: string;
}

export async function runAgentic(
  agentId: string,
  history: ChatTurn[],
  projectId: string,
  baseSystem?: string,
  maxSteps = 12
): Promise<AgenticResult> {
  const steps: AgenticStep[] = [];
  const msgs: ChatTurn[] = history.map((h) => ({ ...h }));
  const system = (baseSystem ? baseSystem + '\n\n' : '') + TOOL_INSTRUCTIONS;
  const stepLimit = Math.max(1, Math.min(20, Math.round(maxSteps)));
  let model = '';

  if (!projectId) {
    return {
      reply: 'No active workspace project. Create/select one (top-right) before using agent mode.',
      steps,
      model,
    };
  }

  for (let i = 0; i < stepLimit; i++) {
    const result = await fcc.runAgent(agentId, msgs, system);
    model = result.model;
    const action = parseAction(result.text);

    if (!action) {
      // Model answered in prose — treat as the final answer only for non-code work.
      if (codeProject(projectId) && !verifiedAfterLatestWrite(steps)) {
        const observation =
          'BLOCKED: this workspace contains a code project, but no deterministic verification task has passed after the latest material write. Run node-lock when needed, then a relevant test/build/lint/typecheck task.';
        steps.push({ tool: 'done', args: {}, result: observation });
        msgs.push({ role: 'assistant', content: result.text });
        msgs.push({ role: 'user', content: `COMPLETION GATE:\n${observation}` });
        continue;
      }
      return { reply: result.text, steps, model };
    }
    if (action.tool === 'done') {
      if (codeProject(projectId) && !verifiedAfterLatestWrite(steps)) {
        const observation =
          'BLOCKED: code cannot be declared done until a relevant deterministic run_task returns PASS after the latest material write.';
        steps.push({ tool: 'done', args: action.args, result: observation });
        msgs.push({ role: 'assistant', content: JSON.stringify(action) });
        msgs.push({ role: 'user', content: `COMPLETION GATE:\n${observation}` });
        continue;
      }
      return { reply: String(action.args.message ?? 'Done.'), steps, model };
    }

    const observation = executeTool(projectId, action);
    steps.push({ tool: action.tool, args: action.args, result: observation });

    msgs.push({ role: 'assistant', content: JSON.stringify({ tool: action.tool, args: action.args }) });
    msgs.push({ role: 'user', content: `TOOL RESULT (${action.tool}):\n${observation}` });
  }

  return {
    reply: `Reached the ${stepLimit}-step safety limit. Any files I created are in your Workspace tab. The item is not complete unless the deterministic completion gate passed.`,
    steps,
    model,
  };
}
