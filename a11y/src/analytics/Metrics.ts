import type { Db } from '../db/Database.js';

export interface BusinessMetrics {
  domainsDiscovered: number;
  sitesScannedSuccessfully: number;
  sitesUntestable: number;
  qualifiedProspects: number;
  miniAuditsGenerated: number;
  miniAuditsApproved: number;
  prospectsContacted: number;
  responses: number;
  positiveResponses: number;
  meetings: number;
  proposals: number;
  customersWon: number;
  customersLost: number;
  auditRevenueSek: number;
  remediationRevenueSek: number;
  monitoringMrrSek: number;
  deliveryHoursPerCustomer: number;
  computeCostPerAuditSek: number;
  /** Conversion rates, the numbers that say whether the process is improving. */
  rates: {
    scanToQualified: number;
    qualifiedToContacted: number;
    contactedToResponse: number;
    responseToMeeting: number;
    meetingToWon: number;
    discoveredToWon: number;
  };
}

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const rate = (numerator: number, denominator: number): number => (denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(1)) : 0);

/**
 * SYSTEM 16 — business metrics.
 *
 * Every number here answers "is the money-making process working?". There is
 * deliberately no scan count, no findings-per-site and no "issues detected"
 * headline: those go up when the crawler gets noisier, not when the business
 * gets better.
 */
export function computeMetrics(db: Db): BusinessMetrics {
  const count = (sql: string, ...args: unknown[]): number =>
    num((db.prepare(sql).get(...(args as any[])) as any)?.n);
  const sum = (sql: string, ...args: unknown[]): number =>
    num((db.prepare(sql).get(...(args as any[])) as any)?.s);

  const domainsDiscovered = count('SELECT COUNT(*) AS n FROM prospects');
  const sitesScannedSuccessfully = count("SELECT COUNT(DISTINCT prospect_id) AS n FROM scans WHERE status = 'completed'");
  const sitesUntestable = count("SELECT COUNT(*) AS n FROM prospects WHERE scan_status IN ('unreachable', 'blocked', 'failed')");
  const qualifiedProspects = count("SELECT COUNT(*) AS n FROM prospects WHERE qualification_status = 'qualified'");
  const miniAuditsGenerated = count("SELECT COUNT(*) AS n FROM reports WHERE level = 'mini'");
  const miniAuditsApproved = count(
    "SELECT COUNT(DISTINCT prospect_id) AS n FROM timeline_events WHERE type = 'stage_changed' AND json_extract(payload, '$.to') IN ('READY_FOR_OUTREACH','CONTACTED','REPLIED','MEETING','PROPOSAL','WON','MONITORING')",
  );
  const prospectsContacted = count("SELECT COUNT(DISTINCT prospect_id) AS n FROM outreach_drafts WHERE status = 'sent'");
  const responses = count(
    "SELECT COUNT(DISTINCT prospect_id) AS n FROM timeline_events WHERE type = 'stage_changed' AND json_extract(payload, '$.to') IN ('REPLIED','MEETING','PROPOSAL','WON')",
  );
  const positiveResponses = count(
    "SELECT COUNT(DISTINCT prospect_id) AS n FROM timeline_events WHERE type = 'stage_changed' AND json_extract(payload, '$.to') IN ('MEETING','PROPOSAL','WON')",
  );
  const meetings = count(
    "SELECT COUNT(DISTINCT prospect_id) AS n FROM timeline_events WHERE type = 'stage_changed' AND json_extract(payload, '$.to') IN ('MEETING','PROPOSAL','WON')",
  );
  const proposals = count(
    "SELECT COUNT(DISTINCT prospect_id) AS n FROM timeline_events WHERE type = 'stage_changed' AND json_extract(payload, '$.to') IN ('PROPOSAL','WON')",
  );
  const customersWon = count("SELECT COUNT(*) AS n FROM prospects WHERE sales_stage IN ('WON','MONITORING')");
  const customersLost = count("SELECT COUNT(*) AS n FROM prospects WHERE sales_stage = 'LOST'");

  const auditRevenueSek = sum("SELECT SUM(amount_sek) AS s FROM revenue_records WHERE kind = 'audit'");
  const remediationRevenueSek = sum("SELECT SUM(amount_sek) AS s FROM revenue_records WHERE kind = 'remediation'");
  const monitoringMrrSek = sum("SELECT SUM(amount_sek) AS s FROM revenue_records WHERE kind = 'monitoring_mrr'");

  const deliveryHours = sum('SELECT SUM(delivery_hours) AS s FROM delivery_costs');
  const computeCost = sum('SELECT SUM(compute_cost_sek) AS s FROM delivery_costs');
  const auditsRun = count("SELECT COUNT(*) AS n FROM scans WHERE status = 'completed'");

  return {
    domainsDiscovered,
    sitesScannedSuccessfully,
    sitesUntestable,
    qualifiedProspects,
    miniAuditsGenerated,
    miniAuditsApproved,
    prospectsContacted,
    responses,
    positiveResponses,
    meetings,
    proposals,
    customersWon,
    customersLost,
    auditRevenueSek,
    remediationRevenueSek,
    monitoringMrrSek,
    deliveryHoursPerCustomer: customersWon > 0 ? Number((deliveryHours / customersWon).toFixed(2)) : 0,
    computeCostPerAuditSek: auditsRun > 0 ? Number((computeCost / auditsRun).toFixed(3)) : 0,
    rates: {
      scanToQualified: rate(qualifiedProspects, sitesScannedSuccessfully),
      qualifiedToContacted: rate(prospectsContacted, qualifiedProspects),
      contactedToResponse: rate(responses, prospectsContacted),
      responseToMeeting: rate(meetings, responses),
      meetingToWon: rate(customersWon, meetings),
      discoveredToWon: rate(customersWon, domainsDiscovered),
    },
  };
}

/** Where the pipeline is leaking, in one line. */
export function biggestDropOff(metrics: BusinessMetrics): string {
  const stages: { label: string; rate: number }[] = [
    { label: 'scan → kvalificerad', rate: metrics.rates.scanToQualified },
    { label: 'kvalificerad → kontaktad', rate: metrics.rates.qualifiedToContacted },
    { label: 'kontaktad → svar', rate: metrics.rates.contactedToResponse },
    { label: 'svar → möte', rate: metrics.rates.responseToMeeting },
    { label: 'möte → vunnen', rate: metrics.rates.meetingToWon },
  ].filter((s) => s.rate >= 0);
  const worst = stages.sort((a, b) => a.rate - b.rate)[0];
  return worst ? `${worst.label} (${worst.rate}%)` : 'not enough data yet';
}
