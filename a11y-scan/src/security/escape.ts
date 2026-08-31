/**
 * Everything that crosses from a scanned page into a report goes through here.
 *
 * The report is opened locally by a consultant, often from file://, where
 * injected script would run with local privileges. See THREAT-MODEL.md T5.
 */
import { checkUrlSyntax } from './url-guard.js';

/**
 * HTML-escapes a string for any context in the report — text, attribute value,
 * or inside <pre>.
 *
 * `/` is escaped as well as the usual five. That is what stops a value
 * containing `</script>` from closing an enclosing script block. The report
 * emits no <script> elements at all, so this is belt and braces, but the
 * escaping helper is the wrong place to rely on a property of its callers.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#47;');
}

/**
 * Truncates a DOM snippet before escaping. A page can return megabytes of
 * markup in a single snippet; a report needs a readable excerpt.
 */
export function truncate(value: unknown, max: number): string {
  const text = value === null || value === undefined ? '' : String(value);
  // Collapse whitespace so a minified or heavily-indented snippet stays legible.
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max)}… [truncated]`;
}

/** Snippet for display: truncated, then escaped. Order matters. */
export function snippet(value: unknown, max: number): string {
  return escapeHtml(truncate(value, max));
}

/**
 * A URL is only rendered as a clickable link if it is still http/https.
 * Anything else — javascript:, data:, a mangled string — is returned as
 * `{ safe: false }` and the caller renders it as inert text instead.
 */
export function safeLink(raw: string): { safe: boolean; href: string; text: string } {
  const check = checkUrlSyntax(raw);
  if (!check.allowed || !check.url) {
    return { safe: false, href: '', text: escapeHtml(raw) };
  }
  return { safe: true, href: escapeHtml(check.url.toString()), text: escapeHtml(check.url.toString()) };
}
