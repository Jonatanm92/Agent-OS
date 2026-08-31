import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from 'playwright';
import type { RawIssue } from './RawIssue.js';
import { truncateHtml } from './RawIssue.js';

const require = createRequire(import.meta.url);
let axeSource: string | null = null;

function loadAxeSource(): string {
  if (!axeSource) axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  return axeSource;
}

interface AxeNode {
  target: string[];
  html: string;
  failureSummary?: string;
  any?: { message: string; data?: unknown }[];
  all?: { message: string }[];
}

interface AxeResult {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor' | null;
  help: string;
  description: string;
  helpUrl: string;
  tags: string[];
  nodes: AxeNode[];
}

export interface AxeRunOutput {
  violations: RawIssue[];
  /** axe's "incomplete" results: real candidates that need a human decision. */
  incomplete: RawIssue[];
  testEngine: string;
}

/**
 * Run axe-core in the page. We keep both violations and incomplete results:
 * incomplete becomes REVIEW_REQUIRED rather than being silently dropped or,
 * worse, reported to a prospect as a confirmed defect.
 */
export async function runAxe(page: Page): Promise<AxeRunOutput> {
  await page.addScriptTag({ content: loadAxeSource() });
  const output = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: any }).axe;
    const results = await axe.run(document, {
      resultTypes: ['violations', 'incomplete'],
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
      rules: { 'color-contrast': { enabled: true } },
    });
    return {
      violations: results.violations,
      incomplete: results.incomplete,
      testEngine: `axe-core ${results.testEngine?.version ?? 'unknown'}`,
    };
  });

  return {
    violations: (output.violations as AxeResult[]).flatMap((r) => toRawIssues(r, false)),
    incomplete: (output.incomplete as AxeResult[]).flatMap((r) => toRawIssues(r, true)),
    testEngine: output.testEngine,
  };
}

function toRawIssues(result: AxeResult, incomplete: boolean): RawIssue[] {
  return result.nodes.slice(0, 25).map((node) => ({
    engine: 'axe-core' as const,
    rule: `axe.${result.id}`,
    selector: node.target.join(' '),
    html: truncateHtml(node.html),
    observed: incomplete
      ? `${result.help}. axe could not decide automatically for this element, so it needs a human check.`
      : (node.failureSummary?.replace(/\s+/g, ' ').trim() ?? result.help),
    impactHint: result.impact ?? 'moderate',
    data: { incomplete, tags: result.tags, helpUrl: result.helpUrl, description: result.description },
    raw: { ruleId: result.id, tags: result.tags, target: node.target, helpUrl: result.helpUrl },
  }));
}
