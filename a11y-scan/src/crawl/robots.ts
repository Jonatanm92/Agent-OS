/**
 * Minimal robots.txt support: fetch, parse, and answer "may I fetch this path".
 *
 * Deliberately small. It implements the parts that matter for a 12-page polite
 * crawl — User-agent grouping, Disallow, Allow, longest-match wins, and `*`/`$`
 * wildcards — and treats anything it cannot parse as permissive, which is the
 * behaviour the standard specifies.
 */
import { ROBOTS_TOKEN, USER_AGENT } from '../config.js';

interface Rule {
  allow: boolean;
  path: string;
}

export interface Robots {
  rules: Rule[];
  /** Crawl-delay in ms if the site asked for one. */
  crawlDelayMs: number | null;
  /** True when robots.txt was absent or unreadable — everything is allowed. */
  absent: boolean;
}

export const PERMISSIVE: Robots = { rules: [], crawlDelayMs: null, absent: true };

/**
 * Parses robots.txt content. Groups matching our token win over `*` groups.
 */
export function parseRobots(content: string): Robots {
  const lines = content.split(/\r?\n/);

  const groups = new Map<string, Rule[]>();
  const delays = new Map<string, number>();
  let currentAgents: string[] = [];
  // A blank line or a directive ends a run of consecutive User-agent lines.
  let collectingAgents = false;

  for (const rawLine of lines) {
    const line = rawLine.split('#')[0]?.trim() ?? '';
    if (line === '') {
      collectingAgents = false;
      continue;
    }

    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!collectingAgents) {
        currentAgents = [];
        collectingAgents = true;
      }
      currentAgents.push(value.toLowerCase());
      if (!groups.has(value.toLowerCase())) groups.set(value.toLowerCase(), []);
      continue;
    }

    collectingAgents = false;
    if (currentAgents.length === 0) continue;

    if (field === 'disallow' || field === 'allow') {
      for (const agent of currentAgents) {
        const list = groups.get(agent);
        // An empty Disallow means "allow everything" — recording it as a rule
        // with an empty path would wrongly match every request.
        if (list && !(field === 'disallow' && value === '')) {
          list.push({ allow: field === 'allow', path: value });
        }
      }
    } else if (field === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) {
        for (const agent of currentAgents) delays.set(agent, seconds * 1000);
      }
    }
  }

  const specific = groups.get(ROBOTS_TOKEN);
  const wildcard = groups.get('*');
  const chosen = specific ?? wildcard ?? [];
  const delay = delays.get(ROBOTS_TOKEN) ?? delays.get('*') ?? null;

  return { rules: chosen, crawlDelayMs: delay, absent: false };
}

/** Converts a robots path pattern (supporting * and $) to a regex. */
function patternToRegex(pattern: string): RegExp {
  let source = '^';
  for (const char of pattern) {
    if (char === '*') source += '.*';
    else if (char === '$') source += '$';
    else source += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(source);
}

/**
 * Longest matching rule wins; Allow beats Disallow at equal length, which is
 * the conventional resolution.
 */
export function isAllowedByRobots(robots: Robots, pathWithQuery: string): boolean {
  if (robots.absent || robots.rules.length === 0) return true;

  let best: { length: number; allow: boolean } | null = null;
  for (const rule of robots.rules) {
    if (!patternToRegex(rule.path).test(pathWithQuery)) continue;
    const length = rule.path.length;
    if (!best || length > best.length || (length === best.length && rule.allow)) {
      best = { length, allow: rule.allow };
    }
  }
  return best ? best.allow : true;
}

/**
 * Fetches robots.txt. Any failure yields PERMISSIVE — a site that does not
 * serve robots.txt has not restricted anything.
 */
export async function fetchRobots(origin: string, timeoutMs = 8000): Promise<Robots> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL('/robots.txt', origin), {
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT },
      redirect: 'follow',
    });
    if (!response.ok) return PERMISSIVE;
    const text = await response.text();
    // A robots.txt larger than 512KB is not a robots.txt.
    if (text.length > 512 * 1024) return PERMISSIVE;
    return parseRobots(text);
  } catch {
    return PERMISSIVE;
  } finally {
    clearTimeout(timer);
  }
}
