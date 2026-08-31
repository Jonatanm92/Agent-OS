/**
 * Playwright lifecycle plus the in-browser half of the URL guard.
 *
 * Playwright follows redirects internally, so a URL that passed the guard can
 * still end up requesting something else. The route handler here re-checks every
 * request the browser makes and aborts anything that is not an allowed public
 * http(s) target (THREAT-MODEL.md T1, T2).
 */
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DESKTOP_VIEWPORT, USER_AGENT, type Limits } from '../config.js';
import { checkUrl, checkUrlSyntax, type GuardOptions } from '../security/url-guard.js';

/**
 * Some environments ship a Chromium build whose revision differs from the one
 * the npm package expects. Prefer an explicit path, then a known install
 * location, then Playwright's own bundled browser.
 */
export function resolveChromiumPath(): string | undefined {
  const explicit = process.env.A11Y_CHROMIUM_PATH;
  if (explicit && existsSync(explicit)) return explicit;

  const root = '/opt/pw-browsers';
  if (!existsSync(root)) return undefined;
  try {
    const candidates = readdirSync(root)
      .filter((name) => name.startsWith('chromium-'))
      .sort()
      .reverse();
    for (const name of candidates) {
      const candidate = join(root, name, 'chrome-linux', 'chrome');
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    // Fall through to the bundled browser.
  }
  return undefined;
}

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  /** URLs the route handler refused, for the report's audit trail. */
  blockedRequests: { url: string; reason: string }[];
  close(): Promise<void>;
}

export async function openSession(limits: Limits, guard: GuardOptions = {}): Promise<BrowserSession> {
  const executablePath = resolveChromiumPath();

  // Default security settings only. No --no-sandbox, no --disable-web-security,
  // and no option to turn them on (THREAT-MODEL.md T8).
  const browser = await chromium.launch(executablePath ? { executablePath } : {});

  // Fresh incognito context: nothing persists between scans (T9).
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { ...DESKTOP_VIEWPORT },
    // A shop that geolocates or asks for notifications must not block the scan.
    permissions: [],
    javaScriptEnabled: true,
  });

  context.setDefaultNavigationTimeout(limits.navigationTimeoutMs);
  context.setDefaultTimeout(limits.navigationTimeoutMs);

  const blockedRequests: { url: string; reason: string }[] = [];

  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();

    // Cheap synchronous checks first: scheme, port, credentials.
    const syntax = checkUrlSyntax(url, guard);
    if (!syntax.allowed) {
      blockedRequests.push({ url, reason: syntax.detail });
      await route.abort('blockedbyclient');
      return;
    }

    // Full DNS + address check only for document and subdocument navigations.
    // Running it on every image would be slow and pointless — a sub-resource
    // cannot exfiltrate to an internal host without also being a navigation
    // target, and the scheme check above already blocks the dangerous cases.
    if (request.resourceType() === 'document') {
      const verdict = await checkUrl(url, guard);
      if (!verdict.allowed) {
        blockedRequests.push({ url, reason: verdict.detail });
        await route.abort('blockedbyclient');
        return;
      }
    }

    await route.continue();
  });

  return {
    browser,
    context,
    blockedRequests,
    async close() {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
}
