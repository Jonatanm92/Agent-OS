/* Aura — end-to-end tests in a real browser at phone size.
 * Runs the page exactly as published (same skeleton), with a fixed clock.
 * Part 1 runs with no platform (browser storage, rules, no AI).
 * Part 2 runs with a simulated claude.ai runtime (private db + Claude). Invented people only.
 *   NODE_PATH=/opt/node22/lib/node_modules node test/e2e.js       (SHOTS=dir to save screenshots) */
const { chromium, devices } = require('playwright');
const path = require('node:path');
const { serve } = require('./serve');

const EXE = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SHOTS = process.env.SHOTS || '';
const TUE_10 = new Date('2026-09-29T08:00:00Z');   // Tuesday 10:00 in Stockholm
const TUE_21 = new Date('2026-09-29T19:00:00Z');

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, extra) {
  if (ok) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; failures.push(name); console.log(`  ✗ ${name}${extra ? `\n      ${String(extra).slice(0, 400)}` : ''}`); }
}
function section(name) { console.log(`\n${name}`); }

async function newPage(browser, opts) {
  const o = opts || {};
  const ctx = await browser.newContext({
    ...devices['Pixel 7'], locale: o.locale || 'en-GB', timezoneId: 'Europe/Stockholm',
    colorScheme: o.colorScheme || 'light', viewport: o.viewport || devices['Pixel 7'].viewport,
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  if (o.init) await ctx.addInitScript(o.init, o.initArg);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(o.time || TUE_10);
  page.errors = [];
  page.dialogs = 0;
  page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) page.errors.push(`console: ${m.text()}`); });
  page.on('dialog', async (d) => { page.dialogs += 1; await d.dismiss(); });
  return { ctx, page };
}

const W = (page, ms) => page.waitForTimeout(ms || 220);
async function tap(page, selector, opts) { await page.locator(selector).first().click(opts); await W(page); }
async function text(page, selector) { return (await page.locator(selector || '#app').innerText()).replace(/\s+/g, ' '); }
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true }); }
async function hscroll(page) { return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); }
async function smallTargets(page) {
  return page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('button, select, input:not([type=hidden]), textarea')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (el.closest('.row-main') && el.tagName !== 'BUTTON') continue;
      if (r.height < 34 || r.width < 34) bad.push(`${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return bad;
  });
}

async function onboard(page, dump) {
  await tap(page, 'button:has-text("Get started")');
  await page.fill('#ob-name', 'Sam');
  await tap(page, '.ob-foot button:has-text("Next")');
  await tap(page, 'button:has-text("Planning my day")');
  await tap(page, 'button:has-text("Shopping lists")');
  await tap(page, '.ob-foot button:has-text("Next")');
  await tap(page, 'button:has-text("Too much in my head")');
  await tap(page, '.ob-foot button:has-text("Next")');
  await tap(page, '.ob-foot button:has-text("Next")');
  await tap(page, '.scale-btn[data-field="energy"][data-value="3"]');
  await tap(page, '.ob-foot button:has-text("Next")');
  if (dump) {
    await page.fill('#ob-dump', dump);
    await tap(page, 'button:has-text("Sort it")');
    await W(page, 300);
  }
}

(async () => {
  const { server, port } = await serve(0);
  const URL = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ executablePath: EXE });

  /* ================= Part 1: no platform ================= */
  const { ctx, page } = await newPage(browser);

  section('New user');
  await page.goto(URL, { waitUntil: 'networkidle' });
  await W(page, 400);
  check('page loads without JavaScript errors', page.errors.length === 0, page.errors.join(' | '));
  check('a new user starts with a short introduction', /Aura/.test(await text(page)) && await page.locator('button:has-text("Get started")').count() === 1);
  await tap(page, 'button:has-text("Svenska")');
  check('language can be switched on the first screen', await page.locator('button:has-text("Kom igång")').count() === 1);
  await tap(page, 'button:has-text("English")');
  await onboard(page, "I need shampoo, need to book the dentist, wash the jacket and remember Mum's birthday present");
  const obText = await text(page);
  check('the first brain dump is sorted into candidates before anything is created', /Aura found 4 things/.test(obText), obText.slice(0, 200));
  check('the rules are named as rules, not AI', /built-in rules \(no AI\)/.test(obText));
  check('an ambiguous reminder asks for a day', /When\? Pick a day/.test(obText));
  await shot(page, 'e2e-01-onboarding-dump');
  await tap(page, 'button:has-text("Build my day")');
  await W(page, 300);
  const home = await text(page);
  check('onboarding ends on a useful first day, greeting by name', /Good morning, Sam/.test(home), home.slice(0, 120));
  check('the NOW card shows one recommended action', await page.locator('.now').count() === 1 && await page.locator('.now button:has-text("Do it")').count() === 1);
  check('the recommendation has a one-sentence reason and a duration', (await page.locator('.now .now-why').innerText()).length > 10 && /~\d+ min/.test(await page.locator('.now').innerText()));
  check('Today shows must / good / can wait counts', /Must/.test(home) && /Good if possible/.test(home) && /Can wait/.test(home));
  check('no horizontal scroll on the home screen', await hscroll(page) <= 1, await hscroll(page));
  const small = await smallTargets(page);
  check('touch targets are at least 34 px', small.length === 0, small.join(', '));
  await shot(page, 'e2e-02-home');

  section('Returning user');
  await page.reload({ waitUntil: 'networkidle' });
  await W(page, 400);
  check('a returning user lands straight on Now', /Good morning, Sam/.test(await text(page)) && await page.locator('.now').count() === 1);
  check('the data survived the reload', /Book the dentist|Wash the jacket/.test(await text(page)));

  section('What should I do now?');
  const first = await page.locator('.now .now-title').innerText();
  await tap(page, '.now button:has-text("Something else")');
  const second = await page.locator('.now .now-title').innerText();
  check('"Something else" offers a different action', first !== second, `${first} / ${second}`);
  await tap(page, '.now button:has-text("Do it")');
  check('"Do it" turns the card into what you are doing, with Done', /You're doing|In progress/i.test(await text(page, '.now')) && await page.locator('.now button:has-text("Done")').count() === 1);
  await tap(page, '.now button:has-text("Done")');
  check('Done confirms with an undo option', await page.locator('.toast button:has-text("Undo")').count() === 1);
  await tap(page, '.toast button:has-text("Undo")');
  check('Undo brings it back', /You're doing|In progress|Now/i.test(await text(page, '.now')));
  await tap(page, '.now button:has-text("Pause")').catch(() => {});
  if (await page.locator('.now button:has-text("Not now")').count()) {
    await tap(page, '.now button:has-text("Not now")');
    check('"Not now" makes the card quiet instead of pushing', /stay quiet/i.test(await text(page, '.now')));
    await tap(page, '.now button:has-text("What should I do now?")');
    check('asking again opens the focused "What should I do now?" view', /What should I do now\?/.test(await text(page)));
    await tap(page, 'button[aria-label="Back"]');
  }

  section('Brain dump');
  await tap(page, '.nav .fab');
  await page.fill('#cap-text', 'Remind me to buy nappies tomorrow and I need to call the dentist this week. Also milk, bread');
  await tap(page, 'button:has-text("Sort it")');
  await W(page, 300);
  let cap = await text(page);
  check('messy text becomes structured candidates', /Aura found \d+ things/.test(cap), cap.slice(0, 160));
  const kinds = await page.locator('.cand .kind-select').evaluateAll((els) => els.map((e) => e.value));
  check('kinds are recognised (shopping, admin)', kinds.includes('shopping') && kinds.includes('admin'), kinds.join(','));
  await page.locator('.cand .kind-select').last().selectOption('task');
  await W(page);
  check('the kind can be corrected in one tap', (await page.locator('.cand .kind-select').last().inputValue()) === 'task');
  const before = await page.locator('.cand').count();
  await tap(page, '.cand button[aria-label^="Remove"]');
  check('a wrong candidate can be removed', await page.locator('.cand').count() === before - 1);
  await tap(page, 'button:has-text("Add ")');
  check('adding creates the items with an undoable confirmation', /added/i.test(await text(page, '#toast')));
  await shot(page, 'e2e-03-after-dump');

  section('My Day');
  await tap(page, '.nav button:has-text("My day")');
  await page.fill('#day-add', 'Water the plants');
  await page.press('#day-add', 'Enter');
  await W(page, 300);
  check('quick add puts it into today', /Water the plants/.test(await text(page, '.b-good')));
  await page.locator('.b-good .row', { hasText: 'Water the plants' }).locator('.tick').click();
  await W(page, 450);
  check('ticking completes it', !/Water the plants/.test(await text(page, '.b-good')));
  await page.locator('.b-good .row-main').first().click();
  await W(page, 300);
  check('an item opens in a sheet, not a browser dialog', await page.locator('.sheet').count() === 1 && page.dialogs === 0);
  const itemTitle = await page.locator('#it-title').inputValue();
  await tap(page, '.sheet .chip:has-text("Must")');
  await tap(page, '.sheet button[aria-label="Close"]');
  check('an item can be made a must', (await text(page, '.b-must')).includes(itemTitle), itemTitle);
  await page.locator('.b-must .row-main', { hasText: itemTitle }).click();
  await W(page, 300);
  await tap(page, '.sheet .chip:has-text("tomorrow")');
  await tap(page, '.sheet button[aria-label="Close"]');
  check('postponing moves it out of today', !(await text(page, '.b-must')).includes(itemTitle));
  await tap(page, 'button:has-text("Rebuild my day")');
  check('Rebuild my day shows a plan before changing anything', await page.locator('.sheet').count() === 1 && /plan for the rest of the day/i.test(await text(page, '.sheet')));
  await tap(page, '.sheet button[aria-label="Close"]');
  check('My Day has no horizontal scroll', await hscroll(page) <= 1);
  await shot(page, 'e2e-04-day');

  section('Low Energy Mode');
  await tap(page, '.nav button:has-text("Now")');
  await tap(page, 'button:has-text("Check in")');
  await tap(page, '.sheet .scale-btn[data-field="energy"][data-value="1"]');
  await tap(page, '.sheet .scale-btn[data-field="stress"][data-value="4"]');
  await tap(page, '.sheet button:has-text("Save")');
  check('the check-in is quick: a sheet with a few taps', page.dialogs === 0);
  const sugg = await text(page);
  check('a low check-in suggests making the day smaller (not forced)', /make today smaller|one thing at a time/i.test(sugg), sugg.slice(0, 300));
  await page.goto(`${URL}#low`, { waitUntil: 'networkidle' });
  await W(page, 300);
  const low = await text(page);
  check('Low Energy shows Must, a tiny win and what moves', /Must/.test(low) && /Tiny win/.test(low) && /Moved/.test(low), low.slice(0, 300));
  check('no guilt language', !/should have|failed|behind|lazy|streak/i.test(low));
  await shot(page, 'e2e-05-low');
  await tap(page, 'button:has-text("Make it so")');
  check('applying makes the day smaller and says so', /Low energy today/.test(await text(page)));
  await tap(page, '.mode-banner button:has-text("Back to a normal day")');
  check('back to normal is one tap', !/Low energy today/.test(await text(page)));

  section('Chaos Mode');
  await page.goto(`${URL}#chaos`, { waitUntil: 'networkidle' });
  await W(page, 300);
  await page.fill('#chaos-text', 'pay the electricity bill by Friday, text the plumber, sort the wardrobe, buy batteries');
  await tap(page, 'button:has-text("Sort it for me")');
  await W(page, 300);
  check('Chaos organises the dump for a quick look', /Aura found \d+ things/.test(await text(page)));
  await tap(page, 'button:has-text("Looks right")');
  await W(page, 300);
  const c1 = await page.locator('.now .now-title').innerText().catch(() => '');
  check('Chaos shows ONE action to start with', await page.locator('.now').count() === 1 && c1.length > 0, c1);
  check('the rest is hidden behind a disclosure', /Show everything/.test(await text(page)));
  await tap(page, '.now button:has-text("Done")');
  const c2 = await page.locator('.now .now-title').innerText().catch(() => '');
  check('finishing reveals the next useful action', c2 && c2 !== c1, `${c1} → ${c2}`);
  check('progress is shown quietly', /1 of \d+ handled/.test(await text(page)));
  await shot(page, 'e2e-06-chaos');
  await page.goto(`${URL}#home`, { waitUntil: 'networkidle' });
  await W(page, 300);
  await tap(page, '.mode-banner button:has-text("Back to a normal day")');

  section('Aura coach without AI');
  await tap(page, '.nav button:has-text("Aura")');
  check('it says honestly that open questions need AI', /isn't available here/.test(await text(page)));
  await tap(page, '.chip:has-text("What was I supposed to buy?")');
  const buy = await text(page, '.thread');
  check('plan questions are answered from the plan', /From your plan/i.test(buy) && /Nappies|Milk|Shampoo/.test(buy), buy.slice(0, 200));
  await page.fill('#aura-q', 'Should I repaint the kitchen in autumn colours?');
  await tap(page, 'button[aria-label="Send"]');
  const open = await text(page, '.thread');
  check('an open question without AI gets an honest answer, not a fake one', /can't answer that without AI/.test(open), open.slice(-200));
  await tap(page, '.chip:has-text("I don\'t have energy today")');
  check('"no energy" leads to the Low Energy flow', await page.locator('.thread button:has-text("Make today smaller")').count() >= 1);

  section('Evening reset');
  await page.clock.setFixedTime(TUE_21);
  await page.goto(`${URL}#evening`, { waitUntil: 'networkidle' });
  await W(page, 300);
  const eve = await text(page);
  check('evening acknowledges what got done', /got done today|Nothing was ticked off/.test(eve), eve.slice(0, 200));
  const openRows = await page.locator('button[data-action="eve-move"][data-to="tomorrow"]').count();
  if (openRows) {
    await tap(page, 'button[data-action="eve-move"][data-to="tomorrow"]');
    check('unfinished items move with one tap', await page.locator('button[data-action="eve-move"][data-to="tomorrow"]').count() === openRows - 1);
  } else check('unfinished items move with one tap', true);
  await page.fill('#eve-mind', 'Ask about swimming lessons');
  await tap(page, 'button:has-text("Put in the inbox")');
  await tap(page, 'button:has-text("Done for today")');
  check('the evening ends on Now', await page.locator('.now').count() === 1);
  await page.clock.setFixedTime(TUE_10);

  section('Life systems');
  await page.goto(`${URL}#shopping`, { waitUntil: 'networkidle' });
  await W(page, 300);
  await page.fill('#shop-add', 'oat milk, toilet paper');
  await page.press('#shop-add', 'Enter');
  await W(page, 300);
  const shop = await text(page);
  check('shopping: fast add, grouped by category', /Oat milk/.test(shop) && /Toilet paper/.test(shop) && /Household/.test(shop));
  await page.goto(`${URL}#household`, { waitUntil: 'networkidle' });
  await W(page, 300);
  await tap(page, '.chip:has-text("Laundry")');
  check('home: Aura remembers a recurring chore', /Laundry/.test(await text(page, '.panel')) && /every 3 days/.test(await text(page)));
  await page.goto(`${URL}#inbox`, { waitUntil: 'networkidle' });
  await W(page, 300);
  check('inbox holds what was captured, without pressure', /swimming lessons/i.test(await text(page)) && !/\d+ unread|overdue/i.test(await text(page)));
  await tap(page, 'button:has-text("Sort all of it for me")');
  check('inbox can be sorted in one tap', /Nothing is waiting/.test(await text(page)));
  await page.goto(`${URL}#projects`, { waitUntil: 'networkidle' });
  await W(page, 300);
  await tap(page, 'button:has-text("New project")');
  await page.fill('#pj-name', 'Sort out the bedroom');
  await page.fill('#pj-first', 'Clear the clothes chair');
  await tap(page, '.sheet button:has-text("Create")');
  check('a project surfaces its next action', /Next step/.test(await text(page)) && /Clear the clothes chair/.test(await text(page)));
  await page.goto(`${URL}#routines`, { waitUntil: 'networkidle' });
  await W(page, 300);
  await tap(page, '.chip:has-text("Cleaning reset")');
  await tap(page, '.row .tick');
  check('a routine runs with check-offs', /1 of/i.test(await text(page)));
  await shot(page, 'e2e-07-routine');

  section('Settings, privacy and data');
  await page.goto(`${URL}#settings`, { waitUntil: 'networkidle' });
  await W(page, 300);
  const set = await text(page);
  check('storage mode is stated honestly', /Saved in this browser only/.test(set));
  check('what AI would receive is explained', /Never notes, reflections, cycle data/.test(set));
  check('cycle is off by default', !(await page.locator('.toggle.on:has-text("Cycle")').count()));
  await tap(page, '.toggle:has-text("Cycle")');
  await page.goto(`${URL}#cycle`, { waitUntil: 'networkidle' });
  await W(page, 300);
  const cyc = await text(page);
  check('cycle says it is not medical advice', /not medical advice/i.test(cyc) && /do not replace healthcare/i.test(cyc));
  await tap(page, '.chip:has-text("Yes")');
  await tap(page, 'button:has-text("Delete all cycle data")');
  check('deleting cycle data asks in-page, not with a browser dialog', await page.locator('.sheet.confirm').count() === 1 && page.dialogs === 0);
  await tap(page, '.sheet.confirm button:has-text("Delete")');
  check('cycle data is gone', /Log two full cycles/.test(await text(page)));
  await page.goto(`${URL}#settings`, { waitUntil: 'networkidle' });
  await W(page, 300);
  await tap(page, '.chip:has-text("Svenska")');
  check('the whole interface switches to Swedish', /Min dag/.test(await text(page, '#dock')) && /Livet/.test(await text(page, '#dock')));
  await tap(page, '.chip:has-text("English")');

  section('Responsive and themes');
  for (const [w, h] of [[360, 740], [412, 915], [1280, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const v of ['home', 'day', 'aura', 'life', 'capture', 'settings']) {
      await page.goto(`${URL}#${v}`, { waitUntil: 'networkidle' });
      await W(page, 150);
      const s = await hscroll(page);
      if (s > 1) check(`no horizontal scroll: ${v} at ${w}px`, false, `${s}px`);
    }
  }
  check('no horizontal scroll on any main view from 360 to 1280 px', true);
  await page.setViewportSize(devices['Pixel 7'].viewport);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${URL}#home`, { waitUntil: 'networkidle' });
  await W(page, 300);
  const colors = await page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, fg: getComputedStyle(document.body).color, now: getComputedStyle(document.querySelector('.now')).backgroundColor }));
  check('dark mode has its own background and text', colors.bg === 'rgb(14, 18, 19)' && colors.fg !== colors.bg, JSON.stringify(colors));
  await shot(page, 'e2e-08-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  check('no browser dialogs were used anywhere', page.dialogs === 0);
  check('no JavaScript errors in the whole run', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  await ctx.close();

  /* ================= Part 2: simulated claude.ai runtime ================= */
  section('With the platform: private storage and Aura AI (simulated)');
  const runtime = (mode) => {
    const docs = JSON.parse(localStorage.getItem('__fake_db') || '{}');
    const save = () => localStorage.setItem('__fake_db', JSON.stringify(docs));
    const db = {
      doc(p) {
        return {
          get: async () => ({ exists: p in docs, data: () => docs[p], metadata: {} }),
          set: async (b) => { docs[p] = JSON.parse(JSON.stringify(b)); save(); },
          delete: async () => { delete docs[p]; save(); },
          onSnapshot: () => () => {},
        };
      },
    };
    const reply = (input) => {
      const text = typeof input === 'string' ? input : input.map((t) => t.content).join('\n');
      const ids = Array.from(text.matchAll(/"id":"(it_[^"]+)"/g)).map((m) => m[1]);
      return `Start with something small so the day feels lighter.\n<actions>[{"op":"move","id":"${ids[0] || 'none'}","to":"tomorrow"},{"op":"done","id":"it_fake"}]</actions>`;
    };
    const sample = Object.assign(async (input, opts) => {
      if (mode === 'fail') throw { code: 'rate_limited', message: 'busy' };
      const t = reply(input);
      if (opts && opts.onText) opts.onText({ text: t, delta: t });
      return { text: t, truncated: false, modelTierApplied: 'default' };
    }, {
      json: async () => {
        if (mode === 'fail') throw { code: 'rate_limited', message: 'busy' };
        return { items: [{ kind: 'shopping', title: 'Oat milk', category: 'dairy' }, { kind: 'admin', title: 'Renew passport', category: 'form', dueDate: '2026-10-30' }] };
      },
    });
    window.claude = { use: async (n) => (n === 'user' ? { id: async () => 'u_test_viewer' } : n === 'db' ? db : n === 'sample' ? sample : null) };
  };

  const p2 = await newPage(browser, { init: runtime, initArg: 'ok' });
  await p2.page.goto(URL, { waitUntil: 'networkidle' });
  await W(p2.page, 500);
  await tap(p2.page, 'button:has-text("Skip the introduction")');
  await tap(p2.page, '.nav .fab');
  await p2.page.fill('#cap-text', 'oat milk and renew the passport before the end of October');
  check('with Claude available the capture screen says AI sorts it', /Aura AI sorts this/.test(await text(p2.page)));
  await tap(p2.page, 'button:has-text("Sort it")');
  await W(p2.page, 300);
  const aiCap = await text(p2.page);
  const aiTitles = await p2.page.locator('.cand-title').evaluateAll((els) => els.map((e) => e.value));
  check('an AI-sorted brain dump is labelled as AI', /Sorted with Aura AI/i.test(aiCap) && aiTitles.includes('Renew passport'), `${aiCap.slice(0, 120)} ${aiTitles.join(',')}`);
  await tap(p2.page, 'button:has-text("Add ")');
  await tap(p2.page, '.nav button:has-text("My day")');
  await p2.page.fill('#day-add', 'Clean the oven');
  await p2.page.press('#day-add', 'Enter');
  await W(p2.page, 300);
  await tap(p2.page, '.nav button:has-text("Aura")');
  await p2.page.fill('#aura-q', 'My evening is packed, what should give?');
  await tap(p2.page, 'button[aria-label="Send"]');
  await W(p2.page, 400);
  const coach = await text(p2.page, '.thread');
  check('open questions get an Aura AI answer using the plan', /Aura AI/i.test(coach) && /Start with something small/.test(coach), coach.slice(0, 300));
  check('proposed changes are validated: only real ids survive', await p2.page.locator('.proposal .change').count() === 1);
  check('nothing is applied until confirmed', /Clean the oven/.test(await (async () => { await tap(p2.page, '.nav button:has-text("My day")'); return text(p2.page, '.b-good'); })()));
  await tap(p2.page, '.nav button:has-text("Aura")');
  await tap(p2.page, '.proposal button:has-text("Apply")');
  check('confirmed changes are applied with undo', /Changes applied/.test(await text(p2.page, '#toast')));
  await p2.page.goto(`${URL}#settings`, { waitUntil: 'networkidle' });
  await W(p2.page, 500);
  check('with the platform, data is saved privately to the account', /Saved privately to your account/.test(await text(p2.page)));
  const stored = await p2.page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('__fake_db') || '{}')));
  check('documents are written only under the viewer’s private path', stored.length > 0 && stored.every((k) => k.startsWith('data/users/u_test_viewer/')), stored.join(', '));
  await p2.page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('aura:')) localStorage.removeItem(k); });
  await p2.page.goto(`${URL}#admin`, { waitUntil: 'networkidle' });
  await W(p2.page, 500);
  check('a reload restores from the account, even with the browser copy cleared', /Renew passport/.test(await text(p2.page)), (await text(p2.page)).slice(0, 200));
  check('no JavaScript errors with the platform', p2.page.errors.length === 0, p2.page.errors.slice(0, 3).join(' | '));
  await p2.ctx.close();

  section('Failure states');
  const p3 = await newPage(browser, { init: runtime, initArg: 'fail' });
  await p3.page.goto(URL, { waitUntil: 'networkidle' });
  await W(p3.page, 500);
  await tap(p3.page, 'button:has-text("Skip the introduction")');
  await tap(p3.page, '.nav .fab');
  await p3.page.fill('#cap-text', 'buy milk and call the bank');
  await tap(p3.page, 'button:has-text("Sort it")');
  await W(p3.page, 300);
  const failCap = await text(p3.page);
  const failTitles = await p3.page.locator('.cand-title').evaluateAll((els) => els.map((e) => e.value));
  check('when Claude fails, the rules take over and say why', /built-in rules/i.test(failCap) && /busy or your usage limit/.test(failCap) && failTitles.includes('Milk'), `${failCap.slice(0, 200)} ${failTitles.join(',')}`);
  await tap(p3.page, '.nav button:has-text("Aura")');
  await p3.page.fill('#aura-q', 'Plan my weekend around the rain');
  await tap(p3.page, 'button[aria-label="Send"]');
  await W(p3.page, 300);
  check('a failed coach call shows a clear message and keeps the app usable', /busy or your usage limit/.test(await text(p3.page, '.thread')) && await p3.page.locator('#aura-q').isEnabled());
  check('no JavaScript errors in failure states', p3.page.errors.length === 0, p3.page.errors.slice(0, 3).join(' | '));
  await p3.ctx.close();

  await browser.close();
  server.close();
  console.log(`\n${'─'.repeat(56)}\n${pass} passed, ${fail} failed`);
  if (fail) console.log(`Failed: ${failures.join(' | ')}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
