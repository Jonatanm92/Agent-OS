/**
 * How persuasive a finding is when put in front of a merchant, and how much it
 * proves about the site's overall quality.
 *
 * This is a commercial weighting, not a severity judgement: a filter a keyboard
 * user cannot open is something the merchant can verify in ten seconds, while a
 * contrast ratio needs a colour picker and a specification to argue about.
 * Severity is decided by `Severity.ts` and is never changed by these numbers.
 */
export const LEAD_VALUE: Record<string, number> = {
  'component.enter-does-not-activate': 30,
  'keyboard.focus-trap': 30,
  'component.trigger-not-focusable': 28,
  'keyboard.mouse-only-control': 28,
  'form.missing-label': 20,
  'form.required-unnamed': 20,
  'component.focus-not-moved': 20,
  'component.modal-without-focus-containment': 16,
  'keyboard.focus-in-aria-hidden': 14,
  'keyboard.focus-on-hidden-element': 14,
  'axe.button-name': 14,
  'axe.select-name': 14,
  'axe.link-name': 12,
  'reflow.horizontal-scroll': 12,
  'keyboard.unnamed-focus-stop': 12,
  'component.escape-does-not-close': 10,
  'form.placeholder-as-label': 10,
  'axe.image-alt': 10,
  'focus.no-visible-indicator': 8,
  'form.error-not-associated': 8,
};

export function leadValue(rule: string): number {
  return LEAD_VALUE[rule] ?? 0;
}
