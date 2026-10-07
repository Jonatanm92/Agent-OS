import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, draftMessage } from './site-check.mjs';

const GOOD = `<html><head><title>Frisör Anna – klipp i Göteborg</title>
<meta name="viewport" content="width=device-width"><meta name="description" content="x"></head>
<body><a href="tel:+4631123456">Ring</a><form></form><footer>© 2026 Anna</footer></body></html>`;

test('a healthy page has no findings', () => {
  assert.deepEqual(analyze(GOOD, { finalUrl: 'https://anna.se', year: 2026 }), []);
});

test('flags leftover WordPress content, http, old footer and missing mobile', () => {
  const html = `<html><head><title>Hem</title></head><body><h1>Hello world!</h1>
  <p>Lorem ipsum dolor</p><footer>Copyright 2018</footer></body></html>`;
  const issues = analyze(html, { finalUrl: 'http://x.se', year: 2026 }).map((f) => f.issue).join('\n');
  for (const needle of ['Lorem ipsum', 'Hello world', 'https', 'mobil', '2018', 'Sidtiteln', 'Telefonnumret', 'kontaktformulär']) {
    assert.match(issues, new RegExp(needle));
  }
});

test('copyright ranges use the latest year', () => {
  const html = GOOD.replace('© 2026', '© 2015–2026');
  assert.deepEqual(analyze(html, { finalUrl: 'https://a.se', year: 2026 }), []);
});

test('ignores lorem ipsum inside scripts', () => {
  const html = GOOD.replace('</body>', '<script>var t="lorem ipsum"</script></body>');
  assert.deepEqual(analyze(html, { finalUrl: 'https://a.se', year: 2026 }), []);
});

test('slow pages are flagged', () => {
  const f = analyze(GOOD, { finalUrl: 'https://a.se', ms: 6200, year: 2026 });
  assert.match(f[0].issue, /6\.2 s/);
});

test('message leads with the most severe finding and has no message when clean', () => {
  const f = analyze('<title>Hem</title><p>Lorem ipsum</p>', { finalUrl: 'https://a.se', year: 2026 });
  const msg = draftMessage('Anna', 'https://a.se', f);
  assert.match(msg, /^Hej Anna!/);
  assert.match(msg, /platshållartext/);
  assert.match(msg, /betalar först när du är nöjd/);
  assert.equal(draftMessage('', 'https://a.se', []), null);
});

test('handles unquoted HTML attributes without false alarms', () => {
  const html = '<title>Frisör Anna i Göteborg</title><meta name=viewport content=x><meta name=description content=x><a href=tel:+46>R</a><a href=mailto:a@a.se>M</a>';
  assert.deepEqual(analyze(html, { finalUrl: 'https://a.se', year: 2026 }), []);
});
