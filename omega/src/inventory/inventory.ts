import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { OmegaConfig } from '../config.ts';
import { runControlled } from '../core/exec.ts';
import { isSecretPath, type RolePolicy } from '../core/policy.ts';
import { isolatedGitEnv } from '../core/vcs.ts';

/**
 * Phase-1 inventory: what agent tooling, disks and git repositories exist on the
 * machine OMEGA runs on. Strictly read-only: it runs `<tool> --version` and a few
 * read-only git queries, never reads .env/secret file contents (only notes that
 * such files exist), and strips credentials from remote URLs.
 */
export interface ToolInfo {
  id: string;
  label: string;
  found: boolean;
  path?: string;
  version?: string;
  role: string;
  integration: string;
  omegaStatus: 'integrated' | 'used' | 'planned' | 'not-used';
}

export interface RepoInfo {
  path: string;
  name: string;
  branch?: string;
  remote?: string;
  lastCommit?: string;
  dirtyFiles?: number;
  secretLikeFiles: string[];
}

export interface Inventory {
  collectedAt: string;
  system: { platform: string; release: string; arch: string; cpus: number; memoryGb: number; node: string };
  omega: { home: string; workspaceRoot: string; homeOnPreferredDrive: boolean | null };
  disks: { path: string; freeGb: number; totalGb: number }[];
  tools: ToolInfo[];
  repos: RepoInfo[];
  risks: string[];
  notes: string[];
}

interface ToolSpec {
  id: string;
  label: string;
  bins: string[];
  versionArgs: string[];
  role: string;
  integration: string;
  omegaStatus: ToolInfo['omegaStatus'];
}

export const TOOL_SPECS: ToolSpec[] = [
  {
    id: 'claude', label: 'Claude Code', bins: ['claude'], versionArgs: ['--version'], omegaStatus: 'integrated',
    role: 'LLM agent for product, test-author and coder roles',
    integration: 'Headless `claude -p`: --output-format json (reports total_cost_usd, permission_denials), --json-schema, --max-budget-usd, --max-turns, --permission-mode dontAsk, --tools / --allowedTools with path rules, --strict-mcp-config. Bills the Anthropic account/plan it is logged in with.',
  },
  {
    id: 'codex', label: 'OpenAI Codex CLI', bins: ['codex'], versionArgs: ['--version'], omegaStatus: 'planned',
    role: 'Alternative coder engine',
    integration: 'Documented non-interactive mode (`codex exec`) with sandbox and approval settings. No OMEGA adapter yet: the CLI was not installed where OMEGA was built, so its flags are unverified here.',
  },
  { id: 'git', label: 'Git', bins: ['git'], versionArgs: ['--version'], omegaStatus: 'used', role: 'Per-mission repositories and commit evidence', integration: 'Local only; OMEGA never adds remotes or pushes.' },
  { id: 'node', label: 'Node.js', bins: ['node'], versionArgs: ['--version'], omegaStatus: 'used', role: 'Runs OMEGA and the generated projects’ tests', integration: 'node --test (TAP) for independent verification.' },
  { id: 'npm', label: 'npm', bins: ['npm'], versionArgs: ['--version'], omegaStatus: 'not-used', role: 'Package manager', integration: 'OMEGA installs no packages for generated projects (zero-dependency policy).' },
  { id: 'gh', label: 'GitHub CLI', bins: ['gh'], versionArgs: ['--version'], omegaStatus: 'planned', role: 'Future: open PRs after approval', integration: 'Not used in v1 (no pushes, no PRs). Its token is never passed to agents.' },
  { id: 'docker', label: 'Docker', bins: ['docker'], versionArgs: ['--version'], omegaStatus: 'planned', role: 'Future: container sandbox for running generated code', integration: 'Not used in v1; tests run as a scrubbed-env child process.' },
  { id: 'ollama', label: 'Ollama', bins: ['ollama'], versionArgs: ['--version'], omegaStatus: 'planned', role: 'Future: free local-model engine', integration: 'HTTP API on 127.0.0.1:11434. No OMEGA adapter yet.' },
  { id: 'tailscale', label: 'Tailscale', bins: ['tailscale'], versionArgs: ['version'], omegaStatus: 'planned', role: 'Private phone → PC access', integration: '`tailscale serve` exposes a local port inside your tailnet only. Not configured by OMEGA.' },
  { id: 'python', label: 'Python', bins: ['python3', 'python'], versionArgs: ['--version'], omegaStatus: 'not-used', role: 'General tooling', integration: '—' },
];

function findOnPath(bin: string): string | undefined {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', '.ps1', ''] : [''];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = path.join(dir, bin + ext);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        /* not here */
      }
    }
  }
  return undefined;
}

function policyFor(cmd: string, args: string[]): RolePolicy {
  return { role: 'inventory', capabilities: ['exec', 'git'], writePaths: [], exec: [{ cmd, argsPrefix: args }], envPassthrough: [] };
}

async function toolInfo(spec: ToolSpec): Promise<ToolInfo> {
  const base = { id: spec.id, label: spec.label, role: spec.role, integration: spec.integration, omegaStatus: spec.omegaStatus };
  for (const bin of spec.bins) {
    const found = findOnPath(bin);
    if (!found) continue;
    if (/\.(cmd|bat|ps1)$/i.test(found)) return { ...base, found: true, path: found, version: 'unknown (script shim; not executed without a shell)' };
    try {
      const res = await runControlled({ policy: policyFor(found, spec.versionArgs), cwd: os.tmpdir(), cmd: found, args: spec.versionArgs, timeoutMs: 10_000 });
      const version = (res.stdout || res.stderr).trim().split('\n')[0]?.slice(0, 120);
      return { ...base, found: true, path: found, version };
    } catch (err) {
      return { ...base, found: true, path: found, version: `error: ${(err as Error).message}` };
    }
  }
  return { ...base, found: false };
}

export function stripCredentials(url: string): string {
  return url.replace(/^(\w+:\/\/)[^@/]+@/, '$1***@');
}

function readRemote(gitDir: string): string | undefined {
  try {
    const cfg = fs.readFileSync(path.join(gitDir, 'config'), 'utf8');
    const m = cfg.match(/\[remote "origin"\][^[]*?url\s*=\s*(.+)/);
    return m ? stripCredentials(m[1].trim()) : undefined;
  } catch {
    return undefined;
  }
}

function findRepos(root: string, depth: number, out: string[], max = 60): void {
  if (out.length >= max || depth < 0) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  if (entries.some((e) => e.name === '.git')) {
    out.push(root);
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules' || e.name === '$RECYCLE.BIN') continue;
    findRepos(path.join(root, e.name), depth - 1, out, max);
  }
}

async function repoInfo(dir: string): Promise<RepoInfo> {
  const gitDir = path.join(dir, '.git');
  const info: RepoInfo = { path: dir, name: path.basename(dir), secretLikeFiles: [] };
  try {
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    info.branch = head.startsWith('ref: refs/heads/') ? head.slice(16) : `detached ${head.slice(0, 10)}`;
  } catch {
    /* worktree or unusual layout */
  }
  info.remote = readRemote(gitDir);
  const isolated = { ...isolatedGitEnv(), GIT_OPTIONAL_LOCKS: '0' };
  try {
    const logArgs = ['-C', dir, 'log', '-1', '--format=%cI'];
    const res = await runControlled({ policy: policyFor('git', ['-C']), cwd: dir, cmd: 'git', args: logArgs, timeoutMs: 10_000, extraEnv: isolated });
    if (res.code === 0) info.lastCommit = res.stdout.trim();
    const st = await runControlled({ policy: policyFor('git', ['-C']), cwd: dir, cmd: 'git', args: ['-C', dir, 'status', '--porcelain'], timeoutMs: 15_000, extraEnv: isolated });
    if (st.code === 0) info.dirtyFiles = st.stdout.split('\n').filter(Boolean).length;
  } catch {
    /* git missing */
  }
  try {
    info.secretLikeFiles = fs.readdirSync(dir).filter((n) => isSecretPath(n)).slice(0, 10);
  } catch {
    /* unreadable */
  }
  return info;
}

function disk(p: string): { path: string; freeGb: number; totalGb: number } | undefined {
  try {
    const s = fs.statfsSync(p);
    const gb = (n: number) => Math.round((n * s.bsize) / 1e9 * 10) / 10;
    return { path: p, freeGb: gb(s.bavail), totalGb: gb(s.blocks) };
  } catch {
    return undefined;
  }
}

export async function collectInventory(cfg: OmegaConfig): Promise<Inventory> {
  const isWin = process.platform === 'win32';
  const diskPaths = isWin ? ['C:\\', 'D:\\', 'E:\\', 'F:\\'] : ['/', os.homedir(), cfg.home];
  const disks: Inventory['disks'] = [];
  for (const d of diskPaths.map((p) => disk(p))) {
    if (d && !disks.some((x) => x.totalGb === d.totalGb && x.freeGb === d.freeGb)) disks.push(d);
  }
  const tools = await Promise.all(TOOL_SPECS.map(toolInfo));
  const repoDirs: string[] = [];
  for (const root of cfg.projectRoots) findRepos(root, 3, repoDirs);
  const repos = await Promise.all(repoDirs.map(repoInfo));

  const risks: string[] = [];
  const notes: string[] = [];
  const claude = tools.find((t) => t.id === 'claude');
  if (!claude?.found) risks.push('Claude Code CLI not found on PATH: the claude-code engine cannot run (template engine still works).');
  if (claude?.version?.startsWith('unknown (script shim')) risks.push('Claude Code is installed as a .cmd shim (npm global). OMEGA spawns without a shell, so set OMEGA_CLAUDE_BIN to the native claude.exe (native installer).');
  if (!tools.find((t) => t.id === 'git')?.found) risks.push('git not found: OMEGA cannot create mission repositories.');
  const homeOnF = isWin ? /^f:/i.test(cfg.home) : null;
  if (isWin && !homeOnF && fs.existsSync('F:\\')) risks.push('F: exists but OMEGA_HOME is not on it; large projects will land on another drive.');
  if (isWin && !fs.existsSync('F:\\')) notes.push('No F: drive detected; OMEGA_HOME defaults to %LOCALAPPDATA%\\OMEGA.');
  for (const r of repos) {
    if (r.secretLikeFiles.length) risks.push(`${r.name}: secret-like files present (${r.secretLikeFiles.join(', ')}) — contents not read; OMEGA never copies them into prompts.`);
    if (r.remote?.includes('***@')) risks.push(`${r.name}: remote URL embeds credentials (redacted here). Prefer a credential manager.`);
  }
  if (cfg.projectRoots.length === 0) notes.push('Set OMEGA_PROJECT_ROOTS (e.g. F:\\dev;C:\\Users\\you\\source) to inventory existing repositories.');
  notes.push('OMEGA never modifies inventoried repositories; missions work in their own repos under the workspace root.');

  return {
    collectedAt: new Date().toISOString(),
    system: { platform: process.platform, release: os.release(), arch: process.arch, cpus: os.cpus().length, memoryGb: Math.round(os.totalmem() / 1e9), node: process.version },
    omega: { home: cfg.home, workspaceRoot: cfg.workspaceRoot, homeOnPreferredDrive: homeOnF },
    disks,
    tools,
    repos,
    risks,
    notes,
  };
}
