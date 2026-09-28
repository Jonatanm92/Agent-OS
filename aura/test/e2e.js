/* Aura — end-to-end tests in a real browser at phone size (Pixel 7).
 *
 * The page runs under the live deployment's Content Security Policy
 * (test/serve.js), with a fixed Swedish clock and an invented person.
 * /api/coach — the Vercel function that asks Gemini — is stubbed per test:
 * unavailable (Klara's honest local fallback) or a valid reply shape.
 *   NODE_PATH=/opt/node22/lib/node_modules node test/e2e.js   (SHOTS=dir saves screenshots) */
const { chromium, devices } = require('playwright');
const path = require('node:path');
const { serve } = require('./serve');

const SHOTS = process.env.SHOTS || '';
const MON_1015 = new Date('2026-09-28T08:15:00Z');   // Monday 10:15 in Stockholm
const MON_1940 = new Date('2026-09-28T17:40:00Z');   // Monday 19:40
const STORAGE_KEY = 'min-dag:josefin-edition:v1';

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, extra) {
  if (ok) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; failures.push(name); console.log(`  ✗ ${name}${extra !== undefined ? `\n      ${String(extra).slice(0, 400)}` : ''}`); }
}
function section(name) { console.log(`\n${name}`); }

const COACH_REPLY = {
  mode: 'initial', level: 'everyday', model: 'gemini-test', headline: 'En liten paus först',
  reflection: 'Du låter trött, och det är okej.', encouragement: 'Ett litet steg räcker.',
  firstStep: { title: 'Drick ett glas vatten', body: 'Häll upp ett glas och drick det långsamt.', why: 'Vätska ger lite ork.', minutes: '1 min' },
  alternatives: [], checkBack: 'Hur känns det nu?', animalLine: 'Jag är med dig.',
};

async function newPage(browser, { time = MON_1015, width, height = 800, init, coach = 'down' } = {}) {
  const ctx = await browser.newContext({
    ...devices['Pixel 7'], locale: 'sv-SE', timezoneId: 'Europe/Stockholm', serviceWorkers: 'block',
    viewport: width ? { width, height } : devices['Pixel 7'].viewport,
  });
  if (init) await ctx.addInitScript(init.fn, init.arg);
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await ctx.route('**/api/coach', (route) => (coach === 'ok'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(COACH_REPLY) })
    : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"ai_unavailable"}' })));
  const page = await ctx.newPage();
  await page.clock.setFixedTime(time);
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.errors.push(`console: ${m.text()}`); });
  return { ctx, page };
}

const W = (page, ms) => page.waitForTimeout(ms || 200);
async function tap(page, selector) { await page.locator(selector).first().click(); await W(page); }
/* innerText follows CSS text-transform (eyebrows are uppercase), so compare case-insensitively. */
async function text(page, selector = '#main-content') { return (await page.locator(selector).first().innerText()).replace(/\s+/g, ' ').toLowerCase(); }
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }); }
async function hscroll(page) { return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); }
async function stored(page) { return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), STORAGE_KEY); }
async function go(page, route) { await tap(page, `.bottom-nav [data-route="${route}"]`); }
async function problems(page) { return [...page.errors, ...(await page.evaluate(() => window.__csp || []))]; }
const todayKey = (s) => Object.keys(s.logs || {}).sort().pop();

/** The quick way in: a name, then "skip everything". */
async function onboard(page, name = 'Robin') {
  await page.goto(page.baseUrl);
  await page.waitForSelector('#onboarding-dialog[open]');
  if (name) await page.fill('#onboarding-name', name);
  await tap(page, '[data-action="life-ob-finish"]');
}

async function dump(page, words) {
  await tap(page, '[data-action="life-capture"]');
  await page.fill('#life-capture-form textarea', words);
  await tap(page, '#life-capture-form button[type=submit]');
}

async function confirmDump(page) { await tap(page, '#life-review-form button[type=submit]'); }

(async () => {
  const { server, port } = await serve(0);
  const browser = await chromium.launch();
  const base = `http://127.0.0.1:${port}/`;
  const open = async (opts) => { const r = await newPage(browser, opts); r.page.baseUrl = base; return r; };

  /* ------------------------------------------------------------------ */
  section('1. First visit: onboarding to a first useful day, under the live security policy');
  {
    const { ctx, page } = await open();
    await page.goto(base);
    await page.waitForSelector('#onboarding-dialog[open]');
    const welcome = await text(page, '#onboarding-dialog');
    check('onboarding opens with the four companions', welcome.includes('klara') && welcome.includes('astrid'));
    check('the name field is empty — no one else’s name is pre-filled', (await page.inputValue('#onboarding-name')) === '');
    await page.fill('#onboarding-name', 'Robin');
    const next = () => tap(page, '#life-onboarding-form button[type=submit]');
    await next();
    check('step 1 asks what Aura should help with, with progress shown', (await text(page, '#onboarding-dialog')).includes('hjälper till med') && (await page.locator('.ob-progress i[data-on="true"]').count()) === 1);
    await next();
    await page.locator('#life-onboarding-form label.chip', { hasText: 'Lite ork' }).click();
    await next();
    await page.fill('#life-onboarding-form input[name="wake"]', '06:30');
    await next();
    await tap(page, '#life-onboarding-form [data-action="life-pulse-pick"][data-field="energy"][data-value="2"]');
    check('a first Aura Pulse takes one tap', (await page.getAttribute('#life-onboarding-form [data-field="energy"][data-value="2"]', 'aria-pressed')) === 'true');
    await next();
    await page.fill('#ob-dump', 'ring vårdcentralen, handla mjölk, betala hyran senast fredag');
    await next();
    check('the last step shows the first day, by name', (await text(page, '#onboarding-dialog')).includes('här är din dag, robin'));
    await next();
    check('then onboarding closes', !(await page.locator('#onboarding-dialog[open]').count()));
    check('the greeting uses the name given', (await text(page, '.world-copy h1')).includes('robin'));
    const s = await stored(page);
    check('the rhythm is saved for the planner', s.life.prefs.wake === '06:30');
    check('"lite ork" makes days lighter', s.life.prefs.density === 'light');
    check('the brain dump became real things', s.life.items.some((i) => i.kind === 'shopping' && /mjölk/i.test(i.title)) && s.life.items.some((i) => /vårdcentralen/i.test(i.title)));
    const log = s.logs[todayKey(s)];
    check('the first pulse is stored where Klara’s coach reads it too', log.pulse.energy === 2 && log.energy === 4 && log.pulses.length === 1);
    check('a morning routine was set up, as chosen', s.life.routines.some((r) => r.kind === 'morning'));
    const tabs = await page.$$eval('.bottom-nav button:not([hidden]) small', (els) => els.map((e) => e.textContent));
    check('the bottom bar is Idag · Coach · Livet · Cykel · Mystik', tabs.join(' · ') === 'Idag · Coach · Livet · Cykel · Mystik', tabs.join(' · '));
    check('Idag opens on one thing to do now', (await page.locator('#now-panel').count()) === 1 && (await text(page, '#now-title')).length > 2);
    check('five shortcuts sit under it', (await page.locator('.shortcuts button').count()) === 5);
    check('no console errors and no CSP violations', !(await problems(page)).length, (await problems(page)).join('\n'));
    await shot(page, 'e2e-first');
    await ctx.close();
  }
  {
    const { ctx, page } = await open();
    await onboard(page, 'Sam');
    const s = await stored(page);
    check('skipping everything presumes nothing: no routines, no plan', s.profile.onboarded && s.life.routines.length === 0 && s.life.items.length === 0);
    check('an empty day says so, and offers Töm huvudet', (await text(page, '#now-panel')).includes('inget i planen än'));
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  section('2. Töm huvudet — sorted, shown, then created');
  {
    const { ctx, page } = await open();
    await onboard(page);
    await dump(page, 'Behöver schampo och mjölk, boka tandläkaren, ring vårdcentralen i dag, betala hyran senast fredag, tandläkare torsdag 14:00 och städa badrummet varje vecka');
    const cands = await page.$$eval('.cand', (els) => els.length);
    check('the brain dump is split into separate things', cands >= 6, cands);
    check('it says plainly that rules sorted it and nothing was sent', (await text(page, '#life-sheet')).includes('ingen ai'));
    const kinds = await page.$$eval('.cand select[data-change="life-cand-kind"]', (els) => els.map((e) => e.value));
    check('shopping, admin, a fixed time and a home chore are recognised', ['shopping', 'admin', 'event', 'chore'].every((k) => kinds.includes(k)), kinds.join(','));
    check('the fixed time is marked for a second look', await page.locator('.cand[data-review="true"]').count() >= 1);
    check('nothing is created before confirming', ((await stored(page)).life.items || []).length === 0);
    await page.locator('.cand').first().locator('input').fill('Schampo utan parfym');
    await page.locator('.cand').nth(1).locator('select[data-change="life-cand-kind"]').selectOption('task');
    check('an edited title survives a re-sort of the list', (await page.locator('.cand').first().locator('input').inputValue()) === 'Schampo utan parfym');
    await confirmDump(page);
    const s = await stored(page);
    check('confirming creates the items and the fixed time', s.life.items.length >= 5 && s.life.events.length === 1, `${s.life.items.length} items, ${s.life.events.length} events`);
    check('the edit made it into the saved item', s.life.items.some((i) => i.title === 'Schampo utan parfym'));
    check('a toast offers Ångra', await page.locator('#toast .toast-undo').isVisible());
    await tap(page, '#toast .toast-undo');
    check('Ångra removes everything that was added', (await stored(page)).life.items.length === 0);
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  section('3. Just nu — one thing, with a reason');
  {
    const { ctx, page } = await open();
    await onboard(page);
    await dump(page, 'ring vårdcentralen i dag, mejla skolan i dag, städa hallen i dag, köp present till fredag');
    await confirmDump(page);
    await page.evaluate(() => document.querySelector('#animal-response .animal-response-close')?.click());
    const card = await text(page, '#now-panel');
    const first = await text(page, '#now-title');
    check('Just nu shows one thing with a reason and a duration', first.length > 2 && /ca \d+/.test(card), card.slice(0, 160));
    check('with Gör det, Något lättare, Något annat and Inte nu', ['gör det', 'något lättare', 'något annat', 'inte nu'].every((t) => card.includes(t)));
    await tap(page, '#now-panel [data-action="life-else"]');
    const second = await text(page, '#now-title');
    check('"Något annat" offers a different thing', second !== first, `${first} → ${second}`);
    await tap(page, '#now-panel [data-action="life-easier"]');
    const easier = await text(page, '#now-panel');
    check('"Något lättare" offers a lighter thing or a small start', !easier.includes(second) || /fem minuter|börja|liten början/i.test(easier), easier.slice(0, 160));
    await tap(page, '#now-panel [data-action="life-do"]');
    check('"Gör det" turns the card into focus', (await text(page, '#now-panel')).includes('du gör nu'));
    const focused = await text(page, '#now-title');
    await tap(page, '#now-panel [data-action="life-done"]');
    const s = await stored(page);
    check('"Klart" completes it', s.life.items.some((i) => i.title.toLowerCase() === focused && i.status === 'done'), focused);
    check('the forest remembers what was done', (s.forest.moments || []).some((m) => m.title.toLowerCase() === focused));
    await tap(page, '#now-panel [data-action="life-notnow"]');
    check('"Inte nu" makes Aura quiet for a while', (await text(page, '#now-panel')).includes('tyst'));
    await tap(page, '.shortcuts [data-action="life-whatnow"]');
    check('"Vad nu?" brings the next thing straight back', (await page.locator('#now-panel[data-kind="quiet"]').count()) === 0 && (await page.locator('#now-panel').count()) === 1);
    await page.locator('.today-panel .a-row .a-check').first().click();
    await W(page, 600);
    check('a thing can be ticked off right in today’s list', (await stored(page)).life.items.filter((i) => i.status === 'done').length === 2);
    check('no errors along the way', !(await problems(page)).length, (await problems(page)).join('\n'));
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  section('4. Aura Pulse, Låg energi and Kaos');
  {
    const { ctx, page } = await open();
    await onboard(page);
    await dump(page, 'ring vårdcentralen i dag, mejla skolan i dag, städa hallen i dag, sortera papper i dag, laga lampan i dag');
    await confirmDump(page);
    await tap(page, '.shortcuts [data-action="life-pulse"]');
    check('Aura Pulse opens with energy, mood, stress and sleep — none required', (await page.locator('#life-sheet .a-scale').count()) === 4 && await page.locator('#life-pulse-form button[type=submit]').isDisabled());
    await tap(page, '#life-sheet [data-field="energy"][data-value="1"]');
    await tap(page, '#life-sheet [data-field="stress"][data-value="4"]');
    await page.fill('#pulse-note', 'sov dåligt');
    await tap(page, '#life-pulse-form button[type=submit]');
    const s1 = await stored(page);
    const key = todayKey(s1);
    check('the pulse is stored where Klara’s coach reads it too', s1.logs[key].pulse.energy === 1 && s1.logs[key].energy === 2 && s1.logs[key].stress === 4 && s1.logs[key].pulse.note === 'sov dåligt');
    check('Idag shows today’s pulse', (await text(page, '.a-pulse-strip')).includes('ork 1/5'));
    await page.evaluate(() => document.querySelector('#animal-response .animal-response-close')?.click());
    check('low energy leads to an offer to make the day smaller', (await text(page, '.today-panel')).includes('gör dagen mindre'));
    await tap(page, '.today-panel [data-route="low"]');
    check('Låg energi shows what moves where before anything changes', (await text(page)).includes('det här flyttar vi') && (await page.locator('.a-moves li').count()) >= 1);
    await tap(page, '[data-action="life-low-apply"]');
    const s2 = await stored(page);
    check('applying it switches today to low energy and moves things', s2.life.days[key].mode === 'low' && s2.life.items.some((i) => i.date && i.date > key));
    check('the page then says the day is smaller', (await text(page, '.world-header')).includes('mindre nu'));
    await tap(page, '.world-header [data-action="life-mode"]');
    check('and one tap returns to a normal day', (await stored(page)).life.days[key].mode === '');
    await go(page, 'coach');
    await tap(page, '[data-action="life-ask-chip"][data-text="Hjälp mig reda ut dagen"]');
    await tap(page, '#ask-result [data-route="chaos"]');
    await page.fill('#life-chaos-form textarea', 'svara Lisa, boka tvättid, skicka blanketten');
    await tap(page, '#life-chaos-form button[type=submit]');
    check('Kaos shows one thing at a time and hides the rest', (await page.locator('.chaos-card').count()) === 1 && (await text(page, '.chaos-card')).includes('osynliga'));
    const c1 = await text(page, '#chaos-title');
    await tap(page, '[data-action="life-chaos-done"]');
    const c2 = await text(page, '#chaos-title');
    check('finishing reveals the next', c1 !== c2 && (await text(page, '.chaos-card')).includes('1 av'), `${c1} → ${c2}`);
    await tap(page, '[data-action="life-chaos-stop"]');
    check('Kaos can always be left', (await stored(page)).life.days[key].chaos === null);
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  section('5. Min dag: quick add, the item sheet, drag to reorder, Bygg om min dag');
  {
    const { ctx, page } = await open();
    await onboard(page);
    await tap(page, '.today-panel [data-route="day"]');
    for (const line of ['vattna blommorna', 'ring banken i morgon', 'skriva rapporten', 'boka frisör', 'svara på mejl']) {
      await page.fill('#life-quick-input', line);
      await tap(page, '#life-quick-form button[type=submit]');
    }
    const plan = await text(page, '.day-page .a-panel');
    check('quick add puts undated things in today', plan.includes('vattna blommorna') && plan.includes('skriva rapporten'), plan.slice(0, 200));
    check('a thing for tomorrow stays out of today', !plan.includes('ring banken'));
    await page.locator('.day-page .a-row-main', { hasText: 'Skriva rapporten' }).click();
    await W(page);
    await page.fill('#life-item-form input[name="title"]', 'Skriva klart rapporten');
    await page.locator('#life-item-form label.chip', { hasText: 'Måste' }).click();
    await page.selectOption('#life-item-form select[name="repeat"]', 'weekdays');
    await tap(page, '#life-item-form button[type=submit]');
    check('the item sheet saves a new title and priority', (await text(page, '.a-group[data-bucket="must"]')).includes('skriva klart rapporten'));
    const saved = (await stored(page)).life.items.find((i) => i.title === 'Skriva klart rapporten');
    check('and can make it repeat on weekdays', saved && saved.recur && saved.recur.weekdays && saved.recur.weekdays.length === 5, JSON.stringify(saved && saved.recur));
    const goodTitles = () => page.$$eval('.a-group[data-bucket="good"] .a-row-main strong', (els) => els.map((e) => e.textContent));
    const goods = await goodTitles();
    if (goods.length >= 2) {
      await page.locator('.a-group[data-bucket="good"] .a-row-main').nth(1).click();
      await W(page);
      await tap(page, '#life-sheet [data-action="life-item-move"][data-dir="-1"]');
      await tap(page, '#life-sheet [data-action="life-close-sheet"]');
      const after = await goodTitles();
      check('things can be reordered from the sheet', after[0] === goods[1], `${goods.join(',')} → ${after.join(',')}`);
    }
    const before = await goodTitles();
    const handles = page.locator('.a-group[data-bucket="good"] .a-drag');
    if (before.length >= 3) {
      const from = await handles.nth(2).boundingBox();
      const to = await handles.nth(0).boundingBox();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 8; i += 1) await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + ((to.y - from.y - 10) * i) / 8);
      await page.mouse.up();
      await W(page, 300);
      const dragged = await goodTitles();
      check('and by dragging the handle', dragged[0] === before[2], `${before.join(',')} → ${dragged.join(',')}`);
    }
    await page.locator('.day-page .a-row-main', { hasText: 'Boka frisör' }).click();
    await W(page);
    await tap(page, '#life-sheet [data-action="life-item-delete"]');
    check('deleting asks for a second tap first', (await text(page, '#life-sheet')).includes('tryck igen'));
    await tap(page, '#life-sheet [data-action="life-item-delete"]');
    check('the second tap deletes', !(await stored(page)).life.items.some((i) => i.title === 'Boka frisör'));
    await tap(page, '[data-action="life-rebuild"]');
    check('Bygg om min dag shows a proposal before changing anything', (await text(page, '#life-sheet')).includes('bygg om min dag'));
    await tap(page, '#life-sheet [data-action="life-close-sheet"]');
    await tap(page, '[data-action="life-event-new"]');
    await page.fill('#life-event-form input[name="title"]', 'Tandläkaren');
    await page.fill('#life-event-form input[name="start"]', '15:00');
    await tap(page, '#life-event-form button[type=submit]');
    check('a fixed time can be added and shows in the day', (await text(page)).includes('tandläkaren'));
    check('no horizontal scrolling on Min dag', (await hscroll(page)) <= 0, await hscroll(page));
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  section('6. Livet — Maja’s lists');
  {
    const { ctx, page } = await open();
    await onboard(page);
    await go(page, 'life');
    check('Livet opens in Maja’s world with six lists', (await page.locator('.a-tabs [role="tab"]').count()) === 6);
    await page.fill('#life-inbox-form-input', 'kolla simskolan');
    await tap(page, '#life-inbox-form button[type=submit]');
    check('the inbox takes things without asking what they are', (await text(page, '#life-tab-panel')).includes('simskolan'));
    await tap(page, '[data-action="life-inbox-today"]');
    check('an inbox item can be moved to today in one tap', (await stored(page)).life.items.some((i) => i.status === 'open'));
    await tap(page, '[data-action="life-tab"][data-tab="shopping"]');
    await page.fill('#life-shop-form-input', 'mjölk, bröd och tandkräm');
    await tap(page, '#life-shop-form button[type=submit]');
    const shop = await text(page, '#life-tab-panel');
    check('shopping is split and grouped by department', shop.includes('mejeri') && shop.includes('hygien') && shop.includes('bröd'), shop.slice(0, 200));
    await tap(page, '#life-tab-panel [data-action="life-done"]');
    await W(page, 500);
    check('checking off a product works', (await stored(page)).life.items.some((i) => i.kind === 'shopping' && i.status === 'done'));
    await tap(page, '[data-action="life-tab"][data-tab="admin"]');
    await page.fill('#life-admin-form-input', 'betala hyran senast 30/9');
    await tap(page, '#life-admin-form button[type=submit]');
    await tap(page, '#life-tab-panel [data-action="life-admin-status"][data-status="waiting"]');
    check('an errand can be marked as waiting for an answer', (await stored(page)).life.items.some((i) => i.kind === 'admin' && i.adminStatus === 'waiting') && (await text(page, '#life-tab-panel')).includes('väntar på svar'));
    await tap(page, '#life-tab-panel [data-action="life-admin-status"][data-status="followup"]');
    const errand = (await stored(page)).life.items.find((i) => i.kind === 'admin');
    check('or to follow up later, with a date', errand.adminStatus === 'followup' && /^\d{4}-\d{2}-\d{2}$/.test(errand.followUp || ''), JSON.stringify(errand));
    await tap(page, '[data-action="life-tab"][data-tab="home"]');
    await page.fill('#life-chore-form-input', 'byta lakan');
    await page.selectOption('#life-chore-repeat', '2week');
    await tap(page, '#life-chore-form button[type=submit]');
    check('a home chore repeats as chosen', (await stored(page)).life.items.some((i) => i.kind === 'chore' && i.recur && i.recur.every === 2));
    await tap(page, '[data-action="life-tab"][data-tab="projects"]');
    await page.fill('#life-project-form-input', 'Renovera sovrummet');
    await tap(page, '#life-project-form button[type=submit]');
    await tap(page, '[data-action="life-project-open"]');
    await page.fill('#life-project-edit input[name="outcome"]', 'Ett lugnt sovrum');
    await tap(page, '#life-project-edit button[type=submit]');
    await page.fill('#life-step-input', 'Välja färg');
    await tap(page, '#life-step-form button[type=submit]');
    const project = (await stored(page)).life.projects[0];
    check('a project keeps its desired outcome', project.outcome === 'Ett lugnt sovrum');
    check('and shows only its next step to the day', (await text(page, '#life-sheet')).includes('nästa steg'));
    await tap(page, '#life-sheet [data-action="life-close-sheet"]');
    await tap(page, '[data-action="life-tab"][data-tab="routines"]');
    await tap(page, '[data-action="life-routine-add"][data-kind="morning"]');
    await tap(page, '[data-action="life-routine-open"]');
    await tap(page, '#life-sheet [data-action="life-routine-check"]');
    check('routines can be added and checked off', (await page.locator('#life-sheet .a-check[aria-pressed="true"]').count()) === 1);
    await tap(page, '#life-sheet [data-action="life-routine-edit"]');
    const steps = (await stored(page)).life.routines[0].steps.length;
    await page.fill('#life-routine-form input[name="name"]', 'Min morgon');
    await page.fill('#life-routine-form input[name="newStep"]', 'Vattna blommorna');
    await tap(page, '#life-routine-form button[type=submit]');
    const routine = (await stored(page)).life.routines[0];
    check('and edited: name and steps', routine.name === 'Min morgon' && routine.steps.length === steps + 1 && routine.steps.some((st) => st.label === 'Vattna blommorna'), JSON.stringify(routine.steps.map((st) => st.label)));
    await page.evaluate(() => document.querySelector('#life-sheet')?.open && document.querySelector('#life-sheet [data-action="life-close-sheet"]')?.click());
    await W(page);
    await tap(page, '.a-links [data-route="insights"]');
    check('Mönster is reached from Livet', (await text(page, '.world-copy')).includes('rytm'));
    check('with Maja’s observations — not diagnoses', (await text(page, '.observations')).includes('inte diagnoser'));
    check('and the Livet tab stays lit', (await page.getAttribute('.bottom-nav [data-route="life"]', 'aria-current')) === 'page');
    check('no errors in Livet', !(await problems(page)).length, (await problems(page)).join('\n'));
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  section('7. Kvällsavslut and Veckan');
  {
    const { ctx, page } = await open({ time: MON_1940 });
    await onboard(page);
    await dump(page, 'ring vårdcentralen i dag, mejla skolan i dag, betala räkningen i dag');
    await confirmDump(page);
    await go(page, 'life');
    await tap(page, '.a-links [data-route="evening"]');
    check('the evening reset opens with Maja', (await text(page, '.world-header')).includes('kvällsavslut'));
    const rows = await page.locator('.a-decision').count();
    await tap(page, '.a-decision [data-to="tomorrow"]');
    check('an unfinished thing moves to tomorrow in one tap', (await page.locator('.a-decision').count()) === rows - 1);
    await tap(page, '[data-action="life-evening-moveall"]');
    check('"Flytta allt klokt" gives the rest a day', (await page.locator('.a-decision').count()) === 0);
    await page.fill('#life-evening-form textarea', 'köpa present');
    await tap(page, '#life-evening-form button[type=submit]');
    check('thoughts before bed land in the inbox', (await stored(page)).life.items.some((i) => i.status === 'inbox'));
    await tap(page, '[data-action="life-evening-finish"]');
    check('closing the evening is remembered', (await text(page, '.world-header')).includes('stängd'));
    await go(page, 'life');
    await tap(page, '.a-links [data-route="week"]');
    check('Veckan renders a gentle look back', (await text(page)).includes('det som blev av'));
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  section('8. Prata med Aura and Klara’s coach');
  {
    const { ctx, page } = await open({ coach: 'ok' });
    await onboard(page);
    await dump(page, 'mjölk och bröd, ring banken i dag');
    await confirmDump(page);
    await tap(page, '.shortcuts [data-action="life-talk"]');
    await W(page, 300);
    check('"Prata med Aura" opens Klara’s page, ready to type', (await page.getAttribute('body', 'data-page')) === 'coach' && (await page.evaluate(() => document.activeElement?.id)) === 'life-ask-input');
    await tap(page, '[data-action="life-ask-chip"][data-text="Vad skulle jag köpa?"]');
    const ans = await text(page, '#ask-result');
    check('answers come from the plan, labelled as no AI', ans.includes('ingen ai') && ans.includes('mjölk'), ans.slice(0, 160));
    await page.fill('#life-ask-input', 'Jag har ingen ork i dag');
    await tap(page, '#life-ask-form button[type=submit]');
    const tired = await text(page, '#ask-result');
    check('"no energy" gets a concrete, plan-aware answer', /dagen (är redan liten|mindre)/.test(tired) && tired.includes('klara'), tired.slice(-220));
    await page.locator('.coach-need', { hasText: 'Få överblick' }).click();
    await tap(page, '[data-action="coach-next"]');
    await tap(page, '[data-coach-panel="1"] [data-action="coach-next"]');
    await tap(page, '#coach-form button[type=submit]');
    await page.waitForSelector('.ai-coach-response', { timeout: 5000 }).catch(() => {});
    check('Klara’s check-in still reaches the coach API and labels the answer Gemini', (await text(page)).includes('gemini'));
    check('and the answer links back to the day’s plan', (await text(page, '.coach-bridge')).includes('från din dag'));
    await ctx.close();
  }
  {
    const { ctx, page } = await open({ coach: 'down' });
    await onboard(page);
    await go(page, 'coach');
    await page.locator('.coach-need', { hasText: 'Mat & energi' }).click();
    await tap(page, '[data-action="coach-next"]');
    await tap(page, '[data-coach-panel="1"] [data-action="coach-next"]');
    await tap(page, '#coach-form button[type=submit]');
    await W(page, 600);
    const t = await text(page);
    check('when the AI is down Klara says so and still gives a concrete step', /svarar direkt|lokala/.test(t) && t.includes('klart'), t.slice(0, 200));
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  section('9. Existing worlds and settings');
  {
    const { ctx, page } = await open();
    await onboard(page);
    await go(page, 'cycle');
    check('Cykel (Liv) renders', (await text(page, '.world-copy')).includes('kroppen'));
    await go(page, 'ritual');
    check('Mystik (Astrid) renders', (await text(page, '.world-copy')).includes('mystik'));
    await tap(page, '[data-action="open-settings"]');
    await page.evaluate(() => { document.querySelector('.life-settings').open = true; });
    await page.locator('.life-settings input[name="module"][value="reflection"]').uncheck();
    await page.locator('.life-settings label.chip', { hasText: 'Mycket' }).click();
    await page.locator('.life-settings label.chip', { hasText: 'Inga' }).click();
    await tap(page, '#settings-form button[type=submit]');
    const prefs = (await stored(page)).life.prefs;
    check('planning density and nudges are personal settings', prefs.density === 'full' && prefs.notifications === 'off', `${prefs.density} ${prefs.notifications}`);
    check('Mystik can be switched off entirely', await page.locator('.bottom-nav [data-route="ritual"]').isHidden());
    check('and the page falls back to Idag instead of a hidden world', (await page.getAttribute('body', 'data-page')) === 'today');
    await tap(page, '[data-action="open-settings"]');
    await page.evaluate(() => { document.querySelector('.life-settings').open = true; });
    check('settings show what was saved', await page.locator('.life-settings input[name="density"][value="full"]').isChecked());
    await page.locator('.life-settings input[name="module"][value="reflection"]').check();
    await tap(page, '#settings-form button[type=submit]');
    check('and switched back on without losing anything', await page.locator('.bottom-nav [data-route="ritual"]').isVisible());
    await page.reload();
    await W(page, 400);
    check('after a reload onboarding stays closed', !(await page.locator('#onboarding-dialog[open]').count()));
    check('no errors in the existing worlds', !(await problems(page)).length, (await problems(page)).join('\n'));
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  section('10. An existing Aura (version 8) opens with everything intact');
  {
    const v8 = {
      version: 8, profile: { name: 'Robin', onboarded: true, waterTarget: 6, cycleLength: 28, periodLength: 5, birthDate: '' },
      preferences: { audioEnabled: false, audioVolume: 78, activeExperiment: null, experimentHistory: [] },
      cycle: { lastPeriod: '2026-09-12', events: [{ id: 'c1', date: '2026-09-12', type: 'period_start' }] },
      forest: { moments: [] }, logs: { '2026-09-28': { energy: 4, mood: 3, checkIns: [], pulse: { energy: 2, at: '2026-09-28T07:00:00.000Z' } } },
      journal: [{ id: 'j1', createdAt: '2026-09-20T19:00:00.000Z', prompt: '', text: 'En gammal rad i dagboken.' }],
      tarotReadings: [], toolbox: [], reminders: [], createdAt: '2026-08-01T10:00:00.000Z',
    };
    const { ctx, page } = await open({ init: { fn: ([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, arg: [STORAGE_KEY, JSON.stringify(v8)] } });
    await page.goto(base);
    await W(page, 400);
    check('no onboarding for someone who already has Aura', !(await page.locator('#onboarding-dialog[open]').count()));
    check('their name is still there', (await text(page, '.world-copy h1')).includes('robin'));
    check('the older one-tap energy still counts as today’s pulse', (await text(page, '.a-pulse-strip')).includes('ork 2/5'));
    const s = await stored(page);
    check('their journal is untouched and the everyday slice was added', s.journal[0].text === 'En gammal rad i dagboken.' && s.life && s.version === 9);
    await go(page, 'life');
    await tap(page, '.a-links [data-route="insights"]');
    check('the journal still shows in Mönster', (await text(page)).includes('en gammal rad i dagboken') || (await page.locator('#maja-memory').count()) === 1);
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  section('11. Failure states and small screens');
  {
    const { ctx, page } = await open({ init: { fn: () => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; } } });
    await page.goto(base);
    await W(page, 300);
    await page.fill('#onboarding-name', 'Robin');
    await tap(page, '[data-action="life-ob-finish"]');
    check('when the browser refuses to save, Aura still works and says it is not saved', (await text(page, '#toast')).includes('sparas inte') && (await page.locator('#now-panel').count()) === 1, await text(page, '#toast'));
    await page.fill('#life-quick-input', 'test utan lagring');
    await tap(page, '#life-quick-form button[type=submit]');
    check('and it never claims a save that did not happen', (await text(page, '#toast')).includes('sparas inte'), await text(page, '#toast'));
    await ctx.close();
  }
  for (const width of [360, 412]) {
    const { ctx, page } = await open({ width });
    await onboard(page);
    await dump(page, 'ring vårdcentralen i dag, mjölk, boka tandläkaren, städa badrummet varje vecka');
    await confirmDump(page);
    const nowBox = await page.evaluate(() => { const r = document.querySelector('#now-title').getBoundingClientRect(); return { bottom: r.bottom, nav: document.querySelector('.bottom-nav').getBoundingClientRect().top }; });
    check(`Just nu is readable without scrolling at ${width}px`, nowBox.bottom < nowBox.nav, JSON.stringify(nowBox));
    const overflow = {};
    for (const route of ['today', 'day', 'life', 'low', 'chaos', 'evening', 'week', 'coach']) {
      if (['today', 'life', 'coach'].includes(route)) await go(page, route);
      else await page.evaluate((r) => { const b = document.createElement('button'); b.dataset.route = r; b.hidden = true; document.body.append(b); b.click(); b.remove(); }, route);
      await W(page, 150);
      const h = await hscroll(page);
      if (h > 0) overflow[route] = h;
    }
    check(`no horizontal scrolling on any page at ${width}px`, !Object.keys(overflow).length, JSON.stringify(overflow));
    await go(page, 'today');
    const small = await page.evaluate(() => [...document.querySelectorAll('#now-panel button, .a-check, .a-drag, .shortcuts button, .a-quickadd button, .bottom-nav button:not([hidden])')]
      .map((el) => el.getBoundingClientRect()).filter((r) => r.width && (r.width < 40 || r.height < 40)).length);
    check(`tap targets are at least 40px at ${width}px`, small === 0, small);
    await shot(page, `e2e-${width}`);
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(`\n${'─'.repeat(56)}\n${pass} passed, ${fail} failed`);
  if (fail) console.log(`\nFailed:\n  ${failures.join('\n  ')}`);
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
