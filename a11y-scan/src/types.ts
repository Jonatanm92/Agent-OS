/** Shared data shapes. Stages pass plain objects, which is what makes 4-7 testable without a browser. */

export type PageRole =
  | 'home'
  | 'collection'
  | 'product'
  | 'cart'
  | 'checkout-entry'
  | 'search'
  | 'account'
  | 'contact'
  | 'other';

/** The purchase funnel, used for the customer-journey rollup. */
export const JOURNEY_ORDER: PageRole[] = ['home', 'collection', 'product', 'cart', 'checkout-entry'];

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Effort = 'small' | 'medium' | 'large';
export type Verification = 'automatic' | 'manual-required';

export interface DiscoveredPage {
  url: string;
  role: PageRole;
  depth: number;
  title: string;
  /** HTTP status of the main document, null if navigation failed outright. */
  status: number | null;
  /** Set when the page could not be audited; the page still appears in the report. */
  error?: string;
}

/** One occurrence of a defect on one page. */
export interface Instance {
  url: string;
  role: PageRole;
  selector: string;
  snippet: string;
  /** Free-form extra evidence, e.g. measured contrast ratio or element size. */
  detail?: string;
  /**
   * Inline PNG data URI of the offending element, when one could be captured.
   * Optional by design: a screenshot is nice-to-have evidence, never a
   * precondition for reporting a finding.
   */
  screenshot?: string;
}

/** A single raw defect before grouping. */
export interface Finding {
  ruleId: string;
  title: string;
  source: 'axe' | 'check';
  verification: Verification;
  wcag: string[];
  impact: string;
  remediation: string;
  /** How a developer confirms the defect themselves. */
  verify: string;
  instance: Instance;
}

/** Findings for the same defect and component, collapsed. */
export interface Issue {
  id: string;
  ruleId: string;
  title: string;
  source: 'axe' | 'check';
  verification: Verification;
  wcag: string[];
  impact: string;
  remediation: string;
  verify: string;
  severity: Severity;
  effort: Effort;
  /** Impact weight divided by effort weight. Higher sorts first. */
  priority: number;
  /** Selector shape shared by every instance, with positional noise removed. */
  component: string;
  affectedUrls: string[];
  affectedRoles: PageRole[];
  instanceCount: number;
  /** Up to three representative instances; the rest are summarised by count. */
  examples: Instance[];
}

export interface ManualCheck {
  id: string;
  area: string;
  instruction: string;
  passCriteria: string;
  wcag: string[];
  /** Set when an automated signal suggests this area deserves attention first. */
  flaggedBy?: string;
}

export interface ScanResult {
  target: string;
  domain: string;
  scanDate: string;
  durationMs: number;
  pages: DiscoveredPage[];
  issues: Issue[];
  manualChecks: ManualCheck[];
  positives: string[];
  /** Things the scan could not reach, stated so the report never implies coverage it lacks. */
  notTested: string[];
  limits: { maxPages: number; maxDepth: number };
  robotsRespected: boolean;
}
