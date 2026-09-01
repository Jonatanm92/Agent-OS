import { createHash, randomUUID } from 'node:crypto';

/** Prefixed ids keep raw database rows readable during operator debugging. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Stable hash used for finding signatures and systemic-group keys. Signatures
 * must survive re-scans so retest and monitoring can line findings up over time.
 */
export function stableHash(...parts: (string | null | undefined)[]): string {
  const h = createHash('sha256');
  for (const p of parts) h.update(String(p ?? ''), 'utf8');
  return h.digest('hex').slice(0, 16);
}

/**
 * Canonical prospect key. Keeps a non-default port (local fixtures and staging
 * sites need it) but drops scheme, path and a leading `www.`.
 */
export function normalizeDomain(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^[a-z]+:\/\//, '');
  value = value.replace(/[/?#].*$/, '');
  value = value.replace(/^www\./, '');
  return value.replace(/:(80|443)$/, '');
}

/** Best-guess origin for a domain or URL the operator typed. */
export function toOrigin(input: string, preferHttps = true): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed).origin;
  const domain = normalizeDomain(trimmed);
  const scheme = preferHttps && !/^(localhost|127\.0\.0\.1)/.test(domain) ? 'https' : 'http';
  return `${scheme}://${domain}`;
}
