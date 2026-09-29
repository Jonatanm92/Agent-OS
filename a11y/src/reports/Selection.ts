import type { Finding, FindingGroup, Severity } from '../core/Types.js';
import { leadValue } from '../findings/LeadValue.js';
import { severityRank } from '../findings/Severity.js';

/**
 * SYSTEM 7 — what may appear in a customer-facing report.
 *
 * A finding is reportable when an engine confirmed it or a reviewer approved
 * it. Anything a reviewer rejected never appears; anything still flagged
 * REVIEW_REQUIRED appears only in the clearly-marked manual validation section.
 */
export function isReportable(finding: Finding): boolean {
  if (finding.reviewStatus === 'rejected') return false;
  if (finding.confidence === 'REJECTED') return false;
  if (finding.reviewStatus === 'approved' || finding.reviewStatus === 'manual_test_confirmed') return true;
  return finding.confidence === 'CONFIRMED_AUTOMATED' || finding.confidence === 'HIGH_CONFIDENCE';
}

export function needsManualValidation(finding: Finding): boolean {
  if (finding.reviewStatus === 'rejected') return false;
  return finding.confidence === 'REVIEW_REQUIRED' || finding.reviewStatus === 'manual_test_requested';
}

const JOURNEY_PAGES = ['checkout_entry', 'cart', 'product', 'category', 'search', 'account'];

/**
 * The merchant cannot fix somebody else's embedded widget, so a mini audit that
 * leads with one reads as though we did not understand the site. These are
 * reported to a paying customer in their own section instead.
 */
export function isMerchantOwned(finding: Finding): boolean {
  return finding.thirdParty === null;
}

/**
 * Mini audit selection. Three to five findings that a busy ecommerce manager
 * will recognise as real problems on their own site — not the five findings
 * with the highest raw counts.
 */
export function selectMiniFindings(findings: Finding[], groups: FindingGroup[], limit = 5): Finding[] {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const candidates = findings
    .filter(isReportable)
    .filter(isMerchantOwned)
    .filter((f) => severityRank(f.severity) >= severityRank('high'))
    .sort((a, b) => miniScore(b, groupById.get(b.groupId ?? '')) - miniScore(a, groupById.get(a.groupId ?? '')));

  const chosen: Finding[] = [];
  const usedGroups = new Set<string>();
  const usedRules = new Set<string>();

  // First pass: one finding per rule, so the audit reads as a set of distinct
  // problems rather than the same defect five times.
  for (const finding of candidates) {
    if (chosen.length >= limit) break;
    if (finding.groupId && usedGroups.has(finding.groupId)) continue;
    if (usedRules.has(finding.rule)) continue;
    chosen.push(finding);
    usedRules.add(finding.rule);
    if (finding.groupId) usedGroups.add(finding.groupId);
  }
  // Second pass: fill remaining slots if the site only has a couple of rules.
  for (const finding of candidates) {
    if (chosen.length >= limit) break;
    if (chosen.includes(finding)) continue;
    if (finding.groupId && usedGroups.has(finding.groupId)) continue;
    chosen.push(finding);
    if (finding.groupId) usedGroups.add(finding.groupId);
  }
  return chosen;
}

function miniScore(finding: Finding, group: FindingGroup | undefined): number {
  let score = severityRank(finding.severity) * 25;
  if (finding.confidence === 'CONFIRMED_AUTOMATED') score += 20;
  if (finding.reviewStatus === 'approved' || finding.reviewStatus === 'manual_test_confirmed') score += 25;
  if (finding.screenshotKey) score += 18;
  if (finding.keyboardReproduction.length) score += 14;
  if (JOURNEY_PAGES.includes(finding.pageType)) score += 12;
  if (group?.systemic) score += Math.min(10, group.affectedPageCount * 2);
  // Sales weight dominates the ordering: we lead with what the merchant can
  // verify themselves in ten seconds.
  score += leadValue(finding.rule) * 1.5;
  // A finding whose component we cannot name ("input", "div") makes a weak lead.
  if (!finding.componentLabel || /^(input|div|span|a|button|select|img)(\s|\(|$)/i.test(finding.componentLabel)) score -= 12;
  // Contrast findings are real but rarely convincing as a lead finding.
  if (finding.rule === 'axe.color-contrast') score -= 18;
  if (finding.rule.startsWith('structure.')) score -= 8;
  return score;
}

export interface ProfessionalSections {
  criticalBarriers: Finding[];
  highPriority: Finding[];
  mediumPriority: Finding[];
  improvements: Finding[];
  manualValidation: Finding[];
  /** Defects in embedded third-party code, grouped so the vendor can be named. */
  thirdParty: Finding[];
}

/** SYSTEM 7 — the professional audit's remediation roadmap. */
export function categorizeForProfessional(findings: Finding[]): ProfessionalSections {
  const reportable = findings.filter(isReportable).filter(isMerchantOwned);
  const inJourney = (f: Finding) => JOURNEY_PAGES.includes(f.pageType);
  const bySeverity = (severity: Severity) => reportable.filter((f) => f.severity === severity);

  const criticalBarriers = reportable.filter((f) => f.severity === 'critical' && inJourney(f));
  const highPriority = [
    ...bySeverity('critical').filter((f) => !inJourney(f)),
    ...bySeverity('high'),
  ];
  return {
    criticalBarriers,
    highPriority,
    mediumPriority: bySeverity('medium'),
    improvements: bySeverity('low'),
    manualValidation: findings.filter(needsManualValidation).filter(isMerchantOwned),
    thirdParty: findings.filter(isReportable).filter((f) => f.thirdParty !== null),
  };
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  return {
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
  };
}
