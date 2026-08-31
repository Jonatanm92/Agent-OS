import { describe, expect, it } from 'vitest';
import type { RawIssue } from '../src/audit/RawIssue.js';
import { componentSignatureFor, normalizeIssue, ruleTitle } from '../src/findings/Normalize.js';
import { groupFindings, rankGroups } from '../src/findings/Dedupe.js';
import { weightByPageType, isCustomerJourneyBarrier } from '../src/findings/Severity.js';
import { wcagFromAxeTags } from '../src/findings/WcagMap.js';
import { selectMiniFindings, categorizeForProfessional, isReportable, isMerchantOwned } from '../src/reports/Selection.js';
import { detectThirdParty, vendorLabel } from '../src/findings/ThirdParty.js';
import type { Finding, PageType } from '../src/core/Types.js';

const issue = (overrides: Partial<RawIssue> = {}): RawIssue => ({
  engine: 'dialog-probe',
  rule: 'component.enter-does-not-activate',
  selector: 'div.filters > div.btn',
  html: '<div class="btn" role="button" tabindex="0">Filtrera</div>',
  params: { name: 'Filtrera' },
  impactHint: 'critical',
  componentLabel: 'Filtrera',
  ...overrides,
});

const context = (pageType: PageType = 'category') => ({ scanId: 'scn_1', prospectId: 'pro_1', url: `https://butik.se/${pageType}`, pageType });

describe('normalization', () => {
  it('renders Swedish customer-facing copy from catalog templates', () => {
    const finding = normalizeIssue(issue(), context());
    expect(finding.observedBehaviour).toContain('Filtrera');
    expect(finding.observedBehaviour).toContain('tangentbordsfokus');
    expect(finding.userImpact).toContain('Tangentbordsanvändare');
    expect(finding.reproduction.length).toBeGreaterThanOrEqual(3);
    expect(finding.keyboardReproduction.length).toBeGreaterThan(0);
  });

  it('renders English when the market locale asks for it', () => {
    const finding = normalizeIssue(issue(), { ...context(), locale: 'en' });
    expect(finding.observedBehaviour).toContain('opens when clicked with a mouse');
  });

  it('maps to WCAG criteria only where the mapping is reliable', () => {
    const finding = normalizeIssue(issue(), context());
    expect(finding.wcag.map((w) => w.criterion)).toEqual(['2.1.1', '4.1.2']);
    expect(wcagFromAxeTags(['wcag2a', 'wcag111', 'cat.text-alternatives'])).toEqual([
      { criterion: '1.1.1', level: 'A', title: 'Non-text Content' },
    ]);
    expect(wcagFromAxeTags(['best-practice'])).toEqual([]);
  });

  it('keeps axe findings usable even without hand-written copy', () => {
    const finding = normalizeIssue(
      issue({ rule: 'axe.some-unmapped-rule', engine: 'axe-core', observed: 'axe says so', data: { tags: ['wcag2aa', 'wcag143'], helpUrl: 'https://x' } }),
      context(),
    );
    expect(finding.observedBehaviour).toBe('axe says so');
    expect(finding.remediation).toContain('https://x');
    expect(finding.wcag[0].criterion).toBe('1.4.3');
  });

  it('marks axe incomplete results as needing a human, never as confirmed', () => {
    const finding = normalizeIssue(issue({ rule: 'axe.color-contrast', engine: 'axe-core', data: { incomplete: true } }), context());
    expect(finding.confidence).toBe('REVIEW_REQUIRED');
  });

  it('weights severity by where in the buying journey it was found', () => {
    expect(weightByPageType('high', 'checkout_entry')).toBe('critical');
    expect(weightByPageType('high', 'content')).toBe('medium');
    expect(weightByPageType('high', 'homepage')).toBe('high');
    expect(isCustomerJourneyBarrier('critical', 'product')).toBe(true);
    expect(isCustomerJourneyBarrier('critical', 'content')).toBe(false);
  });

  it('gives the same component the same signature across pages', () => {
    const a = normalizeIssue(issue(), context('category'));
    const b = normalizeIssue(issue({ selector: 'div.filters > div.btn:nth-of-type(3)' }), context('search'));
    expect(componentSignatureFor('div.filters > div.btn:nth-of-type(3)')).toBe('div.filters > div.btn');
    expect(a.signature).toBe(b.signature);
  });

  it('has a Swedish title for every rule it reports', () => {
    expect(ruleTitle('component.enter-does-not-activate')).toContain('tangentbord');
    expect(ruleTitle('axe.button-name')).toContain('namn');
  });
});

describe('systemic grouping', () => {
  it('represents one component failing on many pages as one problem', () => {
    const pages = Array.from({ length: 200 }, (_, i) => `https://butik.se/produkt/${i}`);
    const findings = pages.map((url) =>
      normalizeIssue(issue({ rule: 'keyboard.mouse-only-control', selector: 'nav.main > div.item' }), {
        scanId: 'scn_1',
        prospectId: 'pro_1',
        url,
        pageType: 'product',
      }),
    );
    const { groups, findings: kept } = groupFindings(findings);
    expect(groups).toHaveLength(1);
    expect(groups[0].systemic).toBe(true);
    expect(groups[0].affectedPageCount).toBe(200);
    expect(groups[0].instanceCount).toBe(200);
    // One evidence row per page at most — never 200 identical report entries.
    expect(kept.length).toBeLessThanOrEqual(200);
    expect(new Set(kept.map((f) => f.groupId)).size).toBe(1);
  });

  it('collapses repeated instances on a single page to one row', () => {
    const findings = Array.from({ length: 12 }, () =>
      normalizeIssue(issue({ rule: 'keyboard.mouse-only-control', selector: 'ul.cards > li.card > div.save' }), context('category')),
    );
    const { findings: kept, groups } = groupFindings(findings);
    expect(kept).toHaveLength(1);
    expect(groups[0].instanceCount).toBe(12);
    expect(groups[0].systemic).toBe(false);
  });

  it('ranks the worst systemic component first', () => {
    const critical = normalizeIssue(issue(), context('cart'));
    const minor = normalizeIssue(issue({ rule: 'structure.no-skip-link', selector: 'header > a', impactHint: 'minor', componentLabel: null }), context('homepage'));
    const { groups } = groupFindings([minor, critical]);
    expect(rankGroups(groups)[0].rule).toBe('component.enter-does-not-activate');
  });
});

describe('report selection', () => {
  const build = (overrides: Partial<Finding>): Finding => ({
    ...normalizeIssue(issue(), context()),
    ...overrides,
  });

  it('never puts a rejected or unreviewed low-confidence finding in a report', () => {
    expect(isReportable(build({ reviewStatus: 'rejected' }))).toBe(false);
    expect(isReportable(build({ confidence: 'REVIEW_REQUIRED' }))).toBe(false);
    expect(isReportable(build({ confidence: 'REVIEW_REQUIRED', reviewStatus: 'approved' }))).toBe(true);
    expect(isReportable(build({ confidence: 'CONFIRMED_AUTOMATED' }))).toBe(true);
  });

  it('caps the mini audit at five distinct problems', () => {
    const findings = ['component.enter-does-not-activate', 'keyboard.mouse-only-control', 'form.missing-label', 'focus.no-visible-indicator', 'reflow.horizontal-scroll', 'keyboard.focus-trap', 'axe.button-name']
      .map((rule, i) => build({ id: `f${i}`, rule, severity: 'critical', signature: `sig${i}`, groupId: `g${i}` }));
    expect(selectMiniFindings(findings, [], 5)).toHaveLength(5);
  });

  it('leads with the barrier a merchant can verify themselves', () => {
    const contrast = build({ id: 'f1', rule: 'axe.color-contrast', severity: 'critical', groupId: 'g1', componentLabel: 'Pris' });
    const filter = build({ id: 'f2', rule: 'component.enter-does-not-activate', severity: 'critical', groupId: 'g2', componentLabel: 'Filtrera' });
    expect(selectMiniFindings([contrast, filter], [], 5)[0].id).toBe('f2');
  });

  it('keeps review-required findings out of the roadmap and in manual validation', () => {
    const confirmed = build({ id: 'f1', severity: 'critical', pageType: 'cart', groupId: 'g1' });
    const uncertain = build({ id: 'f2', confidence: 'REVIEW_REQUIRED', severity: 'high', groupId: 'g2' });
    const sections = categorizeForProfessional([confirmed, uncertain]);
    expect(sections.criticalBarriers.map((f) => f.id)).toEqual(['f1']);
    expect(sections.manualValidation.map((f) => f.id)).toEqual(['f2']);
  });
});


describe('third-party attribution', () => {
  it('recognises the consent managers and widgets that dominate Swedish storefronts', () => {
    expect(detectThirdParty('#CybotCookiebotDialog > div > button', '<button>OK</button>')?.id).toBe('cookiebot');
    expect(detectThirdParty('#onetrust-banner-sdk button', '<button>Godkänn</button>')?.id).toBe('onetrust');
    expect(detectThirdParty('div.trustpilot-widget', '<div class="trustpilot-widget"></div>')?.id).toBe('trustpilot');
    expect(detectThirdParty('div', '<iframe src="https://widget.intercom.io/x"></iframe>')?.id).toBe('intercom');
    expect(vendorLabel('cookiebot')).toBe('Cookiebot');
  });

  it('treats unrecognised markup as the merchant\'s own, so we never excuse a real defect', () => {
    expect(detectThirdParty('div.filters > div.btn', '<div class="btn" role="button">Filtrera</div>')).toBeNull();
  });

  it('tags a finding with the vendor that owns the element', () => {
    const finding = normalizeIssue(
      issue({ rule: 'axe.button-name', engine: 'axe-core', selector: '#CybotCookiebotDialog button.close', html: '<button class="close"></button>', observed: 'no name' }),
      context('homepage'),
    );
    expect(finding.thirdParty).toBe('cookiebot');
    expect(isMerchantOwned(finding)).toBe(false);
  });

  it('keeps third-party defects out of the mini audit but reports them to a paying customer', () => {
    const own = normalizeIssue(issue(), context('category'));
    const vendor = normalizeIssue(
      issue({ rule: 'keyboard.mouse-only-control', selector: '#CybotCookiebotDialog div.btn', html: '<div class="btn" role="button">Godkänn</div>' }),
      context('homepage'),
    );
    own.id = 'own';
    own.groupId = 'g1';
    vendor.id = 'vendor';
    vendor.groupId = 'g2';

    expect(selectMiniFindings([vendor, own], [], 5).map((f) => f.id)).toEqual(['own']);
    const sections = categorizeForProfessional([vendor, own]);
    expect(sections.thirdParty.map((f) => f.id)).toEqual(['vendor']);
    expect([...sections.criticalBarriers, ...sections.highPriority].map((f) => f.id)).not.toContain('vendor');
  });
});
