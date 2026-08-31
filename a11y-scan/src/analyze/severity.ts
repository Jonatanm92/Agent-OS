/**
 * Phase 5 — pragmatic prioritization.
 *
 * axe's own `impact` is context-free: a button with no accessible name is
 * "critical" whether it is a footer social icon or the add-to-cart button. This
 * module starts from a per-rule base severity and applies modifiers that depend
 * on where in the purchase funnel the defect sits and how widely it spreads.
 */
import type { Effort, Issue, PageRole, Severity } from '../types.js';
import { DEFAULT_META, RULE_CATALOG } from './rule-catalog.js';

const SEVERITY_ORDER: Severity[] = ['low', 'medium', 'high', 'critical'];

/** Pages where a blocked interaction costs a sale outright. */
const CRITICAL_FLOW_ROLES: PageRole[] = ['cart', 'checkout-entry', 'product'];

export function escalate(severity: Severity, steps = 1): Severity {
  const index = SEVERITY_ORDER.indexOf(severity);
  const next = Math.min(SEVERITY_ORDER.length - 1, index + steps);
  return SEVERITY_ORDER[next]!;
}

export function atLeast(severity: Severity, floor: Severity): Severity {
  return SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf(floor) ? severity : floor;
}

export interface SeverityInput {
  ruleId: string;
  affectedRoles: PageRole[];
  affectedPageCount: number;
  totalPageCount: number;
}

export function assignSeverity(input: SeverityInput): Severity {
  const meta = RULE_CATALOG[input.ruleId];
  let severity: Severity = meta?.baseSeverity ?? DEFAULT_META.baseSeverity;

  // In the purchase flow, the same defect costs money rather than goodwill.
  if (input.affectedRoles.some((role) => CRITICAL_FLOW_ROLES.includes(role))) {
    severity = escalate(severity);
  }

  // Present on most of the site: a systemic defect, not an oversight.
  if (input.totalPageCount > 0 && input.affectedPageCount / input.totalPageCount > 0.5) {
    severity = escalate(severity);
  }

  // Rules that can stop a purchase never report as a minor issue, however
  // narrowly they appear.
  if (meta?.blocking) {
    severity = atLeast(severity, 'high');
  }

  return severity;
}

export interface EffortInput {
  ruleId: string;
  /**
   * Distinct component shapes affected. One shared template across 40 pages is
   * ONE fix; 40 hand-written variations are 40. Page count must not drive this.
   */
  distinctComponents: number;
}

export function assignEffort(input: EffortInput): Effort {
  const meta = RULE_CATALOG[input.ruleId];
  const base: Effort = meta?.baseEffort ?? DEFAULT_META.baseEffort;

  const order: Effort[] = ['small', 'medium', 'large'];
  let index = order.indexOf(base);

  if (input.distinctComponents >= 20) index += 2;
  else if (input.distinctComponents >= 6) index += 1;

  return order[Math.min(order.length - 1, index)]!;
}

const IMPACT_WEIGHT: Record<Severity, number> = { critical: 10, high: 6, medium: 3, low: 1 };
const EFFORT_WEIGHT: Record<Effort, number> = { small: 1, medium: 2.5, large: 5 };

/** Impact divided by effort: what to do first when time is finite. */
export function priorityScore(severity: Severity, effort: Effort): number {
  return Number((IMPACT_WEIGHT[severity] / EFFORT_WEIGHT[effort]).toFixed(3));
}

export function rankIssues(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    // Severity dominates: a critical large fix still outranks a low small one.
    const bySeverity = SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity);
    if (bySeverity !== 0) return bySeverity;
    if (b.priority !== a.priority) return b.priority - a.priority;
    // Among equals, a defect in the purchase flow costs money rather than
    // goodwill, so it is what the customer should fix first.
    const inFlow = (issue: Issue): number =>
      issue.affectedRoles.some((role) => CRITICAL_FLOW_ROLES.includes(role)) ? 1 : 0;
    if (inFlow(b) !== inFlow(a)) return inFlow(b) - inFlow(a);
    if (b.instanceCount !== a.instanceCount) return b.instanceCount - a.instanceCount;
    return a.id < b.id ? -1 : 1;
  });
}

/**
 * High impact for comparatively little work — what a shop can ship this sprint.
 */
export function quickWins(issues: Issue[]): Issue[] {
  return issues
    .filter(
      (issue) =>
        issue.effort === 'small' && (issue.severity === 'critical' || issue.severity === 'high' || issue.severity === 'medium')
    )
    .sort((a, b) => b.priority - a.priority);
}

export function countBySeverity(issues: Issue[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const issue of issues) counts[issue.severity]++;
  return counts;
}
