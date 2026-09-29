import type { Page } from 'playwright';
import type { RawIssue } from './RawIssue.js';

/**
 * SYSTEM 3 — forms.
 *
 * Static analysis only. We never submit a form on a live site, so validation
 * behaviour that can only be observed by submitting is raised as a manual test
 * item instead of being asserted.
 */
export async function runFormProbe(page: Page): Promise<RawIssue[]> {
  const found = await page
    .evaluate(() => {
      const helpers = (window as any).__a11y;
      const out: any[] = [];
      const push = (el: Element, rule: string, impact: string, params: Record<string, unknown> = {}) =>
        out.push({
          rule,
          impact,
          params,
          selector: helpers.cssPath(el),
          html: (el.outerHTML || '').replace(/\s+/g, ' ').slice(0, 600),
          name: helpers.accessibleName(el),
        });

      const controls = Array.from(document.querySelectorAll('input, select, textarea')).filter((el) => {
        const type = (el.getAttribute('type') || '').toLowerCase();
        return !['hidden', 'submit', 'button', 'image', 'reset'].includes(type) && helpers.isVisible(el);
      });

      for (const el of controls.slice(0, 40)) {
        const name = helpers.accessibleName(el);
        const placeholder = el.getAttribute('placeholder');
        const type = (el.getAttribute('type') || el.tagName).toLowerCase();

        if (!name && !placeholder) {
          push(el, 'form.missing-label', 'critical', { type });
        } else if (!name && placeholder) {
          push(el, 'form.placeholder-as-label', 'serious', { type, placeholder });
        }

        const autocompleteNeeded = /(email|e-post|namn|name|tel|phone|telefon|adress|address|postnummer|zip|postal|stad|city|förnamn|efternamn)/i.test(
          `${name} ${el.getAttribute('name') || ''} ${el.getAttribute('id') || ''} ${placeholder || ''}`,
        );
        if (autocompleteNeeded && !el.getAttribute('autocomplete')) {
          push(el, 'form.missing-autocomplete', 'moderate', { name: name || placeholder || el.getAttribute('name') || type });
        }

        if (el.getAttribute('aria-invalid') === 'true' && !el.getAttribute('aria-describedby') && !el.getAttribute('aria-errormessage')) {
          push(el, 'form.error-not-associated', 'serious', { name: name || type });
        }

        if ((el.hasAttribute('required') || el.getAttribute('aria-required') === 'true') && !name) {
          push(el, 'form.required-unnamed', 'critical', { type });
        }
      }

      // Radio/checkbox groups without a programmatic group name.
      const groups = new Map<string, Element[]>();
      for (const el of Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'))) {
        const key = el.getAttribute('name') || '';
        if (!key) continue;
        groups.set(key, [...(groups.get(key) ?? []), el]);
      }
      for (const [key, members] of groups) {
        if (members.length < 2) continue;
        const first = members[0];
        const grouped = first.closest('fieldset') || first.closest('[role="group"]') || first.closest('[role="radiogroup"]');
        const groupNamed = grouped ? Boolean(grouped.querySelector('legend') || grouped.getAttribute('aria-label') || grouped.getAttribute('aria-labelledby')) : false;
        if (!groupNamed) {
          push(first, 'form.group-not-labelled', 'moderate', { key, memberCount: members.length });
        }
      }

      // Error text that exists in the DOM but is not wired to any field.
      const orphanErrors = Array.from(document.querySelectorAll('[class*="error"], [class*="invalid"], [class*="felmeddelande"]'))
        .filter((el) => helpers.isVisible(el) && helpers.text(el).length > 3)
        .filter((el) => {
          const id = el.getAttribute('id');
          if (!id) return true;
          return !document.querySelector(`[aria-describedby~="${id}"], [aria-errormessage="${id}"]`);
        })
        .slice(0, 5);
      for (const el of orphanErrors) {
        const live = el.getAttribute('aria-live') || el.getAttribute('role');
        if (live) continue;
        push(el, 'form.validation-message-not-announced', 'serious', { text: helpers.text(el).slice(0, 80) });
      }

      return out;
    })
    .catch(() => [] as any[]);

  return found.map((item) => ({
    engine: 'form-probe' as const,
    rule: item.rule,
    selector: item.selector,
    html: item.html,
    params: item.params,
    impactHint: item.impact,
    componentLabel: item.name || null,
    data: item.params,
  }));
}
