import type { PageType, Severity } from '../core/Types.js';

const ORDER: Severity[] = ['low', 'medium', 'high', 'critical'];

export function bumpSeverity(severity: Severity, steps: number): Severity {
  const index = ORDER.indexOf(severity);
  const next = Math.min(ORDER.length - 1, Math.max(0, index + steps));
  return ORDER[next];
}

/**
 * A barrier in the buying journey costs the merchant money; the same barrier on
 * a policy page does not. Severity is therefore weighted by where it was found.
 */
export function weightByPageType(severity: Severity, pageType: PageType): Severity {
  if (['checkout_entry', 'cart', 'product'].includes(pageType)) return bumpSeverity(severity, 1);
  if (pageType === 'content') return bumpSeverity(severity, -1);
  return severity;
}

export function severityFromAxeImpact(impact: 'critical' | 'serious' | 'moderate' | 'minor'): Severity {
  switch (impact) {
    case 'critical':
      return 'critical';
    case 'serious':
      return 'high';
    case 'moderate':
      return 'medium';
    default:
      return 'low';
  }
}

export function severityRank(severity: Severity): number {
  return ORDER.indexOf(severity);
}

export function maxSeverity(values: Severity[]): Severity {
  return values.reduce<Severity>((best, current) => (severityRank(current) > severityRank(best) ? current : best), 'low');
}

/** Findings on these journey steps are what the report calls a customer barrier. */
export function isCustomerJourneyBarrier(severity: Severity, pageType: PageType): boolean {
  return severityRank(severity) >= severityRank('high') && ['product', 'cart', 'checkout_entry', 'category', 'search', 'account'].includes(pageType);
}
