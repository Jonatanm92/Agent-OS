/**
 * Turns raw findings into ranked, grouped issues. Pure data in, pure data out —
 * no browser, no network, which is what makes phases 4-7 testable on their own.
 */
import type { Finding, Issue } from '../types.js';
import { componentsPerRule, groupFindings } from './group.js';
import { assignEffort, assignSeverity, priorityScore, rankIssues } from './severity.js';

export function buildIssues(findings: Finding[], totalPageCount: number): Issue[] {
  const grouped = groupFindings(findings);
  const componentCounts = componentsPerRule(grouped);

  const issues: Issue[] = grouped.map((group) => {
    const distinctComponents = componentCounts.get(group.ruleId) ?? 1;

    const severity = assignSeverity({
      ruleId: group.ruleId,
      affectedRoles: group.affectedRoles,
      affectedPageCount: group.affectedUrls.length,
      totalPageCount,
    });
    const effort = assignEffort({ ruleId: group.ruleId, distinctComponents });

    return {
      ...group,
      severity,
      effort,
      priority: priorityScore(severity, effort),
    };
  });

  return rankIssues(issues);
}
