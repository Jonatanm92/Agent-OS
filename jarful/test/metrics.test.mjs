import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics } from '../lib/metrics.mjs';
import { Store } from '../lib/store.mjs';

test('computes activation, conversion and import mix', () => {
  const store = new Store('/dev/null');
  const now = Date.parse('2026-09-23T12:00:00Z');
  const a = store.createHousehold('A').household; const b = store.createHousehold('B').household;
  a.createdAt = '2026-09-01T00:00:00Z'; b.createdAt = '2026-09-02T00:00:00Z';
  for (let i = 0; i < 3; i++) a.recipes[`r${i}`] = { createdAt: `2026-09-0${2 + i}T00:00:00Z`, method: i ? 'structured' : 'ai-text' };
  b.recipes.x = { createdAt: '2026-09-20T00:00:00Z', method: 'structured' };
  a.billing.plan = 'pro'; a.billing.interval = 'lifetime';
  const m = computeMetrics(store.data, now);
  assert.equal(m.households.total, 2);
  assert.deepEqual(m.activation, { eligible: 2, activated: 1, rate: 0.5 });
  assert.deepEqual(m.recipes.byMethod, { 'ai-text': 1, structured: 3 });
  assert.equal(m.revenue.lifetime, 1);
  assert.equal(m.revenue.conversionRate, 0.5);
});
