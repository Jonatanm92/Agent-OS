import type { BrowserContext } from 'playwright';
import type { PageType } from '../core/Types.js';
import { classifyLinks, type SiteLink } from './LinkClassifier.js';

/**
 * SYSTEM 2 — sitemap fallback.
 *
 * The single most common reason a scan finds no product page is that the store
 * renders its listings client-side, or builds product cards from click handlers
 * instead of links. A sitemap is the site's own published list of URLs, meant
 * for exactly this — reading it is polite, cheap, and usually finds the
 * category and product pages the DOM would not give us.
 *
 * Only used as a fallback: links found on the page are better evidence of what
 * a customer would actually reach.
 */

const MAX_SITEMAPS = 4;
const MAX_URLS = 500;

export interface SitemapResult {
  fetched: boolean;
  /** Which sitemap URLs were read, for the scan record. */
  sources: string[];
  byType: Partial<Record<PageType, string[]>>;
  urlCount: number;
  note: string;
}

/** `<loc>` extraction without an XML parser dependency. */
export function parseSitemapLocations(xml: string): string[] {
  const locations: string[] = [];
  const pattern = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    locations.push(decodeXmlEntities(match[1]));
    if (locations.length >= MAX_URLS * 2) break;
  }
  return locations;
}

export function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

/** Sitemap URLs a robots.txt advertises, which is where large stores put them. */
export function sitemapsFromRobots(robotsBody: string): string[] {
  return robotsBody
    .split(/\r?\n/)
    .map((line) => /^\s*sitemap:\s*(\S+)/i.exec(line)?.[1])
    .filter((url): url is string => Boolean(url));
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export async function fetchSitemapUrls(context: BrowserContext, origin: string, robotsBody = ''): Promise<SitemapResult> {
  const candidates = [...sitemapsFromRobots(robotsBody), new URL('/sitemap.xml', origin).toString(), new URL('/sitemap_index.xml', origin).toString()];
  const seen = new Set<string>();
  const sources: string[] = [];
  const urls: string[] = [];

  const read = async (url: string): Promise<string | null> => {
    if (seen.has(url) || seen.size >= MAX_SITEMAPS) return null;
    seen.add(url);
    try {
      const response = await context.request.get(url, { timeout: 10000 });
      if (!response.ok()) return null;
      const body = await response.text();
      if (!body.includes('<loc')) return null;
      sources.push(url);
      return body;
    } catch {
      return null;
    }
  };

  for (const candidate of candidates) {
    const body = await read(candidate);
    if (!body) continue;
    const locations = parseSitemapLocations(body);
    if (isSitemapIndex(body)) {
      // One level of nesting: enough for the usual product/collection split,
      // without walking a 50-file sitemap tree on a large retailer.
      for (const nested of locations.slice(0, MAX_SITEMAPS - seen.size + 1)) {
        const nestedBody = await read(nested);
        if (nestedBody) urls.push(...parseSitemapLocations(nestedBody));
      }
    } else {
      urls.push(...locations);
    }
    if (urls.length >= MAX_URLS) break;
  }

  if (urls.length === 0) {
    return { fetched: false, sources, byType: {}, urlCount: 0, note: 'No usable sitemap was published.' };
  }

  const links: SiteLink[] = [...new Set(urls)].slice(0, MAX_URLS).map((href) => ({ href, text: '', rel: null }));
  const { byType } = classifyLinks(links, origin);

  return {
    fetched: true,
    sources,
    byType,
    urlCount: links.length,
    note: `Read ${links.length} URL(s) from ${sources.length} sitemap file(s).`,
  };
}
