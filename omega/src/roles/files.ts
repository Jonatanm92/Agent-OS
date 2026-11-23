import fs from 'node:fs';
import path from 'node:path';
import { checkWrite, toPosix, type RolePolicy } from '../core/policy.ts';
import { canonicalJson, sha256 } from '../core/util.ts';

const SKIP_DIRS = new Set(['.git', 'node_modules']);

/** All project files (posix, relative), excluding .git and node_modules. */
export function listFiles(root: string, sub = ''): string[] {
  const dir = path.join(root, sub);
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const rel = sub ? path.join(sub, entry.name) : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(root, rel));
    else if (entry.isFile()) out.push(toPosix(rel));
  }
  return out.sort();
}

/** Content digest of a subtree, used to prove tests were not changed after authoring. */
export function treeDigest(root: string, sub: string): { digest: string; files: { path: string; sha256: string }[] } {
  const files = listFiles(root, sub).map((rel) => ({ path: rel, sha256: sha256(fs.readFileSync(path.join(root, rel))) }));
  return { digest: sha256(canonicalJson(files)), files };
}

/** Policy-checked write of a project file. */
export function writeProjectFile(policy: RolePolicy, root: string, rel: string, content: string): void {
  const abs = checkWrite(policy, root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}
