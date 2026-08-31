/**
 * Element screenshots as supporting evidence.
 *
 * Deliberately best-effort. A screenshot makes a finding easier to act on, but
 * it is never a precondition for reporting one: every failure mode here
 * (detached element, zero-size box, selector that no longer resolves, capture
 * timeout, oversized image) results in a finding WITHOUT a picture, never in a
 * lost finding and never in a thrown error.
 */
import type { Page } from 'playwright';
import type { Finding } from '../types.js';

/** Rules where a picture genuinely adds information a snippet cannot convey. */
const VISUAL_RULES = new Set([
  'color-contrast',
  'check:touch-target-size',
  'check:no-focus-indicator',
  'check:reflow-overflow',
  'check:nonsemantic-clickable',
  'link-in-text-block',
  'button-name',
  'link-name',
]);

export interface ScreenshotLimits {
  maxScreenshotsPerPage: number;
  maxScreenshotBytes: number;
}

/**
 * Attaches screenshots in place, to at most `maxScreenshotsPerPage` findings.
 * Returns the number captured, which the caller may log.
 */
export async function attachScreenshots(
  page: Page,
  findings: Finding[],
  limits: ScreenshotLimits
): Promise<number> {
  if (limits.maxScreenshotsPerPage <= 0) return 0;

  // Prefer rules where a picture helps, then anything else, and take at most
  // one per rule so four captures cover four different problems.
  const seenRules = new Set<string>();
  const candidates = [
    ...findings.filter((f) => VISUAL_RULES.has(f.ruleId)),
    ...findings.filter((f) => !VISUAL_RULES.has(f.ruleId)),
  ].filter((finding) => {
    if (seenRules.has(finding.ruleId)) return false;
    seenRules.add(finding.ruleId);
    return true;
  });

  let captured = 0;

  for (const finding of candidates) {
    if (captured >= limits.maxScreenshotsPerPage) break;

    const selector = finding.instance.selector;
    if (!selector || selector.startsWith('(')) continue;

    try {
      // `.first()` because a normalized selector legitimately matches many
      // elements; strict mode would throw on exactly the common case.
      const locator = page.locator(selector).first();

      const box = await locator.boundingBox({ timeout: 1500 });
      // A zero-size or off-screen element produces an empty or useless image.
      if (!box || box.width < 2 || box.height < 2) continue;
      if (box.width > 2000 || box.height > 2000) continue;

      const buffer = await locator.screenshot({ timeout: 3000, scale: 'css' });
      if (buffer.byteLength > limits.maxScreenshotBytes) continue;

      finding.instance.screenshot = `data:image/png;base64,${buffer.toString('base64')}`;
      captured++;
    } catch {
      // Detached node, invalid selector, animation timeout, element covered by
      // an overlay — all expected on real shops. The finding stands regardless.
      continue;
    }
  }

  return captured;
}
