/* Min vardag — test i riktig webbläsare, i mobilstorlek.
 * Kör utan db och utan AI, dvs. exakt reservläget: localStorage + regeltolkning.
 * Alla personer är påhittade. */
const { chromium, devices } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('nope'); return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const SEED = {
  version: 1,
  children: [
    { id: 'barn_alva', name: 'Alva' },
    { id: 'barn_noa', name: 'Noa' },
  ],
  needs: [
    { id: 'n1', childId: 'barn_alva', title: '2 byxor', garment: 'byxor', qty: 2, doneQty: 0, status: 'behover', note: '', deadline: '', history: [] },
    { id: 'n2', childId: 'barn_alva', title: 'Skaljacka', garment: 'skaljacka', qty: 1, doneQty: 0, status: 'behover', note: '', deadline: '', history: [] },
    { id: 'n3', childId: 'barn_noa', title: 'Skaljacka', garment: 'skaljacka', qty: 1, doneQty: 0, status: 'behover', note: '', deadline: '', history: [] },
    { id: 'n4', childId: 'barn_noa', title: '2 byxor', garment: 'byxor', qty: 2, doneQty: 0, status: 'behover', note: '', deadline: '', history: [] },
  ],
  tasks: [
    { id: 't1', title: 'Handla kläder', kind: 'inkop', minutes: 60, load: 'medel', context: 'butik', status: 'oppen', needIds: ['n1'], earliest: '', deadline: '', scheduledDate: '', childId: null, mustToday: false, source: 'manuell', lastOfferedDate: '' },
  ],
  sizes: [
    { id: 's1', childId: 'barn_alva', kind: 'marke', brand: 'Exempelbutiken', label: 'Storlek', value: '110', preliminary: true, note: '' },
  ],
  weekTemplate: {}, days: {}, commitments: [],
};

let pass = 0, fail = 0;
function check(name, condition, extra) {
  if (condition) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}${extra ? `\n      ${extra}` : ''}`); }
}

(async () => {
  const { server, port } = await serve();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'sv-SE',
    timezoneId: 'Europe/Stockholm',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/favicon/i.test(text) || (/404/.test(text) && /favicon/i.test(m.location().url || ''))) return;
    errors.push(`${text} @ ${m.location().url || ''}`);
  });

  // addInitScript körs vid VARJE navigering — så vi sår bara en gång,
  // annars skulle omladdningstestet återställa allt och alltid "lyckas".
  await page.addInitScript((seed) => {
    if (!localStorage.getItem('mv-test-seeded')) {
      localStorage.setItem('min-vardag:tillstand:v1', JSON.stringify(seed));
      localStorage.setItem('mv-test-seeded', '1');
    }
  }, SEED);

  console.log('\nMobil (Pixel 7, 412×915, sv-SE, Europe/Stockholm)');
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  check('sidan laddar utan javascript-fel', errors.length === 0, errors.join('\n      '));
  check('"Min dag" är startvyn', await page.locator('h1', { hasText: 'Min dag' }).count() === 1);
  check('rutan "Gör det här nu" finns', await page.locator('.now').count() >= 1);
  check('lagringsläget redovisas ärligt', /webbläsaren/i.test(await page.locator('.chiprow').last().innerText()));
  check('AI-läget redovisas ärligt', /Ingen AI|regeltolkning/i.test(await page.locator('body').innerText()));

  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('ingen vågrät scroll på mobil', scroll <= 1, `överskott: ${scroll}px`);

  const small = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('button')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.height < 36) bad.push(`${el.textContent.trim().slice(0, 24)} (${Math.round(r.height)}px)`);
    }
    return bad;
  });
  check('alla tryckytor är minst 36 px höga', small.length === 0, small.join(', '));

  /* --- navigering --- */
  for (const [label, heading] of [['Barn', 'Barn'], ['Kan vänta', 'Kan vänta'], ['Kväll', 'Kväll och morgon'], ['Berätta', 'Berätta']]) {
    await page.locator(`.nav button:has-text("${label}")`).click();
    await page.waitForTimeout(150);
    check(`navigering till ${label}`, await page.locator('h1', { hasText: heading }).count() === 1);
  }

  /* --- huvudflödet: oklar instruktion --- */
  await page.locator('#tell').fill('Jackan är köpt, men byxorna var slut.');
  await page.locator('button:has-text("Föreslå ändringar")').click();
  await page.waitForTimeout(500);

  const proposal = page.locator('.proposal');
  check('ett förslag visas', await proposal.count() === 1);
  check('förslaget säger att regler användes, inte AI', /regler \(ingen AI\)/i.test(await proposal.innerText()));
  const questions = page.locator('.proposal .question');
  check('appen frågar i stället för att gissa', await questions.count() >= 1,
    `frågor: ${await questions.count()}`);
  check('godkänn är låst tills något är valt',
    await page.locator('.proposal button:has-text("Godkänn")').isDisabled());

  check('båda oklarheterna blir var sin fråga', await questions.count() === 2,
    `frågor: ${(await questions.allInnerTexts()).join(' / ')}`);

  const jacketQ = questions.filter({ hasText: 'jacka' }).first();
  check('frågan om jackan listar båda barnen',
    (await jacketQ.locator('button').count()) >= 3);
  await jacketQ.locator('button:has-text("Noa")').click();
  await page.waitForTimeout(200);

  let changeText = (await proposal.locator('.change').allInnerTexts()).join(' | ');
  check('ändringen beskrivs i klartext före godkännande', /Bekräfta klart/.test(changeText), changeText);
  check('bara det jag svarat på blir en ändring',
    /Noa/.test(changeText) && !/Alva/.test(changeText), changeText);

  const trouserQ = questions.filter({ hasText: 'byx' }).first();
  await trouserQ.locator('button:has-text("Alva")').click();
  await page.waitForTimeout(200);
  changeText = (await proposal.locator('.change').allInnerTexts()).join(' | ');
  check('det som var slut står kvar som "kvar att ordna", inte som klart',
    /Kvar att ordna.*Alva.*Slut i butiken/s.test(changeText), changeText);

  await page.locator('.proposal button:has-text("Godkänn")').click();
  await page.waitForTimeout(400);
  check('en bekräftelse med ångra visas', await page.locator('.toast').count() === 1);

  /* --- kvarstår efter omladdning --- */
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.locator('.nav button:has-text("Barn")').click();
  await page.waitForTimeout(200);
  const barnText = await page.locator('#app').innerText();
  check('status finns kvar efter omladdning', /Bekräftat klart/.test(barnText), barnText.slice(0, 300));
  const alvaText = await page.locator('.card').filter({ hasText: 'Alva' }).first().innerText();
  const noaText = await page.locator('.card').filter({ hasText: 'Noa' }).first().innerText();
  check('Alvas jacka rördes inte — den var aldrig vald',
    /Behöver ordnas/.test(alvaText) && !/Bekräftat klart/.test(alvaText), alvaText.slice(0, 200));
  check('Noas jacka blev bekräftad', /Bekräftat klart/.test(noaText), noaText.slice(0, 200));
  check('Noas byxor rördes inte', /2 byxor/.test(noaText) && !/Slut i butiken/.test(noaText));
  check('orsaken "slut i butiken" sparades på rätt behov', /Slut i butiken/.test(alvaText), alvaText.slice(0, 200));

  /* --- delvis inköp --- */
  const alvaCard = page.locator('.card').filter({ hasText: 'Alva' }).first();
  await alvaCard.locator('.row', { hasText: '2 byxor' }).locator('.tick').click();
  await page.waitForTimeout(300);
  const partial = await alvaCard.innerText();
  check('ett av två köpta visas som delvis klart', /1 av 2 klara/.test(partial), partial.slice(0, 260));
  check('behovet ligger kvar under "Behöver ordnas"', /Behöver ordnas/.test(partial));

  /* --- ångra --- */
  await page.locator('.toast button:has-text("Ångra")').click();
  await page.waitForTimeout(300);
  check('ångra återställer delköpet', !/1 av 2 klara/.test(await page.locator('.card').filter({ hasText: 'Alva' }).first().innerText()));

  /* --- låg ork --- */
  await page.locator('.nav button:has-text("Min dag")').click();
  await page.waitForTimeout(200);
  const energyChip = page.locator('.chip', { hasText: 'Ork:' }).first();
  for (let i = 0; i < 4; i++) {
    if (/Låg/.test(await energyChip.innerText())) break;
    await energyChip.click(); await page.waitForTimeout(200);
  }
  check('orken går att sätta till låg', /Låg/.test(await page.locator('.chip', { hasText: 'Ork:' }).first().innerText()));
  const dayText = await page.locator('#app').innerText();
  check('låg ork ger en lättare dag utan skuldbeläggning',
    /Låg ork|Vila|Återhämtning|nödvändiga/i.test(dayText) && !/borde|misslyck|dålig/i.test(dayText));

  /* --- okänt schema --- */
  check('okänd arbetsdag visas som fråga, inte som antagande',
    /Arbete okänt|vet inte om du arbetar/i.test(dayText));
  check('inga påhittade lämningar när barnens dag är okänd',
    !/Lämna på förskolan/.test(dayText));

  /* --- kväll --- */
  await page.locator('.nav button:has-text("Kväll")').click();
  await page.waitForTimeout(200);
  const kvallText = await page.locator('#app').innerText();
  check('kvällsvyn hittar inte på förberedelser vid okänd morgondag',
    /Inget att förbereda|Inget behöver förberedas/.test(kvallText), kvallText.slice(0, 200));
  check('uppgångstiden 05.00 respekteras', /05:00/.test(kvallText));
  check('appen lovar inga påminnelser', /inga påminnelser/i.test(kvallText));

  /* --- mörkt läge --- */
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(200);
  const contrast = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    return { bg: cs.backgroundColor, fg: cs.color };
  });
  check('mörkt läge har egen bakgrund och text',
    contrast.bg !== 'rgba(0, 0, 0, 0)' && contrast.bg !== contrast.fg, JSON.stringify(contrast));

  check('inga javascript-fel under hela flödet', errors.length === 0, errors.slice(0, 3).join('\n      '));

  console.log(`\n${'─'.repeat(52)}\n${pass} godkända, ${fail} underkända`);
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
