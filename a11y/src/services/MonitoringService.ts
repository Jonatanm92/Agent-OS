import type { Finding, Scan, Severity, Site } from '../core/Types.js';
import { severityRank } from '../findings/Severity.js';
import { ruleTitle } from '../findings/Normalize.js';
import type { Platform } from './Platform.js';
import { ScanService } from './ScanService.js';

export type AlertKind = 'new_barrier' | 'regression' | 'new_component' | 'journey_changed' | 'site_untestable';

export interface MonitoringAlert {
  kind: AlertKind;
  severity: Severity;
  title: string;
  detail: string;
  url: string | null;
  findingId: string | null;
}

export interface MonitoringRun {
  prospectId: string;
  domain: string;
  scanId: string;
  previousScanId: string | null;
  alerts: MonitoringAlert[];
  suppressedAlertCount: number;
}

const JOURNEY_CRITICAL = ['checkout_entry', 'cart', 'product', 'category', 'search', 'account'];

/**
 * SYSTEM 11 — recurring monitoring.
 *
 * The hard part is not detecting change, it is not crying wolf. A monitoring
 * run only raises an alert when something got worse in a flow that makes the
 * merchant money; everything else is recorded but not escalated.
 */
export class MonitoringService {
  constructor(private readonly platform: Platform) {}

  dueSites(now = new Date()): Site[] {
    return this.platform.store.listMonitoredSites().filter((site) => {
      const prospect = this.platform.store.findProspectByDomain(site.domain);
      if (!prospect) return false;
      const last = this.platform.audits.latestScan(prospect.id, 'monitor') ?? this.platform.audits.latestCompletedScan(prospect.id);
      if (!last) return true;
      const elapsedDays = (now.getTime() - new Date(last.startedAt).getTime()) / 86_400_000;
      return elapsedDays >= site.monitoringIntervalDays;
    });
  }

  async runFor(domain: string): Promise<MonitoringRun> {
    const { store, audits } = this.platform;
    const prospect = store.findProspectByDomain(domain);
    if (!prospect) throw new Error(`Unknown domain: ${domain}`);
    const previous = audits.latestCompletedScan(prospect.id);

    const outcome = await new ScanService(this.platform).scanDomain(domain, { kind: 'monitor', baselineScanId: previous?.id ?? null });
    const alerts = previous ? this.diff(previous, outcome.scan) : [];
    const escalated = alerts.filter((a) => severityRank(a.severity) >= severityRank('high'));

    store.addTimelineEvent(prospect.id, 'monitoring_run', `Monitoring run: ${escalated.length} alert(s) worth acting on`, {
      scanId: outcome.scan.id,
      previousScanId: previous?.id ?? null,
      alerts: escalated.length,
      observed: alerts.length,
    });
    if (escalated.some((a) => a.kind === 'regression')) {
      store.addTimelineEvent(prospect.id, 'regression_detected', 'Monitoring found a regression in a critical flow', { scanId: outcome.scan.id });
    }

    return {
      prospectId: prospect.id,
      domain: prospect.domain,
      scanId: outcome.scan.id,
      previousScanId: previous?.id ?? null,
      alerts: escalated,
      suppressedAlertCount: alerts.length - escalated.length,
    };
  }

  /** Compare two scans of the same site and describe what actually changed. */
  diff(previous: Scan, current: Scan): MonitoringAlert[] {
    const { audits } = this.platform;
    const before = audits.listFindings(previous.id);
    const after = audits.listFindings(current.id);
    const beforeSignatures = new Set(before.map((f) => f.signature));
    const beforeComponents = new Set(before.map((f) => f.componentLabel).filter(Boolean));
    const fixedSignatures = new Set(
      audits
        .listRetests(current.prospectId)
        .filter((r) => r.outcome === 'FIXED')
        .map((r) => audits.getFinding(r.baselineFindingId)?.signature)
        .filter((s): s is string => Boolean(s)),
    );

    const alerts: MonitoringAlert[] = [];
    const seen = new Set<string>();

    for (const finding of after) {
      if (seen.has(finding.signature)) continue;
      seen.add(finding.signature);
      if (beforeSignatures.has(finding.signature)) continue;

      const isRegression = fixedSignatures.has(finding.signature);
      alerts.push({
        kind: isRegression ? 'regression' : 'new_barrier',
        severity: escalate(finding),
        title: `${isRegression ? 'Återkommande' : 'Nytt'} hinder: ${ruleTitle(finding.rule)}`,
        detail: finding.observedBehaviour,
        url: finding.url,
        findingId: finding.id,
      });
    }

    for (const finding of after) {
      if (!finding.componentLabel || beforeComponents.has(finding.componentLabel)) continue;
      if (alerts.some((a) => a.findingId === finding.id)) continue;
      alerts.push({
        kind: 'new_component',
        severity: finding.severity,
        title: `Ny komponent med problem: ${finding.componentLabel}`,
        detail: finding.observedBehaviour,
        url: finding.url,
        findingId: finding.id,
      });
    }

    for (const step of current.journey) {
      const was = previous.journey.find((s) => s.pageType === step.pageType);
      if (was?.reached && !step.reached && JOURNEY_CRITICAL.includes(step.pageType)) {
        alerts.push({
          kind: 'journey_changed',
          severity: 'high',
          title: `Steget "${step.pageType}" gick inte längre att testa`,
          detail: step.reason ?? 'Steget kunde inte nås i den här körningen.',
          url: was.url,
          findingId: null,
        });
      }
    }

    if (current.status !== 'completed') {
      alerts.push({
        kind: 'site_untestable',
        severity: 'high',
        title: 'Webbplatsen kunde inte testas',
        detail: current.error ?? 'Skanningen slutfördes inte.',
        url: null,
        findingId: null,
      });
    }

    return alerts;
  }
}

/** Journey-critical barriers are escalated; the same defect on a policy page is not. */
function escalate(finding: Finding): Severity {
  if (JOURNEY_CRITICAL.includes(finding.pageType)) return finding.severity;
  return finding.severity === 'critical' ? 'high' : finding.severity === 'high' ? 'medium' : finding.severity;
}
