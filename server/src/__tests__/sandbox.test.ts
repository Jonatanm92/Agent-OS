import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildDockerArgs,
  normalizeSandboxTask,
  validateSandboxImage,
} from '../services/sandbox.js';

const temporaryDirectories: string[] = [];

function temporaryDirectory(prefix = 'agent-os-sandbox-'): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('sandbox task allowlist', () => {
  it('accepts only fixed deterministic task identifiers', () => {
    expect(normalizeSandboxTask('node-test')).toBe('node-test');
    expect(normalizeSandboxTask(' node-build ')).toBe('node-build');
    expect(normalizeSandboxTask('python-test')).toBe('python-test');
    expect(normalizeSandboxTask('npm install && powershell')).toBeNull();
    expect(normalizeSandboxTask({ task: 'node-test' })).toBeNull();
    expect(normalizeSandboxTask('run_command')).toBeNull();
  });

  it('rejects option-like and delimiter-bearing image references', () => {
    expect(validateSandboxImage('node:24-bookworm-slim')).toBe('node:24-bookworm-slim');
    expect(validateSandboxImage('ghcr.io/example/agent-os@sha256:' + 'a'.repeat(64))).toContain(
      '@sha256:'
    );
    expect(() => validateSandboxImage('-v')).toThrow(/unsafe sandbox image/i);
    expect(() => validateSandboxImage('node:24,source=/host')).toThrow(/unsafe sandbox image/i);
    expect(() => validateSandboxImage('https://registry.example/image')).toThrow(/unsafe sandbox image/i);
    expect(() => validateSandboxImage('image@sha256:1234')).toThrow(/digest-pinned/i);
  });
});

describe('Docker sandbox invocation', () => {
  it('uses a fixed non-root, no-network, read-only-host container boundary', () => {
    const source = temporaryDirectory();
    const args = buildDockerArgs(source, 'node-test', 'agent-os-sandbox-12345678');

    expect(args[0]).toBe('run');
    expect(args).toContain('--rm');
    expect(valueAfter(args, '--name')).toBe('agent-os-sandbox-12345678');
    expect(args).toContain('--pull=never');
    expect(args).toContain('--network=none');
    expect(args).toContain('--read-only');
    expect(valueAfter(args, '--user')).toBe('65532:65532');
    expect(args).toContain('--cap-drop=ALL');
    expect(valueAfter(args, '--security-opt')).toBe('no-new-privileges');
    expect(valueAfter(args, '--pids-limit')).toBe('128');
    expect(valueAfter(args, '--memory')).toBe('1024m');
    expect(valueAfter(args, '--memory-swap')).toBe('1024m');
    expect(valueAfter(args, '--cpus')).toBe('1');
    expect(valueAfter(args, '--log-driver')).toBe('none');

    const mount = valueAfter(args, '--mount');
    expect(mount).toBe(`type=bind,source=${path.resolve(source)},target=/source,readonly`);
    expect(args.join(' ')).not.toContain('docker.sock');

    expect(args.at(-4)).toBe('node:24-bookworm-slim');
    expect(args.at(-3)).toBe('sh');
    expect(args.at(-2)).toBe('-lc');
    expect(args.at(-1)).toBe(
      'cp -R --no-preserve=ownership /source/. /workspace/ && npm test'
    );
  });

  it('maps each accepted task to a fixed command rather than caller-supplied shell text', () => {
    const source = temporaryDirectory();
    const testArgs = buildDockerArgs(source, 'node-test', 'agent-os-sandbox-aaaaaaaa');
    const buildArgs = buildDockerArgs(source, 'node-build', 'agent-os-sandbox-bbbbbbbb');
    const pythonArgs = buildDockerArgs(source, 'python-test', 'agent-os-sandbox-cccccccc');

    expect(testArgs.at(-1)).toMatch(/&& npm test$/);
    expect(buildArgs.at(-1)).toMatch(/&& npm run build$/);
    expect(pythonArgs.at(-1)).toMatch(/&& python -m pytest -q$/);
    expect(testArgs.at(-1)).not.toContain('powershell');
    expect(buildArgs.at(-1)).not.toContain('cmd.exe');
  });

  it('rejects paths that could alter Docker --mount CSV parsing', () => {
    const source = temporaryDirectory('agent-os-sandbox,');
    expect(() =>
      buildDockerArgs(source, 'node-test', 'agent-os-sandbox-dddddddd')
    ).toThrow(/unsupported characters/i);
  });
});

describe('host-shell regression boundary', () => {
  it('keeps autonomous execution and pipeline verification free of execSync', () => {
    const agenticPath = fileURLToPath(new URL('../services/agentic.ts', import.meta.url));
    const pipelinePath = fileURLToPath(new URL('../services/pipeline.ts', import.meta.url));
    const agenticSource = fs.readFileSync(agenticPath, 'utf8');
    const pipelineSource = fs.readFileSync(pipelinePath, 'utf8');

    expect(agenticSource).not.toMatch(/\bexecSync\b/);
    expect(pipelineSource).not.toMatch(/\bexecSync\b/);
    expect(agenticSource).toContain('runSandboxTask');
    expect(pipelineSource).toContain('runSandboxTask');
  });
});
