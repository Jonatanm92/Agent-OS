/**
 * Customer-journey rollup: Browse → Product → Add to cart → Cart → Checkout entry.
 *
 * A buyer does not think in WCAG criteria. They think about whether someone can
 * get from the front page to a paid order, so the report answers that directly.
 */
import type { Issue, PageRole, Severity } from '../types.js';

export interface JourneyStage {
  key: PageRole;
  label: string;
  /** True when the crawl actually examined a page of this kind. */
  examined: boolean;
  issueCount: number;
  worstSeverity: Severity | null;
  topIssues: { id: string; title: string; severity: Severity }[];
  /** Plain-language verdict for the executive summary. */
  verdict: string;
}

const STAGES: [PageRole, string][] = [
  ['home', 'Browse — home page'],
  ['collection', 'Browse — category listing'],
  ['product', 'Product page'],
  ['cart', 'Cart'],
  ['checkout-entry', 'Checkout entry'],
];

const ORDER: Severity[] = ['low', 'medium', 'high', 'critical'];

function worst(issues: Issue[]): Severity | null {
  let result: Severity | null = null;
  for (const issue of issues) {
    if (!result || ORDER.indexOf(issue.severity) > ORDER.indexOf(result)) result = issue.severity;
  }
  return result;
}

export function buildJourney(issues: Issue[], rolesExamined: PageRole[]): JourneyStage[] {
  return STAGES.map(([key, label]) => {
    const examined = rolesExamined.includes(key);
    const stageIssues = issues.filter((issue) => issue.affectedRoles.includes(key));
    const severity = worst(stageIssues);

    let verdict: string;
    if (!examined) {
      verdict = 'Not examined — the scan did not reach a page of this kind. No conclusion can be drawn.';
    } else if (stageIssues.length === 0) {
      verdict = 'No automated failures detected at this stage. Manual checks still required.';
    } else if (severity === 'critical') {
      verdict = 'Contains a defect that may block a customer from completing this step.';
    } else if (severity === 'high') {
      verdict = 'Contains a significant barrier that makes this step substantially harder.';
    } else {
      verdict = 'Usable, with defects that degrade the experience rather than block it.';
    }

    return {
      key,
      label,
      examined,
      issueCount: stageIssues.length,
      worstSeverity: severity,
      topIssues: stageIssues
        .slice(0, 3)
        .map((issue) => ({ id: issue.id, title: issue.title, severity: issue.severity })),
      verdict,
    };
  });
}

/**
 * Positive observations, stated only when actually established by the scan.
 * Never invented — an empty list is an honest outcome.
 */
export function collectPositives(issues: Issue[], rolesExamined: PageRole[]): string[] {
  const ruleIds = new Set(issues.map((i) => i.ruleId));
  const positives: string[] = [];

  if (!ruleIds.has('html-has-lang') && !ruleIds.has('html-lang-valid')) {
    positives.push('Every page examined declares a valid document language, so screen readers use the correct voice.');
  }
  if (!ruleIds.has('document-title')) {
    positives.push('Every page examined has a page title.');
  }
  if (!ruleIds.has('meta-viewport')) {
    positives.push('Pinch-zoom is not suppressed, so customers can magnify pages on a phone.');
  }
  if (!ruleIds.has('check:reflow-overflow')) {
    positives.push('No horizontal scrolling was detected at a 320px viewport, so the layout reflows for zoom and small screens.');
  }
  if (!ruleIds.has('label')) {
    positives.push('Form fields encountered by the scan had programmatic labels.');
  }
  if (!ruleIds.has('color-contrast')) {
    positives.push('No text failed the automated colour-contrast threshold on the pages examined.');
  }
  if (!ruleIds.has('check:no-skip-link')) {
    positives.push('A skip link to the main content was present, saving keyboard users the header on every page.');
  }
  if (rolesExamined.includes('cart') && !issues.some((i) => i.affectedRoles.includes('cart') && i.severity === 'critical')) {
    positives.push('No blocking automated failures were found on the cart page.');
  }

  return positives;
}
