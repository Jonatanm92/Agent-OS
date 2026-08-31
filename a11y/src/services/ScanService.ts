import type { Page } from 'playwright';
import { toOrigin } from '../core/Ids.js';
import type { ConsentDecision, Finding, FindingGroup, JourneyStep, Prospect, Scan } from '../core/Types.js';
import { BrowserSession, settle } from '../discovery/Browser.js';
import { discoverJourney } from '../discovery/JourneyDiscovery.js';
import type { SiteSignals } from '../discovery/PlatformDetect.js';
import { auditPage, removeSupersededIssues } from '../audit/AuditEngine.js';
import { normalizeIssue } from '../findings/Normalize.js';
import { groupFindings } from '../findings/Dedupe.js';
import { severityRank } from '../findings/Severity.js';
import { captureEvidence } from '../evidence/Screenshot.js';
import { scoreProspect, type ScoringResult } from '../scoring/IcpScoring.js';
import type { Platform } from './Platform.js';

/** Matches `ReflowProbe`: the viewport a reflow finding is observed and shown at. */
const NARROW_VIEWPORT = { width: 360, height: 800 };

export interface ScanOptions {
  kind?: Scan['kind'];
  baselineScanId?: string | null;
  /** Screenshot budget per page. Evidence is expensive; strong findings first. */
  screenshotsPerPage?: number;
}

export interface ScanOutcome {
  prospect: Prospect;
  scan: Scan;
  findings: Finding[];
  groups: FindingGroup[];
  journey: JourneyStep[];
  signals: SiteSignals | null;
  consent: ConsentDecision | null;
  scoring: ScoringResult | null;
  failedProbes: { probe: string; error: string }[];
}

/**
 * VERTICAL SLICE 1 — domain in, evidence out.
 *
 * One domain becomes: a discovered buying journey, an audit of each journey
 * page, normalized findings with screenshots, systemic grouping, a qualification
 * decision and a prospect record with a clear next action.
 */
export class ScanService {
  constructor(private readonly platform: Platform) {}

  async scanDomain(domain: string, options: ScanOptions = {}): Promise<ScanOutcome> {
    const { store, audits, config, logger, storage, icp } = this.platform;
    const prospect = store.upsertProspect({ domain });
    const origin = toOrigin(domain);
    const scan = audits.createScan(prospect.id, options.kind ?? 'initial', options.baselineScanId ?? null);
    store.setProspectFacts(prospect.id, { scanStatus: 'scanning' });
    store.addTimelineEvent(prospect.id, 'scan_started', `${options.kind ?? 'initial'} scan started for ${origin}`, { scanId: scan.id, origin });

    const session = new BrowserSession(config);
    const findings: Finding[] = [];
    const failedProbes: { probe: string; error: string }[] = [];
    let signals: SiteSignals | null = null;
    let journey: JourneyStep[] = [];
    let robots = null as Scan['robots'];
    let consent = null as ConsentDecision | null;
    let pagesTested = 0;

    try {
      await session.start();
      const context = await session.newContext();

      const result = await discoverJourney({
        session,
        context,
        origin,
        config,
        logger: logger.child('discovery'),
        onPage: async ({ page, pageType, url }) => {
          const audit = await auditPage(page, logger.child('audit'));
          failedProbes.push(...audit.failedProbes);
          const issues = removeSupersededIssues(audit.issues);
          const pageFindings = issues.map((issue) => normalizeIssue(issue, { scanId: scan.id, prospectId: prospect.id, url, pageType }));
          await this.attachEvidence(page, pageFindings, scan.id, options.screenshotsPerPage ?? 6);
          findings.push(...pageFindings);
          pagesTested += 1;
          logger.info('page audited', { pageType, url, findings: pageFindings.length });
        },
      });

      journey = result.steps;
      signals = result.signals;
      robots = result.robots;
      consent = result.consent;
      await context.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('scan failed', { domain, error: message });
      audits.finishScan(scan.id, { status: 'failed', error: message, journey, robots, consent, pagesTested });
      store.setProspectFacts(prospect.id, { scanStatus: 'failed' });
      store.addTimelineEvent(prospect.id, 'scan_failed', `Scan failed: ${message}`, { scanId: scan.id });
      return { prospect: store.getProspect(prospect.id)!, scan: audits.getScan(scan.id)!, findings: [], groups: [], journey, signals, consent, scoring: null, failedProbes };
    } finally {
      await session.close();
    }

    const homepageReached = journey.find((s) => s.pageType === 'homepage')?.reached ?? false;
    const grouped = groupFindings(findings);
    audits.insertFindings(grouped.findings);
    audits.insertGroups(grouped.groups);

    const scoring = scoreProspect(
      { domain: prospect.domain, signals, journey, findings: grouped.findings, groups: grouped.groups, reachable: homepageReached },
      icp,
    );

    const status = homepageReached ? 'completed' : robots && !robots.allowed ? 'blocked' : 'failed';
    audits.finishScan(scan.id, {
      status,
      journey,
      robots,
      consent,
      pagesTested,
      error: homepageReached ? null : (journey.find((s) => s.pageType === 'homepage')?.reason ?? 'homepage could not be loaded'),
    });

    this.applyScanFacts(prospect.id, origin, signals, scoring, homepageReached, robots);
    store.addTimelineEvent(prospect.id, 'scan_completed', `Scan ${status}: ${pagesTested} page(s) tested, ${grouped.findings.length} finding(s)`, {
      scanId: scan.id,
      pagesTested,
      findings: grouped.findings.length,
      groups: grouped.groups.length,
    });
    store.addTimelineEvent(prospect.id, 'findings_normalized', scoring.issueSummary, {
      scanId: scan.id,
      evidenceScore: scoring.evidenceScore,
      leadScore: scoring.leadScore,
    });
    this.platform.store.recordDeliveryCost({ prospectId: prospect.id, scanId: scan.id, computeCostSek: estimateComputeCost(pagesTested) });

    return {
      prospect: store.getProspect(prospect.id)!,
      scan: audits.getScan(scan.id)!,
      findings: grouped.findings,
      groups: grouped.groups,
      journey,
      signals,
      consent,
      scoring,
      failedProbes,
    };
  }

  /**
   * Screenshots go to the findings most likely to end up in front of a
   * customer. A reflow finding is captured at the narrow viewport that produced
   * it — a desktop screenshot of a reflow problem shows nothing.
   */
  private async attachEvidence(page: Page, findings: Finding[], scanId: string, budget: number): Promise<void> {
    const worthy = [...findings]
      .filter((f) => f.confidence === 'CONFIRMED_AUTOMATED' || f.confidence === 'HIGH_CONFIDENCE')
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
      .slice(0, budget);

    if (worthy.length === 0) return;

    // The interaction probes leave panels open and focus moved. Evidence must
    // show the page as a customer meets it, so reload before capturing.
    await new Promise((resolve) => setTimeout(resolve, this.platform.config.perHostDelayMs));
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await settle(page, 500);

    const desktopViewport = page.viewportSize();
    let narrow = false;
    for (const finding of worthy) {
      const needsNarrow = finding.rule.startsWith('reflow.');
      if (needsNarrow !== narrow) {
        const width = Number((finding.raw as { viewport?: number })?.viewport) || NARROW_VIEWPORT.width;
        const target = needsNarrow ? { width, height: NARROW_VIEWPORT.height } : desktopViewport;
        if (target) {
          await page.setViewportSize(target).catch(() => undefined);
          await page.waitForTimeout(250);
        }
        narrow = needsNarrow;
      }
      const key = `screenshots/${scanId}/${finding.id}.png`;
      finding.screenshotKey = await captureEvidence(page, finding.selector, this.platform.storage, key);
    }
    if (narrow && desktopViewport) await page.setViewportSize(desktopViewport).catch(() => undefined);
  }

  private applyScanFacts(
    prospectId: string,
    origin: string,
    signals: SiteSignals | null,
    scoring: ScoringResult,
    reachable: boolean,
    robots: Scan['robots'],
  ): void {
    const { store } = this.platform;
    const provenance = { source: origin, method: 'homepage_dom_analysis', confidence: 'observed' as const };

    if (signals) {
      store.setProspectFacts(
        prospectId,
        {
          companyName: signals.companyName ?? undefined,
          ecommerceDetected: signals.ecommerceDetected,
          ecommercePlatform: signals.platform,
          cms: signals.cms,
          contactChannels: signals.contactChannels.length ? signals.contactChannels : undefined,
          agencyAttribution: signals.agencyAttribution ?? undefined,
        },
        provenance,
      );
      if (signals.companyNameSource && signals.companyName) {
        store.recordProvenance({
          entityType: 'prospect',
          entityId: prospectId,
          field: 'company_name',
          value: signals.companyName,
          source: origin,
          method: signals.companyNameSource,
          confidence: 'observed',
        });
      }
    }

    store.setProspectFacts(prospectId, {
      scanStatus: reachable ? 'scanned' : robots && !robots.allowed ? 'blocked' : 'unreachable',
      qualificationStatus: scoring.qualification,
      leadScore: scoring.leadScore,
      evidenceScore: scoring.evidenceScore,
      issueSummary: scoring.issueSummary,
    });

    const nextAction = decideNextAction(scoring);
    if (!reachable) store.setStage(prospectId, 'DISCOVERED', 'Site could not be tested — verify manually or drop.');
    else if (scoring.qualification === 'qualified') store.setStage(prospectId, 'QUALIFIED', nextAction);
    else store.setStage(prospectId, 'SCANNED', nextAction);
  }
}

function decideNextAction(scoring: ScoringResult): string {
  if (scoring.qualification === 'disqualified') {
    const reason = scoring.applied.filter((s) => s.points <= -25).map((s) => s.label)[0] ?? 'outside ICP';
    return `Do not work this prospect: ${reason}.`;
  }
  if (scoring.qualification === 'qualified') return 'Generate the mini audit and send it to review.';
  return `Lead score ${scoring.leadScore} is below the qualification threshold — re-check only if the ICP changes.`;
}

/**
 * Rough per-scan compute cost so SYSTEM 16 can report cost per audit. Based on
 * browser-minutes rather than tokens: no model calls are made during a scan.
 */
function estimateComputeCost(pagesTested: number): number {
  const perPageSek = 0.12;
  return Number((pagesTested * perPageSek).toFixed(3));
}
