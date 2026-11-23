import fs from 'node:fs';
import path from 'node:path';
import type { StateShape } from './types.ts';
import { writeFileAtomic } from './util.ts';

/**
 * Durable state store: a single JSON document written atomically on every mutation.
 *
 * v1 runs one process with one worker, so a JSON document is enough and keeps the
 * state human-inspectable. The interface (read/mutate) is deliberately narrow so it
 * can be swapped for SQLite/Postgres when OMEGA runs several workers.
 */
export class Store {
  readonly file: string;
  #data: StateShape;

  constructor(home: string) {
    this.file = path.join(home, 'state.json');
    this.#data = Store.load(this.file);
  }

  static empty(): StateShape {
    return { version: 1, missions: [], tasks: [], approvals: [], ledger: [] };
  }

  static load(file: string): StateShape {
    if (!fs.existsSync(file)) return Store.empty();
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as StateShape;
    if (parsed.version !== 1) throw new Error(`Unsupported state version in ${file}`);
    return { ...Store.empty(), ...parsed };
  }

  /** Read a deep copy, so callers can never mutate state without going through mutate(). */
  read<T>(fn: (data: StateShape) => T): T {
    return structuredClone(fn(this.#data));
  }

  /** Apply a mutation and persist it. If fn throws, nothing is written. */
  mutate<T>(fn: (data: StateShape) => T): T {
    const draft = structuredClone(this.#data);
    const result = fn(draft);
    writeFileAtomic(this.file, JSON.stringify(draft, null, 2));
    this.#data = draft;
    return structuredClone(result);
  }
}
