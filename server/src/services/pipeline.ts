import { randomUUID } from 'crypto';
import { getDb } from '../db/index.js';
import { getAllSettings } from '../config.js';
import * as fcc from './fcc.js';
import * as memory from './memory.js';
import { runAgentic } from './agentic.js';
import { resolveAgentIdentity } from './agents.js';

/**
 * Pipeline (Components 6 & 7) — "From Inbox to Shipped".
 *
 *   capture  → an idea is dropped in (raw text)
 *   (shape)  → an agent classifies it: type, tags, score, a short plan
 *   gate     → the ONE human checkpoint: you approve
 *   execute  → the agent build loop produces a real deliverable in the workspace
 *   shipped  → done, and filed to the Obsidian vault under Pipeline/
 */

export type Stage = 'capture' | 'gate' | 'execute' | 'shipped';

export interface PipelineItem {
  id: string;
  title: string;
  raw: string;
  stage: Stage;
  item_type: string;
  tags: string; // JSON array string in DB
  plan: string;
  score: number;
  deliverable: string;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

function db() {
  return getDb();
}

export function list(): (Omit<PipelineItem, 'tags'> & { tags: string[] })[] {
  const rows = db()
    .prepare('SELECT * FROM pipeline_items ORDER BY updated_at DESC')
    .all() as PipelineItem[];
  return rows.map((r) => ({ ...r, tags: safeTags(r.tags) }));
}

function safeTags(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function get(id: string): PipelineItem | undefined {
  return db().prepare('SELECT * FROM pipeline_items WHERE id = ?').get(id) as
    | PipelineItem
    | undefined;
}

function slugify(s: string): string {
  return (
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'item'
  );
}

function fileToVault(item: PipelineItem): void {
  const tags = safeTags(item.tags);
  const body =
    `# ${item.title}\n\n` +
    `- **Stage:** ${item.stage}\n` +
    `- **Type:** ${item.item_type}\n` +
    `- **Score:** ${item.score}%\n` +
    `- **Tags:** ${tags.map((t) => '#' + t).join(' ')}\n` +
    `- **Updated:** ${item.updated_at}\n\n` +
    `## Idea\n${item.raw}\n\n` +
    (item.plan ? `## Plan\n${item.plan}\n\n` : '') +
    (item.deliverable ? `## Deliverable\n${item.deliverable}\n` : '');
  try {
    // Name the note by the original idea (stable across stages) to avoid orphans.
    memory.writeNote(`Pipeline/${slugify(item.raw || item.title)}.md`, body);
  } catch {
    /* vault write is best-effort */
  }
}

/** Capture a raw idea into the pipeline. */
export function capture(idea: string): PipelineItem {
  const now = new Date().toISOString();
  const id = randomUUID();
  const title = idea.trim().split('\n')[0].slice(0, 80) || 'Untitled idea';
  db()
    .prepare(
      'INSERT INTO pipeline_items (id, title, raw, stage, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(id, title, idea.trim(), 'capture', now, now);
  const item = get(id)!;
  fileToVault(item);
  return item;
}

function update(id: string, fields: Partial<PipelineItem>): PipelineItem {
  const now = new Date().toISOString();
  const cur = get(id);
  if (!cur) throw new Error('item not found');
  const merged = { ...cur, ...fields, updated_at: now };
  db()
    .prepare(
      'UPDATE pipeline_items SET title=?, raw=?, stage=?, item_type=?, tags=?, plan=?, score=?, deliverable=?, project_id=?, updated_at=? WHERE id=?'
    )
    .run(
      merged.title,
      merged.raw,
      merged.stage,
      merged.item_type,
      typeof merged.tags === 'string' ? merged.tags : JSON.stringify(merged.tags),
      merged.plan,
      merged.score,
      merged.deliverable,
      merged.project_id,
      now,
      id
    );
  const out = get(id)!;
  fileToVault(out);
  return out;
}

export function remove(id: string): void {
  db().prepare('DELETE FROM pipeline_items WHERE id = ?').run(id);
}

/** Pull the first JSON object out of a model reply. */
function parseJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const t = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a === -1 || b === -1 || b < a) return null;
  try {
    return JSON.parse(t.slice(a, b + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Shape: an agent classifies + plans the idea, then it moves to the human gate. */
export async function shape(id: string, agentId = 'free-claude-code'): Promise<PipelineItem> {
  const item = get(id);
  if (!item) throw new Error('item not found');
  const prompt =
    'Classify and plan this idea for a build pipeline. Respond with ONLY a JSON object:\n' +
    '{"title": "...", "type": "project|action|idea|reference", "tags": ["..."], ' +
    '"score": 0-100, "plan": "3-5 short steps"}\n\nIDEA:\n' +
    item.raw;
  const result = await fcc.runAgent(agentId, [{ role: 'user', content: prompt }], resolveAgentIdentity(agentId));
  const parsed = parseJson(result.text) ?? {};
  return update(id, {
    title: typeof parsed.title === 'string' && parsed.title ? parsed.title : item.title,
    item_type: typeof parsed.type === 'string' ? parsed.type : 'idea',
    tags: JSON.stringify(Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6) : []),
    score: Number.isFinite(Number(parsed.score)) ? Math.max(0, Math.min(100, Number(parsed.score))) : 50,
    plan: typeof parsed.plan === 'string' ? parsed.plan : '',
    stage: 'gate',
  });
}

/** Approve: the single human checkpoint. Moves to execute. */
export function approve(id: string): PipelineItem {
  return update(id, { stage: 'execute' });
}

/** Execute: run the build loop to produce a real deliverable, then ship + file it. */
export async function execute(id: string, agentId = 'free-claude-code'): Promise<PipelineItem> {
  const item = get(id);
  if (!item) throw new Error('item not found');
  const projectId = item.project_id || getAllSettings().active_project_id || '';
  const goal =
    `Build the deliverable for this task. Create the necessary files in the project.\n\n` +
    `TITLE: ${item.title}\nPLAN:\n${item.plan || '(no plan; use your judgement)'}\n\nIDEA:\n${item.raw}`;
  const ar = await runAgentic(agentId, [{ role: 'user', content: goal }], projectId, resolveAgentIdentity(agentId), 8);
  const built = ar.steps
    .filter((s) => s.tool === 'write_file')
    .map((s) => (s.args as { path?: string }).path)
    .filter(Boolean);
  const deliverable =
    (ar.reply ? ar.reply + '\n\n' : '') +
    (built.length ? `Files: ${built.join(', ')}` : '(no files written)');
  return update(id, { stage: 'shipped', deliverable, project_id: projectId });
}
