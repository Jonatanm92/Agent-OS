import type { LocalizedText } from '../core/Copy.js';
import type { SourceEngine } from '../core/Types.js';

/**
 * What a probe reports. Deliberately dumb: probes observe and hand over facts,
 * the normalizer turns them into customer-readable findings. Wording lives in
 * the rule catalog so it stays consistent and translatable.
 */
export interface RawIssue {
  engine: SourceEngine;
  /** Internal rule id, e.g. `keyboard.focus-not-visible` or `axe.image-alt`. */
  rule: string;
  selector: string;
  html: string;
  /** Values interpolated into the catalog's observed template. */
  params?: Record<string, string | number>;
  /** Params whose value is itself prose and therefore needs translating. */
  paramsLocalized?: Record<string, LocalizedText>;
  /** Fallback observation for rules with no catalog entry (axe-core). */
  observed?: string;
  impactHint: 'critical' | 'serious' | 'moderate' | 'minor';
  /** Human label for the component the issue lives in, when derivable. */
  componentLabel?: string | null;
  /** Selector to screenshot; defaults to `selector`. */
  screenshotSelector?: string;
  data?: Record<string, unknown>;
  /** axe rule ids and tags, kept verbatim for provenance. */
  raw?: unknown;
}

export function truncateHtml(html: string, max = 600): string {
  const collapsed = html.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}
