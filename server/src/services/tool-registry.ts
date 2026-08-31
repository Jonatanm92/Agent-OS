import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatSandboxResult,
  normalizeSandboxTask,
  runSandboxTask,
  type SandboxTask,
} from './sandbox.js';

/**
 * Capability-limited tool registry.
 *
 * Repository-controlled tools.json may expose only:
 *   - builtin: pure Node.js read-only helpers implemented in this module
 *   - sandbox: one fixed task from sandbox.ts
 *
 * Shell templates and arbitrary HTTP requests are deliberately unsupported.
 * This prevents model-controlled placeholder values from becoming command or
 * URL injection paths on the owner's machine.
 */

export interface ToolDef {
  name: string;
  description: string;
  type: 'builtin' | 'sandbox';
  builtin?: 'grep' | 'tree';
  task?: SandboxTask;
}

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.company-runtime',
  'node_modules',
  'target',
  'dist',
]);
const SEARCHABLE_EXTENSIONS = new Set([
  '.c',
  '.cpp',
  '.css',
  '.h',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.py',
  '.rs',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

let cache: ToolDef[] | null = null;
let cacheTime = 0;

function toolsPath(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), 'tools.json'),
    path.resolve(process.cwd(), 'server', 'tools.json'),
    path.resolve(moduleDirectory, '../../../tools.json'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function normalizeTool(value: unknown): ToolDef | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const name = typeof source.name === 'string' ? source.name.trim() : '';
  const description = typeof source.description === 'string' ? source.description.trim() : '';
  const type = source.type;
  if (!name || !description) return null;

  if (type === 'builtin' && (source.builtin === 'grep' || source.builtin === 'tree')) {
    return { name, description, type, builtin: source.builtin };
  }
  if (type === 'sandbox') {
    const task = normalizeSandboxTask(source.task);
    if (task) return { name, description, type, task };
  }
  return null;
}

export function listTools(): ToolDef[] {
  const now = Date.now();
  if (cache && now - cacheTime < 5000) return cache;
  const p = toolsPath();
  if (!fs.existsSync(p)) {
    cache = [];
    cacheTime = now;
    return [];
  }
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const values = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { tools?: unknown }).tools)
        ? ((parsed as { tools: unknown[] }).tools)
        : [];
    cache = values.map(normalizeTool).filter((tool): tool is ToolDef => Boolean(tool));
    cacheTime = now;
    return cache;
  } catch {
    cache = [];
    cacheTime = now;
    return [];
  }
}

export function findTool(name: string): ToolDef | undefined {
  return listTools().find((tool) => tool.name === name);
}

function safeFiles(root: string, limit = 500): string[] {
  const output: string[] = [];
  const walk = (directory: string): void => {
    if (output.length >= limit) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (output.length >= limit) return;
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      const full = path.join(directory, entry.name);
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(full);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile()) output.push(path.relative(root, full));
    }
  };
  walk(root);
  return output;
}

function executeTree(cwd: string): string {
  const files = safeFiles(cwd, 100);
  return files.length ? files.join('\n') : '(project is empty)';
}

function executeGrep(cwd: string, input: unknown): string {
  const query = typeof input === 'string' ? input.trim() : '';
  if (!query) return 'ERROR: grep requires a non-empty input string';
  if (query.length > 200 || /[\r\n\0]/.test(query)) {
    return 'ERROR: grep input is too long or contains unsupported control characters';
  }

  const needle = query.toLowerCase();
  const matches: string[] = [];
  for (const relative of safeFiles(cwd, 1000)) {
    if (matches.length >= 30) break;
    if (!SEARCHABLE_EXTENSIONS.has(path.extname(relative).toLowerCase())) continue;
    const full = path.join(cwd, relative);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(full);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > 1024 * 1024) continue;

    let content: string;
    try {
      content = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length && matches.length < 30; index++) {
      if (lines[index].toLowerCase().includes(needle)) {
        matches.push(`${relative}:${index + 1}: ${lines[index].slice(0, 300)}`);
      }
    }
  }
  return matches.length ? matches.join('\n') : '(no matches)';
}

export function executeTool(tool: ToolDef, args: Record<string, unknown>, cwd: string): string {
  try {
    const root = path.resolve(cwd);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      return 'ERROR: active project directory is unavailable';
    }

    if (tool.type === 'builtin') {
      if (tool.builtin === 'tree') return executeTree(root);
      if (tool.builtin === 'grep') {
        return executeGrep(root, args.input ?? args.query);
      }
      return 'ERROR: unsupported builtin capability';
    }

    if (tool.type === 'sandbox' && tool.task) {
      return formatSandboxResult(runSandboxTask(root, tool.task, 120_000));
    }

    return 'BLOCKED BY POLICY: unsupported tool capability';
  } catch (error) {
    return `ERROR: ${error instanceof Error ? error.message : String(error)}`;
  }
}
