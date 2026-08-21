import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveConfig } from '../config.js';
import * as workspace from './workspace.js';

/**
 * Owner-only Run & Preview.
 *
 * Host execution is disabled by default. It can be enabled only with
 * AGENT_OS_ENABLE_HOST_RUNNER=true and an Agent OS password. Even then, the API
 * may start only the exact repository-derived suggestion; arbitrary commands
 * from requests or models are rejected. Agent automation uses sandbox.ts instead.
 */
interface RunState {
  child: ChildProcess;
  command: string;
  startedAt: string;
  logs: string[];
}

const running = new Map<string, RunState>();
const MAX_LOG_LINES = 500;

function pushLog(state: RunState, chunk: string): void {
  for (const line of chunk.split(/\r?\n/)) {
    if (line.length) state.logs.push(line.slice(0, 2000));
  }
  while (state.logs.length > MAX_LOG_LINES) state.logs.shift();
}

/** Suggest one fixed run command by inspecting package script names only. */
export function suggest(projectId: string): string {
  const project = workspace.getProject(projectId);
  if (!project) return '';
  try {
    const pkgPath = path.join(project.path, 'package.json');
    if (!fs.existsSync(pkgPath)) return '';
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const scripts = pkg.scripts ?? {};
    if (scripts.dev) return 'npm run dev';
    if (scripts.start) return 'npm start';
    if (scripts.serve) return 'npm run serve';
  } catch {
    /* malformed or unavailable package file */
  }
  return '';
}

function restrictedEnvironment(): NodeJS.ProcessEnv {
  const allowed = [
    'PATH',
    'SystemRoot',
    'WINDIR',
    'HOME',
    'USERPROFILE',
    'TEMP',
    'TMP',
    'ComSpec',
    'PATHEXT',
  ];
  return Object.fromEntries(
    allowed
      .map((key) => [key, process.env[key]])
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
}

export interface RunStatus {
  running: boolean;
  command?: string;
  pid?: number;
  startedAt?: string;
  suggested: string;
  enabled: boolean;
}

export function status(projectId: string): RunStatus {
  const s = running.get(projectId);
  const suggested = suggest(projectId);
  const enabled = resolveConfig().enableHostRunner;
  if (!s) return { running: false, suggested, enabled };
  return {
    running: s.child.exitCode === null && !s.child.killed,
    command: s.command,
    pid: s.child.pid,
    startedAt: s.startedAt,
    suggested,
    enabled,
  };
}

export function logs(projectId: string): string[] {
  return running.get(projectId)?.logs ?? [];
}

export function stop(projectId: string): void {
  const s = running.get(projectId);
  if (s) {
    try {
      if (process.platform !== 'win32' && s.child.pid) {
        try {
          process.kill(-s.child.pid, 'SIGTERM');
        } catch {
          s.child.kill('SIGTERM');
        }
      } else {
        s.child.kill();
      }
    } catch {
      /* already gone */
    }
    running.delete(projectId);
  }
}

export function start(projectId: string, requestedCommand: string): RunStatus {
  const config = resolveConfig();
  if (!config.enableHostRunner) {
    throw new Error(
      'Host runner is disabled. Use sandbox verification, or explicitly set ' +
        'AGENT_OS_ENABLE_HOST_RUNNER=true after reviewing the project.'
    );
  }
  if (!config.password) {
    throw new Error('Host runner requires AGENT_OS_PASSWORD.');
  }

  const project = workspace.getProject(projectId);
  if (!project) throw new Error('project not found');
  const command = suggest(projectId);
  if (!command) throw new Error('no approved run script is available');
  if (requestedCommand.trim() !== command) {
    throw new Error('arbitrary commands are blocked; use the exact suggested command');
  }
  stop(projectId);

  const child = spawn(command, {
    cwd: project.path,
    shell: true,
    env: restrictedEnvironment(),
    detached: process.platform !== 'win32',
  });
  const state: RunState = { child, command, startedAt: new Date().toISOString(), logs: [] };
  pushLog(state, `$ ${command}`);
  child.stdout?.on('data', (data: Buffer) => pushLog(state, data.toString()));
  child.stderr?.on('data', (data: Buffer) => pushLog(state, data.toString()));
  child.on('exit', (code) => pushLog(state, `[process exited with code ${code ?? '?'}]`));
  child.on('error', (error) => pushLog(state, `[failed to start: ${error.message}]`));
  running.set(projectId, state);
  return status(projectId);
}
