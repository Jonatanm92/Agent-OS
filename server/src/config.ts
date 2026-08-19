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

function enabled(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(value?.trim() ?? '');
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

export interface ResolvedConfig {
  host: string;
  port: number;
  fccBaseUrl: string;
  fccAuthToken: string;
  model: string;
  vaultPath: string;
  scratchDir: string;
  password: string;
  allowedOrigins: string[];
  enableTerminal: boolean;
  enableHostRunner: boolean;
  enableGitPush: boolean;
}

/**
 * Resolve effective runtime config. Precedence:
 *   DB setting -> environment variable -> built-in default.
 *
 * The service is loopback-only by default. Binding to any non-loopback address
 * without an API password is rejected because the dashboard includes local file,
 * agent, and optional shell capabilities.
 */
export function resolveConfig(): ResolvedConfig {
  const vaultRaw =
    getSetting('obsidian_vault_path') ||
    process.env.OBSIDIAN_VAULT_PATH ||
    '~/freeclaude-vault';
  const scratchRaw = process.env.SCRATCH_DIR || '~/freeclaude-scratch';
  const host = (process.env.AGENT_OS_HOST || '127.0.0.1').trim();
  const port = Number(process.env.PORT || 3001);
  const password = process.env.AGENT_OS_PASSWORD || getSetting('agent_os_password') || '';

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  if (!isLoopbackHost(host) && !password) {
    throw new Error(
      'Refusing non-loopback Agent OS binding without AGENT_OS_PASSWORD. ' +
        'Use 127.0.0.1 or configure an owner password first.'
    );
  }

  const defaultOrigins = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ];
  const configuredOrigins = (process.env.AGENT_OS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    host,
    port,
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
    password,
    allowedOrigins: [...new Set([...defaultOrigins, ...configuredOrigins])],
    enableTerminal: enabled(process.env.AGENT_OS_ENABLE_TERMINAL),
    enableHostRunner: enabled(process.env.AGENT_OS_ENABLE_HOST_RUNNER),
    enableGitPush: enabled(process.env.AGENT_OS_ENABLE_GIT_PUSH),
  };
}
