import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildClaudeArgs, parseClaudeOutput } from '../src/adapters/claude-code.ts';
import { Omega } from '../src/engine/orchestrator.ts';
import { ROLES } from '../src/roles/registry.ts';
import { tempHome, testConfig, writeFakeClaude } from './helpers.ts';

/*
 * These tests drive the REAL Claude Code adapter (argument building, spawning without a
 * shell, scrubbed env, JSON parsing, cost ledger, write-scope enforcement, fix loop)
 * against a FAKE `claude` executable, so they cost nothing and are deterministic.
 * They prove OMEGA's control logic — not model quality. The real model run is
 * documented separately in docs/evidence/.
 */
const FAKE = String.raw`
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const mode = JSON.parse(fs.readFileSync(path.join(here, 'mode.json'), 'utf8'));
const args = process.argv.slice(2);
const sys = args[args.indexOf('--append-system-prompt') + 1] || '';
const prompt = fs.readFileSync(0, 'utf8');
fs.appendFileSync(path.join(here, 'calls.log'), JSON.stringify({ args, cwd: process.cwd(), envKeys: Object.keys(process.env), prompt }) + '\n');
const out = (o) => console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, num_turns: 3, session_id: 'fake', permission_denials: [], total_cost_usd: 0.02, result: 'done', ...o }));
const w = (rel, text) => { fs.mkdirSync(path.dirname(rel), { recursive: true }); fs.writeFileSync(rel, text); };
if (sys.includes('Product Lead')) {
  out({ structured_output: { title: 'Adderare', slug: 'adder', summary: 'Adds numbers', requirements: ['add'], acceptanceCriteria: [{ id: 'AC1', text: 'add(2,3) is 5' }, { id: 'AC2', text: 'add rejects strings' }], module: { path: 'src/index.js', exports: [{ name: 'add', signature: '(a,b)=>number', description: 'sum' }] }, outOfScope: [] } });
} else if (sys.includes('Test Author')) {
  w('test/acceptance.test.js', "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from '../src/index.js';\ntest('AC1: adds', () => assert.equal(add(2, 3), 5));\ntest('AC2: rejects strings', () => assert.throws(() => add('2', 3), TypeError));\n");
  if (mode.testAuthorEscapes) w('src/backdoor.js', 'export const x = 1;\n');
  out({ result: 'wrote tests' });
} else if (sys.includes('Coder')) {
  const fix = prompt.includes('fix iteration');
  const good = "export function add(a, b) {\n  if (typeof a !== 'number' || typeof b !== 'number') throw new TypeError('numbers only');\n  return a + b;\n}\n";
  w('src/index.js', mode.buggyFirst && !fix ? 'export const add = (a, b) => a - b;\n' : good);
  out({ result: fix ? 'fixed the subtraction bug' : 'implemented add', total_cost_usd: mode.coderCost ?? 0.02 });
}
`;

// The fake CLI runs as `node fake-claude.mjs` (claudeArgs), so this also works on Windows.
const ANY_OS = {};

function setup(mode: Record<string, unknown>, cfgOverrides = {}) {
  const binDir = tempHome('omega-fakebin-');
  fs.writeFileSync(path.join(binDir, 'mode.json'), JSON.stringify(mode));
  const bin = writeFakeClaude(binDir, FAKE);
  const omega = new Omega(testConfig({ claudeBin: process.execPath, claudeArgs: [bin], ...cfgOverrides }));
  const calls = () => fs.readFileSync(path.join(binDir, 'calls.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { omega, calls };
}

test('claude args: locked-down permission mode, tools, path-scoped write rules, budget cap', () => {
  const args = buildClaudeArgs({ policy: ROLES.coder.policy, systemAppend: 'S', model: 'claude-opus-5-5', maxBudgetUsd: 1.234, maxTurns: 30 });
  const at = (flag: string) => args[args.indexOf(flag) + 1];
  assert.equal(at('--permission-mode'), 'dontAsk');
  assert.equal(at('--tools'), 'Read,Glob,Grep,Write,Edit');
  assert.equal(at('--max-budget-usd'), '1.23');
  assert.ok(args.includes('--strict-mcp-config') && args.includes('--no-session-persistence'));
  assert.equal(at('--setting-sources'), 'project', 'user-level settings cannot widen permissions');
  assert.deepEqual(args.slice(args.indexOf('--allowedTools') + 1), ['Edit(src/**)', 'Write(src/**)']);
  const product = buildClaudeArgs({ policy: ROLES.product.policy, systemAppend: 'S', model: 'm', maxBudgetUsd: 1, maxTurns: 4, jsonSchema: { type: 'object' } });
  assert.equal(product[product.indexOf('--tools') + 1], '', 'product role gets no tools at all');
  assert.ok(!product.includes('--allowedTools'));
  assert.ok(!args.some((a) => /bypassPermissions|dangerously/i.test(a)));
});

test('claude output parsing tolerates warnings before the JSON line', () => {
  const p = parseClaudeOutput('some warning\n{"subtype":"success","is_error":false,"total_cost_usd":0.5,"result":"hi","num_turns":2}');
  assert.equal(p.parsed, true);
  assert.equal(p.ok, true);
  assert.equal(p.costUsd, 0.5);
  assert.equal(parseClaudeOutput('not json').parsed, false);
});

test('claude-code mission (fake CLI): spend gate blocks until a human approves', ANY_OS, async () => {
  const { omega } = setup({});
  const m = await omega.createMission({ idea: 'En funktion som adderar två tal', engine: 'claude-code', budgetUsd: 1 });
  assert.equal(m.state, 'blocked');
  assert.equal(await omega.runUntilIdle(), 0, 'nothing runs before approval');
  const gate = omega.listApprovals('pending').find((a) => a.kind === 'spend_gate')!;
  await omega.decideApproval(gate.id, 'reject', 'test', 'too expensive');
  assert.equal(omega.getMission(m.id).state, 'cancelled');
});

test('claude-code mission (fake CLI): failing tests trigger one fix iteration, then pass; cost is ledgered', ANY_OS, async () => {
  process.env.GH_TOKEN = 'must-not-reach-agents';
  const { omega, calls } = setup({ buggyFirst: true });
  const m = await omega.createMission({ idea: 'En funktion som adderar två tal', engine: 'claude-code', budgetUsd: 1 });
  const gate = omega.listApprovals('pending').find((a) => a.missionId === m.id)!;
  await omega.decideApproval(gate.id, 'approve', 'test');
  await omega.runUntilIdle();
  delete process.env.GH_TOKEN;

  const done = omega.getMission(m.id);
  assert.equal(done.state, 'awaiting_review', done.error);
  assert.deepEqual(done.stages.map((s) => `${s.role}#${s.iteration}:${s.state}`), [
    'product#1:succeeded', 'architect#1:succeeded', 'test-author#1:succeeded', 'coder#1:succeeded',
    'tester#1:failed', 'coder#2:succeeded', 'tester#2:succeeded', 'security#2:succeeded', 'docs#2:succeeded',
  ]);
  assert.equal(done.fixIterations, 1);
  assert.equal(done.tests?.ok, true);
  assert.equal(Math.round(done.spentUsd * 100) / 100, 0.08, 'four agent runs × $0.02 from the CLI report');

  const log = calls();
  assert.equal(log.length, 4);
  for (const c of log) {
    assert.ok(!c.envKeys.includes('GH_TOKEN'), 'GitHub token never reaches an agent');
    assert.equal(c.cwd, fs.realpathSync(done.projectDir));
  }
  assert.match(log[3].prompt, /fix iteration 1/);
  assert.match(log[3].prompt, /not ok/, 'the fix prompt carries the real failing TAP output');
  const transcript = JSON.parse(omega.readArtifact(m.id, 'agent-coder-fix-1.json'));
  assert.equal(transcript.result.costUsd, 0.02);
  assert.equal((await omega.verifyEvidence(m.id)).ok, true);
});

test('claude-code mission (fake CLI): an agent writing outside its scope is reverted and the mission fails', ANY_OS, async () => {
  const { omega } = setup({ testAuthorEscapes: true });
  const m = await omega.createMission({ idea: 'En funktion som adderar två tal', engine: 'claude-code', budgetUsd: 1 });
  await omega.decideApproval(omega.listApprovals('pending')[0].id, 'approve', 'test');
  await omega.runUntilIdle();
  const after = omega.getMission(m.id);
  assert.equal(after.state, 'failed');
  assert.match(after.error ?? '', /wrote outside its allowed paths: src\/backdoor\.js/);
  assert.equal(fs.existsSync(path.join(after.projectDir, 'src', 'backdoor.js')), false, 'out-of-scope file reverted');
  assert.ok(omega.audit.list({ missionId: m.id }).some((e) => e.type === 'policy.violation'));
});

test('claude-code mission (fake CLI): budget exhaustion stops the mission before the next paid run', ANY_OS, async () => {
  const { omega, calls } = setup({ coderCost: 5 }, { perRunBudgetUsd: 1 });
  const m = await omega.createMission({ idea: 'En funktion som adderar två tal', engine: 'claude-code', budgetUsd: 0.08 });
  await omega.decideApproval(omega.listApprovals('pending')[0].id, 'approve', 'test');
  await omega.runUntilIdle();
  const after = omega.getMission(m.id);
  // product ($0.02) + test-author ($0.02) leave $0.04 < the $0.05 minimum → coder is blocked.
  assert.equal(after.state, 'failed');
  assert.match(after.error ?? '', /budget exhausted/i);
  assert.equal(calls().length, 2);
  assert.ok(omega.audit.list({ missionId: m.id }).some((e) => e.type === 'budget.blocked'));
});
