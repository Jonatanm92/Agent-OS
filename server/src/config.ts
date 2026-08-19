import os from 'os';
import path from 'path';
import { getDb } from './db/index.js';

/** Expand a leading ~ to the user's home directory. */
export function expandHome(value: string): string {
  if (!value) return value;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

/** Read one setting from SQLite, falling back to a caller-supplied default. */
export function getSetting(key: string, fallback = ''): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  const value = row?.value;
  return value !== undefined && value !== null && value !== '' ? value : fallback;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(key, value ?? '');
}

export function getAllSettings(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

function enabled(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(value?.trim() ?? '');
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

function configuredOrigins(): string[] {
  return (process.env.AGENT_OS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => /^https?:\/\/[^\s/]+(?::\d{1,5})?$/.test(origin));
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
  enableScheduler: boolean;
  maxAutomationRunsPerDay: number;
  minLoopIntervalMinutes: number;
}

/**
 * Resolve effective runtime configuration.
 *
 * SQLite overrides environment values for user-editable provider settings.
 * Security capabilities remain environment-only. The service binds to loopback
 * unless the owner deliberately configures a non-loopback host, a strong
 * password, and the exact browser origins that may access it.
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
  if (!isLoopbackHost(host) && password.length < 16) {
    throw new Error(
      'Refusing non-loopback Agent OS binding without an AGENT_OS_PASSWORD of at least 16 characters.'
    );
  }

  const defaultOrigins = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
    // Standard local Vite development origins. Production is served by Express.
    'http://127.0.0.1:5173',
    'http://localhost:5173',
  ];

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
    allowedOrigins: [...new Set([...defaultOrigins, ...configuredOrigins()])],
    enableTerminal: enabled(process.env.AGENT_OS_ENABLE_TERMINAL),
    enableHostRunner: enabled(process.env.AGENT_OS_ENABLE_HOST_RUNNER),
    enableGitPush: enabled(process.env.AGENT_OS_ENABLE_GIT_PUSH),
    enableScheduler: enabled(process.env.AGENT_OS_ENABLE_SCHEDULER),
    maxAutomationRunsPerDay: boundedInteger(
      process.env.AGENT_OS_MAX_AUTOMATION_RUNS_PER_DAY,
      20,
      1,
      500
    ),
    minLoopIntervalMinutes: boundedInteger(
      process.env.AGENT_OS_MIN_LOOP_INTERVAL_MINUTES,
      15,
      5,
      1440
    ),
  };
}
