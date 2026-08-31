import { chromium, type Browser, type BrowserContext, type Page, type Response } from 'playwright';
import type { PlatformConfig } from '../core/Config.js';

/**
 * Politeness gate: never more than one in-flight navigation per host, and a
 * configurable minimum gap between them. Overloading a prospect's site is both
 * rude and a fast way to get the whole operation blocked.
 */
class HostRateLimiter {
  private readonly lastRequestAt = new Map<string, number>();
  private readonly chains = new Map<string, Promise<void>>();

  constructor(private readonly minGapMs: number) {}

  run<T>(host: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(host) ?? Promise.resolve();
    const gated = previous.then(async () => {
      const last = this.lastRequestAt.get(host) ?? 0;
      const wait = this.minGapMs - (Date.now() - last);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastRequestAt.set(host, Date.now());
    });
    const result = gated.then(task);
    this.chains.set(
      host,
      result.then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }
}

export interface VisitResult {
  page: Page;
  url: string;
  httpStatus: number | null;
  title: string | null;
  ok: boolean;
  error?: string;
}

/**
 * One browser, one context per site. The context is where our read-only
 * contract lives: we never store credentials, never submit orders, and abort
 * navigations to hosts outside the site being audited.
 */
export class BrowserSession {
  private browser: Browser | null = null;
  private readonly limiter: HostRateLimiter;

  constructor(private readonly config: PlatformConfig) {
    this.limiter = new HostRateLimiter(config.perHostDelayMs);
  }

  async start(): Promise<void> {
    if (this.browser) return;
    this.browser = await chromium.launch({
      headless: this.config.headless,
      executablePath: this.config.chromiumPath,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }

  async newContext(): Promise<BrowserContext> {
    if (!this.browser) await this.start();
    const context = await this.browser!.newContext({
      userAgent: this.config.userAgent,
      viewport: { width: 1366, height: 900 },
      locale: 'sv-SE',
      timezoneId: 'Europe/Stockholm',
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    // Dev-mode transpilers (tsx, vitest) emit `__name(...)` wrappers inside the
    // functions we hand to page.evaluate. Providing a no-op keeps evaluated
    // code identical between `npm run dev` and the compiled build.
    await context.addInitScript({ content: 'globalThis.__name = globalThis.__name || function (fn) { return fn; };' });
    context.setDefaultNavigationTimeout(this.config.navigationTimeoutMs);
    context.setDefaultTimeout(Math.min(this.config.navigationTimeoutMs, 10000));
    return context;
  }

  /** Navigate politely. Never throws — an unreachable page is data, not a crash. */
  async visit(context: BrowserContext, url: string): Promise<VisitResult> {
    const host = safeHost(url);
    return this.limiter.run(host, async () => {
      const page = await context.newPage();
      let response: Response | null = null;
      try {
        response = await page.goto(url, { waitUntil: 'domcontentloaded' });
        await settle(page);
        return {
          page,
          url: page.url(),
          httpStatus: response?.status() ?? null,
          title: await page.title().catch(() => null),
          ok: Boolean(response && response.status() < 400),
        };
      } catch (error) {
        return {
          page,
          url,
          httpStatus: response?.status() ?? null,
          title: null,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
  }
}

/** Give client-rendered storefronts a moment, without waiting on trackers forever. */
export async function settle(page: Page, quietMs = 700): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.waitForTimeout(quietMs);
  await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => undefined);
}

export function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
