// Plans, free-tier limits and Stripe webhooks (Payment Links, no Stripe SDK needed).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { monthKey } from './store.mjs';

export const PRICES = {
  monthly: { label: '$2.99 / month', env: 'STRIPE_LINK_MONTHLY' },
  yearly: { label: '$19.99 / year', env: 'STRIPE_LINK_YEARLY' },
  lifetime: { label: '$39 once — yours forever', env: 'STRIPE_LINK_LIFETIME' },
};

export const freeAiLimit = (h) => Number(process.env.FREE_AI_IMPORTS ?? 20) + (h?.bonusAiImports ?? 0);
export const isPro = (h) => h.billing.plan === 'pro';

export function aiImportsLeft(h) {
  if (isPro(h)) return Infinity;
  return Math.max(0, freeAiLimit(h) - (h.usage[monthKey()] ?? 0));
}

export function recordAiImport(h) {
  const k = monthKey();
  h.usage[k] = (h.usage[k] ?? 0) + 1;
}

export function checkoutLinks(householdId) {
  const out = {};
  for (const [key, p] of Object.entries(PRICES)) {
    const link = process.env[p.env];
    out[key] = { label: p.label, url: link ? `${link}${link.includes('?') ? '&' : '?'}client_reference_id=${encodeURIComponent(householdId)}` : null };
  }
  return out;
}

// Stripe-Signature: t=timestamp,v1=hex[,v1=hex]
export function verifyStripeSignature(rawBody, header, secret, toleranceSec = 300, now = Date.now()) {
  if (!header || !secret) return false;
  let t = null; const sigs = [];
  for (const kv of header.split(',')) {
    const [k, v] = kv.split('=');
    if (k === 't') t = Number(v);
    if (k === 'v1' && v) sigs.push(v);
  }
  if (!t || !sigs.length || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  return sigs.some((s) => {
    const got = Buffer.from(s, 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

// Applies a verified Stripe event to the store. Returns a short description for logs.
export function applyStripeEvent(store, event) {
  const d = store.data;
  if (d.processedEvents[event.id]) return 'duplicate';
  d.processedEvents[event.id] = Date.now();
  const obj = event.data?.object ?? {};

  if (event.type === 'checkout.session.completed') {
    const h = Object.hasOwn(d.households, String(obj.client_reference_id)) ? d.households[obj.client_reference_id] : null;
    if (!h) return 'unknown household';
    const lifetime = obj.mode === 'payment';
    h.billing = { ...h.billing, plan: 'pro', interval: lifetime ? 'lifetime' : 'subscription', stripeCustomerId: obj.customer ?? h.billing.stripeCustomerId, subscriptionId: obj.subscription ?? null, since: new Date().toISOString() };
    if (obj.customer) d.stripeCustomers[obj.customer] = h.id;
    return `pro:${h.id}`;
  }

  if (event.type === 'customer.subscription.deleted' || (event.type === 'customer.subscription.updated' && ['canceled', 'unpaid', 'incomplete_expired'].includes(obj.status))) {
    const h = d.households[d.stripeCustomers[obj.customer]];
    if (!h || h.billing.interval === 'lifetime') return 'ignored';
    if (h.billing.subscriptionId && obj.id && h.billing.subscriptionId !== obj.id) return 'other subscription';
    h.billing = { ...h.billing, plan: 'free', interval: null, subscriptionId: null };
    return `free:${h.id}`;
  }
  return 'ignored';
}
