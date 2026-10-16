#!/usr/bin/env node
// Demo-site generator for the "Hemsida på 24 timmar" offer.
// Turns one lead (public business details) into a self-contained, mobile-first one-page site.
// Usage: node demo-site/generate.mjs leads.json [--out dir] [--live]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CATEGORIES = {
  frisor: {
    label: 'Frisör',
    tagline: city => `Klippning och färg i ${city}`,
    intro: 'Boka en tid för klippning, färg eller bara en snabb uppfräschning. Ring oss så hittar vi en tid som passar dig.',
    services: ['Klippning', 'Färg och slingor', 'Barnklippning', 'Skäggtrimning'],
    cta: 'Ring och boka',
    palette: { bg: '#F7F3F1', ink: '#23191A', accent: '#8A3A33', soft: '#ECE0DC' }
  },
  skonhet: {
    label: 'Skönhet och hälsa',
    tagline: city => `Behandlingar i lugn miljö i ${city}`,
    intro: 'Ta en stund för dig själv. Ring eller skicka ett meddelande så bokar vi en behandling som passar dig.',
    services: ['Naglar', 'Ansiktsbehandling', 'Fransar och bryn', 'Massage'],
    cta: 'Boka en tid',
    palette: { bg: '#F6F4F7', ink: '#221C26', accent: '#6E3F7A', soft: '#E7E0EB' }
  },
  hantverkare: {
    label: 'Hantverkare',
    tagline: city => `Hantverk du kan lita på i ${city} med omnejd`,
    intro: 'Vi tar uppdrag åt privatpersoner och företag. Ring för en kostnadsfri offert, så kommer vi ut och tittar.',
    services: ['Renovering', 'Reparationer', 'Nybyggnation', 'Offert på plats'],
    cta: 'Ring för offert',
    palette: { bg: '#F3F4F2', ink: '#1A1F1B', accent: '#B4581C', soft: '#E3E6E1' }
  },
  stad: {
    label: 'Städ',
    tagline: city => `Städning för hem och kontor i ${city}`,
    intro: 'Vi städar hem, trapphus och kontor. Ring så berättar vi vad det kostar för just dig.',
    services: ['Hemstäd', 'Flyttstäd', 'Fönsterputs', 'Kontorsstäd'],
    cta: 'Ring för pris',
    palette: { bg: '#F1F5F6', ink: '#14212A', accent: '#1F6F8B', soft: '#DCE8EC' }
  },
  bilverkstad: {
    label: 'Bilverkstad',
    tagline: city => `Service och reparationer i ${city}`,
    intro: 'Service, reparationer och däckbyte. Ring oss så bokar vi in bilen.',
    services: ['Service', 'Reparationer', 'Däckbyte och förvaring', 'Felsökning'],
    cta: 'Ring och boka',
    palette: { bg: '#F2F3F5', ink: '#15181E', accent: '#C0392B', soft: '#E1E4EA' }
  },
  restaurang: {
    label: 'Restaurang',
    tagline: city => `Mat lagad med omsorg i ${city}`,
    intro: 'Välkommen in, eller ring och beställ för avhämtning.',
    services: ['Lunch', 'À la carte', 'Avhämtning', 'Catering'],
    cta: 'Ring och beställ',
    palette: { bg: '#F8F4EE', ink: '#221A12', accent: '#9C4A12', soft: '#EDE3D6' }
  },
  cafe: {
    label: 'Café',
    tagline: city => `Kaffe och bakverk i ${city}`,
    intro: 'Kom in på en kopp, eller ring och beställ tårta och fikabröd.',
    services: ['Kaffe', 'Bakverk', 'Lunch', 'Tårtbeställning'],
    cta: 'Ring oss',
    palette: { bg: '#F6F2EC', ink: '#2A1F17', accent: '#6B4A2F', soft: '#E8DED2' }
  },
  djur: {
    label: 'Djur',
    tagline: city => `För dig och ditt djur i ${city}`,
    intro: 'Ring eller skicka ett meddelande så bokar vi en tid för din fyrbenta vän.',
    services: ['Trimning', 'Bad och klo', 'Valpbesök', 'Rådgivning'],
    cta: 'Boka en tid',
    palette: { bg: '#F3F5F0', ink: '#1B2116', accent: '#4F7A28', soft: '#E1E8D8' }
  },
  ovrigt: {
    label: 'Företag',
    tagline: city => `Lokalt företag i ${city}`,
    intro: 'Ring eller mejla oss så hjälper vi dig.',
    services: ['Tjänst 1', 'Tjänst 2', 'Tjänst 3'],
    cta: 'Kontakta oss',
    palette: { bg: '#F3F4F6', ink: '#171A20', accent: '#2E5AAC', soft: '#E2E6EE' }
  }
};

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e').replace(/ü/g, 'u')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'foretag';
}

// "0521-123 45" -> "+4652112345"; returns '' when no usable digits remain.
export function normalizePhone(phone) {
  const raw = String(phone ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return '+' + digits;
  if (digits.startsWith('00')) return '+' + digits.slice(2);
  if (digits.startsWith('0')) return '+46' + digits.slice(1);
  if (digits.startsWith('46')) return '+' + digits;
  return digits;
}

export function safeUrl(url) {
  const s = String(url ?? '').trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
}

function normalizeServices(services, fallback) {
  const list = Array.isArray(services) && services.length ? services : fallback.map(name => ({ name }));
  return list.map(s => (typeof s === 'string' ? { name: s } : { name: s.name, price: s.price, note: s.note }))
    .filter(s => s.name);
}

function normalizeHours(hours) {
  if (!hours) return [];
  if (Array.isArray(hours)) return hours.filter(h => Array.isArray(h) && h.length >= 2).map(([d, t]) => [String(d), String(t)]);
  return Object.entries(hours).map(([d, t]) => [d, String(t)]);
}

export function validateLead(lead) {
  const problems = [];
  if (!lead || typeof lead !== 'object') return ['lead måste vara ett objekt'];
  if (!String(lead.name ?? '').trim()) problems.push('name saknas');
  if (!normalizePhone(lead.phone) && !String(lead.email ?? '').trim() && !String(lead.address ?? '').trim()) problems.push('phone, email eller address behövs');
  if (lead.category && !CATEGORIES[lead.category]) problems.push(`okänd category "${lead.category}" (välj ${Object.keys(CATEGORIES).join(', ')})`);
  return problems;
}

export function renderSite(lead, { live = false, maker = '' } = {}) {
  const problems = validateLead(lead);
  if (problems.length) throw new Error(`Ogiltigt lead (${lead && lead.name ? lead.name : 'utan namn'}): ${problems.join('; ')}`);

  const cat = CATEGORIES[lead.category] || CATEGORIES.ovrigt;
  const city = String(lead.city ?? '').trim() || 'din ort';
  const name = String(lead.name).trim();
  const tagline = String(lead.tagline ?? '').trim() || cat.tagline(city);
  const intro = String(lead.about ?? '').trim() || cat.intro;
  const tel = normalizePhone(lead.phone);
  const email = String(lead.email ?? '').trim();
  const address = String(lead.address ?? '').trim();
  const services = normalizeServices(lead.services, cat.services);
  const usedDefaultServices = !(Array.isArray(lead.services) && lead.services.length) || lead.servicesAreExamples === true;
  const hours = normalizeHours(lead.hours);
  const booking = safeUrl(lead.bookingUrl);
  const facebook = safeUrl(lead.facebook);
  const instagram = safeUrl(lead.instagram);
  const mapsUrl = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${address}`)}` : '';
  const p = Object.assign({}, cat.palette, lead.palette || {});
  const year = new Date().getFullYear();

  const primary = booking
    ? `<a class="btn btn-main" href="${esc(booking)}">${esc(cat.cta)}</a>`
    : tel ? `<a class="btn btn-main" href="tel:${esc(tel)}">${esc(cat.cta)}</a>`
    : email ? `<a class="btn btn-main" href="mailto:${esc(email)}">${esc(cat.cta)}</a>`
    : `<a class="btn btn-main" href="${esc(mapsUrl)}">Hitta hit</a>`;
  const secondary = mapsUrl && (booking || tel || email) ? `<a class="btn btn-alt" href="${esc(mapsUrl)}">Hitta hit</a>` : '';

  const banner = live ? '' : `
  <div class="demo-banner" role="note">
    <strong>Förslag till ${esc(name)}${maker ? ` från ${esc(maker)}` : ''}.</strong> Sidan är inte publicerad.${usedDefaultServices ? ' Tjänsterna är exempel och byts mot era.' : ''}
  </div>`;

  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)} | ${esc(cat.label)} i ${esc(city)}</title>
<meta name="description" content="${esc(`${name}: ${tagline}.`)}">
${live ? '' : '<meta name="robots" content="noindex, nofollow">\n'}<style>
:root { --bg: ${p.bg}; --ink: ${p.ink}; --accent: ${p.accent}; --soft: ${p.soft}; --card: #FFFFFF; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
a { color: var(--accent); }
.wrap { max-width: 960px; margin: 0 auto; padding: 0 20px; }
.demo-banner { background: #FFE58A; color: #2B2200; font-size: 14px; padding: 10px 20px; text-align: center; }
header.bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 0; }
.logo { font-weight: 800; font-size: 19px; letter-spacing: -0.01em; text-decoration: none; color: var(--ink); }
.bar-call { font-weight: 700; text-decoration: none; white-space: nowrap; }
.hero { padding: 48px 0 40px; }
.eyebrow { text-transform: uppercase; letter-spacing: 0.12em; font-size: 13px; font-weight: 700; color: var(--accent); margin: 0 0 12px; }
h1 { font-size: clamp(34px, 7vw, 60px); line-height: 1.05; letter-spacing: -0.02em; margin: 0 0 16px; text-wrap: balance; }
.lead { font-size: 19px; max-width: 34em; margin: 0 0 28px; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; }
.btn { display: inline-block; padding: 14px 22px; border-radius: 10px; font-weight: 700; text-decoration: none; }
.btn-main { background: var(--accent); color: #FFFFFF; }
.btn-alt { background: var(--card); color: var(--ink); border: 1px solid var(--soft); }
.strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; padding: 0 0 40px; }
.strip div { background: var(--card); border-radius: 12px; padding: 16px; }
.strip b { display: block; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); margin-bottom: 4px; }
section { padding: 36px 0; border-top: 1px solid var(--soft); }
h2 { font-size: 26px; margin: 0 0 18px; letter-spacing: -0.01em; }
.services { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
.services li { background: var(--card); border-radius: 12px; padding: 16px; display: flex; justify-content: space-between; gap: 10px; }
.services .price { font-weight: 700; white-space: nowrap; }
.services .note { display: block; font-size: 14px; opacity: 0.75; }
table.hours { border-collapse: collapse; width: 100%; max-width: 420px; }
table.hours td { padding: 8px 0; border-bottom: 1px solid var(--soft); }
table.hours td + td { text-align: right; font-variant-numeric: tabular-nums; }
footer { padding: 32px 0 48px; font-size: 14px; border-top: 1px solid var(--soft); }
footer .row { display: flex; flex-wrap: wrap; gap: 8px 20px; }
.credit { margin-top: 14px; opacity: 0.6; }
</style>
</head>
<body>
${banner}
<div class="wrap">
  <header class="bar">
    <a class="logo" href="#">${esc(name)}</a>
    ${tel ? `<a class="bar-call" href="tel:${esc(tel)}">${esc(lead.phone)}</a>` : ''}
  </header>

  <div class="hero">
    <p class="eyebrow">${esc(cat.label)} · ${esc(city)}</p>
    <h1>${esc(name)}</h1>
    <p class="lead">${esc(tagline)}. ${esc(intro)}</p>
    <div class="actions">${primary}${secondary}</div>
  </div>

  <div class="strip">
    ${address ? `<div><b>Adress</b>${esc(address)}</div>` : ''}
    ${tel ? `<div><b>Telefon</b><a href="tel:${esc(tel)}">${esc(lead.phone)}</a></div>` : ''}
    ${email ? `<div><b>Mejl</b><a href="mailto:${esc(email)}">${esc(email)}</a></div>` : ''}
  </div>

  <section id="tjanster">
    <h2>Det här hjälper vi till med</h2>
    <ul class="services">
      ${services.map(s => `<li><span>${esc(s.name)}${s.note ? `<span class="note">${esc(s.note)}</span>` : ''}</span>${s.price ? `<span class="price">${esc(s.price)}</span>` : ''}</li>`).join('\n      ')}
    </ul>
  </section>

  ${hours.length ? `<section id="oppettider">
    <h2>Öppettider</h2>
    <table class="hours"><tbody>
      ${hours.map(([d, t]) => `<tr><td>${esc(d)}</td><td>${esc(t)}</td></tr>`).join('\n      ')}
    </tbody></table>
  </section>` : ''}

  ${address ? `<section id="hitta-hit">
    <h2>Hitta hit</h2>
    <p>${esc(address)}</p>
    <p><a class="btn btn-alt" href="${esc(mapsUrl)}">Öppna i Google Maps</a></p>
  </section>` : ''}

  <footer>
    <div class="row">
      <strong>${esc(name)}</strong>
      ${tel ? `<a href="tel:${esc(tel)}">${esc(lead.phone)}</a>` : ''}
      ${email ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : ''}
      ${facebook ? `<a href="${esc(facebook)}">Facebook</a>` : ''}
      ${instagram ? `<a href="${esc(instagram)}">Instagram</a>` : ''}
    </div>
    <div class="credit">© ${year} ${esc(name)}${maker && live ? ` · Hemsida: ${esc(maker)}` : ''}</div>
  </footer>
</div>
</body>
</html>
`;
}

export function loadLeads(text) {
  const parsed = JSON.parse(text);
  const leads = Array.isArray(parsed) ? parsed : parsed.leads;
  if (!Array.isArray(leads)) throw new Error('Filen måste vara en lista med leads eller {"leads": [...]}');
  return leads;
}

function main(argv) {
  const args = argv.slice(2);
  const file = args.find(a => !a.startsWith('--'));
  if (!file) {
    console.error('Användning: node demo-site/generate.mjs leads.json [--out mapp] [--live] [--maker "Ditt namn"]');
    process.exit(1);
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const outIdx = args.indexOf('--out');
  const outDir = resolve(outIdx >= 0 ? args[outIdx + 1] : join(here, 'out'));
  const makerIdx = args.indexOf('--maker');
  const maker = makerIdx >= 0 ? args[makerIdx + 1] : '';
  const live = args.includes('--live');

  const leads = loadLeads(readFileSync(resolve(file), 'utf8'));
  let ok = 0;
  for (const lead of leads) {
    try {
      const html = renderSite(lead, { live, maker });
      const dir = join(outDir, lead.slug ? slugify(lead.slug) : slugify(`${lead.name} ${lead.city ?? ''}`));
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'index.html'), html);
      console.log(`✓ ${lead.name} -> ${join(dir, 'index.html')}`);
      ok++;
    } catch (err) {
      console.error(`✗ ${err.message}`);
    }
  }
  console.log(`\n${ok} av ${leads.length} demosidor klara i ${outDir}`);
  console.log('Lägg upp en mapp gratis: dra den till https://app.netlify.com/drop');
  if (ok < leads.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv);
