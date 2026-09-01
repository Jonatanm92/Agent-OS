/**
 * Asserts the HTML report answers the seven questions the commercial spec
 * requires, and that raw tool output does not dominate it.
 */
import { describe, expect, it } from 'vitest';
import type { Finding, ScanResult } from '../src/types.js';
import { buildIssues } from '../src/analyze/normalize.js';
import { buildManualScript } from '../src/analyze/manual-script.js';
import { collectPositives } from '../src/analyze/journey.js';
import { renderHtmlReport } from '../src/report/html-report.js';
import { buildHandoff } from '../src/report/handoff.js';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: 'label',
    title: 'Form fields have no label',
    source: 'axe',
    verification: 'automatic',
    wcag: ['1.3.1 Info and Relationships (A)'],
    impact: 'The customer cannot tell what to type. In checkout this stops the order.',
    remediation: 'Associate a <label for="..."> with each field.',
    verify: 'Click the visible label text; focus should move into the field.',
    instance: {
      url: 'https://shop.example.se/checkout',
      role: 'checkout-entry',
      selector: 'input[name=email]',
      snippet: '<input name="email" placeholder="E-post">',
      detail: 'Fix any of the following: Element does not have an implicit (wrapped) <label>',
    },
    ...overrides,
  };
}

function scanResult(): ScanResult {
  const findings = [
    finding(),
    finding({ ruleId: 'button-name', title: 'Buttons have no accessible name', instance: {
      url: 'https://shop.example.se/cart', role: 'cart', selector: '.remove',
      snippet: '<button class="remove"></button>',
    } }),
  ];
  const issues = buildIssues(findings, 5);
  return {
    target: 'https://shop.example.se',
    domain: 'shop.example.se',
    scanDate: '2026-09-01T09:00:00.000Z',
    durationMs: 42_000,
    pages: [
      { url: 'https://shop.example.se/', role: 'home', depth: 0, title: 'Shop', status: 200 },
      { url: 'https://shop.example.se/checkout', role: 'checkout-entry', depth: 1, title: 'Checkout', status: 200 },
      { url: 'https://shop.example.se/cart', role: 'cart', depth: 1, title: 'Cart', status: 200 },
    ],
    issues,
    manualChecks: buildManualScript(issues, ['home', 'checkout-entry', 'cart']),
    positives: collectPositives(issues, ['home', 'checkout-entry', 'cart']),
    notTested: [],
    limits: { maxPages: 12, maxDepth: 2 },
    robotsRespected: true,
  };
}

describe('the paid report answers the seven required questions', () => {
  const result = scanResult();
  const html = renderHtmlReport(result);

  it('1. what to fix first — a ranked list exists', () => {
    expect(html).toMatch(/Five highest-priority fixes/);
    expect(html).toMatch(/Quick wins/);
  });

  it('2. why it matters — impact text is present per finding, not just a rule id', () => {
    expect(html).toContain('The customer cannot tell what to type');
  });

  it('3. where the problem is — URL and the ORIGINAL selector are shown', () => {
    // escapeHtml() escapes "/" as well as the usual five characters (it is what
    // stops a value containing </script> from closing a script block — see
    // security/escape.ts and tests/report.test.ts), so the URL appears escaped.
    //
    // Separately: the finding is grouped under a normalized COMPONENT selector
    // (attribute values are stripped as instance-identifying noise), but the
    // evidence block for each example must still show the real, un-normalized
    // selector from the page, or a developer cannot find the element.
    expect(html).toContain('shop.example.se&#47;checkout');
    expect(html).toContain('input[name=email]'); // real selector, in the evidence block
  });

  it('4. how a developer reproduces it — a concrete verify step is shown, not just "see finding"', () => {
    expect(html).toMatch(/How to reproduce it/);
    expect(html).toContain('Click the visible label text');
  });

  it('5. likely remediation is stated', () => {
    expect(html).toMatch(/How to fix it/);
    expect(html).toContain('Associate a');
  });

  it('6. automatic vs manual verification is explicit, and never says a manual check passed', () => {
    expect(html).toContain('Automatically verified');
    expect(html).toContain('Manual check required');
    expect(html).not.toMatch(/manual check.{0,20}passed/i);
  });

  it('7. what part of the journey was examined is answered', () => {
    expect(html).toMatch(/Customer journey/);
    expect(html).toMatch(/Browse.*Product.*Add to cart.*Cart.*Checkout entry/);
  });
});

describe('raw tool output does not dominate the report', () => {
  const html = renderHtmlReport(scanResult());

  it('every issue has a plain-language impact sentence before any tool string', () => {
    const impactIndex = html.indexOf('The customer cannot tell what to type');
    const toolOutputIndex = html.indexOf('Fix any of the following');
    expect(impactIndex).toBeGreaterThan(-1);
    expect(impactIndex).toBeLessThan(toolOutputIndex);
  });

  it('raw axe failure summaries are labelled as tool output, not presented as the finding', () => {
    expect(html).toMatch(/evidence__tool">Tool output/);
  });

  it('the axe rule id is present but demoted to a fact, not the heading', () => {
    // The human title, not the machine id, is the <h3>.
    expect(html).toMatch(/<h3 class="issue__title">Form fields have no label<\/h3>/);
    expect(html).toMatch(/<h3 class="issue__title">Buttons have no accessible name<\/h3>/);
  });
});

describe('the developer handoff carries reproduction steps too', () => {
  it('includes a Reproduce line distinct from the fix', () => {
    const tasks = buildHandoff(scanResult());
    const labelTask = tasks.find((t) => t.title.includes('Form fields'));
    expect(labelTask?.body).toMatch(/\*\*Reproduce\*\*:/);
    expect(labelTask?.body).toMatch(/\*\*Fix\*\*:/);
  });
});
