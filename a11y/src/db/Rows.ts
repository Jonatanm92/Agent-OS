/** Row → domain mappers. Kept in one place so column names live next to the schema. */
import type {
  Agency,
  Client,
  ContactChannel,
  Finding,
  FindingGroup,
  OutreachDraft,
  Prospect,
  ReportRecord,
  RetestResult,
  ReviewDecision,
  Scan,
  Site,
  Suppression,
  TimelineEvent,
} from '../core/Types.js';

type Row = Record<string, any>;

const json = <T>(raw: unknown, fallback: T): T => {
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const toProspect = (r: Row): Prospect => ({
  id: r.id,
  companyName: r.company_name,
  domain: r.domain,
  country: r.country,
  ecommerceDetected: r.ecommerce_detected === null ? null : Boolean(r.ecommerce_detected),
  ecommercePlatform: r.ecommerce_platform,
  cms: r.cms,
  industry: r.industry,
  sizeBucket: r.size_bucket,
  contactChannels: json<ContactChannel[]>(r.contact_channels, []),
  agencyAttribution: r.agency_attribution,
  scanStatus: r.scan_status,
  qualificationStatus: r.qualification_status,
  issueSummary: r.issue_summary,
  leadScore: r.lead_score,
  evidenceScore: r.evidence_score,
  outreachStatus: r.outreach_status,
  salesStage: r.sales_stage,
  nextAction: r.next_action,
  notes: r.notes,
  siteId: r.site_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const toScan = (r: Row): Scan => ({
  id: r.id,
  prospectId: r.prospect_id,
  kind: r.kind,
  status: r.status,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  error: r.error,
  journey: json(r.journey, []),
  robots: json(r.robots, null),
  consent: json(r.consent, null),
  pagesTested: r.pages_tested,
  baselineScanId: r.baseline_scan_id,
});

export const toFinding = (r: Row): Finding => ({
  id: r.id,
  scanId: r.scan_id,
  prospectId: r.prospect_id,
  groupId: r.group_id,
  url: r.url,
  pageType: r.page_type,
  detectedAt: r.detected_at,
  rule: r.rule,
  wcag: json(r.wcag, []),
  severity: r.severity,
  confidence: r.confidence,
  selector: r.selector,
  html: r.html,
  screenshotKey: r.screenshot_key,
  reproduction: json(r.reproduction, []),
  keyboardReproduction: json(r.keyboard_reproduction, []),
  expectedBehaviour: r.expected_behaviour,
  observedBehaviour: r.observed_behaviour,
  userImpact: r.user_impact,
  remediation: r.remediation,
  sourceEngine: r.source_engine,
  raw: json(r.raw, {}),
  reviewStatus: r.review_status,
  reviewerNote: r.reviewer_note,
  signature: r.signature,
  componentLabel: r.component_label,
  thirdParty: r.third_party ?? null,
});

export const toGroup = (r: Row): FindingGroup => ({
  id: r.id,
  scanId: r.scan_id,
  prospectId: r.prospect_id,
  signature: r.signature,
  rule: r.rule,
  componentLabel: r.component_label,
  severity: r.severity,
  confidence: r.confidence,
  affectedPageCount: r.affected_page_count,
  affectedPageTypes: json(r.affected_page_types, []),
  instanceCount: r.instance_count,
  representativeFindingId: r.representative_finding_id,
  systemic: Boolean(r.systemic),
  reviewStatus: r.review_status,
});

export const toReview = (r: Row): ReviewDecision => ({
  id: r.id,
  findingId: r.finding_id,
  groupId: r.group_id,
  reviewer: r.reviewer,
  action: r.action,
  before: json(r.before, null),
  after: json(r.after, null),
  note: r.note,
  createdAt: r.created_at,
});

export const toReport = (r: Row): ReportRecord => ({
  id: r.id,
  prospectId: r.prospect_id,
  scanId: r.scan_id,
  level: r.level,
  htmlKey: r.html_key,
  jsonKey: r.json_key,
  pdfKey: r.pdf_key,
  findingCount: r.finding_count,
  createdAt: r.created_at,
});

export const toRetest = (r: Row): RetestResult => ({
  id: r.id,
  prospectId: r.prospect_id,
  baselineFindingId: r.baseline_finding_id,
  retestScanId: r.retest_scan_id,
  outcome: r.outcome,
  beforeEvidenceKey: r.before_evidence_key,
  afterEvidenceKey: r.after_evidence_key,
  detail: r.detail,
  createdAt: r.created_at,
});

export const toTimelineEvent = (r: Row): TimelineEvent => ({
  id: r.id,
  prospectId: r.prospect_id,
  type: r.type,
  summary: r.summary,
  payload: json(r.payload, {}),
  at: r.at,
});

export const toOutreach = (r: Row): OutreachDraft => ({
  id: r.id,
  prospectId: r.prospect_id,
  channel: r.channel,
  toValue: r.to_value,
  subject: r.subject,
  body: r.body,
  citedFindingIds: json(r.cited_finding_ids, []),
  status: r.status,
  reviewerNote: r.reviewer_note,
  createdAt: r.created_at,
  sentAt: r.sent_at,
});

export const toSuppression = (r: Row): Suppression => ({
  id: r.id,
  kind: r.kind,
  value: r.value,
  reason: r.reason,
  createdAt: r.created_at,
});

export const toAgency = (r: Row): Agency => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  branding: json(r.branding, {}),
  createdAt: r.created_at,
});

export const toClient = (r: Row): Client => ({
  id: r.id,
  agencyId: r.agency_id,
  name: r.name,
  createdAt: r.created_at,
});

export const toSite = (r: Row): Site => ({
  id: r.id,
  clientId: r.client_id,
  domain: r.domain,
  label: r.label,
  monitoringEnabled: Boolean(r.monitoring_enabled),
  monitoringIntervalDays: r.monitoring_interval_days,
  createdAt: r.created_at,
});
