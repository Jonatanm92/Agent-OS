/**
 * Proves the generated report is inert by parsing it in a real browser.
 *
 * String-matching cannot decide this: the report deliberately DISPLAYS hostile
 * markup as escaped text, so `onerror=` and `javascript:` legitimately appear
 * in the source. What matters is whether the parser turns any of it into
 * executable markup — which only a parser can answer.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { startFixtureServer, type FixtureServer } from '../fixtures/serve.js';
import { runScan } from '../src/scan.js';
import { SCAN_LIMITS } from '../src/config.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Finding, ScanResult } from '../src/types.js';
import { buildIssues } from '../src/analyze/normalize.js';
import { buildManualScript } from '../src/analyze/manual-script.js';
import { renderHtmlReport } from '../src/report/html-report.js';
import { resolveChromiumPath } from '../src/audit/browser.js';

const HOSTILE = [
  '</script><script>window.__pwned = 1;</script>',
  '"><img src=x onerror="window.__pwned=2">',
  '</title><script>window.__pwned=3</script>',
  '<iframe src="javascript:window.__pwned=4"></iframe>',
  '<a href="javascript:window.__pwned=5">click</a>',
  "javascript:window.__pwned=6",
  '<svg onload="window.__pwned=7">',
  '<style>@import "evil.css";</style>',
];

function hostileFinding(payload: string, index: number): Finding {
  return {
    ruleId: 'image-alt',
    title: `Title ${payload}`,
    source: 'axe',
    verification: 'automatic',
    wcag: [`1.1.1 ${payload}`],
    impact: `Impact ${payload}`,
    remediation: `Remediation ${payload}`,
    verify: 'reproduce it',
    instance: {
      url: `https://shop.se/p${index}`,
      role: 'product',
      selector: `.card${payload}`,
      snippet: `<img alt="${payload}">`,
      detail: `Detail ${payload}`,
    },
  };
}

let browser: Browser;
let tempDir: string;
let reportPath: string;

beforeAll(async () => {
  const findings = HOSTILE.map(hostileFinding);
  const issues = buildIssues(findings, 3);

  const result: ScanResult = {
    // Hostile strings in every field a target can influence, not only findings.
    target: 'https://shop.se',
    domain: '</title><script>window.__pwned=8</script>',
    scanDate: '2026-08-31T10:00:00.000Z',
    durationMs: 1000,
    pages: [
      { url: 'https://shop.se/', role: 'home', depth: 0, title: HOSTILE[0]!, status: 200 },
      {
        url: 'https://shop.se/"><script>window.__pwned=9</script>',
        role: 'product',
        depth: 1,
        title: HOSTILE[1]!,
        status: 200,
      },
      {
        url: 'javascript:window.__pwned=10',
        role: 'other',
        depth: 1,
        title: 'x',
        status: null,
        error: HOSTILE[2]!,
      },
    ],
    issues,
    manualChecks: buildManualScript(issues, ['home', 'product']),
    positives: [HOSTILE[3]!],
    notTested: [HOSTILE[4]!],
    limits: { maxPages: 12, maxDepth: 2 },
    robotsRespected: true,
  };

  tempDir = mkdtempSync(join(tmpdir(), 'a11y-report-'));
  reportPath = join(tempDir, 'report.html');
  writeFileSync(reportPath, renderHtmlReport(result), 'utf8');

  const executablePath = resolveChromiumPath();
  browser = await chromium.launch(executablePath ? { executablePath } : {});
});

afterAll(async () => {
  await browser?.close();
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

describe('the generated report is inert when opened (T5)', () => {
  it('executes no injected script', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });

    // file:// is the realistic case — a consultant double-clicks the report.
    await page.goto(`file://${reportPath}`, { waitUntil: 'load' });
    await page.waitForTimeout(400);

    const forensics = await page.evaluate(() => {
      const pwned = Object.keys(globalThis).filter((key) => key.startsWith('__pwned'));
      const scripts = document.querySelectorAll('script').length;
      const iframes = document.querySelectorAll('iframe, object, embed').length;

      const eventAttributes: string[] = [];
      const jsUrls: string[] = [];
      for (const el of Array.from(document.querySelectorAll('*'))) {
        for (const attr of Array.from(el.attributes)) {
          if (/^on/i.test(attr.name)) eventAttributes.push(`${el.tagName}[${attr.name}]`);
          if (/^\s*javascript:/i.test(attr.value) && /^(href|src|action)$/i.test(attr.name)) {
            jsUrls.push(`${el.tagName}[${attr.name}]`);
          }
        }
      }

      return {
        pwned,
        scripts,
        iframes,
        eventAttributes,
        jsUrls,
        // If escaping failed, the injected <style> would have hidden the body.
        bodyVisible: getComputedStyle(document.body).display !== 'none',
        title: document.title,
      };
    });

    await context.close();

    expect(dialogs).toEqual([]);
    expect(forensics.pwned).toEqual([]);
    expect(forensics.scripts).toBe(0);
    expect(forensics.iframes).toBe(0);
    expect(forensics.eventAttributes).toEqual([]);
    expect(forensics.jsUrls).toEqual([]);
    expect(forensics.bodyVisible).toBe(true);
  });

  it('renders hostile strings as visible text, not markup', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`file://${reportPath}`, { waitUntil: 'load' });

    // The consultant should be able to READ the offending markup — that is the
    // evidence they are paying for. It must appear as text content.
    const bodyText = await page.evaluate(() => document.body.textContent ?? '');
    expect(bodyText).toContain('<img alt=');
    expect(bodyText).toContain('script');

    // And the document must still be a usable report.
    const structure = await page.evaluate(() => ({
      headings: Array.from(document.querySelectorAll('h2')).map((h) => h.textContent?.trim() ?? ''),
      details: document.querySelectorAll('details').length,
    }));
    expect(structure.headings).toContain('Executive summary');
    expect(structure.headings).toContain('Priority findings');
    expect(structure.details).toBeGreaterThan(0);

    await context.close();
  });

  it('keeps a hostile domain out of the document title as markup', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`file://${reportPath}`, { waitUntil: 'load' });
    const title = await page.title();
    // The payload is present as text but did not terminate the title element.
    expect(title).toContain('script');
    expect(await page.evaluate(() => document.querySelectorAll('script').length)).toBe(0);
    await context.close();
  });
});


/**
 * The end-to-end version: hostile markup is not injected into a fixture object,
 * it is served by a page the scanner really visits. This exercises axe's snippet
 * capture, the custom checks, grouping and rendering in one pass — the whole
 * path an attacker actually controls.
 */
describe('hostile content survives a real scan without becoming executable', () => {
  let server: FixtureServer;

  beforeAll(async () => {
    server = await startFixtureServer();
  });

  afterAll(async () => {
    await server?.close();
  });

  it('renders an inert report from a page built to break the generator', async () => {
    const scan = await runScan(`${server.origin}/hostile.html`, {
      allowPrivateTargets: true,
      limits: { ...SCAN_LIMITS, maxPages: 1, requestDelayMs: 0 },
      useRobots: false,
    });

    // The page really is defective, so there is something to report.
    expect(scan.issues.length).toBeGreaterThan(0);

    const reportFile = join(tempDir, 'scanned-report.html');
    writeFileSync(reportFile, renderHtmlReport(scan), 'utf8');

    const context = await browser.newContext();
    const page = await context.newPage();
    const dialogs: string[] = [];
    page.on('dialog', async (d) => {
      dialogs.push(d.message());
      await d.dismiss();
    });

    await page.goto(`file://${reportFile}`, { waitUntil: 'load' });
    await page.waitForTimeout(400);

    const forensics = await page.evaluate(() => {
      const events: string[] = [];
      for (const el of Array.from(document.querySelectorAll('*'))) {
        for (const attr of Array.from(el.attributes)) {
          if (/^on/i.test(attr.name)) events.push(`${el.tagName}[${attr.name}]`);
        }
      }
      return {
        scripts: document.querySelectorAll('script').length,
        events,
        pwned: Object.keys(globalThis).filter((k) => k.startsWith('__pwned')),
        bodyVisible: getComputedStyle(document.body).display !== 'none',
      };
    });

    await context.close();

    expect(dialogs).toEqual([]);
    expect(forensics.scripts).toBe(0);
    expect(forensics.events).toEqual([]);
    expect(forensics.pwned).toEqual([]);
    expect(forensics.bodyVisible).toBe(true);
  }, 90_000);
});
