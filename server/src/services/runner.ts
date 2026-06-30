import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as workspace from './workspace.js';

/**
 * Run & Preview — a per-project background process (a dev server, build watcher,
 * test runner, etc.). Lets you actually run the software you build in the OS.
 * Logs are kept in a capped ring buffer; the app itself binds its own port on
 * the host machine, which the dashboard previews/opens.
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
    if (line.length) state.logs.push(line);
  }
  while (state.logs.length > MAX_LOG_LINES) state.logs.shift();
}

/** Suggest a run command by inspecting the project. */
export function suggest(projectId: string): string {
  const project = workspace.getProject(projectId);
  if (!project) return '';
  try {
    const pkgPath = path.join(project.path, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
      const scripts = pkg.scripts ?? {};
      if (scripts.dev) return 'npm run dev';
      if (scripts.start) return 'npm start';
      if (scripts.serve) return 'npm run serve';
    }
    if (fs.existsSync(path.join(project.path, 'index.html'))) return 'npx --yes serve -l 5173 .';
  } catch {
    /* ignore */
  }
  return '';
}

export interface RunStatus {
  running: boolean;
  command?: string;
  pid?: number;
  startedAt?: string;
  suggested: string;
}

export function status(projectId: string): RunStatus {
  const s = running.get(projectId);
  const suggested = suggest(projectId);
  if (!s) return { running: false, suggested };
  return {
    running: s.child.exitCode === null && !s.child.killed,
    command: s.command,
    pid: s.child.pid,
    startedAt: s.startedAt,
    suggested,
  };
}

export function logs(projectId: string): string[] {
  return running.get(projectId)?.logs ?? [];
}

export function stop(projectId: string): void {
  const s = running.get(projectId);
  if (s) {
    try {
      // Negative pid kills the process group on POSIX; fall back to plain kill.
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

export function start(projectId: string, command: string): RunStatus {
  const project = workspace.getProject(projectId);
  if (!project) throw new Error('project not found');
  if (!command.trim()) throw new Error('command required');
  stop(projectId);

  const child = spawn(command, {
    cwd: project.path,
    shell: true,
    env: process.env,
    detached: process.platform !== 'win32', // own process group so we can stop the tree
  });
  const state: RunState = { child, command, startedAt: new Date().toISOString(), logs: [] };
  pushLog(state, `$ ${command}`);
  child.stdout?.on('data', (d: Buffer) => pushLog(state, d.toString()));
  child.stderr?.on('data', (d: Buffer) => pushLog(state, d.toString()));
  child.on('exit', (code) => pushLog(state, `[process exited with code ${code ?? '?'}]`));
  child.on('error', (e) => pushLog(state, `[failed to start: ${e.message}]`));
  running.set(projectId, state);
  return status(projectId);
}
