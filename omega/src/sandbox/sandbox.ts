import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runControlled, type ExecResult } from '../core/exec.ts';
import type { RolePolicy } from '../core/policy.ts';

/**
 * Isolated execution of generated code.
 *
 * Every run gets a fresh copy of the project ("run workspace") under
 * OMEGA_HOME/runs/<runId>/work. The mission repo itself is never exposed to generated
 * code, so a run can be cancelled or crash at any point and the project is unchanged.
 *
 * Drivers (chosen by OMEGA_SANDBOX=auto|bwrap|docker|none):
 *  bwrap  — Linux. bubblewrap namespaces (no network, private /tmp, read-only /usr, only
 *           the run workspace writable, uid 65534, all caps dropped, empty env) + rlimits
 *           (CPU time, file size, open files) + cgroups (memory, pids) when writable.
 *  docker — Linux/macOS/Windows (Docker Desktop). --network none, read-only root fs,
 *           --memory/--cpus/--pids-limit, CPU-time and file-size ulimits, cap-drop ALL,
 *           no-new-privileges, uid 65534. The image must already be present (no pulls).
 *  none   — no isolation. Only used when OMEGA_ALLOW_UNSANDBOXED=1, and every run says so.
 *
 * Each result carries an `enforcement` record describing what was ACTUALLY applied in
 * that run (e.g. "pids: not enforced (root, no writable cgroup)"), never what was hoped.
 */
export type SandboxDriverId = 'bwrap' | 'docker' | 'none';
export type SandboxMode = 'auto' | SandboxDriverId;

export interface SandboxLimits {
  cpuSeconds: number;
  memoryMb: number;
  wallMs: number;
  pids: number;
  fileSizeMb: number;
  tmpMb: number;
}

export const DEFAULT_LIMITS: SandboxLimits = { cpuSeconds: 60, memoryMb: 1024, wallMs: 180_000, pids: 64, fileSizeMb: 32, tmpMb: 64 };

export interface Enforcement {
  driver: SandboxDriverId;
  filesystem: string;
  network: string;
  env: string;
  user: string;
  cpu: string;
  memory: string;
  pids: string;
  fileSize: string;
  wall: string;
}

export interface SandboxRunRequest {
  runId: string;
  workspace: string;
  /** Command run inside the sandbox. Only `node` is supported in v0.2. */
  args: string[];
  limits?: Partial<SandboxLimits>;
  signal?: AbortSignal;
}

export interface SandboxResult extends ExecResult {
  enforcement: Enforcement;
  killedBy: 'wall' | 'abort' | 'cpu-or-memory' | null;
}

export interface Sandbox {
  id: SandboxDriverId;
  describe(): string;
  run(req: SandboxRunRequest): Promise<SandboxResult>;
}

export class SandboxUnavailableError extends Error {}

const INSIDE_PATH = '/opt/node/bin:/usr/local/bin:/usr/bin:/bin';
const LAUNCHER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'launcher.mjs');

// ── run workspaces ──────────────────────────────────────────────────────────

const COPY_SKIP = new Set(['.git', 'node_modules']);
const MAX_WORKSPACE_BYTES = 64 * 1024 * 1024;

export interface Workspace {
  runId: string;
  dir: string;
  root: string;
  copiedFiles: number;
  skippedSymlinks: string[];
}

/**
 * Copy a project into a fresh run workspace. Symlinks are NOT copied (a link to a host
 * path would otherwise be a way out of the sandbox on drivers that share the host fs);
 * they are reported instead. Only regular files and directories are copied.
 */
export function createWorkspace(home: string, runId: string, sourceDir: string): Workspace {
  if (!/^[\w-]+$/.test(runId)) throw new Error('invalid run id');
  const root = path.join(home, 'runs', runId);
  const dir = path.join(root, 'work');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const skippedSymlinks: string[] = [];
  let bytes = 0;
  let copiedFiles = 0;
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(sourceDir, rel), { withFileTypes: true })) {
      if (COPY_SKIP.has(entry.name)) continue;
      const r = rel ? path.join(rel, entry.name) : entry.name;
      if (entry.isSymbolicLink()) {
        skippedSymlinks.push(r.split(path.sep).join('/'));
      } else if (entry.isDirectory()) {
        fs.mkdirSync(path.join(dir, r));
        walk(r);
      } else if (entry.isFile()) {
        bytes += fs.statSync(path.join(sourceDir, r)).size;
        if (bytes > MAX_WORKSPACE_BYTES) throw new Error(`project exceeds ${MAX_WORKSPACE_BYTES / 1024 / 1024} MB; refusing to copy`);
        fs.copyFileSync(path.join(sourceDir, r), path.join(dir, r));
        copiedFiles++;
      }
      // sockets, FIFOs, devices: ignored
    }
  };
  walk('');
  return { runId, dir, root, copiedFiles, skippedSymlinks };
}

export function disposeWorkspace(home: string, ws: Workspace): void {
  const runs = path.join(home, 'runs') + path.sep;
  if (!path.resolve(ws.root).startsWith(runs)) throw new Error(`refusing to remove ${ws.root}: not inside ${runs}`);
  fs.rmSync(ws.root, { recursive: true, force: true });
}

/** Remove run workspaces left behind by a crash. Returns how many were removed. */
export function sweepWorkspaces(home: string): number {
  const runs = path.join(home, 'runs');
  if (!fs.existsSync(runs)) return 0;
  let n = 0;
  for (const name of fs.readdirSync(runs)) {
    if (!/^[\w-]+$/.test(name)) continue;
    fs.rmSync(path.join(runs, name), { recursive: true, force: true });
    n++;
  }
  return n;
}

function chownTree(dir: string, uid: number, gid: number): void {
  fs.chownSync(dir, uid, gid);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) chownTree(p, uid, gid);
    else fs.chownSync(p, uid, gid);
  }
}

// ── cgroups ─────────────────────────────────────────────────────────────────

interface CgroupHandle {
  version: 1 | 2;
  dirs: string[];
  procsFiles: string[];
  memory: string;
  pids: string;
  destroy(): void;
}

const V1_ROOT = '/sys/fs/cgroup';

function writable(dir: string): boolean {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function killProcs(procsFile: string): void {
  try {
    for (const pid of fs.readFileSync(procsFile, 'utf8').split('\n').filter(Boolean)) {
      try {
        process.kill(Number(pid), 'SIGKILL');
      } catch {
        /* gone */
      }
    }
  } catch {
    /* cgroup gone */
  }
}

function removeCgroupDir(dir: string): void {
  for (let i = 0; i < 20; i++) {
    try {
      fs.rmdirSync(dir);
      return;
    } catch {
      killProcs(path.join(dir, 'cgroup.procs'));
      spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},50)']);
    }
  }
}

/** Create a per-run cgroup (v1 pids+memory, or v2 unified) if this process may. */
export function createCgroup(runId: string, limits: SandboxLimits): CgroupHandle | null {
  if (process.platform !== 'linux') return null;
  const name = `omega-run-${runId}`;
  const memBytes = String(limits.memoryMb * 1024 * 1024);
  try {
    if (fs.existsSync(path.join(V1_ROOT, 'pids')) && fs.existsSync(path.join(V1_ROOT, 'memory')) && writable(path.join(V1_ROOT, 'pids')) && writable(path.join(V1_ROOT, 'memory'))) {
      const pidsDir = path.join(V1_ROOT, 'pids', name);
      const memDir = path.join(V1_ROOT, 'memory', name);
      fs.mkdirSync(pidsDir);
      fs.mkdirSync(memDir);
      fs.writeFileSync(path.join(pidsDir, 'pids.max'), String(limits.pids));
      fs.writeFileSync(path.join(memDir, 'memory.limit_in_bytes'), memBytes);
      try {
        fs.writeFileSync(path.join(memDir, 'memory.memsw.limit_in_bytes'), memBytes); // no swap escape, if accounting is on
      } catch {
        /* swap accounting disabled */
      }
      const dirs = [pidsDir, memDir];
      return {
        version: 1,
        dirs,
        procsFiles: dirs.map((d) => path.join(d, 'cgroup.procs')),
        memory: `cgroup v1 memory.limit_in_bytes=${limits.memoryMb}MB`,
        pids: `cgroup v1 pids.max=${limits.pids}`,
        destroy: () => dirs.forEach(removeCgroupDir),
      };
    }
    // cgroup v2: needs a delegated, writable subtree (e.g. OMEGA_CGROUP_PARENT).
    const parent = process.env.OMEGA_CGROUP_PARENT;
    if (parent && fs.existsSync(path.join(parent, 'cgroup.controllers')) && writable(parent)) {
      const dir = path.join(parent, name);
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'pids.max'), String(limits.pids));
      fs.writeFileSync(path.join(dir, 'memory.max'), memBytes);
      try {
        fs.writeFileSync(path.join(dir, 'memory.swap.max'), '0');
      } catch {
        /* no swap controller */
      }
      return {
        version: 2,
        dirs: [dir],
        procsFiles: [path.join(dir, 'cgroup.procs')],
        memory: `cgroup v2 memory.max=${limits.memoryMb}MB`,
        pids: `cgroup v2 pids.max=${limits.pids}`,
        destroy: () => removeCgroupDir(dir),
      };
    }
  } catch {
    return null;
  }
  return null;
}

/** Remove cgroups left behind by a crash. */
export function sweepCgroups(): number {
  if (process.platform !== 'linux') return 0;
  let n = 0;
  for (const ctl of ['pids', 'memory']) {
    const base = path.join(V1_ROOT, ctl);
    if (!fs.existsSync(base) || !writable(base)) continue;
    for (const name of fs.readdirSync(base)) {
      if (name.startsWith('omega-run-')) {
        removeCgroupDir(path.join(base, name));
        n++;
      }
    }
  }
  return n;
}

// ── drivers ─────────────────────────────────────────────────────────────────

const SANDBOX_POLICY = (cmd: string): RolePolicy => ({ role: 'sandbox', capabilities: ['exec'], writePaths: [], exec: [{ cmd }], envPassthrough: [] });
const isRoot = () => typeof process.getuid === 'function' && process.getuid() === 0;

function nodeMount(): { mountArgs: string[]; insideNode: string } {
  const real = fs.realpathSync(process.execPath);
  if (real.startsWith('/usr/')) return { mountArgs: [], insideNode: real };
  const prefix = path.dirname(path.dirname(real)); // …/bin/node → install prefix
  return { mountArgs: ['--ro-bind', prefix, '/opt/node'], insideNode: path.posix.join('/opt/node', path.relative(prefix, real).split(path.sep).join('/')) };
}

function systemMounts(): string[] {
  const args = ['--ro-bind', '/usr', '/usr'];
  for (const p of ['/lib', '/lib64', '/lib32', '/bin', '/sbin']) {
    let st: fs.Stats;
    try {
      st = fs.lstatSync(p);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) args.push('--symlink', fs.readlinkSync(p), p);
    else if (st.isDirectory()) args.push('--ro-bind', p, p);
  }
  return args;
}

export function bwrapArgs(ws: string, limits: SandboxLimits, inner: string[]): { args: string[]; insideNode: string } {
  const { mountArgs, insideNode } = nodeMount();
  const heapMb = Math.max(64, Math.floor(limits.memoryMb * 0.75));
  const args = [
    '--unshare-all', // user, ipc, pid, net, uts, cgroup namespaces
    '--die-with-parent',
    '--new-session',
    '--clearenv',
    '--setenv', 'PATH', INSIDE_PATH,
    '--setenv', 'HOME', '/tmp',
    '--setenv', 'TMPDIR', '/tmp',
    '--setenv', 'NODE_OPTIONS', `--max-old-space-size=${heapMb}`,
    ...systemMounts(),
    ...mountArgs,
    '--bind', ws, '/work',
    '--size', String(limits.tmpMb * 1024 * 1024), '--tmpfs', '/tmp',
    '--proc', '/proc',
    '--dev', '/dev',
    '--chdir', '/work',
    // bwrap's own root is a private tmpfs; make it read-only so /work and /tmp are the only writable places.
    '--remount-ro', '/',
    '--cap-drop', 'ALL',
    '--uid', '65534',
    '--gid', '65534',
    '--',
    insideNode,
    ...inner,
  ];
  return { args, insideNode };
}

export class BwrapSandbox implements Sandbox {
  readonly id = 'bwrap' as const;
  readonly bin: string;
  constructor(bin = 'bwrap') {
    this.bin = bin;
  }
  describe() {
    return 'bubblewrap: namespaces (no network), read-only system, only the run workspace writable, uid 65534, rlimits + cgroups when available';
  }
  async run(req: SandboxRunRequest): Promise<SandboxResult> {
    const limits = { ...DEFAULT_LIMITS, ...req.limits };
    const cg = createCgroup(req.runId, limits);
    const { args } = bwrapArgs(req.workspace, limits, req.args);
    const rlimits = [`--cpu=${limits.cpuSeconds}`, `--fsize=${limits.fileSizeMb * 1024 * 1024}`, '--nofile=512', '--core=0'];
    // Without a memory cgroup, cap virtual memory instead (Node needs ~1 GB of address space to boot).
    if (!cg) rlimits.push(`--as=${Math.max(limits.memoryMb, 1024) * 1024 * 1024}`);
    const outer = ['prlimit', ...rlimits, '--', this.bin, ...args];
    const cmd = cg ? process.execPath : 'prlimit';
    const cmdArgs = cg ? [LAUNCHER, cg.procsFiles.join(','), '--', ...outer] : outer.slice(1);
    const enforcement: Enforcement = {
      driver: 'bwrap',
      filesystem: 'read-only root; only /work (run copy) and a private size-capped /tmp writable; no host home, /etc or other projects mounted',
      network: 'none (separate network namespace)',
      env: 'cleared (PATH, HOME, TMPDIR, NODE_OPTIONS only)',
      user: 'uid/gid 65534, all capabilities dropped',
      cpu: `RLIMIT_CPU=${limits.cpuSeconds}s`,
      memory: cg ? cg.memory : `RLIMIT_AS=${Math.max(limits.memoryMb, 1024)}MB (virtual) + V8 heap cap`,
      // RLIMIT_NPROC counts every process of the host user, not just this sandbox, so it is not used.
      pids: cg ? cg.pids : 'NOT ENFORCED (no writable cgroup; set OMEGA_CGROUP_PARENT or use the docker driver)',
      fileSize: `RLIMIT_FSIZE=${limits.fileSizeMb}MB, /tmp ${limits.tmpMb}MB`,
      wall: `${limits.wallMs}ms, then SIGKILL of the whole tree`,
    };
    try {
      const res = await runControlled({
        policy: SANDBOX_POLICY(cmd),
        cwd: req.workspace,
        cmd,
        args: cmdArgs,
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
        timeoutMs: limits.wallMs,
        signal: req.signal,
        onKill: () => cg?.procsFiles.forEach(killProcs),
      });
      return { ...res, enforcement, killedBy: res.aborted ? 'abort' : res.timedOut ? 'wall' : res.code === 137 || res.signal === 'SIGKILL' ? 'cpu-or-memory' : null };
    } finally {
      cg?.destroy();
    }
  }
}

export interface DockerOptions {
  image: string;
  bin?: string;
}

export function dockerArgs(name: string, ws: string, limits: SandboxLimits, user: string, image: string, inner: string[]): string[] {
  return [
    'run', '--rm', '--name', name,
    '--network', 'none',
    '--read-only',
    '--tmpfs', `/tmp:rw,noexec,nosuid,size=${limits.tmpMb}m`,
    '--memory', `${limits.memoryMb}m`, '--memory-swap', `${limits.memoryMb}m`,
    '--cpus', '1',
    '--pids-limit', String(limits.pids),
    '--ulimit', `cpu=${limits.cpuSeconds}`,
    '--ulimit', `fsize=${limits.fileSizeMb * 1024 * 1024}`,
    '--ulimit', 'nofile=512',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--user', user,
    '--env', `NODE_OPTIONS=--max-old-space-size=${Math.max(64, Math.floor(limits.memoryMb * 0.75))}`,
    '--env', 'HOME=/tmp',
    '--volume', `${ws}:/work:rw`,
    '--workdir', '/work',
    image,
    'node', ...inner,
  ];
}

export class DockerSandbox implements Sandbox {
  readonly id = 'docker' as const;
  readonly image: string;
  readonly bin: string;
  constructor(opts: DockerOptions) {
    this.image = opts.image;
    this.bin = opts.bin ?? 'docker';
  }
  describe() {
    return `docker (${this.image}): --network none, read-only root, memory/cpu/pids limits, cap-drop ALL, uid 65534`;
  }
  async run(req: SandboxRunRequest): Promise<SandboxResult> {
    const limits = { ...DEFAULT_LIMITS, ...req.limits };
    const name = `omega-run-${req.runId}`;
    // Make the run copy writable for the container user without opening it to everyone.
    let user = '65534:65534';
    if (isRoot()) chownTree(req.workspace, 65534, 65534);
    else if (typeof process.getuid === 'function') user = `${process.getuid()}:${process.getgid!()}`;
    const args = dockerArgs(name, req.workspace, limits, user, this.image, req.args);
    const enforcement: Enforcement = {
      driver: 'docker',
      filesystem: 'read-only root fs; only /work (run copy) and a small /tmp writable',
      network: 'none (--network none)',
      env: 'image defaults + NODE_OPTIONS, HOME; no host variables',
      user: `${user}, cap-drop ALL, no-new-privileges`,
      cpu: `--cpus 1, ulimit cpu=${limits.cpuSeconds}s`,
      memory: `--memory ${limits.memoryMb}MB (no extra swap)`,
      pids: `--pids-limit ${limits.pids}`,
      fileSize: `ulimit fsize=${limits.fileSizeMb}MB, /tmp ${limits.tmpMb}MB`,
      wall: `${limits.wallMs}ms, then docker kill`,
    };
    const killContainer = () => {
      spawnSync(this.bin, ['kill', name], { stdio: 'ignore', timeout: 15_000 });
      spawnSync(this.bin, ['rm', '-f', name], { stdio: 'ignore', timeout: 15_000 });
    };
    const res = await runControlled({
      policy: SANDBOX_POLICY(this.bin),
      cwd: req.workspace,
      cmd: this.bin,
      args,
      env: { PATH: process.env.PATH ?? '', ...(process.env.DOCKER_HOST ? { DOCKER_HOST: process.env.DOCKER_HOST } : {}), ...(process.platform === 'win32' ? { SYSTEMROOT: process.env.SYSTEMROOT ?? '', USERPROFILE: process.env.USERPROFILE ?? '' } : { HOME: process.env.HOME ?? '' }) },
      timeoutMs: limits.wallMs,
      signal: req.signal,
      onKill: killContainer,
    });
    return { ...res, enforcement, killedBy: res.aborted ? 'abort' : res.timedOut ? 'wall' : res.code === 137 ? 'cpu-or-memory' : null };
  }
}

export class NoSandbox implements Sandbox {
  readonly id = 'none' as const;
  describe() {
    return 'NO ISOLATION: generated code runs as a normal child process on this machine (scrubbed env, wall-clock timeout only)';
  }
  async run(req: SandboxRunRequest): Promise<SandboxResult> {
    const limits = { ...DEFAULT_LIMITS, ...req.limits };
    const res = await runControlled({
      policy: SANDBOX_POLICY('node'),
      cwd: req.workspace,
      cmd: 'node',
      args: req.args,
      timeoutMs: limits.wallMs,
      signal: req.signal,
    });
    const none = 'NOT ENFORCED (no sandbox)';
    return {
      ...res,
      enforcement: { driver: 'none', filesystem: `${none}: runs in a disposable copy, but can read anything this user can`, network: none, env: 'scrubbed (OMEGA base allow-list)', user: none, cpu: none, memory: none, pids: none, fileSize: none, wall: `${limits.wallMs}ms` },
      killedBy: res.aborted ? 'abort' : res.timedOut ? 'wall' : null,
    };
  }
}

// ── detection ───────────────────────────────────────────────────────────────

export interface SandboxConfig {
  mode: SandboxMode;
  allowUnsandboxed: boolean;
  dockerImage: string;
}

function probeBwrap(): boolean {
  if (process.platform !== 'linux') return false;
  const which = spawnSync('bwrap', ['--version'], { encoding: 'utf8' });
  const prl = spawnSync('prlimit', ['--version'], { encoding: 'utf8' });
  if (which.status !== 0 || prl.status !== 0) return false;
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? '/tmp'), 'omega-probe-'));
  try {
    const { args } = bwrapArgs(dir, DEFAULT_LIMITS, ['-e', 'process.exit(0)']);
    return spawnSync('bwrap', args, { stdio: 'ignore', timeout: 20_000 }).status === 0;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function probeDocker(image: string): boolean {
  const info = spawnSync('docker', ['info', '--format', '{{.OSType}}'], { encoding: 'utf8', timeout: 15_000 });
  if (info.status !== 0 || info.stdout.trim() !== 'linux') return false;
  return spawnSync('docker', ['image', 'inspect', image], { stdio: 'ignore', timeout: 15_000 }).status === 0;
}

let cached: { key: string; sandbox: Sandbox | SandboxUnavailableError } | null = null;

/** Pick the strongest available driver. Throws SandboxUnavailableError instead of silently degrading. */
export function resolveSandbox(cfg: SandboxConfig): Sandbox {
  const key = JSON.stringify(cfg);
  if (cached?.key === key) {
    if (cached.sandbox instanceof SandboxUnavailableError) throw cached.sandbox;
    return cached.sandbox;
  }
  let result: Sandbox | SandboxUnavailableError;
  if (cfg.mode === 'bwrap') result = probeBwrap() ? new BwrapSandbox() : new SandboxUnavailableError('OMEGA_SANDBOX=bwrap but bubblewrap/prlimit is missing or user namespaces are blocked');
  else if (cfg.mode === 'docker') result = probeDocker(cfg.dockerImage) ? new DockerSandbox({ image: cfg.dockerImage }) : new SandboxUnavailableError(`OMEGA_SANDBOX=docker but the daemon is unreachable, not running Linux containers, or image ${cfg.dockerImage} is not pulled`);
  else if (cfg.mode === 'none') result = cfg.allowUnsandboxed ? new NoSandbox() : new SandboxUnavailableError('OMEGA_SANDBOX=none requires OMEGA_ALLOW_UNSANDBOXED=1');
  else if (probeBwrap()) result = new BwrapSandbox();
  else if (probeDocker(cfg.dockerImage)) result = new DockerSandbox({ image: cfg.dockerImage });
  else if (cfg.allowUnsandboxed) result = new NoSandbox();
  else result = new SandboxUnavailableError(`No sandbox available. Linux: install bubblewrap. Windows/macOS: start Docker Desktop and run "docker pull ${cfg.dockerImage}". Or explicitly accept running generated code unisolated with OMEGA_ALLOW_UNSANDBOXED=1.`);
  cached = { key, sandbox: result };
  if (result instanceof SandboxUnavailableError) throw result;
  return result;
}

export function resetSandboxCache(): void {
  cached = null;
}
