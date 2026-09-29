import type { Page } from 'playwright';
import type { RawIssue } from './RawIssue.js';
import { HELPERS_JS } from './PageHelpers.js';
import { runAxe } from './AxeRunner.js';
import { runKeyboardProbe } from './KeyboardProbe.js';
import { runDialogProbe } from './DialogProbe.js';
import { runFormProbe } from './FormProbe.js';
import { runStructureProbe } from './StructureProbe.js';
import { runReflowProbe } from './ReflowProbe.js';
import type { Logger } from '../core/Logger.js';

export interface PageAuditResult {
  issues: RawIssue[];
  engines: string[];
  failedProbes: { probe: string; error: string }[];
}

/**
 * SYSTEM 3 — run every engine against one open page.
 *
 * A probe that throws must not lose the rest of the audit: failures are
 * recorded so the report can say what was and was not tested, instead of
 * quietly presenting a partial scan as complete.
 */
export async function auditPage(page: Page, logger: Logger): Promise<PageAuditResult> {
  await page.evaluate(HELPERS_JS).catch(() => undefined);

  const issues: RawIssue[] = [];
  const engines: string[] = [];
  const failedProbes: { probe: string; error: string }[] = [];

  const run = async (name: string, probe: () => Promise<RawIssue[] | { issues: RawIssue[]; engine: string }>) => {
    try {
      const result = await probe();
      if (Array.isArray(result)) issues.push(...result);
      else {
        issues.push(...result.issues);
        engines.push(result.engine);
      }
      engines.push(name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('probe failed', { probe: name, error: message });
      failedProbes.push({ probe: name, error: message });
    }
  };

  await run('axe-core', async () => {
    const output = await runAxe(page);
    return { issues: [...output.violations, ...output.incomplete], engine: output.testEngine };
  });
  // Structure and forms first: they are read-only and cannot disturb the page.
  await run('structure-probe', () => runStructureProbe(page));
  await run('form-probe', () => runFormProbe(page));
  await run('reflow-probe', () => runReflowProbe(page));
  // Interaction probes last: they move focus and open panels.
  await run('keyboard-probe', () => runKeyboardProbe(page));
  await run('dialog-probe', () => runDialogProbe(page));

  return { issues: dedupeRaw(issues), engines: [...new Set(engines)], failedProbes };
}

/** Two engines finding the same thing on the same element is one finding. */
function dedupeRaw(issues: RawIssue[]): RawIssue[] {
  const seen = new Set<string>();
  const out: RawIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.rule}::${issue.selector}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

/** Cross-engine overlap: our probes are more specific, so axe's version yields. */
const AXE_SUPERSEDED_BY: Record<string, string[]> = {
  'axe.label': ['form.missing-label', 'form.required-unnamed'],
  'axe.button-name': ['keyboard.unnamed-focus-stop'],
  'axe.link-name': ['keyboard.unnamed-focus-stop'],
  'axe.aria-hidden-focus': ['keyboard.focus-in-aria-hidden'],
};

export function removeSupersededIssues(issues: RawIssue[]): RawIssue[] {
  const bySelector = new Map<string, Set<string>>();
  for (const issue of issues) {
    bySelector.set(issue.selector, (bySelector.get(issue.selector) ?? new Set()).add(issue.rule));
  }
  return issues.filter((issue) => {
    const supersedes = AXE_SUPERSEDED_BY[issue.rule];
    if (!supersedes) return true;
    const rulesHere = bySelector.get(issue.selector) ?? new Set();
    return !supersedes.some((rule) => rulesHere.has(rule));
  });
}
