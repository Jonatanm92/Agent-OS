import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface PlatformConfig {
  /** Root directory for the sqlite database, screenshots and generated reports. */
  dataDir: string;
  /** Chromium binary. Falls back to Playwright's bundled download when unset. */
  chromiumPath: string | undefined;
  /** Politeness: minimum gap between requests to the same host. */
  perHostDelayMs: number;
  /** Hard cap on pages visited per scan — protects target sites and our budget. */
  maxPagesPerScan: number;
  navigationTimeoutMs: number;
  /** Parallel scans in the batch worker. Kept low: one host, one worker. */
  scanConcurrency: number;
  userAgent: string;
  /** When false the crawler refuses to visit paths disallowed by robots.txt. */
  ignoreRobots: boolean;
  headless: boolean;
}

const DEFAULT_CHROMIUM_CANDIDATES = ['/opt/pw-browsers/chromium'];

function detectChromium(): string | undefined {
  if (process.env.A11Y_CHROMIUM_PATH) return process.env.A11Y_CHROMIUM_PATH;
  return DEFAULT_CHROMIUM_CANDIDATES.find((p) => existsSync(p));
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(overrides: Partial<PlatformConfig> = {}): PlatformConfig {
  return {
    dataDir: resolve(process.env.A11Y_DATA_DIR ?? './a11y-data'),
    chromiumPath: detectChromium(),
    perHostDelayMs: num('A11Y_PER_HOST_DELAY_MS', 1500),
    maxPagesPerScan: num('A11Y_MAX_PAGES_PER_SCAN', 8),
    navigationTimeoutMs: num('A11Y_NAV_TIMEOUT_MS', 25000),
    scanConcurrency: num('A11Y_SCAN_CONCURRENCY', 2),
    userAgent:
      process.env.A11Y_USER_AGENT ??
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 A11yRevenueOS/0.1 (+accessibility audit bot)',
    ignoreRobots: process.env.A11Y_IGNORE_ROBOTS === '1',
    headless: process.env.A11Y_HEADFUL !== '1',
    ...overrides,
  };
}
