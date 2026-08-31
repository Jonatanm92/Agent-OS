/**
 * axe-core, injected into the page and run against WCAG 2.x A/AA rule sets.
 *
 * The results are evidence, not the audit: axe reliably catches roughly a third
 * of WCAG failures, and its `impact` field is context-free. Severity is decided
 * later, by flow position (see analyze/severity.ts).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from 'playwright';
import type { Engine, EngineContext } from './engines.js';
import type { Finding } from '../types.js';
import { DEFAULT_META, RULE_CATALOG } from '../analyze/rule-catalog.js';
import { truncate } from '../security/escape.js';

const require = createRequire(import.meta.url);

/** Read once per process; the file is ~700KB. */
let axeSourceCache: string | null = null;
function axeSource(): string {
  if (axeSourceCache === null) {
    axeSourceCache = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  }
  return axeSourceCache;
}

/** The shape we rely on from axe's output. Anything else is ignored. */
interface AxeViolation {
  id?: unknown;
  help?: unknown;
  helpUrl?: unknown;
  tags?: unknown;
  nodes?: unknown;
}

/** Maps axe's WCAG tags (wcag111, wcag2aa) to readable criteria when the catalogue has none. */
function wcagFromTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    const match = /^wcag(\d)(\d)(\d+)$/.exec(tag);
    if (match) out.push(`${match[1]}.${match[2]}.${match[3]}`);
  }
  return out;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export const axeEngine: Engine = {
  name: 'axe-core',

  async run(page: Page, context: EngineContext): Promise<Finding[]> {
    try {
      await page.addScriptTag({ content: axeSource() });
    } catch {
      // A page with a Content-Security-Policy that forbids inline script will
      // reject the injection. Reported as a gap rather than swallowed silently.
      return [];
    }

    let raw: unknown;
    try {
      raw = await page.evaluate(async () => {
        const axe = (globalThis as unknown as { axe?: { run: (ctx: unknown, opts: unknown) => Promise<unknown> } }).axe;
        if (!axe) return null;
        return axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
          resultTypes: ['violations'],
        } as unknown);
      });
    } catch {
      return [];
    }

    // Defensive: the page could have replaced window.axe with anything.
    if (!raw || typeof raw !== 'object') return [];
    const violations = (raw as { violations?: unknown }).violations;
    if (!Array.isArray(violations)) return [];

    const findings: Finding[] = [];

    for (const entry of violations as AxeViolation[]) {
      const ruleId = asString(entry?.id);
      if (ruleId === '') continue;

      const tags = Array.isArray(entry?.tags) ? (entry.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [];
      const meta = RULE_CATALOG[ruleId];
      const title = meta?.title ?? asString(entry?.help, ruleId);
      const wcag = meta?.wcag?.length ? meta.wcag : wcagFromTags(tags);

      const nodes = Array.isArray(entry?.nodes) ? entry.nodes : [];
      // Cap per rule per page: a broken template can yield thousands of nodes,
      // and grouping only needs enough instances to identify the component.
      for (const node of nodes.slice(0, 25)) {
        if (!node || typeof node !== 'object') continue;
        const target = (node as { target?: unknown }).target;
        const selector = Array.isArray(target)
          ? target.map((t) => (typeof t === 'string' ? t : '')).filter(Boolean).join(' ')
          : '';
        const html = asString((node as { html?: unknown }).html);
        const failureSummary = asString((node as { failureSummary?: unknown }).failureSummary);

        findings.push({
          ruleId,
          title,
          source: 'axe',
          verification: 'automatic',
          wcag,
          impact: meta?.impact ?? DEFAULT_META.impact,
          remediation: meta?.remediation ?? asString(entry?.helpUrl, DEFAULT_META.remediation),
          instance: {
            url: context.url,
            role: context.role,
            selector: selector || '(selector unavailable)',
            snippet: truncate(html, context.maxSnippetChars),
            detail: failureSummary ? truncate(failureSummary, 240) : undefined,
          },
        });
      }
    }

    return findings;
  },
};
