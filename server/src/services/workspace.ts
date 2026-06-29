import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { resolveConfig } from '../config.js';
import { getDb } from '../db/index.js';

/**
 * Workspace pillar — active project scoping.
 *
 * Each project is a folder under SCRATCH_DIR (default ~/freeclaude-scratch).
 * Files an agent writes for a project land in that folder, and the Workspace
 * tab previews them (HTML in an iframe, images inline, everything else as source).
 */

const PREVIEWABLE_HTML = new Set(['.html', '.htm']);
const PREVIEWABLE_IMG = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

export interface Project {
  id: string;
  name: string;
  path: string;
  created_at: string;
}

function scratchRoot(): string {
  const root = resolveConfig().scratchDir;
  fs.mkdirSync(root, { recursive: true });
  return root;
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
  let row = db
    .prepare("SELECT * FROM projects WHERE name = 'default'")
    .get() as Project | undefined;
  if (!row) {
    row = createProject('default');
  }
  return row;
}

export function listProjects(): Project[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM projects ORDER BY created_at ASC')
    .all() as Project[];
}

export function createProject(name: string): Project {
  const db = getDb();
  const slug = slugify(name);
  const dir = path.join(scratchRoot(), slug);
  fs.mkdirSync(dir, { recursive: true });
  const project: Project = {
    id: randomUUID(),
    name,
    path: dir,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    'INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)'
  ).run(project.id, project.name, project.path, project.created_at);
  return project;
}

export function getProject(id: string): Project | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
    | Project
    | undefined;
}

export interface WorkspaceFile {
  name: string;
  path: string; // relative to project root
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
  if (!fs.existsSync(project.path)) return [];
  const out: WorkspaceFile[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        const stat = fs.statSync(full);
        out.push({
          name: entry.name,
          path: path.relative(project.path, full),
          size: stat.size,
          modified: stat.mtime.toISOString(),
          kind: classify(entry.name),
        });
      }
    }
  };
  walk(project.path);
  return out.sort((a, b) => b.modified.localeCompare(a.modified));
}

function safeFilePath(project: Project, rel: string): string {
  const target = path.resolve(project.path, rel);
  if (target !== project.path && !target.startsWith(project.path + path.sep)) {
    throw new Error('Path escapes the project directory');
  }
  return target;
}

export function readFileContent(
  projectId: string,
  rel: string
): { kind: WorkspaceFile['kind']; content: Buffer; mime: string } {
  const project = getProject(projectId);
  if (!project) throw new Error('Project not found');
  const target = safeFilePath(project, rel);
  if (!fs.existsSync(target)) throw new Error('File not found');
  const ext = path.extname(target).toLowerCase();
  const mime = mimeFor(ext);
  return { kind: classify(rel), content: fs.readFileSync(target), mime };
}

export function writeFileContent(
  projectId: string,
  rel: string,
  content: string
): WorkspaceFile {
  const project = getProject(projectId);
  if (!project) throw new Error('Project not found');
  const target = safeFilePath(project, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  const stat = fs.statSync(target);
  return {
    name: path.basename(target),
    path: path.relative(project.path, target),
    size: stat.size,
    modified: stat.mtime.toISOString(),
    kind: classify(target),
  };
}

function mimeFor(ext: string): string {
  const map: Record<string, string> = {
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
  };
  return map[ext] || 'application/octet-stream';
}
