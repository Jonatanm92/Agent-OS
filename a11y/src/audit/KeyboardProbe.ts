import type { Page } from 'playwright';
import type { RawIssue } from './RawIssue.js';
import type { ElementDescription } from './PageHelpers.js';

interface TabStop extends ElementDescription {
  index: number;
  marker: number;
  focusStyle: string;
}

const MAX_TAB_STOPS = 60;

/**
 * SYSTEM 3 — keyboard reality check.
 *
 * We drive real Tab presses rather than reasoning about the DOM, because the
 * defects worth selling on (traps, invisible focus, focus parked inside a
 * closed off-canvas menu) only show up when the browser actually moves focus.
 */
export async function runKeyboardProbe(page: Page): Promise<RawIssue[]> {
  const issues: RawIssue[] = [];

  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    document.querySelectorAll('[data-a11y-walk]').forEach((el) => el.removeAttribute('data-a11y-walk'));
  });

  const stops: TabStop[] = [];
  let stuckCount = 0;
  let previousSelector = '';

  for (let index = 0; index < MAX_TAB_STOPS; index += 1) {
    await page.keyboard.press('Tab').catch(() => undefined);
    const stop = await page
      .evaluate((i: number) => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body || el === document.documentElement) return null;
        el.setAttribute('data-a11y-walk', String(i));
        const helpers = (window as any).__a11y;
        return { ...helpers.describe(el), index: i, marker: i, focusStyle: helpers.focusStyle(el) };
      }, index)
      .catch(() => null);

    if (!stop) break;
    if (stop.selector === previousSelector) {
      stuckCount += 1;
      if (stuckCount >= 3) {
        issues.push({
          engine: 'keyboard-probe',
          rule: 'keyboard.focus-trap',
          selector: stop.selector,
          html: stop.html,
          params: { name: stop.name || stop.tag, stopIndex: index + 1 },
          impactHint: 'critical',
          componentLabel: componentLabelFor(stop),
          data: { stopIndex: index },
        });
        break;
      }
    } else {
      stuckCount = 0;
    }
    previousSelector = stop.selector;
    stops.push(stop as TabStop);

    if (stop.ariaHidden) {
      issues.push({
        engine: 'keyboard-probe',
        rule: 'keyboard.focus-in-aria-hidden',
        selector: stop.selector,
        html: stop.html,
        params: { name: stop.name || stop.tag, stopIndex: index + 1 },
        impactHint: 'serious',
        componentLabel: componentLabelFor(stop),
      });
    } else if (!stop.visible) {
      issues.push({
        engine: 'keyboard-probe',
        rule: 'keyboard.focus-on-hidden-element',
        selector: stop.selector,
        html: stop.html,
        params: { name: stop.name || stop.tag, stopIndex: index + 1, width: Math.round(stop.rect.w), height: Math.round(stop.rect.h) },
        impactHint: 'serious',
        componentLabel: componentLabelFor(stop),
      });
    }

    if (!stop.name && ['a', 'button'].includes(stop.tag)) {
      issues.push({
        engine: 'keyboard-probe',
        rule: 'keyboard.unnamed-focus-stop',
        selector: stop.selector,
        html: stop.html,
        params: { stopIndex: index + 1, tag: stop.tag },
        paramsLocalized: {
          kind: stop.tag === 'a' ? { sv: 'länk', en: 'link' } : { sv: 'knapp', en: 'button' },
        },
        impactHint: 'serious',
        componentLabel: componentLabelFor(stop),
      });
    }
  }

  // Focus visibility is judged by diffing each stop's focused styling against
  // its unfocused styling — that is the only reliable way to catch themes that
  // set `outline: none` without providing a replacement indicator.
  if (stops.length) {
    const invisible = await page.evaluate(() => {
      const helpers = (window as any).__a11y;
      const out: { marker: number; selector: string; html: string; name: string; tag: string }[] = [];
      (document.activeElement as HTMLElement | null)?.blur?.();
      for (const el of Array.from(document.querySelectorAll('[data-a11y-walk]'))) {
        const marker = Number(el.getAttribute('data-a11y-walk'));
        const unfocused = helpers.focusStyle(el);
        (el as HTMLElement).focus?.();
        const focused = helpers.focusStyle(el);
        (el as HTMLElement).blur?.();
        if (focused === unfocused) {
          out.push({ marker, selector: helpers.cssPath(el), html: (el.outerHTML || '').replace(/\s+/g, ' ').slice(0, 600), name: helpers.accessibleName(el), tag: el.tagName.toLowerCase() });
        }
      }
      document.querySelectorAll('[data-a11y-walk]').forEach((el) => el.removeAttribute('data-a11y-walk'));
      return out;
    });

    for (const item of invisible.slice(0, 12)) {
      issues.push({
        engine: 'focus-probe',
        rule: 'focus.no-visible-indicator',
        selector: item.selector,
        html: item.html,
        params: { name: item.name || item.tag },
        impactHint: 'serious',
        componentLabel: item.name ? `${item.name} (${item.tag})` : item.tag,
        data: { marker: item.marker },
      });
    }
  }

  // Controls that only work with a mouse.
  const mouseOnly = await page.evaluate(() => {
    const helpers = (window as any).__a11y;
    const out: { selector: string; html: string; name: string; reason: string }[] = [];
    const candidates = Array.from(document.querySelectorAll('[onclick], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"]'));
    for (const el of candidates) {
      const tag = el.tagName.toLowerCase();
      if (['a', 'button', 'input', 'select', 'textarea', 'summary'].includes(tag)) continue;
      if (!helpers.isVisible(el)) continue;
      const tabindex = el.getAttribute('tabindex');
      if (tabindex !== null && Number(tabindex) >= 0) continue;
      out.push({
        selector: helpers.cssPath(el),
        html: (el.outerHTML || '').replace(/\s+/g, ' ').slice(0, 600),
        name: helpers.accessibleName(el),
        reason: el.hasAttribute('onclick') ? 'onclick' : 'aria_role',
      });
      if (out.length >= 12) break;
    }
    return out;
  });

  for (const item of mouseOnly) {
    issues.push({
      engine: 'keyboard-probe',
      rule: 'keyboard.mouse-only-control',
      selector: item.selector,
      html: item.html,
      params: { name: item.name || 'Namnlös kontroll' },
      paramsLocalized: {
        reason:
          item.reason === 'onclick'
            ? { sv: 'har en klickhanterare', en: 'has a click handler attribute' }
            : { sv: 'anger en interaktiv ARIA-roll', en: 'declares an interactive ARIA role' },
      },
      impactHint: 'critical',
      componentLabel: item.name || null,
    });
  }

  return issues;
}

function componentLabelFor(stop: { name: string; tag: string; role: string }): string | null {
  if (stop.name) return stop.name;
  if (stop.role) return `${stop.role} element`;
  return null;
}
