/**
 * Fixture storefronts used to exercise the whole pipeline offline.
 *
 * These are deliberately realistic Swedish ecommerce pages, not synthetic test
 * cases: a shared header/nav/footer on every page (so systemic grouping has
 * something real to group), a filter drawer, a size picker, a newsletter modal,
 * a search page, a cart, a login form and a checkout entry.
 *
 * `barriers` switches individual defects on and off so the same generator
 * produces a badly built store, a well built one and a B2B site.
 */

const CATEGORIES = [
  { slug: 'mattor', label: 'Mattor' },
  { slug: 'belysning', label: 'Belysning' },
  { slug: 'textil', label: 'Textil' },
  { slug: 'forvaring', label: 'Förvaring' },
];

/** Swedish platforms use /kategori and /produkt; Shopify uses /collections and /products. */
export const URL_STYLES = {
  swedish: { category: '/kategori', product: '/produkt', cart: '/varukorg', search: '/sok', login: '/logga-in', checkout: '/kassa' },
  shopify: { category: '/collections', product: '/products', cart: '/cart', search: '/search', login: '/account/login', checkout: '/checkout' },
};

function navFor(style) {
  return CATEGORIES.map((c) => ({ href: `${style.category}/${c.slug}`, label: c.label }));
}

const NAV = navFor(URL_STYLES.swedish);

const PRODUCTS = [
  { slug: 'ullmatta-lofoten', name: 'Ullmatta Lofoten 170x240', price: 3495, cat: 'mattor' },
  { slug: 'jutematta-siri', name: 'Jutematta Siri 200x300', price: 2895, cat: 'mattor' },
  { slug: 'golvlampa-hilma', name: 'Golvlampa Hilma ek', price: 2195, cat: 'belysning' },
  { slug: 'bordslampa-vide', name: 'Bordslampa Vide opalglas', price: 1295, cat: 'belysning' },
  { slug: 'linnegardin-alva', name: 'Linnegardin Alva 140x250', price: 899, cat: 'textil' },
  { slug: 'pladd-nore', name: 'Pläd Nore lammull', price: 1450, cat: 'textil' },
  { slug: 'korg-hedda', name: 'Förvaringskorg Hedda sjögräs', price: 549, cat: 'forvaring' },
  { slug: 'hylla-sten', name: 'Vägghylla Sten ask', price: 1690, cat: 'forvaring' },
  { slug: 'lada-mira', name: 'Förvaringslåda Mira', price: 399, cat: 'forvaring' },
];

const money = (v) => `${v.toLocaleString('sv-SE')} kr`;

function styleOf(site) {
  return URL_STYLES[site.urlStyle ?? 'swedish'];
}

function head(site, title, barriers) {
  return `<!DOCTYPE html>
<html${barriers.noLang ? '' : ' lang="sv"'}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${title ? `<title>${title} | ${site.name}</title>` : ''}
<meta property="og:site_name" content="${site.name}">
${site.urlStyle === 'shopify' ? '<script>window.Shopify = { shop: "fixture.myshopify.com", locale: "sv" };</script><script src="https://cdn.shopify.com/s/files/theme.js" defer onerror="void 0"></script>' : ''}
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    name: site.name,
    url: site.url,
  })}</script>
<style>${styles(barriers)}</style>
</head>
<body class="${site.bodyClass ?? ''}">`;
}

function styles(barriers) {
  return `
  :root { --ink:#1d2733; --muted:${barriers.lowContrast ? '#a8b0b8' : '#4a5560'}; --line:#e2e6ea; --brand:#1f4f43; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: "Helvetica Neue", Arial, sans-serif; color: var(--ink); background:#fff; }
  a { color: var(--brand); }
  .topbar { background: var(--brand); color:#fff; font-size:13px; padding:8px 24px; }
  .topbar span { color:${barriers.lowContrast ? '#7fa79c' : '#ffffff'}; }
  header { display:flex; align-items:center; gap:24px; padding:18px 24px; border-bottom:1px solid var(--line); }
  .logo { font-weight:700; font-size:20px; letter-spacing:.02em; }
  nav ul { display:flex; gap:20px; list-style:none; margin:0; padding:0; }
  nav a { text-decoration:none; color:var(--ink); font-size:15px; }
  .tools { margin-left:auto; display:flex; gap:14px; align-items:center; }
  .icon-btn { background:none; border:0; font-size:18px; cursor:pointer; padding:6px; }
  .searchbox { display:flex; gap:6px; }
  .searchbox input { padding:8px 10px; border:1px solid var(--line); border-radius:4px; min-width:200px; }
  ${barriers.noFocusStyle ? '*:focus { outline: none; }' : 'a:focus-visible, button:focus-visible, input:focus-visible, [tabindex]:focus-visible { outline:3px solid #b45309; outline-offset:2px; }'}
  main { padding:24px; max-width:1120px; margin:0 auto; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:20px; }
  .card { border:1px solid var(--line); border-radius:6px; padding:12px; }
  .card img { width:100%; height:150px; object-fit:cover; border-radius:4px; background:#eef1f3; }
  .price { font-weight:700; }
  .muted { color: var(--muted); font-size:14px; }
  .filters { display:flex; gap:10px; margin:16px 0; }
  .drawer { position:fixed; top:0; right:0; width:320px; height:100%; background:#fff; border-left:1px solid var(--line); padding:20px; box-shadow:-8px 0 24px rgba(0,0,0,.12); }
  .drawer[hidden] { display:none; }
  .offcanvas { position:fixed; inset:0 auto 0 0; width:280px; background:#fff; padding:20px; transform:translateX(-110%); transition:transform .2s; z-index:5; }
  .offcanvas.open { transform:none; }
  .modal-backdrop { position:fixed; inset:0; background:rgba(15,23,42,.45); display:flex; align-items:center; justify-content:center; z-index:10; }
  .modal-backdrop[hidden] { display:none; }
  .modal { background:#fff; padding:24px; width:420px; border-radius:8px; }
  footer { border-top:1px solid var(--line); margin-top:48px; padding:24px; color:var(--muted); font-size:14px; }
  .btn { background:var(--brand); color:#fff; border:0; padding:12px 18px; border-radius:4px; font-size:15px; cursor:pointer; }
  .wide-table { width:${barriers.reflowOverflow ? '1180px' : '100%'}; border-collapse:collapse; }
  .wide-table td, .wide-table th { border:1px solid var(--line); padding:8px; font-size:14px; }
  .visually-hidden { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
  ${barriers.reflowOverflow
    ? ''
    : `@media (max-width: 700px) {
    header { flex-wrap:wrap; gap:12px; }
    nav ul { flex-wrap:wrap; gap:12px; }
    .tools { margin-left:0; }
    .searchbox input { min-width:0; width:100%; }
    .wide-table { display:block; overflow-x:auto; }
    main { padding:16px; }
  }`}
  `;
}

function header(site, barriers) {
  const style = styleOf(site);
  const nav = navFor(style);
  const searchLabel = barriers.unlabelledSearch
    ? '<input type="text" name="q" placeholder="Sök">'
    : '<label for="q" class="visually-hidden">Sök i butiken</label><input id="q" type="search" name="q" placeholder="Sök">';

  const cartButton = barriers.iconOnlyButtons
    ? `<a class="icon-btn" href="${style.cart}">🛒</a>`
    : `<a class="icon-btn" href="${style.cart}" aria-label="Varukorg">🛒</a>`;

  const accountButton = barriers.iconOnlyButtons
    ? `<a class="icon-btn" href="${style.login}">👤</a>`
    : `<a class="icon-btn" href="${style.login}" aria-label="Logga in">👤</a>`;

  // The off-canvas menu keeps its links focusable while closed — a very common
  // real-world defect that only a real Tab walk detects.
  const offcanvas = barriers.focusableOffcanvas
    ? `<div class="offcanvas" id="mobilmeny"><h2>Meny</h2><ul>${nav.map((n) => `<li><a href="${n.href}">${n.label}</a></li>`).join('')}</ul></div>`
    : '';

  return `${offcanvas}
<div class="topbar">Fri frakt över 999 kr · <span>Öppet köp i 30 dagar</span></div>
<header>
  <div class="logo">${site.name}</div>
  <nav${barriers.unnamedLandmarks ? '' : ' aria-label="Huvudmeny"'}>
    <ul>${nav.map((n) => `<li><a href="${n.href}">${n.label}</a></li>`).join('')}</ul>
  </nav>
  <div class="tools">
    <form class="searchbox" action="${style.search}" method="get" role="search">${searchLabel}
      ${barriers.iconOnlyButtons ? '<button class="icon-btn" type="submit">🔍</button>' : '<button class="icon-btn" type="submit" aria-label="Sök">🔍</button>'}
    </form>
    ${accountButton}
    ${cartButton}
  </div>
</header>`;
}

function footer(site, barriers) {
  return `<footer${barriers.unnamedLandmarks ? '' : ' aria-label="Sidfot"'}>
  <p>${site.name} AB · Storgatan 14, 411 38 Göteborg · <a href="mailto:${site.email}">${site.email}</a> · <a href="tel:${site.phone}">${site.phone}</a></p>
  <p><a href="/kontakt">Kundservice</a> · <a href="/villkor">Köpvillkor</a>${site.accessibilityStatement ? ' · <a href="/tillganglighet">Tillgänglighetsredogörelse</a>' : ''}</p>
  <p>© ${new Date().getFullYear()} ${site.name}. Webbdesign av Norrsken Digital.</p>
</footer>
${barriers.newsletterModal && barriers.onHomepage ? modalMarkup(barriers) : ''}
${barriers.consentBanner ? consentMarkup(barriers) : ''}
<script>${scripts(barriers)}</script>
</body></html>`;
}

/**
 * A Cookiebot-shaped consent wall: fixed, covers the viewport, traps focus, and
 * — in the `consentNoDecline` variant — offers no way to refuse. This is what
 * sits in front of nearly every real European storefront.
 */
function consentMarkup(barriers) {
  const decline = barriers.consentNoDecline
    ? ''
    : '<button type="button" id="CybotCookiebotDialogBodyLevelButtonLevelOptinAllowessential">Endast nödvändiga</button>';
  return `<div id="CybotCookiebotDialog" role="dialog" aria-label="Cookies" style="position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:50;display:flex;align-items:center;justify-content:center">
  <div style="background:#fff;padding:28px;max-width:520px;border-radius:8px">
    <h2>Vi använder kakor</h2>
    <p class="muted">Vi och våra partners använder cookies för att förbättra din upplevelse, mäta trafik och visa personligt anpassad marknadsföring.</p>
    ${decline}
    <button type="button" id="CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll">Tillåt alla</button>
    <!-- An icon-only close button with no accessible name: the single most
         common defect in real consent managers, and not the merchant's code. -->
    <button type="button" id="CybotCookiebotDialogBodyButtonDecline" class="cookiebot-close"><span aria-hidden="true">✕</span></button>
  </div>
</div>
<script>
  document.querySelectorAll('#CybotCookiebotDialog button').forEach((b) => {
    b.addEventListener('click', () => document.getElementById('CybotCookiebotDialog')?.remove());
  });
</script>`;
}

function modalMarkup(barriers) {
  return `<div class="modal-backdrop" id="nyhetsbrev" hidden ${barriers.modalNoName ? '' : 'aria-label="Nyhetsbrev"'} role="dialog" aria-modal="true">
  <div class="modal">
    <h2>Få 10% rabatt</h2>
    <p class="muted">Anmäl dig till vårt nyhetsbrev.</p>
    <form>
      ${barriers.unlabelledSearch ? '<input type="email" name="email" placeholder="Din e-post">' : '<label for="nl-email">E-postadress</label><input id="nl-email" type="email" name="email" autocomplete="email">'}
      <button class="btn" type="button">Anmäl mig</button>
    </form>
    <button class="icon-btn" id="stang-nyhetsbrev" ${barriers.iconOnlyButtons ? '' : 'aria-label="Stäng"'}>✕</button>
  </div>
</div>`;
}

function scripts(barriers) {
  return `
  document.querySelectorAll('[data-open-drawer]').forEach((el) => {
    ${barriers.mouseOnlyFilter
      ? `el.addEventListener('click', () => { const d = document.getElementById(el.getAttribute('data-open-drawer')); if (d) d.hidden = false; });`
      : `el.addEventListener('click', () => {
          const d = document.getElementById(el.getAttribute('data-open-drawer'));
          if (!d) return;
          d.hidden = false;
          el.setAttribute('aria-expanded', 'true');
          const focusable = d.querySelector('button, a, input, select');
          if (focusable) focusable.focus();
        });`}
  });
  ${barriers.escapeDoesNotClose ? '' : `document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.drawer:not([hidden]), .modal-backdrop:not([hidden])').forEach((d) => { d.hidden = true; });
  });`}
  const nl = document.getElementById('nyhetsbrev');
  if (nl) {
    setTimeout(() => { nl.hidden = false; ${barriers.modalNoFocus ? '' : 'nl.querySelector("input, button")?.focus();'} }, 400);
    document.getElementById('stang-nyhetsbrev')?.addEventListener('click', () => { nl.hidden = true; });
  }
  document.querySelectorAll('[data-toggle-menu]').forEach((el) => {
    el.addEventListener('click', () => document.getElementById('mobilmeny')?.classList.toggle('open'));
  });
  `;
}

function productCard(p, barriers, style = URL_STYLES.swedish) {
  const alt = barriers.badAltText ? `alt="${p.slug}.jpg"` : `alt="${p.name}"`;
  const href = `${style.product}/${p.slug}`;
  if (barriers.clientRendered) {
    // Router-push on click: no anchor anywhere, so link extraction finds
    // nothing and only the published sitemap leads to a product page.
    return `<article class="card" data-product="${p.slug}">
      <img src="/img/${p.slug}.svg" ${alt}>
      <h3>${p.name}</h3>
      <p class="price">${money(p.price)}</p>
      <div class="btn" role="button" onclick="void 0">Visa produkt</div>
    </article>`;
  }
  return `<article class="card">
    <a href="${href}"><img src="/img/${p.slug}.svg" ${alt}></a>
    <h3><a href="${href}">${p.name}</a></h3>
    <p class="price">${money(p.price)}</p>
    <p class="muted">Fri frakt · Leverans 2–4 dagar</p>
    ${barriers.vagueLinks ? `<a href="${href}">Läs mer</a>` : `<a href="${href}">Läs mer om ${p.name}</a>`}
    ${barriers.mouseOnlyFilter
      ? `<div class="icon-btn" role="button" onclick="void 0">♡ Spara</div>`
      : `<button class="icon-btn" type="button">♡ Spara i favoriter</button>`}
  </article>`;
}

function filterBar(barriers) {
  // The filter trigger is the flagship defect: a div that only responds to a
  // mouse click, so keyboard users cannot filter the listing at all.
  const trigger = barriers.mouseOnlyFilter
    ? `<div class="btn" data-open-drawer="filterpanel" role="button" tabindex="0">Filtrera</div>`
    : `<button class="btn" data-open-drawer="filterpanel" aria-expanded="false" aria-controls="filterpanel">Filtrera</button>`;
  return `<div class="filters">${trigger}
    <select ${barriers.unlabelledSearch ? '' : 'aria-label="Sortera produkter"'} name="sort">
      <option>Populärast</option><option>Pris stigande</option><option>Pris fallande</option>
    </select>
  </div>
  <div class="drawer" id="filterpanel" hidden ${barriers.modalNoName ? '' : 'aria-label="Filtrera produkter"'} role="dialog">
    <h2>Filtrera</h2>
    <fieldset ${barriers.unlabelledGroups ? 'style="border:0"' : ''}>
      ${barriers.unlabelledGroups ? '' : '<legend>Färg</legend>'}
      <label><input type="checkbox" name="farg" value="beige"> Beige</label>
      <label><input type="checkbox" name="farg" value="gra"> Grå</label>
      <label><input type="checkbox" name="farg" value="gron"> Grön</label>
    </fieldset>
    <button class="btn" type="button">Visa resultat</button>
  </div>`;
}

export function renderPage(site, route) {
  // The newsletter modal only appears on the homepage, as it does on real
  // stores — otherwise it would cover every page of the fixture.
  const b = { ...site.barriers, onHomepage: route.type === 'home' };
  const style = styleOf(site);
  const nav = navFor(style);
  const heading = (level, text) => `<h${level}>${text}</h${level}>`;

  if (route.type === 'home' && b.clientRendered) {
    // A React-style storefront: an empty shell that builds its navigation after
    // hydration, with product cards that are click handlers rather than links.
    // No amount of link extraction finds the product pages here — the site's
    // own sitemap is the only honest way in.
    const payload = JSON.stringify({
      nav: nav,
      products: PRODUCTS.slice(0, 6).map((p) => ({ slug: p.slug, name: p.name, price: p.price })),
    });
    return `${head(site, 'Inredning för hela hemmet', b)}${header(site, b)}
<main id="app"><p>Laddar…</p></main>
<script>
  const data = ${payload};
  setTimeout(() => {
    const app = document.getElementById('app');
    app.innerHTML = '<h1>${site.name}</h1>'
      + '<nav aria-label="Kategorier"><ul>' + data.nav.map((n) => '<li><a href="' + n.href + '">' + n.label + '</a></li>').join('') + '</ul></nav>'
      + '<div class="grid">' + data.products.map((p) =>
          '<article class="card" data-product="' + p.slug + '">'
          + '<img src="/img/' + p.slug + '.svg" alt="' + p.name + '">'
          + '<h3>' + p.name + '</h3><p class="price">' + p.price + ' kr</p>'
          + '<div class="btn" role="button" onclick="void 0">Visa produkt</div></article>').join('')
      + '</div>';
  }, 1200);
</script>${footer(site, b)}`;
  }

  if (route.type === 'home') {
    const featured = PRODUCTS.slice(0, 6).map((p) => productCard(p, b, style)).join('');
    // The badly built store also forgets its <title>; the good one does not.
    return `${head(site, b.noH1 ? null : 'Inredning för hela hemmet', b)}${header(site, b)}
<main>
  ${b.noH1 ? heading(2, `Välkommen till ${site.name}`) : heading(1, `${site.name} — inredning för hela hemmet`)}
  <p class="muted">Handplockad inredning från nordiska formgivare. Fri frakt över 999 kr.</p>
  ${b.headingSkip ? heading(4, 'Populärt just nu') : heading(2, 'Populärt just nu')}
  <div class="grid">${featured}</div>
  ${heading(2, 'Kategorier')}
  <ul>${nav.map((n) => `<li><a href="${n.href}">${n.label}</a></li>`).join('')}</ul>
  ${b.focusableOffcanvas ? '<button class="icon-btn" data-toggle-menu aria-label="Öppna meny">☰</button>' : ''}
</main>${footer(site, b)}`;
  }

  if (route.type === 'category') {
    const items = PRODUCTS.filter((p) => p.cat === route.slug);
    return `${head(site, route.title, b)}${header(site, b)}
<main>
  ${b.noH1 ? heading(2, route.title) : heading(1, route.title)}
  ${filterBar(b)}
  <div class="grid">${items.map((p) => productCard(p, b, style)).join('')}</div>
</main>${footer(site, b)}`;
  }

  if (route.type === 'product') {
    const p = route.product;
    return `${head(site, p.name, b)}${header(site, b)}
<main>
  ${b.noH1 ? heading(2, p.name) : heading(1, p.name)}
  <img src="/img/${p.slug}.svg" ${b.badAltText ? `alt="${p.slug}.jpg"` : `alt="${p.name}"`} style="max-width:420px;width:100%">
  <p class="price">${money(p.price)}</p>
  <p class="muted">Artikelnummer ${p.slug.toUpperCase()} · I lager</p>
  <fieldset ${b.unlabelledGroups ? 'style="border:0"' : ''}>
    ${b.unlabelledGroups ? '' : '<legend>Storlek</legend>'}
    <label><input type="radio" name="storlek" value="s"> 140x200</label>
    <label><input type="radio" name="storlek" value="m"> 170x240</label>
    <label><input type="radio" name="storlek" value="l"> 200x300</label>
  </fieldset>
  <button class="btn" type="button">Lägg i varukorg</button>
  ${heading(2, 'Produktinformation')}
  <table class="wide-table">
    <tr><th>Material</th><td>100% ull</td><th>Ursprung</th><td>Portugal</td><th>Tvätt</th><td>Kemtvätt</td></tr>
    <tr><th>Vikt</th><td>8,4 kg</td><th>Tjocklek</th><td>12 mm</td><th>Garanti</th><td>2 år</td></tr>
  </table>
</main>${footer(site, b)}`;
  }

  if (route.type === 'search') {
    const hits = PRODUCTS.filter((p) => p.name.toLowerCase().includes((route.query || '').toLowerCase()));
    return `${head(site, `Sökresultat för ${route.query}`, b)}${header(site, b)}
<main>
  ${b.noH1 ? heading(2, `Sökresultat`) : heading(1, `Sökresultat för "${route.query}"`)}
  <p class="muted">${hits.length} produkter</p>
  ${filterBar(b)}
  <div class="grid">${hits.map((p) => productCard(p, b, style)).join('')}</div>
</main>${footer(site, b)}`;
  }

  if (route.type === 'cart') {
    return `${head(site, 'Varukorg', b)}${header(site, b)}
<main>
  ${b.noH1 ? heading(2, 'Varukorg') : heading(1, 'Varukorg')}
  <p class="muted">Din varukorg är tom.</p>
  <a class="btn" href="/">Fortsätt handla</a>
  <p><a href="/kassa">Till kassan</a></p>
</main>${footer(site, b)}`;
  }

  if (route.type === 'login') {
    return `${head(site, 'Logga in', b)}${header(site, b)}
<main>
  ${b.noH1 ? heading(2, 'Logga in') : heading(1, 'Logga in')}
  <form action="${style.login}" method="post">
    ${b.unlabelledSearch
      ? '<input type="email" name="email" placeholder="E-post"><input type="password" name="password" placeholder="Lösenord">'
      : '<label for="epost">E-postadress</label><input id="epost" type="email" name="email" autocomplete="email"><label for="losen">Lösenord</label><input id="losen" type="password" name="password" autocomplete="current-password">'}
    ${b.orphanValidation ? '<p class="error">Fel e-post eller lösenord.</p>' : ''}
    <button class="btn" type="submit">Logga in</button>
  </form>
</main>${footer(site, b)}`;
  }

  if (route.type === 'checkout') {
    return `${head(site, 'Kassa', b)}${header(site, b)}
<main>
  ${b.noH1 ? heading(2, 'Kassa') : heading(1, 'Kassa')}
  <p class="muted">Din varukorg är tom — lägg till produkter för att gå vidare.</p>
  <form>
    ${b.unlabelledSearch
      ? '<input name="namn" placeholder="Namn"><input name="adress" placeholder="Adress"><input name="postnummer" placeholder="Postnummer">'
      : '<label for="namn">Namn</label><input id="namn" name="namn" autocomplete="name"><label for="adress">Adress</label><input id="adress" name="adress" autocomplete="street-address"><label for="pnr">Postnummer</label><input id="pnr" name="postnummer" autocomplete="postal-code">'}
  </form>
</main>${footer(site, b)}`;
  }

  if (route.type === 'content') {
    return `${head(site, route.title, b)}${header(site, b)}
<main>${heading(1, route.title)}<p>${route.body}</p></main>${footer(site, b)}`;
  }

  return `${head(site, 'Sidan hittades inte', b)}${header(site, b)}<main><h1>404</h1></main>${footer(site, b)}`;
}

export { NAV, PRODUCTS, CATEGORIES };
