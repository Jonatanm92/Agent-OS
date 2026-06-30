import * as fcc from './fcc.js';
import type { ChatTurn } from './fcc.js';
import * as workspace from './workspace.js';
import { execSync } from 'node:child_process';

/**
 * Component 4/5 — a model-agnostic tool loop (ReAct style).
 *
 * Instead of relying on a model's native tool-calling format (which breaks for
 * some providers through proxies), we instruct the model to emit a single JSON
 * action per turn. The dashboard executes it against the active Workspace
 * project and feeds the result back, looping until the model says it's done.
 * This works with any model, including Owl Alpha.
 */

const TOOL_INSTRUCTIONS = `
You are operating as an autonomous agent with tools that act on the user's
workspace project. To take an action, reply with EXACTLY ONE JSON object and
nothing else (no prose, no markdown fences):

  {"tool":"write_file","args":{"path":"index.html","content":"<file contents>"}}
  {"tool":"read_file","args":{"path":"index.html"}}
  {"tool":"list_files","args":{}}
  {"tool":"run_command","args":{"command":"npm install && npm test"}}

When the task is fully complete, reply with:

  {"tool":"done","args":{"message":"a short summary for the user"}}

Rules:
- Output ONLY the JSON object. No explanations around it.
- Paths are relative to the project root; commands run in the project root.
- Use run_command to install deps, build, run, or test code, then read the output.
- Do one action per reply; you'll get the result before your next step.
- Prefer writing complete, working files in one write_file call.
`.trim();

interface Action {
  tool: string;
  args: Record<string, unknown>;
}

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
    if (action.tool === 'run_command') {
      const project = workspace.getProject(projectId);
      if (!project) return 'ERROR: no active project';
      const command = String(args.command ?? '').trim();
      if (!command) return 'ERROR: command required';
      try {
        const out = execSync(command, {
          cwd: project.path,
          timeout: 90000,
          maxBuffer: 8 * 1024 * 1024,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        const s = out || '(command finished, no output)';
        return s.length > 4000 ? s.slice(0, 4000) + '\n...[truncated]' : s;
      } catch (e) {
        const err = e as { status?: number; stdout?: string; stderr?: string; message?: string };
        const combined = `${err.stdout ?? ''}${err.stderr ?? ''}` || err.message || 'unknown error';
        return `EXIT ${err.status ?? '?'}: ${combined.toString().slice(0, 4000)}`;
      }
    }
    return `ERROR: unknown tool "${action.tool}"`;
  } catch (e) {
    return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }
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
  maxSteps = 6
): Promise<AgenticResult> {
  const steps: AgenticStep[] = [];
  const msgs: ChatTurn[] = history.map((h) => ({ ...h }));
  const system = (baseSystem ? baseSystem + '\n\n' : '') + TOOL_INSTRUCTIONS;
  let model = '';

  if (!projectId) {
    return {
      reply: 'No active workspace project. Create/select one (top-right) before using agent mode.',
      steps,
      model,
    };
  }

  for (let i = 0; i < maxSteps; i++) {
    const result = await fcc.runAgent(agentId, msgs, system);
    model = result.model;
    const action = parseAction(result.text);

    if (!action) {
      // Model answered in prose — treat as the final answer.
      return { reply: result.text, steps, model };
    }
    if (action.tool === 'done') {
      return { reply: String(action.args.message ?? 'Done.'), steps, model };
    }

    const observation = executeTool(projectId, action);
    steps.push({ tool: action.tool, args: action.args, result: observation });

    msgs.push({ role: 'assistant', content: JSON.stringify({ tool: action.tool, args: action.args }) });
    msgs.push({ role: 'user', content: `TOOL RESULT (${action.tool}):\n${observation}` });
  }

  return {
    reply: `Reached the ${maxSteps}-step limit. Any files I created are in your Workspace tab.`,
    steps,
    model,
  };
}
