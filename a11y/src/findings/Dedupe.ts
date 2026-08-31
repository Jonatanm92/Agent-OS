import { newId } from '../core/Ids.js';
import type { Finding, FindingGroup, PageType } from '../core/Types.js';
import { maxSeverity, severityRank } from './Severity.js';
import { ruleTitle } from './Normalize.js';

export interface GroupingResult {
  findings: Finding[];
  groups: FindingGroup[];
}

const CONFIDENCE_RANK: Record<Finding['confidence'], number> = {
  CONFIRMED_AUTOMATED: 3,
  HIGH_CONFIDENCE: 2,
  REVIEW_REQUIRED: 1,
  REJECTED: 0,
};

/**
 * SYSTEM 4 — deduplication and systemic grouping.
 *
 * An inaccessible navigation component that appears on 200 pages is one
 * problem with a page count, not 200 report entries. Grouping happens on the
 * finding signature (rule + component-shaped selector), so the group survives
 * re-scans and can be tracked through remediation and retest.
 */
export function groupFindings(findings: Finding[]): GroupingResult {
  const bySignature = new Map<string, Finding[]>();
  for (const finding of findings) {
    bySignature.set(finding.signature, [...(bySignature.get(finding.signature) ?? []), finding]);
  }

  const groups: FindingGroup[] = [];
  const kept: Finding[] = [];

  for (const [signature, members] of bySignature) {
    const urls = new Set(members.map((m) => m.url));
    const pageTypes = [...new Set(members.map((m) => m.pageType))] as PageType[];
    const representative = pickRepresentative(members);
    const systemic = urls.size >= 2;

    const group: FindingGroup = {
      id: newId('grp'),
      scanId: representative.scanId,
      prospectId: representative.prospectId,
      signature,
      componentLabel: componentLabelFor(members),
      rule: representative.rule,
      severity: maxSeverity(members.map((m) => m.severity)),
      confidence: members.map((m) => m.confidence).sort((a, b) => CONFIDENCE_RANK[b] - CONFIDENCE_RANK[a])[0],
      affectedPageCount: urls.size,
      affectedPageTypes: pageTypes,
      instanceCount: members.length,
      representativeFindingId: representative.id,
      systemic,
      reviewStatus: 'unreviewed',
    };
    groups.push(group);

    // One finding per (signature, url) survives: enough to prove the problem on
    // each page without flooding the report with identical rows.
    const seenUrls = new Set<string>();
    for (const member of members) {
      member.groupId = group.id;
      if (member.id === representative.id || !seenUrls.has(member.url)) {
        seenUrls.add(member.url);
        kept.push(member);
      }
    }
  }

  return { findings: kept, groups };
}

function pickRepresentative(members: Finding[]): Finding {
  return [...members].sort((a, b) => {
    const confidence = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
    if (confidence !== 0) return confidence;
    const severity = severityRank(b.severity) - severityRank(a.severity);
    if (severity !== 0) return severity;
    return journeyWeight(b.pageType) - journeyWeight(a.pageType);
  })[0];
}

function journeyWeight(pageType: PageType): number {
  const weights: Partial<Record<PageType, number>> = {
    checkout_entry: 6,
    cart: 5,
    product: 4,
    category: 3,
    search: 3,
    account: 2,
    homepage: 1,
  };
  return weights[pageType] ?? 0;
}

function componentLabelFor(members: Finding[]): string {
  const labelled = members.find((m) => m.componentLabel);
  if (labelled?.componentLabel) return labelled.componentLabel;
  return ruleTitle(members[0].rule);
}

/** Groups worth putting in front of a prospect, best first. */
export function rankGroups(groups: FindingGroup[]): FindingGroup[] {
  return [...groups].sort((a, b) => {
    const severity = severityRank(b.severity) - severityRank(a.severity);
    if (severity !== 0) return severity;
    const confidence = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
    if (confidence !== 0) return confidence;
    return b.affectedPageCount - a.affectedPageCount;
  });
}
