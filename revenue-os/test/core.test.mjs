import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateScore,
  computeMetrics,
  countAutomationAttempts,
  createCandidateMission,
  evaluateMission,
  nextRunnableTask,
  REQUIRED_GATES,
} from '../core.mjs';
import { buildDefaultState } from '../company.mjs';

test('seeded release-pack mission is TEST at 80 because proof and payment gates are open', () => {
  const mission = buildDefaultState().missions[0];
  const result = evaluateMission(mission.scoreInput, mission.hardGates, mission.fatalRisks);
  assert.equal(result.score, 80);
  assert.equal(result.decision, 'TEST');
  assert.deepEqual(result.openGates, ['proofReady', 'paymentReady']);
});

test('a mission only reaches GO at 75+ with every required gate closed', () => {
  const mission = buildDefaultState().missions[0];
  const closed = Object.fromEntries(REQUIRED_GATES.map((key) => [key, true]));
  const result = evaluateMission(mission.scoreInput, closed, []);
  assert.equal(result.decision, 'GO');
  assert.equal(result.openGates.length, 0);
});

test('low commercial score is killed deterministically', () => {
  const scoreInput = Object.fromEntries(Object.keys(calculateScore({}).normalized).map((key) => [key, 2]));
  const closed = Object.fromEntries(REQUIRED_GATES.map((key) => [key, true]));
  const result = evaluateMission(scoreInput, closed, []);
  assert.equal(result.score, 40);
  assert.equal(result.decision, 'KILL');
});

test('fatal risk overrides a high score', () => {
  const high = Object.fromEntries(Object.keys(calculateScore({}).normalized).map((key) => [key, 5]));
  const closed = Object.fromEntries(REQUIRED_GATES.map((key) => [key, true]));
  const result = evaluateMission(high, closed, ['Cannot legally deliver the promised output.']);
  assert.equal(result.score, 100);
  assert.equal(result.decision, 'KILL');
});

test('next task selector never chooses human or external work', () => {
  const state = buildDefaultState();
  const task = nextRunnableTask(state);
  assert.equal(task.id, 'task-intake-delivery');
  assert.equal(task.executionMode, 'internal');
  assert.equal(task.status, 'queued');
});

test('revenue metrics count real event types and net refunds', () => {
  const state = buildDefaultState();
  state.events = [
    { id: '1', kind: 'prospect_contacted' },
    { id: '2', kind: 'positive_reply' },
    { id: '3', kind: 'sales_call' },
    { id: '4', kind: 'payment', amountCents: 2900, customerKey: 'buyer-a' },
    { id: '5', kind: 'payment', amountCents: 2900, customerKey: 'buyer-a' },
    { id: '6', kind: 'refund', amountCents: 1000, customerKey: 'buyer-a' },
  ];
  const metrics = computeMetrics(state);
  assert.equal(metrics.grossRevenueCents, 5800);
  assert.equal(metrics.refundsCents, 1000);
  assert.equal(metrics.netRevenueCents, 4800);
  assert.equal(metrics.payingCustomers, 1);
  assert.equal(metrics.prospectsContacted, 1);
  assert.equal(metrics.positiveReplies, 1);
  assert.equal(metrics.salesCalls, 1);
});

test('candidate missions start at evidence stage and cannot bypass hard gates', () => {
  const candidate = createCandidateMission({
    name: 'Specific paid utility',
    buyer: 'A narrowly defined buyer',
    problem: 'A costly recurring workflow problem',
    offer: 'A concrete paid outcome',
    priceCents: 4900,
  });
  assert.equal(candidate.stage, 'evidence');
  assert.equal(candidate.hardGates.buyerIdentified, true);
  assert.equal(candidate.hardGates.noBuildBeforeSale, true);
  assert.equal(candidate.hardGates.proofReady, false);
  assert.equal(candidate.hardGates.paymentReady, false);
});

test('automation daily limit counts failed attempts as well as successful runs', () => {
  const audit = [
    { type: 'automation', status: 'ok', at: '2026-08-21T01:00:00.000Z' },
    { type: 'automation', status: 'error', at: '2026-08-21T02:00:00.000Z' },
    { type: 'task', status: 'error', at: '2026-08-21T03:00:00.000Z' },
    { type: 'automation', status: 'ok', at: '2026-08-20T23:00:00.000Z' },
  ];
  assert.equal(countAutomationAttempts(audit, '2026-08-21'), 2);
});
