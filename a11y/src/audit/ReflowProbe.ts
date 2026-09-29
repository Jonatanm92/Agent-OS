import type { Page } from 'playwright';
import type { RawIssue } from './RawIssue.js';

const NARROW = { width: 360, height: 800 };

/**
 * SYSTEM 3 — reflow (WCAG 1.4.10). A 320–360 CSS-pixel viewport is the
 * practical equivalent of 400% zoom on a 1280px screen; content that forces
 * horizontal scrolling there is unusable for low-vision users.
 */
export async function runReflowProbe(page: Page): Promise<RawIssue[]> {
  const original = page.viewportSize();
  try {
    await page.setViewportSize(NARROW);
    await page.waitForTimeout(500);
    const result = await page.evaluate(() => {
      const helpers = (window as any).__a11y;
      const docWidth = document.documentElement.scrollWidth;
      const viewport = window.innerWidth;
      if (docWidth <= viewport + 8) return null;
      const offenders = Array.from(document.querySelectorAll('body *'))
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.right > viewport + 8 && helpers.isVisible(el);
        })
        .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)
        .slice(0, 1);
      const worst = offenders[0];
      return {
        docWidth,
        viewport,
        selector: worst ? helpers.cssPath(worst) : 'body',
        html: worst ? (worst.outerHTML || '').replace(/\s+/g, ' ').slice(0, 400) : '<body>',
        overflowBy: Math.round(docWidth - viewport),
      };
    });

    if (!result) return [];
    return [
      {
        engine: 'reflow-probe',
        rule: 'reflow.horizontal-scroll',
        selector: result.selector,
        html: result.html,
        params: { viewport: NARROW.width, docWidth: result.docWidth, overflowBy: result.overflowBy },
        impactHint: 'serious',
        componentLabel: 'Sidlayouten',
        data: result,
      },
    ];
  } catch {
    return [];
  } finally {
    if (original) await page.setViewportSize(original).catch(() => undefined);
  }
}
