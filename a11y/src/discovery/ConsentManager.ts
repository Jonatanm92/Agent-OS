import type { Page } from 'playwright';
import type { ConsentDecision } from '../core/Types.js';
import { THIRD_PARTY_VENDORS } from '../findings/ThirdParty.js';

/**
 * SYSTEM 2 — the cookie wall.
 *
 * Essentially every European storefront puts a consent overlay in front of the
 * page. Left alone it covers the store, traps focus, and turns every scan into
 * an audit of somebody's CMP instead of the merchant's checkout.
 *
 * What we do, and equally what we refuse to do:
 *
 * - We decline non-essential cookies. We never click "accept all": consenting
 *   to tracking on the operator's behalf is not ours to do, and it changes what
 *   the site loads.
 * - We only click controls inside the identified consent container, so a
 *   mis-detection cannot click something in the store.
 * - If there is no way to decline, we say so and audit the page as it stands.
 *   The result is recorded on the scan either way, so a report can state
 *   whether the store was tested in front of, or behind, its consent wall.
 */

/** Buttons that decline. Ordered: the most explicit refusal wins. */
const DECLINE_PATTERNS: { method: ConsentDecision['method']; pattern: RegExp }[] = [
  { method: 'reject_all', pattern: /^(neka alla|avvisa alla|avböj alla|reject all|decline all|deny all|refuse all)/i },
  {
    method: 'necessary_only',
    pattern: /(endast nödvändiga|bara nödvändiga|endast n[oö]dv[aä]ndiga cookies|tillåt endast nödvändiga|only necessary|necessary only|only essential|essential only|use necessary cookies only|godkänn nödvändiga)/i,
  },
  { method: 'reject_all', pattern: /^(neka|avvisa|avböj|reject|decline|deny)$/i },
  { method: 'close_button', pattern: /^(stäng|st[aä]ng|close|dismiss)$/i },
];

/** Never clicked. Consenting to tracking is the operator's decision, not ours. */
const ACCEPT_PATTERN = /(acceptera alla|godkänn alla|tillåt alla|accept all|allow all|ok, jag förstår|jag godkänner)/i;

const CONSENT_VENDORS = THIRD_PARTY_VENDORS.filter((v) => v.category === 'consent');

interface DetectedBanner {
  selector: string;
  vendor: string | null;
  buttons: { selector: string; name: string }[];
  coverage: number;
}

export async function detectConsentBanner(page: Page): Promise<DetectedBanner | null> {
  return page
    .evaluate(
      ({ vendorSources }: { vendorSources: { id: string; source: string }[] }) => {
        const helpers = (window as any).__a11y;
        const vendors = vendorSources.map((v) => ({ id: v.id, pattern: new RegExp(v.source, 'i') }));
        const consentWords =
          /(cookie|kakor|samtycke|consent|integritet|privacy|personuppgifter|vi använder|we use cookies)/i;

        /**
         * Cheap pass first: consent managers inject at body level or carry a
         * telling id/class. Only if that finds nothing do we walk every
         * element, which is expensive on a large storefront page.
         */
        const likely =
          'body > *, [id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [id*="gdpr" i], [class*="gdpr" i], [id*="cmp" i], [class*="cmp" i], dialog, [role="dialog"], [aria-modal="true"]';

        const qualifies = (el: Element) => {
          if (!helpers.isVisible(el)) return false;
          const style = getComputedStyle(el);
          // The position filter is the real safety guard: it keeps a static
          // page wrapper from ever being mistaken for the consent overlay,
          // which is what stops us clicking a control in the store.
          if (!['fixed', 'sticky', 'absolute'].includes(style.position)) return false;
          const rect = el.getBoundingClientRect();
          const coverage = (rect.width * rect.height) / (window.innerWidth * window.innerHeight);
          if (coverage < 0.04) return false;
          const text = (el as HTMLElement).innerText ?? '';
          if (text.length > 4000 || !consentWords.test(text)) return false;
          return el.querySelector('button, a[role="button"], input[type="button"], input[type="submit"]') !== null;
        };

        let candidates = Array.from(document.querySelectorAll(likely)).filter(qualifies);
        if (candidates.length === 0) candidates = Array.from(document.querySelectorAll('body *')).filter(qualifies);

        if (candidates.length === 0) return null;

        // The outermost qualifying container: clicking inside it is contained
        // to the banner, never to the store behind it.
        const outermost = candidates.filter((el) => !candidates.some((other) => other !== el && other.contains(el)));
        const chosen = outermost.sort((a, b) => {
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return rb.width * rb.height - ra.width * ra.height;
        })[0];
        if (!chosen) return null;

        const identifier = `${chosen.id} ${chosen.className} ${chosen.outerHTML.slice(0, 2000)}`;
        const vendor = vendors.find((v) => v.pattern.test(identifier))?.id ?? null;
        const rect = chosen.getBoundingClientRect();

        const buttons = Array.from(chosen.querySelectorAll('button, a[role="button"], input[type="button"], input[type="submit"]'))
          .filter((el) => helpers.isVisible(el))
          .slice(0, 20)
          .map((el, index) => {
            el.setAttribute('data-a11y-consent-btn', String(index));
            return { selector: `[data-a11y-consent-btn="${index}"]`, name: (helpers.accessibleName(el) || (el as HTMLInputElement).value || '').trim() };
          });

        chosen.setAttribute('data-a11y-consent', 'true');
        return {
          selector: '[data-a11y-consent="true"]',
          vendor,
          buttons,
          coverage: (rect.width * rect.height) / (window.innerWidth * window.innerHeight),
        };
      },
      { vendorSources: CONSENT_VENDORS.map((v) => ({ id: v.id, source: v.pattern.source })) },
    )
    .catch(() => null);
}

/** Detect the consent overlay, decline non-essential cookies, and record what happened. */
export async function handleConsentBanner(page: Page): Promise<ConsentDecision> {
  const banner = await detectConsentBanner(page);
  if (!banner) {
    return {
      detected: false,
      vendor: null,
      dismissed: false,
      method: 'none_present',
      containerSelector: null,
      coveragePercent: null,
      note: 'No consent overlay was covering the page when it loaded.',
    };
  }

  const vendorLabel = banner.vendor ?? 'an unidentified consent manager';

  for (const { method, pattern } of DECLINE_PATTERNS) {
    const match = banner.buttons.find((button) => button.name && pattern.test(button.name) && !ACCEPT_PATTERN.test(button.name));
    if (!match) continue;
    try {
      await page.locator(match.selector).first().click({ timeout: 3000 });
      await page.waitForTimeout(600);
      const stillThere = await detectConsentBanner(page);
      if (!stillThere) {
        await clearMarkers(page);
        return {
          detected: true,
          vendor: banner.vendor,
          dismissed: true,
          method,
          containerSelector: banner.selector,
          coveragePercent: Math.round(banner.coverage * 100),
          note: `Consent overlay from ${vendorLabel} was dismissed by choosing "${match.name}". Non-essential cookies were declined; nothing was accepted on the merchant's behalf.`,
        };
      }
    } catch {
      /* the button did not take the click; fall through to the next pattern */
    }
  }

  await clearMarkers(page);
  return {
    detected: true,
    vendor: banner.vendor,
    dismissed: false,
    method: 'not_dismissible',
    containerSelector: banner.selector,
    coveragePercent: Math.round(banner.coverage * 100),
    note: `A consent overlay from ${vendorLabel} covers ${Math.round(banner.coverage * 100)}% of the page and offers no way to decline non-essential cookies without accepting them. The pages below were tested with the overlay present, which is also what a visitor who declines sees.`,
  };
}

async function clearMarkers(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      document.querySelectorAll('[data-a11y-consent-btn]').forEach((el) => el.removeAttribute('data-a11y-consent-btn'));
      document.querySelectorAll('[data-a11y-consent]').forEach((el) => el.removeAttribute('data-a11y-consent'));
    })
    .catch(() => undefined);
}
