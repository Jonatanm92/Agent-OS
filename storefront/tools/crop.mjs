// Captures viewport-sized slices at 390px so the design can be reviewed
// section by section rather than as one very tall strip.
import { chromium } from 'playwright';
import path from 'node:path'; import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const prev = path.join(here, '..', 'preview');
const out = path.join(prev, 'screens'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const file = process.argv[2] || 'product-one-night.html';
await page.goto('file://' + path.join(prev, file));
const total = await page.evaluate(() => document.body.scrollHeight);
const slices = Math.min(Number(process.argv[3] || 6), Math.ceil(total / 780));
for (let i = 0; i < slices; i++) {
  await page.evaluate((y) => window.scrollTo(0, y), i * 780);
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(out, `slice-${file.replace('.html','')}-${i}.png`) });
}
console.log(`page height ${total}px -> ${slices} slices`);
await browser.close();
