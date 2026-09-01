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
import { resolveRedirects } from '../security/redirect-guard.js';
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

  // Validate the whole redirect chain in Node before the browser touches it.
  // Playwright's route handler does not see internal redirect hops, so without
  // this a 302 to an internal address would be fetched (THREAT-MODEL.md T1).
  const redirect = await resolveRedirects(url, {
    ...(options.guard ?? {}),
    maxResponseBytes: limits.maxResponseBytes,
    // A quarter of the navigation budget: generous for a HEAD, and bounded so
    // twelve slow preflights cannot eat the whole run budget before any page is
    // actually examined.
    timeoutMs: Math.max(3000, Math.round(limits.navigationTimeoutMs / 4)),
  });
  if (!redirect.allowed) {
    return {
      page: {
        url,
        role: classifyByUrl(url, startUrl),
        depth,
        title: '',
        status: null,
        error: `Not tested: ${redirect.reason}`,
      },
      findings: [],
      links: [],
    };
  }
  const target = redirect.finalUrl ?? url;

  let status: number | null = null;
  try {
    const response = await page.goto(target, {
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

  const urlGuess = classifyByUrl(target, startUrl);
  const role: PageRole = await classifyByDom(page, urlGuess);

  // Header-independent backstop: a chunked response defeats the content-length
  // cap, but the DOM is measurable once it exists. Running axe over hundreds of
  // thousands of nodes is where a pathological page actually costs us.
  // getElementsByTagName returns a LIVE collection, so reading .length does not
  // materialise an array of every node — which matters precisely on the page
  // this guard exists for.
  const nodeCount = await page
    .evaluate(() => document.getElementsByTagName('*').length)
    .catch(() => 0);
  if (nodeCount > limits.maxDomNodes) {
    return {
      page: {
        url: target,
        role,
        depth,
        title,
        status,
        error: `Not fully tested: the page contains ${nodeCount.toLocaleString('en')} elements, above the ${limits.maxDomNodes.toLocaleString('en')} limit for a single page.`,
      },
      findings: [],
      links: await extractLinks(page, target, options.guard ?? {}),
    };
  }

  const context: EngineContext = { url: target, role, maxSnippetChars: limits.maxSnippetChars };

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

  const links = await extractLinks(page, target, options.guard ?? {});

  return {
    // The terminal URL is what was actually examined; recording the pre-redirect
    // one would put a URL in the report that nobody tested.
    page: { url: target, role, depth, title, status },
    findings,
    links,
  };
}
