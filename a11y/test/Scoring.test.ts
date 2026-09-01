import { describe, expect, it } from 'vitest';
import { computeEvidenceScore, DEFAULT_ICP, scoreProspect, type ScoringInput } from '../src/scoring/IcpScoring.js';
import { normalizeIssue } from '../src/findings/Normalize.js';
import { groupFindings } from '../src/findings/Dedupe.js';
import type { SiteSignals } from '../src/discovery/PlatformDetect.js';
import type { Finding, JourneyStep, PageType } from '../src/core/Types.js';

const signals = (overrides: Partial<SiteSignals> = {}): SiteSignals => ({
  companyName: 'Nordvik Hem',
  companyNameSource: 'og:site_name',
  platform: 'woocommerce',
  platformEvidence: 'WooCommerce assets detected',
  cms: 'wordpress',
  cmsEvidence: 'wp-content',
  ecommerceDetected: true,
  ecommerceEvidence: ['cart link in navigation', 'schema.org Product'],
  contactChannels: [{ kind: 'email', value: 'hej@nordvik.se', source: 'homepage mailto: link' }],
  agencyAttribution: null,
  agencyAttributionSource: null,
  activityEvidence: ['footer copyright mentions the current year'],
  b2bIndicators: [],
  accessibilityStatementUrl: null,
  productLinkCount: 12,
  links: [],
  ...overrides,
});

const journey = (reached: PageType[]): JourneyStep[] =>
  (['homepage', 'search', 'category', 'product', 'cart', 'account', 'checkout_entry'] as PageType[]).map((pageType) => ({
    pageType,
    url: reached.includes(pageType) ? `https://nordvik.se/${pageType}` : null,
    reached: reached.includes(pageType),
    reason: reached.includes(pageType) ? undefined : 'no candidate URL was found on the site',
  }));

function findings(rules: { rule: string; pageType: PageType; urls?: number }[]): { findings: Finding[]; groups: ReturnType<typeof groupFindings>['groups'] } {
  const raw: Finding[] = [];
  for (const spec of rules) {
    for (let i = 0; i < (spec.urls ?? 1); i += 1) {
      raw.push(
        normalizeIssue(
          {
            engine: 'dialog-probe',
            rule: spec.rule,
            selector: `div.${spec.rule.replace(/\W/g, '')}`,
            html: '<div>x</div>',
            params: { name: 'Filtrera' },
            impactHint: 'critical',
            componentLabel: 'Filtrera',
          },
          { scanId: 's', prospectId: 'p', url: `https://nordvik.se/${spec.pageType}/${i}`, pageType: spec.pageType },
        ),
      );
    }
  }
  const grouped = groupFindings(raw);
  for (const finding of grouped.findings) finding.screenshotKey = `shot/${finding.id}.png`;
  return { findings: grouped.findings, groups: grouped.groups };
}

const input = (overrides: Partial<ScoringInput> = {}): ScoringInput => ({
  domain: 'nordvik.se',
  signals: signals(),
  journey: journey(['homepage', 'search', 'category', 'product', 'cart']),
  findings: [],
  groups: [],
  reachable: true,
  ...overrides,
});

describe('ICP qualification', () => {
  it('qualifies a Swedish store with real barriers in the buying journey', () => {
    const { findings: f, groups } = findings([
      { rule: 'component.enter-does-not-activate', pageType: 'category', urls: 2 },
      { rule: 'keyboard.mouse-only-control', pageType: 'product' },
      { rule: 'form.missing-label', pageType: 'checkout_entry' },
    ]);
    const result = scoreProspect(input({ findings: f, groups }));
    expect(result.qualification).toBe('qualified');
    expect(result.leadScore).toBeGreaterThan(DEFAULT_ICP.qualifyAtScore);
    expect(result.applied.map((s) => s.id)).toContain('journey_barriers');
  });

  it('disqualifies a site we could not test at all, and says so', () => {
    const result = scoreProspect(input({ reachable: false }));
    expect(result.qualification).toBe('disqualified');
    expect(result.leadScore).toBe(0);
    expect(result.reviewFlags.join(' ')).toContain('reachable');
  });

  it('disqualifies a B2B-only site and flags it for a human check', () => {
    const { findings: f, groups } = findings([{ rule: 'component.enter-does-not-activate', pageType: 'category' }]);
    const result = scoreProspect(input({ findings: f, groups, signals: signals({ b2bIndicators: ['exkl. moms', 'återförsäljare'] }) }));
    expect(result.qualification).toBe('disqualified');
    expect(result.reviewFlags.join(' ')).toContain('B2B');
  });

  it('disqualifies a store with no meaningful barrier to lead with', () => {
    expect(scoreProspect(input()).qualification).toBe('disqualified');
  });

  it('stands down from a site already running an accessibility program', () => {
    const result = scoreProspect(input({ signals: signals({ accessibilityStatementUrl: 'https://nordvik.se/tillganglighet' }) }));
    expect(result.applied.map((s) => s.id)).toContain('mature_a11y_program');
    expect(result.qualification).toBe('disqualified');
  });

  it('references an accessibility statement respectfully when barriers do exist', () => {
    const { findings: f, groups } = findings([{ rule: 'component.enter-does-not-activate', pageType: 'category' }]);
    const result = scoreProspect(input({ findings: f, groups, signals: signals({ accessibilityStatementUrl: 'https://nordvik.se/tillganglighet' }) }));
    expect(result.qualification).toBe('qualified');
    expect(result.reviewFlags.join(' ')).toContain('accessibility statement');
  });

  it('never invents a company name and says so when it cannot read one', () => {
    const result = scoreProspect(input({ signals: signals({ companyName: null }) }));
    expect(result.reviewFlags.join(' ')).toContain('do not invent');
  });

  it('records evidence for every signal it applied', () => {
    const result = scoreProspect(input());
    for (const applied of result.applied) expect(applied.evidence.length).toBeGreaterThan(0);
  });
});

describe('evidence score', () => {
  it('rewards a few strong distinct problems over many repeated weak ones', () => {
    const strong = findings([
      { rule: 'component.enter-does-not-activate', pageType: 'category', urls: 2 },
      { rule: 'keyboard.mouse-only-control', pageType: 'product' },
      { rule: 'form.missing-label', pageType: 'checkout_entry' },
    ]);
    const weak = findings([{ rule: 'structure.no-skip-link', pageType: 'homepage', urls: 30 }]);
    const strongScore = computeEvidenceScore(strong.findings, strong.groups);
    const weakScore = computeEvidenceScore(weak.findings, weak.groups);
    expect(strongScore).toBeGreaterThan(70);
    expect(weakScore).toBeLessThan(20);
  });

  it('does not let one rule repeated everywhere saturate the score', () => {
    const few = findings([{ rule: 'focus.no-visible-indicator', pageType: 'product', urls: 2 }]);
    const many = findings([{ rule: 'focus.no-visible-indicator', pageType: 'product', urls: 40 }]);
    expect(computeEvidenceScore(many.findings, many.groups) - computeEvidenceScore(few.findings, few.groups)).toBeLessThanOrEqual(5);
  });

  it('scores nothing when there is nothing confirmed to show', () => {
    expect(computeEvidenceScore([], [])).toBe(0);
  });
});
