// Screenshot the page at a named anchor / selector.
import { chromium } from 'playwright';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const prev = path.join(here, '..', 'preview');
const [file, sel, name, offset] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto('file://' + path.join(prev, file));
await page.evaluate(([s, o]) => {
  const el = document.querySelector(s);
  window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + Number(o || 0));
}, [sel, offset]);
await page.waitForTimeout(150);
await page.screenshot({ path: path.join(prev, 'screens', `${name}.png`) });
console.log('captured', name);
await browser.close();
