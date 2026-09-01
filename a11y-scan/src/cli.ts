/**
 * CLI entry point.
 *
 *   npm run scan     -- --url https://shop.example.se --order 1234
 *   npm run prospect -- https://shop.example.se
 *
 * NOTE ON SCRIPT NAMES: npm treats `pre<name>` as an automatic hook, so a
 * package with both a `scan` and a `prescan` script silently runs `prescan`
 * first when you ask for `scan`. The prospect mode is therefore exposed as
 * `npm run prospect`; the underlying CLI subcommand is still `prescan`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { PRESCAN_LIMITS, SCAN_LIMITS, type Limits } from './config.js';
import { safeSlug } from './security/url-guard.js';
import { runScan, ScanError } from './scan.js';
import { runPrescan, renderPrescanSummary } from './prescan/prescan.js';
import { buildJsonReport } from './report/json-report.js';
import { renderHtmlReport } from './report/html-report.js';
import { buildHandoff, handoffToMarkdown } from './report/handoff.js';
import { writeOrderBundle } from './report/order-bundle.js';

/** Bumped when the report shape changes, so an old bundle can be explained. */
export const TOOL_VERSION = '0.2.0';

interface Args {
  command: string;
  target: string;
  out: string;
  order: string;
  company: string;
  ordersRoot: string;
  maxPages?: number;
  allowPrivate: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: argv[0] ?? '',
    target: '',
    out: './out',
    order: '',
    company: '',
    ordersRoot: 'reports/orders',
    allowPrivate: false,
    help: false,
  };

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--allow-private-targets') args.allowPrivate = true;
    else if (arg === '--url') args.target = argv[++i] ?? '';
    else if (arg === '--order') args.order = argv[++i] ?? '';
    else if (arg === '--company') args.company = argv[++i] ?? '';
    else if (arg === '--orders-root') args.ordersRoot = argv[++i] ?? args.ordersRoot;
    else if (arg === '--out') args.out = argv[++i] ?? args.out;
    else if (arg === '--max-pages') args.maxPages = Number(argv[++i]);
    // A bare URL still works, so `scan https://x` and `scan --url https://x`
    // both do the obvious thing.
    else if (!arg.startsWith('-') && args.target === '') args.target = arg;
  }
  return args;
}

function usage(): string {
  return `
E-commerce Accessibility Risk Scan

  npm run scan     -- --url <url> --order <id>   Paid scan for one order
  npm run scan     -- --url <url>                Ad-hoc scan into ./out
  npm run prospect -- <url>                      Internal prospect summary

Options
  --url <url>                 Target to scan. A bare URL also works.
  --order <id>                Shopify order reference. Writes an isolated
                              bundle to reports/orders/<id>/.
  --company <name>            Optional, recorded in the run metadata.
  --orders-root <dir>         Where order bundles live (default reports/orders)
  --out <dir>                 Output directory when --order is not used
  --max-pages <n>             Lower the page budget (never raises it)
  --allow-private-targets     TESTING ONLY. Grants the target's own host an
                              exemption from the private-address guard.
  -h, --help                  Show this help

Safety
  Only public http/https targets are scanned. Nothing is purchased, no form is
  submitted, no authentication is attempted or bypassed, and robots.txt is obeyed.

Reminder
  The output is a DRAFT. A person reviews it before it reaches a customer.
`.trimStart();
}

/** Writes a file inside outDir, refusing any path that escapes it (THREAT-MODEL.md T3). */
function writeInside(outDir: string, filename: string, contents: string): string {
  const base = resolve(outDir);
  const full = resolve(join(base, filename));
  if (full !== base && !full.startsWith(base + sep)) {
    throw new Error(`Refusing to write outside the output directory: ${filename}`);
  }
  writeFileSync(full, contents, 'utf8');
  return full;
}

function resolveLimits(base: Limits, requested?: number): Limits {
  if (!requested || !Number.isFinite(requested) || requested < 1) return base;
  // A CLI flag may lower the budget but never raise it above the tier maximum.
  return { ...base, maxPages: Math.min(Math.floor(requested), base.maxPages) };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.command === '' || args.command === 'help') {
    process.stdout.write(usage());
    return args.help || args.command === 'help' ? 0 : 1;
  }
  if (args.target === '') {
    process.stderr.write('Error: a target URL is required (--url).\n\n' + usage());
    return 1;
  }
  if (args.allowPrivate) {
    process.stderr.write(
      '\n  !  --allow-private-targets is enabled. The target host may now resolve\n' +
        '     to a private address. This exists for the test suite. Never enable it\n' +
        '     for a target you do not fully control.\n\n'
    );
  }

  try {
    if (args.command === 'prescan' || args.command === 'prospect') {
      const result = await runPrescan(args.target, {
        allowPrivateTargets: args.allowPrivate,
        limits: resolveLimits(PRESCAN_LIMITS, args.maxPages),
        onProgress: (message) => process.stderr.write(`  - ${message}\n`),
      });
      process.stdout.write(`${renderPrescanSummary(result)}\n`);
      return 0;
    }

    if (args.command === 'scan') {
      const result = await runScan(args.target, {
        allowPrivateTargets: args.allowPrivate,
        limits: resolveLimits(SCAN_LIMITS, args.maxPages),
        onProgress: (message) => process.stderr.write(`  - ${message}\n`),
      });

      const tested = result.pages.filter((p) => !p.error).length;

      // With --order, the operator gets one self-contained folder per paid
      // order rather than loose files they have to collect themselves.
      if (args.order !== '') {
        const bundle = writeOrderBundle(
          result,
          {
            orderId: args.order,
            company: args.company || undefined,
            toolVersion: TOOL_VERSION,
          },
          args.ordersRoot
        );

        process.stderr.write(
          `\nOrder ${args.order}: scanned ${tested} page(s) of ${result.domain} in ` +
            `${Math.round(result.durationMs / 1000)}s, ${result.issues.length} unique issue(s).\n\n` +
            `  ${bundle.directory}\n` +
            bundle.files
              .map((f) => `    ${f.slice(bundle.directory.length + 1)}`)
              .join('\n') +
            `\n\nNext: review report.html, work through manual-checklist.md, then set\n` +
            `humanReviewCompleted in run-metadata.json before delivering.\n`
        );
        return 0;
      }

      const outDir = resolve(args.out);
      mkdirSync(outDir, { recursive: true });
      const stem = `${safeSlug(result.domain)}-${result.scanDate.slice(0, 10)}`;

      const jsonPath = writeInside(outDir, `${stem}.json`, JSON.stringify(buildJsonReport(result), null, 2));
      const htmlPath = writeInside(outDir, `${stem}.html`, renderHtmlReport(result));
      const mdPath = writeInside(outDir, `${stem}-handoff.md`, handoffToMarkdown(buildHandoff(result)));

      process.stderr.write(
        `\nScanned ${tested} page(s) of ${result.domain} in ${Math.round(result.durationMs / 1000)}s.\n` +
          `${result.issues.length} unique issue(s) found.\n\n` +
          `  ${htmlPath}\n  ${jsonPath}\n  ${mdPath}\n\n` +
          `Reminder: this is a pre-audit draft. Review it before sending it to a customer.\n`
      );
      return 0;
    }

    process.stderr.write(`Unknown command "${args.command}".\n\n${usage()}`);
    return 1;
  } catch (error) {
    if (error instanceof ScanError) {
      process.stderr.write(`\nScan refused: ${error.message}\n(reason: ${error.reason})\n`);
      return 2;
    }
    process.stderr.write(`\nScan failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 3;
  }
}

main().then((code) => {
  process.exitCode = code;
});
