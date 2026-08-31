import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateFollowUpDate,
  classifyService,
  findMissingFields,
  prepareWorkflow,
} from '../src/workflow.mjs';

const fixedNow = '2026-08-19T12:00:00.000Z';

test('classifies an acute water leak as VVS and keeps external actions blocked', () => {
  const result = prepareWorkflow(
    {
      contactName: 'Demo AB',
      contactChannel: 'demo@example.invalid',
      location: 'Göteborg',
      propertyType: 'Butik',
      subject: 'Akut läcka',
      description: 'Vatten forsar från ett rör och det är akut.',
    },
    fixedNow,
  );

  assert.equal(result.classification.category, 'VVS');
  assert.equal(result.urgency.level, 'AKUT');
  assert.equal(result.approval.required, true);
  assert.equal(result.approval.externalActionAllowed, false);
  assert.equal(result.approval.status, 'AWAITING_HUMAN_APPROVAL');
});

test('classifies an electrical inquiry and exposes source fields and confidence', () => {
  const classification = classifyService({
    subject: 'Laddbox och el',
    description: 'Vi behöver installera laddboxar och kontrollera huvudsäkring.',
  });
  assert.equal(classification.category, 'El');
  assert.ok(classification.confidence >= 0.6);
  assert.deepEqual(classification.sourceFields, ['subject', 'description']);
});

test('lists missing common and category-specific fields without inventing values', () => {
  const missing = findMissingFields(
    { subject: 'Värmepump', description: 'Ingen värme', contactName: 'Demo' },
    'Värmepump',
  );
  assert.deepEqual(
    missing.map((item) => item.key),
    ['contactChannel', 'location', 'propertyType', 'currentSystem'],
  );
});

test('uses deterministic business-day follow-up dates', () => {
  assert.equal(calculateFollowUpDate('2026-08-21T12:00:00.000Z', 'NORMAL'), '2026-08-25T12:00:00.000Z');
  assert.equal(calculateFollowUpDate(fixedNow, 'HÖG'), '2026-08-20T12:00:00.000Z');
  assert.equal(calculateFollowUpDate(fixedNow, 'AKUT'), fixedNow);
});

test('creates a complete transition log with a non-retryable approval gate', () => {
  const result = prepareWorkflow(
    {
      contactName: 'Demo AB',
      contactChannel: 'demo@example.invalid',
      location: 'Borås',
      propertyType: 'Kontor',
      subject: 'Ventilation',
      description: 'Dåligt luftflöde från ventilationen.',
    },
    fixedNow,
  );
  assert.deepEqual(
    result.log.map((event) => event.state),
    [
      'RECEIVED',
      'CLASSIFIED',
      'INFORMATION_CHECKED',
      'DRAFT_CREATED',
      'INTERNAL_TASK_CREATED',
      'APPROVAL_REQUIRED',
      'FOLLOW_UP_SCHEDULED',
    ],
  );
  assert.equal(result.log.find((event) => event.state === 'APPROVAL_REQUIRED').retryable, false);
});

test('rejects non-object input', () => {
  assert.throws(() => prepareWorkflow(null, fixedNow), /inquiry must be an object/);
});
