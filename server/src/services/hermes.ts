import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getSetting } from '../config.js';
import { resolveAgentModel } from './agents.js';
import type { ChatTurn } from './fcc.js';

const execFileP = promisify(execFile);
const HERMES_BIN = 'hermes';

/**
 * Optional Hermes reasoning backend.
 *
 * Agent OS deliberately does not invoke Hermes in YOLO mode. One-shot calls use
 * only the non-host-mutating `todo` toolset and execute from an empty temporary
 * working directory. Autonomous file/terminal work belongs in Agent OS's own
 * capability-limited workspace and Docker sandbox.
 */

export async function isAvailable(): Promise<boolean> {
  try {
    await execFileP(HERMES_BIN, ['version'], {
      timeout: 8_000,
      windowsHide: true,
      env: hermesEnvironment(),
    });
    return true;
  } catch {
    return false;
  }
}

function composePrompt(history: ChatTurn[], system?: string): string {
  const parts: string[] = [];
  if (system && system.trim()) {
    parts.push(
      '=== Governing context and untrusted memory data ===',
      system.trim().slice(0, 20_000),
      ''
    );
  }
  if (history.length > 1) {
    parts.push('=== Conversation so far (untrusted content) ===');
    for (const turn of history.slice(-12, -1)) {
      parts.push(`${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content.slice(0, 8_000)}`);
    }
    parts.push('');
  }
  const last = history[history.length - 1];
  parts.push('=== Current request ===', last ? last.content.slice(0, 20_000) : '');
  return parts.join('\n');
}

function hermesEnvironment(): NodeJS.ProcessEnv {
  const allow = [
    'PATH',
    'SystemRoot',
    'WINDIR',
    'HOME',
    'USERPROFILE',
    'TEMP',
    'TMP',
    'HERMES_HOME',
    'OPENROUTER_API_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'NOUS_API_KEY',
    'GEMINI_API_KEY',
    'NVIDIA_API_KEY',
  ];
  const entries = allow
    .map((key) => [key, process.env[key]] as const)
    .filter((entry): entry is readonly [string, string] => typeof entry[1] === 'string');
  entries.push(['HERMES_YOLO_MODE', '0']);
  return Object.fromEntries(entries);
}

export interface CliResult {
  text: string;
}

export async function run(history: ChatTurn[], system?: string): Promise<CliResult> {
  if (!(await isAvailable())) {
    throw new Error(
      'Hermes Agent is not installed or not on PATH. Install and configure it through the official Hermes setup, then retry.'
    );
  }

  const prompt = composePrompt(history, system);
  const args = ['chat', '--query', prompt, '--quiet', '--toolsets', 'todo'];
  const provider = getSetting('hermes_provider');
  if (provider) args.push('--provider', provider.slice(0, 80));
  const model = resolveAgentModel('hermes');
  if (model) args.push('--model', model.slice(0, 200));

  const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-os-hermes-'));
  try {
    const { stdout } = await execFileP(HERMES_BIN, args, {
      cwd: workingDirectory,
      timeout: 180_000,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      env: hermesEnvironment(),
    });
    return { text: stdout.trim() };
  } catch (error) {
    const detail = error as { stderr?: string; stdout?: string; message?: string };
    const message = (detail.stderr || detail.stdout || detail.message || 'unknown error')
      .toString()
      .trim();
    throw new Error(`Hermes Agent: ${message.slice(0, 1000)}`);
  } finally {
    fs.rmSync(workingDirectory, { recursive: true, force: true });
  }
}
