import type { Db } from '../db/Database.js';
import { newId, nowIso } from '../core/Ids.js';

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'failed';
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  lastError: string | null;
}

/**
 * SQLite-backed work queue.
 *
 * Deliberately boring: one process, one table, claim-by-update. It survives a
 * crash mid-batch, which is the only durability property a 100-domain run
 * actually needs. Swapping in Redis later means replacing this file.
 */
export class Queue {
  constructor(private readonly db: Db) {}

  enqueue(type: string, payload: Record<string, unknown>, options: { maxAttempts?: number; runAfter?: string } = {}): Job {
    const id = newId('job');
    this.db
      .prepare('INSERT INTO jobs (id, type, payload, status, max_attempts, run_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, type, JSON.stringify(payload), 'pending', options.maxAttempts ?? 2, options.runAfter ?? nowIso(), nowIso());
    return this.get(id)!;
  }

  get(id: string): Job | null {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as any;
    return row ? toJob(row) : null;
  }

  /** Atomically take the next runnable job, or null when the queue is drained. */
  claim(type?: string): Job | null {
    const claimTx = this.db.transaction((): Job | null => {
      const row = type
        ? (this.db
            .prepare("SELECT * FROM jobs WHERE status = 'pending' AND type = ? AND run_after <= ? ORDER BY created_at LIMIT 1")
            .get(type, nowIso()) as any)
        : (this.db.prepare("SELECT * FROM jobs WHERE status = 'pending' AND run_after <= ? ORDER BY created_at LIMIT 1").get(nowIso()) as any);
      if (!row) return null;
      this.db
        .prepare("UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_at = ? WHERE id = ?")
        .run(nowIso(), row.id);
      return toJob({ ...row, status: 'running', attempts: row.attempts + 1 });
    });
    return claimTx();
  }

  complete(id: string): void {
    this.db.prepare("UPDATE jobs SET status = 'done', finished_at = ?, last_error = NULL WHERE id = ?").run(nowIso(), id);
  }

  fail(id: string, error: string): void {
    const job = this.get(id);
    if (!job) return;
    const exhausted = job.attempts >= job.maxAttempts;
    this.db
      .prepare(`UPDATE jobs SET status = ?, last_error = ?, finished_at = ?, run_after = ? WHERE id = ?`)
      .run(
        exhausted ? 'failed' : 'pending',
        error.slice(0, 1000),
        exhausted ? nowIso() : null,
        exhausted ? job.runAfter : new Date(Date.now() + 30_000).toISOString(),
        id,
      );
  }

  stats(): { pending: number; running: number; done: number; failed: number } {
    const rows = this.db.prepare('SELECT status, COUNT(*) AS n FROM jobs GROUP BY status').all() as any[];
    const out = { pending: 0, running: 0, done: 0, failed: 0 };
    for (const row of rows) if (row.status in out) (out as any)[row.status] = row.n;
    return out;
  }

  /** Requeue jobs left running by a crashed process. */
  recoverStale(olderThanMs = 15 * 60 * 1000): number {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const result = this.db.prepare("UPDATE jobs SET status = 'pending' WHERE status = 'running' AND locked_at < ?").run(cutoff);
    return result.changes;
  }
}

function toJob(row: any): Job {
  return {
    id: row.id,
    type: row.type,
    payload: JSON.parse(row.payload || '{}'),
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAfter: row.run_after,
    lastError: row.last_error,
  };
}
