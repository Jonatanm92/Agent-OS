import type { BrowserContext, Page } from 'playwright';
import type { PlatformConfig } from '../core/Config.js';
import type { Logger } from '../core/Logger.js';
import type { ConsentDecision, JourneyStep, PageType, RobotsDecision } from '../core/Types.js';
import { JOURNEY_PAGE_TYPES } from '../core/Types.js';
import { BrowserSession, settle } from './Browser.js';
import { fetchRobots } from './Robots.js';
import { handleConsentBanner } from './ConsentManager.js';
import { classifyLinks, deriveSearchTerm, type SiteLink } from './LinkClassifier.js';
import { fetchSitemapUrls, type SitemapResult } from './Sitemap.js';
import { collectRawSignals, interpretSignals, type SiteSignals } from './PlatformDetect.js';

export interface JourneyVisit {
  pageType: PageType;
  url: string;
  page: Page;
  httpStatus: number | null;
  title: string | null;
}

/** Called while the page is still open, so each page is fetched exactly once. */
export type JourneyHandler = (visit: JourneyVisit) => Promise<void>;

export interface JourneyResult {
  steps: JourneyStep[];
  signals: SiteSignals | null;
  robots: RobotsDecision;
  consent: ConsentDecision;
  pagesVisited: number;
  /** Set when the DOM gave us nothing and the site's own sitemap did. */
  sitemap: SitemapResult | null;
}

const FALLBACK_PATHS: Partial<Record<PageType, string[]>> = {
  cart: ['/cart', '/varukorg', '/kundvagn', '/checkout/cart'],
  account: ['/account/login', '/logga-in', '/mitt-konto', '/min-sida', '/customer/account/login', '/konto'],
  checkout_entry: ['/checkout', '/kassa', '/kassan'],
  search: ['/search?q=', '/sok?q=', '/?s='],
};

/**
 * SYSTEM 2 — walk a store's buying journey once, handing each open page to the
 * audit engine.
 *
 * Hard boundaries, enforced here rather than left to good intentions:
 * nothing is ever purchased, no order is submitted, no login is attempted, no
 * CAPTCHA is touched, and any step blocked by robots.txt or an access control
 * is recorded as untested instead of forced.
 */
export async function discoverJourney(options: {
  session: BrowserSession;
  context: BrowserContext;
  origin: string;
  config: PlatformConfig;
  logger: Logger;
  onPage: JourneyHandler;
}): Promise<JourneyResult> {
  const { session, context, origin, config, logger, onPage } = options;
  const steps = new Map<PageType, JourneyStep>();
  for (const type of JOURNEY_PAGE_TYPES) {
    steps.set(type, { pageType: type, url: null, reached: false, reason: 'not attempted' });
  }

  const robots = await fetchRobots(context, origin, config.ignoreRobots);
  let consent: ConsentDecision = {
    detected: false,
    vendor: null,
    dismissed: false,
    method: 'none_present',
    containerSelector: null,
    note: 'No page was loaded, so no consent overlay was evaluated.',
  };

  if (!robots.decision.allowed) {
    for (const type of JOURNEY_PAGE_TYPES) {
      steps.set(type, { pageType: type, url: null, reached: false, reason: 'robots.txt disallows crawling this site' });
    }
    return { steps: [...steps.values()], signals: null, robots: robots.decision, consent, pagesVisited: 0, sitemap: null };
  }

  let visited = 0;
  const seen = new Set<string>();

  const open = async (pageType: PageType, url: string, beforeAudit?: (page: Page) => Promise<void>): Promise<Page | null> => {
    if (visited >= config.maxPagesPerScan) {
      steps.set(pageType, { pageType, url, reached: false, reason: 'page budget for this scan was exhausted' });
      return null;
    }
    if (!robots.allows(url)) {
      steps.set(pageType, { pageType, url, reached: false, reason: 'robots.txt disallows this path' });
      return null;
    }
    if (seen.has(stripHash(url))) {
      steps.set(pageType, { pageType, url, reached: false, reason: 'resolves to a page already tested in this scan' });
      return null;
    }
    seen.add(stripHash(url));
    visited += 1;
    const visit = await session.visit(context, url);
    if (!visit.ok) {
      steps.set(pageType, {
        pageType,
        url,
        reached: false,
        httpStatus: visit.httpStatus ?? undefined,
        reason: visit.error ? `navigation failed: ${visit.error}` : `HTTP ${visit.httpStatus ?? 'error'}`,
      });
      await visit.page.close().catch(() => undefined);
      return null;
    }
    steps.set(pageType, {
      pageType,
      url: visit.url,
      reached: true,
      httpStatus: visit.httpStatus ?? undefined,
      title: visit.title,
    });
    logger.debug('journey page reached', { pageType, url: visit.url });

    // The cookie wall comes down before anything else looks at the page,
    // otherwise every scan audits somebody's consent manager.
    const pageConsent = await handleConsentBanner(visit.page);
    if (pageConsent.detected && (!consent.detected || (pageConsent.dismissed && !consent.dismissed))) consent = pageConsent;
    else if (!consent.detected && pageType === 'homepage') consent = pageConsent;

    // Anything that must read the pristine page runs before the audit: probes
    // move focus, open panels and can navigate away.
    if (beforeAudit) await beforeAudit(visit.page);
    await onPage({ pageType, url: visit.url, page: visit.page, httpStatus: visit.httpStatus, title: visit.title });
    return visit.page;
  };

  // ------------------------------------------------------------- homepage
  let signals: SiteSignals | null = null;
  const homepage = await open('homepage', origin, async (page) => {
    signals = interpretSignals(await collectRawSignals(page));
  });
  if (!homepage || !signals) {
    return { steps: [...steps.values()], signals, robots: robots.decision, consent, pagesVisited: visited, sitemap: null };
  }

  // A store that redirects apex → www, or http → https, or to a rebranded
  // domain, must be crawled against where it actually landed. Otherwise every
  // link on the page reads as external and the journey comes back empty.
  const effectiveOrigin = originOf(steps.get('homepage')?.url) ?? origin;
  const homeLinks: SiteLink[] = (signals as SiteSignals).links;
  const classified = classifyLinks(homeLinks, effectiveOrigin);
  const searchTerm = deriveSearchTerm(homeLinks);
  await homepage.close().catch(() => undefined);

  // The sitemap is read at most once, and only when the page itself did not
  // give us somewhere to go.
  let sitemap: SitemapResult | null = null;
  const sitemapCandidates = async (pageType: PageType): Promise<string[]> => {
    if (sitemap === null) {
      sitemap = await fetchSitemapUrls(context, effectiveOrigin, robots.body);
      if (sitemap.fetched) logger.info('sitemap fallback used', { origin: effectiveOrigin, ...sitemap });
    }
    return (sitemap.byType[pageType] ?? []).filter((url) => robots.allows(url));
  };

  // --------------------------------------------------------------- search
  await visitFirst('search', [...classified.byType.search, ...fallbackUrls(effectiveOrigin, 'search', searchTerm)], open, steps, searchTerm);

  // ------------------------------------------------------------- category
  const categoryFromDom = classified.byType.category;
  const categoryPage = await visitFirst(
    'category',
    categoryFromDom.length ? categoryFromDom : await sitemapCandidates('category'),
    open,
    steps,
  );
  let productCandidates = classified.byType.product;
  if (categoryPage) {
    const categoryLinks = await extractLinks(categoryPage);
    const fromCategory = classifyLinks(categoryLinks, effectiveOrigin).byType.product;
    productCandidates = [...fromCategory, ...productCandidates];
    await categoryPage.close().catch(() => undefined);
  }

  // -------------------------------------------------------------- product
  // Client-rendered listings often build product cards from click handlers
  // rather than links, so the sitemap is what finds the product page.
  const productPage = await visitFirst(
    'product',
    productCandidates.length ? productCandidates : await sitemapCandidates('product'),
    open,
    steps,
  );
  await productPage?.close().catch(() => undefined);

  // ----------------------------------------------------------------- cart
  // The cart is visited empty on purpose: we never add products to a real
  // store's basket, so an empty-cart page is the honest, testable state.
  const cartPage = await visitFirst('cart', [...classified.byType.cart, ...fallbackUrls(effectiveOrigin, 'cart')], open, steps);
  await cartPage?.close().catch(() => undefined);

  // -------------------------------------------------------------- account
  // The login form is tested as a form. No credentials are ever submitted.
  const accountPage = await visitFirst('account', [...classified.byType.account, ...fallbackUrls(effectiveOrigin, 'account')], open, steps);
  await accountPage?.close().catch(() => undefined);

  // ------------------------------------------------------- checkout entry
  const checkoutPage = await visitFirst('checkout_entry', [...classified.byType.checkout_entry, ...fallbackUrls(effectiveOrigin, 'checkout_entry')], open, steps);
  if (checkoutPage) {
    const landed = checkoutPage.url();
    if (/\/(cart|varukorg|kundvagn)/i.test(landed)) {
      steps.set('checkout_entry', {
        pageType: 'checkout_entry',
        url: landed,
        reached: false,
        reason: 'checkout redirected to the empty cart — the checkout flow itself needs a manual session with products in the basket',
      });
    }
    await checkoutPage.close().catch(() => undefined);
  }

  for (const [type, step] of steps) {
    if (!step.reached && step.reason === 'not attempted') {
      steps.set(type, { ...step, reason: 'no candidate URL for this journey step was found on the site' });
    }
  }

  return { steps: [...steps.values()], signals, robots: robots.decision, consent, pagesVisited: visited, sitemap };
}

function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

async function visitFirst(
  pageType: PageType,
  candidates: string[],
  open: (t: PageType, url: string) => Promise<Page | null>,
  steps: Map<PageType, JourneyStep>,
  searchTerm?: string,
): Promise<Page | null> {
  const tried = candidates.slice(0, 3);
  if (tried.length === 0) {
    steps.set(pageType, { pageType, url: null, reached: false, reason: 'no candidate URL for this journey step was found on the site' });
    return null;
  }
  for (const candidate of tried) {
    const url = searchTerm && /[?&](q|s|query|sok)=$/.test(candidate) ? `${candidate}${encodeURIComponent(searchTerm)}` : candidate;
    const page = await open(pageType, url);
    if (page) return page;
  }
  return null;
}

function fallbackUrls(origin: string, pageType: PageType, searchTerm?: string): string[] {
  const paths = FALLBACK_PATHS[pageType] ?? [];
  return paths.map((path) => {
    const url = new URL(path, origin).toString();
    return searchTerm && /[?&](q|s|query)=$/.test(url) ? `${url}${encodeURIComponent(searchTerm)}` : url;
  });
}

async function extractLinks(page: Page): Promise<SiteLink[]> {
  await settle(page, 200);
  return page
    .evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'))
        .slice(0, 400)
        .map((a) => ({
          href: (a as HTMLAnchorElement).href,
          text: (a.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
          rel: a.getAttribute('rel'),
        })),
    )
    .catch(() => [] as SiteLink[]);
}

function stripHash(url: string): string {
  return url.split('#')[0].replace(/\/$/, '');
}
