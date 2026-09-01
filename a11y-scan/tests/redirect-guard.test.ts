/**
 * Regression tests for the redirect SSRF path.
 *
 * The vulnerability these cover was real: Playwright's route handler does not
 * fire for hops of a redirect the network stack follows internally, so a target
 * answering `302 → http://169.254.169.254/` reached the cloud metadata endpoint
 * with the handler none the wiser. These tests fail if that regresses.
 *
 * The guard exemption is scoped to the fixture's host only, so the redirect
 * target is still a blocked address — which is the whole point of scoping it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureServer, type FixtureServer } from '../fixtures/serve.js';
import { resolveRedirects } from '../src/security/redirect-guard.js';
import { runScan } from '../src/scan.js';
import { SCAN_LIMITS } from '../src/config.js';

let server: FixtureServer;
let exempt: string[];

beforeAll(async () => {
  server = await startFixtureServer();
  exempt = ['127.0.0.1'];
});

afterAll(async () => {
  await server?.close();
});

describe('redirect chain validation (T1)', () => {
  it('refuses a redirect to the cloud metadata endpoint', async () => {
    const result = await resolveRedirects(`${server.origin}/redirect-to-metadata`, {
      allowPrivateHosts: exempt,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/safety guard refuses/i);
    expect(result.reason).toMatch(/private, loopback or reserved/i);
    expect(result.chain).toHaveLength(2);
    expect(result.chain[1]).toContain('169.254.169.254');
  });

  it('refuses a redirect to a file:// URL', async () => {
    const result = await resolveRedirects(`${server.origin}/redirect-to-file`, {
      allowPrivateHosts: exempt,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/http and https/i);
  });

  it('refuses a redirect to another private address even though the start host is exempt', async () => {
    // This is exactly what a global "allow private" boolean would have let
    // through: the exemption covers 127.0.0.1, and the hop goes elsewhere.
    const result = await resolveRedirects(`${server.origin}/redirect-to-metadata`, {
      allowPrivateHosts: ['127.0.0.1'],
    });
    expect(result.allowed).toBe(false);
  });

  it('allows a page that does not redirect, and reports it as terminal', async () => {
    const result = await resolveRedirects(`${server.origin}/product.html`, {
      allowPrivateHosts: exempt,
    });
    expect(result.allowed).toBe(true);
    expect(result.finalUrl).toBe(`${server.origin}/product.html`);
    expect(result.chain).toHaveLength(1);
  });

  it('refuses a declared response larger than the cap', async () => {
    const result = await resolveRedirects(`${server.origin}/huge.html`, {
      allowPrivateHosts: exempt,
      maxResponseBytes: 1024,
    });
    expect(result.allowed).toBe(false);
    expect(result.oversized).toBe(true);
    expect(result.reason).toMatch(/above the/i);
  });

  it('allows the same page when the cap is generous', async () => {
    const result = await resolveRedirects(`${server.origin}/huge.html`, {
      allowPrivateHosts: exempt,
      maxResponseBytes: 50 * 1024 * 1024,
    });
    expect(result.allowed).toBe(true);
  });

  it('lets the browser try when the preflight itself cannot connect', async () => {
    // A preflight failure must not produce a false "not tested" on a shop that
    // simply dislikes non-browser clients.
    const result = await resolveRedirects('http://127.0.0.1:1/unreachable', {
      allowPrivateHosts: exempt,
      timeoutMs: 1500,
    });
    expect(result.allowed).toBe(true);
  });

  it('cannot see the size of a chunked response — the DOM backstop covers that', async () => {
    // Honest about the limit: no content-length means nothing to check here.
    const result = await resolveRedirects(`${server.origin}/huge-chunked.html`, {
      allowPrivateHosts: exempt,
      maxResponseBytes: 1024,
    });
    expect(result.allowed).toBe(true);
  });

  it('stops after a bounded number of hops', async () => {
    const result = await resolveRedirects(`${server.origin}/redirect-loop`, {
      allowPrivateHosts: exempt,
      maxHops: 3,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/More than 3 redirects/);
  });
});

describe('DOM-size backstop (T6)', () => {
  it('skips the engines on a page whose element count is pathological', async () => {
    const result = await runScan(`${server.origin}/huge-chunked.html`, {
      allowPrivateTargets: true,
      limits: { ...SCAN_LIMITS, maxPages: 1, requestDelayMs: 0, maxDomNodes: 1000 },
      useRobots: false,
    });
    expect(result.pages[0]!.error).toMatch(/above the .* limit for a single page/);
    expect(result.issues).toEqual([]);
  }, 60_000);

  it('scans the same page normally when the cap is generous', async () => {
    const result = await runScan(`${server.origin}/huge-chunked.html`, {
      allowPrivateTargets: true,
      limits: { ...SCAN_LIMITS, maxPages: 1, requestDelayMs: 0, maxDomNodes: 500_000 },
      useRobots: false,
    });
    expect(result.pages[0]!.error).toBeUndefined();
  }, 180_000);
});

describe('the scanner refuses the whole page, not just the request', () => {
  it('records a redirecting page as not tested rather than scanning the target', async () => {
    const result = await runScan(`${server.origin}/redirect-to-metadata`, {
      allowPrivateTargets: true,
      limits: { ...SCAN_LIMITS, maxPages: 1, requestDelayMs: 0 },
      useRobots: false,
    });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]!.error).toMatch(/Not tested/);
    expect(result.issues).toEqual([]);

    // Nothing anywhere in the output may reference the internal address.
    expect(JSON.stringify(result)).not.toContain('169.254.169.254/latest');
  }, 60_000);

  it('follows an allowed redirect and reports the terminal URL', async () => {
    const result = await runScan(`${server.origin}/redirect-to-product`, {
      allowPrivateTargets: true,
      limits: { ...SCAN_LIMITS, maxPages: 1, requestDelayMs: 0 },
      useRobots: false,
    });

    expect(result.pages[0]!.error).toBeUndefined();
    // The URL in the report is the page that was actually examined.
    expect(result.pages[0]!.url).toBe(`${server.origin}/product.html`);
    expect(result.pages[0]!.role).toBe('product');
    expect(result.issues.length).toBeGreaterThan(0);
  }, 60_000);
});
