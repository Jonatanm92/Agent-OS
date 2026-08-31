/**
 * Bounded, role-aware discovery.
 *
 * The point is not to find many pages but to find one of each *kind* of page in
 * the purchase funnel, so a 12-page scan of a huge shop and of a small one
 * examine comparable ground. See ARCHITECTURE.md.
 *
 * Navigation is GET only. No form is submitted, no button is clicked, and only
 * <a href> values are followed (THREAT-MODEL.md T7).
 */
import type { Page } from 'playwright';
import type { PageRole } from '../types.js';
import type { Limits } from '../config.js';
import { isAllowedByRobots, type Robots } from './robots.js';
import {
  isDestructivePath,
  isSameSite,
  normalizeUrl,
  checkUrlSyntax,
  type GuardOptions,
} from '../security/url-guard.js';

/** URL patterns that identify a page role, Swedish and English. */
/** Optional file extension, so /cart.html classifies the same as /cart. */
const EXT = '(?:\\.[a-z]{2,5})?';
/** What may follow the keyword: an extension, a slash, end of path, or a query. */
const TAIL = `${EXT}(?:\\/|$|\\?)`;

const ROLE_PATTERNS: [PageRole, RegExp][] = [
  ['cart', new RegExp(`\\/(cart|varukorg|kundvagn|kundkorg|basket)${TAIL}`, 'i')],
  ['checkout-entry', new RegExp(`\\/(checkout|kassa|utcheckning)${TAIL}`, 'i')],
  // A product page is the keyword plus an identifier, or the keyword with an
  // extension (/product.html) — but not a bare /produkter, which is a listing.
  ['product', new RegExp(`\\/(products?|produkt|vara|artikel)(?:\\/[^/]+|\\.[a-z]{2,5})`, 'i')],
  [
    'collection',
    new RegExp(`\\/(collections?|categor(?:y|ies)|kategori(?:er)?|shop|butik|sortiment|produkter)${TAIL}`, 'i'),
  ],
  ['search', new RegExp(`\\/(search|sok|s%C3%B6k|sök)${TAIL}`, 'i')],
  ['account', new RegExp(`\\/(account|login|log-in|signin|sign-in|konto|logga-in|mitt-konto)${TAIL}`, 'i')],
  ['contact', new RegExp(`\\/(contact|kontakt|kundtjanst|kundtjänst|customer-service|support)${TAIL}`, 'i')],
];

/** Roles worth spending the page budget on, in priority order. */
export const TARGET_ROLES: PageRole[] = [
  'home', 'product', 'collection', 'cart', 'checkout-entry', 'search', 'contact', 'account',
];

export function classifyByUrl(url: string, startUrl: string): PageRole {
  const normalizedStart = normalizeUrl(startUrl);
  const normalized = normalizeUrl(url);
  if (normalized && normalizedStart && normalized === normalizedStart) return 'home';

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'other';
  }
  if (parsed.pathname === '/' || parsed.pathname === '') return 'home';

  for (const [role, pattern] of ROLE_PATTERNS) {
    if (pattern.test(parsed.pathname + parsed.search)) return role;
  }
  return 'other';
}

/**
 * Refines a URL-based guess using what the rendered page actually contains.
 * A shop on a custom platform may not use recognisable URL shapes.
 */
export async function classifyByDom(page: Page, urlGuess: PageRole): Promise<PageRole> {
  if (urlGuess !== 'other') return urlGuess;
  try {
    const signals = await page.evaluate(() => {
      const hasAddToCart = Array.from(document.querySelectorAll('button, input[type=submit], a')).some(
        (el) => /add to cart|lägg i (kundvagn|varukorg)|köp nu|buy now|add to bag/i.test(
          (el.textContent ?? '') + ' ' + (el.getAttribute('aria-label') ?? '')
        )
      );
      const productLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).some(
        (el) => /"@type"\s*:\s*"Product"/i.test(el.textContent ?? '')
      );
      const cardCount = document.querySelectorAll(
        '[class*="product-card"], [class*="product-item"], [class*="productCard"], li[class*="product"]'
      ).length;
      const formCount = document.querySelectorAll('form').length;
      const hasSearchInput = document.querySelector('input[type=search], input[name*="search" i], input[name="q"]') !== null;
      return { hasAddToCart, productLd, cardCount, formCount, hasSearchInput };
    });

    if (signals.productLd || (signals.hasAddToCart && signals.cardCount < 3)) return 'product';
    if (signals.cardCount >= 4) return 'collection';
    if (signals.hasSearchInput && signals.cardCount > 0) return 'search';
    if (signals.formCount > 0) return 'contact';
  } catch {
    // A page that will not evaluate keeps its URL-based guess.
  }
  return urlGuess;
}

/** Links found on a page, already absolute and same-site. */
export async function extractLinks(
  page: Page,
  baseUrl: string,
  guard: GuardOptions = {}
): Promise<string[]> {
  let hrefs: string[] = [];
  try {
    hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'))
        .map((a) => a.getAttribute('href') ?? '')
        // Cap in-page so a link farm cannot return 100k strings.
        .slice(0, 2000)
    );
  } catch {
    return [];
  }

  const out = new Set<string>();
  for (const href of hrefs) {
    const trimmed = href.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const normalized = normalizeUrl(trimmed, baseUrl);
    if (!normalized) continue;
    // Same guard the scan itself runs under — a link rejected here is one the
    // navigation would refuse anyway.
    if (!checkUrlSyntax(normalized, guard).allowed) continue;
    if (!isSameSite(normalized, baseUrl)) continue;
    out.add(normalized);
  }
  return [...out];
}

interface QueueEntry {
  url: string;
  depth: number;
  role: PageRole;
}

/**
 * Orders the frontier so a link that fills a missing role always beats one that
 * does not, and shallower beats deeper within the same rank.
 */
export function selectNext(queue: QueueEntry[], filledRoles: Set<PageRole>): QueueEntry | null {
  if (queue.length === 0) return null;

  let bestIndex = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i]!;
    const fillsRole = entry.role !== 'other' && !filledRoles.has(entry.role);
    const rolePriority = TARGET_ROLES.indexOf(entry.role);
    const score =
      (fillsRole ? 1000 : 0) +
      (rolePriority >= 0 ? 100 - rolePriority * 10 : 0) -
      entry.depth * 5;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return queue.splice(bestIndex, 1)[0] ?? null;
}

export interface FrontierOptions {
  limits: Limits;
  robots: Robots;
  startUrl: string;
  guard?: GuardOptions;
}

/**
 * The crawl frontier as a testable object: no network, no browser. The scanner
 * drives it; tests drive it directly to assert the limits actually bind.
 */
export class Frontier {
  private queue: QueueEntry[] = [];
  private seen = new Set<string>();
  private filledRoles = new Set<PageRole>();
  public skipped: { url: string; reason: string }[] = [];

  constructor(private options: FrontierOptions) {}

  get size(): number {
    return this.queue.length;
  }

  get visitedCount(): number {
    return this.seen.size - this.queue.length;
  }

  /** Returns true if the URL was accepted onto the queue. */
  add(rawUrl: string, depth: number): boolean {
    if (depth > this.options.limits.maxDepth) return false;
    if (this.queue.length >= this.options.limits.maxQueued) return false;

    const normalized = normalizeUrl(rawUrl, this.options.startUrl);
    if (!normalized) return false;
    if (this.seen.has(normalized)) return false;

    let parsed: URL;
    try {
      parsed = new URL(normalized);
    } catch {
      return false;
    }

    if (isDestructivePath(parsed)) {
      this.seen.add(normalized);
      this.skipped.push({ url: normalized, reason: 'Skipped: could change state on the site.' });
      return false;
    }

    if (!isAllowedByRobots(this.options.robots, parsed.pathname + parsed.search)) {
      this.seen.add(normalized);
      this.skipped.push({ url: normalized, reason: 'Skipped: disallowed by robots.txt.' });
      return false;
    }

    this.seen.add(normalized);
    this.queue.push({ url: normalized, depth, role: classifyByUrl(normalized, this.options.startUrl) });
    return true;
  }

  next(): QueueEntry | null {
    return selectNext(this.queue, this.filledRoles);
  }

  markRoleFilled(role: PageRole): void {
    this.filledRoles.add(role);
  }

  get roles(): PageRole[] {
    return [...this.filledRoles];
  }
}
