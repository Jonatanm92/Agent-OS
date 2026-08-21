import { randomUUID } from 'crypto';
import { resolveConfig } from '../config.js';
import { getDb } from '../db/index.js';
import * as fcc from './fcc.js';
import * as memory from './memory.js';
import { resolveAgentIdentity, getAgent } from './agents.js';

/**
 * Skill + Loop Engineering.
 *
 * Loops are created disabled, scheduling is opt-in, activation is owner-gated at
 * the API layer, intervals have a floor, and a hard daily run budget acts as a
 * circuit breaker. Loop output remains internal memory unless a separate owner
 * gate promotes it to an external action.
 */

function db() {
  return getDb();
}

export interface AuditEntry {
  id: string;
  ts: string;
  kind: string;
  agent: string;
  title: string;
  detail: string;
  status: string;
}

export function audit(kind: string, entry: Partial<AuditEntry>): void {
  db()
    .prepare(
      'INSERT INTO audit_log (id, ts, kind, agent, title, detail, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      randomUUID(),
      new Date().toISOString(),
      kind.slice(0, 80),
      (entry.agent ?? '').slice(0, 120),
      (entry.title ?? '').slice(0, 200),
      (entry.detail ?? '').slice(0, 2000),
      (entry.status ?? 'ok').slice(0, 40)
    );
}

export function listAudit(limit = 50): AuditEntry[] {
  const bounded = Math.max(1, Math.min(500, Math.floor(limit) || 50));
  return db()
    .prepare('SELECT * FROM audit_log ORDER BY ts DESC LIMIT ?')
    .all(bounded) as AuditEntry[];
}

function startOfUtcDay(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export function automationRunsToday(): number {
  const row = db()
    .prepare("SELECT COUNT(*) AS count FROM audit_log WHERE kind = 'loop' AND ts >= ?")
    .get(startOfUtcDay()) as { count: number };
  return Number(row.count) || 0;
}

export function automationBudgetStatus(): {
  enabled: boolean;
  used: number;
  limit: number;
  remaining: number;
} {
  const config = resolveConfig();
  const used = automationRunsToday();
  return {
    enabled: config.enableScheduler,
    used,
    limit: config.maxAutomationRunsPerDay,
    remaining: Math.max(0, config.maxAutomationRunsPerDay - used),
  };
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  prompt: string;
  agent_id: string;
  created_at: string;
}

export function listSkills(): Skill[] {
  return db().prepare('SELECT * FROM skills ORDER BY created_at DESC').all() as Skill[];
}

export function createSkill(skill: Partial<Skill>): Skill {
  const id = randomUUID();
  const row: Skill = {
    id,
    name: (skill.name ?? 'Untitled skill').trim().slice(0, 120),
    description: (skill.description ?? '').slice(0, 1000),
    prompt: (skill.prompt ?? '').slice(0, 50_000),
    agent_id: getAgent(skill.agent_id ?? 'free-claude-code').id,
    created_at: new Date().toISOString(),
  };
  if (!row.prompt.trim()) throw new Error('Skill prompt is required.');
  db()
    .prepare(
      'INSERT INTO skills (id, name, description, prompt, agent_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(row.id, row.name, row.description, row.prompt, row.agent_id, row.created_at);
  return row;
}

export function deleteSkill(id: string): void {
  db().prepare('DELETE FROM skills WHERE id = ?').run(id);
}

export async function runSkill(id: string, input = ''): Promise<{ output: string }> {
  const skill = db().prepare('SELECT * FROM skills WHERE id = ?').get(id) as Skill | undefined;
  if (!skill) throw new Error('skill not found');
  const prompt = skill.prompt.replace(/\{\{\s*input\s*\}\}/g, input.slice(0, 20_000));
  const result = await fcc.runAgent(
    skill.agent_id,
    [{ role: 'user', content: prompt }],
    resolveAgentIdentity(skill.agent_id)
  );
  audit('skill', {
    agent: skill.agent_id,
    title: skill.name,
    detail: result.text.slice(0, 1000),
  });
  return { output: result.text };
}

export interface Loop {
  id: string;
  name: string;
  prompt: string;
  agent_id: string;
  interval_minutes: number;
  enabled: number;
  last_run: string | null;
  next_run: string | null;
  created_at: string;
}

export function listLoops(): Loop[] {
  return db().prepare('SELECT * FROM loops ORDER BY created_at DESC').all() as Loop[];
}

function nextRunFrom(now: number, minutes: number): string {
  return new Date(now + Math.max(1, minutes) * 60_000).toISOString();
}

export function createLoop(loop: Partial<Loop>): Loop {
  const config = resolveConfig();
  const id = randomUUID();
  const interval = Math.max(
    config.minLoopIntervalMinutes,
    Math.min(10_080, Math.floor(Number(loop.interval_minutes) || 60))
  );
  const row: Loop = {
    id,
    name: (loop.name ?? 'Untitled loop').trim().slice(0, 120),
    prompt: (loop.prompt ?? '').slice(0, 50_000),
    agent_id: getAgent(loop.agent_id ?? 'free-claude-code').id,
    interval_minutes: interval,
    enabled: 0,
    last_run: null,
    next_run: null,
    created_at: new Date().toISOString(),
  };
  if (!row.prompt.trim()) throw new Error('Loop prompt is required.');
  db()
    .prepare(
      'INSERT INTO loops (id, name, prompt, agent_id, interval_minutes, enabled, last_run, next_run, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      row.id,
      row.name,
      row.prompt,
      row.agent_id,
      row.interval_minutes,
      row.enabled,
      row.last_run,
      row.next_run,
      row.created_at
    );
  audit('loop-control', {
    agent: row.agent_id,
    title: row.name,
    detail: 'Created disabled; owner activation required.',
  });
  return row;
}

export function deleteLoop(id: string): void {
  db().prepare('DELETE FROM loops WHERE id = ?').run(id);
}

export function setLoopEnabled(id: string, enabled: boolean): Loop {
  const loop = db().prepare('SELECT * FROM loops WHERE id = ?').get(id) as Loop | undefined;
  if (!loop) throw new Error('loop not found');
  const config = resolveConfig();
  if (enabled && !config.enableScheduler) {
    throw new Error(
      'Automation scheduler is disabled. Set AGENT_OS_ENABLE_SCHEDULER=true after reviewing budgets.'
    );
  }
  if (enabled && automationRunsToday() >= config.maxAutomationRunsPerDay) {
    throw new Error('Daily automation run budget is exhausted.');
  }
  const next = enabled ? nextRunFrom(Date.now(), loop.interval_minutes) : null;
  db()
    .prepare('UPDATE loops SET enabled = ?, next_run = ? WHERE id = ?')
    .run(enabled ? 1 : 0, next, id);
  audit('loop-control', {
    agent: loop.agent_id,
    title: loop.name,
    detail: enabled ? `Enabled; next run ${next}.` : 'Disabled.',
  });
  return db().prepare('SELECT * FROM loops WHERE id = ?').get(id) as Loop;
}

export async function runLoop(
  id: string,
  source: 'manual' | 'scheduler' = 'manual'
): Promise<{ output: string }> {
  const loop = db().prepare('SELECT * FROM loops WHERE id = ?').get(id) as Loop | undefined;
  if (!loop) throw new Error('loop not found');
  const config = resolveConfig();
  if (source === 'scheduler' && !config.enableScheduler) {
    return { output: 'Scheduler disabled; loop not run.' };
  }

  const used = automationRunsToday();
  if (used >= config.maxAutomationRunsPerDay) {
    db().prepare('UPDATE loops SET enabled = 0, next_run = NULL WHERE id = ?').run(id);
    const output = `BLOCKED: daily automation limit ${config.maxAutomationRunsPerDay} reached.`;
    audit('loop', {
      agent: loop.agent_id,
      title: loop.name,
      detail: output,
      status: 'blocked',
    });
    return { output };
  }

  let output = '';
  let status = 'ok';
  try {
    const result = await fcc.runAgent(
      loop.agent_id,
      [{ role: 'user', content: loop.prompt }],
      resolveAgentIdentity(loop.agent_id)
    );
    output = result.text;
    try {
      memory.appendNote(
        `Loops/${loop.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.md`,
        output
      );
    } catch {
      /* memory filing is best effort */
    }
  } catch (error) {
    output = error instanceof Error ? error.message : 'failed';
    status = 'error';
  }

  audit('loop', {
    agent: loop.agent_id,
    title: loop.name,
    detail: output.slice(0, 1000),
    status,
  });

  const now = Date.now();
  const stillEnabled = loop.enabled === 1 && config.enableScheduler;
  db()
    .prepare('UPDATE loops SET last_run = ?, next_run = ? WHERE id = ?')
    .run(
      new Date(now).toISOString(),
      stillEnabled ? nextRunFrom(now, loop.interval_minutes) : null,
      id
    );
  return { output };
}

let schedulerTimer: NodeJS.Timeout | null = null;
let ticking = false;
export function startScheduler(): void {
  const config = resolveConfig();
  if (!config.enableScheduler || schedulerTimer) return;

  schedulerTimer = setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      const current = resolveConfig();
      if (!current.enableScheduler) return;
      const remaining = current.maxAutomationRunsPerDay - automationRunsToday();
      if (remaining <= 0) return;
      const due = db()
        .prepare(
          "SELECT * FROM loops WHERE enabled = 1 AND next_run IS NOT NULL AND next_run <= ? ORDER BY next_run ASC LIMIT ?"
        )
        .all(new Date().toISOString(), Math.min(3, remaining)) as Loop[];
      for (const loop of due) await runLoop(loop.id, 'scheduler');
    } catch (error) {
      audit('scheduler', {
        title: 'Scheduler tick',
        detail: error instanceof Error ? error.message : String(error),
        status: 'error',
      });
    } finally {
      ticking = false;
    }
  }, 30_000);
  schedulerTimer.unref?.();
}
