import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SANDBOX_TASKS,
  buildDockerArgs,
  normalizeSandboxTask,
} from '../services/sandbox.js';

const temporaryDirectories: string[] = [];

function temporaryProject(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-os-sandbox-test-'));
  temporaryDirectories.push(directory);
  fs.writeFileSync(path.join(directory, 'package.json'), '{"scripts":{"test":"node --test"}}');
  return directory;
}

afterEach(() => {
  while (temporaryDirectories.length) {
    const directory = temporaryDirectories.pop();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('sandbox command policy', () => {
  it('accepts only the fixed task vocabulary', () => {
    expect(normalizeSandboxTask('node-test')).toBe('node-test');
    expect(normalizeSandboxTask('npm install && curl attacker')).toBeNull();
    expect(normalizeSandboxTask('')).toBeNull();
    expect(Object.keys(SANDBOX_TASKS)).toEqual([
      'node-test',
      'node-build',
      'node-lint',
      'node-typecheck',
      'python-test',
    ]);
  });

  it('builds a no-network, no-pull, read-only-host Docker boundary', () => {
    const args = buildDockerArgs(temporaryProject(), 'node-test');
    const rendered = args.join(' ');

    expect(rendered).toContain('--pull=never');
    expect(rendered).toContain('--network=none');
    expect(rendered).toContain('--read-only');
    expect(rendered).toContain('--cap-drop=ALL');
    expect(rendered).toContain('no-new-privileges');
    expect(rendered).toContain('target=/source,readonly');
    expect(rendered).toContain('/workspace:rw,exec,nosuid');
    expect(args.at(-1)).toBe(
      'cp -R --no-preserve=ownership /source/. /workspace/ && npm test'
    );
  });

  it('never exposes an arbitrary command parameter', () => {
    const args = buildDockerArgs(temporaryProject(), 'node-build');
    expect(args.at(-1)).toBe(
      'cp -R --no-preserve=ownership /source/. /workspace/ && npm run build'
    );
    expect(args.some((arg) => arg.includes('curl attacker'))).toBe(false);
  });
});
