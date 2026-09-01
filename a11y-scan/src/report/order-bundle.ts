/**
 * Writes everything one paid order needs into a single isolated folder.
 *
 * The operator's whole job after payment is: read the target off the Shopify
 * order, run one command, review the draft, send it. This module is the "one
 * command" half — it produces a folder the operator can work in and then hand
 * over, with nothing else to assemble.
 *
 * DATA MINIMISATION: the bundle records the ORDER REFERENCE and the SCANNED
 * URL. It deliberately does not write the contact name, the email address or
 * the organisation number, all of which are already in Shopify and none of
 * which the scan needs. Keeping a second copy of a customer's personal data on
 * a laptop, for no operational gain, is the kind of thing that turns a small
 * validation experiment into a GDPR problem.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { ManualCheck, ScanResult } from '../types.js';
import { safeSlug } from '../security/url-guard.js';
import { buildJsonReport } from './json-report.js';
import { renderHtmlReport } from './html-report.js';
import { buildHandoff, handoffToMarkdown } from './handoff.js';
import { countBySeverity } from '../analyze/severity.js';

export interface OrderContext {
  /** Shopify order reference, as the operator sees it in Admin. */
  orderId: string;
  /** Optional company name, for the operator's own convenience. */
  company?: string;
  /** Tool version, recorded so an old report can be explained later. */
  toolVersion: string;
}

export interface OrderBundle {
  directory: string;
  files: string[];
}

/** Refuses any path that escapes the intended directory (THREAT-MODEL.md T3). */
function writeInside(baseDir: string, filename: string, contents: string | Uint8Array): string {
  const base = resolve(baseDir);
  const full = resolve(join(base, filename));
  if (full !== base && !full.startsWith(base + sep)) {
    throw new Error(`Refusing to write outside the order directory: ${filename}`);
  }
  writeFileSync(full, contents);
  return full;
}

/** The manual checks as a checklist a person can actually work through and tick. */
export function manualChecklistMarkdown(checks: ManualCheck[], result: ScanResult): string {
  const lines: string[] = [
    '# Manual verification checklist',
    '',
    `Target: ${result.domain}`,
    `Scan date: ${result.scanDate.slice(0, 10)}`,
    '',
    'These checks cannot be decided by software. **None of them has been performed.**',
    'Work through them, record the result, and delete any that genuinely do not apply',
    'to this shop before the report is delivered.',
    '',
    'A check marked `[ ]` in a delivered report is a check that was not done. Do not',
    'tick one you did not perform.',
    '',
  ];

  const flagged = checks.filter((c) => c.flaggedBy);
  if (flagged.length > 0) {
    lines.push(
      `> The automated pass found signals in ${flagged.length} of these areas. Those are marked **flagged** and are worth doing first.`,
      ''
    );
  }

  for (const check of checks) {
    lines.push(`## ${check.area}${check.flaggedBy ? ' — flagged' : ''}`);
    lines.push('');
    if (check.flaggedBy) lines.push(`*${check.flaggedBy}*`, '');
    lines.push(`**Do this:** ${check.instruction}`, '');
    lines.push(`**It passes when:** ${check.passCriteria}`, '');
    lines.push(`WCAG: ${check.wcag.join(' · ')}`, '');
    lines.push('- [ ] Pass', '- [ ] Fail', '- [ ] Not applicable', '');
    lines.push('Notes:', '', '---', '');
  }

  return lines.join('\n');
}

/**
 * Writes the bundle. Returns the directory and the files created.
 */
export function writeOrderBundle(
  result: ScanResult,
  context: OrderContext,
  ordersRoot = 'reports/orders'
): OrderBundle {
  // The order id comes from a human typing a CLI flag, so it is sanitised
  // before it is allowed anywhere near a path.
  const orderSlug = safeSlug(context.orderId, 'order');
  const directory = resolve(join(ordersRoot, orderSlug));
  mkdirSync(directory, { recursive: true });

  const evidenceDir = join(directory, 'evidence');
  mkdirSync(evidenceDir, { recursive: true });

  const files: string[] = [];

  files.push(writeInside(directory, 'report.html', renderHtmlReport(result)));
  files.push(writeInside(directory, 'scan.json', JSON.stringify(buildJsonReport(result), null, 2)));
  files.push(writeInside(directory, 'handoff.md', handoffToMarkdown(buildHandoff(result))));
  files.push(
    writeInside(directory, 'manual-checklist.md', manualChecklistMarkdown(result.manualChecks, result))
  );

  // Screenshots are embedded in the HTML report so it stays a single portable
  // file, and also written out separately so the operator can use one in an
  // email without extracting it from the markup.
  let shotIndex = 0;
  for (const issue of result.issues) {
    for (const example of issue.examples) {
      if (!example.screenshot?.startsWith('data:image/png;base64,')) continue;
      shotIndex++;
      const base64 = example.screenshot.slice('data:image/png;base64,'.length);
      const name = `${String(shotIndex).padStart(2, '0')}-${safeSlug(issue.ruleId, 'evidence')}.png`;
      files.push(writeInside(evidenceDir, name, Buffer.from(base64, 'base64')));
    }
  }

  const counts = countBySeverity(result.issues);
  const tested = result.pages.filter((p) => !p.error);

  const metadata = {
    order: {
      reference: context.orderId,
      // Company is operator convenience only. Contact name, email and
      // organisation number are deliberately NOT copied out of Shopify.
      company: context.company ?? null,
      personalDataStored:
        'None. Contact name, email and organisation number stay in Shopify and are not written to this folder.',
    },
    scan: {
      target: result.target,
      domain: result.domain,
      startedAt: result.scanDate,
      durationMs: result.durationMs,
      toolVersion: context.toolVersion,
      limits: result.limits,
      robotsRespected: result.robotsRespected,
    },
    results: {
      pagesAttempted: result.pages.length,
      pagesExamined: tested.length,
      rolesExamined: [...new Set(tested.map((p) => p.role))],
      uniqueIssues: result.issues.length,
      totalOccurrences: result.issues.reduce((sum, i) => sum + i.instanceCount, 0),
      bySeverity: counts,
      manualChecksPending: result.manualChecks.length,
      evidenceScreenshots: shotIndex,
    },
    delivery: {
      // A deliberate, machine-readable reminder that the draft is not the
      // deliverable. The launch checklist refers to this field.
      humanReviewCompleted: false,
      reviewedBy: null,
      deliveredAt: null,
    },
  };

  files.push(writeInside(directory, 'run-metadata.json', JSON.stringify(metadata, null, 2)));

  return { directory, files };
}
