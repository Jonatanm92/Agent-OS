import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, type OmegaConfig } from '../src/config.ts';

export function tempHome(prefix = 'omega-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function testConfig(overrides: Partial<OmegaConfig> = {}): OmegaConfig {
  const home = overrides.home ?? tempHome();
  return loadConfig({ home, workspaceRoot: path.join(home, 'projects'), port: 0, ...overrides });
}

/**
 * A stand-in `claude` executable for tests: a Node script that reads the prompt from
 * stdin and behaves according to FAKE_CLAUDE_MODE files. It exists ONLY in tests so
 * the real adapter (arg building, spawning, JSON parsing, cost recording, policy
 * enforcement) can be exercised without spending money. It is never used by OMEGA
 * itself, and test names say so.
 */
export function writeFakeClaude(dir: string, script: string): string {
  const file = path.join(dir, 'fake-claude.mjs');
  fs.writeFileSync(file, `#!${process.execPath}\n${script}`);
  fs.chmodSync(file, 0o755);
  return file;
}
