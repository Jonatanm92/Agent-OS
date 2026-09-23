import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyStripeSignature, applyStripeEvent, aiImportsLeft, recordAiImport, checkoutLinks } from '../lib/billing.mjs';
import { Store } from '../lib/store.mjs';

const sign = (body, secret, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

test('verifies Stripe signatures and rejects tampering / replay', () => {
  const body = '{"id":"evt_1"}';
  assert.ok(verifyStripeSignature(body, sign(body, 'whsec_x'), 'whsec_x'));
  assert.ok(!verifyStripeSignature(body + ' ', sign(body, 'whsec_x'), 'whsec_x'));
  assert.ok(!verifyStripeSignature(body, sign(body, 'other'), 'whsec_x'));
  assert.ok(!verifyStripeSignature(body, sign(body, 'whsec_x', Math.floor(Date.now() / 1000) - 3600), 'whsec_x'));
  assert.ok(!verifyStripeSignature(body, undefined, 'whsec_x'));
});

test('checkout upgrades, cancellation downgrades, lifetime survives, events are idempotent', () => {
  const store = new Store('/dev/null');
  const { household: h } = store.createHousehold('Test', 'Al');
  process.env.FREE_AI_IMPORTS = '2';
  recordAiImport(h); recordAiImport(h);
  assert.equal(aiImportsLeft(h), 0);

  assert.equal(applyStripeEvent(store, { id: 'evt_a', type: 'checkout.session.completed', data: { object: { client_reference_id: h.id, mode: 'subscription', customer: 'cus_1', subscription: 'sub_1' } } }), `pro:${h.id}`);
  assert.equal(aiImportsLeft(h), Infinity);
  assert.equal(applyStripeEvent(store, { id: 'evt_a', type: 'checkout.session.completed', data: { object: {} } }), 'duplicate');
  applyStripeEvent(store, { id: 'evt_b', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1' } } });
  assert.equal(h.billing.plan, 'free');

  applyStripeEvent(store, { id: 'evt_c', type: 'checkout.session.completed', data: { object: { client_reference_id: h.id, mode: 'payment', customer: 'cus_1' } } });
  applyStripeEvent(store, { id: 'evt_d', type: 'customer.subscription.deleted', data: { object: { id: 'sub_old', customer: 'cus_1' } } });
  assert.equal(h.billing.plan, 'pro');
  assert.equal(h.billing.interval, 'lifetime');
  delete process.env.FREE_AI_IMPORTS;
});

test('checkout links carry the household id', () => {
  process.env.STRIPE_LINK_MONTHLY = 'https://buy.stripe.com/test_abc';
  assert.equal(checkoutLinks('hh1').monthly.url, 'https://buy.stripe.com/test_abc?client_reference_id=hh1');
  assert.equal(checkoutLinks('hh1').lifetime.url, null);
  delete process.env.STRIPE_LINK_MONTHLY;
});

test('referrer bonus is capped', () => {
  const store = new Store('/dev/null');
  const { household: r } = store.createHousehold('R');
  for (let i = 0; i < 15; i++) store.applyReferral(store.createHousehold(`n${i}`).household, r.refCode);
  assert.equal(r.bonusAiImports, 100);
  assert.equal(r.referredCount, 15);
  assert.equal(store.applyReferral(r, r.refCode), false);
});
