import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activityTimestampToDate,
  buildDeadlineChanges,
  filterChanges,
  parseDeadlineChange,
  summarizeChanges,
} from './activity.js';

const dateLog = (id, itemId, previous, next, createdAt = '17138974420245986') => ({
  id,
  event: 'update_column_value',
  user_id: '42',
  created_at: createdAt,
  data: JSON.stringify({
    board_id: 1,
    pulse_id: itemId,
    pulse_name: `Project ${itemId}`,
    column_id: 'due_date',
    column_type: 'date',
    column_title: 'Due date',
    previous_value: previous ? { date: previous } : null,
    value: next ? { date: next } : null,
  }),
});

test('converts monday 17-digit activity timestamps', () => {
  const value = activityTimestampToDate('17138974420245986');
  assert.equal(value instanceof Date, true);
  assert.equal(Number.isNaN(value.getTime()), false);
});

test('parses date-column old and new values', () => {
  const change = parseDeadlineChange(dateLog('a', '100', '2026-08-25', '2026-08-28'));
  assert.equal(change.itemId, '100');
  assert.equal(change.previousValue, '2026-08-25');
  assert.equal(change.nextValue, '2026-08-28');
});

test('parses live monday timerange payload as timeline', () => {
  const change = parseDeadlineChange({
    id: 'timeline-live',
    event: 'update_column_value',
    user_id: '114335000',
    created_at: '17876535066675384',
    data: JSON.stringify({
      board_id: 5102872380,
      pulse_id: 3184341309,
      pulse_name: 'Project Alpha',
      column_id: 'timerange_mm6j9vnr',
      column_title: 'Timeline',
      column_type: 'timerange',
      previous_value: { from: '2026-08-25', to: '2026-08-29' },
      value: { from: '2026-08-26', to: '2026-08-30' },
    }),
  });
  assert.equal(change.columnType, 'timeline');
  assert.equal(change.previousValue, '2026-08-25 → 2026-08-29');
  assert.equal(change.nextValue, '2026-08-26 → 2026-08-30');
});

test('ignores non-date column activity', () => {
  const change = parseDeadlineChange({
    id: 'x',
    event: 'update_column_value',
    data: JSON.stringify({ column_type: 'color', column_id: 'status' }),
  });
  assert.equal(change, null);
});

test('counts repeated deadline changes and missing reasons', () => {
  const logs = [
    dateLog('a', '100', '2026-08-25', '2026-08-28', '17138974420245986'),
    dateLog('b', '100', '2026-08-28', '2026-09-01', '17138974430245986'),
    dateLog('c', '200', '2026-08-20', '2026-08-22', '17138974440245986'),
  ];
  const changes = buildDeadlineChanges(logs, {
    b: { reason: 'Client approval moved', category: 'Client' },
  });
  assert.equal(changes.find((c) => c.id === 'b').sequence, 2);
  assert.equal(changes.find((c) => c.id === 'b').needsReason, false);
  assert.equal(summarizeChanges(changes).missingReasons, 2);
  assert.equal(summarizeChanges(changes).impactedItems, 2);
});

test('filters missing reasons and free-text matches', () => {
  const changes = buildDeadlineChanges(
    [dateLog('a', '100', '2026-08-25', '2026-08-28'), dateLog('b', '200', '2026-08-20', '2026-08-22')],
    { b: { reason: 'Supplier slipped', category: 'Dependency' } },
  );
  assert.equal(filterChanges(changes, 'missing').length, 1);
  assert.equal(filterChanges(changes, 'all', 'supplier').length, 1);
});
