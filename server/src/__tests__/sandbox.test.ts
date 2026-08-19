import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildDockerArgs,
  buildDockerDependencyArgs,
  buildDockerLockArgs,
  buildDockerVolumeTaskArgs,
  createSandboxSnapshot,
  normalizeSandboxTask,
  validateNodeLockfile,
  validateNodeManifest,
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

function validLockfile(resolved = 'https://registry.npmjs.org/react/-/react-19.1.1.tgz') {
  return {
    name: 'sandbox-fixture',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: 'sandbox-fixture',
        version: '1.0.0',
        dependencies: { react: '^19.1.1' },
      },
      'node_modules/react': {
        version: '19.1.1',
        resolved,
        integrity: `sha512-${Buffer.from('verified-registry-artifact').toString('base64')}`,
      },
    },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('sandbox task allowlist', () => {
  it('accepts only fixed deterministic task identifiers', () => {
    expect(normalizeSandboxTask('node-lock')).toBe('node-lock');
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

describe('npm dependency policy', () => {
  it('accepts npm-registry version specs but rejects Git, URL, workspace, and file specs', () => {
    expect(
      validateNodeManifest({
        name: 'fixture',
        packageManager: 'npm@12.0.2',
        dependencies: { react: '^19.1.1', zod: '4.0.0' },
      })
    ).toBe(2);

    for (const spec of [
      'https://example.com/pkg.tgz',
      'git+https://github.com/example/pkg.git',
      'github:example/pkg',
      'workspace:*',
      'file:../pkg',
      '../pkg',
    ]) {
      expect(() =>
        validateNodeManifest({ name: 'fixture', dependencies: { unsafe: spec } })
      ).toThrow(/only npm-registry package specs/i);
    }
  });

  it('requires npm v2/v3 lockfiles with registry-only SHA-512 artifacts', () => {
    expect(validateNodeLockfile(validLockfile())).toMatchObject({
      lockfileVersion: 3,
      registryArtifacts: 1,
      packageEntries: 2,
    });

    expect(() =>
      validateNodeLockfile(
        validLockfile('https://github.com/example/releases/download/v1/pkg.tgz')
      )
    ).toThrow(/registry\.npmjs\.org/i);
    expect(() =>
      validateNodeLockfile(validLockfile('http://registry.npmjs.org/react/-/react.tgz'))
    ).toThrow(/registry\.npmjs\.org/i);

    const missingIntegrity = validLockfile();
    delete (missingIntegrity.packages['node_modules/react'] as { integrity?: string }).integrity;
    expect(() => validateNodeLockfile(missingIntegrity)).toThrow(/sha-512/i);
  });

  it('rejects credential-bearing files and symlinks before Docker sees the source', () => {
    const secretProject = temporaryDirectory();
    fs.writeFileSync(path.join(secretProject, 'package.json'), '{"name":"fixture"}');
    fs.writeFileSync(path.join(secretProject, '.env'), 'API_KEY=secret');
    expect(() => createSandboxSnapshot(secretProject)).toThrow(/credential-bearing filename/i);

    const linkedProject = temporaryDirectory();
    fs.writeFileSync(path.join(linkedProject, 'package.json'), '{"name":"fixture"}');
    fs.writeFileSync(path.join(linkedProject, 'real.txt'), 'safe');
    fs.symlinkSync(path.join(linkedProject, 'real.txt'), path.join(linkedProject, 'linked.txt'));
    expect(() => createSandboxSnapshot(linkedProject)).toThrow(/symbolic links/i);
  });
});

describe('Docker sandbox invocation', () => {
  it('uses a fixed non-root, no-network, read-only-host boundary without dependencies', () => {
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

  it('resolves and installs dependencies only in the controlled networked phase', () => {
    const source = temporaryDirectory();
    const volume = 'agent-os-deps-12345678';
    const lockArgs = buildDockerLockArgs(source, volume, 'agent-os-sandbox-aaaaaaaa');
    const installArgs = buildDockerDependencyArgs(
      source,
      volume,
      'agent-os-sandbox-bbbbbbbb'
    );
    const verifyArgs = buildDockerVolumeTaskArgs(
      volume,
      'node-test',
      'agent-os-sandbox-cccccccc'
    );

    expect(lockArgs).toContain('--network=bridge');
    expect(lockArgs.at(-1)).toContain('npm install --package-lock-only --ignore-scripts');
    expect(lockArgs.join(' ')).toContain('target=/source,readonly');

    expect(installArgs).toContain('--network=bridge');
    expect(installArgs.at(-1)).toContain('npm ci --ignore-scripts');
    expect(installArgs.join(' ')).toContain('npm_config_ignore_scripts=true');

    expect(verifyArgs).toContain('--network=none');
    expect(verifyArgs.at(-1)).toBe(
      'npm rebuild --offline --no-audit --no-fund && npm test'
    );
    expect(verifyArgs.join(' ')).not.toContain('/source');
    expect(verifyArgs.join(' ')).not.toContain('docker.sock');
  });

  it('maps each accepted verification task to fixed shell text', () => {
    const source = temporaryDirectory();
    const testArgs = buildDockerArgs(source, 'node-test', 'agent-os-sandbox-dddddddd');
    const buildArgs = buildDockerArgs(source, 'node-build', 'agent-os-sandbox-eeeeeeee');
    const pythonArgs = buildDockerArgs(source, 'python-test', 'agent-os-sandbox-ffffffff');

    expect(testArgs.at(-1)).toMatch(/&& npm test$/);
    expect(buildArgs.at(-1)).toMatch(/&& npm run build$/);
    expect(pythonArgs.at(-1)).toMatch(/&& python -m pytest -q$/);
    expect(testArgs.at(-1)).not.toContain('powershell');
    expect(buildArgs.at(-1)).not.toContain('cmd.exe');
  });

  it('rejects paths that could alter Docker --mount CSV parsing', () => {
    const source = temporaryDirectory('agent-os-sandbox,');
    expect(() =>
      buildDockerArgs(source, 'node-test', 'agent-os-sandbox-11111111')
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
