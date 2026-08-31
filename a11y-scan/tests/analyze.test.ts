import { describe, expect, it } from 'vitest';
import type { Finding, Issue, PageRole } from '../src/types.js';
import { componentLabel, componentsPerRule, groupFindings, normalizeSelector } from '../src/analyze/group.js';
import { assignEffort, assignSeverity, countBySeverity, escalate, priorityScore, quickWins, rankIssues } from '../src/analyze/severity.js';
import { buildIssues } from '../src/analyze/normalize.js';
import { buildJourney, collectPositives } from '../src/analyze/journey.js';
import { buildManualScript } from '../src/analyze/manual-script.js';

function finding(overrides: Partial<Finding> & { ruleId: string; url: string; selector: string; role?: PageRole }): Finding {
  return {
    ruleId: overrides.ruleId,
    title: overrides.title ?? overrides.ruleId,
    source: overrides.source ?? 'axe',
    verification: overrides.verification ?? 'automatic',
    wcag: overrides.wcag ?? ['1.1.1 Non-text Content (A)'],
    impact: overrides.impact ?? 'impact',
    remediation: overrides.remediation ?? 'fix it',
    instance: {
      url: overrides.url,
      role: overrides.role ?? 'other',
      selector: overrides.selector,
      snippet: '<img>',
    },
  };
}

describe('selector normalization', () => {
  it('strips positional pseudo-classes', () => {
    expect(normalizeSelector('.grid > li:nth-child(7) > a.card')).toBe('.grid > li > a.card');
    expect(normalizeSelector('ul > li:nth-of-type(2)')).toBe('ul > li');
  });

  it('collapses generated numeric ids', () => {
    expect(normalizeSelector('#product-4821 .qty')).toBe('[id] .qty');
  });

  it('collapses numbered utility classes', () => {
    expect(normalizeSelector('.col-7 > .item-12')).toBe('.col-N > .item-N');
  });

  it('collapses attribute values but keeps the attribute name', () => {
    expect(normalizeSelector('[data-product-id="4821"] img')).toBe('[data-product-id] img');
  });

  it('collapses attribute selectors that use an operator', () => {
    // Two product cards linking to different products are ONE component.
    expect(normalizeSelector('.card[href$="handduk.html"] > img')).toBe('.card[href] > img');
    expect(normalizeSelector('.card[href$="orngott.html"] > img')).toBe('.card[href] > img');
    expect(normalizeSelector('a[class*="btn"]')).toBe('a[class]');
    expect(normalizeSelector('input[type="email" i]')).toBe('input[type]');
  });

  it('keeps a bare attribute-presence selector', () => {
    expect(normalizeSelector('input[required]')).toBe('input[required]');
  });

  it('leaves a meaningful selector alone', () => {
    expect(normalizeSelector('header > a.logo')).toBe('header > a.logo');
  });

  it('produces a short human label from the tail of the selector', () => {
    expect(componentLabel('body > div > .grid > li > a.card')).toBe('li > a.card');
    expect(componentLabel('')).toBe('(page level)');
  });
});

describe('grouping (Phase 4)', () => {
  it('collapses one defect across forty pages into a single issue', () => {
    const findings = Array.from({ length: 40 }, (_, i) =>
      finding({
        ruleId: 'image-alt',
        url: `https://shop.se/product/${i}`,
        selector: `.product-grid > li:nth-child(${i + 1}) > img`,
      })
    );

    const groups = groupFindings(findings);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.instanceCount).toBe(40);
    expect(groups[0]!.affectedUrls).toHaveLength(40);
  });

  it('keeps genuinely different components apart', () => {
    const groups = groupFindings([
      finding({ ruleId: 'image-alt', url: 'https://shop.se/a', selector: 'header > img.logo' }),
      finding({ ruleId: 'image-alt', url: 'https://shop.se/a', selector: '.grid > li > img.thumb' }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('keeps different rules on the same component apart', () => {
    const groups = groupFindings([
      finding({ ruleId: 'image-alt', url: 'https://shop.se/a', selector: 'a.card > img' }),
      finding({ ruleId: 'link-name', url: 'https://shop.se/a', selector: 'a.card > img' }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('shows at most three examples, preferring different pages', () => {
    const findings = [
      finding({ ruleId: 'image-alt', url: 'https://shop.se/a', selector: '.g > img:nth-child(1)' }),
      finding({ ruleId: 'image-alt', url: 'https://shop.se/a', selector: '.g > img:nth-child(2)' }),
      finding({ ruleId: 'image-alt', url: 'https://shop.se/b', selector: '.g > img:nth-child(1)' }),
      finding({ ruleId: 'image-alt', url: 'https://shop.se/c', selector: '.g > img:nth-child(1)' }),
    ];
    const groups = groupFindings(findings);
    expect(groups[0]!.examples).toHaveLength(3);
    expect(new Set(groups[0]!.examples.map((e) => e.url)).size).toBe(3);
  });

  it('assigns a stable id for the same rule and component', () => {
    const a = groupFindings([finding({ ruleId: 'image-alt', url: 'https://shop.se/a', selector: '.g > img' })]);
    const b = groupFindings([finding({ ruleId: 'image-alt', url: 'https://shop.se/z', selector: '.g > img' })]);
    expect(a[0]!.id).toBe(b[0]!.id);
  });

  it('counts components to fix, not pages affected', () => {
    // One shared template rendered on forty pages is ONE place to edit.
    const shared = groupFindings(
      Array.from({ length: 40 }, (_, i) =>
        finding({ ruleId: 'image-alt', url: `https://shop.se/p${i}`, selector: `.card:nth-child(${i}) > img` })
      )
    );
    expect(componentsPerRule(shared).get('image-alt')).toBe(1);

    // Forty hand-written images normalize differently, so they are forty fixes.
    const handWritten = groupFindings(
      Array.from({ length: 40 }, (_, i) =>
        finding({ ruleId: 'image-alt', url: 'https://shop.se/a', selector: `.section-${String.fromCharCode(97 + (i % 26))}${i} > img` })
      )
    );
    expect(componentsPerRule(handWritten).get('image-alt')).toBeGreaterThan(10);
  });
});

describe('severity assignment (Phase 5)', () => {
  it('escalates a defect that appears in the purchase flow', () => {
    const base = assignSeverity({ ruleId: 'image-alt', affectedRoles: ['other'], affectedPageCount: 1, totalPageCount: 10 });
    const inFlow = assignSeverity({ ruleId: 'image-alt', affectedRoles: ['cart'], affectedPageCount: 1, totalPageCount: 10 });
    expect(base).toBe('high');
    expect(inFlow).toBe('critical');
  });

  it('escalates a defect present on most of the site', () => {
    const narrow = assignSeverity({ ruleId: 'document-title', affectedRoles: ['other'], affectedPageCount: 1, totalPageCount: 10 });
    const systemic = assignSeverity({ ruleId: 'document-title', affectedRoles: ['other'], affectedPageCount: 9, totalPageCount: 10 });
    expect(narrow).toBe('medium');
    expect(systemic).toBe('high');
  });

  it('never lets a blocking rule fall below high', () => {
    const severity = assignSeverity({ ruleId: 'check:no-focus-indicator', affectedRoles: ['other'], affectedPageCount: 1, totalPageCount: 100 });
    expect(severity).toBe('high');
  });

  it('caps at critical however many modifiers apply', () => {
    const severity = assignSeverity({ ruleId: 'label', affectedRoles: ['cart', 'checkout-entry'], affectedPageCount: 10, totalPageCount: 10 });
    expect(severity).toBe('critical');
  });

  it('falls back to a conservative default for an unknown rule', () => {
    expect(assignSeverity({ ruleId: 'never-heard-of-it', affectedRoles: ['other'], affectedPageCount: 1, totalPageCount: 10 })).toBe('medium');
  });

  it('escalate() does not run past critical', () => {
    expect(escalate('critical')).toBe('critical');
    expect(escalate('low', 5)).toBe('critical');
  });
});

describe('effort assignment', () => {
  it('stays small for one shared component however many pages it appears on', () => {
    expect(assignEffort({ ruleId: 'image-alt', distinctComponents: 1 })).toBe('small');
  });

  it('grows with the number of components to edit, not pages affected', () => {
    expect(assignEffort({ ruleId: 'image-alt', distinctComponents: 8 })).toBe('medium');
    expect(assignEffort({ ruleId: 'image-alt', distinctComponents: 30 })).toBe('large');
  });

  it('never exceeds large', () => {
    expect(assignEffort({ ruleId: 'color-contrast', distinctComponents: 500 })).toBe('large');
  });
});

describe('priority and ranking', () => {
  it('rewards high impact for low effort', () => {
    expect(priorityScore('critical', 'small')).toBeGreaterThan(priorityScore('critical', 'large'));
    expect(priorityScore('critical', 'large')).toBeGreaterThan(priorityScore('low', 'large'));
  });

  it('sorts severity above priority score', () => {
    const issues = [
      { id: 'a', severity: 'low', priority: 10, instanceCount: 1 },
      { id: 'b', severity: 'critical', priority: 2, instanceCount: 1 },
    ] as unknown as Issue[];
    expect(rankIssues(issues)[0]!.id).toBe('b');
  });

  it('picks quick wins as small-effort, meaningful-impact issues', () => {
    const issues = [
      { id: 'a', severity: 'critical', effort: 'small', priority: 10 },
      { id: 'b', severity: 'critical', effort: 'large', priority: 2 },
      { id: 'c', severity: 'low', effort: 'small', priority: 1 },
    ] as unknown as Issue[];
    const wins = quickWins(issues).map((i) => i.id);
    expect(wins).toEqual(['a']);
  });

  it('counts by severity', () => {
    const counts = countBySeverity([
      { severity: 'critical' }, { severity: 'critical' }, { severity: 'low' },
    ] as unknown as Issue[]);
    expect(counts).toEqual({ critical: 2, high: 0, medium: 0, low: 1 });
  });
});

describe('buildIssues integration', () => {
  it('groups, scores and ranks in one pass', () => {
    const findings = [
      ...Array.from({ length: 5 }, (_, i) =>
        finding({ ruleId: 'image-alt', url: `https://shop.se/p${i}`, selector: `.card:nth-child(${i}) > img`, role: 'collection' })
      ),
      finding({ ruleId: 'button-name', url: 'https://shop.se/cart', selector: '.remove', role: 'cart' }),
    ];

    const issues = buildIssues(findings, 6);

    expect(issues).toHaveLength(2);
    // Both land on critical with the same score; the purchase-flow tiebreak
    // puts the cart button first even though the alt text spans more pages.
    expect(issues[0]!.ruleId).toBe('button-name');
    expect(issues[0]!.severity).toBe('critical');
    expect(issues[1]!.instanceCount).toBe(5);
    expect(issues[1]!.effort).toBe('small');
  });

  it('returns an empty list for no findings without throwing', () => {
    expect(buildIssues([], 5)).toEqual([]);
  });
});

describe('customer journey', () => {
  it('marks a stage as not examined rather than as passing', () => {
    const stages = buildJourney([], ['home']);
    const cart = stages.find((s) => s.key === 'cart')!;
    expect(cart.examined).toBe(false);
    expect(cart.verdict).toMatch(/Not examined/);
  });

  it('does not claim a clean stage is accessible', () => {
    const stages = buildJourney([], ['home', 'cart']);
    const cart = stages.find((s) => s.key === 'cart')!;
    expect(cart.verdict).toMatch(/Manual checks still required/);
  });

  it('reports the worst severity per stage', () => {
    const issues = [
      { id: 'x', severity: 'critical', affectedRoles: ['cart'], title: 't' },
      { id: 'y', severity: 'low', affectedRoles: ['cart'], title: 't' },
    ] as unknown as Issue[];
    const cart = buildJourney(issues, ['cart']).find((s) => s.key === 'cart')!;
    expect(cart.worstSeverity).toBe('critical');
  });
});

describe('positives are never invented', () => {
  it('claims a positive only when the corresponding rule did not fire', () => {
    const withLangIssue = collectPositives([{ ruleId: 'html-has-lang' } as unknown as Issue], ['home']);
    expect(withLangIssue.join(' ')).not.toMatch(/document language/);

    const clean = collectPositives([], ['home']);
    expect(clean.join(' ')).toMatch(/document language/);
  });
});

describe('manual script (Phase 3)', () => {
  it('always emits the full checklist, never marked as passed', () => {
    const checks = buildManualScript([], []);
    expect(checks.length).toBeGreaterThanOrEqual(15);
    for (const check of checks) {
      expect(check).not.toHaveProperty('passed');
      expect(check.passCriteria.length).toBeGreaterThan(0);
    }
  });

  it('flags the area an automated finding points at', () => {
    const checks = buildManualScript(
      [{ ruleId: 'check:no-focus-indicator', title: 'No focus indicator' } as unknown as Issue],
      ['home']
    );
    const focusCheck = checks.find((c) => c.id === 'kb-02')!;
    expect(focusCheck.flaggedBy).toMatch(/No focus indicator/);
  });

  it('says explicitly when the scan never reached the cart', () => {
    const checks = buildManualScript([], ['home']);
    const cartCheck = checks.find((c) => c.id === 'cart-01')!;
    expect(cartCheck.instruction).toMatch(/did not reach a cart page/);
  });
});
