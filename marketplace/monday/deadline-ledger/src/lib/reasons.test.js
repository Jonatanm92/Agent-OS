import test from 'node:test';
import assert from 'node:assert/strict';

import { createReasonEntry } from './reasons.js';

test('creates first audit reason revision', () => {
  const entry = createReasonEntry({}, {
    reason: ' Client moved approval ',
    category: 'Client',
    userId: '7',
    now: '2026-08-27T18:00:00.000Z',
  });
  assert.equal(entry.reason, 'Client moved approval');
  assert.equal(entry.createdBy, '7');
  assert.equal(entry.updatedBy, '7');
  assert.equal(entry.createdAt, '2026-08-27T18:00:00.000Z');
  assert.equal(entry.updatedAt, '2026-08-27T18:00:00.000Z');
  assert.equal(entry.revision, 1);
});

test('preserves creator and increments current revision on edit', () => {
  const entry = createReasonEntry({
    reason: 'First',
    category: 'Client',
    createdBy: '7',
    createdAt: '2026-08-27T18:00:00.000Z',
    updatedBy: '7',
    updatedAt: '2026-08-27T18:00:00.000Z',
    revision: 4,
  }, {
    reason: 'Corrected reason',
    category: 'Scope',
    userId: '8',
    now: '2026-08-27T19:00:00.000Z',
  });
  assert.equal(entry.createdBy, '7');
  assert.equal(entry.createdAt, '2026-08-27T18:00:00.000Z');
  assert.equal(entry.updatedBy, '8');
  assert.equal(entry.updatedAt, '2026-08-27T19:00:00.000Z');
  assert.equal(entry.revision, 5);
});

test('migrates legacy recorded metadata without losing it', () => {
  const entry = createReasonEntry({
    reason: 'Legacy',
    recordedBy: '9',
    recordedAt: '2026-08-25T09:00:00.000Z',
  }, {
    reason: 'Legacy corrected',
    userId: '10',
    now: '2026-08-27T20:00:00.000Z',
  });
  assert.equal(entry.createdBy, '9');
  assert.equal(entry.createdAt, '2026-08-25T09:00:00.000Z');
  assert.equal(entry.updatedBy, '10');
  assert.equal(entry.revision, 2);
});
