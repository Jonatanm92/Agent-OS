import type { Db } from './Database.js';
import { newId, nowIso, normalizeDomain } from '../core/Ids.js';
import * as map from './Rows.js';
import type {
  Agency,
  Client,
  ContactChannel,
  OutreachDraft,
  Prospect,
  Provenance,
  SalesStage,
  Site,
  Suppression,
  TimelineEvent,
  TimelineEventType,
} from '../core/Types.js';

export interface ProspectInput {
  domain: string;
  companyName?: string | null;
  country?: Prospect['country'];
  industry?: string | null;
  notes?: string | null;
}

/**
 * Prospect, agency-hierarchy, timeline, outreach and commercial records.
 *
 * Company facts are only ever written together with provenance — see
 * `setProspectFacts`. Nothing here invents a value; callers pass what they
 * observed and where they observed it.
 */
export class Store {
  constructor(private readonly db: Db) {}

  // ---------------------------------------------------------------- prospects

  upsertProspect(input: ProspectInput): Prospect {
    const domain = normalizeDomain(input.domain);
    const existing = this.findProspectByDomain(domain);
    const ts = nowIso();
    if (existing) {
      this.db
        .prepare(
          `UPDATE prospects SET company_name = COALESCE(?, company_name),
             industry = COALESCE(?, industry), notes = COALESCE(?, notes), updated_at = ?
           WHERE id = ?`,
        )
        .run(input.companyName ?? null, input.industry ?? null, input.notes ?? null, ts, existing.id);
      return this.getProspect(existing.id)!;
    }
    const id = newId('pro');
    this.db
      .prepare(
        `INSERT INTO prospects (id, company_name, domain, country, industry, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.companyName ?? null, domain, input.country ?? 'SE', input.industry ?? null, input.notes ?? null, ts, ts);
    this.addTimelineEvent(id, 'prospect_discovered', `Domain ${domain} added to the prospect database`, {
      domain,
    });
    return this.getProspect(id)!;
  }

  getProspect(id: string): Prospect | null {
    const row = this.db.prepare('SELECT * FROM prospects WHERE id = ?').get(id);
    return row ? map.toProspect(row as any) : null;
  }

  findProspectByDomain(domain: string): Prospect | null {
    const row = this.db.prepare('SELECT * FROM prospects WHERE domain = ?').get(normalizeDomain(domain));
    return row ? map.toProspect(row as any) : null;
  }

  listProspects(filter: { stage?: SalesStage; limit?: number; orderBy?: 'lead_score' | 'updated_at' } = {}): Prospect[] {
    const order = filter.orderBy === 'updated_at' ? 'updated_at DESC' : 'lead_score DESC, evidence_score DESC';
    const rows = filter.stage
      ? this.db.prepare(`SELECT * FROM prospects WHERE sales_stage = ? ORDER BY ${order} LIMIT ?`).all(filter.stage, filter.limit ?? 200)
      : this.db.prepare(`SELECT * FROM prospects ORDER BY ${order} LIMIT ?`).all(filter.limit ?? 200);
    return (rows as any[]).map(map.toProspect);
  }

  /**
   * Write observed company facts plus their provenance in one transaction.
   * Undefined fields are left untouched — a scan that could not establish the
   * platform must not overwrite a value a human entered.
   */
  setProspectFacts(
    id: string,
    facts: Partial<
      Pick<
        Prospect,
        | 'companyName'
        | 'ecommerceDetected'
        | 'ecommercePlatform'
        | 'cms'
        | 'industry'
        | 'sizeBucket'
        | 'contactChannels'
        | 'agencyAttribution'
        | 'issueSummary'
        | 'leadScore'
        | 'evidenceScore'
        | 'scanStatus'
        | 'qualificationStatus'
        | 'outreachStatus'
        | 'notes'
        | 'siteId'
      >
    >,
    provenance: { source: string; method: string; confidence: Provenance['confidence'] } | null = null,
  ): Prospect | null {
    const columns: Record<string, unknown> = {};
    const setIf = (key: string, value: unknown) => {
      if (value !== undefined) columns[key] = value;
    };
    setIf('company_name', facts.companyName);
    setIf('ecommerce_detected', facts.ecommerceDetected === undefined ? undefined : facts.ecommerceDetected ? 1 : 0);
    setIf('ecommerce_platform', facts.ecommercePlatform);
    setIf('cms', facts.cms);
    setIf('industry', facts.industry);
    setIf('size_bucket', facts.sizeBucket);
    setIf('contact_channels', facts.contactChannels ? JSON.stringify(facts.contactChannels) : undefined);
    setIf('agency_attribution', facts.agencyAttribution);
    setIf('issue_summary', facts.issueSummary);
    setIf('lead_score', facts.leadScore);
    setIf('evidence_score', facts.evidenceScore);
    setIf('scan_status', facts.scanStatus);
    setIf('qualification_status', facts.qualificationStatus);
    setIf('outreach_status', facts.outreachStatus);
    setIf('notes', facts.notes);
    setIf('site_id', facts.siteId);
    const keys = Object.keys(columns);
    if (keys.length === 0) return this.getProspect(id);

    const assignments = keys.map((k) => `${k} = ?`).join(', ');
    this.db
      .prepare(`UPDATE prospects SET ${assignments}, updated_at = ? WHERE id = ?`)
      .run(...keys.map((k) => columns[k] as any), nowIso(), id);

    if (provenance) {
      for (const key of keys) {
        if (['lead_score', 'evidence_score', 'scan_status', 'qualification_status', 'outreach_status'].includes(key)) continue;
        this.recordProvenance({
          entityType: 'prospect',
          entityId: id,
          field: key,
          value: String(columns[key] ?? ''),
          ...provenance,
        });
      }
    }
    return this.getProspect(id);
  }

  setStage(id: string, stage: SalesStage, nextAction: string, note?: string): Prospect | null {
    const before = this.getProspect(id);
    if (!before) return null;
    this.db
      .prepare('UPDATE prospects SET sales_stage = ?, next_action = ?, updated_at = ? WHERE id = ?')
      .run(stage, nextAction, nowIso(), id);
    if (before.salesStage !== stage) {
      this.addTimelineEvent(id, 'stage_changed', `${before.salesStage} → ${stage}`, {
        from: before.salesStage,
        to: stage,
        nextAction,
        note: note ?? null,
      });
    }
    return this.getProspect(id);
  }

  // --------------------------------------------------------------- provenance

  recordProvenance(input: Omit<Provenance, 'id' | 'observedAt'> & { observedAt?: string }): Provenance {
    const id = newId('prv');
    const observedAt = input.observedAt ?? nowIso();
    this.db
      .prepare(
        `INSERT INTO provenance (id, entity_type, entity_id, field, value, source, method, confidence, observed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.entityType, input.entityId, input.field, input.value, input.source, input.method, input.confidence, observedAt);
    return { id, observedAt, ...input };
  }

  listProvenance(entityType: string, entityId: string): Provenance[] {
    const rows = this.db
      .prepare('SELECT * FROM provenance WHERE entity_type = ? AND entity_id = ? ORDER BY observed_at DESC')
      .all(entityType, entityId) as any[];
    return rows.map((r) => ({
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      field: r.field,
      value: r.value,
      source: r.source,
      method: r.method,
      confidence: r.confidence,
      observedAt: r.observed_at,
    }));
  }

  // ----------------------------------------------------------------- timeline

  addTimelineEvent(
    prospectId: string,
    type: TimelineEventType,
    summary: string,
    payload: Record<string, unknown> = {},
  ): TimelineEvent {
    const id = newId('evt');
    const at = nowIso();
    this.db
      .prepare('INSERT INTO timeline_events (id, prospect_id, type, summary, payload, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, prospectId, type, summary, JSON.stringify(payload), at);
    return { id, prospectId, type, summary, payload, at };
  }

  listTimeline(prospectId: string): TimelineEvent[] {
    const rows = this.db.prepare('SELECT * FROM timeline_events WHERE prospect_id = ? ORDER BY at ASC').all(prospectId) as any[];
    return rows.map(map.toTimelineEvent);
  }

  countEvents(type: TimelineEventType): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM timeline_events WHERE type = ?').get(type) as any;
    return row.n as number;
  }

  countProspectsWithEvent(type: TimelineEventType): number {
    const row = this.db
      .prepare('SELECT COUNT(DISTINCT prospect_id) AS n FROM timeline_events WHERE type = ?')
      .get(type) as any;
    return row.n as number;
  }

  // ----------------------------------------------------------------- outreach

  createOutreachDraft(draft: Omit<OutreachDraft, 'id' | 'createdAt' | 'sentAt' | 'status' | 'reviewerNote'>): OutreachDraft {
    const id = newId('out');
    const createdAt = nowIso();
    this.db
      .prepare(
        `INSERT INTO outreach_drafts (id, prospect_id, channel, to_value, subject, body, cited_finding_ids, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'drafted', ?)`,
      )
      .run(id, draft.prospectId, draft.channel, draft.toValue, draft.subject, draft.body, JSON.stringify(draft.citedFindingIds), createdAt);
    return this.getOutreachDraft(id)!;
  }

  getOutreachDraft(id: string): OutreachDraft | null {
    const row = this.db.prepare('SELECT * FROM outreach_drafts WHERE id = ?').get(id);
    return row ? map.toOutreach(row as any) : null;
  }

  listOutreachDrafts(filter: { prospectId?: string; status?: OutreachDraft['status'] } = {}): OutreachDraft[] {
    const clauses: string[] = [];
    const args: unknown[] = [];
    if (filter.prospectId) {
      clauses.push('prospect_id = ?');
      args.push(filter.prospectId);
    }
    if (filter.status) {
      clauses.push('status = ?');
      args.push(filter.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`SELECT * FROM outreach_drafts ${where} ORDER BY created_at DESC`).all(...(args as any[])) as any[];
    return rows.map(map.toOutreach);
  }

  setOutreachStatus(id: string, status: OutreachDraft['status'], reviewerNote?: string): OutreachDraft | null {
    const sentAt = status === 'sent' ? nowIso() : null;
    this.db
      .prepare('UPDATE outreach_drafts SET status = ?, reviewer_note = COALESCE(?, reviewer_note), sent_at = COALESCE(?, sent_at) WHERE id = ?')
      .run(status, reviewerNote ?? null, sentAt, id);
    return this.getOutreachDraft(id);
  }

  // -------------------------------------------------------------- suppression

  addSuppression(kind: Suppression['kind'], value: string, reason: string): Suppression {
    const id = newId('sup');
    const createdAt = nowIso();
    const normalized = kind === 'domain' ? normalizeDomain(value) : value.trim().toLowerCase();
    this.db
      .prepare('INSERT OR IGNORE INTO suppressions (id, kind, value, reason, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, kind, normalized, reason, createdAt);
    const row = this.db.prepare('SELECT * FROM suppressions WHERE kind = ? AND value = ?').get(kind, normalized);
    return map.toSuppression(row as any);
  }

  isSuppressed(kind: Suppression['kind'], value: string): boolean {
    const normalized = kind === 'domain' ? normalizeDomain(value) : value.trim().toLowerCase();
    const row = this.db.prepare('SELECT 1 FROM suppressions WHERE kind = ? AND value = ?').get(kind, normalized);
    return Boolean(row);
  }

  listSuppressions(): Suppression[] {
    return (this.db.prepare('SELECT * FROM suppressions ORDER BY created_at DESC').all() as any[]).map(map.toSuppression);
  }

  // --------------------------------------------------- agency / client / site

  createAgency(name: string, slug: string, branding: Agency['branding'] = {}): Agency {
    const id = newId('agy');
    this.db
      .prepare('INSERT INTO agencies (id, name, slug, branding, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, name, slug, JSON.stringify(branding), nowIso());
    return map.toAgency(this.db.prepare('SELECT * FROM agencies WHERE id = ?').get(id) as any);
  }

  getAgencyBySlug(slug: string): Agency | null {
    const row = this.db.prepare('SELECT * FROM agencies WHERE slug = ?').get(slug);
    return row ? map.toAgency(row as any) : null;
  }

  createClient(name: string, agencyId: string | null = null): Client {
    const id = newId('cli');
    this.db.prepare('INSERT INTO clients (id, agency_id, name, created_at) VALUES (?, ?, ?, ?)').run(id, agencyId, name, nowIso());
    return map.toClient(this.db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as any);
  }

  upsertSite(domain: string, options: { clientId?: string | null; label?: string | null; monitoringEnabled?: boolean; monitoringIntervalDays?: number } = {}): Site {
    const normalized = normalizeDomain(domain);
    const existing = this.db.prepare('SELECT * FROM sites WHERE domain = ?').get(normalized) as any;
    if (existing) {
      this.db
        .prepare(
          `UPDATE sites SET client_id = COALESCE(?, client_id), label = COALESCE(?, label),
             monitoring_enabled = COALESCE(?, monitoring_enabled),
             monitoring_interval_days = COALESCE(?, monitoring_interval_days) WHERE id = ?`,
        )
        .run(
          options.clientId ?? null,
          options.label ?? null,
          options.monitoringEnabled === undefined ? null : options.monitoringEnabled ? 1 : 0,
          options.monitoringIntervalDays ?? null,
          existing.id,
        );
      return map.toSite(this.db.prepare('SELECT * FROM sites WHERE id = ?').get(existing.id) as any);
    }
    const id = newId('sit');
    this.db
      .prepare(
        `INSERT INTO sites (id, client_id, domain, label, monitoring_enabled, monitoring_interval_days, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        options.clientId ?? null,
        normalized,
        options.label ?? null,
        options.monitoringEnabled ? 1 : 0,
        options.monitoringIntervalDays ?? 30,
        nowIso(),
      );
    return map.toSite(this.db.prepare('SELECT * FROM sites WHERE id = ?').get(id) as any);
  }

  listMonitoredSites(): Site[] {
    return (this.db.prepare('SELECT * FROM sites WHERE monitoring_enabled = 1').all() as any[]).map(map.toSite);
  }

  // ------------------------------------------------------------ commercials

  recordRevenue(prospectId: string, kind: 'audit' | 'remediation' | 'monitoring_mrr', amountSek: number, note?: string): void {
    this.db
      .prepare('INSERT INTO revenue_records (id, prospect_id, kind, amount_sek, note, recorded_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(newId('rev'), prospectId, kind, amountSek, note ?? null, nowIso());
    this.addTimelineEvent(prospectId, 'revenue_recorded', `${kind} ${amountSek} SEK`, { kind, amountSek });
  }

  recordDeliveryCost(input: { prospectId: string; scanId?: string | null; deliveryHours?: number; computeCostSek?: number; note?: string }): void {
    this.db
      .prepare(
        'INSERT INTO delivery_costs (id, prospect_id, scan_id, delivery_hours, compute_cost_sek, note, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        newId('cst'),
        input.prospectId,
        input.scanId ?? null,
        input.deliveryHours ?? 0,
        input.computeCostSek ?? 0,
        input.note ?? null,
        nowIso(),
      );
  }

  contactChannelsFor(prospectId: string): ContactChannel[] {
    return this.getProspect(prospectId)?.contactChannels ?? [];
  }
}
