import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: Database.Database | null = null;

export function getDb(dbPath?: string): Database.Database {
  if (db) return db;

  const resolvedPath = dbPath || path.resolve(__dirname, '../../data/agent-os.db');
  const dir = path.dirname(resolvedPath);
  fs.mkdirSync(dir, { recursive: true });

  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initializeSchema(db);
  return db;
}

export function createDb(dbPath?: string): Database.Database {
  const resolvedPath = dbPath || ':memory:';

  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath);
    fs.mkdirSync(dir, { recursive: true });
  }

  const database = new Database(resolvedPath);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');

  initializeSchema(database);
  return database;
}

function initializeSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Conversation',
      project_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      tool_calls TEXT,
      tool_call_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS pipeline_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      raw TEXT NOT NULL DEFAULT '',
      stage TEXT NOT NULL DEFAULT 'capture',
      item_type TEXT NOT NULL DEFAULT 'idea',
      tags TEXT NOT NULL DEFAULT '[]',
      plan TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL DEFAULT 0,
      deliverable TEXT NOT NULL DEFAULT '',
      project_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // ── Migrations ──────────────────────────────────────────────────────────
  // Track which agent (free-claude-code | codex | hermes | …) owns a conversation.
  const cols = database
    .prepare("PRAGMA table_info('conversations')")
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === 'agent_id')) {
    database.exec(
      "ALTER TABLE conversations ADD COLUMN agent_id TEXT NOT NULL DEFAULT 'free-claude-code'"
    );
  }

  // Component 8 — feedback: per-message rating (1 = up, -1 = down, 0 = none).
  const msgCols = database
    .prepare("PRAGMA table_info('messages')")
    .all() as { name: string }[];
  if (!msgCols.some((c) => c.name === 'rating')) {
    database.exec('ALTER TABLE messages ADD COLUMN rating INTEGER NOT NULL DEFAULT 0');
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function resetDb(): void {
  db = null;
}
