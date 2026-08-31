import type { PageType } from '../core/Types.js';

export interface SiteLink {
  href: string;
  text: string;
  rel: string | null;
}

/** Product-detail URL shapes, Swedish and English. Shared with signal detection. */
export const PRODUCT_PATH = /\/(products?|produkt(er)?|var(a|or)|artikel|item|p)\/[^/]+/i;

const PATTERNS: { type: PageType; path: RegExp; text?: RegExp }[] = [
  { type: 'cart', path: /\/(cart|varukorg|kundvagn|basket|kundkorg)(\/|$|\?)/i, text: /^(varukorg|kundvagn|cart|basket)$/i },
  { type: 'checkout_entry', path: /\/(checkout|kassa|kassan|to-checkout)(\/|$|\?)/i, text: /(till kassan|checkout|gå till kassan)/i },
  { type: 'account', path: /\/(account|login|logga-in|log-in|mitt-konto|min-sida|konto|customer\/account|signin|sign-in)(\/|$|\?)/i, text: /(logga in|mitt konto|min sida|log in|sign in)/i },
  { type: 'search', path: /\/(search|sok|s%C3%B6k|soek)(\/|$|\?)|[?&](q|s|query|sok)=/i, text: /^(sök|search)$/i },
  { type: 'product', path: PRODUCT_PATH },
  {
    type: 'category',
    path: /\/(collections?|category|categories|kategori|kategorier|produkt-kategori|product-category|shop|butik|sortiment|avdelning|c)\/[^/]*/i,
  },
];

const SKIP = /^(mailto:|tel:|javascript:|#)|\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?|mp4|webm)(\?|$)/i;

/** Deliberately excluded: policy pages are not part of a buying journey. */
const NOISE = /\/(villkor|integritetspolicy|privacy|terms|cookies?|kopvillkor|köpvillkor|om-oss|about|blogg?|blog|nyheter|news|faq|kontakt|contact)(\/|$)/i;

export interface ClassifiedLinks {
  byType: Record<PageType, string[]>;
  internal: string[];
}

function sameSite(href: string, origin: string): boolean {
  try {
    const a = new URL(href);
    const b = new URL(origin);
    return a.host === b.host || a.host.replace(/^www\./, '') === b.host.replace(/^www\./, '');
  } catch {
    return false;
  }
}

/** Rank candidates: shallow, noise-free paths first — they are the real nav targets. */
function rank(urls: string[]): string[] {
  return [...new Set(urls)]
    .map((url) => {
      let depth = 9;
      let queryPenalty = 0;
      try {
        const parsed = new URL(url);
        depth = parsed.pathname.split('/').filter(Boolean).length;
        queryPenalty = parsed.search.length > 0 ? 1 : 0;
      } catch {
        /* keep default rank for unparsable urls */
      }
      return { url, score: depth + queryPenalty + (NOISE.test(url) ? 10 : 0) };
    })
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.url);
}

export function classifyLinks(links: SiteLink[], origin: string): ClassifiedLinks {
  const byType: Record<PageType, string[]> = {
    homepage: [],
    search: [],
    category: [],
    product: [],
    cart: [],
    account: [],
    checkout_entry: [],
    content: [],
    unknown: [],
  };
  const internal: string[] = [];

  for (const link of links) {
    const href = link.href?.split('#')[0];
    if (!href || SKIP.test(href) || !sameSite(href, origin)) continue;
    if (link.rel && /nofollow/i.test(link.rel)) continue;
    internal.push(href);
    for (const pattern of PATTERNS) {
      const pathHit = pattern.path.test(href);
      const textHit = pattern.text ? pattern.text.test(link.text.trim()) : false;
      if (pathHit || textHit) {
        byType[pattern.type].push(href);
        break;
      }
    }
  }

  for (const key of Object.keys(byType) as PageType[]) byType[key] = rank(byType[key]);
  return { byType, internal: rank(internal) };
}

/**
 * Pick a search term from the store's own vocabulary so the search results page
 * is representative rather than empty.
 */
export function deriveSearchTerm(links: SiteLink[], fallback = 'rea'): string {
  const words = new Map<string, number>();
  for (const link of links) {
    for (const raw of link.text.split(/[^\p{L}\p{N}-]+/u)) {
      const word = raw.toLowerCase();
      if (word.length < 4 || word.length > 18) continue;
      if (/^(hem|home|meny|menu|logga|login|konto|about|kontakt|cookies|villkor|nyheter)$/.test(word)) continue;
      words.set(word, (words.get(word) ?? 0) + 1);
    }
  }
  const best = [...words.entries()].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 1 ? best[0] : fallback;
}
