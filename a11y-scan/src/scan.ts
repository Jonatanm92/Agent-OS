/**
 * The scan orchestrator: guard → discover → audit → analyse.
 *
 * Every limit is enforced here rather than trusted to the caller, so a scan
 * cannot be talked into crawling further by a bad argument.
 */
import type { DiscoveredPage, Finding, ScanResult } from './types.js';
import { SCAN_LIMITS, type Limits } from './config.js';
import { checkUrl, normalizeUrl, type GuardOptions } from './security/url-guard.js';
import { fetchRobots, PERMISSIVE, type Robots } from './crawl/robots.js';
import { Frontier } from './crawl/discover.js';
import { openSession } from './audit/browser.js';
import { auditPage } from './audit/page-audit.js';
import { buildIssues } from './analyze/normalize.js';
import { buildManualScript } from './analyze/manual-script.js';
import { collectPositives } from './analyze/journey.js';

export interface ScanOptions extends GuardOptions {
  /**
   * Test/CLI escape hatch. When true, the exemption is granted to the TARGET
   * HOST ONLY — never to wherever it redirects.
   */
  allowPrivateTargets?: boolean;
  limits?: Limits;
  /** Prescan skips the slower viewport passes and uses tighter limits. */
  quick?: boolean;
  /** Set false only in tests that do not want a network round trip for robots.txt. */
  useRobots?: boolean;
  onProgress?: (message: string) => void;
}

export class ScanError extends Error {
  constructor(message: string, readonly reason: string) {
    super(message);
    this.name = 'ScanError';
  }
}

export async function runScan(target: string, options: ScanOptions = {}): Promise<ScanResult> {
  const limits = options.limits ?? SCAN_LIMITS;
  const report = options.onProgress ?? (() => {});
  const startedAt = Date.now();

  // The exemption is scoped to the host actually named in the target, so a
  // redirect to any other private address is still refused (THREAT-MODEL.md T1).
  let exemptHost: string[] = [];
  if (options.allowPrivateTargets === true) {
    try {
      exemptHost = [new URL(target).hostname];
    } catch {
      exemptHost = [];
    }
  }
  const guard: GuardOptions = {
    allowPrivateHosts: options.allowPrivateHosts ?? exemptHost,
  };

  const verdict = await checkUrl(target, guard);
  if (!verdict.allowed || !verdict.url) {
    throw new ScanError(verdict.detail, verdict.reason);
  }

  const startUrl = normalizeUrl(verdict.url.toString());
  if (!startUrl) throw new ScanError('Could not normalize the target URL.', 'unparseable');

  let robots: Robots = PERMISSIVE;
  if (options.useRobots !== false) {
    robots = await fetchRobots(verdict.url.origin);
    report(robots.absent ? 'No robots.txt found — nothing restricted.' : 'robots.txt loaded and will be respected.');
  }

  // A site asking for a longer delay than ours gets it.
  const delayMs = Math.max(limits.requestDelayMs, robots.crawlDelayMs ?? 0);

  const frontier = new Frontier({ limits, robots, startUrl, guard });
  frontier.add(startUrl, 0);

  const session = await openSession(limits, guard);
  const pages: DiscoveredPage[] = [];
  const findings: Finding[] = [];
  const notTested: string[] = [];

  try {
    const page = await session.context.newPage();

    while (pages.length < limits.maxPages) {
      if (Date.now() - startedAt > limits.runBudgetMs) {
        notTested.push(
          `The scan stopped at the ${Math.round(limits.runBudgetMs / 1000)}s time budget after ${pages.length} pages. Remaining pages were not examined.`
        );
        break;
      }

      const entry = frontier.next();
      if (!entry) break;

      report(`Auditing ${entry.url}`);
      const result = await auditPage(page, entry.url, {
        limits,
        startUrl,
        depth: entry.depth,
        quick: options.quick,
        guard,
      });

      pages.push(result.page);
      findings.push(...result.findings);
      if (!result.page.error) frontier.markRoleFilled(result.page.role);
      if (result.page.error) notTested.push(`${result.page.url} — ${result.page.error}`);

      for (const link of result.links) {
        frontier.add(link, entry.depth + 1);
      }

      // Politeness: a fixed gap between navigations, honoured even on the last page.
      if (delayMs > 0) await page.waitForTimeout(delayMs);
    }

    await page.close().catch(() => {});
  } finally {
    await session.close();
  }

  for (const skipped of frontier.skipped.slice(0, 20)) {
    notTested.push(`${skipped.url} — ${skipped.reason}`);
  }
  if (session.blockedRequests.length > 0) {
    notTested.push(
      `${session.blockedRequests.length} request(s) were blocked by the safety guard and not loaded.`
    );
  }

  const testedPages = pages.filter((p) => !p.error);
  const issues = buildIssues(findings, testedPages.length);
  const rolesExamined = [...new Set(testedPages.map((p) => p.role))];

  return {
    target,
    domain: verdict.url.hostname,
    scanDate: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    pages,
    issues,
    manualChecks: options.quick ? [] : buildManualScript(issues, rolesExamined),
    positives: collectPositives(issues, rolesExamined),
    notTested,
    limits: { maxPages: limits.maxPages, maxDepth: limits.maxDepth },
    robotsRespected: options.useRobots !== false,
  };
}
