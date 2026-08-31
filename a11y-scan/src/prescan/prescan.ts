/**
 * Phase 7 — internal sales pre-scan.
 *
 * Purpose: decide whether a company is worth a conversation. Not a deliverable,
 * not sent to the prospect, and deliberately shaped so it cannot be forwarded as
 * one — it carries an INTERNAL header and no branding.
 *
 * Language rules, applied in code rather than left to the writer's discretion:
 *   - observational, never accusatory ("we observed", not "your site breaks")
 *   - never asserts illegality or non-compliance
 *   - never quantifies risk in money or fines
 */
import type { Issue, ScanResult } from '../types.js';
import { PRESCAN_LIMITS } from '../config.js';
import { runScan, type ScanOptions } from '../scan.js';

export interface PrescanResult {
  domain: string;
  target: string;
  scanDate: string;
  pagesExamined: number;
  /** 3-7 high-confidence observations. */
  observations: Issue[];
  /** Whether the shop is worth contacting, and why. */
  signal: 'strong' | 'moderate' | 'weak';
  signalReason: string;
  notes: string[];
}

/**
 * Only rules with a low false-positive rate reach a prospect summary. A lead
 * summary that overstates is worse than no lead: the first sales conversation
 * starts with a correction.
 */
const HIGH_CONFIDENCE_RULES = new Set([
  'image-alt',
  'button-name',
  'link-name',
  'label',
  'html-has-lang',
  'document-title',
  'frame-title',
  'meta-viewport',
  'aria-hidden-focus',
  'check:nonsemantic-clickable',
  'check:no-focus-indicator',
  'check:reflow-overflow',
  'check:missing-autocomplete',
]);

const MIN_OBSERVATIONS = 3;
const MAX_OBSERVATIONS = 7;

export function selectObservations(issues: Issue[]): Issue[] {
  const confident = issues.filter((issue) => HIGH_CONFIDENCE_RULES.has(issue.ruleId));
  // Already ranked by severity then priority upstream.
  return confident.slice(0, MAX_OBSERVATIONS);
}

export function assessSignal(observations: Issue[], pagesExamined: number): { signal: PrescanResult['signal']; reason: string } {
  if (pagesExamined === 0) {
    return { signal: 'weak', reason: 'No pages could be examined, so nothing can be concluded.' };
  }

  const critical = observations.filter((o) => o.severity === 'critical').length;
  const high = observations.filter((o) => o.severity === 'high').length;

  if (critical > 0) {
    return {
      signal: 'strong',
      reason: 'At least one observation sits in the purchase flow and may prevent some customers from completing an order.',
    };
  }
  if (high >= 2) {
    return { signal: 'strong', reason: 'Several significant barriers were observed across the pages examined.' };
  }
  if (high === 1 || observations.length >= MIN_OBSERVATIONS) {
    return { signal: 'moderate', reason: 'Some barriers were observed that are worth discussing.' };
  }
  return {
    signal: 'weak',
    reason: 'Few high-confidence observations on the pages examined. This shop may already be in reasonable shape, or the barriers may lie in areas automated testing cannot see.',
  };
}

export async function runPrescan(target: string, options: ScanOptions = {}): Promise<PrescanResult> {
  const result = await runScan(target, {
    ...options,
    limits: options.limits ?? PRESCAN_LIMITS,
    quick: true,
  });

  const observations = selectObservations(result.issues);
  const pagesExamined = result.pages.filter((p) => !p.error).length;
  const { signal, reason } = assessSignal(observations, pagesExamined);

  const notes: string[] = [];
  if (result.issues.length > observations.length) {
    notes.push(
      `${result.issues.length - observations.length} further finding(s) were detected but are not listed here — the pre-scan shows only high-confidence observations.`
    );
  }
  if (pagesExamined < result.pages.length) {
    notes.push(`${result.pages.length - pagesExamined} page(s) could not be examined.`);
  }

  return {
    domain: result.domain,
    target: result.target,
    scanDate: result.scanDate,
    pagesExamined,
    observations,
    signal,
    signalReason: reason,
    notes,
  };
}

/**
 * Internal lead summary. Observational language throughout — see the module
 * comment. Never generate a version of this addressed to the prospect.
 */
export function renderPrescanSummary(result: PrescanResult): string {
  const lines: string[] = [];

  lines.push('════════════════════════════════════════════════════════════');
  lines.push('  INTERNAL LEAD SUMMARY — NOT FOR SENDING TO THE PROSPECT');
  lines.push('════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Domain          ${result.domain}`);
  lines.push(`Scanned         ${result.scanDate.slice(0, 10)}`);
  lines.push(`Pages examined  ${result.pagesExamined}`);
  lines.push(`Signal          ${result.signal.toUpperCase()}`);
  lines.push('');
  lines.push(`Assessment      ${result.signalReason}`);
  lines.push('');

  if (result.observations.length === 0) {
    lines.push('No high-confidence accessibility barriers were observed on the pages examined.');
    lines.push('Automated testing sees only part of the picture, so this is not evidence that');
    lines.push('the shop is accessible — only that a short scan surfaced nothing obvious.');
  } else {
    lines.push(`We observed ${result.observations.length} potential accessibility barrier(s) worth investigating:`);
    lines.push('');
    result.observations.forEach((issue, index) => {
      lines.push(`  ${index + 1}. [${issue.severity.toUpperCase()}] ${issue.title}`);
      lines.push(`     Component:  ${issue.component}`);
      lines.push(`     Occurrences: ${issue.instanceCount} on ${issue.affectedUrls.length} page(s)`);
      lines.push(`     WCAG:       ${issue.wcag[0] ?? 'not mapped'}`);
      lines.push(`     Effect:     ${wrap(issue.impact, 62, '                 ')}`);
      lines.push('');
    });
  }

  if (result.notes.length > 0) {
    lines.push('Notes');
    for (const note of result.notes) lines.push(`  - ${note}`);
    lines.push('');
  }

  lines.push('────────────────────────────────────────────────────────────');
  lines.push('Talking points (observational — do not assert non-compliance):');
  lines.push('  "We ran a short automated check of a few public pages and observed');
  lines.push('   some potential accessibility barriers worth investigating."');
  lines.push('');
  lines.push('This summary is based on automated checks of a handful of public pages.');
  lines.push('It is not an audit, not a compliance assessment, and not legal advice.');
  lines.push('════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/** Wraps long text for the fixed-width internal summary. */
function wrap(text: string, width: number, indent: string): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.join(`\n${indent}`);
}
