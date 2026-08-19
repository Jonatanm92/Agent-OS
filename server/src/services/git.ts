import { spawnSync } from 'node:child_process';
import * as workspace from './workspace.js';

/**
 * Read-only Git inspection for workspace projects.
 *
 * Agent-produced repositories are untrusted input. Git mutation can execute
 * repository-controlled hooks, filters, external diff drivers, or credentialed
 * network operations, so init/commit/push are blocked until they run in a
 * dedicated isolated worktree service with an owner approval token.
 */

function runGit(args: string[], cwd: string, allowFailure = false): string {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      PATH: process.env.PATH ?? '',
      SystemRoot: process.env.SystemRoot ?? '',
      WINDIR: process.env.WINDIR ?? '',
      HOME: process.env.HOME ?? '',
      USERPROFILE: process.env.USERPROFILE ?? '',
      GIT_PAGER: 'cat',
      GIT_TERMINAL_PROMPT: '0',
      GIT_OPTIONAL_LOCKS: '0',
    },
  });

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (result.error) {
    if (allowFailure) return '';
    throw new Error(result.error.message.slice(0, 500));
  }
  if (result.status !== 0) {
    if (allowFailure) return '';
    throw new Error((output || `git exited with ${result.status}`).slice(0, 500));
  }
  return output;
}

function projectPath(projectId: string): string {
  const project = workspace.getProject(projectId);
  if (!project) throw new Error('project not found');
  return project.path;
}

export interface GitStatus {
  initialized: boolean;
  branch: string;
  files: { path: string; status: string }[];
  log: string[];
  remotes: string[];
  mutationsEnabled: false;
}

export function status(projectId: string): GitStatus {
  const cwd = projectPath(projectId);
  if (!runGit(['rev-parse', '--git-dir'], cwd, true)) {
    return {
      initialized: false,
      branch: '',
      files: [],
      log: [],
      remotes: [],
      mutationsEnabled: false,
    };
  }

  const branch = runGit(['branch', '--show-current'], cwd, true) || 'HEAD';
  const statusRaw = runGit(['status', '--porcelain=v1', '--untracked-files=normal'], cwd, true);
  const files = statusRaw
    .split('\n')
    .filter(Boolean)
    .slice(0, 500)
    .map((line) => ({ status: line.slice(0, 2).trim(), path: line.slice(3) }));
  const logRaw = runGit(['log', '--oneline', '--max-count=10', '--no-decorate'], cwd, true);
  const log = logRaw.split('\n').filter(Boolean);
  const remotesRaw = runGit(['remote'], cwd, true);
  const remotes = remotesRaw.split('\n').filter(Boolean);
  return { initialized: true, branch, files, log, remotes, mutationsEnabled: false };
}

export function diff(projectId: string): string {
  const cwd = projectPath(projectId);
  if (!runGit(['rev-parse', '--git-dir'], cwd, true)) return '(not a git repository)';
  const staged = runGit(
    ['-c', 'diff.external=', 'diff', '--cached', '--no-ext-diff', '--no-textconv'],
    cwd,
    true
  );
  const unstaged = runGit(
    ['-c', 'diff.external=', 'diff', '--no-ext-diff', '--no-textconv'],
    cwd,
    true
  );
  return `${staged}\n${unstaged}`.trim().slice(0, 2 * 1024 * 1024) || '(no changes)';
}

function mutationBlocked(): never {
  throw new Error(
    'Git mutation is owner-gated and disabled for untrusted workspaces. ' +
      'Review files/diff and promote through the repository PR workflow instead.'
  );
}

export function init(_projectId: string): never {
  return mutationBlocked();
}

export function commit(_projectId: string, _message: string): never {
  return mutationBlocked();
}

export function push(_projectId: string, _remote = 'origin', _branch?: string): never {
  return mutationBlocked();
}
