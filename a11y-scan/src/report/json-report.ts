/** Structured output. Stable shape — treat it as the machine-readable contract. */
import type { ScanResult } from '../types.js';
import { buildJourney } from '../analyze/journey.js';
import { buildHandoff } from './handoff.js';
import { countBySeverity, quickWins } from '../analyze/severity.js';

export const REPORT_DISCLAIMER =
  'This is a technical accessibility risk scan (pre-audit). It is not legal advice, ' +
  'not a certification, and not a guarantee of compliance with WCAG, the Swedish ' +
  'accessibility legislation (LPTT) or the European Accessibility Act. Automated ' +
  'testing detects only a portion of accessibility barriers; the manual checks in ' +
  'this report are required to form a complete picture.';

export function buildJsonReport(result: ScanResult): Record<string, unknown> {
  const tested = result.pages.filter((p) => !p.error);
  const rolesExamined = [...new Set(tested.map((p) => p.role))];
  const counts = countBySeverity(result.issues);

  return {
    schemaVersion: 1,
    disclaimer: REPORT_DISCLAIMER,
    scan: {
      target: result.target,
      domain: result.domain,
      date: result.scanDate,
      durationMs: result.durationMs,
      limits: result.limits,
      robotsRespected: result.robotsRespected,
    },
    summary: {
      pagesExamined: tested.length,
      pagesAttempted: result.pages.length,
      uniqueIssues: result.issues.length,
      totalOccurrences: result.issues.reduce((sum, i) => sum + i.instanceCount, 0),
      bySeverity: counts,
      topFixes: result.issues.slice(0, 5).map((i) => ({
        id: i.id,
        title: i.title,
        component: i.component,
        severity: i.severity,
        effort: i.effort,
      })),
      positiveObservations: result.positives,
    },
    scope: {
      pages: result.pages,
      rolesExamined,
      notTested: result.notTested,
      automatedCoverageNote:
        'Automated rules cover a minority of WCAG success criteria. Everything listed under manualChecks is unverified until a person performs it.',
    },
    issues: result.issues,
    quickWins: quickWins(result.issues).map((i) => i.id),
    customerJourney: buildJourney(result.issues, rolesExamined),
    manualChecks: result.manualChecks,
    developerHandoff: buildHandoff(result),
  };
}
