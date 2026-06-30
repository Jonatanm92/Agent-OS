import { execSync } from 'node:child_process';
import * as workspace from './workspace.js';

/**
 * Git panel — init/status/diff/commit/push from the OS.
 */

function run(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message?: string };
    throw new Error((err.stderr || err.stdout || err.message || 'git command failed').toString().slice(0, 500));
  }
}

export interface GitStatus {
  initialized: boolean;
  branch: string;
  files: { path: string; status: string }[];
  log: string[];
  remotes: string[];
}

export function status(projectId: string): GitStatus {
  const project = workspace.getProject(projectId);
  if (!project) throw new Error('project not found');
  try {
    run('git rev-parse --git-dir', project.path);
  } catch {
    return { initialized: false, branch: '', files: [], log: [], remotes: [] };
  }
  const branch = run('git branch --show-current', project.path) || 'HEAD';
  const statusRaw = run('git status --porcelain', project.path);
  const files = statusRaw
    .split('\n')
    .filter(Boolean)
    .map((l) => ({ status: l.slice(0, 2).trim(), path: l.slice(3) }));
  const logRaw = run('git log --oneline -10 2>/dev/null || echo "(no commits)"', project.path);
  const log = logRaw.split('\n').filter(Boolean);
  const remotesRaw = run('git remote -v 2>/dev/null || true', project.path);
  const remotes = [...new Set(remotesRaw.split('\n').map((l) => l.split('\t')[0]).filter(Boolean))];
  return { initialized: true, branch, files, log, remotes };
}

export function init(projectId: string): string {
  const project = workspace.getProject(projectId);
  if (!project) throw new Error('project not found');
  return run('git init', project.path);
}

export function diff(projectId: string): string {
  const project = workspace.getProject(projectId);
  if (!project) throw new Error('project not found');
  const staged = run('git diff --cached 2>/dev/null || true', project.path);
  const unstaged = run('git diff 2>/dev/null || true', project.path);
  return (staged + '\n' + unstaged).trim() || '(no changes)';
}

export function commit(projectId: string, message: string): string {
  const project = workspace.getProject(projectId);
  if (!project) throw new Error('project not found');
  run('git add -A', project.path);
  return run(`git commit -m "${message.replace(/"/g, '\\"')}"`, project.path);
}

export function push(projectId: string, remote = 'origin', branch?: string): string {
  const project = workspace.getProject(projectId);
  if (!project) throw new Error('project not found');
  const b = branch || run('git branch --show-current', project.path) || 'main';
  return run(`git push ${remote} ${b}`, project.path);
}
