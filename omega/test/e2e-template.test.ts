import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Omega } from '../src/engine/orchestrator.ts';
import { testConfig } from './helpers.ts';

test('template engine: idea → spec → scaffold → tests → code → verified tests → scan → docs → review', async () => {
  const omega = new Omega(testConfig());
  const created = await omega.createMission({ idea: 'Jag vill ha en temperaturomvandlare mellan Celsius och Fahrenheit', engine: 'template', actor: 'test' });
  assert.equal(created.state, 'running');

  const ran = await omega.runUntilIdle();
  assert.equal(ran, 7, 'seven stages ran');

  const m = omega.getMission(created.id);
  assert.equal(m.state, 'awaiting_review', m.error);
  assert.deepEqual(
    m.stages.map((s) => `${s.role}:${s.state}`),
    ['product', 'architect', 'test-author', 'coder', 'tester', 'security', 'docs'].map((r) => `${r}:succeeded`),
  );
  assert.equal(m.tests?.ok, true);
  assert.equal(m.tests?.fail, 0);
  assert.ok(m.tests!.coverage.every((c) => c.passing), 'every acceptance criterion verified');
  assert.equal(m.security?.high, 0);

  // The project really works, independently of OMEGA: run its tests ourselves.
  const own = spawnSync(process.execPath, ['--test', 'test/'], { cwd: m.projectDir, encoding: 'utf8' });
  assert.equal(own.status, 0, own.stdout + own.stderr);
  const cli = spawnSync(process.execPath, ['src/cli.js', '100', 'C', 'F'], { cwd: m.projectDir, encoding: 'utf8' });
  assert.equal(cli.stdout.trim(), '212 F');

  // Every writing stage was committed under its role's identity.
  const detail = await omega.missionDetail(m.id);
  const authors = detail.commits.map((c) => c.author).reverse();
  assert.deepEqual(authors, ['OMEGA architect', 'OMEGA test-author', 'OMEGA coder', 'OMEGA docs']);
  assert.ok(fs.existsSync(path.join(m.projectDir, 'README.md')));

  // Evidence integrity holds, then the human approves.
  const verify = await omega.verifyEvidence(m.id);
  assert.equal(verify.ok, true, JSON.stringify(verify.checks.filter((c) => !c.ok)));
  const review = omega.listApprovals('pending').find((a) => a.missionId === m.id && a.kind === 'final_review');
  assert.ok(review, 'final review is queued for a human');
  await omega.decideApproval(review.id, 'approve', 'test', 'looks good');
  assert.equal(omega.getMission(m.id).state, 'approved');
  assert.equal(omega.audit.verify().ok, true);
});

test('template engine refuses ideas it has no recipe for (no fake output)', async () => {
  const omega = new Omega(testConfig());
  const m = await omega.createMission({ idea: 'Bygg ett schackspel med AI-motståndare', engine: 'template' });
  await omega.runUntilIdle();
  const after = omega.getMission(m.id);
  assert.equal(after.state, 'failed');
  assert.match(after.error ?? '', /only builds known recipes/);
});

test('re-verification re-runs tests and detects tampering with acceptance tests', async () => {
  const omega = new Omega(testConfig());
  const m = await omega.createMission({ idea: 'räkna ord i en text (word count)', engine: 'template' });
  await omega.runUntilIdle();
  assert.equal(omega.getMission(m.id).state, 'awaiting_review');
  const ok = await omega.reverify(m.id, 'test');
  assert.equal(ok.ok, true);
  fs.appendFileSync(path.join(m.projectDir, 'test', 'acceptance.test.js'), '\n// edited after review\n');
  const tampered = await omega.reverify(m.id, 'test');
  assert.equal(tampered.ok, false);
  assert.match(tampered.failures[0], /INTEGRITY/);
  const ev = await omega.verifyEvidence(m.id);
  assert.equal(ev.checks.find((c) => c.name === 'acceptance tests unchanged')?.ok, false);
});
