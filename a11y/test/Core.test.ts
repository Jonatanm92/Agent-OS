import { describe, expect, it } from 'vitest';
import { normalizeDomain, stableHash, toOrigin } from '../src/core/Ids.js';
import { localize, renderTemplate } from '../src/core/Copy.js';
import { isAllowed, parseRobots } from '../src/discovery/Robots.js';
import { classifyLinks, deriveSearchTerm, PRODUCT_PATH } from '../src/discovery/LinkClassifier.js';
import { isSitemapIndex, parseSitemapLocations, sitemapsFromRobots } from '../src/discovery/Sitemap.js';

describe('domain handling', () => {
  it('normalizes to a stable prospect key', () => {
    expect(normalizeDomain('https://WWW.Example.se/kategori/mattor?x=1')).toBe('example.se');
    expect(normalizeDomain('example.se:443')).toBe('example.se');
  });

  it('keeps non-default ports so local and staging sites stay addressable', () => {
    expect(normalizeDomain('http://localhost:4181/kassa')).toBe('localhost:4181');
  });

  it('derives an origin from a bare domain', () => {
    expect(toOrigin('example.se')).toBe('https://example.se');
    expect(toOrigin('http://localhost:4181/x')).toBe('http://localhost:4181');
  });
});

describe('finding signatures', () => {
  it('is stable for the same inputs and different for different ones', () => {
    expect(stableHash('a', 'b')).toBe(stableHash('a', 'b'));
    expect(stableHash('a', 'b')).not.toBe(stableHash('a', 'c'));
  });
});

describe('localization', () => {
  it('fills placeholders and drops unknown ones rather than printing them', () => {
    expect(renderTemplate('Hej {name}, {missing} tack', { name: 'Nordvik' })).toBe('Hej Nordvik, tack');
  });

  it('falls back to English when a market has no copy', () => {
    expect(localize({ sv: '', en: 'Fallback' }, 'sv')).toBe('Fallback');
  });
});

describe('robots.txt', () => {
  it('honours a disallow for the wildcard agent', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /admin\nDisallow: /checkout\n');
    expect(isAllowed(rules, '/')).toBe(true);
    expect(isAllowed(rules, '/admin/users')).toBe(false);
    expect(isAllowed(rules, '/kategori/mattor')).toBe(true);
  });

  it('prefers rules written for our own agent', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: a11yrevenueos\nDisallow: /admin\n');
    expect(isAllowed(rules, '/produkt/x')).toBe(true);
    expect(isAllowed(rules, '/admin')).toBe(false);
  });

  it('lets a more specific allow win over a disallow', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /produkt\nAllow: /produkt/kampanj\n');
    expect(isAllowed(rules, '/produkt/vanlig')).toBe(false);
    expect(isAllowed(rules, '/produkt/kampanj/x')).toBe(true);
  });
});

describe('link classification', () => {
  const origin = 'https://butik.se';
  const links = [
    { href: 'https://butik.se/kategori/mattor', text: 'Mattor', rel: null },
    { href: 'https://butik.se/produkt/ullmatta', text: 'Ullmatta', rel: null },
    { href: 'https://butik.se/varukorg', text: 'Varukorg', rel: null },
    { href: 'https://butik.se/logga-in', text: 'Logga in', rel: null },
    { href: 'https://butik.se/kassa', text: 'Till kassan', rel: null },
    { href: 'https://butik.se/sok?q=matta', text: 'Sök', rel: null },
    { href: 'https://annan.se/produkt/x', text: 'Extern', rel: null },
    { href: 'mailto:hej@butik.se', text: 'Mejl', rel: null },
  ];

  it('recognises Swedish ecommerce url shapes', () => {
    const { byType } = classifyLinks(links, origin);
    expect(byType.category).toContain('https://butik.se/kategori/mattor');
    expect(byType.product).toContain('https://butik.se/produkt/ullmatta');
    expect(byType.cart).toContain('https://butik.se/varukorg');
    expect(byType.account).toContain('https://butik.se/logga-in');
    expect(byType.checkout_entry).toContain('https://butik.se/kassa');
    expect(byType.search).toContain('https://butik.se/sok?q=matta');
  });

  it('never leaves the audited site', () => {
    const { internal } = classifyLinks(links, origin);
    expect(internal.some((url) => url.includes('annan.se'))).toBe(false);
    expect(internal.some((url) => url.startsWith('mailto:'))).toBe(false);
  });

  it('matches both Swedish and English product paths', () => {
    expect(PRODUCT_PATH.test('/produkt/ullmatta')).toBe(true);
    expect(PRODUCT_PATH.test('/produkter/ullmatta')).toBe(true);
    expect(PRODUCT_PATH.test('/products/rug')).toBe(true);
    expect(PRODUCT_PATH.test('/kategori/mattor')).toBe(false);
  });

  it('derives a search term from the store vocabulary', () => {
    const term = deriveSearchTerm([
      { href: '/a', text: 'Ullmatta Lofoten', rel: null },
      { href: '/b', text: 'Ullmatta Siri', rel: null },
      { href: '/c', text: 'Lampa', rel: null },
    ]);
    expect(term).toBe('ullmatta');
  });
});

describe('sitemap fallback', () => {
  it('extracts locations and decodes entities', () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://butik.se/produkt/matta</loc></url>
      <url><loc>https://butik.se/sok?q=a&amp;p=2</loc></url>
    </urlset>`;
    expect(parseSitemapLocations(xml)).toEqual(['https://butik.se/produkt/matta', 'https://butik.se/sok?q=a&p=2']);
  });

  it('recognises a sitemap index so nested files can be followed', () => {
    expect(isSitemapIndex('<sitemapindex xmlns="x"><sitemap><loc>a</loc></sitemap></sitemapindex>')).toBe(true);
    expect(isSitemapIndex('<urlset><url><loc>a</loc></url></urlset>')).toBe(false);
  });

  it('reads Sitemap directives out of robots.txt, where large stores put them', () => {
    const robots = 'User-agent: *\nDisallow: /admin\nSitemap: https://butik.se/sitemap_products.xml\nSitemap: https://butik.se/sitemap_pages.xml\n';
    expect(sitemapsFromRobots(robots)).toEqual(['https://butik.se/sitemap_products.xml', 'https://butik.se/sitemap_pages.xml']);
  });

  it('returns nothing rather than guessing when the XML has no locations', () => {
    expect(parseSitemapLocations('<html><body>Not a sitemap</body></html>')).toEqual([]);
  });
});
