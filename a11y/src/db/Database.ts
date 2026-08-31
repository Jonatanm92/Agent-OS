import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agencies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  branding TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  agency_id TEXT REFERENCES agencies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients(id),
  domain TEXT NOT NULL UNIQUE,
  label TEXT,
  monitoring_enabled INTEGER NOT NULL DEFAULT 0,
  monitoring_interval_days INTEGER NOT NULL DEFAULT 30,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prospects (
  id TEXT PRIMARY KEY,
  company_name TEXT,
  domain TEXT NOT NULL UNIQUE,
  country TEXT NOT NULL DEFAULT 'SE',
  ecommerce_detected INTEGER,
  ecommerce_platform TEXT NOT NULL DEFAULT 'unknown',
  cms TEXT NOT NULL DEFAULT 'unknown',
  industry TEXT,
  size_bucket TEXT NOT NULL DEFAULT 'unknown',
  contact_channels TEXT NOT NULL DEFAULT '[]',
  agency_attribution TEXT,
  scan_status TEXT NOT NULL DEFAULT 'not_scanned',
  qualification_status TEXT NOT NULL DEFAULT 'pending',
  issue_summary TEXT,
  lead_score REAL NOT NULL DEFAULT 0,
  evidence_score REAL NOT NULL DEFAULT 0,
  outreach_status TEXT NOT NULL DEFAULT 'none',
  sales_stage TEXT NOT NULL DEFAULT 'DISCOVERED',
  next_action TEXT NOT NULL DEFAULT 'Scan the site',
  notes TEXT,
  site_id TEXT REFERENCES sites(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provenance (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT NOT NULL,
  method TEXT NOT NULL,
  confidence TEXT NOT NULL,
  observed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_provenance_entity ON provenance(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id),
  kind TEXT NOT NULL DEFAULT 'initial',
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error TEXT,
  journey TEXT NOT NULL DEFAULT '[]',
  robots TEXT,
  consent TEXT,
  pages_tested INTEGER NOT NULL DEFAULT 0,
  baseline_scan_id TEXT REFERENCES scans(id)
);
CREATE INDEX IF NOT EXISTS idx_scans_prospect ON scans(prospect_id);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES scans(id),
  prospect_id TEXT NOT NULL REFERENCES prospects(id),
  group_id TEXT,
  url TEXT NOT NULL,
  page_type TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  rule TEXT NOT NULL,
  wcag TEXT NOT NULL DEFAULT '[]',
  severity TEXT NOT NULL,
  confidence TEXT NOT NULL,
  selector TEXT NOT NULL,
  html TEXT NOT NULL,
  screenshot_key TEXT,
  reproduction TEXT NOT NULL DEFAULT '[]',
  keyboard_reproduction TEXT NOT NULL DEFAULT '[]',
  expected_behaviour TEXT NOT NULL DEFAULT '',
  observed_behaviour TEXT NOT NULL DEFAULT '',
  user_impact TEXT NOT NULL DEFAULT '',
  remediation TEXT NOT NULL DEFAULT '',
  source_engine TEXT NOT NULL,
  raw TEXT NOT NULL DEFAULT '{}',
  review_status TEXT NOT NULL DEFAULT 'unreviewed',
  reviewer_note TEXT,
  signature TEXT NOT NULL,
  component_label TEXT,
  third_party TEXT
);
CREATE INDEX IF NOT EXISTS idx_findings_scan ON findings(scan_id);
CREATE INDEX IF NOT EXISTS idx_findings_prospect ON findings(prospect_id);
CREATE INDEX IF NOT EXISTS idx_findings_signature ON findings(prospect_id, signature);

CREATE TABLE IF NOT EXISTS finding_groups (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES scans(id),
  prospect_id TEXT NOT NULL REFERENCES prospects(id),
  signature TEXT NOT NULL,
  rule TEXT NOT NULL,
  component_label TEXT NOT NULL,
  severity TEXT NOT NULL,
  confidence TEXT NOT NULL,
  affected_page_count INTEGER NOT NULL,
  affected_page_types TEXT NOT NULL DEFAULT '[]',
  instance_count INTEGER NOT NULL,
  representative_finding_id TEXT NOT NULL,
  systemic INTEGER NOT NULL DEFAULT 0,
  review_status TEXT NOT NULL DEFAULT 'unreviewed'
);
CREATE INDEX IF NOT EXISTS idx_groups_scan ON finding_groups(scan_id);

CREATE TABLE IF NOT EXISTS review_decisions (
  id TEXT PRIMARY KEY,
  finding_id TEXT,
  group_id TEXT,
  reviewer TEXT NOT NULL,
  action TEXT NOT NULL,
  before TEXT,
  after TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_finding ON review_decisions(finding_id);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id),
  scan_id TEXT NOT NULL REFERENCES scans(id),
  level TEXT NOT NULL,
  html_key TEXT,
  json_key TEXT,
  pdf_key TEXT,
  finding_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_prospect ON reports(prospect_id);

CREATE TABLE IF NOT EXISTS retests (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id),
  baseline_finding_id TEXT NOT NULL,
  retest_scan_id TEXT NOT NULL REFERENCES scans(id),
  outcome TEXT NOT NULL,
  before_evidence_key TEXT,
  after_evidence_key TEXT,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL,
  type TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_timeline_prospect ON timeline_events(prospect_id, at);
CREATE INDEX IF NOT EXISTS idx_timeline_type ON timeline_events(type);

CREATE TABLE IF NOT EXISTS outreach_drafts (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id),
  channel TEXT NOT NULL,
  to_value TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  cited_finding_ids TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'drafted',
  reviewer_note TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_outreach_prospect ON outreach_drafts(prospect_id);

CREATE TABLE IF NOT EXISTS suppressions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(kind, value)
);

CREATE TABLE IF NOT EXISTS revenue_records (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id),
  kind TEXT NOT NULL,
  amount_sek REAL NOT NULL,
  note TEXT,
  recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_costs (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id),
  scan_id TEXT,
  delivery_hours REAL NOT NULL DEFAULT 0,
  compute_cost_sek REAL NOT NULL DEFAULT 0,
  note TEXT,
  recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 2,
  run_after TEXT NOT NULL,
  locked_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, run_after);
`;

export interface OpenOptions {
  dataDir: string;
  /** ":memory:" is used by the test suite. */
  filename?: string;
}

/**
 * Columns added after the first release. `CREATE TABLE IF NOT EXISTS` does not
 * touch an existing table, so new columns are applied here — a database created
 * before the column existed keeps its data and gains the column.
 */
const ADDED_COLUMNS: { table: string; column: string; definition: string }[] = [
  { table: 'scans', column: 'consent', definition: 'TEXT' },
  { table: 'findings', column: 'third_party', definition: 'TEXT' },
];

function applyMigrations(db: Db): void {
  for (const { table, column, definition } of ADDED_COLUMNS) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (columns.some((c) => c.name === column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function openDatabase({ dataDir, filename }: OpenOptions): Db {
  const target = filename ?? join(dataDir, 'a11y.db');
  if (target !== ':memory:') mkdirSync(dirname(target), { recursive: true });
  const db = new Database(target);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  applyMigrations(db);
  return db;
}
