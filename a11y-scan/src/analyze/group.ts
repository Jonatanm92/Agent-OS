/**
 * Phase 4 — deduplication.
 *
 * The requirement: one defect must not become 40 findings because it appears on
 * 40 pages. Findings are grouped by rule plus *component*, where the component
 * is the selector with positional and identifier noise removed, so
 * `.grid > li:nth-of-type(7) > a.card` and `.grid > li:nth-of-type(2) > a.card`
 * are recognised as one template.
 */
import type { Finding, Instance, Issue, PageRole } from '../types.js';

/**
 * Strips the parts of a selector that vary per instance while keeping the parts
 * that identify the component.
 */
export function normalizeSelector(selector: string): string {
  return (
    selector
      // :nth-child(7), :nth-of-type(2) — position within a list
      .replace(/:nth-(child|of-type|last-child|last-of-type)\([^)]*\)/g, '')
      // #product-4821 → [id] : a generated id identifies an instance, not a component
      .replace(/#[A-Za-z0-9_\-:.]*\d[A-Za-z0-9_\-:.]*/g, '[id]')
      // .item-3, .col-7 → .item-N : numbered utility classes
      .replace(/\.([A-Za-z_-]+)\d+\b/g, '.$1N')
      // Attribute VALUES are instance data, attribute NAMES identify the
      // component. Handles every CSS operator, so both
      //   [data-product-id="4821"]  and  [href$="handduk.html"]
      // collapse to [data-product-id] and [href] — otherwise two cards linking
      // to different products would be reported as two separate components.
      .replace(/\[\s*([A-Za-z_:][-\w:.]*)\s*(?:[~^$*|]?=\s*(?:"[^"]*"|'[^']*'|[^\]]*))?\s*(?:[isIS]\s*)?\]/g, '[$1]')
      .replace(/\s*>\s*/g, ' > ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * A short human label for the component, used as the finding's heading context.
 * Takes the last two segments, which is where the meaningful class usually is.
 */
export function componentLabel(normalized: string): string {
  const segments = normalized.split(' > ').filter(Boolean);
  if (segments.length === 0) return '(page level)';
  return segments.slice(-2).join(' > ');
}

/** Stable id so the same issue keeps the same anchor across re-scans. */
function issueId(ruleId: string, component: string): string {
  let hash = 0;
  const source = `${ruleId}::${component}`;
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 31 + source.charCodeAt(i)) | 0;
  }
  return `${ruleId.replace(/[^a-z0-9]+/gi, '-')}-${(hash >>> 0).toString(36)}`;
}

export function groupFindings(findings: Finding[]): Omit<Issue, 'severity' | 'effort' | 'priority'>[] {
  const buckets = new Map<
    string,
    {
      finding: Finding;
      component: string;
      instances: Instance[];
      urls: Set<string>;
      roles: Set<PageRole>;
      /** Distinct selector shapes inside the bucket — drives effort estimation. */
      selectorShapes: Set<string>;
    }
  >();

  for (const finding of findings) {
    const component = normalizeSelector(finding.instance.selector);
    const key = `${finding.ruleId}::${component}`;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        finding,
        component,
        instances: [],
        urls: new Set(),
        roles: new Set(),
        selectorShapes: new Set(),
      };
      buckets.set(key, bucket);
    }

    bucket.instances.push(finding.instance);
    bucket.urls.add(finding.instance.url);
    bucket.roles.add(finding.instance.role);
    bucket.selectorShapes.add(finding.instance.selector);
  }

  return [...buckets.values()].map((bucket) => ({
    id: issueId(bucket.finding.ruleId, bucket.component),
    ruleId: bucket.finding.ruleId,
    title: bucket.finding.title,
    source: bucket.finding.source,
    verification: bucket.finding.verification,
    wcag: bucket.finding.wcag,
    impact: bucket.finding.impact,
    remediation: bucket.finding.remediation,
    component: componentLabel(bucket.component),
    affectedUrls: [...bucket.urls].sort(),
    affectedRoles: [...bucket.roles],
    instanceCount: bucket.instances.length,
    // Three is enough to recognise the pattern without turning the report into
    // a DOM dump; the full count is stated alongside.
    examples: pickExamples(bucket.instances),
  }));
}

/**
 * Prefers examples from different pages, so the three shown demonstrate the
 * spread rather than three copies from one page.
 */
function pickExamples(instances: Instance[], max = 3): Instance[] {
  const byUrl = new Map<string, Instance>();
  for (const instance of instances) {
    if (!byUrl.has(instance.url)) byUrl.set(instance.url, instance);
    if (byUrl.size >= max) break;
  }
  const chosen = [...byUrl.values()];
  for (const instance of instances) {
    if (chosen.length >= max) break;
    if (!chosen.includes(instance)) chosen.push(instance);
  }
  return chosen.slice(0, max);
}

/**
 * How many separate components a rule produced.
 *
 * This is the number of places a developer has to edit. One shared template
 * rendered on forty pages is a single group, so a single fix; forty
 * hand-written variations normalize differently, so they form forty groups and
 * the effort estimate rises accordingly.
 *
 * Counting raw selectors here would be wrong: they still carry :nth-child
 * noise, so a shared template would look like forty separate fixes.
 */
export function componentsPerRule(
  groups: { ruleId: string }[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const group of groups) {
    counts.set(group.ruleId, (counts.get(group.ruleId) ?? 0) + 1);
  }
  return counts;
}
