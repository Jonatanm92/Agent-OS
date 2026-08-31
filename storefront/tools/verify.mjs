/*
 * verify.mjs — automated checks on the rendered preview pages.
 *
 * Checks performed at each mobile width:
 *   1. no horizontal overflow (the single most common mobile defect)
 *   2. every interactive control meets a 44x44 CSS px tap target
 *   3. every form control has an accessible name
 *   4. text/background contrast on the main copy meets WCAG AA
 *   5. the form's native validation actually blocks an empty submit
 *   6. the page still works with JavaScript disabled
 * Screenshots are written to preview/screens/.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const previewDir = path.join(here, '..', 'preview');
const shotDir = path.join(previewDir, 'screens');
fs.mkdirSync(shotDir, { recursive: true });

const WIDTHS = [360, 390, 430];
const PAGES = ['product-one-night.html', 'home.html'];

let failures = 0;
const note = (ok, msg) => { if (!ok) failures++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

// The pre-installed Chromium in this environment is a different build number
// than the npm package expects, so point at it explicitly rather than
// downloading a second copy.
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(
  fs.existsSync(CHROME) ? { executablePath: CHROME } : {}
);

for (const file of PAGES) {
  const url = 'file://' + path.join(previewDir, file);

  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 850 },
      // 1x: these are layout evidence, not pixel-quality renders, and 2x
      // quadruples the size of files that live in the repository.
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'load' });

    console.log(`\n${file} @ ${width}px`);

    /* 1. horizontal overflow */
    const overflow = await page.evaluate(() => {
      const docW = document.documentElement.clientWidth;
      const offenders = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.right > docW + 1 || r.left < -1) {
          offenders.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} right=${Math.round(r.right)}`);
        }
      }
      return { scrollW: document.documentElement.scrollWidth, docW, offenders: offenders.slice(0, 5) };
    });
    note(overflow.scrollW <= overflow.docW + 1,
      `no horizontal overflow (scrollWidth ${overflow.scrollW} vs ${overflow.docW})` +
      (overflow.offenders.length ? ` — offenders: ${overflow.offenders.join(', ')}` : ''));

    /* 2. tap targets */
    const small = await page.evaluate(() => {
      const bad = [];
      const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary';
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        // A control inside a label-sized hit area inherits that area.
        const label = el.closest('label');
        const box = label ? label.getBoundingClientRect() : r;
        if (box.height < 44 || box.width < 44) {
          bad.push(`${el.tagName.toLowerCase()}#${el.id || '?'} ${Math.round(box.width)}x${Math.round(box.height)}`);
        }
      }
      return bad;
    });
    note(small.length === 0, `tap targets >= 44px${small.length ? ` — ${small.slice(0, 4).join(', ')}` : ''}`);

    /* 3. accessible names on form controls */
    const unnamed = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
        const byLabel = el.id && document.querySelector(`label[for="${el.id}"]`);
        const wrapped = el.closest('label');
        const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
        if (!byLabel && !wrapped && !aria) bad.push(el.name || el.id || el.type);
      }
      return bad;
    });
    note(unnamed.length === 0, `all form controls have an accessible name${unnamed.length ? ` — missing: ${unnamed.join(', ')}` : ''}`);

    /* 7. cascade guard.
       Every section emits its own <link> to cmi.css, so a later section's link
       sits after an earlier section's inline <style> in document order. Any
       section override written at equal specificity is silently reverted. These
       assertions check the computed result, not the source, so the bug cannot
       come back unnoticed. */
    const cascade = await page.evaluate(() => {
      const cs = (sel, prop) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el)[prop] : null;
      };
      return {
        exampleCols: cs('.cmi__examples', 'gridTemplateColumns'),
        afterCardBg: cs('.cmi__card--after', 'backgroundColor'),
        stepNumBg: cs('.cmi__step-num', 'backgroundColor'),
      };
    });
    if (cascade.exampleCols !== null) {
      note(cascade.exampleCols.split(' ').length === 2,
        `examples grid is 2-up on mobile (${cascade.exampleCols})`);
    }
    if (cascade.afterCardBg !== null) {
      note(cascade.afterCardBg === 'rgb(16, 16, 20)',
        `"After" card keeps its dark override (${cascade.afterCardBg})`);
    }
    if (cascade.stepNumBg !== null) {
      note(cascade.stepNumBg === 'rgb(242, 112, 58)',
        `step number keeps its accent override (${cascade.stepNumBg})`);
    }

    await page.screenshot({
      path: path.join(shotDir, `${file.replace('.html', '')}-${width}.png`),
      fullPage: true,
    });

    await ctx.close();
  }
}

/* 5. native validation blocks an empty submit (JS enabled) */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 850 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('file://' + path.join(previewDir, 'product-one-night.html'));
  console.log('\nform validation @ 390px (JS on)');

  const res = await page.evaluate(() => {
    const form = document.getElementById('cmi-personalization-form');
    const valid = form.checkValidity();
    const invalid = [...form.querySelectorAll('input:invalid, select:invalid, textarea:invalid')].map((e) => e.name);
    return { valid, invalid };
  });
  note(res.valid === false, `empty form is invalid (blocked before add-to-cart)`);
  note(res.invalid.length === 9,
    `9 required controls block submit — ${res.invalid.join(', ')}`);

  // Photo-link field is required only while "share link" is selected.
  const linkBefore = await page.evaluate(() => document.getElementById('cmi-photo-link').required);
  await page.check('[data-cmi-photo-mode="email"]');
  const linkAfter = await page.evaluate(() => ({
    required: document.getElementById('cmi-photo-link').required,
    hidden: document.querySelector('[data-cmi-reveal="link"]').hidden,
  }));
  note(linkBefore === true, 'photo link is required when "share link" is chosen');
  note(linkAfter.required === false && linkAfter.hidden === true,
    'photo link is hidden and not required when "email after ordering" is chosen');

  // Fill everything and confirm the form becomes submittable.
  await page.check('[data-cmi-photo-mode="link"]');
  await page.fill('#cmi-artist', 'Ghost');
  await page.fill('#cmi-venue', 'Avicii Arena');
  await page.fill('#cmi-city', 'Stockholm');
  await page.fill('#cmi-concert-date', '2025-11-14');
  await page.fill('#cmi-attended-with', 'My sister');
  await page.fill('#cmi-favourite-song', 'Cirice');
  await page.fill('#cmi-favourite-moment', 'The whole arena sang the last chorus without the band.');
  await page.fill('#cmi-photo-link', 'https://drive.google.com/drive/folders/example');
  await page.check('#cmi-consent');
  const nowValid = await page.evaluate(() => document.getElementById('cmi-personalization-form').checkValidity());
  note(nowValid === true, 'form becomes valid once required fields are filled');

  // Engagement property is written on submit.
  const engagement = await page.evaluate(() => {
    const form = document.getElementById('cmi-personalization-form');
    form.addEventListener('submit', (e) => e.preventDefault(), { once: true });
    form.requestSubmit();
    return form.querySelector('[data-cmi-engagement]').value;
  });
  note(/fields=\d+; seconds=\d+/.test(engagement), `engagement recorded: "${engagement}"`);

  const marked = await page.$eval('#cmi-personalization-form', (f) => f.hasAttribute('data-cmi-enhanced'));
  note(marked === true, 'enhancement marker present when JS runs');

  /* 4. contrast on body copy and buttons */
  const contrast = await page.evaluate(() => {
    const lum = (rgb) => {
      const [r, g, b] = rgb.map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const parse = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
    const bgOf = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        const p = parse(bg);
        if (p.length === 3 && !/rgba\(.*,\s*0\)/.test(bg)) return p;
        n = n.parentElement;
      }
      return [255, 255, 255];
    };
    const ratio = (a, b) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const out = [];
    const samples = [
      ['.cmi__lede', 4.5], ['.cmi__muted', 4.5], ['.cmi__label', 4.5],
      ['.cmi__hint', 4.5], ['.cmi__btn--primary', 4.5], ['.cmi__h2', 3.0],
      ['.cmi__eyebrow', 4.5], ['.cmi__faq-q', 4.5],
    ];
    for (const [sel, min] of samples) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const fg = parse(getComputedStyle(el).color);
      const r = ratio(fg, bgOf(el));
      out.push({ sel, ratio: Math.round(r * 100) / 100, min, ok: r >= min });
    }
    return out;
  });
  for (const c of contrast) {
    note(c.ok, `contrast ${c.sel} = ${c.ratio}:1 (needs ${c.min}:1)`);
  }

  await ctx.close();
}

/* 6. no-JS degradation */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 850 }, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('file://' + path.join(previewDir, 'product-one-night.html'));
  console.log('\nno-JS degradation @ 390px');

  const enhanced = await page.$eval('#cmi-personalization-form',
    (f) => f.hasAttribute('data-cmi-enhanced'));
  note(enhanced === false, 'page scripts genuinely did not run (no data-cmi-enhanced marker)');

  const state = await page.$eval('[data-cmi-reveal="link"]', (el) => ({
    hidden: el.hidden,
    visible: el.getBoundingClientRect().height > 0,
  }));
  note(state.hidden === false && state.visible === true,
    'photo-link field stays visible and submittable without JS');

  const formOk = await page.$eval('#cmi-personalization-form', (f) => ({
    action: f.getAttribute('action'),
    enctype: f.getAttribute('enctype'),
    required: f.querySelectorAll('[required]').length,
  }));
  note(formOk.action === '/cart/add', 'form still posts to /cart/add without JS');
  note(formOk.enctype === 'multipart/form-data', 'multipart enctype present without JS (file upload works)');
  note(formOk.required >= 8, `${formOk.required} native required attributes still enforce validation without JS`);

  const faqOpens = await page.evaluate(() => {
    const d = document.querySelector('.cmi__faq-item');
    d.open = true;
    return d.querySelector('.cmi__faq-a').getBoundingClientRect().height > 0;
  });
  note(faqOpens === true, 'FAQ <details> expands without JS');

  await ctx.close();
}

await browser.close();
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
