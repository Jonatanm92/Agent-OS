import fs from 'node:fs';
import path from 'node:path';
import type { OmegaConfig } from '../config.ts';
import { AuditLog } from '../core/audit.ts';
import { checkBudget, missionSpent } from '../core/budget.ts';
import { findWriteViolations } from '../core/policy.ts';
import { claimNext, enqueue, recoverInterrupted, setTaskState } from '../core/queue.ts';
import { APPROVAL_TRANSITIONS, assertTransition, MISSION_TRANSITIONS } from '../core/state.ts';
import { Store } from '../core/store.ts';
import type { Approval, ApprovalKind, EngineId, Evidence, Mission, MissionState, RoleId, StateShape, Task, TestSummary } from '../core/types.ts';
import { newId, nowIso, sha256, slugify, writeFileAtomic } from '../core/util.ts';
import * as vcs from '../core/vcs.ts';
import { DEFAULT_PLAN, getRole, type RoleDef } from '../roles/registry.ts';
import { writeReadme, writeScaffold } from '../roles/scaffold.ts';
import { scanProject } from '../roles/security.ts';
import { runAcceptanceTests } from '../roles/tester.ts';
import { listFiles, treeDigest } from '../roles/files.ts';
import { getEngine, type Engine } from './engines.ts';

export interface CreateMissionInput {
  idea: string;
  engine?: EngineId;
  budgetUsd?: number;
  model?: string;
  actor?: string;
}

interface StageOutcome {
  ok: boolean;
  summary: string;
  costUsd: number;
  evidence: Evidence[];
  error?: string;
  /** Unexpected crash: the task may be retried. */
  retryable?: boolean;
  /** The independent test run failed (eligible for a coder fix iteration). */
  testsFailed?: TestSummary;
  budgetBlocked?: boolean;
  patch?: (m: Mission) => void;
}

const ENGINES: EngineId[] = ['template', 'claude-code'];
const MODEL_RE = /^[a-z0-9][a-z0-9.\-]{1,63}$/;

export class OmegaError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * The orchestrator: owns mission lifecycle, the task queue, gates and evidence.
 * Single worker, single process. All state changes go through Store.mutate and are
 * mirrored into the hash-chained audit log.
 */
export class Omega {
  readonly cfg: OmegaConfig;
  readonly store: Store;
  readonly audit: AuditLog;
  #busy = false;

  constructor(cfg: OmegaConfig) {
    this.cfg = cfg;
    fs.mkdirSync(cfg.home, { recursive: true });
    fs.mkdirSync(cfg.workspaceRoot, { recursive: true });
    this.store = new Store(cfg.home);
    this.audit = new AuditLog(cfg.home);
    const { requeued, failed } = this.store.mutate((d) => recoverInterrupted(d));
    for (const t of requeued) this.audit.append('omega', 'task.recovered', { taskId: t.id, role: t.role }, t.missionId);
    for (const t of failed) this.audit.append('omega', 'task.abandoned', { taskId: t.id, role: t.role }, t.missionId);
  }

  // ── queries ───────────────────────────────────────────────────────────────

  listMissions(): Mission[] {
    return this.store.read((d) => [...d.missions].reverse());
  }

  getMission(id: string): Mission {
    const m = this.store.read((d) => d.missions.find((x) => x.id === id));
    if (!m) throw new OmegaError(404, `No mission ${id}`);
    return m;
  }

  listApprovals(state?: Approval['state']): Approval[] {
    return this.store.read((d) => d.approvals.filter((a) => !state || a.state === state).reverse());
  }

  async missionDetail(id: string) {
    const mission = this.getMission(id);
    const { tasks, approvals, ledger } = this.store.read((d) => ({
      tasks: d.tasks.filter((t) => t.missionId === id),
      approvals: d.approvals.filter((a) => a.missionId === id),
      ledger: d.ledger.filter((l) => l.missionId === id),
    }));
    return {
      mission,
      tasks,
      approvals,
      ledger,
      commits: await vcs.log(mission.projectDir),
      files: fs.existsSync(mission.projectDir) ? listFiles(mission.projectDir) : [],
      audit: this.audit.list({ missionId: id }),
    };
  }

  overview() {
    const d = this.store.read((x) => x);
    const byState: Record<string, number> = {};
    for (const m of d.missions) byState[m.state] = (byState[m.state] ?? 0) + 1;
    const today = new Date().toISOString().slice(0, 10);
    return {
      missions: d.missions.length,
      byState,
      pendingApprovals: d.approvals.filter((a) => a.state === 'pending').length,
      queued: d.tasks.filter((t) => t.state === 'queued').length,
      running: d.tasks.filter((t) => t.state === 'running').length,
      spentTodayUsd: d.ledger.filter((l) => l.at.startsWith(today)).reduce((s, l) => s + l.usd, 0),
      spentTotalUsd: d.ledger.reduce((s, l) => s + l.usd, 0),
      limits: {
        dailyBudgetUsd: this.cfg.dailyBudgetUsd,
        perRunBudgetUsd: this.cfg.perRunBudgetUsd,
        defaultMissionBudgetUsd: this.cfg.defaultMissionBudgetUsd,
        autoApproveSpendUnderUsd: this.cfg.autoApproveSpendUnderUsd,
        maxFixIterations: this.cfg.maxFixIterations,
      },
      audit: { ...this.audit.verify() },
      workerBusy: this.#busy,
    };
  }

  // ── commands ──────────────────────────────────────────────────────────────

  async createMission(input: CreateMissionInput): Promise<Mission> {
    const idea = String(input.idea ?? '').trim();
    if (idea.length < 10 || idea.length > 4000) throw new OmegaError(400, 'idea must be 10–4000 characters');
    const engine = input.engine ?? 'claude-code';
    if (!ENGINES.includes(engine)) throw new OmegaError(400, `engine must be one of ${ENGINES.join(', ')}`);
    const model = input.model ?? this.cfg.defaultModel;
    if (!MODEL_RE.test(model)) throw new OmegaError(400, 'invalid model name');
    const budgetUsd = engine === 'template' ? 0 : (input.budgetUsd ?? this.cfg.defaultMissionBudgetUsd);
    if (!Number.isFinite(budgetUsd) || budgetUsd < 0 || budgetUsd > this.cfg.dailyBudgetUsd) {
      throw new OmegaError(400, `budget must be between 0 and the daily cap ($${this.cfg.dailyBudgetUsd})`);
    }
    const actor = input.actor ?? 'human';
    const id = newId('msn');
    const projectDir = path.join(this.cfg.workspaceRoot, `${slugify(idea, 32)}-${id.slice(4, 10)}`);
    const artifactsDir = path.join(this.cfg.home, 'missions', id, 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });
    await vcs.initRepo(projectDir);
    const now = nowIso();
    const mission: Mission = {
      id,
      title: idea.length > 70 ? idea.slice(0, 69) + '…' : idea,
      idea,
      state: 'received',
      engine,
      model,
      budgetUsd,
      spentUsd: 0,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      projectDir,
      artifactsDir,
      plan: [...DEFAULT_PLAN],
      stages: [],
      verifications: [],
      fixIterations: 0,
    };
    this.store.mutate((d) => {
      d.missions.push(mission);
    });
    this.audit.append(`human:${actor}`, 'mission.created', { idea, engine, model, budgetUsd, projectDir }, id);

    if (engine === 'claude-code') {
      const autoOk = budgetUsd <= this.cfg.autoApproveSpendUnderUsd;
      this.#requestApproval(id, 'spend_gate', `Godkänn AI-körning (högst $${budgetUsd.toFixed(2)})`, 'This mission runs paid Claude Code agents (product, test-author, coder).', {
        engine,
        model,
        budgetUsd,
        perRunCapUsd: this.cfg.perRunBudgetUsd,
        dailyCapUsd: this.cfg.dailyBudgetUsd,
        maxFixIterations: this.cfg.maxFixIterations,
        roles: ['product', 'test-author', 'coder'],
      });
      this.#setState(id, 'blocked', 'waiting for spend approval');
      if (autoOk) {
        const gate = this.listApprovals('pending').find((a) => a.missionId === id)!;
        await this.decideApproval(gate.id, 'approve', 'auto-policy', `auto-approved: budget ≤ $${this.cfg.autoApproveSpendUnderUsd}`);
      }
    } else {
      this.#setState(id, 'running', 'template engine: no spend, starting');
      this.store.mutate((d) => enqueue(d, id, mission.plan[0]));
    }
    return this.getMission(id);
  }

  async decideApproval(approvalId: string, decision: 'approve' | 'reject', actor: string, note = '', acknowledgeRisks = false): Promise<Approval> {
    const approval = this.store.read((d) => d.approvals.find((a) => a.id === approvalId));
    if (!approval) throw new OmegaError(404, `No approval ${approvalId}`);
    if (approval.state !== 'pending') throw new OmegaError(409, `Approval already ${approval.state}`);
    const mission = this.getMission(approval.missionId);
    if (approval.kind === 'final_review' && decision === 'approve' && (mission.security?.high ?? 0) > 0 && !acknowledgeRisks) {
      throw new OmegaError(409, `Security review found ${mission.security!.high} high-severity issue(s); approving requires acknowledgeRisks`);
    }
    if (approval.kind === 'final_review' && decision === 'reject' && note.trim() === '') {
      throw new OmegaError(400, 'Rejecting a result requires a note explaining why');
    }
    const to = decision === 'approve' ? 'approved' : 'rejected';
    this.store.mutate((d) => {
      const a = d.approvals.find((x) => x.id === approvalId)!;
      assertTransition('approval', APPROVAL_TRANSITIONS, a.state, to);
      a.state = to;
      a.decidedAt = nowIso();
      a.decidedBy = actor;
      a.note = note;
    });
    this.audit.append(actor.startsWith('auto') ? actor : `human:${actor}`, 'approval.decided', { approvalId, kind: approval.kind, decision, note, acknowledgeRisks }, mission.id);

    if (approval.kind === 'spend_gate') {
      if (decision === 'approve') {
        this.#setState(mission.id, 'running', 'spend approved');
        this.store.mutate((d) => enqueue(d, mission.id, mission.plan[0]));
      } else {
        this.#setState(mission.id, 'cancelled', 'spend not approved');
      }
    } else {
      this.#setState(mission.id, decision === 'approve' ? 'approved' : 'rejected', note || decision);
      this.store.mutate((d) => {
        const m = d.missions.find((x) => x.id === mission.id)!;
        m.review = { decision: decision === 'approve' ? 'approved' : 'rejected', by: actor, note, at: nowIso() };
      });
    }
    return this.store.read((d) => d.approvals.find((a) => a.id === approvalId)!);
  }

  cancelMission(id: string, actor: string): Mission {
    const m = this.getMission(id);
    if (!MISSION_TRANSITIONS[m.state].includes('cancelled')) throw new OmegaError(409, `Cannot cancel a ${m.state} mission`);
    this.store.mutate((d) => {
      for (const t of d.tasks.filter((x) => x.missionId === id && x.state === 'queued')) setTaskState(t, 'cancelled');
      for (const a of d.approvals.filter((x) => x.missionId === id && x.state === 'pending')) {
        a.state = 'rejected';
        a.decidedAt = nowIso();
        a.decidedBy = 'system';
        a.note = 'mission cancelled';
      }
    });
    this.#setState(id, 'cancelled', `cancelled by ${actor}`, `human:${actor}`);
    return this.getMission(id);
  }

  retryMission(id: string, actor: string): Mission {
    const m = this.getMission(id);
    if (m.state !== 'failed') throw new OmegaError(409, 'Only failed missions can be retried');
    const last = this.store.read((d) => d.tasks.filter((t) => t.missionId === id && t.state === 'failed').at(-1));
    if (!last) throw new OmegaError(409, 'No failed task to retry');
    const budget = this.store.read((d) => checkBudget(this.cfg, m, d.ledger));
    if (getRole(last.role).usesEngine && m.engine === 'claude-code' && !budget.ok) throw new OmegaError(409, budget.reason ?? 'budget exhausted');
    this.#setState(id, 'running', `retry ${last.role} requested by ${actor}`, `human:${actor}`);
    this.store.mutate((d) => {
      enqueue(d, id, last.role, last.iteration, last.input);
      const mm = d.missions.find((x) => x.id === id)!;
      delete mm.error;
    });
    return this.getMission(id);
  }

  /** Re-run the acceptance tests on demand (reviewer verification). No state change. */
  async reverify(id: string, actor: string): Promise<TestSummary> {
    const m = this.getMission(id);
    if (!['awaiting_review', 'approved', 'rejected'].includes(m.state)) throw new OmegaError(409, 'Re-verification is for finished missions');
    const runId = this.#nextRunId(m);
    const run = await runAcceptanceTests(m);
    const logEv = this.#artifact(m, `verify-${runId}.tap`, 'test-log', run.log, `Re-verification run ${runId} requested by ${actor}`);
    const summary: TestSummary = { ...run.summary, runId, logEvidence: logEv.name };
    this.#artifact(m, `verify-${runId}.json`, 'test-report', JSON.stringify({ ...summary, integrity: run.integrity }, null, 2), `Re-verification ${summary.pass}/${summary.tests}`);
    this.store.mutate((d) => {
      d.missions.find((x) => x.id === id)!.verifications.push(summary);
    });
    this.audit.append(`human:${actor}`, 'mission.reverified', { runId, ok: summary.ok, pass: summary.pass, tests: summary.tests, logSha256: logEv.sha256 }, id);
    return summary;
  }

  /** Recompute every evidence hash, check commits exist and the audit chain holds. */
  async verifyEvidence(id: string) {
    const m = this.getMission(id);
    const checks: { name: string; ok: boolean; detail: string }[] = [];
    for (const ev of m.stages.flatMap((s) => s.evidence)) {
      const file = path.join(m.artifactsDir, ev.path);
      const actual = fs.existsSync(file) ? sha256(fs.readFileSync(file)) : 'missing';
      checks.push({ name: `artifact ${ev.name}`, ok: actual === ev.sha256, detail: actual === ev.sha256 ? ev.sha256.slice(0, 16) : `expected ${ev.sha256.slice(0, 16)}, got ${actual.slice(0, 16)}` });
    }
    for (const s of m.stages.filter((x) => x.commit)) {
      const ok = await vcs.commitExists(m.projectDir, s.commit!);
      checks.push({ name: `commit ${s.commit!.slice(0, 10)} (${s.role})`, ok, detail: ok ? 'present in project repo' : 'missing' });
    }
    if (m.testDigest) {
      const actual = treeDigest(m.projectDir, 'test').digest;
      checks.push({ name: 'acceptance tests unchanged', ok: actual === m.testDigest, detail: actual.slice(0, 16) });
    }
    const chain = this.audit.verify();
    checks.push({ name: 'audit chain', ok: chain.ok, detail: chain.ok ? `${chain.count} entries, head ${chain.headHash.slice(0, 16)}` : `broken at ${chain.brokenAt}: ${chain.reason}` });
    return { missionId: id, ok: checks.every((c) => c.ok), checks };
  }

  readArtifact(id: string, name: string): string {
    const m = this.getMission(id);
    if (!/^[\w.-]+$/.test(name)) throw new OmegaError(400, 'invalid artifact name');
    const ev = m.stages.flatMap((s) => s.evidence).find((e) => e.name === name);
    if (!ev) throw new OmegaError(404, 'no such artifact');
    return fs.readFileSync(path.join(m.artifactsDir, ev.path), 'utf8');
  }

  // ── worker ────────────────────────────────────────────────────────────────

  /** Run at most one queued task. Returns true if a task was run. */
  async tick(): Promise<boolean> {
    if (this.#busy) return false;
    this.#busy = true;
    try {
      const task = this.store.mutate((d) => claimNext(d));
      if (!task) return false;
      await this.#runTask(task);
      return true;
    } finally {
      this.#busy = false;
    }
  }

  async runUntilIdle(maxTasks = 100): Promise<number> {
    let n = 0;
    while (n < maxTasks && (await this.tick())) n++;
    return n;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  #setState(id: string, to: MissionState, reason: string, actor = 'omega'): void {
    let from: MissionState = 'received';
    this.store.mutate((d) => {
      const m = d.missions.find((x) => x.id === id)!;
      from = m.state;
      assertTransition('mission', MISSION_TRANSITIONS, m.state, to);
      m.state = to;
      m.updatedAt = nowIso();
      if (to === 'failed') m.error = reason;
    });
    this.audit.append(actor, 'mission.state', { from, to, reason }, id);
  }

  #requestApproval(missionId: string, kind: ApprovalKind, title: string, reason: string, context: Record<string, unknown>): Approval {
    const approval: Approval = { id: newId('apr'), missionId, kind, state: 'pending', title, reason, context, requestedAt: nowIso() };
    this.store.mutate((d) => {
      d.approvals.push(approval);
    });
    this.audit.append('omega', 'approval.requested', { approvalId: approval.id, kind, title }, missionId);
    return approval;
  }

  #artifact(m: Mission, name: string, kind: Evidence['kind'], content: string, summary: string): Evidence {
    if (!/^[\w.-]+$/.test(name)) throw new Error(`invalid artifact name ${name}`);
    const file = path.join(m.artifactsDir, name);
    writeFileAtomic(file, content);
    return { name, kind, path: name, sha256: sha256(content), bytes: Buffer.byteLength(content), summary };
  }

  #nextRunId(m: Mission): number {
    return m.stages.filter((s) => s.role === 'tester').length + m.verifications.length + 1;
  }

  async #runTask(task: Task): Promise<void> {
    const role = getRole(task.role);
    const startedAt = nowIso();
    this.store.mutate((d) => {
      d.missions.find((x) => x.id === task.missionId)!.stages.push({ taskId: task.id, role: task.role, iteration: task.iteration, state: 'running', startedAt, costUsd: 0, evidence: [] });
    });
    this.audit.append(role.id, 'task.started', { taskId: task.id, iteration: task.iteration, attempt: task.attempts }, task.missionId);

    let outcome: StageOutcome;
    try {
      outcome = await this.#execute(this.getMission(task.missionId), task, role);
    } catch (err) {
      outcome = { ok: false, summary: 'Stage crashed', costUsd: 0, evidence: [], error: err instanceof Error ? err.message : String(err), retryable: true };
    }

    const m = this.getMission(task.missionId);
    // Enforce the role's write scope on what actually changed on disk.
    let changes: vcs.StatusEntry[] = [];
    try {
      changes = await vcs.status(m.projectDir);
    } catch {
      /* project may not exist yet */
    }
    const violations = findWriteViolations(role.policy, changes.map((c) => c.path));
    if (violations.length) {
      await vcs.restorePaths(m.projectDir, changes.filter((c) => violations.includes(c.path)));
      this.audit.append('omega', 'policy.violation', { role: role.id, paths: violations, action: 'reverted' }, m.id);
      if (role.usesEngine) {
        outcome = { ...outcome, ok: false, retryable: false, error: `${role.id} wrote outside its allowed paths: ${violations.join(', ')} (reverted)` };
      }
    }
    if (outcome.costUsd > 0) {
      this.store.mutate((d) => {
        d.ledger.push({ id: newId('led'), missionId: m.id, role: role.id, usd: outcome.costUsd, source: `${m.engine}:total_cost_usd`, at: nowIso() });
        const mm = d.missions.find((x) => x.id === m.id)!;
        mm.spentUsd = missionSpent(d.ledger, m.id);
      });
      this.audit.append('omega', 'budget.spent', { role: role.id, usd: outcome.costUsd }, m.id);
    }
    let commit: { sha: string; files: string[] } | null = null;
    if (outcome.ok) {
      commit = await vcs.commitAll(m.projectDir, role.id, `[omega:${role.id}] ${oneLine(outcome.summary)}`);
      if (commit) this.audit.append(role.id, 'commit.created', { sha: commit.sha, files: commit.files }, m.id);
    }

    this.store.mutate((d) => {
      const mm = d.missions.find((x) => x.id === m.id)!;
      const stage = mm.stages.find((s) => s.taskId === task.id && s.state === 'running')!;
      stage.state = outcome.ok ? 'succeeded' : 'failed';
      stage.finishedAt = nowIso();
      stage.summary = outcome.summary;
      stage.costUsd = outcome.costUsd;
      stage.evidence = outcome.evidence;
      if (outcome.error) stage.error = outcome.error;
      if (commit) {
        stage.commit = commit.sha;
        stage.changedFiles = commit.files;
      }
      if (outcome.ok) outcome.patch?.(mm);
      else if (outcome.testsFailed) outcome.patch?.(mm);
      mm.updatedAt = nowIso();
      const t = d.tasks.find((x) => x.id === task.id)!;
      if (!outcome.ok && outcome.retryable && t.attempts < t.maxAttempts) setTaskState(t, 'queued', outcome.error);
      else setTaskState(t, outcome.ok ? 'succeeded' : 'failed', outcome.error);
    });
    this.audit.append(role.id, 'task.finished', { taskId: task.id, ok: outcome.ok, summary: outcome.summary, error: outcome.error, costUsd: outcome.costUsd, evidence: outcome.evidence.map((e) => ({ name: e.name, sha256: e.sha256 })) }, m.id);

    await this.#advance(task, role, outcome);
  }

  async #advance(task: Task, role: RoleDef, outcome: StageOutcome): Promise<void> {
    const m = this.getMission(task.missionId);
    if (m.state !== 'running') return; // cancelled while the stage was running
    const t = this.store.read((d) => d.tasks.find((x) => x.id === task.id)!);
    if (t.state === 'queued') return; // will be retried by the worker

    if (!outcome.ok) {
      if (outcome.testsFailed && m.engine === 'claude-code' && m.fixIterations < this.cfg.maxFixIterations) {
        const budget = this.store.read((d) => checkBudget(this.cfg, m, d.ledger));
        if (budget.ok) {
          this.store.mutate((d: StateShape) => {
            const mm = d.missions.find((x) => x.id === m.id)!;
            mm.fixIterations += 1;
            enqueue(d, m.id, 'coder', task.iteration + 1, { failingRunId: outcome.testsFailed!.runId, logEvidence: outcome.testsFailed!.logEvidence });
          });
          this.audit.append('omega', 'mission.fix_iteration', { iteration: m.fixIterations + 1, failing: outcome.testsFailed.failures }, m.id);
          return;
        }
        this.#setState(m.id, 'failed', `tests failed and no budget for a fix iteration: ${budget.reason}`);
        return;
      }
      this.#setState(m.id, 'failed', `${role.id}: ${outcome.error ?? outcome.summary}`);
      return;
    }

    const idx = m.plan.indexOf(role.id);
    const next = m.plan[idx + 1];
    if (next) {
      this.store.mutate((d) => enqueue(d, m.id, next, task.iteration));
      return;
    }
    await this.#finish(m.id);
  }

  async #finish(id: string): Promise<void> {
    const m = this.getMission(id);
    const commits = await vcs.log(m.projectDir);
    const manifest = {
      missionId: m.id,
      generatedAt: nowIso(),
      engine: m.engine,
      model: m.engine === 'claude-code' ? m.model : null,
      spentUsd: m.spentUsd,
      projectDir: m.projectDir,
      headCommit: commits[0]?.sha ?? null,
      commits,
      testDigest: m.testDigest,
      tests: m.tests,
      security: m.security ? { high: m.security.high, medium: m.security.medium, total: m.security.findings.length } : null,
      artifacts: m.stages.flatMap((s) => s.evidence.map((e) => ({ stage: s.role, iteration: s.iteration, name: e.name, sha256: e.sha256, bytes: e.bytes }))),
      auditHead: this.audit.head(),
    };
    const ev = this.#artifact(m, 'evidence-manifest.json', 'manifest', JSON.stringify(manifest, null, 2), 'Sealed list of all artifacts, commits and the audit head');
    this.store.mutate((d) => {
      const mm = d.missions.find((x) => x.id === id)!;
      mm.stages.at(-1)!.evidence.push(ev);
    });
    this.audit.append('omega', 'mission.sealed', { manifestSha256: ev.sha256, headCommit: manifest.headCommit }, id);
    const t = m.tests;
    this.#requestApproval(id, 'final_review', `Granska: ${m.spec?.title ?? m.title}`, 'All stages finished. Review the code, tests and evidence, then approve or reject.', {
      tests: t ? `${t.pass}/${t.tests} passed` : 'none',
      securityHigh: m.security?.high ?? 0,
      securityMedium: m.security?.medium ?? 0,
      spentUsd: m.spentUsd,
      headCommit: manifest.headCommit,
    });
    this.#setState(id, 'awaiting_review', 'all stages complete');
  }

  async #execute(m: Mission, task: Task, role: RoleDef): Promise<StageOutcome> {
    const engine: Engine = getEngine(m.engine);
    const ctxFor = (maxBudgetUsd: number) => ({
      cfg: this.cfg,
      mission: m,
      role,
      maxBudgetUsd,
      artifact: (name: string, kind: Evidence['kind'], content: string, summary: string) => this.#artifact(m, name, kind, content, summary),
    });
    let maxBudgetUsd = 0;
    if (role.usesEngine && m.engine === 'claude-code') {
      const budget = this.store.read((d) => checkBudget(this.cfg, m, d.ledger));
      if (!budget.ok) {
        this.audit.append('omega', 'budget.blocked', { role: role.id, reason: budget.reason }, m.id);
        return { ok: false, summary: 'Blocked by budget', costUsd: 0, evidence: [], error: budget.reason, budgetBlocked: true };
      }
      maxBudgetUsd = budget.allowedUsd;
      this.audit.append('omega', 'agent.invoke', { role: role.id, engine: m.engine, model: m.model, maxBudgetUsd, tools: role.policy.llmTools, writePaths: role.policy.writePaths }, m.id);
    }

    switch (role.id) {
      case 'product': {
        const r = await engine.spec(ctxFor(maxBudgetUsd));
        if (!r.ok || !r.spec) return { ok: false, summary: r.summary, costUsd: r.costUsd, evidence: r.evidence, error: r.error };
        const spec = r.spec;
        const specEv = this.#artifact(m, 'spec.json', 'spec', JSON.stringify(spec, null, 2), r.summary);
        return {
          ok: true,
          summary: r.summary,
          costUsd: r.costUsd,
          evidence: [...r.evidence, specEv],
          patch: (mm) => {
            mm.spec = spec;
            mm.title = spec.title;
          },
        };
      }
      case 'architect': {
        const files = writeScaffold(m);
        return { ok: true, summary: `Scaffolded ${files.join(', ')}`, costUsd: 0, evidence: [] };
      }
      case 'test-author': {
        const r = await engine.tests(ctxFor(maxBudgetUsd));
        const tests = listFiles(m.projectDir, 'test').filter((f) => f.endsWith('.test.js'));
        if (r.ok && tests.length === 0) return { ok: false, summary: r.summary, costUsd: r.costUsd, evidence: r.evidence, error: 'no test/*.test.js file was written' };
        if (!r.ok) return { ok: false, summary: r.summary, costUsd: r.costUsd, evidence: r.evidence, error: r.error };
        const { digest, files } = treeDigest(m.projectDir, 'test');
        const digestEv = this.#artifact(m, 'test-digest.json', 'test-report', JSON.stringify({ digest, files }, null, 2), `Fingerprint of ${files.length} test file(s), checked before every test run`);
        return { ok: true, summary: `${tests.length} test file(s): ${r.summary}`, costUsd: r.costUsd, evidence: [...r.evidence, digestEv], patch: (mm) => (mm.testDigest = digest) };
      }
      case 'coder': {
        const failingRunId = task.input?.failingRunId as number | undefined;
        // A fix iteration carries the failing run; m.tests holds that run's summary.
        const failing = failingRunId !== undefined && m.tests?.runId === failingRunId ? m.tests : undefined;
        const logName = task.input?.logEvidence as string | undefined;
        const failureLog = logName && /^[\w.-]+$/.test(logName) ? fs.readFileSync(path.join(m.artifactsDir, logName), 'utf8') : undefined;
        const r = await engine.code(ctxFor(maxBudgetUsd), failing, failureLog);
        const src = listFiles(m.projectDir, 'src').filter((f) => f.endsWith('.js'));
        if (r.ok && src.length === 0) return { ok: false, summary: r.summary, costUsd: r.costUsd, evidence: r.evidence, error: 'no src/*.js file was written' };
        return { ok: r.ok, summary: r.summary, costUsd: r.costUsd, evidence: r.evidence, error: r.error };
      }
      case 'tester': {
        const runId = this.#nextRunId(m);
        const run = await runAcceptanceTests(m);
        const logEv = this.#artifact(m, `test-run-${runId}.tap`, 'test-log', run.log, `Raw TAP output of test run ${runId}`);
        const summary: TestSummary = { ...run.summary, runId, logEvidence: logEv.name };
        const repEv = this.#artifact(m, `test-report-${runId}.json`, 'test-report', JSON.stringify({ ...summary, integrity: run.integrity }, null, 2), `${summary.pass}/${summary.tests} passed; ${summary.coverage.filter((c) => c.passing).length}/${summary.coverage.length} criteria verified`);
        const text = `Run ${runId}: ${summary.pass}/${summary.tests} passed, ${summary.coverage.filter((c) => c.passing).length}/${summary.coverage.length} acceptance criteria verified`;
        const patch = (mm: Mission) => (mm.tests = summary);
        if (summary.ok) return { ok: true, summary: text, costUsd: 0, evidence: [logEv, repEv], patch };
        return { ok: false, summary: text, costUsd: 0, evidence: [logEv, repEv], error: `tests failed: ${summary.failures.slice(0, 5).join('; ')}`, testsFailed: summary, patch };
      }
      case 'security': {
        const { findings, filesScanned } = scanProject(m.projectDir);
        const high = findings.filter((f) => f.severity === 'high').length;
        const medium = findings.filter((f) => f.severity === 'medium').length;
        const ev = this.#artifact(m, 'security-report.json', 'security-report', JSON.stringify({ filesScanned, findings }, null, 2), `${filesScanned} files scanned: ${high} high, ${medium} medium, ${findings.length} total`);
        return { ok: true, summary: `${filesScanned} files scanned: ${high} high, ${medium} medium findings`, costUsd: 0, evidence: [ev], patch: (mm) => (mm.security = { findings, high, medium }) };
      }
      case 'docs': {
        writeReadme(m, await vcs.log(m.projectDir));
        const content = fs.readFileSync(path.join(m.projectDir, 'README.md'), 'utf8');
        const ev = this.#artifact(m, 'README.md', 'doc', content, 'Generated README (also committed to the project)');
        return { ok: true, summary: 'README.md written from spec, verified test results and git history', costUsd: 0, evidence: [ev] };
      }
      default:
        return { ok: false, summary: `Role ${role.id} is ${role.status}`, costUsd: 0, evidence: [], error: `role ${role.id} not implemented` };
    }
  }
}

function oneLine(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 120 ? t.slice(0, 119) + '…' : t;
}
