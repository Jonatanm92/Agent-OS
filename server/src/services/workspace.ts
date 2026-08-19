import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { resolveConfig } from '../config.js';
import { getDb } from '../db/index.js';

/**
 * Workspace pillar — active project scoping.
 *
 * Each project is a uniquely named folder under SCRATCH_DIR. Paths are treated
 * as untrusted input: traversal, absolute paths, symbolic-link escapes, special
 * files, oversized reads/writes, and unbounded recursive listings are rejected.
 */

const PREVIEWABLE_HTML = new Set(['.html', '.htm']);
const PREVIEWABLE_IMG = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_WORKSPACE_FILES = 5_000;
const MAX_WALK_DEPTH = 40;
const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'target']);

export interface Project {
  id: string;
  name: string;
  path: string;
  created_at: string;
}

function scratchRoot(): string {
  const root = path.resolve(resolveConfig().scratchDir);
  fs.mkdirSync(root, { recursive: true });
  return fs.realpathSync(root);
}

function inside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + path.sep);
}

function validatedProjectPath(project: Project): string {
  const root = scratchRoot();
  const resolved = path.resolve(project.path);
  if (!inside(root, resolved)) {
    throw new Error('Project path is outside the configured scratch directory.');
  }
  if (!fs.existsSync(resolved)) {
    throw new Error('Project directory does not exist.');
  }
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error('Project path must be a real directory, not a symbolic link.');
  }
  const real = fs.realpathSync(resolved);
  if (!inside(root, real)) {
    throw new Error('Project directory resolves outside the configured scratch directory.');
  }
  return real;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'project'
  );
}

/** Ensure a "default" project always exists. */
export function ensureDefaultProject(): Project {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM projects WHERE name = 'default' ORDER BY created_at ASC LIMIT 1")
    .get() as Project | undefined;
  if (!row) return createProject('default');
  return { ...row, path: validatedProjectPath(row) };
}

export function listProjects(): Project[] {
  const rows = getDb()
    .prepare('SELECT * FROM projects ORDER BY created_at ASC')
    .all() as Project[];
  return rows.map((project) => ({ ...project, path: validatedProjectPath(project) }));
}

export function createProject(name: string): Project {
  const normalizedName = name.trim().slice(0, 120);
  if (!normalizedName) throw new Error('Project name is required.');

  const db = getDb();
  const id = randomUUID();
  const directoryName = `${slugify(normalizedName)}-${id.slice(0, 8)}`;
  const root = scratchRoot();
  const directory = path.join(root, directoryName);
  if (!inside(root, path.resolve(directory))) throw new Error('Invalid project directory.');
  fs.mkdirSync(directory, { recursive: false });

  const project: Project = {
    id,
    name: normalizedName,
    path: fs.realpathSync(directory),
    created_at: new Date().toISOString(),
  };
  db.prepare(
    'INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)'
  ).run(project.id, project.name, project.path, project.created_at);
  return project;
}

export function getProject(id: string): Project | undefined {
  const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as
    | Project
    | undefined;
  return row ? { ...row, path: validatedProjectPath(row) } : undefined;
}

export interface WorkspaceFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  kind: 'html' | 'image' | 'source';
}

function classify(file: string): WorkspaceFile['kind'] {
  const ext = path.extname(file).toLowerCase();
  if (PREVIEWABLE_HTML.has(ext)) return 'html';
  if (PREVIEWABLE_IMG.has(ext)) return 'image';
  return 'source';
}

export function listFiles(projectId: string): WorkspaceFile[] {
  const project = getProject(projectId);
  if (!project) return [];
  const root = project.path;
  const output: WorkspaceFile[] = [];

  const walk = (directory: string, depth: number): void => {
    if (depth > MAX_WALK_DEPTH || output.length >= MAX_WORKSPACE_FILES) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (output.length >= MAX_WORKSPACE_FILES) return;
      if (entry.name.startsWith('.') || IGNORED_DIRECTORIES.has(entry.name)) continue;
      if (entry.isSymbolicLink()) continue;
      const full = path.join(directory, entry.name);
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(full);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        walk(full, depth + 1);
      } else if (stat.isFile()) {
        output.push({
          name: entry.name,
          path: path.relative(root, full),
          size: stat.size,
          modified: stat.mtime.toISOString(),
          kind: classify(entry.name),
        });
      }
    }
  };

  walk(root, 0);
  return output.sort((a, b) => b.modified.localeCompare(a.modified));
}

function validateRelativePath(relativePath: string): string {
  const value = relativePath.trim();
  if (!value || value.includes('\0') || /[\r\n]/.test(value)) {
    throw new Error('A valid relative file path is required.');
  }
  if (path.isAbsolute(value)) throw new Error('Absolute paths are not allowed.');
  return value;
}

function assertNoSymbolicLinks(root: string, target: string, includeLeaf: boolean): void {
  const relative = path.relative(root, target);
  const parts = relative.split(path.sep).filter(Boolean);
  let current = root;
  const count = includeLeaf ? parts.length : Math.max(0, parts.length - 1);
  for (let index = 0; index < count; index++) {
    current = path.join(current, parts[index]);
    if (!fs.existsSync(current)) continue;
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error('Symbolic links are not allowed in workspace paths.');
    if (index < count - 1 && !stat.isDirectory()) {
      throw new Error('A workspace path component is not a directory.');
    }
  }
}

function safeFilePath(project: Project, relativePath: string): string {
  const root = project.path;
  const rel = validateRelativePath(relativePath);
  const target = path.resolve(root, rel);
  if (!inside(root, target) || target === root) {
    throw new Error('Path escapes the project directory.');
  }
  assertNoSymbolicLinks(root, target, false);
  return target;
}

export function readFileContent(
  projectId: string,
  relativePath: string
): { kind: WorkspaceFile['kind']; content: Buffer; mime: string } {
  const project = getProject(projectId);
  if (!project) throw new Error('Project not found.');
  const target = safeFilePath(project, relativePath);
  if (!fs.existsSync(target)) throw new Error('File not found.');
  assertNoSymbolicLinks(project.path, target, true);
  const stat = fs.lstatSync(target);
  if (!stat.isFile()) throw new Error('Workspace target is not a regular file.');
  if (stat.size > MAX_FILE_BYTES) throw new Error('File exceeds the workspace read limit.');
  const ext = path.extname(target).toLowerCase();
  return { kind: classify(relativePath), content: fs.readFileSync(target), mime: mimeFor(ext) };
}

export function writeFileContent(
  projectId: string,
  relativePath: string,
  content: string
): WorkspaceFile {
  const project = getProject(projectId);
  if (!project) throw new Error('Project not found.');
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
    throw new Error('File exceeds the workspace write limit.');
  }

  const target = safeFilePath(project, relativePath);
  const parent = path.dirname(target);
  fs.mkdirSync(parent, { recursive: true });
  assertNoSymbolicLinks(project.path, parent, true);
  if (fs.existsSync(target)) {
    const existing = fs.lstatSync(target);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new Error('Workspace target must be a regular file.');
    }
  }

  fs.writeFileSync(target, content, { encoding: 'utf8', flag: 'w' });
  const stat = fs.lstatSync(target);
  return {
    name: path.basename(target),
    path: path.relative(project.path, target),
    size: stat.size,
    modified: stat.mtime.toISOString(),
    kind: classify(target),
  };
}

/**
 * Extract fenced code blocks that name a file and write them into the project.
 * Handles:
 *   ### File: `path` then ```lang ... ```
 *   **`path`** then ```...```
 *   ```path (filename as the code-fence info string)
 */
export interface ExtractResult {
  written: WorkspaceFile[];
  skipped: number;
}

export function extractFiles(projectId: string, text: string): ExtractResult {
  if (Buffer.byteLength(text, 'utf8') > 20 * 1024 * 1024) {
    throw new Error('Extraction input exceeds the size limit.');
  }
  if (!getProject(projectId)) throw new Error('Project not found.');

  const written: WorkspaceFile[] = [];
  let skipped = 0;
  const fence = /```([^\n`]*)\n([\s\S]*?)```/g;
  const looksLikePath = (value: string) =>
    /[\w.\-/]+\.[A-Za-z0-9]+$/.test(value.trim()) || value.includes('/');
  const languageOnly = /^(ts|tsx|js|jsx|json|html|css|rust|rs|toml|yaml|yml|bash|sh|python|py|go|java|c|cpp|sql|md|text|plaintext|env|dockerfile)$/i;

  let match: RegExpExecArray | null;
  while ((match = fence.exec(text)) !== null) {
    const info = (match[1] || '').trim();
    const body = match[2] ?? '';
    let filename = '';

    if (info && looksLikePath(info) && !languageOnly.test(info)) {
      filename = info;
    } else {
      const before = text.slice(Math.max(0, match.index - 240), match.index);
      const backticks = [...before.matchAll(/`([^`\n]+\.[A-Za-z0-9]+)`/g)];
      const labels = [
        ...before.matchAll(
          /(?:File|Path|filename)\s*\d*\s*[:\-]?\s*`?([\w.\-/]+\.[A-Za-z0-9]+)`?/gi
        ),
      ];
      if (labels.length) filename = labels[labels.length - 1][1];
      else if (backticks.length) filename = backticks[backticks.length - 1][1];
    }

    if (!filename) {
      skipped++;
      continue;
    }
    try {
      const trimmed = body.replace(/\n$/, '');
      written.push(writeFileContent(projectId, filename.trim().replace(/^\.\//, ''), trimmed));
    } catch {
      skipped++;
    }
  }
  return { written, skipped };
}

function mimeFor(ext: string): string {
  const map: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
  };
  return map[ext] || 'application/octet-stream';
}
