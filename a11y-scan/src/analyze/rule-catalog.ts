/**
 * Plain-language metadata per rule.
 *
 * axe's own help text is written for developers who already know accessibility.
 * A buyer needs to understand who is affected and what it costs to fix, so each
 * rule carries: who it blocks, how to fix it, a base severity, and an effort
 * estimate for fixing ONE component (grouping scales that up — see severity.ts).
 *
 * Rules not listed here still surface, using axe's own help text and a
 * conservative default. The catalogue is an upgrade, not a filter.
 */
import type { Effort, Severity } from '../types.js';

export interface RuleMeta {
  title: string;
  wcag: string[];
  impact: string;
  remediation: string;
  baseSeverity: Severity;
  /** Effort to fix a single component. */
  baseEffort: Effort;
  /**
   * Blocking rules can stop a purchase outright, so they never fall below
   * `high` however few pages they appear on.
   */
  blocking?: boolean;
}

export const RULE_CATALOG: Record<string, RuleMeta> = {
  // ---------- axe rules ----------
  'image-alt': {
    title: 'Images are missing text alternatives',
    wcag: ['1.1.1 Non-text Content (A)'],
    impact:
      'Screen reader users hear nothing, or hear a filename, where an image should be described. On product images this means the customer cannot tell what is being sold.',
    remediation:
      'Add a meaningful alt attribute describing the image. Use alt="" only for images that are purely decorative and repeat adjacent text.',
    baseSeverity: 'high',
    baseEffort: 'small',
  },
  'link-name': {
    title: 'Links have no accessible name',
    wcag: ['2.4.4 Link Purpose (In Context) (A)', '4.1.2 Name, Role, Value (A)'],
    impact:
      'A screen reader announces the link as "link" with no destination. Icon-only links such as cart, search and account are the usual cause, which puts them in the critical path of a purchase.',
    remediation:
      'Give the link visible text, or an aria-label, or visually hidden text inside the anchor. An icon alone is not a name.',
    baseSeverity: 'high',
    baseEffort: 'small',
    blocking: true,
  },
  'button-name': {
    title: 'Buttons have no accessible name',
    wcag: ['4.1.2 Name, Role, Value (A)'],
    impact:
      'A screen reader announces the control as "button" with no indication of what it does. If this is an add-to-cart, quantity or checkout button, the customer cannot complete a purchase.',
    remediation:
      'Add visible text, aria-label, or visually hidden text. For icon buttons, name them by their action ("Open menu"), not their icon ("hamburger").',
    baseSeverity: 'critical',
    baseEffort: 'small',
    blocking: true,
  },
  label: {
    title: 'Form fields have no label',
    wcag: ['1.3.1 Info and Relationships (A)', '3.3.2 Labels or Instructions (A)', '4.1.2 Name, Role, Value (A)'],
    impact:
      'The customer cannot tell what to type. In checkout this stops the order. A placeholder is not a label: it disappears the moment typing starts and is often not announced.',
    remediation:
      'Associate a <label for="..."> with each field, or use aria-labelledby. Keep the label visible — placeholder-only fields fail for everyone under stress.',
    baseSeverity: 'critical',
    baseEffort: 'small',
    blocking: true,
  },
  'form-field-multiple-labels': {
    title: 'Form field has conflicting labels',
    wcag: ['3.3.2 Labels or Instructions (A)'],
    impact: 'Assistive technology may announce the wrong label, or concatenate both, confusing the customer.',
    remediation: 'Leave exactly one label associated with each field.',
    baseSeverity: 'medium',
    baseEffort: 'small',
  },
  'html-has-lang': {
    title: 'Page does not declare its language',
    wcag: ['3.1.1 Language of Page (A)'],
    impact:
      'A screen reader reads Swedish text with an English voice, or the reverse. The result is close to unintelligible. One attribute affects the entire page.',
    remediation: 'Add lang="sv" (or the correct language) to the <html> element.',
    baseSeverity: 'high',
    baseEffort: 'small',
    blocking: true,
  },
  'html-lang-valid': {
    title: 'Declared page language is not a valid language code',
    wcag: ['3.1.1 Language of Page (A)'],
    impact: 'An invalid code is ignored, so the screen reader falls back to its default voice.',
    remediation: 'Use a valid BCP 47 code, for example lang="sv" or lang="sv-SE".',
    baseSeverity: 'medium',
    baseEffort: 'small',
  },
  'document-title': {
    title: 'Page has no title',
    wcag: ['2.4.2 Page Titled (A)'],
    impact:
      'The browser tab and the screen reader announce nothing useful, so a customer with several tabs open cannot tell which is your shop.',
    remediation: 'Give every page a unique, descriptive <title> that names the page before the shop.',
    baseSeverity: 'medium',
    baseEffort: 'small',
  },
  'color-contrast': {
    title: 'Text does not have enough contrast against its background',
    wcag: ['1.4.3 Contrast (Minimum) (AA)'],
    impact:
      'Customers with low vision, and anyone on a phone in daylight, cannot read the text. Prices, discounts and error messages are the common victims because they are often set in a light accent colour.',
    remediation:
      'Raise contrast to at least 4.5:1 for body text and 3:1 for text at 24px or 19px bold. Fix it in design tokens rather than per component.',
    baseSeverity: 'high',
    baseEffort: 'medium',
  },
  'duplicate-id-active': {
    title: 'Interactive elements share the same id',
    wcag: ['4.1.1 Parsing (A)'],
    impact:
      'Labels and ARIA references point at whichever element the browser finds first, so a label may describe the wrong field.',
    remediation: 'Make ids unique, especially where a component is rendered more than once on a page.',
    baseSeverity: 'medium',
    baseEffort: 'medium',
  },
  'duplicate-id-aria': {
    title: 'ARIA references point to a duplicated id',
    wcag: ['4.1.1 Parsing (A)'],
    impact: 'aria-labelledby and aria-describedby resolve to the wrong element, so the wrong text is announced.',
    remediation: 'Make every referenced id unique on the page.',
    baseSeverity: 'medium',
    baseEffort: 'medium',
  },
  'aria-required-attr': {
    title: 'ARIA role is missing a required attribute',
    wcag: ['4.1.2 Name, Role, Value (A)'],
    impact: 'The component is announced as a role it cannot fulfil, so its state is unavailable or wrong.',
    remediation: 'Supply the attributes the role requires, or drop the role and use the native element instead.',
    baseSeverity: 'high',
    baseEffort: 'medium',
  },
  'aria-valid-attr-value': {
    title: 'ARIA attribute has an invalid value',
    wcag: ['4.1.2 Name, Role, Value (A)'],
    impact: 'The attribute is ignored, so the information it was meant to convey never reaches the customer.',
    remediation: 'Correct the value, and check that any id referenced actually exists on the page.',
    baseSeverity: 'medium',
    baseEffort: 'small',
  },
  'aria-roles': {
    title: 'Element uses an ARIA role that is not valid',
    wcag: ['4.1.2 Name, Role, Value (A)'],
    impact: 'The role is ignored and the element is announced as its underlying element, usually a meaningless div.',
    remediation: 'Use a valid role, or preferably the native HTML element that already has it.',
    baseSeverity: 'medium',
    baseEffort: 'small',
  },
  'aria-allowed-attr': {
    title: 'ARIA attribute is not allowed on this element',
    wcag: ['4.1.2 Name, Role, Value (A)'],
    impact: 'The attribute is ignored or produces a contradictory announcement.',
    remediation: 'Remove the attribute or change the element to one where it is valid.',
    baseSeverity: 'medium',
    baseEffort: 'small',
  },
  'aria-hidden-focus': {
    title: 'Focusable element is hidden from assistive technology',
    wcag: ['4.1.2 Name, Role, Value (A)'],
    impact:
      'A keyboard user can tab to a control that a screen reader refuses to announce. Focus appears to vanish, which is disorienting and often unrecoverable.',
    remediation:
      'Do not put aria-hidden="true" on anything focusable. Hide it from everyone with display:none, or remove it from the tab order.',
    baseSeverity: 'high',
    baseEffort: 'small',
    blocking: true,
  },
  'frame-title': {
    title: 'Iframe has no title',
    wcag: ['2.4.1 Bypass Blocks (A)', '4.1.2 Name, Role, Value (A)'],
    impact:
      'A screen reader announces an unnamed frame. Payment and map embeds are the usual case, so this lands in checkout.',
    remediation: 'Add a title attribute describing the frame’s purpose, e.g. title="Card payment".',
    baseSeverity: 'medium',
    baseEffort: 'small',
  },
  'autocomplete-valid': {
    title: 'Input has an invalid autocomplete value',
    wcag: ['1.3.5 Identify Input Purpose (AA)'],
    impact:
      'Browsers and password managers cannot autofill the field. Customers with motor or cognitive disabilities lose the shortcut that makes checkout viable.',
    remediation: 'Use the token from the HTML autocomplete specification, e.g. given-name, email, postal-code.',
    baseSeverity: 'medium',
    baseEffort: 'small',
  },
  'heading-order': {
    title: 'Heading levels are skipped',
    wcag: ['1.3.1 Info and Relationships (A)'],
    impact:
      'Screen reader users navigate by heading. A jump from h1 to h4 makes the page structure unreadable and hides sections.',
    remediation: 'Step heading levels one at a time. Choose the level for structure and style it with CSS.',
    baseSeverity: 'medium',
    baseEffort: 'small',
  },
  'landmark-one-main': {
    title: 'Page has no main landmark',
    wcag: ['1.3.1 Info and Relationships (A)', '2.4.1 Bypass Blocks (A)'],
    impact:
      'Screen reader users cannot jump straight to the content and must listen through the header and menu on every page.',
    remediation: 'Wrap the primary content of each page in a single <main> element.',
    baseSeverity: 'medium',
    baseEffort: 'small',
  },
  region: {
    title: 'Content sits outside any landmark',
    wcag: ['1.3.1 Info and Relationships (A)'],
    impact: 'Content is unreachable by landmark navigation, so it is easy to miss entirely.',
    remediation: 'Place all content inside header, nav, main, aside or footer landmarks.',
    baseSeverity: 'low',
    baseEffort: 'medium',
  },
  'link-in-text-block': {
    title: 'Links are distinguished only by colour',
    wcag: ['1.4.1 Use of Color (A)'],
    impact: 'Colour-blind customers cannot see which words are links.',
    remediation: 'Underline links in body text, or ensure at least 3:1 contrast against the surrounding text plus a non-colour cue.',
    baseSeverity: 'medium',
    baseEffort: 'small',
  },
  list: {
    title: 'List markup is malformed',
    wcag: ['1.3.1 Info and Relationships (A)'],
    impact: 'The list item count announced by a screen reader is wrong, so customers cannot tell how many products or options there are.',
    remediation: 'Allow only <li> as a direct child of <ul> and <ol>.',
    baseSeverity: 'low',
    baseEffort: 'small',
  },
  'meta-viewport': {
    title: 'Page prevents zooming',
    wcag: ['1.4.4 Resize Text (AA)'],
    impact:
      'Customers with low vision cannot pinch-zoom on a phone. This is one attribute that affects every page and every user.',
    remediation:
      'Remove user-scalable=no and any maximum-scale below 5 from the viewport meta tag.',
    baseSeverity: 'high',
    baseEffort: 'small',
  },

  // ---------- custom checks ----------
  'check:touch-target-size': {
    title: 'Tap targets are smaller than the minimum size',
    wcag: ['2.5.8 Target Size (Minimum) (AA, WCAG 2.2)'],
    impact:
      'Customers with tremor or limited dexterity, and anyone using a phone one-handed, mis-tap. Quantity steppers and close buttons are the usual offenders.',
    remediation:
      'Give interactive controls at least 24x24 CSS pixels, or adequate spacing. 44x44 is the comfortable target on touch devices.',
    baseSeverity: 'medium',
    baseEffort: 'small',
  },
  'check:no-focus-indicator': {
    title: 'Focused element shows no visible focus indicator',
    wcag: ['2.4.7 Focus Visible (AA)'],
    impact:
      'A keyboard user cannot see where they are on the page. Navigating a checkout becomes guesswork, which is the single most common reason keyboard users abandon a purchase.',
    remediation:
      'Never remove focus outlines without replacing them. Use :focus-visible with a clearly contrasting outline of at least 2px.',
    baseSeverity: 'high',
    baseEffort: 'small',
    blocking: true,
  },
  'check:reflow-overflow': {
    title: 'Page scrolls horizontally at 320px wide',
    wcag: ['1.4.10 Reflow (AA)'],
    impact:
      'At 320 CSS pixels — a phone, or a desktop zoomed to 400% — content is cut off or requires scrolling in two directions to read one line.',
    remediation:
      'Find the element wider than the viewport (usually a fixed-width table, image or container) and let it shrink or scroll inside its own box.',
    baseSeverity: 'high',
    baseEffort: 'medium',
  },
  'check:generic-link-text': {
    title: 'Link text does not describe its destination',
    wcag: ['2.4.4 Link Purpose (In Context) (A)'],
    impact:
      'Screen reader users often pull up a list of links out of context. Twenty links all called "Läs mer" are twenty identical entries.',
    remediation:
      'Write link text that names the destination, e.g. "Läs mer om frakt". If the visible text must stay generic, add the detail in visually hidden text.',
    baseSeverity: 'medium',
    baseEffort: 'small',
  },
  'check:missing-autocomplete': {
    title: 'Checkout-relevant field has no autocomplete attribute',
    wcag: ['1.3.5 Identify Input Purpose (AA)'],
    impact:
      'Name, address, email and phone fields cannot be autofilled, so every customer types them by hand. For customers with motor or cognitive disabilities this is often where the order is abandoned.',
    remediation:
      'Add the correct autocomplete token to each field: given-name, family-name, email, tel, street-address, postal-code, country-name.',
    baseSeverity: 'medium',
    baseEffort: 'small',
  },
  'check:positive-tabindex': {
    title: 'Positive tabindex overrides the natural focus order',
    wcag: ['2.4.3 Focus Order (A)'],
    impact:
      'Tab order jumps around the page unpredictably, and any control not given a positive value is pushed to the end.',
    remediation: 'Use tabindex="0" or no tabindex at all, and set focus order by DOM order.',
    baseSeverity: 'medium',
    baseEffort: 'medium',
  },
  'check:nonsemantic-clickable': {
    title: 'Clickable element is not reachable by keyboard',
    wcag: ['2.1.1 Keyboard (A)', '4.1.2 Name, Role, Value (A)'],
    impact:
      'A div or span with a click handler cannot be focused or activated with a keyboard. If this is add-to-cart, a variant swatch or a quantity control, keyboard-only customers cannot buy.',
    remediation:
      'Use <button> or <a>. If the element must stay a div, add role="button", tabindex="0" and handlers for both Enter and Space.',
    baseSeverity: 'critical',
    baseEffort: 'medium',
    blocking: true,
  },
  'check:no-skip-link': {
    title: 'No skip link to the main content',
    wcag: ['2.4.1 Bypass Blocks (A)'],
    impact:
      'Keyboard users tab through the whole header and menu — often 30+ stops — before reaching the products, on every single page.',
    remediation:
      'Add a "Hoppa till innehåll" link as the first focusable element, visually hidden until focused, targeting the <main> element.',
    baseSeverity: 'medium',
    baseEffort: 'small',
  },
  'check:no-h1': {
    title: 'Page has no level-one heading',
    wcag: ['1.3.1 Info and Relationships (A)', '2.4.6 Headings and Labels (AA)'],
    impact: 'Screen reader users have no reliable anchor for what the page is about.',
    remediation: 'Give every page exactly one <h1> naming its subject — the product name on a product page.',
    baseSeverity: 'medium',
    baseEffort: 'small',
  },
};

export const DEFAULT_META: Omit<RuleMeta, 'title'> = {
  wcag: [],
  impact: 'Detected by automated testing. Assess the effect on customers during manual review.',
  remediation: 'See the linked rule documentation for guidance.',
  baseSeverity: 'medium',
  baseEffort: 'medium',
};
