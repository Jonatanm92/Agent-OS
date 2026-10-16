import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderSite, slugify, normalizePhone, validateLead, loadLeads, safeUrl } from '../demo-site/generate.mjs';

const base = { name: 'Hår & Skägg', category: 'frisor', city: 'Vänersborg', phone: '0521-123 45' };

test('slugify folds Swedish letters and punctuation', () => {
  assert.equal(slugify('Hår & Skägg Vänersborg'), 'har-skagg-vanersborg');
  assert.equal(slugify('Café Öst!'), 'cafe-ost');
  assert.equal(slugify('   '), 'foretag');
});

test('normalizePhone turns Swedish numbers into tel: format', () => {
  assert.equal(normalizePhone('0521-123 45'), '+4652112345');
  assert.equal(normalizePhone('+46 70 123 45 67'), '+46701234567');
  assert.equal(normalizePhone('0046 70 123'), '+4670123');
  assert.equal(normalizePhone(''), '');
});

test('renderSite escapes every field', () => {
  const html = renderSite({ ...base, name: '<script>alert(1)</script>', about: '"><img src=x onerror=alert(1)>' });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('demo mode shows the proposal banner and blocks indexing', () => {
  const html = renderSite(base);
  assert.match(html, /Förslag till Hår &amp; Skägg/);
  assert.match(html, /noindex/);
  assert.match(html, /href="tel:\+4652112345"/);
  assert.match(html, /Tjänsterna är exempel/);
});

test('live mode drops the banner and noindex', () => {
  const html = renderSite({ ...base, services: ['Klippning'] }, { live: true });
  assert.doesNotMatch(html, /Förslag till/);
  assert.doesNotMatch(html, /noindex/);
  assert.match(html, /Klippning/);
});

test('unsafe links are dropped', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('http://example.com'), '');
  assert.equal(safeUrl('https://example.com/boka'), 'https://example.com/boka');
  const html = renderSite({ ...base, facebook: 'javascript:alert(1)' });
  assert.doesNotMatch(html, /javascript:/);
});

test('validateLead reports missing name, contact and unknown category', () => {
  assert.deepEqual(validateLead(base), []);
  const problems = validateLead({ category: 'rymdskepp' });
  assert.equal(problems.length, 3);
  assert.throws(() => renderSite({ name: 'Utan kontakt' }), /phone eller email/);
});

test('the example lead file renders', () => {
  const leads = loadLeads(readFileSync(new URL('../demo-site/leads.example.json', import.meta.url), 'utf8'));
  assert.equal(leads.length, 2);
  for (const lead of leads) assert.match(renderSite(lead), /<!doctype html>/);
});
