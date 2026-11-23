#!/usr/bin/env node
/**
 * Offline verifier for an exported OMEGA evidence bundle (docs/evidence/real-run-*).
 *
 *   node scripts/verify-evidence.ts docs/evidence/real-run-msn_990c384537ee
 *
 * Checks, without trusting anything OMEGA printed:
 *  1. every artifact's SHA-256 matches the hash recorded in mission.json
 *  2. the evidence manifest's artifact hashes match the files
 *  3. the audit log hash chain is intact and contains the manifest's head
 *  4. every stage commit exists in project.bundle, authored by the right role
 *  5. the acceptance tests in the bundle's HEAD match the recorded test digest
 *  6. the acceptance tests pass when run fresh from the bundle
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AuditLog } from '../src/core/audit.ts';
import { sha256 } from '../src/core/util.ts';
import { treeDigest } from '../src/roles/files.ts';
import type { Mission } from '../src/core/types.ts';

const dir = path.resolve(process.argv[2] ?? '');
if (!fs.existsSync(path.join(dir, 'mission.json'))) {
  console.error('usage: node scripts/verify-evidence.ts <evidence-dir>');
  process.exit(2);
}
const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail });

const { mission } = JSON.parse(fs.readFileSync(path.join(dir, 'mission.json'), 'utf8')) as { mission: Mission };

// 1. artifacts vs mission record
for (const ev of mission.stages.flatMap((s) => s.evidence)) {
  const f = path.join(dir, 'artifacts', ev.path);
  const actual = fs.existsSync(f) ? sha256(fs.readFileSync(f)) : 'missing';
  check(`artifact ${ev.name}`, actual === ev.sha256, actual.slice(0, 16));
}

// 2. manifest vs files
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'artifacts', 'evidence-manifest.json'), 'utf8')) as {
  artifacts: { name: string; sha256: string }[];
  auditHead: { seq: number; hash: string };
  headCommit: string;
  testDigest: string;
};
for (const a of manifest.artifacts) {
  const actual = sha256(fs.readFileSync(path.join(dir, 'artifacts', a.name)));
  check(`manifest entry ${a.name}`, actual === a.sha256);
}

// 3. audit chain (AuditLog reads <dir>/audit.jsonl)
const audit = new AuditLog(dir);
const chain = audit.verify();
check('audit chain intact', chain.ok, chain.ok ? `${chain.count} entries` : `broken at ${chain.brokenAt}: ${chain.reason}`);
const sealedAt = audit.list().find((e) => e.seq === manifest.auditHead.seq);
check('manifest audit head present in chain', sealedAt?.hash === manifest.auditHead.hash, `#${manifest.auditHead.seq}`);

// 4–6. git history from the bundle
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-verify-'));
const repo = path.join(tmp, 'project');
const cleanEnv = { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1' };
delete (cleanEnv as Record<string, string | undefined>).NODE_TEST_CONTEXT;
const git = (...args: string[]) => spawnSync('git', args, { cwd: repo, encoding: 'utf8', env: cleanEnv });
spawnSync('git', ['clone', '-q', path.join(dir, 'project.bundle'), repo], { encoding: 'utf8', env: cleanEnv });
check('bundle HEAD = manifest headCommit', git('rev-parse', 'HEAD').stdout.trim() === manifest.headCommit, manifest.headCommit.slice(0, 10));
for (const s of mission.stages.filter((x) => x.commit)) {
  const author = git('log', '-1', '--format=%an', s.commit!).stdout.trim();
  check(`commit ${s.commit!.slice(0, 10)} by ${s.role}`, author === `OMEGA ${s.role}`, author || 'missing');
}
check('acceptance tests match recorded digest', treeDigest(repo, 'test').digest === mission.testDigest);
const run = spawnSync(process.execPath, ['--test', 'test/**/*.test.js'], { cwd: repo, encoding: 'utf8', env: cleanEnv });
const pass = run.stdout.match(/^# pass (\d+)/m)?.[1];
const total = run.stdout.match(/^# tests (\d+)/m)?.[1];
check('acceptance tests pass on a fresh checkout', run.status === 0, `${pass}/${total}`);
fs.rmSync(tmp, { recursive: true, force: true });

for (const r of results) console.log(`${r.ok ? '✔' : '✘'} ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
const ok = results.every((r) => r.ok);
console.log(ok ? `\nALL ${results.length} CHECKS PASSED` : '\nVERIFICATION FAILED');
process.exit(ok ? 0 : 1);
