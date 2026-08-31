// Captures the form's error state after a failed submit — the behaviour that
// only appears via the `invalid` event, never via `submit`.
import { chromium } from 'playwright';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const prev = path.join(here, '..', 'preview');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const c = await b.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
const p = await c.newPage();
await p.goto('file://' + path.join(prev, 'product-one-night.html'));
await p.click('button[type="submit"]');
await p.waitForFunction(() => document.activeElement?.name === 'properties[Artist]', null, { timeout: 2000 }).catch(() => {});
// Wait for the smooth scroll to actually stop. Screenshotting mid-scroll
// captures regions the compositor has not painted yet, which show up as bands
// of body background and look like a layout bug.
await p.waitForFunction(() => {
  const y = window.scrollY;
  if (window.__lastY === y) return true;
  window.__lastY = y;
  return false;
}, null, { polling: 120, timeout: 5000 }).catch(() => {});
await p.waitForTimeout(150);
await p.screenshot({ path: path.join(prev, 'screens', 'form-04-errors.png') });
console.log('captured form-04-errors');
await b.close();
