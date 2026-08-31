import { beforeEach, describe, expect, it } from 'vitest';
import { createPlatform, type Platform } from '../src/services/Platform.js';
import { Queue } from '../src/queue/Queue.js';
import { ReviewService } from '../src/services/ReviewService.js';
import { OutreachService } from '../src/services/OutreachService.js';
import { PipelineService } from '../src/services/PipelineService.js';
import { RetestService } from '../src/services/RetestService.js';
import { MonitoringService } from '../src/services/MonitoringService.js';
import { computeMetrics } from '../src/analytics/Metrics.js';
import { composeOutreach, looksLikeOptOut } from '../src/pipeline/Outreach.js';
import { buildRemediation } from '../src/remediation/RemediationEngine.js';
import { planGithubRemediation } from '../src/remediation/GithubWorkflow.js';
import { normalizeIssue } from '../src/findings/Normalize.js';
import { groupFindings } from '../src/findings/Dedupe.js';
import type { Finding, PageType, Scan } from '../src/core/Types.js';

function memoryPlatform(): Platform {
  return createPlatform({ config: { dataDir: '/tmp/a11y-test-objects' }, dbFile: ':memory:' });
}

function seedFinding(rule: string, pageType: PageType, url: string, scanId: string, prospectId: string): Finding {
  return normalizeIssue(
    {
      engine: 'dialog-probe',
      rule,
      selector: `div.${rule.replace(/\W/g, '')}`,
      html: '<div class="btn" role="button" tabindex="0">Filtrera</div>',
      params: { name: 'Filtrera' },
      impactHint: 'critical',
      componentLabel: 'Filtrera',
    },
    { scanId, prospectId, url, pageType },
  );
}

/** A completed scan with findings, without driving a browser. */
function seedScan(platform: Platform, domain: string, rules: { rule: string; pageType: PageType; url: string }[]): { prospectId: string; scan: Scan } {
  const prospect = platform.store.upsertProspect({ domain, companyName: 'Nordvik Hem' });
  const scan = platform.audits.createScan(prospect.id);
  const raw = rules.map((r) => seedFinding(r.rule, r.pageType, r.url, scan.id, prospect.id));
  const grouped = groupFindings(raw);
  for (const finding of grouped.findings) finding.screenshotKey = `screenshots/${scan.id}/${finding.id}.png`;
  platform.audits.insertFindings(grouped.findings);
  platform.audits.insertGroups(grouped.groups);
  const finished = platform.audits.finishScan(scan.id, {
    status: 'completed',
    pagesTested: rules.length,
    journey: [...new Set(rules.map((r) => r.pageType))].map((pageType) => ({
      pageType,
      url: rules.find((r) => r.pageType === pageType)!.url,
      reached: true,
    })),
  })!;
  platform.store.setProspectFacts(prospect.id, {
    scanStatus: 'scanned',
    qualificationStatus: 'qualified',
    leadScore: 80,
    evidenceScore: 90,
    contactChannels: [{ kind: 'email', value: 'kundservice@nordvik.se', source: 'homepage mailto: link' }],
  });
  platform.store.setStage(prospect.id, 'QUALIFIED', 'Generate the mini audit.');
  return { prospectId: prospect.id, scan: finished };
}

describe('prospect store', () => {
  let platform: Platform;
  beforeEach(() => {
    platform = memoryPlatform();
  });

  it('is idempotent per domain and normalizes the key', () => {
    const a = platform.store.upsertProspect({ domain: 'https://www.Nordvik.se/kategori' });
    const b = platform.store.upsertProspect({ domain: 'nordvik.se' });
    expect(b.id).toBe(a.id);
    expect(b.domain).toBe('nordvik.se');
  });

  it('records provenance for every company fact it writes', () => {
    const prospect = platform.store.upsertProspect({ domain: 'nordvik.se' });
    platform.store.setProspectFacts(
      prospect.id,
      { companyName: 'Nordvik Hem', ecommercePlatform: 'woocommerce' },
      { source: 'https://nordvik.se', method: 'homepage_dom_analysis', confidence: 'observed' },
    );
    const provenance = platform.store.listProvenance('prospect', prospect.id);
    expect(provenance.map((p) => p.field).sort()).toEqual(['company_name', 'ecommerce_platform']);
    expect(provenance.every((p) => p.source === 'https://nordvik.se')).toBe(true);
  });

  it('never overwrites a known fact with an unknown one', () => {
    const prospect = platform.store.upsertProspect({ domain: 'nordvik.se', companyName: 'Nordvik Hem' });
    platform.store.setProspectFacts(prospect.id, { ecommercePlatform: 'shopify' });
    expect(platform.store.getProspect(prospect.id)?.companyName).toBe('Nordvik Hem');
  });

  it('writes a timeline entry on every stage change', () => {
    const prospect = platform.store.upsertProspect({ domain: 'nordvik.se' });
    platform.store.setStage(prospect.id, 'SCANNED', 'Check qualification');
    platform.store.setStage(prospect.id, 'QUALIFIED', 'Generate the mini audit');
    const types = platform.store.listTimeline(prospect.id).map((e) => e.type);
    expect(types).toEqual(['prospect_discovered', 'stage_changed', 'stage_changed']);
  });
});

describe('work queue', () => {
  it('claims each job exactly once and survives a retry', () => {
    const platform = memoryPlatform();
    const queue = new Queue(platform.db);
    queue.enqueue('scan', { domain: 'a.se' });
    queue.enqueue('scan', { domain: 'b.se' });
    const first = queue.claim('scan')!;
    const second = queue.claim('scan')!;
    expect(queue.claim('scan')).toBeNull();
    queue.complete(first.id);
    queue.fail(second.id, 'network error');
    expect(queue.get(second.id)?.status).toBe('pending');
    queue.fail(second.id, 'network error again');
    expect(queue.get(second.id)?.status).toBe('pending');
    expect(queue.stats().done).toBe(1);
  });

  it('gives up after max attempts instead of looping forever', () => {
    const platform = memoryPlatform();
    const queue = new Queue(platform.db);
    const job = queue.enqueue('scan', { domain: 'a.se' }, { maxAttempts: 1 });
    queue.claim('scan');
    queue.fail(job.id, 'boom');
    expect(queue.get(job.id)?.status).toBe('failed');
  });
});

describe('human review', () => {
  it('records who decided what, with the value before the change', () => {
    const platform = memoryPlatform();
    const { prospectId, scan } = seedScan(platform, 'nordvik.se', [{ rule: 'component.enter-does-not-activate', pageType: 'category', url: 'https://nordvik.se/kategori' }]);
    const finding = platform.audits.listFindings(scan.id)[0];
    const reviews = new ReviewService(platform);

    reviews.apply({ reviewer: 'jonatan', action: 'CHANGE_SEVERITY', findingId: finding.id, severity: 'medium', note: 'Only affects one filter' });
    reviews.apply({ reviewer: 'jonatan', action: 'APPROVE', findingId: finding.id });

    const trail = reviews.auditTrail(finding.id);
    expect(trail.map((d) => d.action)).toEqual(['CHANGE_SEVERITY', 'APPROVE']);
    expect((trail[0].before as any).severity).toBe('critical');
    expect((trail[0].after as any).severity).toBe('medium');
    expect(platform.audits.getFinding(finding.id)?.reviewStatus).toBe('approved');
    expect(platform.store.listTimeline(prospectId).some((e) => e.type === 'review_decision')).toBe(true);
  });

  it('keeps rejected findings out of every customer-facing report', () => {
    const platform = memoryPlatform();
    const { scan } = seedScan(platform, 'nordvik.se', [{ rule: 'component.enter-does-not-activate', pageType: 'category', url: 'https://nordvik.se/kategori' }]);
    const finding = platform.audits.listFindings(scan.id)[0];
    new ReviewService(platform).apply({ reviewer: 'jonatan', action: 'REJECT', findingId: finding.id, note: 'False positive: it is a link' });
    const updated = platform.audits.getFinding(finding.id)!;
    expect(updated.confidence).toBe('REJECTED');
    expect(updated.reviewStatus).toBe('rejected');
  });

  it('promotes a manually confirmed finding to reportable', () => {
    const platform = memoryPlatform();
    const { scan } = seedScan(platform, 'nordvik.se', [{ rule: 'form.validation-message-not-announced', pageType: 'account', url: 'https://nordvik.se/logga-in' }]);
    const finding = platform.audits.listFindings(scan.id)[0];
    expect(finding.confidence).toBe('REVIEW_REQUIRED');
    new ReviewService(platform).apply({ reviewer: 'jonatan', action: 'CONFIRM_MANUAL_TEST', findingId: finding.id, note: 'Verified with NVDA' });
    expect(platform.audits.getFinding(finding.id)?.confidence).toBe('HIGH_CONFIDENCE');
  });
});

describe('outreach', () => {
  it('is written from real findings on the actual site', () => {
    const platform = memoryPlatform();
    const { prospectId, scan } = seedScan(platform, 'nordvik.se', [
      { rule: 'component.enter-does-not-activate', pageType: 'search', url: 'https://nordvik.se/sok' },
      { rule: 'keyboard.mouse-only-control', pageType: 'category', url: 'https://nordvik.se/kategori' },
    ]);
    void scan;
    const draft = new OutreachService(platform).draft(prospectId);
    expect(draft.subject).toContain('Nordvik Hem');
    expect(draft.body).toContain('nordvik.se');
    expect(draft.body).toContain('Filtrera');
    expect(draft.citedFindingIds.length).toBeGreaterThan(0);
    // No compliance claims, no legal pressure.
    expect(draft.body.toLowerCase()).not.toContain('wcag-kompatibel');
    expect(draft.body).toContain('inget juridiskt utlåtande');
    expect(draft.body).toContain('nej tack');
  });

  it('refuses to draft for a suppressed domain', () => {
    const platform = memoryPlatform();
    const { prospectId } = seedScan(platform, 'nordvik.se', [{ rule: 'component.enter-does-not-activate', pageType: 'search', url: 'https://nordvik.se/sok' }]);
    platform.store.addSuppression('domain', 'nordvik.se', 'Asked not to be contacted');
    expect(() => new OutreachService(platform).draft(prospectId)).toThrow(/suppression list/);
  });

  it('refuses to draft when the evidence is too thin to show anyone', () => {
    const platform = memoryPlatform();
    const prospect = platform.store.upsertProspect({ domain: 'tom.se' });
    const scan = platform.audits.createScan(prospect.id);
    platform.audits.finishScan(scan.id, { status: 'completed', pagesTested: 1, journey: [] });
    expect(() => new OutreachService(platform).draft(prospect.id)).toThrow(/evidence strong enough/);
  });

  it('honours an opt-out reply immediately and permanently', () => {
    const platform = memoryPlatform();
    const { prospectId } = seedScan(platform, 'nordvik.se', [{ rule: 'component.enter-does-not-activate', pageType: 'search', url: 'https://nordvik.se/sok' }]);
    const outreach = new OutreachService(platform);
    const result = outreach.recordReply(prospectId, 'Nej tack, sluta höra av er.', 'kundservice@nordvik.se');
    expect(result.optedOut).toBe(true);
    expect(platform.store.isSuppressed('domain', 'nordvik.se')).toBe(true);
    expect(platform.store.isSuppressed('email', 'kundservice@nordvik.se')).toBe(true);
    expect(platform.store.getProspect(prospectId)?.salesStage).toBe('LOST');
    expect(() => outreach.draft(prospectId)).toThrow();
  });

  it('detects opt-out phrasing in both languages, and does not over-detect', () => {
    expect(looksLikeOptOut('Nej tack')).toBe(true);
    expect(looksLikeOptOut('Please remove me from your list')).toBe(true);
    expect(looksLikeOptOut('Tack, det här ser intressant ut — kan vi boka ett möte?')).toBe(false);
  });

  it('needs at least one finding to write about', () => {
    const platform = memoryPlatform();
    const prospect = platform.store.upsertProspect({ domain: 'nordvik.se' });
    expect(() => composeOutreach(platform.store.getProspect(prospect.id)!, [])).toThrow(/at least one/);
  });
});

describe('pipeline', () => {
  it('refuses an undefined stage jump unless forced', () => {
    const platform = memoryPlatform();
    const { prospectId } = seedScan(platform, 'nordvik.se', [{ rule: 'component.enter-does-not-activate', pageType: 'search', url: 'https://nordvik.se/sok' }]);
    const pipeline = new PipelineService(platform);
    expect(() => pipeline.advance(prospectId, 'WON')).toThrow(/not a defined transition/);
    expect(pipeline.advance(prospectId, 'WON', { force: true }).salesStage).toBe('WON');
  });

  it('gives every prospect on the worklist a next action', () => {
    const platform = memoryPlatform();
    seedScan(platform, 'nordvik.se', [{ rule: 'component.enter-does-not-activate', pageType: 'search', url: 'https://nordvik.se/sok' }]);
    seedScan(platform, 'klarsikt.se', [{ rule: 'keyboard.mouse-only-control', pageType: 'product', url: 'https://klarsikt.se/produkt/a' }]);
    const worklist = new PipelineService(platform).worklist();
    expect(worklist).toHaveLength(2);
    for (const row of worklist) expect(row.nextAction.length).toBeGreaterThan(0);
  });

  it('turns a won prospect into a monitored site', () => {
    const platform = memoryPlatform();
    const { prospectId } = seedScan(platform, 'nordvik.se', [{ rule: 'component.enter-does-not-activate', pageType: 'search', url: 'https://nordvik.se/sok' }]);
    new PipelineService(platform).advance(prospectId, 'WON', { force: true });
    expect(platform.store.listMonitoredSites().map((s) => s.domain)).toContain('nordvik.se');
  });
});

describe('retest classification', () => {
  it('classifies fixed, still open, partially fixed and unverifiable findings', () => {
    const platform = memoryPlatform();
    const { prospectId, scan: baseline } = seedScan(platform, 'nordvik.se', [
      { rule: 'component.enter-does-not-activate', pageType: 'category', url: 'https://nordvik.se/kategori' },
      { rule: 'keyboard.mouse-only-control', pageType: 'product', url: 'https://nordvik.se/produkt/a' },
      { rule: 'form.missing-label', pageType: 'account', url: 'https://nordvik.se/logga-in' },
    ]);

    // The retest: the filter is fixed, the save button is not, and the login
    // page could not be reached this time.
    const retestScan = platform.audits.createScan(prospectId, 'retest', baseline.id);
    const stillBroken = seedFinding('keyboard.mouse-only-control', 'product', 'https://nordvik.se/produkt/a', retestScan.id, prospectId);
    platform.audits.insertFindings([stillBroken]);
    const finishedRetest = platform.audits.finishScan(retestScan.id, {
      status: 'completed',
      pagesTested: 2,
      journey: [
        { pageType: 'category', url: 'https://nordvik.se/kategori', reached: true },
        { pageType: 'product', url: 'https://nordvik.se/produkt/a', reached: true },
        { pageType: 'account', url: null, reached: false, reason: 'login page returned 503' },
      ],
    })!;

    const results = new RetestService(platform).compare(prospectId, baseline, finishedRetest);
    const byRule = new Map(results.map((r) => [platform.audits.getFinding(r.baselineFindingId)!.rule, r]));
    expect(byRule.get('component.enter-does-not-activate')?.outcome).toBe('FIXED');
    expect(byRule.get('keyboard.mouse-only-control')?.outcome).toBe('OPEN');
    expect(byRule.get('form.missing-label')?.outcome).toBe('UNABLE_TO_VERIFY');
    expect(byRule.get('component.enter-does-not-activate')?.beforeEvidenceKey).toBeTruthy();
  });

  it('calls a finding that comes back after being fixed a regression', () => {
    const platform = memoryPlatform();
    const { prospectId, scan: baseline } = seedScan(platform, 'nordvik.se', [
      { rule: 'component.enter-does-not-activate', pageType: 'category', url: 'https://nordvik.se/kategori' },
    ]);
    const journey = [{ pageType: 'category' as PageType, url: 'https://nordvik.se/kategori', reached: true }];

    const firstRetest = platform.audits.finishScan(platform.audits.createScan(prospectId, 'retest', baseline.id).id, { status: 'completed', pagesTested: 1, journey })!;
    const retests = new RetestService(platform);
    expect(retests.compare(prospectId, baseline, firstRetest)[0].outcome).toBe('FIXED');

    const secondScan = platform.audits.createScan(prospectId, 'retest', baseline.id);
    platform.audits.insertFindings([seedFinding('component.enter-does-not-activate', 'category', 'https://nordvik.se/kategori', secondScan.id, prospectId)]);
    const secondRetest = platform.audits.finishScan(secondScan.id, { status: 'completed', pagesTested: 1, journey })!;
    expect(retests.compare(prospectId, baseline, secondRetest)[0].outcome).toBe('REGRESSED');
  });
});

describe('monitoring', () => {
  it('escalates a new barrier in the buying journey and stays quiet about the rest', () => {
    const platform = memoryPlatform();
    const { prospectId, scan: previous } = seedScan(platform, 'nordvik.se', [{ rule: 'keyboard.mouse-only-control', pageType: 'product', url: 'https://nordvik.se/produkt/a' }]);

    const current = platform.audits.createScan(prospectId, 'monitor', previous.id);
    platform.audits.insertFindings([
      seedFinding('keyboard.mouse-only-control', 'product', 'https://nordvik.se/produkt/a', current.id, prospectId),
      seedFinding('component.enter-does-not-activate', 'category', 'https://nordvik.se/kategori', current.id, prospectId),
      seedFinding('structure.no-skip-link', 'content', 'https://nordvik.se/villkor', current.id, prospectId),
    ]);
    const finishedCurrent = platform.audits.finishScan(current.id, {
      status: 'completed',
      pagesTested: 3,
      journey: [
        { pageType: 'product', url: 'https://nordvik.se/produkt/a', reached: true },
        { pageType: 'category', url: 'https://nordvik.se/kategori', reached: true },
      ],
    })!;

    const alerts = new MonitoringService(platform).diff(previous, finishedCurrent);
    const escalated = alerts.filter((a) => a.severity === 'critical' || a.severity === 'high');
    expect(escalated.some((a) => a.kind === 'new_barrier' && a.url?.includes('kategori'))).toBe(true);
    expect(escalated.some((a) => a.url?.includes('villkor'))).toBe(false);
  });

  it('raises an alert when a journey step stops being testable', () => {
    const platform = memoryPlatform();
    const { prospectId, scan: previous } = seedScan(platform, 'nordvik.se', [{ rule: 'keyboard.mouse-only-control', pageType: 'checkout_entry', url: 'https://nordvik.se/kassa' }]);
    const current = platform.audits.createScan(prospectId, 'monitor', previous.id);
    const finished = platform.audits.finishScan(current.id, {
      status: 'completed',
      pagesTested: 1,
      journey: [{ pageType: 'checkout_entry', url: null, reached: false, reason: 'checkout now requires login' }],
    })!;
    const alerts = new MonitoringService(platform).diff(previous, finished);
    expect(alerts.some((a) => a.kind === 'journey_changed')).toBe(true);
  });
});

describe('remediation', () => {
  it('proposes a native button for a mouse-only control', () => {
    const finding = seedFinding('keyboard.mouse-only-control', 'category', 'https://nordvik.se/kategori', 's', 'p');
    const guidance = buildRemediation(finding, { platform: 'woocommerce', cms: 'wordpress' });
    expect(guidance.stack).toContain('WooCommerce');
    expect(guidance.suggestion?.after).toContain('<button type="button"');
    expect(guidance.suggestion?.after).not.toContain('role="button"');
    expect(guidance.likelyLocations.join(' ')).toContain('wp-content');
    expect(guidance.limitations.length).toBeGreaterThan(0);
  });

  it('says plainly when it has no mechanical fix', () => {
    const finding = seedFinding('structure.no-skip-link', 'homepage', 'https://nordvik.se/', 's', 'p');
    const guidance = buildRemediation(finding, { platform: 'shopify', cms: 'shopify' });
    expect(guidance.suggestion).toBeNull();
    expect(guidance.limitations.join(' ')).toContain('ingen mekanisk kodändring');
  });

  it('produces a PR plan that always requires a human to merge', () => {
    const finding = seedFinding('component.enter-does-not-activate', 'category', 'https://nordvik.se/kategori', 's', 'p');
    const plan = planGithubRemediation(finding, { platform: 'shopify', cms: 'shopify' });
    expect(plan.requiresHumanApproval).toBe(true);
    expect(plan.branch).toMatch(/^a11y\//);
    expect(plan.prBody).toContain('Finding being addressed');
    expect(plan.prBody).toContain('Tests executed');
    expect(plan.prBody).toContain('Accessibility retest result');
    expect(plan.prBody).toContain('Human approval is required before merging');
  });
});

describe('business metrics', () => {
  it('reports the funnel and the unit economics, not vanity counts', () => {
    const platform = memoryPlatform();
    const { prospectId } = seedScan(platform, 'nordvik.se', [{ rule: 'component.enter-does-not-activate', pageType: 'search', url: 'https://nordvik.se/sok' }]);
    platform.audits.recordReport({ prospectId, scanId: platform.audits.latestCompletedScan(prospectId)!.id, level: 'mini', htmlKey: 'a', jsonKey: 'b', pdfKey: null, findingCount: 3 });
    platform.store.setStage(prospectId, 'MINI_AUDIT_READY', 'Review');
    platform.store.setStage(prospectId, 'REVIEWED', 'Sign off');
    platform.store.setStage(prospectId, 'READY_FOR_OUTREACH', 'Send');
    platform.store.setStage(prospectId, 'CONTACTED', 'Follow up');
    platform.store.setStage(prospectId, 'REPLIED', 'Book a meeting');
    platform.store.setStage(prospectId, 'MEETING', 'Send proposal');
    platform.store.setStage(prospectId, 'WON', 'Deliver');
    platform.store.recordRevenue(prospectId, 'audit', 24000);
    platform.store.recordRevenue(prospectId, 'monitoring_mrr', 1900);
    platform.store.recordDeliveryCost({ prospectId, deliveryHours: 6, computeCostSek: 1.2 });

    const metrics = computeMetrics(platform.db);
    expect(metrics.domainsDiscovered).toBe(1);
    expect(metrics.sitesScannedSuccessfully).toBe(1);
    expect(metrics.customersWon).toBe(1);
    expect(metrics.auditRevenueSek).toBe(24000);
    expect(metrics.monitoringMrrSek).toBe(1900);
    expect(metrics.deliveryHoursPerCustomer).toBe(6);
    expect(metrics.computeCostPerAuditSek).toBeGreaterThan(0);
    expect(metrics.rates.scanToQualified).toBe(100);
  });
});

describe('reviewer efficiency', () => {
  it('asks for one decision per systemic component, not one per affected page', () => {
    const platform = memoryPlatform();
    const pages = ['kategori', 'sok', 'varukorg', 'kassa'];
    const { prospectId } = seedScan(
      platform,
      'nordvik.se',
      pages.map((page) => ({ rule: 'keyboard.mouse-only-control', pageType: 'category' as PageType, url: `https://nordvik.se/${page}` })),
    );
    const reviews = new ReviewService(platform);
    const queue = reviews.queue({ prospectId });
    expect(queue).toHaveLength(1);
    expect(queue[0].group?.affectedPageCount).toBe(4);

    // Approving the representative approves the whole component.
    reviews.apply({ reviewer: 'jonatan', action: 'APPROVE', findingId: queue[0].finding.id });
    const scan = platform.audits.latestCompletedScan(prospectId)!;
    expect(platform.audits.listFindings(scan.id).every((f) => f.reviewStatus === 'approved')).toBe(true);
    expect(reviews.queue({ prospectId })).toHaveLength(0);
  });
});
