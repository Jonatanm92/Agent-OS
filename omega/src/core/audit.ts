import fs from 'node:fs';
import path from 'node:path';
import { canonicalJson, nowIso, sha256 } from './util.ts';

/**
 * Append-only, hash-chained audit log (JSON lines).
 *
 * Each entry stores the hash of the previous entry and its own hash over a canonical
 * serialisation. Editing, deleting or reordering any line breaks the chain, which
 * `verify()` detects and reports with the first broken sequence number. This makes
 * the log tamper-evident (not tamper-proof: someone with disk access can rewrite the
 * whole chain — anchoring the head hash externally, e.g. in a git commit, is on the
 * roadmap).
 */
export interface AuditEntry {
  seq: number;
  ts: string;
  actor: string;
  type: string;
  missionId?: string;
  data: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

export const GENESIS = '0'.repeat(64);

export class AuditLog {
  readonly file: string;
  #head: { seq: number; hash: string };

  constructor(home: string) {
    this.file = path.join(home, 'audit.jsonl');
    fs.mkdirSync(home, { recursive: true });
    const entries = this.#readAll();
    const last = entries.at(-1);
    this.#head = last ? { seq: last.seq, hash: last.hash } : { seq: 0, hash: GENESIS };
  }

  static hashOf(entry: Omit<AuditEntry, 'hash'>): string {
    return sha256(canonicalJson(entry));
  }

  append(actor: string, type: string, data: Record<string, unknown> = {}, missionId?: string): AuditEntry {
    const base: Omit<AuditEntry, 'hash'> = {
      seq: this.#head.seq + 1,
      ts: nowIso(),
      actor,
      type,
      ...(missionId ? { missionId } : {}),
      data,
      prevHash: this.#head.hash,
    };
    const entry: AuditEntry = { ...base, hash: AuditLog.hashOf(base) };
    fs.appendFileSync(this.file, JSON.stringify(entry) + '\n');
    this.#head = { seq: entry.seq, hash: entry.hash };
    return entry;
  }

  head(): { seq: number; hash: string } {
    return { ...this.#head };
  }

  list(filter: { missionId?: string; limit?: number } = {}): AuditEntry[] {
    let entries = this.#readAll();
    if (filter.missionId) entries = entries.filter((e) => e.missionId === filter.missionId);
    if (filter.limit) entries = entries.slice(-filter.limit);
    return entries;
  }

  verify(): { ok: boolean; count: number; headHash: string; brokenAt?: number; reason?: string } {
    let prev = GENESIS;
    let count = 0;
    const lines = fs.existsSync(this.file) ? fs.readFileSync(this.file, 'utf8').split('\n').filter(Boolean) : [];
    for (const [i, line] of lines.entries()) {
      let entry: AuditEntry;
      try {
        entry = JSON.parse(line) as AuditEntry;
      } catch {
        return { ok: false, count, headHash: prev, brokenAt: i + 1, reason: 'unparseable line' };
      }
      const { hash, ...rest } = entry;
      if (entry.seq !== i + 1) return { ok: false, count, headHash: prev, brokenAt: i + 1, reason: 'sequence gap or reorder' };
      if (entry.prevHash !== prev) return { ok: false, count, headHash: prev, brokenAt: entry.seq, reason: 'prevHash mismatch' };
      if (AuditLog.hashOf(rest) !== hash) return { ok: false, count, headHash: prev, brokenAt: entry.seq, reason: 'content hash mismatch' };
      prev = hash;
      count++;
    }
    return { ok: true, count, headHash: prev };
  }

  #readAll(): AuditEntry[] {
    if (!fs.existsSync(this.file)) return [];
    return fs
      .readFileSync(this.file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as AuditEntry);
  }
}
