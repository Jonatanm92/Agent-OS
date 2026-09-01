/**
 * The single gate deciding whether a URL may be fetched.
 *
 * See THREAT-MODEL.md T1, T2, T3. Everything here is an allowlist: unknown
 * schemes, unknown address shapes and unparseable input are refused, never
 * passed through on the assumption they are probably fine.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type GuardReason =
  | 'ok'
  | 'unparseable'
  | 'blocked-scheme'
  | 'embedded-credentials'
  | 'blocked-port'
  | 'dns-failure'
  | 'private-address'
  | 'destructive-path';

export interface GuardResult {
  allowed: boolean;
  reason: GuardReason;
  /** Human-readable explanation, safe to log and to show in a report. */
  detail: string;
  /** Present only when allowed. */
  url?: URL;
  /** Addresses the hostname resolved to, for the audit trail. */
  addresses?: string[];
}

export interface GuardOptions {
  /**
   * Hostnames permitted to resolve to a private address or use a non-standard
   * port. Test-only, and deliberately a LIST OF HOSTS rather than a boolean.
   *
   * A global "allow private" switch would also whitelist wherever a redirect
   * points, which defeats the redirect check entirely: a fixture on 127.0.0.1
   * redirecting to 169.254.169.254 would sail through. Scoping the exemption to
   * the one host being scanned keeps every other address blocked.
   *
   * Empty or absent means nothing private is reachable. Never read from the
   * environment. See THREAT-MODEL.md T10.
   */
  allowPrivateHosts?: string[];
}

/** True when this specific hostname carries the test-only exemption. */
function isExempt(hostname: string, options: GuardOptions): boolean {
  const list = options.allowPrivateHosts;
  if (!list || list.length === 0) return false;
  const host = hostname.toLowerCase();
  return list.some((entry) => entry.toLowerCase() === host);
}

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);
const ALLOWED_PORTS = new Set(['', '80', '443']);

/**
 * Paths that could change state on the target, log a session out, or reach an
 * admin surface. Dropped from the crawl queue regardless of depth (T7).
 */
const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\/logout\b/i,
  /\/log-out\b/i,
  /\/signout\b/i,
  /\/sign-out\b/i,
  /\/logga-?ut\b/i,
  /\/cart\/(add|clear|change|update)\b/i,
  /\/checkout\/(complete|process|payment)\b/i,
  /\/admin\b/i,
  /\/wp-admin\b/i,
  /\/wp-login/i,
  /[?&](delete|remove|destroy|cancel)=/i,
  /\/api\//i,
];

/** IPv4 ranges that must never be fetched. */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    // Not a shape we recognise — refuse rather than guess.
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true; // link-local — cloud metadata lives here
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 168) return true; // private
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0] ?? '';

  // IPv4-mapped (::ffff:10.0.0.1) and IPv4-compatible forms are a standard
  // bypass: they look like IPv6 but route to an IPv4 address.
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPrivateIPv4(mapped[1]);
  if (/^::\d+\.\d+\.\d+\.\d+$/.test(addr)) return true;

  if (addr === '::' || addr === '::1') return true; // unspecified, loopback
  if (/^f[cd]/.test(addr)) return true; // fc00::/7 unique local
  if (/^fe[89ab]/.test(addr)) return true; // fe80::/10 link-local
  if (/^ff/.test(addr)) return true; // multicast
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // unrecognised — refuse
}

export function isDestructivePath(url: URL): boolean {
  const target = `${url.pathname}${url.search}`;
  return DESTRUCTIVE_PATTERNS.some((re) => re.test(target));
}

/**
 * Synchronous checks: everything decidable without touching DNS.
 * Split out so the browser route handler can run it on every request cheaply.
 */
export function checkUrlSyntax(raw: string, options: GuardOptions = {}): GuardResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { allowed: false, reason: 'unparseable', detail: 'Not a valid absolute URL.' };
  }

  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    return {
      allowed: false,
      reason: 'blocked-scheme',
      detail: `Only http and https are scanned. Refused scheme "${url.protocol}".`,
    };
  }

  if (url.username || url.password) {
    return {
      allowed: false,
      reason: 'embedded-credentials',
      detail: 'URLs containing credentials are refused; the scanner never authenticates.',
    };
  }

  if (!ALLOWED_PORTS.has(url.port) && !isExempt(url.hostname, options)) {
    return {
      allowed: false,
      reason: 'blocked-port',
      detail: `Only the standard web ports are scanned. Refused port "${url.port}".`,
    };
  }

  return { allowed: true, reason: 'ok', detail: 'Syntax accepted.', url };
}

/**
 * Full check including DNS resolution. Every address the hostname resolves to
 * must be public — a hostname with one public and one private A record is
 * refused, because the browser may pick either.
 */
export async function checkUrl(raw: string, options: GuardOptions = {}): Promise<GuardResult> {
  const syntax = checkUrlSyntax(raw, options);
  if (!syntax.allowed || !syntax.url) return syntax;
  const url = syntax.url;

  const exempt = isExempt(url.hostname, options);

  const literal = isIP(url.hostname);
  if (literal) {
    if (!exempt && isPrivateAddress(url.hostname)) {
      return {
        allowed: false,
        reason: 'private-address',
        detail: `${url.hostname} is a private, loopback or reserved address.`,
      };
    }
    return { allowed: true, reason: 'ok', detail: 'Public literal address.', url, addresses: [url.hostname] };
  }

  let addresses: string[];
  try {
    const records = await lookup(url.hostname, { all: true });
    addresses = records.map((r) => r.address);
  } catch {
    return {
      allowed: false,
      reason: 'dns-failure',
      detail: `Could not resolve "${url.hostname}".`,
    };
  }

  if (addresses.length === 0) {
    return { allowed: false, reason: 'dns-failure', detail: `"${url.hostname}" resolved to nothing.` };
  }

  if (!exempt) {
    const bad = addresses.find((a) => isPrivateAddress(a));
    if (bad) {
      return {
        allowed: false,
        reason: 'private-address',
        detail: `"${url.hostname}" resolves to ${bad}, which is private, loopback or reserved.`,
        addresses,
      };
    }
  }

  return { allowed: true, reason: 'ok', detail: 'Public address.', url, addresses };
}

/** Tracking parameters that create duplicate URLs for the same page. */
const STRIP_PARAMS = [
  /^utm_/i, /^fbclid$/i, /^gclid$/i, /^msclkid$/i, /^mc_(cid|eid)$/i,
  /^_ga$/i, /^ref$/i, /^referrer$/i, /^srsltid$/i, /^gad_source$/i,
];

/**
 * Canonical form for dedup. Two URLs that normalize alike are the same page as
 * far as the crawler is concerned.
 */
export function normalizeUrl(raw: string, base?: string): string | null {
  let url: URL;
  try {
    url = base ? new URL(raw, base) : new URL(raw);
  } catch {
    return null;
  }

  if (!ALLOWED_SCHEMES.has(url.protocol)) return null;

  url.hash = '';
  url.username = '';
  url.password = '';
  url.hostname = url.hostname.toLowerCase();

  if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) {
    url.port = '';
  }

  const kept: [string, string][] = [];
  for (const [key, value] of url.searchParams) {
    if (STRIP_PARAMS.some((re) => re.test(key))) continue;
    kept.push([key, value]);
  }
  // Sorted so ?a=1&b=2 and ?b=2&a=1 collapse to one page.
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = '';
  for (const [key, value] of kept) url.searchParams.append(key, value);

  // A directory index is the directory: /index.html and / are one page, and
  // treating them as two wastes a slot of a small page budget.
  url.pathname = url.pathname.replace(/\/(index|default|home)\.(html?|php|aspx?|jsp)$/i, '/');

  // Trailing slash is not significant except at the root.
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  if (url.pathname === '') url.pathname = '/';

  return url.toString();
}

/**
 * Registrable-domain comparison, deliberately simple: "same site" means the
 * last two labels match, so www.shop.se and shop.se are one site while
 * shop.se and cdn.other.se are not.
 *
 * This is not a Public Suffix List. It treats `shop.co.uk` and `other.co.uk` as
 * the same site, which for a crawler that is already domain-locked to a typed
 * URL means over-restricting at worst, never scanning a third party.
 */
export function isSameSite(a: string, b: string): boolean {
  const reg = (host: string): string => {
    const labels = host.toLowerCase().split('.').filter(Boolean);
    return labels.slice(-2).join('.');
  };
  try {
    return reg(new URL(a).hostname) === reg(new URL(b).hostname);
  } catch {
    return false;
  }
}

/**
 * Filesystem-safe slug for output filenames. Allowlist only — see T3.
 */
export function safeSlug(input: string, fallback = 'scan'): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+/, '')
    .replace(/[.-]+$/, '')
    .slice(0, 60);
  return slug.length > 0 ? slug : fallback;
}
