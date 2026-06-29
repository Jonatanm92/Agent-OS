import os from 'os';
import path from 'path';
import { getDb } from './db/index.js';

/** Expand a leading ~ to the user's home directory. */
export function expandHome(p: string): string {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/** Read a single setting from the DB, falling back to env then a default. */
export function getSetting(key: string, fallback = ''): string {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  const value = row?.value;
  if (value !== undefined && value !== null && value !== '') return value;
  return fallback;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value ?? '');
}

export function getAllSettings(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export interface ResolvedConfig {
  port: number;
  fccBaseUrl: string;
  fccAuthToken: string;
  model: string;
  vaultPath: string;
  scratchDir: string;
}

/**
 * Resolve effective runtime config. Precedence:
 *   DB setting -> environment variable -> built-in default.
 */
export function resolveConfig(): ResolvedConfig {
  const vaultRaw =
    getSetting('obsidian_vault_path') ||
    process.env.OBSIDIAN_VAULT_PATH ||
    '~/freeclaude-vault';
  const scratchRaw = process.env.SCRATCH_DIR || '~/freeclaude-scratch';

  return {
    port: Number(process.env.PORT || 3001),
    fccBaseUrl: (
      getSetting('fcc_base_url') ||
      process.env.FCC_BASE_URL ||
      'http://127.0.0.1:8082'
    ).replace(/\/$/, ''),
    fccAuthToken:
      getSetting('fcc_auth_token') || process.env.FCC_AUTH_TOKEN || 'freecc',
    model: getSetting('model') || process.env.MODEL || 'claude-sonnet-4-20250514',
    vaultPath: expandHome(vaultRaw),
    scratchDir: expandHome(scratchRaw),
  };
}
