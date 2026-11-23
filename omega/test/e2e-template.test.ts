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
  // Clean env: Node's test runner sets NODE_TEST_CONTEXT, which would make a nested
  // `node --test` report to us instead of exiting non-zero on failure.
  const { NODE_TEST_CONTEXT: _ctx, ...cleanEnv } = process.env;
  const own = spawnSync(process.execPath, ['--test', 'test/**/*.test.js'], { cwd: m.projectDir, encoding: 'utf8', env: cleanEnv });
  assert.equal(own.status, 0, own.stdout + own.stderr);
  assert.match(own.stdout, /# pass 6/);
  // And the same check is not vacuous: a broken implementation fails it.
  const brokenDir = fs.mkdtempSync(path.join(path.dirname(m.projectDir), 'broken-'));
  fs.cpSync(m.projectDir, brokenDir, { recursive: true, filter: (src) => !src.includes(`${path.sep}.git`) });
  fs.writeFileSync(path.join(brokenDir, 'src', 'index.js'), 'export const convert = () => 0; export const celsiusToFahrenheit = () => 0; export const fahrenheitToCelsius = () => 0;\n');
  const broken = spawnSync(process.execPath, ['--test', 'test/**/*.test.js'], { cwd: brokenDir, encoding: 'utf8', env: cleanEnv });
  assert.notEqual(broken.status, 0, 'a wrong implementation must fail the same command');
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
