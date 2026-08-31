/**
 * Regenerates the committed example outputs from the fixture shop, so the
 * examples in the repository are always real tool output rather than prose.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { startFixtureServer } from './fixtures/serve.js';
import { runScan } from './src/scan.js';
import { runPrescan, renderPrescanSummary } from './src/prescan/prescan.js';
import { buildJsonReport } from './src/report/json-report.js';
import { renderHtmlReport } from './src/report/html-report.js';
import { buildHandoff, handoffToMarkdown } from './src/report/handoff.js';
import { SCAN_LIMITS, PRESCAN_LIMITS } from './src/config.js';

async function main() {
  const server = await startFixtureServer();
  mkdirSync('examples', { recursive: true });

  const scan = await runScan(server.origin, {
    allowPrivateTargets: true,
    limits: { ...SCAN_LIMITS, maxPages: 8, requestDelayMs: 0 },
    useRobots: true,
    onProgress: (m) => process.stderr.write(`  · ${m}\n`),
  });

  // The fixture binds an ephemeral port, which would make the committed example
  // differ on every run. Pin it so the diff stays meaningful.
  const stable = JSON.parse(
    JSON.stringify(scan).split(server.origin).join('https://demo-webshop.example')
  );
  stable.scanDate = '2026-08-31T09:00:00.000Z';
  stable.durationMs = 41_000;
  stable.domain = 'demo-webshop.example';
  stable.target = 'https://demo-webshop.example';

  writeFileSync('examples/example-report.html', renderHtmlReport(stable));
  writeFileSync('examples/example-report.json', JSON.stringify(buildJsonReport(stable), null, 2));
  writeFileSync('examples/example-handoff.md', handoffToMarkdown(buildHandoff(stable)));

  const prescan = await runPrescan(server.origin, {
    allowPrivateTargets: true,
    limits: { ...PRESCAN_LIMITS, requestDelayMs: 0 },
    useRobots: true,
  });
  const stablePrescan = JSON.parse(
    JSON.stringify(prescan).split(server.origin).join('https://demo-webshop.example')
  );
  stablePrescan.domain = 'demo-webshop.example';
  stablePrescan.scanDate = '2026-08-31T09:00:00.000Z';
  writeFileSync('examples/example-prescan.txt', `${renderPrescanSummary(stablePrescan)}\n`);

  process.stderr.write(
    `\nWrote examples: ${stable.issues.length} issues, ${stable.pages.length} pages, ` +
      `${stablePrescan.observations.length} prescan observations.\n`
  );
  await server.close();
}

main();
