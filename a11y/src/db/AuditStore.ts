import type { Db } from './Database.js';
import { newId, nowIso } from '../core/Ids.js';
import * as map from './Rows.js';
import type {
  ConsentDecision,
  Finding,
  FindingGroup,
  JourneyStep,
  ReportLevel,
  ReportRecord,
  RetestResult,
  ReviewDecision,
  RobotsDecision,
  Scan,
  ScanKind,
} from '../core/Types.js';

/** Scans, findings, systemic groups, reviewer audit trail, reports and retests. */
export class AuditStore {
  constructor(private readonly db: Db) {}

  // -------------------------------------------------------------------- scans

  createScan(prospectId: string, kind: ScanKind = 'initial', baselineScanId: string | null = null): Scan {
    const id = newId('scn');
    this.db
      .prepare('INSERT INTO scans (id, prospect_id, kind, status, started_at, baseline_scan_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, prospectId, kind, 'running', nowIso(), baselineScanId);
    return this.getScan(id)!;
  }

  finishScan(
    id: string,
    update: {
      status: Scan['status'];
      journey?: JourneyStep[];
      robots?: RobotsDecision | null;
      consent?: ConsentDecision | null;
      pagesTested?: number;
      error?: string | null;
    },
  ): Scan | null {
    this.db
      .prepare(
        `UPDATE scans SET status = ?, finished_at = ?, journey = COALESCE(?, journey), robots = COALESCE(?, robots),
           consent = COALESCE(?, consent), pages_tested = COALESCE(?, pages_tested), error = ? WHERE id = ?`,
      )
      .run(
        update.status,
        nowIso(),
        update.journey ? JSON.stringify(update.journey) : null,
        update.robots ? JSON.stringify(update.robots) : null,
        update.consent ? JSON.stringify(update.consent) : null,
        update.pagesTested ?? null,
        update.error ?? null,
        id,
      );
    return this.getScan(id);
  }

  getScan(id: string): Scan | null {
    const row = this.db.prepare('SELECT * FROM scans WHERE id = ?').get(id);
    return row ? map.toScan(row as any) : null;
  }

  latestScan(prospectId: string, kind?: ScanKind): Scan | null {
    const row = kind
      ? this.db.prepare('SELECT * FROM scans WHERE prospect_id = ? AND kind = ? ORDER BY started_at DESC LIMIT 1').get(prospectId, kind)
      : this.db.prepare('SELECT * FROM scans WHERE prospect_id = ? ORDER BY started_at DESC LIMIT 1').get(prospectId);
    return row ? map.toScan(row as any) : null;
  }

  latestCompletedScan(prospectId: string): Scan | null {
    const row = this.db
      .prepare("SELECT * FROM scans WHERE prospect_id = ? AND status = 'completed' ORDER BY started_at DESC LIMIT 1")
      .get(prospectId);
    return row ? map.toScan(row as any) : null;
  }

  listScans(prospectId: string): Scan[] {
    return (this.db.prepare('SELECT * FROM scans WHERE prospect_id = ? ORDER BY started_at DESC').all(prospectId) as any[]).map(map.toScan);
  }

  // ----------------------------------------------------------------- findings

  insertFindings(findings: Finding[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO findings (id, scan_id, prospect_id, group_id, url, page_type, detected_at, rule, wcag, severity,
         confidence, selector, html, screenshot_key, reproduction, keyboard_reproduction, expected_behaviour,
         observed_behaviour, user_impact, remediation, source_engine, raw, review_status, reviewer_note, signature, component_label, third_party)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const tx = this.db.transaction((batch: Finding[]) => {
      for (const f of batch) {
        stmt.run(
          f.id,
          f.scanId,
          f.prospectId,
          f.groupId,
          f.url,
          f.pageType,
          f.detectedAt,
          f.rule,
          JSON.stringify(f.wcag),
          f.severity,
          f.confidence,
          f.selector,
          f.html,
          f.screenshotKey,
          JSON.stringify(f.reproduction),
          JSON.stringify(f.keyboardReproduction),
          f.expectedBehaviour,
          f.observedBehaviour,
          f.userImpact,
          f.remediation,
          f.sourceEngine,
          JSON.stringify(f.raw ?? {}),
          f.reviewStatus,
          f.reviewerNote,
          f.signature,
          f.componentLabel,
          f.thirdParty,
        );
      }
    });
    tx(findings);
  }

  getFinding(id: string): Finding | null {
    const row = this.db.prepare('SELECT * FROM findings WHERE id = ?').get(id);
    return row ? map.toFinding(row as any) : null;
  }

  listFindings(scanId: string): Finding[] {
    return (this.db.prepare('SELECT * FROM findings WHERE scan_id = ?').all(scanId) as any[]).map(map.toFinding);
  }

  listFindingsByGroup(groupId: string): Finding[] {
    return (this.db.prepare('SELECT * FROM findings WHERE group_id = ?').all(groupId) as any[]).map(map.toFinding);
  }

  listFindingsForProspect(prospectId: string): Finding[] {
    return (
      this.db.prepare('SELECT * FROM findings WHERE prospect_id = ? ORDER BY detected_at DESC').all(prospectId) as any[]
    ).map(map.toFinding);
  }

  updateFinding(id: string, patch: Partial<Pick<Finding, 'severity' | 'confidence' | 'reviewStatus' | 'reviewerNote' | 'userImpact' | 'remediation' | 'observedBehaviour' | 'groupId'>>): Finding | null {
    const columns: Record<string, unknown> = {};
    if (patch.severity !== undefined) columns.severity = patch.severity;
    if (patch.confidence !== undefined) columns.confidence = patch.confidence;
    if (patch.reviewStatus !== undefined) columns.review_status = patch.reviewStatus;
    if (patch.reviewerNote !== undefined) columns.reviewer_note = patch.reviewerNote;
    if (patch.userImpact !== undefined) columns.user_impact = patch.userImpact;
    if (patch.remediation !== undefined) columns.remediation = patch.remediation;
    if (patch.observedBehaviour !== undefined) columns.observed_behaviour = patch.observedBehaviour;
    if (patch.groupId !== undefined) columns.group_id = patch.groupId;
    const keys = Object.keys(columns);
    if (!keys.length) return this.getFinding(id);
    this.db
      .prepare(`UPDATE findings SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
      .run(...keys.map((k) => columns[k] as any), id);
    return this.getFinding(id);
  }

  // ------------------------------------------------------------------- groups

  insertGroups(groups: FindingGroup[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO finding_groups (id, scan_id, prospect_id, signature, rule, component_label, severity, confidence,
         affected_page_count, affected_page_types, instance_count, representative_finding_id, systemic, review_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const tx = this.db.transaction((batch: FindingGroup[]) => {
      for (const g of batch) {
        stmt.run(
          g.id,
          g.scanId,
          g.prospectId,
          g.signature,
          g.rule,
          g.componentLabel,
          g.severity,
          g.confidence,
          g.affectedPageCount,
          JSON.stringify(g.affectedPageTypes),
          g.instanceCount,
          g.representativeFindingId,
          g.systemic ? 1 : 0,
          g.reviewStatus,
        );
      }
    });
    tx(groups);
  }

  getGroup(id: string): FindingGroup | null {
    const row = this.db.prepare('SELECT * FROM finding_groups WHERE id = ?').get(id);
    return row ? map.toGroup(row as any) : null;
  }

  listGroups(scanId: string): FindingGroup[] {
    return (this.db.prepare('SELECT * FROM finding_groups WHERE scan_id = ?').all(scanId) as any[]).map(map.toGroup);
  }

  updateGroup(id: string, patch: Partial<Pick<FindingGroup, 'severity' | 'confidence' | 'reviewStatus' | 'componentLabel' | 'affectedPageCount' | 'instanceCount'>>): FindingGroup | null {
    const columns: Record<string, unknown> = {};
    if (patch.severity !== undefined) columns.severity = patch.severity;
    if (patch.confidence !== undefined) columns.confidence = patch.confidence;
    if (patch.reviewStatus !== undefined) columns.review_status = patch.reviewStatus;
    if (patch.componentLabel !== undefined) columns.component_label = patch.componentLabel;
    if (patch.affectedPageCount !== undefined) columns.affected_page_count = patch.affectedPageCount;
    if (patch.instanceCount !== undefined) columns.instance_count = patch.instanceCount;
    const keys = Object.keys(columns);
    if (!keys.length) return this.getGroup(id);
    this.db
      .prepare(`UPDATE finding_groups SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
      .run(...keys.map((k) => columns[k] as any), id);
    return this.getGroup(id);
  }

  // ------------------------------------------------------------ review trail

  recordReview(decision: Omit<ReviewDecision, 'id' | 'createdAt'>): ReviewDecision {
    const id = newId('rvw');
    const createdAt = nowIso();
    this.db
      .prepare(
        `INSERT INTO review_decisions (id, finding_id, group_id, reviewer, action, before, after, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        decision.findingId,
        decision.groupId,
        decision.reviewer,
        decision.action,
        decision.before ? JSON.stringify(decision.before) : null,
        decision.after ? JSON.stringify(decision.after) : null,
        decision.note,
        createdAt,
      );
    return { id, createdAt, ...decision };
  }

  listReviews(filter: { findingId?: string; groupId?: string } = {}): ReviewDecision[] {
    if (filter.findingId) {
      return (this.db.prepare('SELECT * FROM review_decisions WHERE finding_id = ? ORDER BY created_at').all(filter.findingId) as any[]).map(map.toReview);
    }
    if (filter.groupId) {
      return (this.db.prepare('SELECT * FROM review_decisions WHERE group_id = ? ORDER BY created_at').all(filter.groupId) as any[]).map(map.toReview);
    }
    return (this.db.prepare('SELECT * FROM review_decisions ORDER BY created_at DESC LIMIT 500').all() as any[]).map(map.toReview);
  }

  // ------------------------------------------------------------------ reports

  recordReport(input: Omit<ReportRecord, 'id' | 'createdAt'>): ReportRecord {
    const id = newId('rep');
    const createdAt = nowIso();
    this.db
      .prepare(
        `INSERT INTO reports (id, prospect_id, scan_id, level, html_key, json_key, pdf_key, finding_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.prospectId, input.scanId, input.level, input.htmlKey, input.jsonKey, input.pdfKey, input.findingCount, createdAt);
    return { id, createdAt, ...input };
  }

  listReports(prospectId: string, level?: ReportLevel): ReportRecord[] {
    const rows = level
      ? this.db.prepare('SELECT * FROM reports WHERE prospect_id = ? AND level = ? ORDER BY created_at DESC').all(prospectId, level)
      : this.db.prepare('SELECT * FROM reports WHERE prospect_id = ? ORDER BY created_at DESC').all(prospectId);
    return (rows as any[]).map(map.toReport);
  }

  countReports(level: ReportLevel): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM reports WHERE level = ?').get(level) as any).n as number;
  }

  // ------------------------------------------------------------------ retests

  recordRetest(input: Omit<RetestResult, 'id' | 'createdAt'>): RetestResult {
    const id = newId('rts');
    const createdAt = nowIso();
    this.db
      .prepare(
        `INSERT INTO retests (id, prospect_id, baseline_finding_id, retest_scan_id, outcome, before_evidence_key, after_evidence_key, detail, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.prospectId,
        input.baselineFindingId,
        input.retestScanId,
        input.outcome,
        input.beforeEvidenceKey,
        input.afterEvidenceKey,
        input.detail,
        createdAt,
      );
    return { id, createdAt, ...input };
  }

  listRetests(prospectId: string): RetestResult[] {
    return (this.db.prepare('SELECT * FROM retests WHERE prospect_id = ? ORDER BY created_at DESC').all(prospectId) as any[]).map(map.toRetest);
  }
}
