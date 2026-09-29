import type { Page } from 'playwright';
import type { Cms, ContactChannel, EcommercePlatform } from '../core/Types.js';
import { PRODUCT_PATH } from './LinkClassifier.js';

export interface SiteSignals {
  companyName: string | null;
  companyNameSource: string | null;
  platform: EcommercePlatform;
  platformEvidence: string | null;
  cms: Cms;
  cmsEvidence: string | null;
  ecommerceDetected: boolean;
  ecommerceEvidence: string[];
  contactChannels: ContactChannel[];
  agencyAttribution: string | null;
  agencyAttributionSource: string | null;
  /** Signals that the store looks maintained (recent copyright, stock states). */
  activityEvidence: string[];
  /** Observable indications the site sells to businesses rather than consumers. */
  b2bIndicators: string[];
  /** URL of a published accessibility statement, when the site links to one. */
  accessibilityStatementUrl: string | null;
  /** Rough catalogue breadth from the homepage — an activity/size proxy, not company data. */
  productLinkCount: number;
  links: { href: string; text: string; rel: string | null }[];
}

export interface RawSignals {
  html: string;
  title: string | null;
  ogSiteName: string | null;
  appName: string | null;
  generator: string | null;
  jsonLdNames: string[];
  jsonLdTypes: string[];
  globals: string[];
  scriptSrcs: string[];
  bodyClasses: string;
  mailtos: string[];
  tels: string[];
  contactFormHrefs: string[];
  footerText: string;
  cartHints: string[];
  priceHints: number;
  b2bHints: string[];
  accessibilityStatementUrl: string | null;
  links: { href: string; text: string; rel: string | null }[];
}

/**
 * Collect raw, verifiable page facts. Interpretation happens in Node so it can
 * be unit-tested without a browser — see `interpretSignals`.
 */
export async function collectRawSignals(page: Page): Promise<RawSignals> {
  return page.evaluate(() => {
    const attr = (selector: string, name: string) => document.querySelector(selector)?.getAttribute(name) ?? null;
    const jsonLdNames: string[] = [];
    const jsonLdTypes: string[] = [];
    for (const node of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
      try {
        const parsed = JSON.parse(node.textContent ?? '');
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          const graph = Array.isArray(item?.['@graph']) ? item['@graph'] : [item];
          for (const entry of graph) {
            if (typeof entry?.['@type'] === 'string') jsonLdTypes.push(entry['@type']);
            if (Array.isArray(entry?.['@type'])) jsonLdTypes.push(...entry['@type']);
            if (typeof entry?.name === 'string' && ['Organization', 'Store', 'OnlineStore', 'WebSite', 'LocalBusiness'].some((t) => String(entry['@type']).includes(t))) {
              jsonLdNames.push(entry.name);
            }
          }
        }
      } catch {
        /* malformed structured data is common; ignore it rather than guess */
      }
    }

    const w = window as unknown as Record<string, unknown>;
    const globals = ['Shopify', '__NEXT_DATA__', '__NUXT__', 'wc_add_to_cart_params', 'woocommerce_params', 'Magento', 'require', 'dataLayer', 'wp']
      .filter((key) => key in w);

    const links = Array.from(document.querySelectorAll('a[href]'))
      .slice(0, 600)
      .map((a) => ({
        href: (a as HTMLAnchorElement).href,
        text: (a.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
        rel: a.getAttribute('rel'),
      }));

    const bodyText = document.body?.innerText ?? '';
    const cartHints = ['varukorg', 'kundvagn', 'lägg i kundvagn', 'lägg i varukorg', 'köp nu', 'add to cart', 'till kassan', 'checkout']
      .filter((needle) => bodyText.toLowerCase().includes(needle));

    const priceHints = (bodyText.match(/\d[\d\s]*(,\d{2})?\s?(kr|SEK)\b/gi) ?? []).length;

    const lower = bodyText.toLowerCase();
    const b2bHints = ['exkl. moms', 'exkl moms', 'ex. moms', 'endast för företag', 'endast foretag', 'återförsäljare', 'aterforsaljare', 'grossist', 'b2b', 'företagskund', 'foretagskund']
      .filter((needle) => lower.includes(needle));

    const accessibilityStatementUrl =
      Array.from(document.querySelectorAll('a[href]'))
        .filter((a) => /(tillgänglighet|tillganglighet|accessibility|redogörelse|redogorelse)/i.test((a.textContent || '') + ' ' + (a as HTMLAnchorElement).href))
        .map((a) => (a as HTMLAnchorElement).href)[0] ?? null;

    const footer = document.querySelector('footer');
    return {
      html: document.documentElement.outerHTML.slice(0, 200000),
      title: document.title || null,
      ogSiteName: attr('meta[property="og:site_name"]', 'content'),
      appName: attr('meta[name="application-name"]', 'content'),
      generator: attr('meta[name="generator"]', 'content'),
      jsonLdNames,
      jsonLdTypes,
      globals,
      scriptSrcs: Array.from(document.querySelectorAll('script[src]')).map((s) => (s as HTMLScriptElement).src).slice(0, 200),
      bodyClasses: document.body?.className ?? '',
      mailtos: Array.from(document.querySelectorAll('a[href^="mailto:"]')).map((a) => (a as HTMLAnchorElement).href.replace('mailto:', '').split('?')[0]),
      tels: Array.from(document.querySelectorAll('a[href^="tel:"]')).map((a) => (a as HTMLAnchorElement).href.replace('tel:', '')),
      contactFormHrefs: Array.from(document.querySelectorAll('a[href]'))
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((href) => /(kontakt|contact|kundservice|customer-service|support)/i.test(href))
        .slice(0, 5),
      footerText: (footer?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 1500),
      cartHints,
      priceHints,
      b2bHints,
      accessibilityStatementUrl,
      links,
    };
  });
}

const PLATFORM_RULES: { platform: EcommercePlatform; test: (r: RawSignals) => string | null }[] = [
  { platform: 'shopify', test: (r) => (r.globals.includes('Shopify') || r.scriptSrcs.some((s) => s.includes('cdn.shopify.com')) ? 'Shopify runtime detected (window.Shopify / cdn.shopify.com)' : null) },
  {
    platform: 'woocommerce',
    test: (r) =>
      r.bodyClasses.includes('woocommerce') || r.globals.some((g) => g.startsWith('wc_') || g === 'woocommerce_params') || r.scriptSrcs.some((s) => s.includes('plugins/woocommerce'))
        ? 'WooCommerce assets or body class detected'
        : null,
  },
  { platform: 'magento', test: (r) => (r.globals.includes('Magento') || r.scriptSrcs.some((s) => /\/(static|mage)\/.*(mage|magento)/i.test(s)) ? 'Magento static assets detected' : null) },
  { platform: 'prestashop', test: (r) => (r.html.includes('prestashop') ? 'PrestaShop markers in markup' : null) },
  { platform: 'quickbutik', test: (r) => (r.scriptSrcs.some((s) => s.includes('quickbutik')) ? 'Quickbutik assets detected' : null) },
  { platform: 'jetshop', test: (r) => (r.scriptSrcs.some((s) => s.includes('jetshop')) || r.html.includes('jetshop') ? 'Jetshop markers detected' : null) },
  { platform: 'starweb', test: (r) => (r.html.includes('starweb') ? 'Starweb markers detected' : null) },
  { platform: 'wikinggruppen', test: (r) => (r.html.includes('wikinggruppen') ? 'Wikinggruppen markers detected' : null) },
  { platform: 'centra', test: (r) => (r.scriptSrcs.some((s) => s.includes('centra')) ? 'Centra assets detected' : null) },
];

function detectCms(raw: RawSignals): { cms: Cms; evidence: string | null } {
  if (raw.globals.includes('__NEXT_DATA__') || raw.scriptSrcs.some((s) => s.includes('/_next/'))) return { cms: 'next', evidence: 'Next.js build output (/_next/)' };
  if (raw.globals.includes('__NUXT__') || raw.scriptSrcs.some((s) => s.includes('/_nuxt/'))) return { cms: 'nuxt', evidence: 'Nuxt build output (/_nuxt/)' };
  if (/wordpress/i.test(raw.generator ?? '') || raw.scriptSrcs.some((s) => s.includes('/wp-content/'))) return { cms: 'wordpress', evidence: 'WordPress assets (/wp-content/)' };
  if (raw.globals.includes('Shopify')) return { cms: 'shopify', evidence: 'Shopify-hosted theme' };
  if (/drupal/i.test(raw.generator ?? '')) return { cms: 'drupal', evidence: 'generator meta reports Drupal' };
  if (/data-reactroot|__reactContainer|react-dom/i.test(raw.html)) return { cms: 'react_spa', evidence: 'React runtime markers in markup' };
  if (/data-v-app|__vue__/i.test(raw.html)) return { cms: 'vue_spa', evidence: 'Vue runtime markers in markup' };
  return { cms: 'unknown', evidence: null };
}

const AGENCY_PATTERNS = [
  /(?:byggd|utvecklad|skapad|designad)\s+av\s+([A-Za-zÅÄÖåäö0-9&.\- ]{2,40})/i,
  /(?:webb(?:design|byrå|utveckling))\s+(?:av|by)\s+([A-Za-zÅÄÖåäö0-9&.\- ]{2,40})/i,
  /(?:built|designed|developed|powered)\s+by\s+([A-Za-z0-9&.\- ]{2,40})/i,
];

/** Turn raw page facts into prospect fields. Never guesses: unknown stays unknown. */
export function interpretSignals(raw: RawSignals): SiteSignals {
  const platformHit = PLATFORM_RULES.map((rule) => ({ platform: rule.platform, evidence: rule.test(raw) })).find((r) => r.evidence);
  const cms = detectCms(raw);

  const ecommerceEvidence: string[] = [];
  if (platformHit) ecommerceEvidence.push(platformHit.evidence!);
  if (raw.jsonLdTypes.some((t) => /Product|Offer|OnlineStore/i.test(t))) ecommerceEvidence.push('schema.org Product/Offer structured data present');
  if (raw.cartHints.length) ecommerceEvidence.push(`cart vocabulary on the page: ${raw.cartHints.slice(0, 3).join(', ')}`);
  if (raw.priceHints >= 3) ecommerceEvidence.push(`${raw.priceHints} SEK price patterns on the homepage`);
  if (raw.links.some((l) => /\/(cart|varukorg|kundvagn|checkout|kassa)(\/|$|\?)/i.test(l.href))) ecommerceEvidence.push('cart or checkout link in the navigation');

  const companyName = raw.ogSiteName || raw.jsonLdNames[0] || raw.appName || null;
  const companyNameSource = raw.ogSiteName
    ? 'meta[property="og:site_name"]'
    : raw.jsonLdNames[0]
      ? 'schema.org Organization/WebSite name'
      : raw.appName
        ? 'meta[name="application-name"]'
        : null;

  const contactChannels: ContactChannel[] = [
    ...unique(raw.mailtos).map((value) => ({ kind: 'email' as const, value, source: 'homepage mailto: link' })),
    ...unique(raw.tels).map((value) => ({ kind: 'phone' as const, value, source: 'homepage tel: link' })),
    ...unique(raw.contactFormHrefs).slice(0, 2).map((value) => ({ kind: 'contact_form' as const, value, source: 'homepage navigation link' })),
  ];

  let agencyAttribution: string | null = null;
  let agencyAttributionSource: string | null = null;
  for (const pattern of AGENCY_PATTERNS) {
    const match = raw.footerText.match(pattern);
    if (match) {
      agencyAttribution = match[1].trim().replace(/[.,]$/, '');
      agencyAttributionSource = `site footer text: "${match[0].trim()}"`;
      break;
    }
  }

  const activityEvidence: string[] = [];
  const year = new Date().getFullYear();
  if (raw.footerText.includes(String(year)) || raw.footerText.includes(String(year - 1))) {
    activityEvidence.push('footer copyright mentions the current or previous year');
  }
  if (raw.priceHints >= 6) activityEvidence.push('homepage merchandises multiple priced products');

  const productLinkCount = new Set(raw.links.filter((l) => PRODUCT_PATH.test(l.href)).map((l) => l.href)).size;

  return {
    companyName,
    companyNameSource,
    platform: platformHit?.platform ?? (ecommerceEvidence.length ? 'custom_modern' : 'unknown'),
    platformEvidence: platformHit?.evidence ?? (ecommerceEvidence.length ? 'no known platform fingerprint; ecommerce behaviour present' : null),
    cms: cms.cms,
    cmsEvidence: cms.evidence,
    ecommerceDetected: ecommerceEvidence.length >= 2,
    ecommerceEvidence,
    contactChannels,
    agencyAttribution,
    agencyAttributionSource,
    activityEvidence,
    b2bIndicators: raw.b2bHints,
    accessibilityStatementUrl: raw.accessibilityStatementUrl,
    productLinkCount,
    links: raw.links,
  };
}

export async function detectSiteSignals(page: Page): Promise<SiteSignals> {
  return interpretSignals(await collectRawSignals(page));
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}
