import { describe, expect, it } from 'vitest';
import { isAllowedByRobots, parseRobots, PERMISSIVE } from '../src/crawl/robots.js';

describe('robots.txt parsing', () => {
  it('applies wildcard rules when there is no specific group', () => {
    const robots = parseRobots(`
User-agent: *
Disallow: /private/
Allow: /
`);
    expect(isAllowedByRobots(robots, '/private/thing')).toBe(false);
    expect(isAllowedByRobots(robots, '/products/x')).toBe(true);
  });

  it('prefers a group naming this crawler over the wildcard group', () => {
    const robots = parseRobots(`
User-agent: *
Disallow: /

User-agent: a11yriskscan
Disallow: /admin/
`);
    expect(isAllowedByRobots(robots, '/products')).toBe(true);
    expect(isAllowedByRobots(robots, '/admin/x')).toBe(false);
  });

  it('treats an empty Disallow as allowing everything', () => {
    const robots = parseRobots('User-agent: *\nDisallow:\n');
    expect(isAllowedByRobots(robots, '/anything')).toBe(true);
  });

  it('lets the longest matching rule win', () => {
    const robots = parseRobots(`
User-agent: *
Disallow: /shop/
Allow: /shop/public/
`);
    expect(isAllowedByRobots(robots, '/shop/secret')).toBe(false);
    expect(isAllowedByRobots(robots, '/shop/public/item')).toBe(true);
  });

  it('prefers Allow when rules are the same length', () => {
    const robots = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a\n');
    expect(isAllowedByRobots(robots, '/a')).toBe(true);
  });

  it('supports * and $ wildcards', () => {
    const robots = parseRobots('User-agent: *\nDisallow: /*.pdf$\n');
    expect(isAllowedByRobots(robots, '/manual.pdf')).toBe(false);
    expect(isAllowedByRobots(robots, '/manual.pdf.html')).toBe(true);
  });

  it('ignores comments and blank lines', () => {
    const robots = parseRobots(`
# a comment
User-agent: *   # trailing comment
Disallow: /x

`);
    expect(isAllowedByRobots(robots, '/x')).toBe(false);
  });

  it('groups consecutive User-agent lines together', () => {
    const robots = parseRobots(`
User-agent: googlebot
User-agent: a11yriskscan
Disallow: /shared/
`);
    expect(isAllowedByRobots(robots, '/shared/x')).toBe(false);
  });

  it('reads crawl-delay in seconds and reports it in milliseconds', () => {
    expect(parseRobots('User-agent: *\nCrawl-delay: 2\n').crawlDelayMs).toBe(2000);
  });

  it('ignores a non-numeric crawl-delay', () => {
    expect(parseRobots('User-agent: *\nCrawl-delay: soon\n').crawlDelayMs).toBeNull();
  });

  it('ignores directives that appear before any User-agent line', () => {
    const robots = parseRobots('Disallow: /orphan\nUser-agent: *\nDisallow: /real\n');
    expect(isAllowedByRobots(robots, '/orphan')).toBe(true);
    expect(isAllowedByRobots(robots, '/real')).toBe(false);
  });

  it('allows everything when robots.txt is absent', () => {
    expect(isAllowedByRobots(PERMISSIVE, '/anything')).toBe(true);
  });

  it('allows everything for unparseable content rather than blocking the scan', () => {
    expect(isAllowedByRobots(parseRobots('<html>404 not found</html>'), '/x')).toBe(true);
  });

  it('escapes regex metacharacters in paths so they match literally', () => {
    const robots = parseRobots('User-agent: *\nDisallow: /a+b(c)\n');
    expect(isAllowedByRobots(robots, '/a+b(c)')).toBe(false);
    expect(isAllowedByRobots(robots, '/aaab')).toBe(true);
  });
});
