import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import http from 'http';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

import { getDb } from './db/index.js';
import { seedDefaults } from './db/seed.js';
import { resolveConfig, getAllSettings, setSetting } from './config.js';
import * as fcc from './services/fcc.js';
import * as memory from './services/memory.js';
import * as workspace from './services/workspace.js';
import { listAgentViews, getAgent, resolveAgentIdentity } from './services/agents.js';
import * as hermes from './services/hermes.js';
import { runAgentic } from './services/agentic.js';
import * as pipeline from './services/pipeline.js';
import * as runner from './services/runner.js';
import * as studio from './services/studio.js';
import * as templates from './services/templates.js';
import * as git from './services/git.js';
import * as orchestrator from './services/orchestrator.js';
import { attachTerminal } from './terminal.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Bootstrap ──────────────────────────────────────────────────────────────
const db = getDb();
seedDefaults(db);
const defaultProject = workspace.ensureDefaultProject();
if (!getAllSettings().active_project_id) {
  setSetting('active_project_id', defaultProject.id);
}

// Seed default music-dev skills on first boot.
if (studio.listSkills().length === 0) {
  studio.createSkill({
    name: 'DSP: Design a waveshaper',
    prompt: 'Design a guitar amp waveshaper function. Input: {{input}}. Output: C++ or Rust code with explanation of the harmonic content and how it suits modern metal/thall tones.',
    agent_id: 'dsp-engineer',
  });
  studio.createSkill({
    name: 'Plugin: Scaffold JUCE project',
    prompt: 'Generate the folder structure and key files (PluginProcessor, PluginEditor, CMakeLists) for a JUCE audio plugin called "{{input}}". Use best practices for VST3/AU. Output as named code blocks.',
    agent_id: 'plugin-architect',
  });
  studio.createSkill({
    name: 'YouTube: Video title ideas',
    prompt: 'Generate 10 YouTube title ideas for a guitar cover video of "{{input}}". The channel is modern metal/thall focused. Make them SEO-friendly and attention-grabbing.',
    agent_id: 'free-claude-code',
  });
  studio.createSkill({
    name: 'Song: Chord progression for metal',
    prompt: 'Write a djent/thall chord progression in {{input}} tuning. Include tab notation, rhythmic pattern (polyrhythmic preferred), and suggest a tempo. Think Meshuggah, Periphery, Vildhjarta.',
    agent_id: 'free-claude-code',
  });
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

// Mission Control: one snapshot of every agent, signal, and stat.
api.get(
  '/overview',
  wrap(async (_req, res) => {
    const status = await fcc.getStatus();
    const hermesUp = await hermes.isAvailable();
    const agents = listAgentViews().map((a) => ({
      ...a,
      available: a.backend === 'cli' ? hermesUp : status.ok,
    }));
    const count = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
    let notes = 0;
    try {
      notes = memory.listNotes().length;
    } catch {
      notes = 0;
    }
    res.json({
      status,
      agents,
      stats: {
        conversations: count('SELECT COUNT(*) c FROM conversations'),
        messages: count('SELECT COUNT(*) c FROM messages'),
        pipeline: pipeline.list().length,
        notes,
        projects: workspace.listProjects().length,
      },
      time: new Date().toISOString(),
    });
  })
);

// Claude Code readiness: does this model's tool-calling work through FCC?
api.post(
  '/fcc/probe',
  wrap(async (req, res) => {
    const model = req.body?.model ? String(req.body.model) : undefined;
    res.json(await fcc.probeToolSupport(model));
  })
);

// One-click: set FCC's MODEL by writing ~/.fcc/.env (then user restarts fcc-server).
api.post('/fcc/set-model', (req, res) => {
  const model = String(req.body?.model ?? '').trim();
  if (!model) return res.status(400).json({ error: 'model required' });
  const fccEnv = path.join(os.homedir(), '.fcc', '.env');
  fs.mkdirSync(path.dirname(fccEnv), { recursive: true });
  const existing = fs.existsSync(fccEnv) ? fs.readFileSync(fccEnv, 'utf8').split(/\r?\n/) : [];
  let found = false;
  const updated = existing
    .filter((l) => l !== '')
    .map((l) => (/^MODEL=/.test(l) ? ((found = true), `MODEL=${model}`) : l));
  if (!found) updated.push(`MODEL=${model}`);
  fs.writeFileSync(fccEnv, updated.join('\n') + '\n', 'utf8');
  res.json({ ok: true, path: fccEnv, note: 'Saved. Restart fcc-server for this to take effect.' });
});

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
    if (allowed.includes(key) || key.startsWith('agent_model_') || key.startsWith('agent_identity_')) {
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

// Component 8 — feedback loop: rate an assistant message (1 up / -1 down / 0 clear).
api.post('/messages/:id/rating', (req, res) => {
  const rating = Number(req.body?.rating);
  if (![1, 0, -1].includes(rating)) {
    return res.status(400).json({ error: 'rating must be 1, 0, or -1' });
  }
  db.prepare('UPDATE messages SET rating = ? WHERE id = ?').run(rating, req.params.id);
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

    // Compose the system prompt: identity (Component 1) + shared memory (Component 3).
    const identity = resolveAgentIdentity(agentId);
    const memoryCtx = useMemory ? memory.buildMemoryContext() : '';
    const system = [identity, memoryCtx].filter((s) => s && s.trim()).join('\n\n') || undefined;

    // Agent mode runs a real tool loop (write/read/list files) against the active
    // project. Plain mode is a single chat turn.
    const useAgentic = req.body?.agentic === true;
    let replyText: string;
    let usedModel: string;
    let usage: { input_tokens?: number; output_tokens?: number } | undefined;

    if (useAgentic) {
      const projectId = getAllSettings().active_project_id || '';
      const ar = await runAgentic(agentId, history, projectId, system);
      usedModel = ar.model;
      const log = ar.steps.length
        ? '\n\n---\n**Actions taken:**\n' +
          ar.steps
            .map((s) => {
              const p = (s.args as { path?: string }).path;
              return `- \`${s.tool}\`${p ? ` ${p}` : ''} → ${s.result.split('\n')[0].slice(0, 100)}`;
            })
            .join('\n')
        : '';
      replyText = ar.reply + log;
    } else {
      const result = await fcc.runAgent(agentId, history, system);
      replyText = result.text;
      usedModel = result.model;
      usage = result.usage;
    }

    // Persist assistant reply
    const replyAt = new Date().toISOString();
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(randomUUID(), conversationId, 'assistant', replyText, replyAt);
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(replyAt, conversationId);

    res.json({
      conversationId,
      agentId,
      reply: replyText,
      usage,
      model: usedModel,
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

// Save code blocks from a message into the active project (one-click "save the agent's code").
api.post('/workspace/extract', (req, res) => {
  const projectId = String(req.body?.projectId ?? getAllSettings().active_project_id);
  const text = String(req.body?.text ?? '');
  if (!text) return res.status(400).json({ error: 'text required' });
  res.json(workspace.extractFiles(projectId, text));
});

// ── Run & Preview ─────────────────────────────────────────────────────────────
api.get('/run/:projectId/status', (req, res) => {
  res.json(runner.status(req.params.projectId));
});
api.get('/run/:projectId/logs', (req, res) => {
  res.json({ logs: runner.logs(req.params.projectId) });
});
api.post('/run/:projectId/start', (req, res) => {
  try {
    res.json(runner.start(req.params.projectId, String(req.body?.command ?? '')));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'failed' });
  }
});
api.post('/run/:projectId/stop', (req, res) => {
  runner.stop(req.params.projectId);
  res.json({ ok: true });
});

// ── Pipeline (From Inbox to Shipped) ──────────────────────────────────────────
api.get('/pipeline', (_req, res) => {
  res.json({ items: pipeline.list() });
});

api.post('/pipeline/capture', (req, res) => {
  const idea = String(req.body?.idea ?? '').trim();
  if (!idea) return res.status(400).json({ error: 'idea required' });
  res.json({ item: pipeline.capture(idea) });
});

api.post(
  '/pipeline/:id/shape',
  wrap(async (req, res) => {
    const agentId = getAgent(String(req.body?.agentId ?? 'free-claude-code')).id;
    res.json({ item: await pipeline.shape(req.params.id, agentId) });
  })
);

api.post('/pipeline/:id/approve', (req, res) => {
  res.json({ item: pipeline.approve(req.params.id) });
});

api.post(
  '/pipeline/:id/execute',
  wrap(async (req, res) => {
    const agentId = getAgent(String(req.body?.agentId ?? 'free-claude-code')).id;
    res.json({ item: await pipeline.execute(req.params.id, agentId) });
  })
);

api.delete('/pipeline/:id', (req, res) => {
  pipeline.remove(req.params.id);
  res.json({ ok: true });
});

// ── Studio: Skills + Loops (automation) + Audit (Level 1) ─────────────────────
api.get('/skills', (_req, res) => res.json({ skills: studio.listSkills() }));
api.post('/skills', (req, res) => res.json({ skill: studio.createSkill(req.body ?? {}) }));
api.delete('/skills/:id', (req, res) => {
  studio.deleteSkill(req.params.id);
  res.json({ ok: true });
});
api.post(
  '/skills/:id/run',
  wrap(async (req, res) => {
    res.json(await studio.runSkill(req.params.id, String(req.body?.input ?? '')));
  })
);

api.get('/loops', (_req, res) => res.json({ loops: studio.listLoops() }));
api.post('/loops', (req, res) => res.json({ loop: studio.createLoop(req.body ?? {}) }));
api.delete('/loops/:id', (req, res) => {
  studio.deleteLoop(req.params.id);
  res.json({ ok: true });
});
api.post('/loops/:id/toggle', (req, res) => {
  res.json({ loop: studio.setLoopEnabled(req.params.id, req.body?.enabled !== false) });
});
api.post(
  '/loops/:id/run',
  wrap(async (req, res) => {
    res.json(await studio.runLoop(req.params.id));
  })
);

api.get('/audit', (_req, res) => res.json({ entries: studio.listAudit(Number(_req.query.limit) || 50) }));

// ── Templates ─────────────────────────────────────────────────────────────────
api.get('/templates', (_req, res) => res.json({ templates: templates.listTemplates() }));
api.post('/templates/scaffold', (req, res) => {
  const id = String(req.body?.templateId ?? '');
  const name = String(req.body?.name ?? '');
  res.json(templates.scaffold(id, name));
});

// ── Git panel ─────────────────────────────────────────────────────────────────
api.get('/git/:projectId/status', (req, res) => {
  try { res.json(git.status(req.params.projectId)); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'failed' }); }
});
api.post('/git/:projectId/init', (req, res) => {
  res.json({ output: git.init(req.params.projectId) });
});
api.get('/git/:projectId/diff', (req, res) => {
  res.json({ diff: git.diff(req.params.projectId) });
});
api.post('/git/:projectId/commit', (req, res) => {
  const msg = String(req.body?.message ?? 'update');
  try { res.json({ output: git.commit(req.params.projectId, msg) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'failed' }); }
});
api.post('/git/:projectId/push', (req, res) => {
  try { res.json({ output: git.push(req.params.projectId, req.body?.remote, req.body?.branch) }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'failed' }); }
});

// ── Guitar reference tools ────────────────────────────────────────────────────
const TUNINGS: Record<string, { notes: string[]; semitones: number }> = {
  'Standard': { notes: ['E2','A2','D3','G3','B3','E4'], semitones: 0 },
  'Drop D': { notes: ['D2','A2','D3','G3','B3','E4'], semitones: -2 },
  'Drop C': { notes: ['C2','G2','C3','F3','A3','D4'], semitones: -4 },
  'Drop B': { notes: ['B1','F#2','B2','E3','G#3','C#4'], semitones: -5 },
  'Drop A': { notes: ['A1','E2','A2','D3','F#3','B3'], semitones: -7 },
  'Drop G#': { notes: ['G#1','D#2','G#2','C#3','F3','A#3'], semitones: -8 },
  'Drop G': { notes: ['G1','D2','G2','C3','E3','A3'], semitones: -9 },
  'Drop F': { notes: ['F1','C2','F2','Bb2','D3','G3'], semitones: -11 },
  'Standard 7 (B)': { notes: ['B1','E2','A2','D3','G3','B3','E4'], semitones: -5 },
  'Drop A 7-string': { notes: ['A1','E2','A2','D3','G3','B3','E4'], semitones: -7 },
  'Standard 8 (F#)': { notes: ['F#1','B1','E2','A2','D3','G3','B3','E4'], semitones: -10 },
  'Meshuggah (F)': { notes: ['F1','Bb1','Eb2','Ab2','C3','F3','Bb3','Eb4'], semitones: -11 },
};
api.get('/tools/tunings', (_req, res) => res.json({ tunings: TUNINGS }));

// ── Orchestrator (auto-chain the squad) ───────────────────────────────────────
api.post(
  '/orchestrator/run',
  wrap(async (req, res) => {
    const goal = String(req.body?.goal ?? '').trim();
    if (!goal) return res.status(400).json({ error: 'goal required' });
    const result = await orchestrator.runChain(goal);
    res.json(result);
  })
);

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
const httpServer = http.createServer(app);
attachTerminal(httpServer); // in-dashboard terminal at /api/terminal (optional node-pty)
studio.startScheduler(); // runs due automation loops every 30s
httpServer.listen(port, () => {
  const cfg = resolveConfig();
  console.log(`\n  Agent OS — Mission Control`);
  console.log(`  ▸ Dashboard:  http://127.0.0.1:${port}`);
  console.log(`  ▸ FCC proxy:  ${cfg.fccBaseUrl}  (model: ${cfg.model})`);
  console.log(`  ▸ Vault:      ${cfg.vaultPath}`);
  console.log(`  ▸ Scratch:    ${cfg.scratchDir}`);
  console.log(`  ▸ Auth:       ${cfg.password ? 'password required' : 'open (no password set)'}\n`);
});

export { app };
