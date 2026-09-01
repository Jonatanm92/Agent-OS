import { describe, expect, it } from 'vitest';
import {
  checkUrl,
  checkUrlSyntax,
  isDestructivePath,
  isPrivateAddress,
  isSameSite,
  normalizeUrl,
  safeSlug,
} from '../src/security/url-guard.js';

describe('scheme allowlist (T2)', () => {
  it.each([
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'ftp://example.se/pub',
    'chrome://settings',
    'view-source:https://example.se',
    'about:blank',
  ])('refuses %s', (url) => {
    const result = checkUrlSyntax(url);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('blocked-scheme');
  });

  it.each(['http://example.se', 'https://example.se/path?a=1'])('accepts %s', (url) => {
    expect(checkUrlSyntax(url).allowed).toBe(true);
  });

  it('refuses a URL that is not parseable at all', () => {
    expect(checkUrlSyntax('not a url').reason).toBe('unparseable');
  });

  it('refuses embedded credentials so the scanner cannot authenticate', () => {
    expect(checkUrlSyntax('https://user:pass@example.se').reason).toBe('embedded-credentials');
  });

  it('refuses non-standard ports by default', () => {
    expect(checkUrlSyntax('http://example.se:6379/').reason).toBe('blocked-port');
    expect(checkUrlSyntax('http://example.se:8080/').reason).toBe('blocked-port');
  });

  it('relaxes the port check only under the test escape hatch', () => {
    // The fixture server binds an ephemeral port, so the hatch has to cover
    // ports as well as addresses — but only when explicitly passed.
    expect(checkUrlSyntax('http://127.0.0.1:34045/', { allowPrivateHosts: ['127.0.0.1'] }).allowed).toBe(true);
    expect(checkUrlSyntax('http://127.0.0.1:34045/').allowed).toBe(false);
  });
});

describe('private address detection (T1)', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['10.1.2.3', 'private 10/8'],
    ['172.16.0.1', 'private 172.16/12'],
    ['172.31.255.255', 'private 172.16/12 upper'],
    ['192.168.1.1', 'private 192.168/16'],
    ['169.254.169.254', 'cloud metadata'],
    ['100.64.0.1', 'CGNAT'],
    ['0.0.0.0', 'this network'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
    ['::1', 'IPv6 loopback'],
    ['fc00::1', 'IPv6 unique local'],
    ['fe80::1', 'IPv6 link-local'],
    ['::ffff:10.0.0.1', 'IPv4-mapped IPv6 bypass'],
    ['::ffff:169.254.169.254', 'IPv4-mapped metadata bypass'],
  ])('blocks %s (%s)', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'])('allows public %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });

  it('refuses anything that is not a recognisable address', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true);
    expect(isPrivateAddress('999.999.999.999')).toBe(true);
  });
});

describe('checkUrl end to end', () => {
  it('blocks a literal private address', async () => {
    const result = await checkUrl('http://127.0.0.1/');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('private-address');
  });

  it('blocks the cloud metadata endpoint', async () => {
    const result = await checkUrl('http://169.254.169.254/latest/meta-data/');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('private-address');
  });

  it('defaults the private-host exemption to empty (T10)', async () => {
    // No options object at all — the dangerous default must be the safe one.
    expect((await checkUrl('http://127.0.0.1/')).allowed).toBe(false);
  });

  it('permits loopback only for a host named in the exemption list', async () => {
    const result = await checkUrl('http://127.0.0.1/', { allowPrivateHosts: ['127.0.0.1'] });
    expect(result.allowed).toBe(true);
  });

  it('reports a resolution failure rather than proceeding', async () => {
    const result = await checkUrl('https://this-domain-should-never-resolve.invalid/');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('dns-failure');
  });
});

describe('destructive path detection (T7)', () => {
  it.each([
    'https://shop.se/logout',
    'https://shop.se/logga-ut',
    'https://shop.se/cart/add',
    'https://shop.se/cart/clear',
    'https://shop.se/checkout/complete',
    'https://shop.se/admin/orders',
    'https://shop.se/wp-admin/',
    'https://shop.se/page?delete=42',
    'https://shop.se/api/orders',
  ])('drops %s', (url) => {
    expect(isDestructivePath(new URL(url))).toBe(true);
  });

  it.each(['https://shop.se/cart', 'https://shop.se/products/handduk', 'https://shop.se/checkout'])(
    'keeps %s',
    (url) => {
      expect(isDestructivePath(new URL(url))).toBe(false);
    }
  );
});

describe('URL normalization', () => {
  it('strips the fragment', () => {
    expect(normalizeUrl('https://shop.se/p#reviews')).toBe('https://shop.se/p');
  });

  it('strips tracking parameters but keeps real ones', () => {
    expect(normalizeUrl('https://shop.se/p?utm_source=x&size=m&gclid=y&fbclid=z')).toBe(
      'https://shop.se/p?size=m'
    );
  });

  it('sorts query parameters so ordering does not create duplicates', () => {
    expect(normalizeUrl('https://shop.se/p?b=2&a=1')).toBe(normalizeUrl('https://shop.se/p?a=1&b=2'));
  });

  it('removes the default port', () => {
    expect(normalizeUrl('https://shop.se:443/p')).toBe('https://shop.se/p');
    expect(normalizeUrl('http://shop.se:80/p')).toBe('http://shop.se/p');
  });

  it('lowercases the host but not the path', () => {
    expect(normalizeUrl('https://SHOP.se/Path')).toBe('https://shop.se/Path');
  });

  it('drops a trailing slash except at the root', () => {
    expect(normalizeUrl('https://shop.se/a/b/')).toBe('https://shop.se/a/b');
    expect(normalizeUrl('https://shop.se/')).toBe('https://shop.se/');
  });

  it('resolves relative URLs against a base', () => {
    expect(normalizeUrl('../product', 'https://shop.se/a/b/c')).toBe('https://shop.se/a/product');
  });

  it('returns null for a non-web scheme rather than a normalized string', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('mailto:a@b.se')).toBeNull();
  });

  it('strips credentials during normalization', () => {
    expect(normalizeUrl('https://u:p@shop.se/x')).toBe('https://shop.se/x');
  });
});

describe('same-site comparison', () => {
  it('treats www and apex as one site', () => {
    expect(isSameSite('https://www.shop.se/a', 'https://shop.se/b')).toBe(true);
  });

  it('treats a different domain as another site', () => {
    expect(isSameSite('https://shop.se/a', 'https://cdn.other.se/b')).toBe(false);
  });

  it('handles unparseable input without throwing', () => {
    expect(isSameSite('nonsense', 'https://shop.se')).toBe(false);
  });
});

describe('safeSlug (T3 — path traversal)', () => {
  it.each([
    ['../../etc/passwd', 'etc-passwd'],
    ['..%2f..%2fetc', '2f..-2fetc'.replace(/^\.+/, '')],
    ['shop.se', 'shop.se'],
    ['WWW.Shop.SE', 'www.shop.se'],
  ])('sanitises %s', (input) => {
    const slug = safeSlug(input);
    expect(slug).not.toContain('/');
    expect(slug).not.toContain('\\');
    expect(slug.startsWith('.')).toBe(false);
    expect(slug).toMatch(/^[a-z0-9.-]*$/);
  });

  it('falls back when nothing survives sanitisation', () => {
    expect(safeSlug('///')).toBe('scan');
    expect(safeSlug('...')).toBe('scan');
  });

  it('truncates very long input', () => {
    expect(safeSlug('a'.repeat(500)).length).toBeLessThanOrEqual(60);
  });
});
