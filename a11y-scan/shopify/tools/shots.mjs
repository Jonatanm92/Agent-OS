import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const c = await b.newContext({ viewport: { width: 390, height: 820 }, isMobile: true, hasTouch: true });
const p = await c.newPage();
const F = 'file:///home/user/Agent-OS/a11y-scan/shopify/preview/';
const out = '/home/user/Agent-OS/a11y-scan/shopify/preview/screens/';

await p.goto(F + 'service-page.html');
await p.screenshot({ path: out + 'view-1-hero.png' });

for (const [sel, name, off] of [
  ['#ars-order', 'view-2-intake', 0],
  ['#ars-ack1', 'view-3-acknowledgements', -60],
  ['#ars-faq', 'view-4-faq', 0],
]) {
  await p.evaluate(([s, o]) => {
    const el = document.querySelector(s);
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + Number(o));
  }, [sel, off]);
  await p.waitForTimeout(200);
  await p.screenshot({ path: out + name + '.png' });
}
console.log('captured 4 views');
await b.close();
