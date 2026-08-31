/**
 * Per-page orchestration: navigate, classify, run every engine, come back with
 * findings plus a record of what happened.
 *
 * A page that fails to load is not dropped. It becomes a DiscoveredPage with an
 * error, so the report can say "this page was not tested" instead of quietly
 * implying coverage it does not have.
 */
import type { Page } from 'playwright';
import type { DiscoveredPage, Finding, PageRole } from '../types.js';
import type { Limits } from '../config.js';
import type { GuardOptions } from '../security/url-guard.js';
import type { EngineContext } from './engines.js';
import { axeEngine } from './axe-engine.js';
import { runDomChecks } from './checks/dom-checks.js';
import { checkFocusVisibility, checkReflow, checkZoom, withMobileViewport } from './checks/viewport-checks.js';
import { classifyByDom, classifyByUrl, extractLinks } from '../crawl/discover.js';
import { attachScreenshots } from './screenshot.js';

export interface PageAuditResult {
  page: DiscoveredPage;
  findings: Finding[];
  links: string[];
}

export interface AuditOptions {
  limits: Limits;
  startUrl: string;
  depth: number;
  /** Prescan skips the slower viewport passes. */
  quick?: boolean;
  /** Applied to discovered links so queueing and navigation agree. */
  guard?: GuardOptions;
}

export async function auditPage(page: Page, url: string, options: AuditOptions): Promise<PageAuditResult> {
  const { limits, startUrl, depth } = options;

  let status: number | null = null;
  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: limits.navigationTimeoutMs,
    });
    status = response?.status() ?? null;
  } catch (error) {
    return {
      page: {
        url,
        role: classifyByUrl(url, startUrl),
        depth,
        title: '',
        status: null,
        error: `Navigation failed: ${error instanceof Error ? error.message.split('\n')[0] : 'unknown error'}`,
      },
      findings: [],
      links: [],
    };
  }

  // A page behind auth is recorded, never guessed at and never bypassed.
  if (status !== null && (status === 401 || status === 403)) {
    return {
      page: {
        url,
        role: classifyByUrl(url, startUrl),
        depth,
        title: '',
        status,
        error: 'Not tested: the page requires authentication.',
      },
      findings: [],
      links: [],
    };
  }

  if (status !== null && status >= 400) {
    return {
      page: {
        url,
        role: classifyByUrl(url, startUrl),
        depth,
        title: '',
        status,
        error: `Not tested: the server returned HTTP ${status}.`,
      },
      findings: [],
      links: [],
    };
  }

  // Give client-rendered shops a moment to paint, but never block on network
  // idle — analytics beacons and chat widgets keep many shops permanently busy.
  await page.waitForTimeout(options.quick ? 300 : 700);

  let title = '';
  try {
    title = (await page.title()).slice(0, 300);
  } catch {
    title = '';
  }

  const urlGuess = classifyByUrl(url, startUrl);
  const role: PageRole = await classifyByDom(page, urlGuess);

  const context: EngineContext = { url, role, maxSnippetChars: limits.maxSnippetChars };

  const findings: Finding[] = [];

  // Each engine is isolated: one throwing must not lose the others' results.
  const settled = await Promise.allSettled([
    axeEngine.run(page, context),
    runDomChecks(page, context),
    checkZoom(page, context),
  ]);
  for (const result of settled) {
    if (result.status === 'fulfilled') findings.push(...result.value);
  }

  if (!options.quick) {
    // Sequential: these mutate the viewport and focus, so they cannot overlap.
    const focus = await checkFocusVisibility(page, context).catch(() => []);
    findings.push(...focus);

    const reflow = await checkReflow(page, context).catch(() => []);
    findings.push(...reflow);

    // Touch targets are only meaningful at a phone viewport.
    const touch = await withMobileViewport(page, () => runDomChecks(page, context)).catch(() => []);
    findings.push(...touch.filter((f) => f.ruleId === 'check:touch-target-size'));
  }

  // Evidence capture is best-effort and must never cost a finding: any failure
  // inside leaves the findings untouched.
  await attachScreenshots(page, findings, limits).catch(() => 0);

  const links = await extractLinks(page, url, options.guard ?? {});

  return {
    page: { url, role, depth, title, status },
    findings,
    links,
  };
}
