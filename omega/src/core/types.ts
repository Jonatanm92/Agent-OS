/**
 * Shared domain types for OMEGA.
 *
 * Everything that is persisted lives in these shapes. Keep them JSON-serialisable:
 * no Dates, Maps or class instances — timestamps are ISO strings.
 */

export type MissionState =
  | 'received' // created, not yet started
  | 'blocked' // waiting for a manual approval gate (e.g. paid agent spend)
  | 'running' // stages are being executed by the worker
  | 'awaiting_review' // all stages done; waiting for the human's final review
  | 'approved' // human accepted the result
  | 'rejected' // human rejected the result
  | 'failed' // a stage failed and no retries remain
  | 'cancelled';

export type TaskState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type ApprovalState = 'pending' | 'approved' | 'rejected';

export type ApprovalKind = 'spend_gate' | 'final_review';

export type EngineId = 'template' | 'claude-code';

export type RoleId =
  | 'product'
  | 'research'
  | 'architect'
  | 'test-author'
  | 'coder'
  | 'tester'
  | 'security'
  | 'docs';

export interface Evidence {
  /** Logical name, unique within a mission (e.g. "test-report-1.json"). */
  name: string;
  kind: 'spec' | 'agent-transcript' | 'test-log' | 'test-report' | 'security-report' | 'doc' | 'manifest';
  /** Path relative to the mission's artifact directory. */
  path: string;
  sha256: string;
  bytes: number;
  summary: string;
}

export interface StageRecord {
  taskId: string;
  role: RoleId;
  iteration: number;
  state: TaskState;
  startedAt?: string;
  finishedAt?: string;
  summary?: string;
  error?: string;
  costUsd: number;
  commit?: string;
  changedFiles?: string[];
  evidence: Evidence[];
}

export interface AcceptanceCriterion {
  id: string; // "AC1"
  text: string;
}

export interface ExportSpec {
  name: string;
  signature: string;
  description: string;
}

export interface Spec {
  title: string;
  slug: string;
  summary: string;
  requirements: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  module: { path: string; exports: ExportSpec[] };
  cli?: { path: string; usage: string; examples: string[] };
  outOfScope: string[];
}

export interface TestSummary {
  runId: number;
  ok: boolean;
  tests: number;
  pass: number;
  fail: number;
  durationMs: number;
  failures: string[];
  coverage: { id: string; covered: boolean; passing: boolean; tests: string[] }[];
  exitCode: number | null;
  logEvidence: string;
  /** How the run was isolated, as actually enforced (see src/sandbox). */
  isolation?: { driver: string; enforcement: Record<string, string>; skippedSymlinks: string[]; killedBy: string | null; workspaceRemoved: boolean };
}

export interface SecurityFinding {
  severity: 'high' | 'medium' | 'low' | 'info';
  rule: string;
  file: string;
  line?: number;
  message: string;
}

export interface Mission {
  id: string;
  title: string;
  idea: string;
  state: MissionState;
  engine: EngineId;
  model: string;
  budgetUsd: number;
  spentUsd: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  projectDir: string;
  artifactsDir: string;
  plan: RoleId[];
  stages: StageRecord[];
  spec?: Spec;
  testDigest?: string;
  tests?: TestSummary;
  verifications: TestSummary[];
  security?: { findings: SecurityFinding[]; high: number; medium: number };
  fixIterations: number;
  review?: { decision: 'approved' | 'rejected'; by: string; note: string; at: string };
  error?: string;
}

export interface Task {
  id: string;
  missionId: string;
  role: RoleId;
  iteration: number;
  state: TaskState;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  /** Free-form input for the role (e.g. test failures for a fix iteration). */
  input?: Record<string, unknown>;
}

export interface Approval {
  id: string;
  missionId: string;
  kind: ApprovalKind;
  state: ApprovalState;
  title: string;
  reason: string;
  context: Record<string, unknown>;
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  note?: string;
}

export interface LedgerEntry {
  id: string;
  missionId: string;
  role: RoleId;
  usd: number;
  source: string;
  at: string;
}

export interface StateShape {
  version: 1;
  missions: Mission[];
  tasks: Task[];
  approvals: Approval[];
  ledger: LedgerEntry[];
}
