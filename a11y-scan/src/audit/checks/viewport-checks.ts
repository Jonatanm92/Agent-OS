/**
 * Checks that need the viewport changed or focus moved, so they cannot run in
 * the same pass as the static DOM checks.
 */
import type { Page } from 'playwright';
import type { Finding } from '../../types.js';
import type { EngineContext } from '../engines.js';
import { REFLOW_WIDTH, MOBILE_VIEWPORT } from '../../config.js';
import { RULE_CATALOG, DEFAULT_META } from '../../analyze/rule-catalog.js';
import { truncate } from '../../security/escape.js';

function toFinding(
  ruleId: string,
  context: EngineContext,
  selector: string,
  snippet: string,
  detail: string
): Finding {
  const meta = RULE_CATALOG[ruleId];
  return {
    ruleId,
    title: meta?.title ?? ruleId,
    source: 'check',
    verification: 'automatic',
    wcag: meta?.wcag ?? DEFAULT_META.wcag,
    impact: meta?.impact ?? DEFAULT_META.impact,
    remediation: meta?.remediation ?? DEFAULT_META.remediation,
    instance: {
      url: context.url,
      role: context.role,
      selector,
      snippet: truncate(snippet, context.maxSnippetChars),
      detail,
    },
  };
}

/**
 * WCAG 1.4.10 Reflow — at 320 CSS px nothing should require horizontal scrolling.
 *
 * Reports the widest offending element rather than just "the page overflows",
 * because the offender is what a developer needs.
 */
export async function checkReflow(page: Page, context: EngineContext): Promise<Finding[]> {
  const original = page.viewportSize();
  try {
    await page.setViewportSize({ width: REFLOW_WIDTH, height: 800 });
    // Let media queries and any resize handlers settle.
    await page.waitForTimeout(300);

    const result = await page.evaluate((limit) => {
      const doc = document.documentElement;
      const overflows = doc.scrollWidth > doc.clientWidth + 1;
      if (!overflows) return null;

      let worst: { selector: string; html: string; right: number } | null = null;
      for (const el of Array.from(document.querySelectorAll('body *')).slice(0, 2500)) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.right <= limit + 1) continue;
        if (!worst || rect.right > worst.right) {
          const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 2);
          worst = {
            selector: el.tagName.toLowerCase() + (cls.length ? `.${cls.join('.')}` : ''),
            html: el.outerHTML.slice(0, 300),
            right: Math.round(rect.right),
          };
        }
      }
      return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, worst };
    }, REFLOW_WIDTH);

    if (!result) return [];

    const worst = result.worst;
    return [
      toFinding(
        'check:reflow-overflow',
        context,
        worst?.selector ?? 'html',
        worst?.html ?? '<html>',
        `Page is ${result.scrollWidth}px wide in a ${result.clientWidth}px viewport.` +
          (worst ? ` Widest element extends to ${worst.right}px.` : '')
      ),
    ];
  } catch {
    return [];
  } finally {
    if (original) await page.setViewportSize(original).catch(() => {});
  }
}

/**
 * WCAG 1.4.4 — a viewport meta tag that suppresses zoom.
 * Checked in Node rather than in-page so the parsing is unit-testable.
 */
export function evaluateViewportMeta(content: string | null): { blocked: boolean; reason: string } {
  if (content === null) return { blocked: false, reason: '' };
  const normalized = content.toLowerCase().replace(/\s+/g, '');

  if (/user-scalable=(no|0|false)/.test(normalized)) {
    return { blocked: true, reason: 'Viewport meta tag sets user-scalable=no.' };
  }
  const maxScale = /maximum-scale=([0-9.]+)/.exec(normalized);
  if (maxScale?.[1]) {
    const value = Number(maxScale[1]);
    if (Number.isFinite(value) && value < 2) {
      return { blocked: true, reason: `Viewport meta tag sets maximum-scale=${maxScale[1]}, below the 2x minimum.` };
    }
  }
  return { blocked: false, reason: '' };
}

export async function checkZoom(page: Page, context: EngineContext): Promise<Finding[]> {
  try {
    const content = await page.evaluate(
      () => document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null
    );
    const verdict = evaluateViewportMeta(content);
    if (!verdict.blocked) return [];
    return [
      toFinding(
        'meta-viewport',
        context,
        'meta[name="viewport"]',
        `<meta name="viewport" content="${content ?? ''}">`,
        verdict.reason
      ),
    ];
  } catch {
    return [];
  }
}

/**
 * WCAG 2.4.7 Focus Visible.
 *
 * Tabs through the first N focusable elements and compares the computed outline,
 * border and box-shadow before and after focus. An element whose painted style
 * is byte-identical focused and unfocused has no visible focus indicator.
 *
 * This is a genuine automated signal, but it is a *detector*, not a judge: a
 * focus style that changes but is too faint still passes here. The manual
 * checklist covers the judgement call, and the report labels this accordingly.
 */
export async function checkFocusVisibility(page: Page, context: EngineContext, limit = 15): Promise<Finding[]> {
  try {
    const results = await page.evaluate((max) => {
      const focusable = Array.from(
        document.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex^="-"])'
        )
      )
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
        })
        .slice(0, max);

      const fingerprint = (el: HTMLElement): string => {
        const s = getComputedStyle(el);
        return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.outlineOffset, s.boxShadow, s.border, s.backgroundColor, s.textDecoration].join('|');
      };

      const bad: { selector: string; html: string }[] = [];
      const previouslyFocused = document.activeElement as HTMLElement | null;

      for (const el of focusable) {
        const before = fingerprint(el);
        el.focus();
        // Also read the ::before/::after boxes, a common way to draw focus rings.
        const after = fingerprint(el);
        const pseudo = [
          getComputedStyle(el, '::before').boxShadow,
          getComputedStyle(el, '::after').boxShadow,
          getComputedStyle(el, '::before').outlineStyle,
          getComputedStyle(el, '::after').outlineStyle,
        ].join('|');
        el.blur();
        const beforePseudo = [
          getComputedStyle(el, '::before').boxShadow,
          getComputedStyle(el, '::after').boxShadow,
          getComputedStyle(el, '::before').outlineStyle,
          getComputedStyle(el, '::after').outlineStyle,
        ].join('|');

        if (before === after && pseudo === beforePseudo) {
          const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 2);
          bad.push({
            selector: el.tagName.toLowerCase() + (cls.length ? `.${cls.join('.')}` : ''),
            html: el.outerHTML.slice(0, 300),
          });
        }
      }

      previouslyFocused?.focus?.();
      return bad;
    }, limit);

    if (!Array.isArray(results)) return [];
    return results.slice(0, 10).map((hit) =>
      toFinding(
        'check:no-focus-indicator',
        context,
        typeof hit?.selector === 'string' ? hit.selector : '(unknown)',
        typeof hit?.html === 'string' ? hit.html : '',
        'Computed style is identical focused and unfocused, so no focus indicator is painted.'
      )
    );
  } catch {
    return [];
  }
}

/** Runs the touch-target check at a phone viewport, where the sizes actually matter. */
export async function withMobileViewport<T>(page: Page, fn: () => Promise<T>): Promise<T> {
  const original = page.viewportSize();
  try {
    await page.setViewportSize({ ...MOBILE_VIEWPORT });
    await page.waitForTimeout(250);
    return await fn();
  } finally {
    if (original) await page.setViewportSize(original).catch(() => {});
  }
}
