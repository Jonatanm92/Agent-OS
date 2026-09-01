import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';

/**
 * Object storage abstraction. Screenshots and reports go through this so the
 * platform can move to S3/R2 later without touching the audit or report code.
 */
export interface ObjectStorage {
  put(key: string, data: Buffer | string, contentType: string): Promise<string>;
  get(key: string): Buffer;
  exists(key: string): boolean;
  /** A locator usable by report templates (a path today, a signed URL later). */
  locate(key: string): string;
}

export class LocalFileStorage implements ObjectStorage {
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = resolve(dataDir, 'objects');
    mkdirSync(this.root, { recursive: true });
  }

  /**
   * Resolve a key inside the storage root, or refuse.
   *
   * Keys reach this from the console's `/evidence/*` route, so they are
   * attacker-influenced input. Stripping `..` from the string is the fragile
   * way to do this; resolving the final path and checking it is still under the
   * root is the auditable way, and it catches separators and encodings we have
   * not thought of.
   */
  private pathFor(key: string): string {
    const target = resolve(this.root, key.replace(/^[/\\]+/, ''));
    const root = this.root.endsWith(sep) ? this.root : this.root + sep;
    if (target !== this.root && !target.startsWith(root)) {
      throw new Error(`Refusing to access "${key}": it resolves outside the storage root.`);
    }
    return target;
  }

  async put(key: string, data: Buffer | string, _contentType: string): Promise<string> {
    const target = this.pathFor(key);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    return key;
  }

  get(key: string): Buffer {
    return readFileSync(this.pathFor(key));
  }

  exists(key: string): boolean {
    try {
      return existsSync(this.pathFor(key));
    } catch {
      // A key that escapes the root does not exist as far as callers are concerned.
      return false;
    }
  }

  locate(key: string): string {
    return this.pathFor(key);
  }
}
