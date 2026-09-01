/*
 * verify-acceptance.mjs — evidence for the Shopify acceptance test.
 *
 * Runs the rendered service page in Chromium at a phone viewport and checks the
 * things a buyer and an operator actually depend on. Everything here is a
 * property of the real Liquid output, not of a mock.
 *
 * Usage: node tools/verify-acceptance.mjs
 */
import { chromium } from 'playwright';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const preview = join(here, '..', 'preview');
const shots = join(preview, 'screens');
mkdirSync(shots, { recursive: true });

function resolveChromium() {
  const root = '/opt/pw-browsers';
  if (!existsSync(root)) return undefined;
  for (const name of readdirSync(root).filter((n) => n.startsWith('chromium-')).sort().reverse()) {
    const candidate = join(root, name, 'chrome-linux', 'chrome');
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

let failures = 0;
const check = (ok, label) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
};

const exe = resolveChromium();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const PAGE = `file://${join(preview, 'service-page.html')}`;

/** Fills every required text field but leaves the acknowledgements alone. */
async function fillDetailsOnly(page) {
  await page.fill('#ars-company-name', 'Nordvik Hemtextil AB');
  await page.fill('#ars-contact-name', 'Sara Lindqvist');
  await page.fill('#ars-business-email', 'sara@nordvik.example');
  await page.fill('#ars-website-url', 'https://nordvik.example');
}

/* ---------- 1-3. The page reads on a phone ---------- */
for (const width of [360, 390, 430]) {
  const ctx = await browser.newContext({ viewport: { width, height: 820 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(PAGE, { waitUntil: 'load' });

  console.log(`\nservice page @ ${width}px`);

  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    docW: document.documentElement.clientWidth,
  }));
  check(overflow.scrollW <= overflow.docW + 1, `no horizontal overflow (${overflow.scrollW} vs ${overflow.docW})`);

  const small = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const label = el.closest('label');
      const box = label ? label.getBoundingClientRect() : r;
      if (box.height < 44 || box.width < 44) bad.push(`${el.tagName}#${el.id || '?'} ${Math.round(box.width)}x${Math.round(box.height)}`);
    }
    return bad;
  });
  check(small.length === 0, `tap targets >= 44px${small.length ? ` — ${small.slice(0, 3).join(', ')}` : ''}`);

  const unnamed = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
      const byFor = el.id && document.querySelector(`label[for="${el.id}"]`);
      if (!byFor && !el.closest('label') && !el.getAttribute('aria-label')) bad.push(el.name || el.id);
    }
    return bad;
  });
  check(unnamed.length === 0, `every form control has an accessible name${unnamed.length ? ` — ${unnamed.join(', ')}` : ''}`);

  await page.screenshot({ path: join(shots, `service-${width}.png`), fullPage: true });
  await ctx.close();
}

/* ---------- 4. Both acknowledgements are mandatory ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 820 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(PAGE, { waitUntil: 'load' });
  console.log('\nacknowledgements are mandatory');

  const both = await page.evaluate(() => ({
    ack1: document.getElementById('ars-ack1')?.required,
    ack2: document.getElementById('ars-ack2')?.required,
    ack1Name: document.getElementById('ars-ack1')?.name,
    ack2Name: document.getElementById('ars-ack2')?.name,
  }));
  check(both.ack1 === true && both.ack2 === true, 'both acknowledgement checkboxes carry `required`');
  check(
    both.ack1Name === 'properties[Behörighet att genomföra granskningen]' &&
      both.ack2Name === 'properties[Tjänstens omfattning]',
    'both are recorded as named line item properties'
  );

  // Everything filled EXCEPT the acknowledgements: the form must still refuse.
  await fillDetailsOnly(page);
  const blockedWithoutAcks = await page.evaluate(
    () => !document.getElementById('ars-intake-form').checkValidity()
  );
  check(blockedWithoutAcks, 'form is still invalid when only the acknowledgements are missing');

  await page.check('#ars-ack1');
  const stillBlocked = await page.evaluate(
    () => !document.getElementById('ars-intake-form').checkValidity()
  );
  check(stillBlocked, 'ticking only the first acknowledgement is not enough');

  await page.check('#ars-ack2');
  const nowValid = await page.evaluate(() => document.getElementById('ars-intake-form').checkValidity());
  check(nowValid, 'form becomes valid once both are ticked');

  await ctx.close();
}

/* ---------- 5. The data survives into the cart/order payload ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 820 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(PAGE, { waitUntil: 'load' });
  console.log('\nintake survives into the submitted payload');

  await fillDetailsOnly(page);
  await page.selectOption('#ars-platform', 'Shopify');
  await page.fill('#ars-organisation-number', '556677-8899');
  await page.fill('#ars-known-concerns', 'En kund sa att menyn inte går att nå med tangentbord.');
  await page.check('#ars-ack1');
  await page.check('#ars-ack2');

  // Serialise exactly what the browser would POST to /cart/add.
  const payload = await page.evaluate(() => {
    const form = document.getElementById('ars-intake-form');
    const out = {};
    for (const [key, value] of new FormData(form).entries()) out[key] = String(value);
    return out;
  });

  const required = [
    'properties[Company name]',
    'properties[Contact name]',
    'properties[Business email]',
    'properties[Website URL]',
    'properties[Platform]',
    'properties[Organisation number]',
    'properties[Known concerns]',
    'properties[Behörighet att genomföra granskningen]',
    'properties[Tjänstens omfattning]',
  ];
  for (const key of required) {
    check(typeof payload[key] === 'string' && payload[key].length > 0, `payload carries ${key} = "${payload[key] ?? ''}"`);
  }
  check(payload.id !== undefined, 'payload carries the variant id');
  check(payload.quantity === '1', 'quantity is fixed at 1');

  const action = await page.getAttribute('#ars-intake-form', 'action');
  check(action === '/cart/add', 'form posts to /cart/add');

  await ctx.close();
}

/* ---------- 6. Works with JavaScript disabled ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 820 }, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(PAGE, { waitUntil: 'load' });
  console.log('\nno-JS degradation');

  const enhanced = await page.$eval('#ars-intake-form', (f) => f.hasAttribute('data-ars-enhanced'));
  check(enhanced === false, 'page scripts genuinely did not run');

  const state = await page.$eval('#ars-intake-form', (f) => ({
    action: f.getAttribute('action'),
    required: f.querySelectorAll('[required]').length,
    ack1: f.querySelector('#ars-ack1')?.hasAttribute('required'),
    ack2: f.querySelector('#ars-ack2')?.hasAttribute('required'),
  }));
  check(state.action === '/cart/add', 'form still posts to /cart/add without JS');
  check(state.ack1 === true && state.ack2 === true, 'both acknowledgements still mandatory without JS');
  check(state.required >= 6, `${state.required} native required attributes still enforce validation`);

  const faq = await page.evaluate(() => {
    const d = document.querySelector('.ars__faq-item');
    if (!d) return false;
    d.open = true;
    return d.querySelector('.ars__faq-a').getBoundingClientRect().height > 0;
  });
  check(faq === true, 'FAQ expands without JS');

  await ctx.close();
}

/* ---------- 7. Failed-submit presentation ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 820 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(PAGE, { waitUntil: 'load' });
  console.log('\nfailed submit tells the customer what is wrong');

  await page.click('button[type="submit"]');
  await page
    .waitForFunction(() => document.activeElement && document.activeElement.id === 'ars-company-name', null, { timeout: 2000 })
    .catch(() => {});

  const after = await page.evaluate(() => ({
    summary: document.querySelector('[data-ars-form-error]').classList.contains('is-shown'),
    inline: document.querySelectorAll('.ars__error.is-shown').length,
    focused: document.activeElement?.id,
  }));
  check(after.summary, 'error summary is shown');
  check(after.inline >= 6, `${after.inline} inline errors shown at once`);
  check(after.focused === 'ars-company-name', `focus moved to the first failing field (${after.focused})`);

  // Acknowledgement blocks are flagged in their own right.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const ackFlagged = await page.evaluate(
    () => document.querySelectorAll('[data-ars-ack][data-invalid="true"]').length
  );
  check(ackFlagged === 2, `both acknowledgement blocks marked invalid (${ackFlagged})`);

  await page.screenshot({ path: join(shots, 'service-errors.png'), fullPage: false });
  await ctx.close();
}

await browser.close();
console.log(`\n${failures === 0 ? 'ALL ACCEPTANCE CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
