import { spawn } from 'node:child_process';
import { checkExec, type RolePolicy } from './policy.ts';

/**
 * Controlled process execution — the only way OMEGA runs a program.
 *
 *  - command must be on the role's allow-list (checkExec)
 *  - no shell: arguments are passed as an argv array, so metacharacters are inert
 *  - scrubbed environment: a small base allow-list plus the role's passthrough;
 *    known credential variables are always removed
 *  - hard timeout (whole process group is killed on POSIX) and output caps
 */
export interface ExecRequest {
  policy: RolePolicy;
  cwd: string;
  cmd: string;
  args: string[];
  stdin?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  extraEnv?: Record<string, string>;
  /** Replace the scrubbed env entirely (sandbox drivers build their own). */
  env?: Record<string, string>;
  /** Aborting kills the process (group) like a timeout does. */
  signal?: AbortSignal;
  /** Extra teardown on timeout/abort, e.g. `docker kill` or killing a cgroup. */
  onKill?: () => void | Promise<void>;
}

export interface ExecResult {
  cmd: string;
  args: string[];
  cwd: string;
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  aborted: boolean;
  truncated: boolean;
}

const BASE_ENV = [
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA',
];

/** Never forwarded, whatever a policy says. */
const DENY_ENV = [
  /^GH_TOKEN$/i, /^GITHUB_TOKEN$/i, /^GH_ENTERPRISE_TOKEN$/i, /^AWS_/i, /^AZURE_/i, /^GOOGLE_APPLICATION_CREDENTIALS$/i,
  /^CLOUDSDK_AUTH_/i, /^NPM_TOKEN$/i, /^NODE_AUTH_TOKEN$/i, /^OMEGA_TOKEN$/i, /^OPENAI_API_KEY$/i, /^HF_TOKEN$/i,
  /^SSH_AUTH_SOCK$/i, /^GIT_ASKPASS$/i, /^GIT_CONFIG_/i,
  // Could change how a child Node process behaves (inject code / fake test results).
  /^NODE_OPTIONS$/i, /^NODE_TEST_CONTEXT$/i,
];

function matchesName(name: string, pattern: string): boolean {
  const upper = name.toUpperCase();
  const p = pattern.toUpperCase();
  return p.endsWith('*') ? upper.startsWith(p.slice(0, -1)) : upper === p;
}

export function buildEnv(passthrough: string[], base: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(base)) {
    if (value === undefined) continue;
    const allowed = BASE_ENV.some((p) => matchesName(name, p)) || passthrough.some((p) => matchesName(name, p));
    if (!allowed) continue;
    if (DENY_ENV.some((re) => re.test(name))) continue;
    env[name] = value;
  }
  env.NO_COLOR = '1';
  env.FORCE_COLOR = '0';
  return env;
}

function resolveBinary(cmd: string): string {
  return cmd === 'node' ? process.execPath : cmd;
}

export function runControlled(req: ExecRequest): Promise<ExecResult> {
  checkExec(req.policy, req.cmd, req.args);
  const timeoutMs = req.timeoutMs ?? 120_000;
  const cap = req.maxOutputBytes ?? 4 * 1024 * 1024;
  const started = Date.now();
  const isWin = process.platform === 'win32';

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(resolveBinary(req.cmd), req.args, {
        cwd: req.cwd,
        env: req.env ?? { ...buildEnv(req.policy.envPassthrough), ...(req.extraEnv ?? {}) },
        shell: false,
        windowsHide: true,
        detached: !isWin,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      reject(err);
      return;
    }
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    let aborted = false;
    const take = (current: string, chunk: Buffer): string => {
      if (current.length >= cap) {
        truncated = true;
        return current;
      }
      const next = current + chunk.toString('utf8');
      if (next.length > cap) {
        truncated = true;
        return next.slice(0, cap);
      }
      return next;
    };
    child.stdout.on('data', (c: Buffer) => (stdout = take(stdout, c)));
    child.stderr.on('data', (c: Buffer) => (stderr = take(stderr, c)));
    const kill = () => {
      try {
        if (!isWin && child.pid) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      if (req.onKill) Promise.resolve(req.onKill()).catch(() => {});
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeoutMs);
    const onAbort = () => {
      aborted = true;
      kill();
    };
    if (req.signal?.aborted) onAbort();
    else req.signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (err) => {
      clearTimeout(timer);
      req.signal?.removeEventListener('abort', onAbort);
      reject(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      req.signal?.removeEventListener('abort', onAbort);
      resolve({
        cmd: req.cmd,
        args: req.args,
        cwd: req.cwd,
        code,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        timedOut,
        aborted,
        truncated,
      });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(req.stdin ?? '');
  });
}
