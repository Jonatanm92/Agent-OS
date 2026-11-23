import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Runtime configuration. Every value can be overridden with an OMEGA_* environment
 * variable; nothing here is a secret (the API token lives in <home>/token, 0600).
 */
export interface OmegaConfig {
  /** Data root: state, audit log, artifacts, mission projects. */
  home: string;
  /** Where mission projects (one git repo each) are created. */
  workspaceRoot: string;
  host: string;
  port: number;
  /** Must be explicitly true to bind anything other than loopback. */
  allowRemote: boolean;
  claudeBin: string;
  defaultModel: string;
  defaultMissionBudgetUsd: number;
  /** Hard cap across all missions per UTC day. */
  dailyBudgetUsd: number;
  /** Cap for a single agent invocation (passed to --max-budget-usd). */
  perRunBudgetUsd: number;
  /** Spend gates under this amount are auto-approved. 0 = always ask a human. */
  autoApproveSpendUnderUsd: number;
  /** How many times the coder may try to fix failing acceptance tests. */
  maxFixIterations: number;
  /** Read-only roots scanned by the inventory (path.delimiter separated in env). */
  projectRoots: string[];
}

/**
 * Pick the data root. On Windows we prefer F: (the owner's large-project drive) when
 * it exists, otherwise %LOCALAPPDATA%. Elsewhere ~/.omega.
 */
export function defaultHome(platform = process.platform, exists = fs.existsSync): string {
  if (process.env.OMEGA_HOME) return path.resolve(process.env.OMEGA_HOME);
  if (platform === 'win32') {
    if (exists('F:\\')) return 'F:\\OMEGA';
    const local = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
    return path.join(local, 'OMEGA');
  }
  return path.join(os.homedir(), '.omega');
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number, got "${raw}"`);
  return n;
}

export function loadConfig(overrides: Partial<OmegaConfig> = {}): OmegaConfig {
  const home = overrides.home ?? defaultHome();
  const cfg: OmegaConfig = {
    home,
    workspaceRoot: process.env.OMEGA_WORKSPACE ? path.resolve(process.env.OMEGA_WORKSPACE) : path.join(home, 'projects'),
    host: process.env.OMEGA_HOST ?? '127.0.0.1',
    port: num('OMEGA_PORT', 7420),
    allowRemote: process.env.OMEGA_ALLOW_REMOTE === '1',
    claudeBin: process.env.OMEGA_CLAUDE_BIN ?? 'claude',
    defaultModel: process.env.OMEGA_MODEL ?? 'claude-opus-5-5',
    defaultMissionBudgetUsd: num('OMEGA_MISSION_BUDGET_USD', 3),
    dailyBudgetUsd: num('OMEGA_DAILY_BUDGET_USD', 10),
    perRunBudgetUsd: num('OMEGA_PER_RUN_BUDGET_USD', 1.5),
    autoApproveSpendUnderUsd: num('OMEGA_AUTO_APPROVE_UNDER_USD', 0),
    maxFixIterations: num('OMEGA_MAX_FIX_ITERATIONS', 1),
    projectRoots: (process.env.OMEGA_PROJECT_ROOTS ?? '').split(path.delimiter).filter(Boolean),
    ...overrides,
  };
  if (overrides.home && !overrides.workspaceRoot && !process.env.OMEGA_WORKSPACE) {
    cfg.workspaceRoot = path.join(cfg.home, 'projects');
  }
  return cfg;
}

export function isLoopback(host: string): boolean {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost';
}
