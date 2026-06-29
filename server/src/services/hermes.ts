import { execFile } from 'child_process';
import { promisify } from 'util';
import { getSetting } from '../config.js';
import { resolveAgentModel } from './agents.js';
import type { ChatTurn } from './fcc.js';

const execFileP = promisify(execFile);

/**
 * Hermes Agent (Nous Research) backend.
 *
 * Hermes is a standalone open-source agent with its own runtime + session store.
 * We drive it non-interactively:
 *   hermes chat --query "<prompt>" --quiet --yolo [--provider <p>] [--model <m>]
 *
 * Shared memory: the dashboard folds the SAME Obsidian vault context that the
 * FCC agents receive into Hermes's prompt, so all agents read one memory.
 */

const HERMES_BIN = 'hermes';

/** Is the `hermes` CLI installed and on PATH? */
export async function isAvailable(): Promise<boolean> {
  try {
    await execFileP(HERMES_BIN, ['version'], { timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

/** Flatten shared memory + transcript into a single prompt for the one-shot CLI. */
function composePrompt(history: ChatTurn[], system?: string): string {
  const parts: string[] = [];
  if (system && system.trim()) {
    parts.push('=== Shared memory (Obsidian vault) ===', system.trim(), '');
  }
  if (history.length > 1) {
    parts.push('=== Conversation so far ===');
    for (const turn of history.slice(0, -1)) {
      parts.push(`${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`);
    }
    parts.push('');
  }
  const last = history[history.length - 1];
  parts.push('=== Current request ===', last ? last.content : '');
  return parts.join('\n');
}

export interface CliResult {
  text: string;
}

export async function run(history: ChatTurn[], system?: string): Promise<CliResult> {
  if (!(await isAvailable())) {
    throw new Error(
      'Hermes Agent is not installed. Install it with:  curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash   then run "hermes setup --portal".'
    );
  }

  const prompt = composePrompt(history, system);
  const args = ['chat', '--query', prompt, '--quiet', '--yolo'];

  const provider = getSetting('hermes_provider'); // e.g. "openrouter", "nous"
  if (provider) args.push('--provider', provider);
  const model = resolveAgentModel('hermes'); // empty unless user overrode
  if (model) args.push('--model', model);

  try {
    const { stdout } = await execFileP(HERMES_BIN, args, {
      timeout: 180000,
      maxBuffer: 16 * 1024 * 1024,
      env: process.env,
    });
    return { text: stdout.trim() };
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    const detail = (e.stderr || e.stdout || e.message || 'unknown error').toString().trim();
    throw new Error(`Hermes Agent: ${detail.slice(0, 500)}`);
  }
}
