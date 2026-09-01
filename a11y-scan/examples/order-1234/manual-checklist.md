# Manual verification checklist

Target: kundens-butik.example
Scan date: 2026-09-01

These checks cannot be decided by software. **None of them has been performed.**
Work through them, record the result, and delete any that genuinely do not apply
to this shop before the report is delivered.

A check marked `[ ]` in a delivered report is a check that was not done. Do not
tick one you did not perform.

> The automated pass found signals in 5 of these areas. Those are marked **flagged** and are worth doing first.

## Keyboard-only navigation — flagged

*Automated scan found: Buttons have no accessible name; Links have no accessible name.*

**Do this:** Put the mouse away. Using Tab, Shift+Tab, Enter, Space and the arrow keys only, complete: open the menu, open a category, open a product, add it to the cart, open the cart, change the quantity, and reach the checkout entry.

**It passes when:** Every step is completable. Focus never disappears, never gets stuck, and never leaves the page unexpectedly.

WCAG: 2.1.1 Keyboard (A) · 2.1.2 No Keyboard Trap (A)

- [ ] Pass
- [ ] Fail
- [ ] Not applicable

Notes:

---

## Visible focus

**Do this:** Tab through the header, the product grid, the product page and the cart. Watch where focus lands at each stop.

**It passes when:** The focused element is always clearly identifiable, with an indicator visible against its own background, including over images and coloured buttons.

WCAG: 2.4.7 Focus Visible (AA) · 2.4.11 Focus Not Obscured (AA, WCAG 2.2)

- [ ] Pass
- [ ] Fail
- [ ] Not applicable

Notes:

---

## Focus order

**Do this:** Tab through each page and note whether the order matches the visual reading order.

**It passes when:** Focus moves in a logical sequence. It does not jump between columns or backwards up the page.

WCAG: 2.4.3 Focus Order (A)

- [ ] Pass
- [ ] Fail
- [ ] Not applicable

Notes:

---

## Menus

**Do this:** Open the main navigation with the keyboard. Move through its items. Close it with Escape. Repeat on a phone-sized viewport.

**It passes when:** The menu opens and closes from the keyboard, arrow keys or Tab move between items, Escape closes it, and focus returns to the trigger.

WCAG: 2.1.1 Keyboard (A) · 4.1.2 Name, Role, Value (A)

- [ ] Pass
- [ ] Fail
- [ ] Not applicable

Notes:

---

## Modal dialogs

**Do this:** Trigger every dialog you can find — size guide, quick view, newsletter popup, cart drawer. For each, Tab repeatedly and then press Escape.

**It passes when:** Focus moves into the dialog when it opens, stays inside while it is open, Escape closes it, and focus returns to the element that opened it.

WCAG: 2.1.2 No Keyboard Trap (A) · 2.4.3 Focus Order (A) · 4.1.2 Name, Role, Value (A)

- [ ] Pass
- [ ] Fail
- [ ] Not applicable

Notes:

---

## Cookie consent

**Do this:** Load the site in a fresh private window. Before touching the mouse, press Tab and try to reach and operate the consent banner.

**It passes when:** The banner is reachable by keyboard, all options including "reject" are operable, and it does not trap focus or hide the page behind it.

WCAG: 2.1.1 Keyboard (A) · 2.4.3 Focus Order (A)

- [ ] Pass
- [ ] Fail
- [ ] Not applicable

Notes:

---

## Product variants

**Do this:** On a product with size or colour options, select each variant using only the keyboard, and listen with a screen reader if available.

**It passes when:** Every option is reachable and selectable, the current selection is announced, and an unavailable combination is communicated in text and not by colour alone.

WCAG: 1.4.1 Use of Color (A) · 4.1.2 Name, Role, Value (A)

- [ ] Pass
- [ ] Fail
- [ ] Not applicable

Notes:

---

## Quantity selectors

**Do this:** Change the quantity using the keyboard, both on the product page and in the cart.

**It passes when:** Plus and minus controls are real buttons with names, the field itself is labelled and editable, and the updated total is announced.

WCAG: 4.1.2 Name, Role, Value (A) · 4.1.3 Status Messages (AA)

- [ ] Pass
- [ ] Fail
- [ ] Not applicable

Notes:

---

## Add to cart feedback

**Do this:** Add a product to the cart with a screen reader running. Wait without moving focus and listen for what is announced.

**It passes when:** The result is announced without the user having to hunt for it — a live region, or focus deliberately moved to the confirmation.

WCAG: 4.1.3 Status Messages (AA)

- [ ] Pass
- [ ] Fail
- [ ] Not applicable

Notes:

---

## Cart editing — flagged

*Automated scan found: Buttons have no accessible name; Links have no accessible name.*

**Do this:** Change a quantity and remove a line, using the keyboard only.

**It passes when:** Remove controls name the product they remove ("Remove Blue Shirt", not "Remove"), and the updated total is announced.

WCAG: 2.4.4 Link Purpose (A) · 4.1.3 Status Messages (AA)

- [ ] Pass
- [ ] Fail
- [ ] Not applicable

Notes:

---

## Search

**Do this:** Use the search field by keyboard. Type a query that returns suggestions, then one that returns nothing.

**It passes when:** The field is labelled, suggestions are reachable by arrow keys, the number of results is announced, and the empty state is conveyed in text.

WCAG: 4.1.3 Status Messages (AA) · 3.3.2 Labels or Instructions (A)

- [ ] Pass
- [ ] Fail
- [ ] Not applicable

Notes:

---

## Form validation errors — flagged

*Automated scan found: Form fields have no label.*

**Do this:** Submit the contact form and the checkout form empty, then with one invalid field. Observe with a screen reader.

**It passes when:** Errors are announced, focus moves to or names the first failing field, each message says what to do, and errors are not signalled by red colour alone.

WCAG: 3.3.1 Error Identification (A) · 3.3.3 Error Suggestion (AA) · 1.4.1 Use of Color (A)

- [ ] Pass
- [ ] Fail
- [ ] Not applicable

Notes:

---

## Mobile navigation

**Do this:** On a real phone with the screen reader on (VoiceOver or TalkBack), open the menu, browse to a product and add it to the cart.

**It passes when:** Every step is completable by swipe navigation. The menu toggle is named and its expanded state is announced.

WCAG: 2.1.1 Keyboard (A) · 4.1.2 Name, Role, Value (A)

- [ ] Pass
- [ ] Fail
- [ ] Not applicable

Notes:

---

## Zoom and reflow — flagged

*Automated scan found: Page prevents zooming; Page scrolls horizontally at 320px wide.*

**Do this:** On a 1280px desktop window, zoom the browser to 400%. Read a product page and the cart.

**It passes when:** Content reflows into one column, nothing is clipped, and no horizontal scrolling is needed to read a line of text.

WCAG: 1.4.10 Reflow (AA) · 1.4.4 Resize Text (AA)

- [ ] Pass
- [ ] Fail
- [ ] Not applicable

Notes:

---

## Screen-reader labels are meaningful — flagged

*Automated scan found: Images are missing text alternatives.*

**Do this:** With a screen reader, listen to the product images, the icon buttons in the header, and the product cards in a category listing.

**It passes when:** Alt text describes what the image shows rather than repeating the filename or the product title; icon buttons are named by their action.

WCAG: 1.1.1 Non-text Content (A) · 2.4.6 Headings and Labels (AA)

- [ ] Pass
- [ ] Fail
- [ ] Not applicable

Notes:

---

## Page structure

**Do this:** Pull up the screen reader’s list of headings and of landmarks on the home, category and product pages.

**It passes when:** The heading list alone conveys what is on the page, and landmarks let you jump straight to the main content.

WCAG: 1.3.1 Info and Relationships (A) · 2.4.1 Bypass Blocks (A)

- [ ] Pass
- [ ] Fail
- [ ] Not applicable

Notes:

---
