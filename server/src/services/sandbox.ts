import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const NODE_IMAGE = process.env.AGENT_OS_NODE_SANDBOX_IMAGE?.trim() || 'node:22-bookworm-slim';
const PYTHON_IMAGE = process.env.AGENT_OS_PYTHON_SANDBOX_IMAGE?.trim() || 'python:3.12-slim';

export const SANDBOX_TASKS = {
  'node-test': {
    image: NODE_IMAGE,
    command: 'npm test',
    description: 'Run the project test script',
  },
  'node-build': {
    image: NODE_IMAGE,
    command: 'npm run build',
    description: 'Run the project production build script',
  },
  'node-lint': {
    image: NODE_IMAGE,
    command: 'npm run lint',
    description: 'Run the project lint script',
  },
  'node-typecheck': {
    image: NODE_IMAGE,
    command: 'npm run typecheck',
    description: 'Run the project typecheck script',
  },
  'python-test': {
    image: PYTHON_IMAGE,
    command: 'python -m pytest -q',
    description: 'Run the Python test suite',
  },
} as const;

export type SandboxTask = keyof typeof SANDBOX_TASKS;

export interface SandboxResult {
  task: SandboxTask;
  passed: boolean;
  blocked: boolean;
  exitCode: number | null;
  image: string;
  output: string;
}

export function normalizeSandboxTask(value: unknown): SandboxTask | null {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return Object.prototype.hasOwnProperty.call(SANDBOX_TASKS, candidate)
    ? (candidate as SandboxTask)
    : null;
}

export function getSandboxTaskSpec(task: SandboxTask) {
  return SANDBOX_TASKS[task];
}

function compactOutput(stdout: string, stderr: string): string {
  const combined = `${stdout}${stderr ? `${stdout ? '\n' : ''}${stderr}` : ''}`.trim();
  return (combined || '(completed with no output)').slice(0, 8000);
}

function dockerAvailable(): { available: boolean; detail: string } {
  const result = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    encoding: 'utf8',
    timeout: 15_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });

  if (result.error) {
    return { available: false, detail: result.error.message };
  }
  if (result.status !== 0) {
    return {
      available: false,
      detail: compactOutput(result.stdout ?? '', result.stderr ?? ''),
    };
  }
  return { available: true, detail: (result.stdout || '').trim() };
}

function imageAvailable(image: string): boolean {
  const result = spawnSync('docker', ['image', 'inspect', image], {
    encoding: 'utf8',
    timeout: 15_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  return !result.error && result.status === 0;
}

/**
 * Build a fixed Docker invocation. No model-supplied command is ever interpolated.
 * The source workspace is mounted read-only and copied into an ephemeral tmpfs,
 * so package scripts can neither modify the real workspace nor access the host
 * filesystem outside the source mount. Network, Linux capabilities, and privilege
 * escalation are disabled and resource ceilings are applied.
 */
export function buildDockerArgs(sourceDirectory: string, task: SandboxTask): string[] {
  const source = path.resolve(sourceDirectory);
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new Error('Sandbox source directory does not exist.');
  }
  if (source.includes(',') || /[\r\n\0]/.test(source)) {
    throw new Error('Sandbox source path contains unsupported characters.');
  }

  const spec = SANDBOX_TASKS[task];
  const fixedCommand = `cp -a /source/. /workspace/ && ${spec.command}`;

  return [
    'run',
    '--rm',
    '--pull=never',
    '--network=none',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt',
    'no-new-privileges',
    '--pids-limit',
    '128',
    '--memory',
    '1024m',
    '--cpus',
    '1',
    '--ipc',
    'none',
    '--ulimit',
    'nofile=1024:1024',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=128m',
    '--tmpfs',
    '/workspace:rw,exec,nosuid,size=1024m',
    '--mount',
    `type=bind,source=${source},target=/source,readonly`,
    '--workdir',
    '/workspace',
    '--env',
    'HOME=/tmp',
    '--env',
    'npm_config_cache=/tmp/npm-cache',
    '--env',
    'NO_COLOR=1',
    '--hostname',
    'agent-os-sandbox',
    spec.image,
    'sh',
    '-lc',
    fixedCommand,
  ];
}

export function runSandboxTask(
  sourceDirectory: string,
  task: SandboxTask,
  timeoutMs = 120_000
): SandboxResult {
  const spec = SANDBOX_TASKS[task];
  const docker = dockerAvailable();
  if (!docker.available) {
    return {
      task,
      passed: false,
      blocked: true,
      exitCode: null,
      image: spec.image,
      output: `Sandbox blocked: Docker is unavailable or not running. ${docker.detail}`,
    };
  }

  if (!imageAvailable(spec.image)) {
    return {
      task,
      passed: false,
      blocked: true,
      exitCode: null,
      image: spec.image,
      output:
        `Sandbox blocked: required image ${spec.image} is not present locally. ` +
        `Owner action: review and run \"docker pull ${spec.image}\" once. Automatic pulls are disabled.`,
    };
  }

  let args: string[];
  try {
    args = buildDockerArgs(sourceDirectory, task);
  } catch (error) {
    return {
      task,
      passed: false,
      blocked: true,
      exitCode: null,
      image: spec.image,
      output: `Sandbox blocked: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      PATH: process.env.PATH ?? '',
      SystemRoot: process.env.SystemRoot ?? '',
      WINDIR: process.env.WINDIR ?? '',
      HOME: process.env.HOME ?? '',
      USERPROFILE: process.env.USERPROFILE ?? '',
      DOCKER_HOST: process.env.DOCKER_HOST ?? '',
      DOCKER_CONTEXT: process.env.DOCKER_CONTEXT ?? '',
    },
  });

  const output = compactOutput(result.stdout ?? '', result.stderr ?? '');
  if (result.error) {
    const timedOut = result.error.message.toLowerCase().includes('timed out');
    return {
      task,
      passed: false,
      blocked: false,
      exitCode: result.status,
      image: spec.image,
      output: `${timedOut ? 'Sandbox timeout' : 'Sandbox execution error'}: ${result.error.message}\n${output}`,
    };
  }

  return {
    task,
    passed: result.status === 0,
    blocked: false,
    exitCode: result.status,
    image: spec.image,
    output,
  };
}

export function formatSandboxResult(result: SandboxResult): string {
  const state = result.blocked ? 'BLOCKED' : result.passed ? 'PASS' : 'FAIL';
  return [
    `${state}: ${result.task}`,
    `IMAGE: ${result.image}`,
    `EXIT: ${result.exitCode ?? 'not-run'}`,
    '',
    result.output,
  ].join('\n');
}
