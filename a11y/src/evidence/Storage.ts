import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

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

  private pathFor(key: string): string {
    const safe = key.replace(/\.\./g, '').replace(/^\/+/, '');
    return join(this.root, safe);
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
    return existsSync(this.pathFor(key));
  }

  locate(key: string): string {
    return this.pathFor(key);
  }
}
