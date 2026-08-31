import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — fixtures are plain ESM, deliberately outside the TypeScript build.
import { startFixtures, REQUEST_LOG } from '../fixtures/Server.mjs';
import { createPlatform, type Platform } from '../src/services/Platform.js';
import { ScanService, type ScanOutcome } from '../src/services/ScanService.js';
import { ReportService } from '../src/services/ReportService.js';
import { ReviewService } from '../src/services/ReviewService.js';
import { OutreachService } from '../src/services/OutreachService.js';

/**
 * The vertical slice, end to end, against local fixture storefronts:
 * a badly built shop, a well built shop and a B2B site.
 *
 * This is the test that actually proves the product works — everything below
 * runs the real browser, the real probes and the real report engine.
 */
describe('vertical slice 1: one domain in, sendable evidence out', () => {
  const PORTS = { bad: 4381, good: 4382, b2b: 4383 };
  let fixtures: { stop(): Promise<void> };
  let platform: Platform;
  let dataDir: string;
  let bad: ScanOutcome;
  let good: ScanOutcome;
  let b2b: ScanOutcome;

  beforeAll(async () => {
    const { SITES } = await import('../fixtures/Server.mjs' as string);
    SITES[PORTS.bad] = SITES[4181];
    SITES[PORTS.good] = SITES[4182];
    SITES[PORTS.b2b] = SITES[4183];
    fixtures = await startFixtures(Object.values(PORTS));
    dataDir = mkdtempSync(join(tmpdir(), 'a11y-e2e-'));
    platform = createPlatform({ config: { dataDir, perHostDelayMs: 50 } });
    const scans = new ScanService(platform);
    bad = await scans.scanDomain(`http://localhost:${PORTS.bad}`);
    good = await scans.scanDomain(`http://localhost:${PORTS.good}`);
    b2b = await scans.scanDomain(`http://localhost:${PORTS.b2b}`);
  }, 300_000);

  afterAll(async () => {
    platform?.close();
    await fixtures?.stop();
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it('discovers the ecommerce buying journey', () => {
    const reached = bad.journey.filter((s) => s.reached).map((s) => s.pageType);
    expect(reached).toContain('homepage');
    expect(reached).toContain('category');
    expect(reached).toContain('product');
    expect(reached).toContain('search');
    expect(reached).toContain('cart');
    expect(reached).toContain('account');
  });

  it('records why an untested step was untested instead of hiding it', () => {
    for (const step of bad.journey.filter((s) => !s.reached)) {
      expect(step.reason).toBeTruthy();
      expect(step.reason!.length).toBeGreaterThan(10);
    }
  });

  it('identifies the platform and reads company facts only from the site', () => {
    expect(bad.prospect.ecommercePlatform).toBe('woocommerce');
    expect(bad.prospect.companyName).toBe('Nordvik Hem');
    expect(bad.prospect.contactChannels.some((c) => c.kind === 'email')).toBe(true);
    expect(bad.prospect.agencyAttribution).toBe('Norrsken Digital');
    const provenance = platform.store.listProvenance('prospect', bad.prospect.id);
    expect(provenance.some((p) => p.field === 'company_name' && p.source.includes(String(PORTS.bad)))).toBe(true);
  });

  it('finds the keyboard barrier in the filter component that only a real Tab walk reveals', () => {
    const rules = bad.findings.map((f) => f.rule);
    expect(rules).toContain('component.enter-does-not-activate');
    expect(rules).toContain('keyboard.mouse-only-control');
    expect(rules).toContain('focus.no-visible-indicator');
    const filter = bad.findings.find((f) => f.rule === 'component.enter-does-not-activate')!;
    expect(filter.severity).toBe('critical');
    expect(filter.confidence).toBe('CONFIRMED_AUTOMATED');
    expect(filter.screenshotKey).toBeTruthy();
    expect(platform.storage.exists(filter.screenshotKey!)).toBe(true);
    expect(filter.keyboardReproduction.length).toBeGreaterThanOrEqual(2);
    expect(filter.observedBehaviour).toContain('Filtrera');
  });

  it('groups a component that fails on several pages into one systemic problem', () => {
    const systemic = bad.groups.filter((g) => g.systemic);
    expect(systemic.length).toBeGreaterThan(0);
    expect(Math.max(...systemic.map((g) => g.affectedPageCount))).toBeGreaterThan(1);
  });

  it('qualifies the barrier-rich store and gives it a next action', () => {
    expect(bad.prospect.qualificationStatus).toBe('qualified');
    expect(bad.prospect.leadScore).toBeGreaterThan(60);
    expect(bad.prospect.nextAction).toBeTruthy();
  });

  it('does not manufacture a case against a well built store', () => {
    const journeyBarriers = good.findings.filter(
      (f) => ['critical', 'high'].includes(f.severity) && ['product', 'cart', 'checkout_entry', 'category'].includes(f.pageType) && f.confidence === 'CONFIRMED_AUTOMATED',
    );
    expect(journeyBarriers.map((f) => f.rule)).not.toContain('component.enter-does-not-activate');
    expect(good.prospect.evidenceScore).toBeLessThan(bad.prospect.evidenceScore);
    expect(good.prospect.leadScore).toBeLessThan(bad.prospect.leadScore);
  });

  it('disqualifies a B2B site as outside the consumer-ecommerce ICP', () => {
    expect(b2b.scoring?.applied.map((s) => s.id)).toContain('b2b_only');
    expect(b2b.prospect.qualificationStatus).toBe('disqualified');
    expect(b2b.prospect.nextAction).toMatch(/Do not work this prospect/);
  });

  it('produces a mini audit a human would actually send', async () => {
    const report = await new ReportService(platform).generate(bad.prospect.id, { level: 'mini' });
    expect(report.findings.length).toBeGreaterThanOrEqual(3);
    expect(report.findings.length).toBeLessThanOrEqual(5);
    // Every finding shown to a prospect carries evidence.
    for (const finding of report.findings) {
      expect(finding.screenshotKey).toBeTruthy();
      expect(['CONFIRMED_AUTOMATED', 'HIGH_CONFIDENCE']).toContain(finding.confidence);
    }
    // Screenshots are inlined, so the file is portable.
    expect(report.html).toContain('data:image/png;base64,');
    expect(report.html).toContain('Vad vi testade');
    // Honest about what automated testing can and cannot establish, with no
    // legal threat anywhere in the prose. (Base64 image data is stripped first,
    // otherwise it produces spurious substring matches.)
    const prose = report.html.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, '');
    expect(prose).toContain('inte fastställa');
    expect(prose).not.toMatch(/\b(bryter mot lagen|olagligt|lagbrott|vitesföreläggande|stäms|rättsliga åtgärder)\b/i);
    expect(prose).not.toMatch(/\b(vi garanterar|certifierad|godkänd enligt WCAG)\b/i);
  });

  it('exports professional and developer reports from the same evidence', async () => {
    const reports = new ReportService(platform);
    const professional = await reports.generate(bad.prospect.id, { level: 'professional' });
    const developer = await reports.generate(bad.prospect.id, { level: 'developer' });
    expect(professional.html).toContain('Kritiska hinder i köpresan');
    expect(professional.html).toContain('Testomfattning');
    expect(developer.html).toContain('DOM');
    expect(developer.findings.length).toBeGreaterThanOrEqual(professional.findings.length);
    expect(JSON.parse(String(platform.storage.get(professional.record.jsonKey!))).disclaimer).toContain('not a legal determination');
  });

  it('carries a reviewed finding all the way into outreach', async () => {
    const reviews = new ReviewService(platform);
    const queue = reviews.queue({ prospectId: bad.prospect.id, limit: 5 });
    expect(queue.length).toBeGreaterThan(0);
    for (const item of queue) reviews.apply({ reviewer: 'test', action: 'APPROVE', findingId: item.finding.id });

    const draft = new OutreachService(platform).draft(bad.prospect.id);
    expect(draft.body).toContain(`localhost:${PORTS.bad}`);
    expect(draft.citedFindingIds.length).toBeGreaterThan(0);
    const cited = draft.citedFindingIds.map((id) => platform.audits.getFinding(id)!);
    // Outreach may only reference findings that actually exist in the scan.
    for (const finding of cited) expect(finding.prospectId).toBe(bad.prospect.id);
  });

  it('keeps a compliance timeline for the customer', () => {
    const timeline = platform.store.listTimeline(bad.prospect.id).map((e) => e.type);
    expect(timeline).toContain('prospect_discovered');
    expect(timeline).toContain('scan_started');
    expect(timeline).toContain('scan_completed');
    expect(timeline).toContain('findings_normalized');
    expect(timeline).toContain('mini_audit_generated');
  });

  it('never writes to the sites it tests', () => {
    const writes = REQUEST_LOG.filter((r: { method: string }) => !['GET', 'HEAD'].includes(r.method));
    expect(writes).toEqual([]);
  });

  it('never touches paths the store asked us to stay out of', () => {
    const forbidden = REQUEST_LOG.filter((r: { url: string }) => r.url.startsWith('/admin'));
    expect(forbidden).toEqual([]);
  });
});

/**
 * The cookie wall, which sits in front of essentially every European
 * storefront. Getting this wrong means every scan audits somebody's consent
 * manager instead of the merchant's checkout.
 */
describe('consent walls and third-party widgets', () => {
  const PORTS = { shopify: 4386, wall: 4387 };
  let fixtures: { stop(): Promise<void> };
  let platform: Platform;
  let dataDir: string;
  let shopify: ScanOutcome;
  let wall: ScanOutcome;

  beforeAll(async () => {
    const { SITES } = await import('../fixtures/Server.mjs' as string);
    SITES[PORTS.shopify] = SITES[4184];
    SITES[PORTS.wall] = SITES[4185];
    fixtures = await startFixtures(Object.values(PORTS));
    dataDir = mkdtempSync(join(tmpdir(), 'a11y-consent-'));
    platform = createPlatform({ config: { dataDir, perHostDelayMs: 50 } });
    const scans = new ScanService(platform);
    shopify = await scans.scanDomain(`http://localhost:${PORTS.shopify}`);
    wall = await scans.scanDomain(`http://localhost:${PORTS.wall}`);
  }, 300_000);

  afterAll(async () => {
    platform?.close();
    await fixtures?.stop();
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it('declines non-essential cookies to get at the store behind the wall', () => {
    expect(shopify.consent?.detected).toBe(true);
    expect(shopify.consent?.vendor).toBe('cookiebot');
    expect(shopify.consent?.dismissed).toBe(true);
    expect(shopify.consent?.method).toBe('necessary_only');
  });

  it('never accepts tracking on the merchant\'s behalf, and says so when it cannot decline', () => {
    expect(wall.consent?.detected).toBe(true);
    expect(wall.consent?.dismissed).toBe(false);
    expect(wall.consent?.method).toBe('not_dismissible');
    expect(wall.consent?.note).toContain('without accepting them');
  });

  it('still reaches the buying journey behind a dismissed wall', () => {
    const reached = shopify.journey.filter((s) => s.reached).map((s) => s.pageType);
    expect(reached).toContain('category');
    expect(reached).toContain('product');
    expect(reached).toContain('cart');
  });

  it('handles Shopify URL shapes, not just Swedish platform conventions', () => {
    expect(shopify.prospect.ecommercePlatform).toBe('shopify');
    const journey = new Map(shopify.journey.map((s) => [s.pageType, s.url ?? '']));
    expect(journey.get('category')).toContain('/collections/');
    expect(journey.get('product')).toContain('/products/');
  });

  it('attributes defects inside the consent manager to its vendor, not the merchant', () => {
    const vendorFindings = wall.findings.filter((f) => f.thirdParty !== null);
    expect(vendorFindings.length).toBeGreaterThan(0);
    expect(new Set(vendorFindings.map((f) => f.thirdParty))).toContain('cookiebot');
  });

  it('never leads a mini audit with somebody else\'s widget', async () => {
    const report = await new ReportService(platform).generate(wall.prospect.id, { level: 'mini' });
    expect(report.findings.length).toBeGreaterThan(0);
    for (const finding of report.findings) expect(finding.thirdParty).toBeNull();
  });

  it('tells the reader whether the store was tested in front of or behind its cookie wall', async () => {
    const behind = await new ReportService(platform).generate(wall.prospect.id, { level: 'professional' });
    expect(behind.html).toContain('Testet gjordes med cookiebannern kvar');
    const dismissed = await new ReportService(platform).generate(shopify.prospect.id, { level: 'professional' });
    expect(dismissed.html).toContain('avvisades genom att tacka nej');
    expect(behind.html).toContain('Inbäddade tredjepartskomponenter');
  });

  it('does not let a vendor\'s defects inflate what a prospect is worth', () => {
    const vendorOnly = wall.findings.filter((f) => f.thirdParty !== null);
    expect(vendorOnly.length).toBeGreaterThan(0);
    // Scored signals only ever cite merchant-owned findings.
    const barrierSignal = wall.scoring?.applied.find((s) => s.id === 'journey_barriers');
    if (barrierSignal) expect(barrierSignal.evidence).not.toContain('cookiebot');
  });
});

/**
 * The two ways a scan silently comes back empty on a real storefront: a
 * client-rendered shop with no links to extract, and a shop that redirects
 * somewhere else. Both produce a journey full of "no candidate URL found"
 * unless they are handled explicitly.
 */
describe('storefronts that defeat naive crawling', () => {
  const PORTS = { spa: 4388, moved: 4389, target: 4390 };
  let fixtures: { stop(): Promise<void> };
  let platform: Platform;
  let dataDir: string;
  let spa: ScanOutcome;
  let moved: ScanOutcome;

  beforeAll(async () => {
    const { SITES } = await import('../fixtures/Server.mjs' as string);
    SITES[PORTS.spa] = SITES[4186];
    SITES[PORTS.target] = SITES[4181];
    SITES[PORTS.moved] = { ...SITES[4187], redirectTo: PORTS.target };
    fixtures = await startFixtures(Object.values(PORTS));
    dataDir = mkdtempSync(join(tmpdir(), 'a11y-crawl-'));
    platform = createPlatform({ config: { dataDir, perHostDelayMs: 50 } });
    const scans = new ScanService(platform);
    spa = await scans.scanDomain(`http://localhost:${PORTS.spa}`);
    moved = await scans.scanDomain(`http://localhost:${PORTS.moved}`);
  }, 300_000);

  afterAll(async () => {
    platform?.close();
    await fixtures?.stop();
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it('waits for a client-rendered store to actually render its navigation', () => {
    const category = spa.journey.find((s) => s.pageType === 'category');
    expect(category?.reached).toBe(true);
    expect(category?.url).toContain('/kategori/');
  });

  it('finds a product page through the sitemap when the listing has no links at all', () => {
    // The fixture's product cards are click handlers, so link extraction finds
    // nothing — the site's own published sitemap is the only way in.
    expect(spa.signals?.productLinkCount).toBe(0);
    const product = spa.journey.find((s) => s.pageType === 'product');
    expect(product?.reached).toBe(true);
    expect(product?.url).toContain('/produkt/');
  });

  it('still reports the barrier that made the listing unlinkable in the first place', () => {
    expect(spa.findings.map((f) => f.rule)).toContain('keyboard.mouse-only-control');
  });

  it('crawls a moved store against where it landed, not where it was pointed', () => {
    const reached = moved.journey.filter((s) => s.reached);
    expect(reached.length).toBeGreaterThanOrEqual(5);
    for (const step of reached) expect(step.url).toContain(`localhost:${PORTS.target}`);
    // The prospect stays keyed on the domain the operator supplied.
    expect(moved.prospect.domain).toBe(`localhost:${PORTS.moved}`);
    expect(moved.prospect.companyName).toBe('Nordvik Hem');
  });
});
