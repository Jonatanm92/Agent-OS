import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { getDb } from './db/index.js';
import { seedDefaults } from './db/seed.js';
import { resolveConfig, getAllSettings, setSetting } from './config.js';
import * as fcc from './services/fcc.js';
import * as memory from './services/memory.js';
import * as workspace from './services/workspace.js';
import { listAgentViews, getAgent } from './services/agents.js';
import * as hermes from './services/hermes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Bootstrap ──────────────────────────────────────────────────────────────
const db = getDb();
seedDefaults(db);
const defaultProject = workspace.ensureDefaultProject();
if (!getAllSettings().active_project_id) {
  setSetting('active_project_id', defaultProject.id);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const api = express.Router();

const wrap =
  (fn: (req: Request, res: Response) => unknown) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (err) {
      next(err);
    }
  };

// ── Auth (opt-in via AGENT_OS_PASSWORD) ───────────────────────────────────────
// When a password is configured, every /api route except the public ones below
// requires a matching token header. When it's blank, auth is disabled entirely.
const PUBLIC_PATHS = new Set(['/health', '/auth/status', '/auth/login']);

api.use((req: Request, res: Response, next: NextFunction) => {
  const { password } = resolveConfig();
  if (!password) return next(); // auth disabled
  if (PUBLIC_PATHS.has(req.path)) return next();
  const token = req.header('x-agentos-token');
  if (token && token === password) return next();
  return res.status(401).json({ error: 'unauthorized' });
});

api.get('/auth/status', (_req, res) => {
  res.json({ required: !!resolveConfig().password });
});

api.post('/auth/login', (req, res) => {
  const { password } = resolveConfig();
  if (!password) return res.json({ ok: true, token: '' }); // no auth needed
  const supplied = String(req.body?.password ?? '');
  if (supplied && supplied === password) return res.json({ ok: true, token: password });
  return res.status(401).json({ error: 'invalid password' });
});

// ── Health & status ─────────────────────────────────────────────────────────
api.get('/health', (_req, res) => res.json({ ok: true }));

api.get(
  '/status',
  wrap(async (_req, res) => {
    const status = await fcc.getStatus();
    res.json(status);
  })
);

// ── Settings ─────────────────────────────────────────────────────────────────
api.get('/settings', (_req, res) => {
  const cfg = resolveConfig();
  res.json({
    settings: getAllSettings(),
    resolved: {
      fccBaseUrl: cfg.fccBaseUrl,
      model: cfg.model,
      vaultPath: cfg.vaultPath,
      scratchDir: cfg.scratchDir,
    },
  });
});

api.post('/settings', (req, res) => {
  const updates = req.body as Record<string, string>;
  const allowed = ['fcc_base_url', 'fcc_auth_token', 'model', 'obsidian_vault_path', 'active_project_id', 'hermes_provider'];
  for (const [key, value] of Object.entries(updates)) {
    // Allow the fixed keys plus any per-agent model override (agent_model_<id>).
    if (allowed.includes(key) || key.startsWith('agent_model_')) {
      setSetting(key, String(value ?? ''));
    }
  }
  res.json({ ok: true, settings: getAllSettings() });
});

// ── Agents (routing profiles through FCC + CLI-backed agents) ─────────────────
api.get(
  '/agents',
  wrap(async (_req, res) => {
    const hermesUp = await hermes.isAvailable();
    const agents = listAgentViews().map((a) => ({
      ...a,
      available: a.backend === 'cli' ? hermesUp : true,
    }));
    res.json({ agents });
  })
);

// ── Projects (workspace scoping) ──────────────────────────────────────────────
api.get('/projects', (_req, res) => {
  res.json({
    projects: workspace.listProjects(),
    activeProjectId: getAllSettings().active_project_id,
  });
});

api.post('/projects', (req, res) => {
  const name = String((req.body?.name ?? '').trim());
  if (!name) return res.status(400).json({ error: 'name required' });
  const project = workspace.createProject(name);
  res.json({ project });
});

api.post('/projects/:id/activate', (req, res) => {
  const project = workspace.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'project not found' });
  setSetting('active_project_id', project.id);
  res.json({ ok: true, activeProjectId: project.id });
});

// ── Conversations & history ───────────────────────────────────────────────────
interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string | null;
  created_at: string;
}

api.get('/conversations', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM conversations ORDER BY updated_at DESC')
    .all();
  res.json({ conversations: rows });
});

api.get('/conversations/:id', (req, res) => {
  const convo = db
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .get(req.params.id);
  if (!convo) return res.status(404).json({ error: 'not found' });
  const messages = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(req.params.id);
  res.json({ conversation: convo, messages });
});

api.delete('/conversations/:id', (req, res) => {
  db.prepare('DELETE FROM conversations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Chat (routes through FCC) ─────────────────────────────────────────────────
api.post(
  '/chat',
  wrap(async (req, res) => {
    const message = String(req.body?.message ?? '').trim();
    if (!message) return res.status(400).json({ error: 'message required' });
    const useMemory = req.body?.useMemory !== false;

    // Resolve or create the conversation
    let conversationId: string = req.body?.conversationId;
    const now = new Date().toISOString();
    let agentId: string = getAgent(String(req.body?.agentId ?? '')).id;

    if (conversationId) {
      // Existing conversation keeps its original agent.
      const existing = db
        .prepare('SELECT agent_id FROM conversations WHERE id = ?')
        .get(conversationId) as { agent_id?: string } | undefined;
      if (existing?.agent_id) agentId = existing.agent_id;
    } else {
      conversationId = randomUUID();
      const title = message.slice(0, 60);
      db.prepare(
        'INSERT INTO conversations (id, title, project_id, agent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(conversationId, title, getAllSettings().active_project_id || null, agentId, now, now);
    }

    // Persist user message
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(randomUUID(), conversationId, 'user', message, now);

    // Build history from DB
    const rows = db
      .prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId) as { role: string; content: string }[];
    const history: fcc.ChatTurn[] = rows
      .filter((r) => r.role === 'user' || r.role === 'assistant')
      .map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content }));

    const system = useMemory ? memory.buildMemoryContext() : undefined;

    const result = await fcc.runAgent(agentId, history, system);

    // Persist assistant reply
    const replyAt = new Date().toISOString();
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(randomUUID(), conversationId, 'assistant', result.text, replyAt);
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(replyAt, conversationId);

    res.json({
      conversationId,
      agentId,
      reply: result.text,
      usage: result.usage,
      model: result.model,
    });
  })
);

// ── Memory (Obsidian vault) ───────────────────────────────────────────────────
api.get('/memory/notes', (_req, res) => res.json({ notes: memory.listNotes() }));

api.get('/memory/note', (req, res) => {
  const rel = String(req.query.path ?? '');
  if (!rel) return res.status(400).json({ error: 'path required' });
  res.json({ path: rel, content: memory.readNote(rel) });
});

api.post('/memory/note', (req, res) => {
  const { path: rel, content, append } = req.body ?? {};
  if (!rel) return res.status(400).json({ error: 'path required' });
  const note = append
    ? memory.appendNote(String(rel), String(content ?? ''))
    : memory.writeNote(String(rel), String(content ?? ''));
  res.json({ note });
});

api.get('/memory/search', (req, res) => {
  res.json({ hits: memory.searchNotes(String(req.query.q ?? '')) });
});

// ── Memory loop: distil a conversation into durable vault notes ───────────────
// This is the real "gets smarter over time" mechanism: salient facts from chats
// are written back into the shared Obsidian vault that every agent reads.
function slugify(s: string): string {
  return (
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'chat'
  );
}

api.post(
  '/memory/summarize',
  wrap(async (req, res) => {
    const conversationId = String(req.body?.conversationId ?? '');
    if (!conversationId) return res.status(400).json({ error: 'conversationId required' });
    const convo = db
      .prepare('SELECT * FROM conversations WHERE id = ?')
      .get(conversationId) as { title?: string; agent_id?: string } | undefined;
    if (!convo) return res.status(404).json({ error: 'conversation not found' });

    const rows = db
      .prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId) as { role: string; content: string }[];
    if (rows.length === 0) return res.status(400).json({ error: 'conversation is empty' });

    const transcript = rows.map((r) => `${r.role}: ${r.content}`).join('\n');
    const prompt =
      'From the conversation below, extract durable facts worth remembering long-term ' +
      'about the user, their projects, preferences, and decisions. Output 3-6 short markdown ' +
      'bullet points only — no preamble, no headers.\n\nCONVERSATION:\n' +
      transcript;

    // Summaries must be reliable, so use an FCC-backed agent (never the CLI one).
    const convoAgent = convo.agent_id && getAgent(convo.agent_id).backend === 'fcc'
      ? convo.agent_id
      : 'free-claude-code';
    const result = await fcc.runAgent(convoAgent, [{ role: 'user', content: prompt }]);

    const date = new Date().toISOString().slice(0, 10);
    const notePath = `Memory/${date}-${slugify(convo.title ?? 'chat')}.md`;
    const body =
      `# ${convo.title ?? 'Conversation'}\n\n` +
      `_Saved ${new Date().toISOString()} • distilled by ${convoAgent}_\n\n` +
      `${result.text}\n`;
    const note = memory.writeNote(notePath, body);
    res.json({ note, summary: result.text });
  })
);

// Quick "remember this" — append a fact to a running memory inbox note.
api.post('/memory/remember', (req, res) => {
  const text = String(req.body?.text ?? '').trim();
  if (!text) return res.status(400).json({ error: 'text required' });
  const note = memory.appendNote('Memory/Inbox.md', text);
  res.json({ note });
});

// ── Workspace files ────────────────────────────────────────────────────────────
api.get('/workspace/files', (req, res) => {
  const projectId = String(req.query.projectId ?? getAllSettings().active_project_id);
  res.json({ files: workspace.listFiles(projectId) });
});

api.get('/workspace/file', (req, res) => {
  const projectId = String(req.query.projectId ?? getAllSettings().active_project_id);
  const rel = String(req.query.path ?? '');
  if (!rel) return res.status(400).json({ error: 'path required' });
  const { content, mime } = workspace.readFileContent(projectId, rel);
  res.setHeader('Content-Type', mime);
  res.send(content);
});

api.post('/workspace/file', (req, res) => {
  const projectId = String(req.body?.projectId ?? getAllSettings().active_project_id);
  const rel = String(req.body?.path ?? '');
  if (!rel) return res.status(400).json({ error: 'path required' });
  const file = workspace.writeFileContent(projectId, rel, String(req.body?.content ?? ''));
  res.json({ file });
});

app.use('/api', api);

// ── Static client (production build) ────────────────────────────────────────────
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[agent-os]', err.message);
  res.status(500).json({ error: err.message });
});

const { port } = resolveConfig();
app.listen(port, () => {
  const cfg = resolveConfig();
  console.log(`\n  Agent OS — Mission Control`);
  console.log(`  ▸ Dashboard:  http://127.0.0.1:${port}`);
  console.log(`  ▸ FCC proxy:  ${cfg.fccBaseUrl}  (model: ${cfg.model})`);
  console.log(`  ▸ Vault:      ${cfg.vaultPath}`);
  console.log(`  ▸ Scratch:    ${cfg.scratchDir}`);
  console.log(`  ▸ Auth:       ${cfg.password ? 'password required' : 'open (no password set)'}\n`);
});

export { app };
