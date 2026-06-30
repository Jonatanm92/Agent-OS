import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Tool Registry (Primitive #6) — extensible tools via a JSON config.
 *
 * Tools are defined in tools.json at the repo root. Each tool has a name,
 * description, and either:
 *   - type:"shell" + command template ({{input}} placeholder)
 *   - type:"http" + url template + method
 *
 * The agent loop (agentic.ts) checks this registry for any tool name it doesn't
 * recognize built-in, enabling expansion without code changes.
 */

export interface ToolDef {
  name: string;
  description: string;
  type: 'shell' | 'http';
  command?: string; // for shell: command template with {{input}} and {{args.*}}
  url?: string; // for http
  method?: string;
}

let cache: ToolDef[] | null = null;
let cacheTime = 0;

function toolsPath(): string {
  // Look in the repo root (2 levels up from dist/services/)
  return path.resolve(process.cwd(), 'tools.json');
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
    const parsed = JSON.parse(raw);
    cache = Array.isArray(parsed) ? parsed : (parsed.tools ?? []);
    cacheTime = now;
    return cache!;
  } catch {
    cache = [];
    cacheTime = now;
    return [];
  }
}

export function findTool(name: string): ToolDef | undefined {
  return listTools().find((t) => t.name === name);
}

export function executeTool(tool: ToolDef, args: Record<string, unknown>, cwd: string): string {
  if (tool.type === 'shell') {
    let cmd = tool.command ?? '';
    // Replace {{input}} and {{args.key}} placeholders.
    const input = String(args.input ?? args.query ?? args.command ?? '');
    cmd = cmd.replace(/\{\{\s*input\s*\}\}/g, input);
    for (const [k, v] of Object.entries(args)) {
      cmd = cmd.replace(new RegExp(`\\{\\{\\s*args\\.${k}\\s*\\}\\}`, 'g'), String(v));
    }
    if (!cmd.trim()) return 'ERROR: empty command after template expansion';
    try {
      const out = execSync(cmd, { cwd, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
      return (out || '(no output)').slice(0, 4000);
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string; message?: string };
      return `ERROR: ${(err.stderr || err.stdout || err.message || 'failed').toString().slice(0, 2000)}`;
    }
  }
  if (tool.type === 'http') {
    // Simple sync HTTP via curl (keeps it dependency-free).
    const url = (tool.url ?? '').replace(/\{\{\s*input\s*\}\}/g, encodeURIComponent(String(args.input ?? '')));
    const method = (tool.method ?? 'GET').toUpperCase();
    try {
      const out = execSync(
        `curl -s -m 15 -X ${method} "${url}"`,
        { cwd, encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      return (out || '(no response)').slice(0, 4000);
    } catch (e) {
      return `ERROR: HTTP tool failed — ${(e as Error).message}`;
    }
  }
  return `ERROR: unknown tool type "${tool.type}"`;
}
