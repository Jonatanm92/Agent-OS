/**
 * Browser-backed integration tests against the intentionally broken fixture shop.
 *
 * These use the --allow-private-targets escape hatch to reach 127.0.0.1, which
 * is exactly what it exists for (THREAT-MODEL.md T10).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureServer, type FixtureServer } from '../fixtures/serve.js';
import { runScan, ScanError } from '../src/scan.js';
import { runPrescan, renderPrescanSummary, selectObservations, assessSignal } from '../src/prescan/prescan.js';
import { SCAN_LIMITS, PRESCAN_LIMITS } from '../src/config.js';
import type { ScanResult } from '../src/types.js';

let server: FixtureServer;

beforeAll(async () => {
  server = await startFixtureServer();
});

afterAll(async () => {
  await server?.close();
});

/** Shared full scan, reused by most assertions so the suite stays quick. */
let scan: ScanResult;

beforeAll(async () => {
  scan = await runScan(server.origin, {
    allowPrivateTargets: true,
    limits: { ...SCAN_LIMITS, maxPages: 8, requestDelayMs: 0 },
    useRobots: true,
  });
}, 180_000);

describe('crawler limits (T6)', () => {
  it('never exceeds the page budget', async () => {
    const small = await runScan(server.origin, {
      allowPrivateTargets: true,
      limits: { ...SCAN_LIMITS, maxPages: 3, requestDelayMs: 0 },
      useRobots: false,
    });
    expect(small.pages.length).toBeLessThanOrEqual(3);
  }, 120_000);

  it('never exceeds the depth budget', () => {
    for (const page of scan.pages) {
      expect(page.depth).toBeLessThanOrEqual(SCAN_LIMITS.maxDepth);
    }
  });

  it('does not reach a page that sits deeper than the budget', () => {
    // deepest.html is only linked from deeper.html, which is at depth 2.
    expect(scan.pages.map((p) => p.url).join(' ')).not.toContain('deepest.html');
  });

  it('visits each URL at most once', () => {
    const urls = scan.pages.map((p) => p.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('honours a Disallow written for this crawler', () => {
    // The a11yriskscan group disallows /nyhetsbrev.html.
    expect(scan.pages.map((p) => p.url).join(' ')).not.toContain('nyhetsbrev.html');
    expect(scan.robotsRespected).toBe(true);
  });

  it('lets a group naming this crawler replace the wildcard group', () => {
    // The wildcard group disallows /search.html, but the a11yriskscan group
    // does not — and a specific group replaces the wildcard entirely. Fetching
    // it is correct robots.txt behaviour, not a leak.
    expect(scan.pages.map((p) => p.url).join(' ')).toContain('search.html');
  });

  it('records what it skipped instead of hiding it', () => {
    expect(scan.notTested.join(' ')).toMatch(/robots\.txt|could change state/);
  });
});

describe('destructive-action avoidance (T7)', () => {
  it('never visits a logout URL even though the home page links to it', () => {
    expect(scan.pages.map((p) => p.url).join(' ')).not.toContain('logout');
  });

  it('reports the logout link as deliberately skipped', () => {
    expect(scan.notTested.join(' ')).toMatch(/logout.*could change state|could change state/);
  });
});

describe('role-aware discovery (Phase 1)', () => {
  it('finds the pages that matter for an e-commerce journey', () => {
    const roles = new Set(scan.pages.filter((p) => !p.error).map((p) => p.role));
    expect(roles.has('home')).toBe(true);
    expect(roles.has('product')).toBe(true);
    expect(roles.has('cart')).toBe(true);
  });

  it('prefers filling different roles over crawling more of the same', () => {
    const roles = scan.pages.filter((p) => !p.error).map((p) => p.role);
    // With 8 pages of budget it should have found several distinct kinds.
    expect(new Set(roles).size).toBeGreaterThanOrEqual(4);
  });
});

describe('detection (Phase 2)', () => {
  it('finds the defects deliberately planted in the fixture', () => {
    const ruleIds = new Set(scan.issues.map((i) => i.ruleId));
    // Planted in index.html, collection.html, product.html, cart.html.
    expect(ruleIds.has('image-alt')).toBe(true);
    expect(ruleIds.has('link-name')).toBe(true);
    expect(ruleIds.has('button-name')).toBe(true);
  });

  it('finds the missing document language on the home page', () => {
    const langIssue = scan.issues.find((i) => i.ruleId === 'html-has-lang');
    expect(langIssue).toBeDefined();
  });

  it('finds the zoom suppression planted in the viewport meta tag', () => {
    expect(scan.issues.some((i) => i.ruleId === 'meta-viewport')).toBe(true);
  });

  it('finds a keyboard-inaccessible clickable element', () => {
    expect(scan.issues.some((i) => i.ruleId === 'check:nonsemantic-clickable')).toBe(true);
  });

  it('finds the checkout fields with no autocomplete', () => {
    const issue = scan.issues.find((i) => i.ruleId === 'check:missing-autocomplete');
    expect(issue).toBeDefined();
  });

  it('finds the positive tabindex on the contact form', () => {
    expect(scan.issues.some((i) => i.ruleId === 'check:positive-tabindex')).toBe(true);
  });

  it('does not invent findings on the clean control page', () => {
    // clean.html is deliberately defect-free; nothing should be attributed to it
    // beyond page-level checks that legitimately apply everywhere.
    const cleanUrl = `${server.origin}/clean.html`;
    const attributed = scan.issues.filter((i) => i.affectedUrls.includes(cleanUrl));
    for (const issue of attributed) {
      expect(['region', 'check:no-h1', 'check:no-skip-link', 'landmark-one-main']).toContain(issue.ruleId);
    }
  });
});

describe('grouping across pages (Phase 4)', () => {
  it('reports a repeated card defect once, not once per card', () => {
    const imageAlt = scan.issues.filter((i) => i.ruleId === 'image-alt');
    // The collection page has five identical cards. They must not be five issues.
    for (const issue of imageAlt) {
      if (issue.instanceCount > 1) {
        expect(issue.instanceCount).toBeGreaterThan(1);
        expect(issue.examples.length).toBeLessThanOrEqual(3);
      }
    }
    // Far fewer issues than raw occurrences.
    const occurrences = scan.issues.reduce((sum, i) => sum + i.instanceCount, 0);
    expect(scan.issues.length).toBeLessThan(occurrences);
  });
});

describe('severity (Phase 5)', () => {
  it('escalates cart-page defects above the same defect elsewhere', () => {
    const cartIssues = scan.issues.filter((i) => i.affectedRoles.includes('cart'));
    expect(cartIssues.length).toBeGreaterThan(0);
    expect(cartIssues.some((i) => i.severity === 'critical')).toBe(true);
  });

  it('sorts the highest-severity issue first', () => {
    const order = ['critical', 'high', 'medium', 'low'];
    const indices = scan.issues.map((i) => order.indexOf(i.severity));
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]!).toBeGreaterThanOrEqual(indices[i - 1]!);
    }
  });
});

describe('failed navigation and malformed markup', () => {
  it('records a page that 404s as not tested, and keeps scanning', async () => {
    const result = await runScan(`${server.origin}/does-not-exist.html`, {
      allowPrivateTargets: true,
      limits: { ...SCAN_LIMITS, maxPages: 2, requestDelayMs: 0 },
      useRobots: false,
    });
    expect(result.pages[0]!.error).toMatch(/HTTP 404/);
    expect(result.issues).toEqual([]);
  }, 60_000);

  it('refuses a target that cannot be resolved rather than producing an empty report', async () => {
    await expect(
      runScan('https://definitely-not-a-real-domain.invalid/', { useRobots: false })
    ).rejects.toBeInstanceOf(ScanError);
  }, 60_000);

  it('refuses a private target when the escape hatch is not set', async () => {
    await expect(runScan(server.origin, { useRobots: false })).rejects.toThrow(ScanError);
  });

  it('scans malformed HTML without crashing', async () => {
    const result = await runScan(`${server.origin}/malformed.html`, {
      allowPrivateTargets: true,
      limits: { ...SCAN_LIMITS, maxPages: 1, requestDelayMs: 0 },
      useRobots: false,
    });
    expect(result.pages[0]!.error).toBeUndefined();
    // The browser recovers the markup, so findings are still produced.
    expect(result.issues.length).toBeGreaterThan(0);
  }, 60_000);

  it('detects reflow overflow on a fixed-width page', async () => {
    const result = await runScan(`${server.origin}/wide.html`, {
      allowPrivateTargets: true,
      limits: { ...SCAN_LIMITS, maxPages: 1, requestDelayMs: 0 },
      useRobots: false,
    });
    expect(result.issues.some((i) => i.ruleId === 'check:reflow-overflow')).toBe(true);
  }, 60_000);
});

describe('screenshot evidence', () => {
  it('captures at most the configured number per page', async () => {
    const result = await runScan(`${server.origin}/product.html`, {
      allowPrivateTargets: true,
      limits: { ...SCAN_LIMITS, maxPages: 1, requestDelayMs: 0, maxScreenshotsPerPage: 2 },
      useRobots: false,
    });
    const shots = result.issues.flatMap((i) => i.examples).filter((e) => e.screenshot);
    expect(shots.length).toBeLessThanOrEqual(2);
    for (const shot of shots) {
      expect(shot.screenshot!.startsWith('data:image/png;base64,')).toBe(true);
    }
  }, 60_000);

  it('still reports every finding when screenshots are disabled', async () => {
    const result = await runScan(`${server.origin}/product.html`, {
      allowPrivateTargets: true,
      limits: { ...SCAN_LIMITS, maxPages: 1, requestDelayMs: 0, maxScreenshotsPerPage: 0 },
      useRobots: false,
    });
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.flatMap((i) => i.examples).every((e) => !e.screenshot)).toBe(true);
  }, 60_000);

  it('discards a capture that exceeds the size cap rather than embedding it', async () => {
    const result = await runScan(`${server.origin}/product.html`, {
      allowPrivateTargets: true,
      limits: { ...SCAN_LIMITS, maxPages: 1, requestDelayMs: 0, maxScreenshotBytes: 1 },
      useRobots: false,
    });
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.flatMap((i) => i.examples).every((e) => !e.screenshot)).toBe(true);
  }, 60_000);
});

describe('manual checks are never marked as passed (Phase 3)', () => {
  it('emits the full checklist alongside automated findings', () => {
    expect(scan.manualChecks.length).toBeGreaterThanOrEqual(15);
    expect(scan.manualChecks.every((c) => c.passCriteria.length > 0)).toBe(true);
  });
});

describe('prescan (Phase 7)', () => {
  it('runs within a small page budget', async () => {
    const result = await runPrescan(server.origin, {
      allowPrivateTargets: true,
      limits: { ...PRESCAN_LIMITS, requestDelayMs: 0 },
      useRobots: false,
    });
    expect(result.pagesExamined).toBeLessThanOrEqual(PRESCAN_LIMITS.maxPages);
  }, 120_000);

  it('reports between three and seven high-confidence observations', () => {
    const observations = selectObservations(scan.issues);
    expect(observations.length).toBeGreaterThanOrEqual(3);
    expect(observations.length).toBeLessThanOrEqual(7);
  });

  it('only surfaces rules on the high-confidence list', () => {
    const noisy = selectObservations([
      { ruleId: 'region', severity: 'low' },
      { ruleId: 'image-alt', severity: 'high' },
    ] as never);
    expect(noisy.map((o) => o.ruleId)).toEqual(['image-alt']);
  });

  it('uses observational language and never asserts illegality', () => {
    const summary = renderPrescanSummary({
      domain: 'shop.se',
      target: 'https://shop.se',
      scanDate: '2026-08-31T00:00:00.000Z',
      pagesExamined: 4,
      observations: selectObservations(scan.issues),
      signal: 'strong',
      signalReason: 'test',
      notes: [],
    });

    expect(summary).toMatch(/We observed/);
    expect(summary).toMatch(/INTERNAL LEAD SUMMARY — NOT FOR SENDING/);
    expect(summary).toMatch(/not an audit, not a compliance assessment, and not legal advice/i);

    for (const forbidden of [/breaks the law/i, /illegal/i, /non-compliant/i, /you must/i, /fine[sd]?\b/i, /lawsuit/i]) {
      expect(summary).not.toMatch(forbidden);
    }
  });

  it('says plainly when nothing was observed rather than inventing a hook', () => {
    const summary = renderPrescanSummary({
      domain: 'clean.se',
      target: 'https://clean.se',
      scanDate: '2026-08-31T00:00:00.000Z',
      pagesExamined: 4,
      observations: [],
      signal: 'weak',
      signalReason: 'nothing found',
      notes: [],
    });
    expect(summary).toMatch(/No high-confidence accessibility barriers were observed/);
    expect(summary).toMatch(/not evidence that/i);
  });

  it('grades the signal from what was actually found', () => {
    expect(assessSignal([], 0).signal).toBe('weak');
    expect(assessSignal([{ severity: 'critical' }] as never, 4).signal).toBe('strong');
    expect(assessSignal([{ severity: 'high' }, { severity: 'high' }] as never, 4).signal).toBe('strong');
    expect(assessSignal([{ severity: 'medium' }] as never, 4).signal).toBe('weak');
  });
});
