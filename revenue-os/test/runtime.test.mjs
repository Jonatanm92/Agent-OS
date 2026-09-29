import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildDefaultState } from '../company.mjs';
import { nextRunnableTask, taskBlockReason } from '../core.mjs';

test('selector excludes parked, killed, blocked and unverified dependent work', () => {
  const state = buildDefaultState();
  const first = nextRunnableTask(state);
  state.missions[0].status = 'parked';
  assert.equal(nextRunnableTask(state), null);
  state.missions[0].status = 'active';
  state.missions[0].stage = 'killed';
  assert.equal(nextRunnableTask(state), null);
  state.missions[0].stage = 'presell';
  first.dependsOn = ['task-offer-redteam'];
  assert.match(taskBlockReason(state, first), /dependency/);
  first.dependsOn = ['missing'];
  assert.match(taskBlockReason(state, first), /dependency/);
  first.dependsOn = [];
  first.blockedBy = 'Source documents are missing';
  assert.notEqual(nextRunnableTask(state).id, first.id);
});

test('failed work retries only after backoff and stops at the attempt cap', () => {
  const state = buildDefaultState();
  const task = nextRunnableTask(state);
  task.status = 'failed';
  assert.match(taskBlockReason(state, task), /review/);
  Object.assign(task, { retryable: true, nextAttemptAt: new Date(2000).toISOString(), attemptCount: 1 });
  assert.match(taskBlockReason(state, task, 1000), /not due/);
  assert.equal(taskBlockReason(state, task, 2000), '');
  task.attemptCount = 3;
  assert.match(taskBlockReason(state, task, 2000), /exhausted/);
});

test('HTTP execution, persistence and QA contract', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revenue-runtime-test-'));
  let replyStatus = 200;
  let replyBody = { reply: 'Draft based on supplied inputs; no external action performed.', model: 'fixture-model' };
  let received = [];
  let release;
  const provider = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    received.push(JSON.parse(raw));
    if (release === 'hold') await new Promise((resolve) => { release = resolve; });
    res.writeHead(replyStatus, { 'content-type': 'application/json' });
    res.end(JSON.stringify(replyBody));
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  process.env.REVENUE_OS_DATA_DIR = dataDir;
  process.env.AGENT_OS_URL = `http://127.0.0.1:${provider.address().port}`;
  process.env.REVENUE_OS_TOKEN = 'test-only-access-token';
  const runtime = await import('../runtime.mjs');
  const { server } = await import('../server.mjs');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const state = runtime.getState();
  state.automation.enabled = false;
  const base = { ...nextRunnableTask(state) };
  function resetTask(id = 'test-task') {
    state.tasks = [{ ...base, id, status: 'queued', attemptCount: 0, dependsOn: [], blockedBy: '' }];
    state.audit = [];
    state.runBudget = { date: '', attempts: 0 };
    state.automation.dailyRunLimit = 4;
    runtime.saveState();
    return state.tasks[0];
  }
  async function patch(id, body) {
    return fetch(`${url}/api/tasks/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-revenue-os-token': 'test-only-access-token' }, body: JSON.stringify(body) });
  }
  t.after(async () => {
    await Promise.all([new Promise((r) => server.close(r)), new Promise((r) => provider.close(r))]);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  await t.test('unauthenticated writes do not run a task', async () => {
    const count = received.length;
    const response = await fetch(`${url}/api/tasks/run-next`, { method: 'POST' });
    assert.equal(response.status, 401);
    assert.equal(received.length, count);
  });

  await t.test('AI output requires QA and verified dependency output reaches the next task', async () => {
    const task = resetTask();
    const result = await runtime.runTask(task.id);
    assert.equal(result.status, 'review');
    assert.equal(result.completedAt, undefined);
    assert.equal((await patch(task.id, { status: 'done' })).status, 400);
    assert.equal((await patch(task.id, { status: 'done', reviewNote: 'Checked the fixture response against the supplied acceptance criteria.' })).status, 200);
    const child = { ...base, id: 'dependent', status: 'queued', dependsOn: [task.id] };
    state.tasks.push(child);
    await runtime.runTask(child.id);
    assert.match(received.at(-1).message, /Draft based on supplied inputs/);
    assert.equal(received.at(-1).agentic, false);
  });

  await t.test('reservation persists before network completion and overlap is rejected', async () => {
    const task = resetTask();
    state.tasks.push({ ...base, id: 'second' });
    release = 'hold';
    const pending = runtime.runTask(task.id);
    assert.equal(JSON.parse(fs.readFileSync(runtime.STATE_PATH, 'utf8')).runBudget.attempts, 1);
    await assert.rejects(runtime.runTask('second'), /already running/);
    assert.equal((await patch(task.id, { status: 'done', reviewNote: 'premature' })).status, 409);
    assert.throws(() => runtime.resetState(), /during execution/);
    while (typeof release !== 'function') await new Promise((resolve) => setImmediate(resolve));
    release();
    await pending;
    release = null;
  });

  await t.test('transient HTTP failures back off and failed attempts consume daily budget', async () => {
    const task = resetTask();
    replyStatus = 503;
    replyBody = { error: 'temporarily unavailable' };
    await assert.rejects(runtime.runTask(task.id), /503/);
    assert.equal(task.retryable, true);
    assert.equal(runtime.enrichState().runtime.attemptsToday, 1);
    await assert.rejects(runtime.runTask(task.id), /not due/);
    state.automation.dailyRunLimit = 1;
    task.nextAttemptAt = new Date(0).toISOString();
    await assert.rejects(runtime.runTask(task.id), /daily/);
  });

  await t.test('credit and auth errors stop instead of repeatedly calling the provider', async () => {
    for (const [status, error] of [[429, 'credit_balance_exhausted'], [401, 'invalid credentials']]) {
      const task = resetTask();
      replyStatus = status;
      replyBody = { error };
      await assert.rejects(runtime.runTask(task.id));
      assert.equal(task.retryable, false);
      const count = received.length;
      await assert.rejects(runtime.runTask(task.id), /review/);
      assert.equal(received.length, count);
      assert.equal((await patch(task.id, { status: 'queued' })).status, 400);
      assert.equal((await patch(task.id, { status: 'queued', reviewNote: 'Configuration fixed; retry explicitly requested.' })).status, 200);
    }
  });

  await t.test('paused missions cannot run through run-next or explicit task endpoint', async () => {
    resetTask();
    state.missions[0].status = 'parked';
    const count = received.length;
    for (const route of ['/api/tasks/run-next', '/api/tasks/test-task/run']) {
      const response = await fetch(`${url}${route}`, { method: 'POST', headers: { 'x-revenue-os-token': 'test-only-access-token' } });
      assert.equal(response.status, 409);
    }
    assert.equal(received.length, count);
    state.missions[0].status = 'active';
  });

  await t.test('restart quarantines interrupted work and retains the attempt reservation', () => {
    const task = resetTask();
    task.status = 'running';
    state.runBudget = { date: new Date().toISOString().slice(0, 10), attempts: 2 };
    runtime.saveState();
    execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(new URL('../runtime.mjs', import.meta.url).href)})`], { env: process.env });
    const persisted = JSON.parse(fs.readFileSync(runtime.STATE_PATH, 'utf8'));
    assert.equal(persisted.tasks[0].status, 'blocked');
    assert.match(persisted.tasks[0].blockedBy, /interrupted/);
    assert.equal(persisted.runBudget.attempts, 2);
  });
});
