import type { Page } from 'playwright';
import type { RawIssue } from './RawIssue.js';

/**
 * Never activated. Anything that could buy, order, pay, delete, submit or log
 * out is out of bounds — the probe only opens things that show content.
 */
const DESTRUCTIVE = /(köp|kop\b|lägg i|lagg i|beställ|bestall|betala|buy|order|pay|checkout|kassa|submit|skicka|radera|ta bort|delete|remove|logga ut|log out|sign out|prenumerera|subscribe)/i;

/** Components worth probing: the ones a shopper must operate to buy something. */
const DISCLOSURE = /(filter|filtrera|sortera|sort|meny|menu|navigation|nav\b|sök|search|storlek|size|färg|color|välj|choose|variant|dropdown|panel|drawer|dialog|modal|mer|more|visa)/i;

interface Trigger {
  selector: string;
  html: string;
  name: string;
  tag: string;
  role: string;
  hasPopup: string | null;
  expanded: string | null;
  nativelyFocusable: boolean;
}

interface OverlaySnapshot {
  selector: string;
  visible: boolean;
  area: number;
  role: string;
  hasName: boolean;
  ariaModal: boolean;
}

/**
 * SYSTEM 3 — interactive component behaviour.
 *
 * Opens candidate disclosure components (filters, menus, size pickers) with the
 * keyboard and checks the four things that decide whether a keyboard or screen
 * reader user can actually shop: does Enter activate it, does focus move into
 * it, does Escape close it, and is it announced with a name.
 */
export async function runDialogProbe(page: Page): Promise<RawIssue[]> {
  const issues: RawIssue[] = [];

  // A promo overlay left open would block every interaction below. Press
  // Escape once, exactly as a visitor would, and carry on either way.
  const blocked = await hasBlockingOverlay(page);
  if (blocked) {
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(250);
  }

  const startUrl = page.url();
  const triggers = await findTriggers(page);

  for (const trigger of triggers.slice(0, 4)) {
    // Any navigation means we are no longer testing the page we were given.
    if (page.url() !== startUrl) {
      await page.goto(startUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      break;
    }
    const before = await snapshotOverlays(page);

    const focused = await page
      .evaluate((selector: string) => {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) return false;
        el.focus();
        return document.activeElement === el;
      }, trigger.selector)
      .catch(() => false);

    if (!focused) {
      if (!trigger.nativelyFocusable) {
        issues.push({
          engine: 'dialog-probe',
          rule: 'component.trigger-not-focusable',
          selector: trigger.selector,
          html: trigger.html,
          params: { name: trigger.name || trigger.selector },
          paramsLocalized: { role: { sv: trigger.role || 'kontroll', en: trigger.role || 'control' } },
          impactHint: 'critical',
          componentLabel: trigger.name || null,
        });
      }
      continue;
    }

    await page.keyboard.press('Enter').catch(() => undefined);
    await page.waitForTimeout(400);
    if (page.url() !== startUrl) {
      await page.goto(startUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      break;
    }
    const afterEnter = await snapshotOverlays(page);
    const openedByEnter = newlyVisible(before, afterEnter);

    if (!openedByEnter) {
      // Enter did nothing. Does a pointer click open it? If so the component is
      // mouse-only, which is a concrete, demonstrable barrier.
      const openedByClick = await tryPointerOpen(page, trigger, before);
      if (openedByClick) {
        issues.push({
          engine: 'dialog-probe',
          rule: 'component.enter-does-not-activate',
          selector: trigger.selector,
          html: trigger.html,
          params: { name: trigger.name || trigger.selector },
          impactHint: 'critical',
          componentLabel: trigger.name || null,
          data: { openedBy: 'pointer' },
        });
        await closeOverlay(page, trigger);
      }
      continue;
    }

    const overlay = openedByEnter;
    const insideAfterOpen = await focusLocation(page, overlay.selector);
    if (!insideAfterOpen.insideOverlay) {
      issues.push({
        engine: 'dialog-probe',
        rule: 'component.focus-not-moved',
        selector: overlay.selector,
        html: trigger.html,
        params: { name: trigger.name || trigger.selector },
        impactHint: 'serious',
        componentLabel: trigger.name || null,
        screenshotSelector: overlay.selector,
      });
    }

    if (overlay.ariaModal && !insideAfterOpen.trapped) {
      issues.push({
        engine: 'dialog-probe',
        rule: 'component.modal-without-focus-containment',
        selector: overlay.selector,
        html: trigger.html,
        params: { name: trigger.name || trigger.selector },
        impactHint: 'serious',
        componentLabel: trigger.name || null,
        screenshotSelector: overlay.selector,
      });
    }

    if (!overlay.hasName && (overlay.role === 'dialog' || overlay.ariaModal)) {
      issues.push({
        engine: 'dialog-probe',
        rule: 'component.dialog-missing-name',
        selector: overlay.selector,
        html: trigger.html,
        params: { name: trigger.name || trigger.selector },
        impactHint: 'moderate',
        componentLabel: trigger.name || null,
        screenshotSelector: overlay.selector,
      });
    }

    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(350);
    const afterEscape = await snapshotOverlays(page);
    const stillOpen = afterEscape.find((o) => o.selector === overlay.selector && o.visible);
    if (stillOpen) {
      issues.push({
        engine: 'dialog-probe',
        rule: 'component.escape-does-not-close',
        selector: overlay.selector,
        html: trigger.html,
        params: { name: trigger.name || trigger.selector },
        impactHint: overlay.ariaModal ? 'serious' : 'moderate',
        componentLabel: trigger.name || null,
        screenshotSelector: overlay.selector,
      });
      await closeOverlay(page, trigger);
    }
  }

  return issues;
}

async function hasBlockingOverlay(page: Page): Promise<boolean> {
  return page
    .evaluate(() => {
      const helpers = (window as any).__a11y;
      return Array.from(document.querySelectorAll('[class*="backdrop"], [class*="overlay"], [aria-modal="true"], dialog[open]')).some((el) => {
        if (!helpers.isVisible(el)) return false;
        const rect = el.getBoundingClientRect();
        return rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.9;
      });
    })
    .catch(() => false);
}

async function findTriggers(page: Page): Promise<Trigger[]> {
  return page
    .evaluate(
      ({ disclosureSource, destructiveSource }: { disclosureSource: string; destructiveSource: string }) => {
        const disclosure = new RegExp(disclosureSource, 'i');
        const destructive = new RegExp(destructiveSource, 'i');
        const helpers = (window as any).__a11y;
        const out: any[] = [];
        const candidates = Array.from(
          document.querySelectorAll('button, [role="button"], [aria-haspopup], [aria-expanded], summary, [class*="filter"], [class*="menu"], [class*="toggle"], [class*="dropdown"]'),
        );
        const INTERACTIVE_ROLES = ['button', 'tab', 'menuitem', 'switch', 'combobox', 'link'];
        for (const el of candidates) {
          if (!helpers.isVisible(el)) continue;
          const name = helpers.accessibleName(el);
          const descriptor = `${name} ${el.getAttribute('class') || ''} ${el.getAttribute('id') || ''} ${el.getAttribute('data-testid') || ''}`;
          if (destructive.test(descriptor)) continue;
          const hasPopup = el.getAttribute('aria-haspopup');
          const expanded = el.getAttribute('aria-expanded');
          if (!hasPopup && expanded === null && !disclosure.test(descriptor)) continue;
          if (expanded === 'true') continue;
          const tag = el.tagName.toLowerCase();
          const tabindex = el.getAttribute('tabindex');

          // Only elements that actually present themselves as controls. A
          // wrapper <div class="filters"> is a container, not a trigger, and
          // flagging it would be a false positive we would have to defend.
          const role = el.getAttribute('role') || '';
          // A control that submits a form navigates away; probing it would
          // both leave the page under test and act on someone's website.
          const type = (el.getAttribute('type') || '').toLowerCase();
          const inForm = Boolean(el.closest('form'));
          if (type === 'submit' || type === 'reset' || type === 'image') continue;
          if (inForm && tag === 'button' && type !== 'button') continue;

          const controlLike =
            ['button', 'summary', 'a'].includes(tag) ||
            INTERACTIVE_ROLES.includes(role) ||
            Boolean(hasPopup) ||
            expanded !== null ||
            (getComputedStyle(el).cursor === 'pointer' && helpers.text(el).length <= 40 && el.querySelectorAll('a, button, input').length === 0);
          if (!controlLike) continue;
          out.push({
            selector: helpers.cssPath(el),
            html: (el.outerHTML || '').replace(/\s+/g, ' ').slice(0, 600),
            name,
            tag,
            role: role || tag,
            hasPopup,
            expanded,
            nativelyFocusable: ['button', 'a', 'summary', 'input', 'select', 'textarea'].includes(tag) || (tabindex !== null && Number(tabindex) >= 0),
          });
          if (out.length >= 8) break;
        }
        return out;
      },
      { disclosureSource: DISCLOSURE.source, destructiveSource: DESTRUCTIVE.source },
    )
    .catch(() => [] as Trigger[]);
}

async function snapshotOverlays(page: Page): Promise<OverlaySnapshot[]> {
  return page
    .evaluate(() => {
      const helpers = (window as any).__a11y;
      const nodes = Array.from(
        document.querySelectorAll(
          '[role="dialog"], [role="menu"], [role="listbox"], [role="region"], dialog, [aria-modal], [class*="modal"], [class*="drawer"], [class*="offcanvas"], [class*="dropdown"], [class*="panel"], [class*="filter"], [id*="filter"], [class*="menu"]',
        ),
      ).slice(0, 60);
      return nodes.map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          selector: helpers.cssPath(el),
          visible: helpers.isVisible(el),
          area: rect.width * rect.height,
          role: el.getAttribute('role') || '',
          hasName: Boolean(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')),
          ariaModal: el.getAttribute('aria-modal') === 'true' || el.tagName.toLowerCase() === 'dialog',
        };
      });
    })
    .catch(() => [] as OverlaySnapshot[]);
}

function newlyVisible(before: OverlaySnapshot[], after: OverlaySnapshot[]): OverlaySnapshot | null {
  const previous = new Map(before.map((o) => [o.selector, o]));
  const opened = after
    .filter((o) => o.visible && o.area > 2000 && !(previous.get(o.selector)?.visible ?? false))
    .sort((a, b) => b.area - a.area);
  return opened[0] ?? null;
}

async function tryPointerOpen(page: Page, trigger: Trigger, before: OverlaySnapshot[]): Promise<boolean> {
  const startUrl = page.url();
  try {
    await page.locator(trigger.selector).first().click({ timeout: 2500, trial: false });
  } catch {
    return false;
  }
  await page.waitForTimeout(400);
  if (page.url() !== startUrl) {
    // The click navigated: this was a link or a submit, not a disclosure.
    await page.goto(startUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    return false;
  }
  return Boolean(newlyVisible(before, await snapshotOverlays(page)));
}

async function focusLocation(page: Page, overlaySelector: string): Promise<{ insideOverlay: boolean; trapped: boolean }> {
  const inside = await page
    .evaluate((selector: string) => {
      const overlay = document.querySelector(selector);
      const active = document.activeElement;
      return Boolean(overlay && active && overlay.contains(active));
    }, overlaySelector)
    .catch(() => false);

  // Tab a few times and see whether focus stays within the overlay.
  let escaped = false;
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab').catch(() => undefined);
    const stillInside = await page
      .evaluate((selector: string) => {
        const overlay = document.querySelector(selector);
        const active = document.activeElement;
        return Boolean(overlay && active && overlay.contains(active));
      }, overlaySelector)
      .catch(() => false);
    if (!stillInside) {
      escaped = true;
      break;
    }
  }
  return { insideOverlay: inside, trapped: !escaped };
}

async function closeOverlay(page: Page, trigger: Trigger): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);
  await page
    .locator(trigger.selector)
    .first()
    .click({ timeout: 1500 })
    .catch(() => undefined);
  await page.waitForTimeout(200);
}
