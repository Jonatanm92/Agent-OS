#!/usr/bin/env node
/**
 * Fixture storefront farm.
 *
 * Runs several local shops on adjacent ports so the full pipeline can be
 * exercised without touching anyone's real website. Used by the test suite and
 * by `a11y-os demo`.
 */
import { createServer } from 'node:http';
import { renderPage, PRODUCTS, CATEGORIES, URL_STYLES } from './Sites.mjs';

const NO_BARRIERS = {};

const BAD_STORE_BARRIERS = {
  mouseOnlyFilter: true,
  noFocusStyle: true,
  unlabelledSearch: true,
  iconOnlyButtons: true,
  badAltText: true,
  focusableOffcanvas: true,
  newsletterModal: true,
  modalNoFocus: true,
  modalNoName: true,
  escapeDoesNotClose: true,
  lowContrast: true,
  reflowOverflow: true,
  headingSkip: true,
  vagueLinks: true,
  unlabelledGroups: true,
  unnamedLandmarks: true,
  orphanValidation: true,
};

export const SITES = {
  4181: {
    key: 'nordvik-hem',
    name: 'Nordvik Hem',
    email: 'kundservice@nordvikhem.example',
    phone: '+46311234567',
    bodyClass: 'woocommerce woocommerce-page',
    barriers: BAD_STORE_BARRIERS,
  },
  4182: {
    key: 'klarsikt-form',
    name: 'Klarsikt Form',
    email: 'hej@klarsiktform.example',
    phone: '+46812345678',
    bodyClass: '',
    accessibilityStatement: true,
    barriers: NO_BARRIERS,
  },
  4187: {
    key: 'flyttad',
    name: 'Flyttad butik',
    redirectTo: 4181,
    barriers: {},
  },
  4186: {
    key: 'skogsro',
    name: 'Skogsro',
    email: 'kontakt@skogsro.example',
    phone: '+46703456789',
    barriers: { clientRendered: true, noFocusStyle: true, unlabelledSearch: true },
  },
  4184: {
    key: 'gronskan-shop',
    name: 'Grönskan',
    email: 'hej@gronskan.example',
    phone: '+46701234567',
    urlStyle: 'shopify',
    barriers: { consentBanner: true, mouseOnlyFilter: true, noFocusStyle: true, badAltText: true },
  },
  4185: {
    key: 'vagbod',
    name: 'Vägbod',
    email: 'info@vagbod.example',
    phone: '+46702345678',
    barriers: { consentBanner: true, consentNoDecline: true, unlabelledSearch: true },
  },
  4183: {
    key: 'industripartner',
    name: 'Industripartner Norden',
    email: 'order@industripartner.example',
    phone: '+46101234567',
    b2b: true,
    barriers: { unlabelledSearch: true, noFocusStyle: true },
  },
};

function routeFor(url, urlStyle = 'swedish') {
  const style = URL_STYLES[urlStyle];
  const parsed = new URL(url, 'http://localhost');
  const path = parsed.pathname.replace(/\/$/, '') || '/';
  if (path === '/') return { type: 'home' };
  if (path === '/sok' || path === '/search' || path === style.search) return { type: 'search', query: parsed.searchParams.get('q') ?? '' };
  if (path === style.cart) return { type: 'cart' };
  if (path === style.login) return { type: 'login' };
  if (path === style.checkout) return { type: 'checkout' };
  if (path.startsWith(`${style.category}/`)) {
    const slug = path.split('/').pop();
    const category = CATEGORIES.find((c) => c.slug === slug);
    return category ? { type: 'category', slug, title: category.label } : { type: '404' };
  }
  if (path.startsWith(`${style.product}/`)) {
    const product = PRODUCTS.find((p) => p.slug === path.split('/').pop());
    return product ? { type: 'product', product } : { type: '404' };
  }
  if (path === '/kontakt') return { type: 'content', title: 'Kundservice', body: 'Ring oss vardagar 9–17 eller mejla kundservice.' };
  if (path === '/villkor') return { type: 'content', title: 'Köpvillkor', body: 'Öppet köp i 30 dagar. Fri retur.' };
  if (path === '/tillganglighet') return { type: 'content', title: 'Tillgänglighetsredogörelse', body: 'Vi arbetar löpande med tillgänglighet enligt WCAG 2.1 AA.' };
  return { type: '404' };
}

function b2bHome(site) {
  const page = renderPage({ ...site, name: site.name }, { type: 'home' });
  return page.replace(
    '<p class="muted">Handplockad inredning',
    '<p class="muted">Alla priser anges exkl. moms. Vi säljer endast till företag och återförsäljare. Ange organisationsnummer vid beställning.</p><p class="muted">Handplockad inredning',
  );
}

/** Every request the fixtures receive, so tests can assert what we did and did not do. */
export const REQUEST_LOG = [];

export function createFixtureServer(port, site) {
  return createServer((req, res) => {
    REQUEST_LOG.push({ port, method: req.method, url: req.url });
    // A site that has moved: everything, robots.txt included, redirects.
    if (site.redirectTo) {
      res.writeHead(301, { location: `http://localhost:${site.redirectTo}${req.url ?? '/'}` });
      res.end();
      return;
    }
    const route = routeFor(req.url ?? '/', site.urlStyle);
    if ((req.url ?? '').startsWith('/img/')) {
      res.writeHead(200, { 'content-type': 'image/svg+xml' });
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#dfe5e8"/></svg>');
      return;
    }
    if ((req.url ?? '') === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(`User-agent: *\nDisallow: /admin\nSitemap: http://localhost:${port}/sitemap.xml\n`);
      return;
    }
    if ((req.url ?? '') === '/sitemap.xml') {
      const style = URL_STYLES[site.urlStyle ?? 'swedish'];
      const base = `http://localhost:${port}`;
      const urls = [
        base + '/',
        ...CATEGORIES.map((c) => `${base}${style.category}/${c.slug}`),
        ...PRODUCTS.map((p) => `${base}${style.product}/${p.slug}`),
      ];
      res.writeHead(200, { 'content-type': 'application/xml' });
      res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
        .map((u) => `<url><loc>${u}</loc></url>`)
        .join('')}</urlset>`);
      return;
    }
    const url = `http://localhost:${port}`;
    const body = site.b2b && route.type === 'home' ? b2bHome({ ...site, url }) : renderPage({ ...site, url }, route);
    res.writeHead(route.type === '404' ? 404 : 200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  });
}

export async function startFixtures(ports = Object.keys(SITES).map(Number)) {
  const servers = [];
  for (const port of ports) {
    const server = createFixtureServer(port, SITES[port]);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    servers.push(server);
  }
  return {
    urls: ports.map((p) => `http://localhost:${p}`),
    async stop() {
      await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const handle = await startFixtures();
  console.log('Fixture storefronts running:');
  for (const url of handle.urls) console.log(`  ${url}`);
  process.on('SIGINT', async () => {
    await handle.stop();
    process.exit(0);
  });
}
