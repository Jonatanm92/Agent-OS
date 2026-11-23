import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AuditLog } from '../src/core/audit.ts';
import { checkBudget } from '../src/core/budget.ts';
import { buildEnv, runControlled } from '../src/core/exec.ts';
import { checkExec, checkWrite, findWriteViolations, isSecretPath, PolicyError, resolveInside, type RolePolicy } from '../src/core/policy.ts';
import { claimNext, enqueue, recoverInterrupted } from '../src/core/queue.ts';
import { assertTransition, MISSION_TRANSITIONS, TransitionError } from '../src/core/state.ts';
import { Store } from '../src/core/store.ts';
import type { Mission } from '../src/core/types.ts';
import { ROLES } from '../src/roles/registry.ts';
import { scanProject } from '../src/roles/security.ts';
import { parseTap } from '../src/roles/tester.ts';
import { validateSpec } from '../src/roles/spec.ts';
import { tempHome, testConfig } from './helpers.ts';

test('state machine allows the happy path and rejects illegal jumps', () => {
  for (const [from, to] of [['received', 'running'], ['running', 'awaiting_review'], ['awaiting_review', 'approved'], ['blocked', 'running'], ['failed', 'running']] as const) {
    assert.doesNotThrow(() => assertTransition('mission', MISSION_TRANSITIONS, from, to));
  }
  for (const [from, to] of [['failed', 'approved'], ['received', 'approved'], ['approved', 'running'], ['running', 'approved'], ['cancelled', 'running']] as const) {
    assert.throws(() => assertTransition('mission', MISSION_TRANSITIONS, from, to), TransitionError);
  }
});

test('audit log: hash chain verifies, and any edit is detected at the right entry', () => {
  const home = tempHome();
  const log = new AuditLog(home);
  log.append('a', 'one', { x: 1 });
  log.append('b', 'two', { x: 2 }, 'msn_1');
  log.append('c', 'three', { x: 3 });
  assert.deepEqual({ ok: log.verify().ok, count: log.verify().count }, { ok: true, count: 3 });
  // A new instance continues the chain from disk.
  new AuditLog(home).append('d', 'four', {});
  assert.equal(new AuditLog(home).verify().count, 4);

  const lines = fs.readFileSync(log.file, 'utf8').trim().split('\n');
  const edited = JSON.parse(lines[1]);
  edited.data.x = 999;
  lines[1] = JSON.stringify(edited);
  fs.writeFileSync(log.file, lines.join('\n') + '\n');
  const res = new AuditLog(home).verify();
  assert.equal(res.ok, false);
  assert.equal(res.brokenAt, 2);
  assert.equal(res.reason, 'content hash mismatch');

  lines.splice(1, 1); // deleting a line is detected too
  fs.writeFileSync(log.file, lines.join('\n') + '\n');
  assert.equal(new AuditLog(home).verify().ok, false);
});

test('policy: paths cannot escape the project, including via symlinks', () => {
  const root = tempHome('omega-proj-');
  fs.mkdirSync(path.join(root, 'src'));
  for (const bad of ['../x', 'src/../../x', '/etc/passwd', 'C:\\Windows\\x', 'a\0b', '']) {
    assert.throws(() => resolveInside(root, bad), PolicyError, bad);
  }
  const outside = tempHome('omega-outside-');
  // A junction on Windows needs no admin rights and escapes the same way.
  fs.symlinkSync(outside, path.join(root, 'src', 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => resolveInside(root, 'src/link/file.js'), /symlink/);
  assert.ok(resolveInside(root, 'src/ok.js').endsWith(path.join('src', 'ok.js')));
});

test('policy: each role writes only its own paths, never secrets or .git', () => {
  const root = tempHome('omega-proj-');
  const coder = ROLES.coder.policy;
  assert.doesNotThrow(() => checkWrite(coder, root, 'src/index.js'));
  assert.throws(() => checkWrite(coder, root, 'test/acceptance.test.js'), /may not write/);
  assert.throws(() => checkWrite(coder, root, 'package.json'), /may not write/);
  assert.throws(() => checkWrite(ROLES['test-author'].policy, root, 'src/index.js'), /may not write/);
  assert.throws(() => checkWrite(coder, root, 'src/.env'), /secret/);
  assert.throws(() => checkWrite({ ...coder, writePaths: ['.git/**'] }, root, '.git/config'), /\.git/);
  assert.throws(() => checkWrite(ROLES.tester.policy, root, 'src/x.js'), /may not write files/);
  assert.deepEqual(findWriteViolations(coder, ['src/a.js', 'test/b.test.js', 'src/deep/c.js', 'README.md']), ['test/b.test.js', 'README.md']);
  assert.ok(isSecretPath('.env') && isSecretPath('config/id_rsa') && isSecretPath('server.pem') && !isSecretPath('.env.example'));
});

test('policy: exec allow-list is exact', () => {
  const tester = ROLES.tester.policy;
  assert.doesNotThrow(() => checkExec(tester, 'node', ['--test', 'x']));
  assert.throws(() => checkExec(tester, 'node', ['-e', 'process.exit()']), /may not run/);
  assert.throws(() => checkExec(tester, 'bash', ['-c', 'ls']), /may not run/);
  assert.throws(() => checkExec(ROLES.coder.policy, 'node', ['--test']), /lacks capability/);
  assert.throws(() => checkExec(tester, 'git', ['status']), /lacks capability git/);
});

test('exec: environment is scrubbed of credentials and timeouts kill the process', async () => {
  const env = buildEnv(['CLAUDE_*'], { PATH: '/bin', HOME: '/h', GH_TOKEN: 'x', AWS_SECRET_ACCESS_KEY: 'y', CLAUDE_X: 'ok', OPENAI_API_KEY: 'z', RANDOM: 'r' });
  assert.deepEqual(Object.keys(env).sort(), ['CLAUDE_X', 'FORCE_COLOR', 'HOME', 'NO_COLOR', 'PATH']);

  const policy: RolePolicy = { role: 't', capabilities: ['exec'], writePaths: [], exec: [{ cmd: 'node', argsPrefix: ['-e'] }], envPassthrough: [] };
  process.env.GH_TOKEN = 'should-not-leak';
  const res = await runControlled({ policy, cwd: tempHome(), cmd: 'node', args: ['-e', 'console.log(JSON.stringify(Object.keys(process.env)))'] });
  delete process.env.GH_TOKEN;
  assert.equal(res.code, 0);
  assert.ok(!JSON.parse(res.stdout).includes('GH_TOKEN'));

  const slow = await runControlled({ policy, cwd: tempHome(), cmd: 'node', args: ['-e', 'setTimeout(() => {}, 60000)'], timeoutMs: 300 });
  assert.equal(slow.timedOut, true);
  assert.ok(slow.durationMs < 5000);
  // Shell metacharacters are inert: there is no shell.
  const meta = await runControlled({ policy, cwd: tempHome(), cmd: 'node', args: ['-e', 'console.log(process.argv[1])', '; echo pwned'] });
  assert.equal(meta.stdout.trim(), '; echo pwned');
});

test('budget: per-run, per-mission and daily limits', () => {
  const cfg = testConfig({ perRunBudgetUsd: 1, dailyBudgetUsd: 5 });
  const mission = { id: 'msn_a', budgetUsd: 2 } as Mission;
  const at = new Date().toISOString();
  assert.deepEqual([checkBudget(cfg, mission, []).ok, checkBudget(cfg, mission, []).allowedUsd], [true, 1]);
  const spent = [{ id: 'l1', missionId: 'msn_a', role: 'coder' as const, usd: 1.7, source: 't', at }];
  assert.equal(checkBudget(cfg, mission, spent).allowedUsd, 0.3);
  assert.equal(checkBudget(cfg, mission, [{ ...spent[0], usd: 2 }]).ok, false);
  const otherMissions = [{ id: 'l2', missionId: 'msn_b', role: 'coder' as const, usd: 4.99, source: 't', at }];
  assert.match(checkBudget(cfg, mission, otherMissions).reason ?? '', /Daily budget/);
});

test('queue: FIFO claim only for running missions, crash recovery re-queues', () => {
  const store = new Store(tempHome());
  store.mutate((d) => {
    d.missions.push({ id: 'm1', state: 'running' } as Mission, { id: 'm2', state: 'blocked' } as Mission);
    enqueue(d, 'm2', 'product');
    enqueue(d, 'm1', 'product');
    enqueue(d, 'm1', 'architect');
  });
  const first = store.mutate((d) => claimNext(d));
  assert.equal(first?.missionId, 'm1');
  assert.equal(first?.role, 'product');
  const { requeued } = store.mutate((d) => recoverInterrupted(d));
  assert.equal(requeued.length, 1);
  assert.equal(store.read((d) => d.tasks.find((t) => t.id === first!.id)!.state), 'queued');
});

test('store: failed mutation writes nothing', () => {
  const store = new Store(tempHome());
  assert.throws(() => store.mutate((d) => {
    d.ledger.push({ id: 'x', missionId: 'm', role: 'coder', usd: 1, source: 's', at: '' });
    throw new Error('boom');
  }));
  assert.equal(store.read((d) => d.ledger.length), 0);
  assert.equal(new Store(path.dirname(store.file)).read((d) => d.ledger.length), 0);
});

test('spec validation normalises and rejects bad specs', () => {
  const ok = validateSpec({ title: 'X', slug: 'Ärlig App!', summary: 's', requirements: ['r'], acceptanceCriteria: [{ id: 'ac1', text: 't' }], module: { path: '../evil.js', exports: [{ name: 'f', signature: '()', description: 'd' }] }, outOfScope: [] });
  assert.equal(ok.slug, 'arlig-app');
  assert.equal(ok.module.path, 'src/index.js', 'module path is fixed by OMEGA');
  assert.equal(ok.acceptanceCriteria[0].id, 'AC1');
  assert.throws(() => validateSpec({ ...ok, acceptanceCriteria: [] }), /1–12/);
  assert.throws(() => validateSpec({ ...ok, acceptanceCriteria: [{ id: 'X', text: 't' }] }), /AC1/);
  assert.throws(() => validateSpec({ ...ok, module: { path: 'src/index.js', exports: [{ name: 'a-b', signature: '', description: '' }] } }), /identifier|non-empty/);
});

test('TAP parsing extracts counts and test names', () => {
  const tap = 'TAP version 13\n# Subtest: AC1: adds\nok 1 - AC1: adds\n  ---\n  ...\nnot ok 2 - AC2: subtracts # TODO\n1..2\n# tests 2\n# pass 1\n# fail 1\n# duration_ms 12.5\n';
  const r = parseTap(tap);
  assert.deepEqual([r.tests, r.pass, r.fail, r.durationMs], [2, 1, 1, 12.5]);
  assert.deepEqual(r.results, [{ ok: true, name: 'AC1: adds' }, { ok: false, name: 'AC2: subtracts' }]);
});

test('security scan flags secrets, eval, child_process and install scripts', () => {
  const root = tempHome('omega-scan-');
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'index.js'), "const k = 'AKIAABCDEFGHIJKLMNOP';\neval('1');\nimport cp from 'node:child_process';\n");
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { postinstall: 'curl x | sh' }, dependencies: { leftpad: '1' } }));
  fs.writeFileSync(path.join(root, '.env'), 'X=1');
  const rules = scanProject(root).findings.map((f) => f.rule).sort();
  for (const r of ['secret.aws-key', 'code.eval', 'code.child-process', 'deps.install-script', 'deps.declared', 'file.secret-name']) assert.ok(rules.includes(r), r);
});
