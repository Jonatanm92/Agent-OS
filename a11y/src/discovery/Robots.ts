import type { BrowserContext } from 'playwright';
import type { RobotsDecision } from '../core/Types.js';

interface RobotsRules {
  disallow: string[];
  allow: string[];
  crawlDelayMs: number | null;
}

/**
 * Minimal robots.txt reader for the groups that apply to us (`*` and our own
 * token). We only ever read pages; we still honour Disallow because a site
 * owner's stated boundary is the boundary.
 */
export function parseRobots(body: string, agent = 'a11yrevenueos'): RobotsRules {
  const rules: RobotsRules = { disallow: [], allow: [], crawlDelayMs: null };
  let applies = false;
  let sawSpecific = false;
  const specific: RobotsRules = { disallow: [], allow: [], crawlDelayMs: null };

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      const ua = value.toLowerCase();
      applies = ua === '*' || ua === agent;
      if (ua === agent) sawSpecific = true;
      continue;
    }
    if (!applies) continue;
    const target = sawSpecific ? specific : rules;
    if (key === 'disallow' && value) target.disallow.push(value);
    else if (key === 'allow' && value) target.allow.push(value);
    else if (key === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds)) target.crawlDelayMs = seconds * 1000;
    }
  }
  return sawSpecific ? specific : rules;
}

export function isAllowed(rules: RobotsRules, pathname: string): boolean {
  const match = (pattern: string) => {
    if (pattern === '/') return true;
    return pathname.startsWith(pattern.replace(/\*$/, ''));
  };
  const allowLen = rules.allow.filter(match).reduce((m, p) => Math.max(m, p.length), -1);
  const disallowLen = rules.disallow.filter(match).reduce((m, p) => Math.max(m, p.length), -1);
  if (disallowLen === -1) return true;
  return allowLen >= disallowLen;
}

export interface RobotsGate {
  decision: RobotsDecision;
  allows(url: string): boolean;
}

export async function fetchRobots(context: BrowserContext, origin: string, ignore: boolean): Promise<RobotsGate> {
  if (ignore) {
    return {
      decision: { fetched: false, allowed: true, crawlDelayMs: null, reason: 'robots check disabled by operator config' },
      allows: () => true,
    };
  }
  try {
    const response = await context.request.get(`${origin}/robots.txt`, { timeout: 10000 });
    if (!response.ok()) {
      return {
        decision: { fetched: false, allowed: true, crawlDelayMs: null, reason: `robots.txt returned ${response.status()} — treating site as crawlable` },
        allows: () => true,
      };
    }
    const rules = parseRobots(await response.text());
    const rootAllowed = isAllowed(rules, '/');
    return {
      decision: {
        fetched: true,
        allowed: rootAllowed,
        crawlDelayMs: rules.crawlDelayMs,
        reason: rootAllowed ? 'robots.txt fetched and permits the audited paths' : 'robots.txt disallows the site root for our agent',
      },
      allows: (url: string) => {
        try {
          return isAllowed(rules, new URL(url).pathname);
        } catch {
          return false;
        }
      },
    };
  } catch (error) {
    return {
      decision: {
        fetched: false,
        allowed: true,
        crawlDelayMs: null,
        reason: `robots.txt unreachable (${error instanceof Error ? error.message : String(error)}) — treating site as crawlable`,
      },
      allows: () => true,
    };
  }
}
