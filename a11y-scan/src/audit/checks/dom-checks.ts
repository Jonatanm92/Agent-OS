/**
 * Checks axe does not attempt, run inside the page.
 *
 * Everything here is a function serialised into the browser by
 * `page.evaluate`. It is our code, not the target's; only its RETURN VALUE is
 * untrusted, and that is validated for shape before it leaves this module.
 */
import type { Page } from 'playwright';
import type { Finding } from '../../types.js';
import type { EngineContext } from '../engines.js';
import { DEFAULT_META, GENERIC_VERIFY, RULE_CATALOG } from '../../analyze/rule-catalog.js';
import { truncate } from '../../security/escape.js';

/** What the in-page script returns. Deliberately primitive so it survives serialisation. */
export interface RawHit {
  ruleId: string;
  selector: string;
  snippet: string;
  detail?: string;
}

/** Link text that tells a screen reader user nothing out of context. */
const GENERIC_LINK_TEXT = [
  'läs mer', 'las mer', 'read more', 'more', 'mer', 'click here', 'klicka här', 'klicka har',
  'here', 'här', 'har', 'link', 'länk', 'lank', 'details', 'detaljer', 'view', 'visa', 'se mer',
];

/** Fields where autofill materially reduces checkout effort. */
const AUTOCOMPLETE_HINTS: [RegExp, string][] = [
  [/(^|[-_])(fname|firstname|given|förnamn|fornamn)/i, 'given-name'],
  [/(^|[-_])(lname|lastname|surname|family|efternamn)/i, 'family-name'],
  [/e-?mail|epost|e-post/i, 'email'],
  [/phone|tel|mobil|telefon/i, 'tel'],
  [/address|adress|street|gata/i, 'street-address'],
  [/(zip|postal|postnummer|postnr)/i, 'postal-code'],
  [/(city|ort|postort|stad)/i, 'address-level2'],
  [/country|land/i, 'country-name'],
];

/**
 * The in-page collector. Returns raw hits; severity and wording are added in Node.
 *
 * Written as one function because `page.evaluate` serialises a single callable —
 * it cannot reference module scope.
 */
/* c8 ignore start — executes in the browser, covered by browser-backed tests */
function collect(config: { genericText: string[]; autocompleteHints: [string, string][] }): RawHit[] {
  const hits: RawHit[] = [];
  const MAX_PER_RULE = 25;
  const counts: Record<string, number> = {};

  const push = (ruleId: string, el: Element, detail?: string): void => {
    counts[ruleId] = (counts[ruleId] ?? 0) + 1;
    if (counts[ruleId]! > MAX_PER_RULE) return;
    hits.push({
      ruleId,
      selector: cssPath(el),
      snippet: el.outerHTML.slice(0, 600),
      detail,
    });
  };

  /** Short, stable-ish CSS path. Grouping normalises it further in Node. */
  function cssPath(el: Element): string {
    const parts: string[] = [];
    let node: Element | null = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 5) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        part += `#${node.id}`;
        parts.unshift(part);
        break;
      }
      const cls = (node.getAttribute('class') ?? '')
        .split(/\s+/)
        .filter((c) => c.length > 0 && c.length < 40)
        .slice(0, 2);
      if (cls.length) part += `.${cls.join('.')}`;
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = node.parentElement;
      depth++;
    }
    return parts.join(' > ');
  }

  const accessibleName = (el: Element): string => {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria.trim();
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const text = labelledby
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
        .trim();
      if (text) return text;
    }
    const img = el.querySelector('img[alt]');
    const alt = img?.getAttribute('alt')?.trim();
    return (el.textContent ?? '').trim() || alt || '';
  };

  const isVisible = (el: Element): boolean => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  // --- 2.5.8 Target Size -------------------------------------------------
  const interactive = document.querySelectorAll<HTMLElement>(
    'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link]'
  );
  for (const el of Array.from(interactive).slice(0, 400)) {
    if (!isVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    // Inline links inside a paragraph are explicitly exempted by 2.5.8.
    const inTextBlock =
      el.tagName === 'A' && el.parentElement !== null && /^(P|LI|SPAN|TD|H[1-6])$/.test(el.parentElement.tagName);
    if (inTextBlock) continue;
    if (rect.width < 24 || rect.height < 24) {
      push('check:touch-target-size', el, `Measured ${Math.round(rect.width)}x${Math.round(rect.height)} CSS px (minimum 24x24).`);
    }
  }

  // --- 2.4.4 Link Purpose ------------------------------------------------
  for (const el of Array.from(document.querySelectorAll('a[href]')).slice(0, 300)) {
    if (!isVisible(el)) continue;
    const name = accessibleName(el).toLowerCase().replace(/[\s ]+/g, ' ').trim();
    if (name === '') continue; // axe's link-name covers the empty case
    if (config.genericText.includes(name)) {
      push('check:generic-link-text', el, `Link text is "${name}".`);
    }
  }

  // --- 1.3.5 Identify Input Purpose --------------------------------------
  for (const el of Array.from(document.querySelectorAll('input')).slice(0, 200)) {
    const input = el as HTMLInputElement;
    const type = (input.getAttribute('type') ?? 'text').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'checkbox', 'radio', 'file', 'search'].includes(type)) continue;
    if ((input.getAttribute('autocomplete') ?? '').trim() !== '') continue;
    const haystack = `${input.name} ${input.id} ${input.getAttribute('placeholder') ?? ''}`;
    for (const [pattern, token] of config.autocompleteHints) {
      if (new RegExp(pattern, 'i').test(haystack)) {
        push('check:missing-autocomplete', input, `Looks like a "${token}" field but has no autocomplete attribute.`);
        break;
      }
    }
  }

  // --- 2.4.3 Focus Order -------------------------------------------------
  for (const el of Array.from(document.querySelectorAll('[tabindex]')).slice(0, 200)) {
    const value = Number(el.getAttribute('tabindex'));
    if (Number.isFinite(value) && value > 0) {
      push('check:positive-tabindex', el, `tabindex="${value}".`);
    }
  }

  // --- 2.1.1 Keyboard: clickable non-semantic elements --------------------
  for (const el of Array.from(document.querySelectorAll('div, span, li')).slice(0, 600)) {
    if (!isVisible(el)) continue;
    const hasInlineHandler = el.hasAttribute('onclick');
    const looksClickable = getComputedStyle(el).cursor === 'pointer';
    if (!hasInlineHandler && !looksClickable) continue;
    // Containers whose clickable child is the real control are fine.
    if (el.querySelector('a[href], button, input, select, textarea, [role=button], [role=link]')) continue;
    if (el.closest('a[href], button, [role=button], [role=link], label')) continue;
    const role = el.getAttribute('role') ?? '';
    const tabindex = el.getAttribute('tabindex');
    const focusable = tabindex !== null && Number(tabindex) >= 0;
    const hasInteractiveRole = /^(button|link|checkbox|menuitem|tab|option|switch)$/.test(role);
    if (!focusable || !hasInteractiveRole) {
      push(
        'check:nonsemantic-clickable',
        el,
        `Element responds to clicks but ${!focusable ? 'cannot receive keyboard focus' : 'has no interactive role'}.`
      );
    }
  }

  // --- 2.4.1 Bypass Blocks ----------------------------------------------
  const firstLinks = Array.from(document.querySelectorAll('a[href^="#"]')).slice(0, 5);
  const hasSkipLink = firstLinks.some((a) =>
    /skip|hoppa|to content|till innehåll|till innehall|main/i.test(
      (a.textContent ?? '') + ' ' + (a.getAttribute('aria-label') ?? '') + ' ' + (a.getAttribute('href') ?? '')
    )
  );
  if (!hasSkipLink && document.body) {
    hits.push({
      ruleId: 'check:no-skip-link',
      selector: 'body',
      snippet: '<body> — no skip link found among the first in-page anchors',
      detail: 'No "skip to content" link was found before the main navigation.',
    });
  }

  // --- 1.3.1 / 2.4.6 h1 --------------------------------------------------
  const h1s = document.querySelectorAll('h1');
  if (h1s.length === 0 && document.body) {
    hits.push({
      ruleId: 'check:no-h1',
      selector: 'body',
      snippet: '<body> — document contains no <h1>',
      detail: 'No level-one heading on the page.',
    });
  }

  return hits;
}
/* c8 ignore stop */

/** Validates the shape of anything coming back from the page before use. */
function sanitiseHits(raw: unknown): RawHit[] {
  if (!Array.isArray(raw)) return [];
  const out: RawHit[] = [];
  for (const item of raw.slice(0, 500)) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (typeof record.ruleId !== 'string' || record.ruleId === '') continue;
    out.push({
      ruleId: record.ruleId,
      selector: typeof record.selector === 'string' ? record.selector : '(selector unavailable)',
      snippet: typeof record.snippet === 'string' ? record.snippet : '',
      detail: typeof record.detail === 'string' ? record.detail : undefined,
    });
  }
  return out;
}

export function hitsToFindings(hits: RawHit[], context: EngineContext): Finding[] {
  return hits.map((hit) => {
    const meta = RULE_CATALOG[hit.ruleId];
    return {
      ruleId: hit.ruleId,
      title: meta?.title ?? hit.ruleId,
      source: 'check' as const,
      verification: 'automatic' as const,
      wcag: meta?.wcag ?? DEFAULT_META.wcag,
      impact: meta?.impact ?? DEFAULT_META.impact,
      remediation: meta?.remediation ?? DEFAULT_META.remediation,
      verify: meta?.verify ?? GENERIC_VERIFY,
      instance: {
        url: context.url,
        role: context.role,
        selector: hit.selector,
        snippet: truncate(hit.snippet, context.maxSnippetChars),
        detail: hit.detail,
      },
    };
  });
}

export async function runDomChecks(page: Page, context: EngineContext): Promise<Finding[]> {
  try {
    const raw = await page.evaluate(collect, {
      genericText: GENERIC_LINK_TEXT,
      autocompleteHints: AUTOCOMPLETE_HINTS.map(([re, token]) => [re.source, token] as [string, string]),
    });
    return hitsToFindings(sanitiseHits(raw), context);
  } catch {
    return [];
  }
}
