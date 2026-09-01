/**
 * Domain model for the A11Y Revenue OS.
 *
 * Everything the platform produces is traceable: a finding points at the scan
 * that produced it, the scan points at the prospect, and prospect facts carry
 * provenance. Nothing in here is ever allowed to be invented — see
 * `docs/SAFETY.md` and `Provenance`.
 */

export type Country = 'SE' | 'NO' | 'DK' | 'FI' | 'DE' | 'UK' | 'OTHER';

export type PageType =
  | 'homepage'
  | 'search'
  | 'category'
  | 'product'
  | 'cart'
  | 'account'
  | 'checkout_entry'
  | 'content'
  | 'unknown';

export const JOURNEY_PAGE_TYPES: PageType[] = [
  'homepage',
  'search',
  'category',
  'product',
  'cart',
  'account',
  'checkout_entry',
];

export type EcommercePlatform =
  | 'shopify'
  | 'woocommerce'
  | 'magento'
  | 'prestashop'
  | 'wikinggruppen'
  | 'starweb'
  | 'jetshop'
  | 'quickbutik'
  | 'centra'
  | 'custom_modern'
  | 'unknown';

export type Cms = 'wordpress' | 'shopify' | 'drupal' | 'next' | 'nuxt' | 'react_spa' | 'vue_spa' | 'unknown';

export type SizeBucket = 'micro' | 'small' | 'medium' | 'large' | 'unknown';

export type ScanStatus =
  | 'not_scanned'
  | 'queued'
  | 'scanning'
  | 'scanned'
  | 'unreachable'
  | 'blocked'
  | 'failed';

export type QualificationStatus = 'unqualified' | 'qualified' | 'disqualified' | 'pending';

/** SYSTEM 13 — sales pipeline stages, in order. */
export const SALES_STAGES = [
  'DISCOVERED',
  'SCANNED',
  'QUALIFIED',
  'MINI_AUDIT_READY',
  'REVIEWED',
  'READY_FOR_OUTREACH',
  'CONTACTED',
  'REPLIED',
  'MEETING',
  'PROPOSAL',
  'WON',
  'LOST',
  'MONITORING',
] as const;
export type SalesStage = (typeof SALES_STAGES)[number];

export type OutreachStatus = 'none' | 'drafted' | 'approved' | 'sent' | 'replied' | 'suppressed';

/** How a piece of information about a company was established. */
export interface Provenance {
  id: string;
  entityType: 'prospect' | 'finding' | 'site';
  entityId: string;
  field: string;
  value: string;
  /** Where the value came from, e.g. "https://example.se/kontakt" or "operator:jonatan". */
  source: string;
  /** How it was derived, e.g. "dom_meta_generator", "manual_entry", "http_header". */
  method: string;
  confidence: 'observed' | 'inferred' | 'declared';
  observedAt: string;
}

export interface ContactChannel {
  kind: 'email' | 'phone' | 'contact_form' | 'linkedin' | 'other';
  value: string;
  source: string;
}

export interface Prospect {
  id: string;
  companyName: string | null;
  domain: string;
  country: Country;
  ecommerceDetected: boolean | null;
  ecommercePlatform: EcommercePlatform;
  cms: Cms;
  industry: string | null;
  sizeBucket: SizeBucket;
  contactChannels: ContactChannel[];
  /** Public agency/developer attribution ("Built by X") where the site states it. */
  agencyAttribution: string | null;
  scanStatus: ScanStatus;
  qualificationStatus: QualificationStatus;
  issueSummary: string | null;
  leadScore: number;
  evidenceScore: number;
  outreachStatus: OutreachStatus;
  salesStage: SalesStage;
  nextAction: string;
  notes: string | null;
  siteId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** SYSTEM 2 — what the crawler could and could not reach. */
export interface JourneyStep {
  pageType: PageType;
  url: string | null;
  reached: boolean;
  /** Why a step could not be tested — always recorded, never silently dropped. */
  reason?: string;
  httpStatus?: number;
  title?: string | null;
}

export interface RobotsDecision {
  fetched: boolean;
  allowed: boolean;
  crawlDelayMs: number | null;
  reason: string;
}

/**
 * SYSTEM 2 — what we did about the cookie consent overlay that sits in front of
 * essentially every European storefront.
 *
 * Recorded on the scan so a report can state plainly whether the store was
 * audited in front of, or behind, its own consent wall.
 */
export interface ConsentDecision {
  detected: boolean;
  /** Known CMP vendor, when the fingerprint is unambiguous. */
  vendor: string | null;
  dismissed: boolean;
  /** How it was dismissed. We only ever decline non-essential cookies. */
  method: 'necessary_only' | 'reject_all' | 'close_button' | 'not_dismissible' | 'none_present';
  containerSelector: string | null;
  /** Share of the viewport the overlay covered, for the report to describe. */
  coveragePercent: number | null;
  /**
   * Operational record in English, for logs and the JSON export. Customer-facing
   * wording is composed from the structured fields above, in the market's
   * language — see `reports/Html.ts`.
   */
  note: string;
}

export type ScanKind = 'initial' | 'retest' | 'monitor';

export interface Scan {
  id: string;
  prospectId: string;
  kind: ScanKind;
  status: 'running' | 'completed' | 'failed' | 'blocked';
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  journey: JourneyStep[];
  robots: RobotsDecision | null;
  consent: ConsentDecision | null;
  pagesTested: number;
  baselineScanId: string | null;
}

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

/**
 * SYSTEM 4 — confidence. Only CONFIRMED_AUTOMATED and HIGH_CONFIDENCE findings
 * may reach a customer-facing report without a reviewer approving them.
 */
export type Confidence = 'CONFIRMED_AUTOMATED' | 'HIGH_CONFIDENCE' | 'REVIEW_REQUIRED' | 'REJECTED';

export type SourceEngine = 'axe-core' | 'keyboard-probe' | 'focus-probe' | 'form-probe' | 'structure-probe' | 'dialog-probe' | 'reflow-probe';

export type ReviewStatus = 'unreviewed' | 'approved' | 'rejected' | 'manual_test_requested' | 'manual_test_confirmed' | 'merged';

export interface WcagRef {
  criterion: string;
  level: 'A' | 'AA' | 'AAA';
  title: string;
}

export interface Finding {
  id: string;
  scanId: string;
  prospectId: string;
  /** Set when this finding was folded into a systemic component group. */
  groupId: string | null;
  url: string;
  pageType: PageType;
  detectedAt: string;
  rule: string;
  wcag: WcagRef[];
  severity: Severity;
  confidence: Confidence;
  selector: string;
  html: string;
  screenshotKey: string | null;
  reproduction: string[];
  keyboardReproduction: string[];
  expectedBehaviour: string;
  observedBehaviour: string;
  userImpact: string;
  remediation: string;
  sourceEngine: SourceEngine;
  raw: unknown;
  reviewStatus: ReviewStatus;
  reviewerNote: string | null;
  /** Stable across scans of the same site — used by retest and monitoring. */
  signature: string;
  componentLabel: string | null;
  /**
   * Vendor name when the element belongs to third-party code embedded in the
   * page (a consent manager, a chat widget, a review badge). The merchant
   * usually cannot fix these, so they are reported separately and never lead a
   * mini audit.
   */
  thirdParty: string | null;
}

/** SYSTEM 4 — one systemic problem standing in for N pages. */
export interface FindingGroup {
  id: string;
  scanId: string;
  prospectId: string;
  signature: string;
  rule: string;
  componentLabel: string;
  severity: Severity;
  confidence: Confidence;
  affectedPageCount: number;
  affectedPageTypes: PageType[];
  instanceCount: number;
  representativeFindingId: string;
  systemic: boolean;
  reviewStatus: ReviewStatus;
}

export type ReviewAction =
  | 'APPROVE'
  | 'REJECT'
  | 'CHANGE_SEVERITY'
  | 'EDIT_DESCRIPTION'
  | 'REQUEST_MANUAL_TEST'
  | 'CONFIRM_MANUAL_TEST'
  | 'MERGE_DUPLICATES';

export interface ReviewDecision {
  id: string;
  findingId: string | null;
  groupId: string | null;
  reviewer: string;
  action: ReviewAction;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  note: string | null;
  createdAt: string;
}

export type ReportLevel = 'mini' | 'professional' | 'developer';

export interface ReportRecord {
  id: string;
  prospectId: string;
  scanId: string;
  level: ReportLevel;
  htmlKey: string | null;
  jsonKey: string | null;
  pdfKey: string | null;
  findingCount: number;
  createdAt: string;
}

export type RetestOutcome = 'OPEN' | 'PARTIALLY_FIXED' | 'FIXED' | 'REGRESSED' | 'UNABLE_TO_VERIFY';

export interface RetestResult {
  id: string;
  prospectId: string;
  baselineFindingId: string;
  retestScanId: string;
  outcome: RetestOutcome;
  beforeEvidenceKey: string | null;
  afterEvidenceKey: string | null;
  detail: string;
  createdAt: string;
}

/** SYSTEM 12 — the customer timeline. Operational documentation, not certification. */
export type TimelineEventType =
  | 'prospect_discovered'
  | 'scan_started'
  | 'scan_completed'
  | 'scan_failed'
  | 'findings_normalized'
  | 'mini_audit_generated'
  | 'review_decision'
  | 'report_generated'
  | 'outreach_drafted'
  | 'outreach_approved'
  | 'outreach_sent'
  | 'stage_changed'
  | 'remediation_started'
  | 'retest_completed'
  | 'regression_detected'
  | 'monitoring_run'
  | 'revenue_recorded';

export interface TimelineEvent {
  id: string;
  prospectId: string;
  type: TimelineEventType;
  summary: string;
  payload: Record<string, unknown>;
  at: string;
}

export interface OutreachDraft {
  id: string;
  prospectId: string;
  channel: 'email' | 'linkedin' | 'contact_form';
  toValue: string | null;
  subject: string;
  body: string;
  citedFindingIds: string[];
  status: 'drafted' | 'approved' | 'rejected' | 'sent';
  reviewerNote: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface Suppression {
  id: string;
  kind: 'domain' | 'email';
  value: string;
  reason: string;
  createdAt: string;
}

/** SYSTEM 15 — agency-compatible hierarchy, present from day one. */
export interface Agency {
  id: string;
  name: string;
  slug: string;
  branding: { primaryColor?: string; logoUrl?: string; footerNote?: string };
  createdAt: string;
}

export interface Client {
  id: string;
  agencyId: string | null;
  name: string;
  createdAt: string;
}

export interface Site {
  id: string;
  clientId: string | null;
  domain: string;
  label: string | null;
  monitoringEnabled: boolean;
  monitoringIntervalDays: number;
  createdAt: string;
}

export interface RevenueRecord {
  id: string;
  prospectId: string;
  kind: 'audit' | 'remediation' | 'monitoring_mrr';
  amountSek: number;
  note: string | null;
  recordedAt: string;
}

export interface DeliveryCostRecord {
  id: string;
  prospectId: string;
  scanId: string | null;
  deliveryHours: number;
  computeCostSek: number;
  note: string | null;
  recordedAt: string;
}
