import { randomUUID } from 'crypto';
import { getDb } from '../db/index.js';
import * as fcc from './fcc.js';
import * as memory from './memory.js';
import { resolveAgentIdentity, getAgent } from './agents.js';

/**
 * Level 1 — Skill + Loop Engineering.
 *  - Skills: reusable, named prompts any agent can run (with optional {{input}}).
 *  - Loops: scheduled recurring agent tasks (automation).
 *  - Audit: a workflow audit trail of every skill/loop run.
 */

function db() {
  return getDb();
}

// ── Audit ────────────────────────────────────────────────────────────────────
export interface AuditEntry {
  id: string;
  ts: string;
  kind: string;
  agent: string;
  title: string;
  detail: string;
  status: string;
}

export function audit(kind: string, e: Partial<AuditEntry>): void {
  db()
    .prepare(
      'INSERT INTO audit_log (id, ts, kind, agent, title, detail, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      randomUUID(),
      new Date().toISOString(),
      kind,
      e.agent ?? '',
      (e.title ?? '').slice(0, 200),
      (e.detail ?? '').slice(0, 1000),
      e.status ?? 'ok'
    );
}

export function listAudit(limit = 50): AuditEntry[] {
  return db()
    .prepare('SELECT * FROM audit_log ORDER BY ts DESC LIMIT ?')
    .all(limit) as AuditEntry[];
}

// ── Skills ─────────────────────────────────────────────────────────────────────
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

export function createSkill(s: Partial<Skill>): Skill {
  const id = randomUUID();
  const row: Skill = {
    id,
    name: (s.name ?? 'Untitled skill').slice(0, 120),
    description: s.description ?? '',
    prompt: s.prompt ?? '',
    agent_id: getAgent(s.agent_id ?? 'free-claude-code').id,
    created_at: new Date().toISOString(),
  };
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
  const prompt = skill.prompt.replace(/\{\{\s*input\s*\}\}/g, input);
  const result = await fcc.runAgent(
    skill.agent_id,
    [{ role: 'user', content: prompt }],
    resolveAgentIdentity(skill.agent_id)
  );
  audit('skill', { agent: skill.agent_id, title: skill.name, detail: result.text.slice(0, 400) });
  return { output: result.text };
}

// ── Loops (automation) ──────────────────────────────────────────────────────────
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

function nextRunFrom(now: number, mins: number): string {
  return new Date(now + Math.max(1, mins) * 60000).toISOString();
}

export function createLoop(l: Partial<Loop>): Loop {
  const id = randomUUID();
  const interval = Math.max(1, Number(l.interval_minutes) || 60);
  const enabled = l.enabled ? 1 : 0;
  const row: Loop = {
    id,
    name: (l.name ?? 'Untitled loop').slice(0, 120),
    prompt: l.prompt ?? '',
    agent_id: getAgent(l.agent_id ?? 'free-claude-code').id,
    interval_minutes: interval,
    enabled,
    last_run: null,
    next_run: enabled ? nextRunFrom(Date.now(), interval) : null,
    created_at: new Date().toISOString(),
  };
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
  return row;
}

export function deleteLoop(id: string): void {
  db().prepare('DELETE FROM loops WHERE id = ?').run(id);
}

export function setLoopEnabled(id: string, enabled: boolean): Loop {
  const loop = db().prepare('SELECT * FROM loops WHERE id = ?').get(id) as Loop | undefined;
  if (!loop) throw new Error('loop not found');
  const next = enabled ? nextRunFrom(Date.now(), loop.interval_minutes) : null;
  db()
    .prepare('UPDATE loops SET enabled = ?, next_run = ? WHERE id = ?')
    .run(enabled ? 1 : 0, next, id);
  return db().prepare('SELECT * FROM loops WHERE id = ?').get(id) as Loop;
}

export async function runLoop(id: string): Promise<{ output: string }> {
  const loop = db().prepare('SELECT * FROM loops WHERE id = ?').get(id) as Loop | undefined;
  if (!loop) throw new Error('loop not found');
  let output = '';
  try {
    const result = await fcc.runAgent(
      loop.agent_id,
      [{ role: 'user', content: loop.prompt }],
      resolveAgentIdentity(loop.agent_id)
    );
    output = result.text;
    audit('loop', { agent: loop.agent_id, title: loop.name, detail: output.slice(0, 400) });
    // File each run to the vault so loops build up a log in your notes.
    try {
      memory.appendNote(`Loops/${loop.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.md`, output);
    } catch {
      /* best effort */
    }
  } catch (e) {
    output = e instanceof Error ? e.message : 'failed';
    audit('loop', { agent: loop.agent_id, title: loop.name, detail: output, status: 'error' });
  }
  const now = Date.now();
  db()
    .prepare('UPDATE loops SET last_run = ?, next_run = ? WHERE id = ?')
    .run(new Date(now).toISOString(), nextRunFrom(now, loop.interval_minutes), id);
  return { output };
}

// ── Scheduler ───────────────────────────────────────────────────────────────────
let ticking = false;
export function startScheduler(): void {
  setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      const due = db()
        .prepare("SELECT * FROM loops WHERE enabled = 1 AND next_run IS NOT NULL AND next_run <= ?")
        .all(new Date().toISOString()) as Loop[];
      for (const loop of due) {
        await runLoop(loop.id);
      }
    } catch {
      /* ignore tick errors */
    } finally {
      ticking = false;
    }
  }, 30000);
}
