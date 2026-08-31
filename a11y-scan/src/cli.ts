/**
 * CLI entry point.
 *
 *   npm run scan    -- https://example.se [--out ./out] [--max-pages 12]
 *   npm run prescan -- https://example.se
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

interface Args {
  command: string;
  target: string;
  out: string;
  maxPages?: number;
  allowPrivate: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: argv[0] ?? '',
    target: '',
    out: './out',
    allowPrivate: false,
    help: false,
  };

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--allow-private-targets') args.allowPrivate = true;
    else if (arg === '--out') args.out = argv[++i] ?? args.out;
    else if (arg === '--max-pages') args.maxPages = Number(argv[++i]);
    else if (!arg.startsWith('-') && args.target === '') args.target = arg;
  }
  return args;
}

function usage(): string {
  return `
E-commerce Accessibility Risk Scan

  npm run scan    -- <url> [options]     Full scan: JSON + HTML report + handoff
  npm run prescan -- <url>               Internal prospect summary (fast, few pages)

Options
  --out <dir>                 Output directory (default ./out)
  --max-pages <n>             Override the page budget (capped at the tier maximum)
  --allow-private-targets     TESTING ONLY. Permits loopback/private addresses.
  -h, --help                  Show this help

Safety
  Only public http/https targets are scanned. Nothing is purchased, no form is
  submitted, no authentication is attempted or bypassed, and robots.txt is obeyed.
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
    process.stderr.write('Error: a target URL is required.\n\n' + usage());
    return 1;
  }
  if (args.allowPrivate) {
    process.stderr.write(
      '\n  ⚠  --allow-private-targets is enabled. Loopback and private addresses\n' +
        '     can now be scanned. This exists for the test suite. Never enable it\n' +
        '     when scanning a target you do not fully control.\n\n'
    );
  }

  try {
    if (args.command === 'prescan') {
      const result = await runPrescan(args.target, {
        allowPrivateTargets: args.allowPrivate,
        limits: resolveLimits(PRESCAN_LIMITS, args.maxPages),
        onProgress: (message) => process.stderr.write(`  · ${message}\n`),
      });
      process.stdout.write(`${renderPrescanSummary(result)}\n`);
      return 0;
    }

    if (args.command === 'scan') {
      const result = await runScan(args.target, {
        allowPrivateTargets: args.allowPrivate,
        limits: resolveLimits(SCAN_LIMITS, args.maxPages),
        onProgress: (message) => process.stderr.write(`  · ${message}\n`),
      });

      const outDir = resolve(args.out);
      mkdirSync(outDir, { recursive: true });

      const slug = safeSlug(result.domain);
      const stamp = result.scanDate.slice(0, 10);
      const stem = `${slug}-${stamp}`;

      const jsonPath = writeInside(outDir, `${stem}.json`, JSON.stringify(buildJsonReport(result), null, 2));
      const htmlPath = writeInside(outDir, `${stem}.html`, renderHtmlReport(result));
      const mdPath = writeInside(outDir, `${stem}-handoff.md`, handoffToMarkdown(buildHandoff(result)));

      const tested = result.pages.filter((p) => !p.error).length;
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
