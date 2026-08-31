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
