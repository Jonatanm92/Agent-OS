import type { Finding, RetestOutcome, RetestResult, Scan } from '../core/Types.js';
import { severityRank } from '../findings/Severity.js';
import type { Platform } from './Platform.js';
import { ScanService } from './ScanService.js';

export interface RetestSummary {
  scan: Scan;
  baselineScanId: string;
  results: RetestResult[];
  counts: Record<RetestOutcome, number>;
}

/**
 * SYSTEM 10 — retest after remediation.
 *
 * The comparison runs on finding signatures (rule + component-shaped selector),
 * which is what makes "the same problem" survive a redeploy that changed class
 * names or page URLs.
 */
export class RetestService {
  constructor(private readonly platform: Platform) {}

  async retest(prospectId: string, options: { baselineScanId?: string } = {}): Promise<RetestSummary> {
    const { store, audits } = this.platform;
    const prospect = store.getProspect(prospectId);
    if (!prospect) throw new Error(`Unknown prospect: ${prospectId}`);

    const baseline = options.baselineScanId ? audits.getScan(options.baselineScanId) : audits.latestCompletedScan(prospectId);
    if (!baseline) throw new Error('No baseline scan to retest against.');

    const outcome = await new ScanService(this.platform).scanDomain(prospect.domain, { kind: 'retest', baselineScanId: baseline.id });
    const results = this.compare(prospectId, baseline, outcome.scan);

    const counts = tally(results);
    store.addTimelineEvent(
      prospectId,
      'retest_completed',
      `Retest: ${counts.FIXED} fixed, ${counts.PARTIALLY_FIXED} partially fixed, ${counts.OPEN} still open, ${counts.REGRESSED} regressed`,
      { baselineScanId: baseline.id, retestScanId: outcome.scan.id, counts },
    );
    if (counts.REGRESSED > 0) {
      store.addTimelineEvent(prospectId, 'regression_detected', `${counts.REGRESSED} previously fixed finding(s) came back`, {
        retestScanId: outcome.scan.id,
      });
    }

    return { scan: outcome.scan, baselineScanId: baseline.id, results, counts };
  }

  /** Compare two completed scans and record an outcome per baseline finding. */
  compare(prospectId: string, baseline: Scan, retestScan: Scan): RetestResult[] {
    const { audits } = this.platform;
    const baselineFindings = audits.listFindings(baseline.id);
    const retestFindings = audits.listFindings(retestScan.id);

    const retestBySignature = new Map<string, Finding[]>();
    for (const finding of retestFindings) {
      retestBySignature.set(finding.signature, [...(retestBySignature.get(finding.signature) ?? []), finding]);
    }
    const reachedUrls = new Set(retestScan.journey.filter((s) => s.reached && s.url).map((s) => normalizeUrl(s.url!)));
    const previouslyFixed = new Set(
      audits
        .listRetests(prospectId)
        .filter((r) => r.outcome === 'FIXED')
        .map((r) => audits.getFinding(r.baselineFindingId)?.signature)
        .filter((s): s is string => Boolean(s)),
    );

    const results: RetestResult[] = [];
    const seenSignatures = new Set<string>();

    for (const baselineFinding of baselineFindings) {
      if (seenSignatures.has(baselineFinding.signature)) continue;
      seenSignatures.add(baselineFinding.signature);

      const matches = retestBySignature.get(baselineFinding.signature) ?? [];
      const sameUrlTested = reachedUrls.has(normalizeUrl(baselineFinding.url));
      const baselineUrls = new Set(baselineFindings.filter((f) => f.signature === baselineFinding.signature).map((f) => normalizeUrl(f.url)));

      let outcome: RetestOutcome;
      let detail: string;

      if (matches.length === 0) {
        if (!sameUrlTested) {
          outcome = 'UNABLE_TO_VERIFY';
          detail = `The page ${baselineFinding.url} could not be tested in the retest, so the fix cannot be confirmed.`;
        } else {
          outcome = 'FIXED';
          detail = `The finding no longer occurs on ${baselineFinding.url}.`;
        }
      } else {
        const matchedUrls = new Set(matches.map((m) => normalizeUrl(m.url)));
        const worstNow = matches.reduce((worst, m) => (severityRank(m.severity) > severityRank(worst.severity) ? m : worst), matches[0]);
        if (matchedUrls.size < baselineUrls.size) {
          outcome = 'PARTIALLY_FIXED';
          detail = `Fixed on ${baselineUrls.size - matchedUrls.size} of ${baselineUrls.size} affected pages; still present on ${[...matchedUrls].join(', ')}.`;
        } else if (severityRank(worstNow.severity) < severityRank(baselineFinding.severity)) {
          outcome = 'PARTIALLY_FIXED';
          detail = `Still present but reduced from ${baselineFinding.severity} to ${worstNow.severity}.`;
        } else if (previouslyFixed.has(baselineFinding.signature)) {
          outcome = 'REGRESSED';
          detail = `This finding was confirmed fixed in an earlier retest and has come back on ${worstNow.url}.`;
        } else {
          outcome = 'OPEN';
          detail = `Unchanged: still reproducible on ${worstNow.url}.`;
        }
      }

      results.push(
        audits.recordRetest({
          prospectId,
          baselineFindingId: baselineFinding.id,
          retestScanId: retestScan.id,
          outcome,
          beforeEvidenceKey: baselineFinding.screenshotKey,
          afterEvidenceKey: matches[0]?.screenshotKey ?? null,
          detail,
        }),
      );
    }

    // Signatures that only exist in the retest are regressions when the site
    // previously had them fixed, and new findings otherwise.
    for (const [signature, matches] of retestBySignature) {
      if (seenSignatures.has(signature)) continue;
      if (!previouslyFixed.has(signature)) continue;
      const finding = matches[0];
      results.push(
        audits.recordRetest({
          prospectId,
          baselineFindingId: finding.id,
          retestScanId: retestScan.id,
          outcome: 'REGRESSED',
          beforeEvidenceKey: null,
          afterEvidenceKey: finding.screenshotKey,
          detail: `Previously fixed finding reappeared on ${finding.url}.`,
        }),
      );
    }

    return results;
  }
}

function tally(results: RetestResult[]): Record<RetestOutcome, number> {
  const counts: Record<RetestOutcome, number> = { OPEN: 0, PARTIALLY_FIXED: 0, FIXED: 0, REGRESSED: 0, UNABLE_TO_VERIFY: 0 };
  for (const result of results) counts[result.outcome] += 1;
  return counts;
}

function normalizeUrl(url: string): string {
  return url.split('#')[0].replace(/\/$/, '');
}
