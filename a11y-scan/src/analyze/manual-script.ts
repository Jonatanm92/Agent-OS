/**
 * Phase 3 — the human verification checklist.
 *
 * Every item here is something a browser cannot honestly decide. The tool never
 * records any of them as passed; they ship as instructions with pass criteria,
 * and the report labels them MANUAL CHECK REQUIRED.
 *
 * Where an automated signal suggests an area deserves attention first, the
 * relevant item is flagged — the checklist stays complete either way.
 */
import type { Issue, ManualCheck, PageRole } from '../types.js';

const BASE_CHECKS: ManualCheck[] = [
  {
    id: 'kb-01',
    area: 'Keyboard-only navigation',
    instruction:
      'Put the mouse away. Using Tab, Shift+Tab, Enter, Space and the arrow keys only, complete: open the menu, open a category, open a product, add it to the cart, open the cart, change the quantity, and reach the checkout entry.',
    passCriteria:
      'Every step is completable. Focus never disappears, never gets stuck, and never leaves the page unexpectedly.',
    wcag: ['2.1.1 Keyboard (A)', '2.1.2 No Keyboard Trap (A)'],
  },
  {
    id: 'kb-02',
    area: 'Visible focus',
    instruction:
      'Tab through the header, the product grid, the product page and the cart. Watch where focus lands at each stop.',
    passCriteria:
      'The focused element is always clearly identifiable, with an indicator visible against its own background, including over images and coloured buttons.',
    wcag: ['2.4.7 Focus Visible (AA)', '2.4.11 Focus Not Obscured (AA, WCAG 2.2)'],
  },
  {
    id: 'kb-03',
    area: 'Focus order',
    instruction: 'Tab through each page and note whether the order matches the visual reading order.',
    passCriteria: 'Focus moves in a logical sequence. It does not jump between columns or backwards up the page.',
    wcag: ['2.4.3 Focus Order (A)'],
  },
  {
    id: 'menu-01',
    area: 'Menus',
    instruction:
      'Open the main navigation with the keyboard. Move through its items. Close it with Escape. Repeat on a phone-sized viewport.',
    passCriteria:
      'The menu opens and closes from the keyboard, arrow keys or Tab move between items, Escape closes it, and focus returns to the trigger.',
    wcag: ['2.1.1 Keyboard (A)', '4.1.2 Name, Role, Value (A)'],
  },
  {
    id: 'modal-01',
    area: 'Modal dialogs',
    instruction:
      'Trigger every dialog you can find — size guide, quick view, newsletter popup, cart drawer. For each, Tab repeatedly and then press Escape.',
    passCriteria:
      'Focus moves into the dialog when it opens, stays inside while it is open, Escape closes it, and focus returns to the element that opened it.',
    wcag: ['2.1.2 No Keyboard Trap (A)', '2.4.3 Focus Order (A)', '4.1.2 Name, Role, Value (A)'],
  },
  {
    id: 'cookie-01',
    area: 'Cookie consent',
    instruction:
      'Load the site in a fresh private window. Before touching the mouse, press Tab and try to reach and operate the consent banner.',
    passCriteria:
      'The banner is reachable by keyboard, all options including "reject" are operable, and it does not trap focus or hide the page behind it.',
    wcag: ['2.1.1 Keyboard (A)', '2.4.3 Focus Order (A)'],
  },
  {
    id: 'variant-01',
    area: 'Product variants',
    instruction:
      'On a product with size or colour options, select each variant using only the keyboard, and listen with a screen reader if available.',
    passCriteria:
      'Every option is reachable and selectable, the current selection is announced, and an unavailable combination is communicated in text and not by colour alone.',
    wcag: ['1.4.1 Use of Color (A)', '4.1.2 Name, Role, Value (A)'],
  },
  {
    id: 'qty-01',
    area: 'Quantity selectors',
    instruction: 'Change the quantity using the keyboard, both on the product page and in the cart.',
    passCriteria:
      'Plus and minus controls are real buttons with names, the field itself is labelled and editable, and the updated total is announced.',
    wcag: ['4.1.2 Name, Role, Value (A)', '4.1.3 Status Messages (AA)'],
  },
  {
    id: 'cart-01',
    area: 'Add to cart feedback',
    instruction:
      'Add a product to the cart with a screen reader running. Wait without moving focus and listen for what is announced.',
    passCriteria:
      'The result is announced without the user having to hunt for it — a live region, or focus deliberately moved to the confirmation.',
    wcag: ['4.1.3 Status Messages (AA)'],
  },
  {
    id: 'cart-02',
    area: 'Cart editing',
    instruction: 'Change a quantity and remove a line, using the keyboard only.',
    passCriteria:
      'Remove controls name the product they remove ("Remove Blue Shirt", not "Remove"), and the updated total is announced.',
    wcag: ['2.4.4 Link Purpose (A)', '4.1.3 Status Messages (AA)'],
  },
  {
    id: 'search-01',
    area: 'Search',
    instruction:
      'Use the search field by keyboard. Type a query that returns suggestions, then one that returns nothing.',
    passCriteria:
      'The field is labelled, suggestions are reachable by arrow keys, the number of results is announced, and the empty state is conveyed in text.',
    wcag: ['4.1.3 Status Messages (AA)', '3.3.2 Labels or Instructions (A)'],
  },
  {
    id: 'form-01',
    area: 'Form validation errors',
    instruction:
      'Submit the contact form and the checkout form empty, then with one invalid field. Observe with a screen reader.',
    passCriteria:
      'Errors are announced, focus moves to or names the first failing field, each message says what to do, and errors are not signalled by red colour alone.',
    wcag: ['3.3.1 Error Identification (A)', '3.3.3 Error Suggestion (AA)', '1.4.1 Use of Color (A)'],
  },
  {
    id: 'mobile-01',
    area: 'Mobile navigation',
    instruction:
      'On a real phone with the screen reader on (VoiceOver or TalkBack), open the menu, browse to a product and add it to the cart.',
    passCriteria: 'Every step is completable by swipe navigation. The menu toggle is named and its expanded state is announced.',
    wcag: ['2.1.1 Keyboard (A)', '4.1.2 Name, Role, Value (A)'],
  },
  {
    id: 'zoom-01',
    area: 'Zoom and reflow',
    instruction:
      'On a 1280px desktop window, zoom the browser to 400%. Read a product page and the cart.',
    passCriteria:
      'Content reflows into one column, nothing is clipped, and no horizontal scrolling is needed to read a line of text.',
    wcag: ['1.4.10 Reflow (AA)', '1.4.4 Resize Text (AA)'],
  },
  {
    id: 'sr-01',
    area: 'Screen-reader labels are meaningful',
    instruction:
      'With a screen reader, listen to the product images, the icon buttons in the header, and the product cards in a category listing.',
    passCriteria:
      'Alt text describes what the image shows rather than repeating the filename or the product title; icon buttons are named by their action.',
    wcag: ['1.1.1 Non-text Content (A)', '2.4.6 Headings and Labels (AA)'],
  },
  {
    id: 'sr-02',
    area: 'Page structure',
    instruction:
      'Pull up the screen reader’s list of headings and of landmarks on the home, category and product pages.',
    passCriteria:
      'The heading list alone conveys what is on the page, and landmarks let you jump straight to the main content.',
    wcag: ['1.3.1 Info and Relationships (A)', '2.4.1 Bypass Blocks (A)'],
  },
];

/** Automated signals that make a given manual area more likely to be a problem. */
const FLAG_MAP: [RegExp, string[]][] = [
  [/no-focus-indicator/, ['kb-02']],
  [/nonsemantic-clickable/, ['kb-01', 'variant-01']],
  [/positive-tabindex/, ['kb-03']],
  [/reflow-overflow|meta-viewport/, ['zoom-01']],
  [/^label$|autocomplete/, ['form-01']],
  [/button-name|link-name/, ['kb-01', 'cart-02']],
  [/image-alt/, ['sr-01']],
  [/heading-order|no-h1|landmark|region/, ['sr-02']],
  [/no-skip-link/, ['kb-01']],
  [/touch-target/, ['mobile-01']],
];

export function buildManualScript(issues: Issue[], rolesFound: PageRole[]): ManualCheck[] {
  const flags = new Map<string, string[]>();
  for (const issue of issues) {
    for (const [pattern, checkIds] of FLAG_MAP) {
      if (!pattern.test(issue.ruleId)) continue;
      for (const id of checkIds) {
        const list = flags.get(id) ?? [];
        if (!list.includes(issue.title)) list.push(issue.title);
        flags.set(id, list);
      }
    }
  }

  return BASE_CHECKS.map((check) => {
    const reasons = flags.get(check.id);
    const result: ManualCheck = { ...check };
    if (reasons?.length) {
      result.flaggedBy = `Automated scan found: ${reasons.slice(0, 3).join('; ')}.`;
    }
    // Areas the crawl never reached are still listed — the tester may have
    // access we did not — but the report says the scan did not see them.
    if (check.id.startsWith('cart') && !rolesFound.includes('cart')) {
      result.instruction = `${check.instruction} (The automated scan did not reach a cart page, so this area is entirely unverified.)`;
    }
    return result;
  });
}
