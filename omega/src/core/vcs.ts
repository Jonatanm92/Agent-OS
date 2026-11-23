import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runControlled, type ExecResult } from './exec.ts';
import { resolveInside, type RolePolicy } from './policy.ts';

/**
 * Version control for mission projects. Every mission project is its own git repo and
 * every stage is committed by OMEGA (never by the agent) under the role's identity, so
 * `git log` is a verifiable record of who changed what.
 *
 * Git runs isolated from the user's global/system config (no hooks, signing or
 * credential helpers leak in) and has no remotes — nothing is ever pushed.
 */
const VCS_POLICY: RolePolicy = {
  role: 'omega-vcs',
  capabilities: ['git'],
  writePaths: [],
  exec: [{ cmd: 'git' }],
  envPassthrough: [],
};

/**
 * Env that isolates git from the user's global/system config. GIT_CONFIG_GLOBAL points
 * at an empty file we own: Git for Windows rejects the Windows null device (\\.\nul).
 */
export function isolatedGitEnv(): Record<string, string> {
  const empty = path.join(os.tmpdir(), 'omega-empty.gitconfig');
  if (!fs.existsSync(empty)) fs.writeFileSync(empty, '');
  return { GIT_CONFIG_GLOBAL: empty, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
}

async function git(cwd: string, args: string[]): Promise<ExecResult> {
  const res = await runControlled({
    policy: VCS_POLICY,
    cwd,
    cmd: 'git',
    args: ['-c', 'core.hooksPath=.git/omega-no-hooks', '-c', 'commit.gpgsign=false', ...args],
    timeoutMs: 30_000,
    extraEnv: isolatedGitEnv(),
  });
  if (res.code !== 0) throw new Error(`git ${args.join(' ')} failed (${res.code}): ${res.stderr.trim()}`);
  return res;
}

export async function initRepo(dir: string): Promise<void> {
  fs.mkdirSync(dir, { recursive: true });
  await git(dir, ['init', '-q', '-b', 'main']);
}

export interface StatusEntry {
  code: string;
  path: string;
}

export async function status(dir: string): Promise<StatusEntry[]> {
  const res = await git(dir, ['status', '--porcelain=v1', '-z', '-uall']);
  const parts = res.stdout.split('\0').filter(Boolean);
  const out: StatusEntry[] = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    const code = entry.slice(0, 2);
    out.push({ code, path: entry.slice(3) });
    if (code.startsWith('R') || code.startsWith('C')) i++; // skip rename source
  }
  return out;
}

export async function commitAll(dir: string, author: string, message: string): Promise<{ sha: string; files: string[] } | null> {
  const changes = await status(dir);
  if (changes.length === 0) return null;
  await git(dir, ['add', '-A']);
  await git(dir, ['-c', `user.name=OMEGA ${author}`, '-c', `user.email=${author}@omega.local`, 'commit', '-q', '-m', message]);
  const sha = (await git(dir, ['rev-parse', 'HEAD'])).stdout.trim();
  return { sha, files: changes.map((c) => c.path) };
}

/**
 * Undo specific uncommitted changes (used when an agent wrote outside its scope).
 * Only files inside the mission's own project repo are touched (resolveInside).
 */
export async function restorePaths(dir: string, entries: StatusEntry[]): Promise<void> {
  for (const e of entries) {
    if (e.code === '??') {
      fs.unlinkSync(resolveInside(dir, e.path));
    } else {
      await git(dir, ['checkout', 'HEAD', '--', e.path]);
    }
  }
}

export interface CommitInfo {
  sha: string;
  author: string;
  date: string;
  subject: string;
}

export async function log(dir: string): Promise<CommitInfo[]> {
  if (!fs.existsSync(dir)) return [];
  const res = await git(dir, ['log', '--format=%H%x09%an%x09%cI%x09%s']).catch(() => null);
  if (!res) return [];
  return res.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, author, date, ...subject] = line.split('\t');
      return { sha, author, date, subject: subject.join('\t') };
    });
}

export async function commitExists(dir: string, sha: string): Promise<boolean> {
  if (!/^[0-9a-f]{7,40}$/.test(sha)) return false;
  const res = await git(dir, ['cat-file', '-t', sha]).catch(() => null);
  return res?.stdout.trim() === 'commit';
}
