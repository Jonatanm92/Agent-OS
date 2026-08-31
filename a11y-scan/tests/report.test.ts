import { describe, expect, it } from 'vitest';
import type { Finding, ScanResult } from '../src/types.js';
import { escapeHtml, safeLink, snippet, truncate } from '../src/security/escape.js';
import { buildIssues } from '../src/analyze/normalize.js';
import { buildManualScript } from '../src/analyze/manual-script.js';
import { collectPositives } from '../src/analyze/journey.js';
import { renderHtmlReport } from '../src/report/html-report.js';
import { buildJsonReport } from '../src/report/json-report.js';
import { buildHandoff, handoffToMarkdown } from '../src/report/handoff.js';

/** Strings a hostile shop could plant to break a report generator. */
const HOSTILE = [
  '</script><script>alert(1)</script>',
  '"><img src=x onerror=alert(2)>',
  "'; DROP TABLE issues; --",
  '</title><style>body{display:none}</style>',
  '<iframe src="javascript:alert(3)"></iframe>',
  '&lt;already-escaped&gt;',
];

function hostileFinding(payload: string): Finding {
  return {
    ruleId: 'image-alt',
    title: `Broken image ${payload}`,
    source: 'axe',
    verification: 'automatic',
    wcag: [`1.1.1 ${payload}`],
    impact: `Impact ${payload}`,
    remediation: `Fix ${payload}`,
    instance: {
      url: 'https://shop.se/p',
      role: 'product',
      selector: `.card${payload} > img`,
      snippet: `<img alt="${payload}">`,
      detail: `Detail ${payload}`,
    },
  };
}

function scanResult(findings: Finding[], overrides: Partial<ScanResult> = {}): ScanResult {
  const issues = buildIssues(findings, 3);
  return {
    target: 'https://shop.se',
    domain: 'shop.se',
    scanDate: '2026-08-31T10:00:00.000Z',
    durationMs: 12_000,
    pages: [
      { url: 'https://shop.se/', role: 'home', depth: 0, title: 'Shop', status: 200 },
      { url: 'https://shop.se/p', role: 'product', depth: 1, title: 'Product', status: 200 },
    ],
    issues,
    manualChecks: buildManualScript(issues, ['home', 'product']),
    positives: collectPositives(issues, ['home', 'product']),
    notTested: [],
    limits: { maxPages: 12, maxDepth: 2 },
    robotsRespected: true,
    ...overrides,
  };
}

describe('escaping primitives', () => {
  it('escapes every dangerous character including the solidus', () => {
    expect(escapeHtml(`<>&"'/`)).toBe('&lt;&gt;&amp;&quot;&#39;&#47;');
  });

  it('does not double-decode already-escaped input', () => {
    expect(escapeHtml('&lt;b&gt;')).toBe('&amp;lt;b&amp;gt;');
  });

  it('handles null and undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('truncates and collapses whitespace', () => {
    expect(truncate('a\n\n   b', 100)).toBe('a b');
    expect(truncate('x'.repeat(500), 10)).toBe(`${'x'.repeat(10)}… [truncated]`);
  });

  it('truncates before escaping so the cap applies to source length', () => {
    const out = snippet('<'.repeat(100), 10);
    expect(out.startsWith('&lt;'.repeat(10))).toBe(true);
  });

  it('refuses to render a non-http URL as a link', () => {
    expect(safeLink('javascript:alert(1)').safe).toBe(false);
    expect(safeLink('file:///etc/passwd').safe).toBe(false);
    expect(safeLink('https://shop.se/x').safe).toBe(true);
  });

  it('escapes the text of a URL it refuses', () => {
    expect(safeLink('javascript:alert("<x>")').text).not.toContain('<');
  });
});

describe('HTML report is not an XSS vector (T5)', () => {
  const html = renderHtmlReport(scanResult(HOSTILE.map(hostileFinding)));

  it('contains no script element at all', () => {
    expect(html).not.toMatch(/<script/i);
  });

  it('contains no injected iframe, object or embed', () => {
    expect(html).not.toMatch(/<iframe/i);
    expect(html).not.toMatch(/<object/i);
    expect(html).not.toMatch(/<embed/i);
  });

  it('neutralises every hostile payload', () => {
    for (const payload of HOSTILE) {
      expect(html).not.toContain(payload);
    }
  });

  // Note: the report legitimately CONTAINS the substrings "onerror=" and
  // "javascript:" as escaped visible text — showing the consultant the offending
  // markup is the point. String-matching for them would be a false alarm.
  // Whether any of it is executable is proved by parsing the document in a real
  // browser: see tests/report-dom.test.ts.

  it('still renders the surrounding report structure', () => {
    expect(html).toContain('Executive summary');
    expect(html).toContain('Priority findings');
    expect(html).toContain('Manual verification script');
    expect(html).toContain('Customer journey');
  });

  it('escapes a hostile page title in the document <title>', () => {
    const report = renderHtmlReport(scanResult([], { domain: '</title><script>alert(1)</script>' }));
    expect(report).not.toMatch(/<script/i);
  });

  it('escapes a hostile URL in the pages table', () => {
    const result = scanResult([]);
    result.pages.push({
      url: 'https://shop.se/"><script>alert(1)</script>',
      role: 'other',
      depth: 1,
      title: 'x',
      status: 200,
    });
    expect(renderHtmlReport(result)).not.toMatch(/<script/i);
  });
});

describe('HTML report content', () => {
  const result = scanResult([
    {
      ruleId: 'button-name',
      title: 'Buttons have no accessible name',
      source: 'axe',
      verification: 'automatic',
      wcag: ['4.1.2 Name, Role, Value (A)'],
      impact: 'Screen reader users cannot tell what the button does.',
      remediation: 'Add an accessible name.',
      instance: { url: 'https://shop.se/p', role: 'product', selector: '.add', snippet: '<button></button>' },
    },
  ]);
  const html = renderHtmlReport(result);

  it('carries the not-legal-advice disclaimer', () => {
    expect(html).toMatch(/not legal advice/i);
    expect(html).toMatch(/not a certification/i);
    expect(html).toMatch(/LPTT/);
  });

  it('distinguishes automatic from manual verification', () => {
    expect(html).toContain('Automatically verified');
    expect(html).toContain('Manual check required');
  });

  it('never states that a manual check passed', () => {
    expect(html).toMatch(/None of them has been performed/i);
    expect(html).not.toMatch(/manual check.{0,20}passed/i);
  });

  it('states what was not tested', () => {
    expect(html).toMatch(/behind a login/i);
    expect(html).toMatch(/no order was placed/i);
  });

  it('says automated testing is partial coverage', () => {
    expect(html).toMatch(/minority of WCAG/i);
  });

  it('is a complete standalone document', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });
});

describe('empty and degraded inputs', () => {
  it('renders a report with no issues without claiming the site is accessible', () => {
    const html = renderHtmlReport(scanResult([]));
    expect(html).toContain('No automated failures were detected');
    expect(html).toMatch(/does not mean the site is accessible/i);
  });

  it('renders when every page failed to load', () => {
    const result = scanResult([], {
      pages: [
        { url: 'https://shop.se/', role: 'home', depth: 0, title: '', status: null, error: 'Navigation failed: timeout' },
      ],
      notTested: ['https://shop.se/ — Navigation failed: timeout'],
    });
    const html = renderHtmlReport(result);
    expect(html).toContain('Navigation failed');
    expect(html).toContain('0 page');
  });

  it('handles a missing axe result set as zero findings, not a crash', () => {
    expect(() => renderHtmlReport(scanResult([]))).not.toThrow();
    expect(buildIssues([], 0)).toEqual([]);
  });

  it('handles an instance with an unavailable selector', () => {
    const html = renderHtmlReport(
      scanResult([
        {
          ruleId: 'image-alt',
          title: 'x',
          source: 'axe',
          verification: 'automatic',
          wcag: [],
          impact: 'i',
          remediation: 'r',
          instance: { url: 'https://shop.se/', role: 'home', selector: '(selector unavailable)', snippet: '' },
        },
      ])
    );
    expect(html).toContain('(selector unavailable)');
  });
});

describe('JSON report', () => {
  const json = buildJsonReport(scanResult(HOSTILE.map(hostileFinding)));

  it('is serialisable', () => {
    expect(() => JSON.stringify(json)).not.toThrow();
  });

  it('carries the disclaimer at the top level', () => {
    expect(String(json.disclaimer)).toMatch(/not legal advice/i);
  });

  it('reports counts that match the issues array', () => {
    const summary = json.summary as Record<string, unknown>;
    expect(summary.uniqueIssues).toBe((json.issues as unknown[]).length);
  });

  it('separates pages attempted from pages examined', () => {
    const summary = json.summary as Record<string, unknown>;
    expect(summary).toHaveProperty('pagesExamined');
    expect(summary).toHaveProperty('pagesAttempted');
  });

  it('includes the manual checks and the journey', () => {
    expect(Array.isArray(json.manualChecks)).toBe(true);
    expect(Array.isArray(json.customerJourney)).toBe(true);
  });

  it('does NOT escape values — JSON is data, escaping belongs at render time', () => {
    // Escaping here would corrupt the machine-readable output for consumers
    // that render it safely themselves.
    const serialised = JSON.stringify(json);
    expect(serialised).toContain('DROP TABLE');
  });
});

describe('developer handoff', () => {
  const tasks = buildHandoff(
    scanResult([
      {
        ruleId: 'label',
        title: 'Form fields have no label',
        source: 'axe',
        verification: 'automatic',
        wcag: ['3.3.2 Labels or Instructions (A)'],
        impact: 'i',
        remediation: 'r',
        instance: { url: 'https://shop.se/checkout', role: 'checkout-entry', selector: '#email', snippet: '<input>' },
      },
    ])
  );

  it('creates one task per issue, not per occurrence', () => {
    expect(tasks).toHaveLength(1);
  });

  it('maps severity to a tracker priority and effort to an estimate', () => {
    expect(tasks[0]!.priority).toBe('P0');
    expect(tasks[0]!.estimate).toBe('≤ 2h');
  });

  it('states a done-when that is not just "the scanner passes"', () => {
    expect(tasks[0]!.body).toMatch(/keyboard and a screen reader/);
    expect(tasks[0]!.body).toMatch(/not only by re-running the scanner/);
  });

  it('renders markdown without throwing on empty input', () => {
    expect(() => handoffToMarkdown([])).not.toThrow();
    expect(handoffToMarkdown(tasks)).toContain('A11Y-001');
  });
});
