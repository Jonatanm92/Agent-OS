import fs from 'fs';
import path from 'path';
import { resolveConfig } from '../config.js';

/**
 * Memory pillar — plain-markdown vault operations.
 *
 * Agent OS reads/writes memory as ordinary `.md` files inside a folder. Point
 * OBSIDIAN_VAULT_PATH at your Obsidian vault and the same notes open in
 * Obsidian. This works WITHOUT the desktop app running; for full agent access
 * via Claude Code, wire the official obsidian-mcp-server (see mcp/obsidian.mcp.json).
 */

function vaultDir(): string {
  const dir = resolveConfig().vaultPath;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Reject paths that escape the vault. */
function safeJoin(rel: string): string {
  const base = vaultDir();
  const target = path.resolve(base, rel);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error('Path escapes the vault');
  }
  return target;
}

export interface NoteSummary {
  name: string;
  path: string;
  size: number;
  modified: string;
}

export function listNotes(): NoteSummary[] {
  const base = vaultDir();
  const out: NoteSummary[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.md')) {
        const stat = fs.statSync(full);
        out.push({
          name: entry.name,
          path: path.relative(base, full),
          size: stat.size,
          modified: stat.mtime.toISOString(),
        });
      }
    }
  };
  walk(base);
  return out.sort((a, b) => b.modified.localeCompare(a.modified));
}

export function readNote(rel: string): string {
  const target = safeJoin(rel);
  if (!fs.existsSync(target)) throw new Error('Note not found');
  return fs.readFileSync(target, 'utf8');
}

/** Create or overwrite a note. */
export function writeNote(rel: string, content: string): NoteSummary {
  const name = rel.endsWith('.md') ? rel : `${rel}.md`;
  const target = safeJoin(name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  const stat = fs.statSync(target);
  return {
    name: path.basename(target),
    path: path.relative(vaultDir(), target),
    size: stat.size,
    modified: stat.mtime.toISOString(),
  };
}

/** Append a timestamped block to a note (creates it if missing). */
export function appendNote(rel: string, content: string): NoteSummary {
  const name = rel.endsWith('.md') ? rel : `${rel}.md`;
  const target = safeJoin(name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const stamp = new Date().toISOString();
  const block = `\n\n---\n*${stamp}*\n\n${content}\n`;
  fs.appendFileSync(target, fs.existsSync(target) ? block : block.trimStart(), 'utf8');
  const stat = fs.statSync(target);
  return {
    name: path.basename(target),
    path: path.relative(vaultDir(), target),
    size: stat.size,
    modified: stat.mtime.toISOString(),
  };
}

export interface SearchHit {
  path: string;
  line: number;
  text: string;
}

/** Naive full-text search across the vault. */
export function searchNotes(query: string): SearchHit[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const hits: SearchHit[] = [];
  for (const note of listNotes()) {
    const content = readNote(note.path).split('\n');
    content.forEach((line, i) => {
      if (line.toLowerCase().includes(q)) {
        hits.push({ path: note.path, line: i + 1, text: line.trim().slice(0, 200) });
      }
    });
    if (hits.length > 100) break;
  }
  return hits.slice(0, 100);
}

/**
 * Build a system-prompt memory preamble from the vault. Concatenates the most
 * recently modified notes up to a character budget so the agent has context.
 */
export function buildMemoryContext(maxChars = 6000): string {
  const notes = listNotes();
  if (notes.length === 0) return '';
  let budget = maxChars;
  const parts: string[] = [];
  for (const note of notes) {
    if (budget <= 0) break;
    const body = readNote(note.path).slice(0, budget);
    budget -= body.length;
    parts.push(`# ${note.path}\n${body}`);
  }
  return [
    'The following are notes from the user\'s Obsidian memory vault. Use them as persistent context about the user, their projects, and prior decisions:',
    '',
    parts.join('\n\n'),
  ].join('\n');
}
