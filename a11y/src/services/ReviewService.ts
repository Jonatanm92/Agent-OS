import type { Finding, FindingGroup, ReviewAction, ReviewDecision, Severity } from '../core/Types.js';
import type { Platform } from './Platform.js';

export interface ReviewInput {
  reviewer: string;
  action: ReviewAction;
  findingId?: string;
  groupId?: string;
  severity?: Severity;
  /** EDIT_DESCRIPTION may rewrite the customer-facing wording, never the evidence. */
  userImpact?: string;
  remediation?: string;
  observedBehaviour?: string;
  /** MERGE_DUPLICATES: findings folded into `findingId`'s group. */
  mergeFindingIds?: string[];
  note?: string;
}

export interface ReviewQueueItem {
  finding: Finding;
  group: FindingGroup | null;
  prospectDomain: string;
  prospectId: string;
}

/**
 * SYSTEM 6 — human review.
 *
 * Every decision is appended to the audit trail with the before/after values,
 * so we can always answer "who approved this claim, and what did it say when
 * they approved it?".
 */
export class ReviewService {
  constructor(private readonly platform: Platform) {}

  /** Findings worth a reviewer's attention, strongest first. */
  queue(options: { prospectId?: string; limit?: number; includeReviewed?: boolean } = {}): ReviewQueueItem[] {
    const { store, audits } = this.platform;
    const prospects = options.prospectId
      ? [store.getProspect(options.prospectId)].filter((p): p is NonNullable<typeof p> => Boolean(p))
      : store.listProspects({ limit: 100 }).filter((p) => ['QUALIFIED', 'MINI_AUDIT_READY', 'REVIEWED'].includes(p.salesStage));

    const items: ReviewQueueItem[] = [];
    for (const prospect of prospects) {
      const scan = audits.latestCompletedScan(prospect.id);
      if (!scan) continue;
      const groups = new Map(audits.listGroups(scan.id).map((g) => [g.id, g]));
      const seenGroups = new Set<string>();
      for (const finding of audits.listFindings(scan.id)) {
        if (!options.includeReviewed && finding.reviewStatus !== 'unreviewed') continue;
        // A reviewer's time goes to what could reach a customer.
        if (finding.severity === 'low' && finding.confidence !== 'REVIEW_REQUIRED') continue;
        const group = groups.get(finding.groupId ?? '') ?? null;
        // One decision per systemic component, not one per affected page.
        if (group?.systemic) {
          if (seenGroups.has(group.id)) continue;
          seenGroups.add(group.id);
        }
        items.push({ finding, group, prospectDomain: prospect.domain, prospectId: prospect.id });
      }
    }
    return items
      .sort((a, b) => rank(b.finding) - rank(a.finding))
      .slice(0, options.limit ?? 200);
  }

  apply(input: ReviewInput): { decision: ReviewDecision; finding: Finding | null; group: FindingGroup | null } {
    const { audits, store } = this.platform;
    const finding = input.findingId ? audits.getFinding(input.findingId) : null;
    const group = input.groupId ? audits.getGroup(input.groupId) : null;
    if (!finding && !group) throw new Error('A review decision needs a findingId or a groupId.');

    const before = finding
      ? { severity: finding.severity, confidence: finding.confidence, reviewStatus: finding.reviewStatus, userImpact: finding.userImpact }
      : group
        ? { severity: group.severity, reviewStatus: group.reviewStatus }
        : null;

    let after: Record<string, unknown> | null = null;

    /**
     * A decision on a systemic component applies to every page it affects.
     * Otherwise a reviewer would approve the same navigation bar six times.
     */
    const siblings = (): Finding[] => {
      if (!finding?.groupId) return [];
      const owningGroup = audits.getGroup(finding.groupId);
      if (!owningGroup?.systemic) return [];
      return audits.listFindingsByGroup(finding.groupId).filter((f) => f.id !== finding.id);
    };

    switch (input.action) {
      case 'APPROVE': {
        if (finding) {
          audits.updateFinding(finding.id, { reviewStatus: 'approved', reviewerNote: input.note ?? null });
          for (const sibling of siblings()) audits.updateFinding(sibling.id, { reviewStatus: 'approved', reviewerNote: input.note ?? null });
          if (finding.groupId) audits.updateGroup(finding.groupId, { reviewStatus: 'approved' });
        }
        if (group) audits.updateGroup(group.id, { reviewStatus: 'approved' });
        after = { reviewStatus: 'approved' };
        break;
      }
      case 'REJECT': {
        if (finding) {
          audits.updateFinding(finding.id, { reviewStatus: 'rejected', confidence: 'REJECTED', reviewerNote: input.note ?? null });
          for (const sibling of siblings()) audits.updateFinding(sibling.id, { reviewStatus: 'rejected', confidence: 'REJECTED', reviewerNote: input.note ?? null });
          if (finding.groupId) audits.updateGroup(finding.groupId, { reviewStatus: 'rejected', confidence: 'REJECTED' });
        }
        if (group) audits.updateGroup(group.id, { reviewStatus: 'rejected', confidence: 'REJECTED' });
        after = { reviewStatus: 'rejected', confidence: 'REJECTED' };
        break;
      }
      case 'CHANGE_SEVERITY': {
        if (!input.severity) throw new Error('CHANGE_SEVERITY needs a severity.');
        if (finding) {
          audits.updateFinding(finding.id, { severity: input.severity, reviewerNote: input.note ?? null });
          for (const sibling of siblings()) audits.updateFinding(sibling.id, { severity: input.severity });
          if (finding.groupId) audits.updateGroup(finding.groupId, { severity: input.severity });
        }
        if (group) audits.updateGroup(group.id, { severity: input.severity });
        after = { severity: input.severity };
        break;
      }
      case 'EDIT_DESCRIPTION': {
        if (!finding) throw new Error('EDIT_DESCRIPTION applies to a finding.');
        audits.updateFinding(finding.id, {
          userImpact: input.userImpact ?? finding.userImpact,
          remediation: input.remediation ?? finding.remediation,
          observedBehaviour: input.observedBehaviour ?? finding.observedBehaviour,
          reviewerNote: input.note ?? finding.reviewerNote,
        });
        after = { userImpact: input.userImpact, remediation: input.remediation, observedBehaviour: input.observedBehaviour };
        break;
      }
      case 'REQUEST_MANUAL_TEST':
        if (finding) audits.updateFinding(finding.id, { reviewStatus: 'manual_test_requested', confidence: 'REVIEW_REQUIRED', reviewerNote: input.note ?? null });
        if (group) audits.updateGroup(group.id, { reviewStatus: 'manual_test_requested' });
        after = { reviewStatus: 'manual_test_requested' };
        break;
      case 'CONFIRM_MANUAL_TEST':
        if (!finding) throw new Error('CONFIRM_MANUAL_TEST applies to a finding.');
        audits.updateFinding(finding.id, { reviewStatus: 'manual_test_confirmed', confidence: 'HIGH_CONFIDENCE', reviewerNote: input.note ?? null });
        after = { reviewStatus: 'manual_test_confirmed', confidence: 'HIGH_CONFIDENCE' };
        break;
      case 'MERGE_DUPLICATES': {
        if (!finding) throw new Error('MERGE_DUPLICATES needs the finding to merge into.');
        const targetGroupId = finding.groupId;
        if (!targetGroupId) throw new Error('The target finding is not part of a group.');
        const merged: string[] = [];
        for (const id of input.mergeFindingIds ?? []) {
          const duplicate = audits.getFinding(id);
          if (!duplicate || duplicate.id === finding.id) continue;
          audits.updateFinding(duplicate.id, { groupId: targetGroupId, reviewStatus: 'merged' });
          merged.push(duplicate.id);
        }
        const target = audits.getGroup(targetGroupId);
        if (target) {
          audits.updateGroup(targetGroupId, { instanceCount: target.instanceCount + merged.length });
        }
        after = { mergedInto: targetGroupId, merged };
        break;
      }
      default:
        throw new Error(`Unsupported review action: ${input.action}`);
    }

    const decision = audits.recordReview({
      findingId: finding?.id ?? null,
      groupId: group?.id ?? null,
      reviewer: input.reviewer,
      action: input.action,
      before,
      after,
      note: input.note ?? null,
    });

    const prospectId = finding?.prospectId ?? group?.prospectId;
    if (prospectId) {
      store.addTimelineEvent(prospectId, 'review_decision', `${input.reviewer}: ${input.action}`, {
        action: input.action,
        findingId: finding?.id ?? null,
        groupId: group?.id ?? null,
        note: input.note ?? null,
      });
    }

    return {
      decision,
      finding: finding ? audits.getFinding(finding.id) : null,
      group: group ? audits.getGroup(group.id) : null,
    };
  }

  /** Mark a prospect's mini audit as reviewed and ready to send. */
  signOff(prospectId: string, reviewer: string, note?: string): void {
    const { store } = this.platform;
    store.setStage(prospectId, 'READY_FOR_OUTREACH', 'Generate outreach from the approved findings and send it.', note);
    store.addTimelineEvent(prospectId, 'review_decision', `${reviewer} signed off the mini audit`, { note: note ?? null });
  }

  auditTrail(findingId?: string, groupId?: string): ReviewDecision[] {
    return this.platform.audits.listReviews({ findingId, groupId });
  }
}

function rank(finding: Finding): number {
  const severity = { critical: 4, high: 3, medium: 2, low: 1 }[finding.severity];
  const confidence = finding.confidence === 'CONFIRMED_AUTOMATED' ? 3 : finding.confidence === 'HIGH_CONFIDENCE' ? 2 : 1;
  return severity * 10 + confidence * 3 + (finding.screenshotKey ? 2 : 0);
}
