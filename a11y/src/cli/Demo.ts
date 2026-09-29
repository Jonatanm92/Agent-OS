import { fileURLToPath } from 'node:url';
import type { Platform } from '../services/Platform.js';
import { BatchService } from '../services/BatchService.js';
import { ReviewService } from '../services/ReviewService.js';
import { OutreachService } from '../services/OutreachService.js';
import { ReportService } from '../services/ReportService.js';
import { computeMetrics } from '../analytics/Metrics.js';

interface FixtureHandle {
  urls: string[];
  stop(): Promise<void>;
}

interface FixtureModule {
  startFixtures(ports?: number[]): Promise<FixtureHandle>;
  SITES: Record<string, unknown>;
}

/**
 * The first business acceptance test, runnable in one command.
 *
 * Outbound access to real stores is not available in every environment (and
 * scanning strangers' sites for a demo would be rude), so the demo runs the
 * complete pipeline against local fixture storefronts: a badly built shop, a
 * well built shop and a B2B site. Every step below is the same code path a real
 * domain goes through.
 */
export async function runDemo(platform: Platform, options: { sites?: number } = {}): Promise<void> {
  const fixturesUrl = new URL('../../fixtures/Server.mjs', import.meta.url);
  const fixtures = (await import(fixturesUrl.href)) as FixtureModule;
  const basePorts = Object.keys(fixtures.SITES).map(Number);
  const wanted = options.sites ?? Number(process.env.A11Y_DEMO_SITES ?? basePorts.length);
  const ports = Array.from({ length: wanted }, (_, i) => basePorts[i % basePorts.length] + Math.floor(i / basePorts.length) * 10);

  console.log(`Starting ${ports.length} fixture storefront(s)…`);
  const handle = await startFixturesOn(fixtures, ports, basePorts);

  try {
    const batch = new BatchService(platform);
    const domains = ports.map((port) => `http://localhost:${port}`);
    const { submitted } = batch.submit(domains);
    console.log(`\n1. Submitted ${submitted} domains to the scan queue.`);

    const summary = await batch.run({ concurrency: 3 });
    console.log(`2. Processed ${summary.scanned}/${summary.submitted} reliably in ${(summary.durationMs / 1000).toFixed(1)}s.`);
    console.log(`3. Testable: ${summary.scanned - summary.unreachable}; untestable: ${summary.unreachable}; failed: ${summary.failed}.`);

    const ranked = batch.rank(10);
    console.log(`4. Qualified prospects: ${summary.qualified}; disqualified as out of ICP: ${summary.disqualified}.`);
    console.log('5. Ranked prospects:');
    for (const prospect of ranked) {
      console.log(`   ${prospect.domain.padEnd(24)} lead=${String(prospect.leadScore).padStart(3)} evidence=${String(prospect.evidenceScore).padStart(3)} ${prospect.ecommercePlatform}`);
    }

    const best = ranked[0];
    if (!best) {
      console.log('\nNo prospect qualified — nothing to review. That is a valid outcome, not a failure.');
      return;
    }

    const reports = new ReportService(platform);
    const mini = await reports.generate(best.id, { level: 'mini' });
    console.log(`\n6. Mini audit for ${best.domain}: ${mini.findings.length} finding(s), ${mini.findings.filter((f) => f.screenshotKey).length} with screenshot evidence.`);
    console.log(`   ${mini.htmlPath}`);

    const reviews = new ReviewService(platform);
    const queue = reviews.queue({ prospectId: best.id, limit: 5 });
    console.log(`7. Review queue for ${best.domain}: ${queue.length} finding(s) awaiting a human.`);
    for (const item of queue.slice(0, 5)) {
      reviews.apply({ reviewer: 'demo-operator', action: 'APPROVE', findingId: item.finding.id, note: 'Approved in the demo run' });
    }
    reviews.signOff(best.id, 'demo-operator', 'Demo sign-off');
    console.log(`8. Approved ${Math.min(5, queue.length)} finding(s) and signed the audit off.`);

    const outreach = new OutreachService(platform);
    try {
      const draft = outreach.draft(best.id, { reportLink: mini.htmlPath });
      console.log(`\n9. Outreach draft (awaiting human approval), citing ${draft.citedFindingIds.length} real finding(s):\n`);
      console.log(`   Subject: ${draft.subject}`);
      console.log(
        draft.body
          .split('\n')
          .map((line) => `   ${line}`)
          .join('\n'),
      );
    } catch (error) {
      console.log(`\n9. Outreach was refused: ${error instanceof Error ? error.message : String(error)}`);
    }

    const refreshed = platform.store.getProspect(best.id)!;
    console.log(`\n10. Next sales action for ${refreshed.domain}: ${refreshed.nextAction} (stage ${refreshed.salesStage})`);

    const metrics = computeMetrics(platform.db);
    console.log(
      `\nMetrics: discovered=${metrics.domainsDiscovered} scanned=${metrics.sitesScannedSuccessfully} qualified=${metrics.qualifiedProspects} miniAudits=${metrics.miniAuditsGenerated} costPerAudit=${metrics.computeCostPerAuditSek} SEK`,
    );
    console.log(`\nOpen the console for the review UI:  node ${fileURLToPath(new URL('../api/Main.js', import.meta.url))}`);
  } finally {
    await handle.stop();
  }
}

/** Fixture ports beyond the built-in three reuse the same site profiles. */
async function startFixturesOn(fixtures: FixtureModule, ports: number[], basePorts: number[]): Promise<FixtureHandle> {
  const sites = fixtures.SITES as Record<number, unknown>;
  for (const port of ports) {
    if (!sites[port]) sites[port] = sites[basePorts[ports.indexOf(port) % basePorts.length]];
  }
  return fixtures.startFixtures(ports);
}
