import { runControlled } from '../core/exec.ts';
import type { RolePolicy } from '../core/policy.ts';

/**
 * Adapter for the Claude Code CLI in headless mode (`claude -p`).
 *
 * Uses only documented CLI flags. Each run is locked down:
 *  --permission-mode dontAsk   anything not pre-approved is denied (no prompts)
 *  --tools <list>              only the role's built-in tools exist at all
 *  --allowedTools Edit(src/**) writes pre-approved only inside the role's paths
 *  --strict-mcp-config         no MCP servers are loaded
 *  --setting-sources project   the user's ~/.claude settings (allow rules, hooks) are NOT
 *                              merged in, so they cannot widen an agent's rights; the
 *                              project dir is OMEGA-owned and agents cannot write .claude/
 *  --max-budget-usd / --max-turns  hard spend and length caps
 *  --no-session-persistence    nothing is saved for later resumption
 * The prompt is sent on stdin (no command-line length limits, nothing in `ps`).
 * Cost and permission denials come from the CLI's own JSON result.
 */
export interface ClaudeRunRequest {
  bin: string;
  /** Fixed leading args (e.g. path to cli.js when bin is node). Never shell-interpreted. */
  binArgs?: string[];
  policy: RolePolicy;
  cwd: string;
  prompt: string;
  systemAppend: string;
  model: string;
  maxBudgetUsd: number;
  maxTurns: number;
  timeoutMs: number;
  jsonSchema?: object;
}

export interface ClaudeRunResult {
  ok: boolean;
  subtype: string;
  text: string;
  structured?: unknown;
  costUsd: number;
  numTurns: number;
  permissionDenials: { tool_name?: string; tool_input?: unknown }[];
  sessionId?: string;
  durationMs: number;
  exitCode: number | null;
  timedOut: boolean;
  args: string[];
  stderr: string;
  model: string;
}

/** Project-relative write rules → Claude Code permission rules. */
export function writeRulesFor(policy: RolePolicy): string[] {
  const rules: string[] = [];
  for (const p of policy.writePaths) {
    rules.push(`Edit(${p})`, `Write(${p})`);
  }
  return rules;
}

export function buildClaudeArgs(req: Omit<ClaudeRunRequest, 'bin' | 'cwd' | 'prompt' | 'timeoutMs'>): string[] {
  const tools = req.policy.llmTools ?? [];
  const args = [
    '-p',
    '--output-format', 'json',
    '--model', req.model,
    '--permission-mode', 'dontAsk',
    '--tools', tools.join(','),
    '--strict-mcp-config',
    '--setting-sources', 'project',
    '--no-session-persistence',
    '--max-budget-usd', req.maxBudgetUsd.toFixed(2),
    '--max-turns', String(req.maxTurns),
    '--append-system-prompt', req.systemAppend,
  ];
  const allowed = writeRulesFor(req.policy);
  if (tools.length > 0 && allowed.length > 0) args.push('--allowedTools', ...allowed);
  if (req.jsonSchema) args.push('--json-schema', JSON.stringify(req.jsonSchema));
  return args;
}

export function parseClaudeOutput(stdout: string): Partial<ClaudeRunResult> & { parsed: boolean } {
  const trimmed = stdout.trim();
  const start = trimmed.lastIndexOf('\n{') >= 0 ? trimmed.lastIndexOf('\n{') + 1 : trimmed.indexOf('{');
  if (start < 0) return { parsed: false };
  try {
    const d = JSON.parse(trimmed.slice(start)) as Record<string, unknown>;
    return {
      parsed: true,
      subtype: String(d.subtype ?? 'unknown'),
      ok: d.is_error === false && d.subtype === 'success',
      text: typeof d.result === 'string' ? d.result : '',
      structured: d.structured_output,
      costUsd: typeof d.total_cost_usd === 'number' ? d.total_cost_usd : 0,
      numTurns: typeof d.num_turns === 'number' ? d.num_turns : 0,
      permissionDenials: Array.isArray(d.permission_denials) ? (d.permission_denials as ClaudeRunResult['permissionDenials']) : [],
      sessionId: typeof d.session_id === 'string' ? d.session_id : undefined,
    };
  } catch {
    return { parsed: false };
  }
}

export async function runClaude(req: ClaudeRunRequest): Promise<ClaudeRunResult> {
  const args = buildClaudeArgs(req);
  const prefix = req.binArgs ?? [];
  const policy: RolePolicy = { ...req.policy, capabilities: [...req.policy.capabilities, 'exec'], exec: [{ cmd: req.bin, argsPrefix: [...prefix, '-p'] }] };
  const res = await runControlled({ policy, cwd: req.cwd, cmd: req.bin, args: [...prefix, ...args], stdin: req.prompt, timeoutMs: req.timeoutMs });
  const parsed = parseClaudeOutput(res.stdout);
  return {
    ok: Boolean(parsed.parsed && parsed.ok && res.code === 0 && !res.timedOut),
    subtype: parsed.parsed ? (parsed.subtype ?? 'unknown') : res.timedOut ? 'timeout' : 'unparseable_output',
    text: parsed.text ?? '',
    structured: parsed.structured,
    costUsd: parsed.costUsd ?? 0,
    numTurns: parsed.numTurns ?? 0,
    permissionDenials: parsed.permissionDenials ?? [],
    sessionId: parsed.sessionId,
    durationMs: res.durationMs,
    exitCode: res.code,
    timedOut: res.timedOut,
    // The system prompt and JSON schema are recorded in the transcript separately.
    args,
    stderr: res.stderr.slice(-4000),
    model: req.model,
  };
}
