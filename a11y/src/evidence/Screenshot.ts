import type { Page } from 'playwright';
import type { ObjectStorage } from './Storage.js';

const HIGHLIGHT_ID = '__a11y_highlight__';

/**
 * Evidence screenshot: the offending element outlined in context, so a
 * developer can see what we mean without re-deriving the selector.
 */
export async function captureEvidence(
  page: Page,
  selector: string,
  storage: ObjectStorage,
  key: string,
): Promise<string | null> {
  try {
    const located = await page.evaluate(
      ({ selector, highlightId }: { selector: string; highlightId: string }) => {
        let el: Element | null = null;
        try {
          el = document.querySelector(selector);
        } catch {
          el = null;
        }
        if (!el) return false;
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
        const rect = el.getBoundingClientRect();
        const box = document.createElement('div');
        box.id = highlightId;
        Object.assign(box.style, {
          position: 'fixed',
          left: `${Math.max(rect.left - 4, 0)}px`,
          top: `${Math.max(rect.top - 4, 0)}px`,
          width: `${rect.width + 8}px`,
          height: `${rect.height + 8}px`,
          border: '3px solid #e11d48',
          borderRadius: '4px',
          // A light veil: enough to draw the eye, not so much that the reader
          // loses the context the screenshot exists to provide.
          boxShadow: '0 0 0 9999px rgba(15,23,42,0.10), 0 0 0 6px rgba(225,29,72,0.25)',
          pointerEvents: 'none',
          zIndex: '2147483647',
        });
        document.body.appendChild(box);
        return true;
      },
      { selector, highlightId: HIGHLIGHT_ID },
    );

    if (!located) return null;
    await page.waitForTimeout(120);
    const buffer = await page.screenshot({ type: 'png', animations: 'disabled' });
    await page.evaluate((highlightId: string) => document.getElementById(highlightId)?.remove(), HIGHLIGHT_ID);
    await storage.put(key, buffer, 'image/png');
    return key;
  } catch {
    await page.evaluate((highlightId: string) => document.getElementById(highlightId)?.remove(), HIGHLIGHT_ID).catch(() => undefined);
    return null;
  }
}

export async function capturePageScreenshot(page: Page, storage: ObjectStorage, key: string): Promise<string | null> {
  try {
    const buffer = await page.screenshot({ type: 'png', animations: 'disabled' });
    await storage.put(key, buffer, 'image/png');
    return key;
  } catch {
    return null;
  }
}
