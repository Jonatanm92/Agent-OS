# Accessibility fixes — developer handoff

One task per defect, not per occurrence. A defect in a shared component is a single fix even when it appears on many pages.

## A11Y-001 · P0 · ≤ 2h

**[CRITICAL] Form fields have no label — input[value]**

Labels: accessibility, wcag-1.3.1, effort-small

**Problem**: Form fields have no label

**Component**: `input[value]`
**WCAG**: 1.3.1 Info and Relationships (A), 3.3.2 Labels or Instructions (A), 4.1.2 Name, Role, Value (A)
**Verification**: AUTOMATICALLY VERIFIED

**Who it affects**: The customer cannot tell what to type. In checkout this stops the order. A placeholder is not a label: it disappears the moment typing starts and is often not announced.

**Fix**: Associate a <label for="..."> with each field, or use aria-labelledby. Keep the label visible — placeholder-only fields fail for everyone under stress.

**Occurrences**: 2 on 1 page(s)
- https://demo-webshop.example/cart.html

**Example markup**:
```html
<input type="number" value="1">
```

**Done when**: the defect is gone from this component on every affected page, verified with a keyboard and a screen reader — not only by re-running the scanner.

---

## A11Y-002 · P0 · ≤ 2h

**[CRITICAL] Images are missing text alternatives — img**

Labels: accessibility, wcag-1.1.1, effort-small

**Problem**: Images are missing text alternatives

**Component**: `img`
**WCAG**: 1.1.1 Non-text Content (A)
**Verification**: AUTOMATICALLY VERIFIED

**Who it affects**: Screen reader users hear nothing, or hear a filename, where an image should be described. On product images this means the customer cannot tell what is being sold.

**Fix**: Add a meaningful alt attribute describing the image. Use alt="" only for images that are purely decorative and repeat adjacent text.

**Occurrences**: 1 on 1 page(s)
- https://demo-webshop.example/product.html

**Example markup**:
```html
<img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" width="200" height="200">
```

**Done when**: the defect is gone from this component on every affected page, verified with a keyboard and a screen reader — not only by re-running the scanner.

---

## A11Y-003 · P0 · ≤ 2h

**[CRITICAL] Form fields have no label — input**

Labels: accessibility, wcag-1.3.1, effort-small

**Problem**: Form fields have no label

**Component**: `input`
**WCAG**: 1.3.1 Info and Relationships (A), 3.3.2 Labels or Instructions (A), 4.1.2 Name, Role, Value (A)
**Verification**: AUTOMATICALLY VERIFIED

**Who it affects**: The customer cannot tell what to type. In checkout this stops the order. A placeholder is not a label: it disappears the moment typing starts and is often not announced.

**Fix**: Associate a <label for="..."> with each field, or use aria-labelledby. Keep the label visible — placeholder-only fields fail for everyone under stress.

**Occurrences**: 1 on 1 page(s)
- https://demo-webshop.example/product.html

**Example markup**:
```html
<input type="number" name="quantity" value="1" min="1">
```

**Done when**: the defect is gone from this component on every affected page, verified with a keyboard and a screen reader — not only by re-running the scanner.

---

## A11Y-004 · P0 · ≤ 2h

**[CRITICAL] Buttons have no accessible name — [id] > button**

Labels: accessibility, wcag-4.1.2, effort-small

**Problem**: Buttons have no accessible name

**Component**: `[id] > button`
**WCAG**: 4.1.2 Name, Role, Value (A)
**Verification**: AUTOMATICALLY VERIFIED

**Who it affects**: A screen reader announces the control as "button" with no indication of what it does. If this is an add-to-cart, quantity or checkout button, the customer cannot complete a purchase.

**Fix**: Add visible text, aria-label, or visually hidden text. For icon buttons, name them by their action ("Open menu"), not their icon ("hamburger").

**Occurrences**: 5 on 1 page(s)
- https://demo-webshop.example/collection.html

**Example markup**:
```html
<button class="qty"></button>
```

**Done when**: the defect is gone from this component on every affected page, verified with a keyboard and a screen reader — not only by re-running the scanner.

---

## A11Y-005 · P0 · ≤ 2h

**[CRITICAL] Buttons have no accessible name — button**

Labels: accessibility, wcag-4.1.2, effort-small

**Problem**: Buttons have no accessible name

**Component**: `button`
**WCAG**: 4.1.2 Name, Role, Value (A)
**Verification**: AUTOMATICALLY VERIFIED

**Who it affects**: A screen reader announces the control as "button" with no indication of what it does. If this is an add-to-cart, quantity or checkout button, the customer cannot complete a purchase.

**Fix**: Add visible text, aria-label, or visually hidden text. For icon buttons, name them by their action ("Open menu"), not their icon ("hamburger").

**Occurrences**: 1 on 1 page(s)
- https://demo-webshop.example/

**Example markup**:
```html
<button class="tiny"></button>
```

**Done when**: the defect is gone from this component on every affected page, verified with a keyboard and a screen reader — not only by re-running the scanner.

---

## A11Y-006 · P1 · ≤ 2h

**[HIGH] Iframe has no title — iframe**

Labels: accessibility, wcag-2.4.1, effort-small

**Problem**: Iframe has no title

**Component**: `iframe`
**WCAG**: 2.4.1 Bypass Blocks (A), 4.1.2 Name, Role, Value (A)
**Verification**: AUTOMATICALLY VERIFIED

**Who it affects**: A screen reader announces an unnamed frame. Payment and map embeds are the usual case, so this lands in checkout.

**Fix**: Add a title attribute describing the frame’s purpose, e.g. title="Card payment".

**Occurrences**: 1 on 1 page(s)
- https://demo-webshop.example/product.html

**Example markup**:
```html
<iframe src="about:blank" width="200" height="100"></iframe>
```

**Done when**: the defect is gone from this component on every affected page, verified with a keyboard and a screen reader — not only by re-running the scanner.

---

## A11Y-007 · P1 · ≤ 2h

**[HIGH] Images are missing text alternatives — .product-card__link[href] > img**

Labels: accessibility, wcag-1.1.1, effort-small

**Problem**: Images are missing text alternatives

**Component**: `.product-card__link[href] > img`
**WCAG**: 1.1.1 Non-text Content (A)
**Verification**: AUTOMATICALLY VERIFIED

**Who it affects**: Screen reader users hear nothing, or hear a filename, where an image should be described. On product images this means the customer cannot tell what is being sold.

**Fix**: Add a meaningful alt attribute describing the image. Use alt="" only for images that are purely decorative and repeat adjacent text.

**Occurrences**: 5 on 1 page(s)
- https://demo-webshop.example/collection.html

**Example markup**:
```html
<img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" width="100" height="100">
```

**Done when**: the defect is gone from this component on every affected page, verified with a keyboard and a screen reader — not only by re-running the scanner.

---

## A11Y-008 · P1 · ≤ 2h

**[HIGH] Links have no accessible name — [id] > .product-card__link[href]**

Labels: accessibility, wcag-2.4.4, effort-small

**Problem**: Links have no accessible name

**Component**: `[id] > .product-card__link[href]`
**WCAG**: 2.4.4 Link Purpose (In Context) (A), 4.1.2 Name, Role, Value (A)
**Verification**: AUTOMATICALLY VERIFIED

**Who it affects**: A screen reader announces the link as "link" with no destination. Icon-only links such as cart, search and account are the usual cause, which puts them in the critical path of a purchase.

**Fix**: Give the link visible text, or an aria-label, or visually hidden text inside the anchor. An icon alone is not a name.

**Occurrences**: 5 on 1 page(s)
- https://demo-webshop.example/collection.html

**Example markup**:
```html
<a class="product-card__link" href="/product.html"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" width="100" height="100"></a>
```

**Done when**: the defect is gone from this component on every affected page, verified with a keyboard and a screen reader — not only by re-running the scanner.

---

## A11Y-009 · P1 · ≤ 2h

**[HIGH] Images are missing text alternatives — div > img[width][height]**

Labels: accessibility, wcag-1.1.1, effort-small

**Problem**: Images are missing text alternatives

**Component**: `div > img[width][height]`
**WCAG**: 1.1.1 Non-text Content (A)
**Verification**: AUTOMATICALLY VERIFIED

**Who it affects**: Screen reader users hear nothing, or hear a filename, where an image should be described. On product images this means the customer cannot tell what is being sold.

**Fix**: Add a meaningful alt attribute describing the image. Use alt="" only for images that are purely decorative and repeat adjacent text.

**Occurrences**: 3 on 1 page(s)
- https://demo-webshop.example/

**Example markup**:
```html
<img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" width="120" height="120">
```

**Done when**: the defect is gone from this component on every affected page, verified with a keyboard and a screen reader — not only by re-running the scanner.

---

## A11Y-010 · P1 · ≤ 2h

**[HIGH] Page prevents zooming — meta[name]**

Labels: accessibility, wcag-1.4.4, effort-small

**Problem**: Page prevents zooming

**Component**: `meta[name]`
**WCAG**: 1.4.4 Resize Text (AA)
**Verification**: AUTOMATICALLY VERIFIED

**Who it affects**: Customers with low vision cannot pinch-zoom on a phone. This is one attribute that affects every page and every user.

**Fix**: Remove user-scalable=no and any maximum-scale below 5 from the viewport meta tag.

**Occurrences**: 2 on 1 page(s)
- https://demo-webshop.example/

**Example markup**:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
```

**Done when**: the defect is gone from this component on every affected page, verified with a keyboard and a screen reader — not only by re-running the scanner.

---

## A11Y-011 · P1 · ≤ 2h

**[HIGH] Page does not declare its language — html**

Labels: accessibility, wcag-3.1.1, effort-small

**Problem**: Page does not declare its language

**Component**: `html`
**WCAG**: 3.1.1 Language of Page (A)
**Verification**: AUTOMATICALLY VERIFIED

**Who it affects**: A screen reader reads Swedish text with an English voice, or the reverse. The result is close to unintelligible. One attribute affects the entire page.

**Fix**: Add lang="sv" (or the correct language) to the <html> element.

**Occurrences**: 1 on 1 page(s)
- https://demo-webshop.example/

**Example markup**:
```html
<html>
```

**Done when**: the defect is gone from this component on every affected page, verified with a keyboard and a screen reader — not only by re-running the scanner.

---

## A11Y-012 · P1 · ≤ 2h

**[HIGH] Images are missing text alternatives — img[width]**

Labels: accessibility, wcag-1.1.1, effort-small

**Problem**: Images are missing text alternatives

**Component**: `img[width]`
**WCAG**: 1.1.1 Non-text Content (A)
**Verification**: AUTOMATICALLY VERIFIED

**Who it affects**: Screen reader users hear nothing, or hear a filename, where an image should be described. On product images this means the customer cannot tell what is being sold.

**Fix**: Add a meaningful alt attribute describing the image. Use alt="" only for images that are purely decorative and repeat adjacent text.

**Occurrences**: 1 on 1 page(s)
- https://demo-webshop.example/

**Example markup**:
```html
<img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" width="60" height="20">
```

**Done when**: the defect is gone from this component on every affected page, verified with a keyboard and a screen reader — not only by re-running the scanner.

---

## A11Y-013 · P1 · ≤ 2h

**[HIGH] Links have no accessible name — a[href]**

Labels: accessibility, wcag-2.4.4, effort-small

**Problem**: Links have no accessible name

**Component**: `a[href]`
**WCAG**: 2.4.4 Link Purpose (In Context) (A), 4.1.2 Name, Role, Value (A)
**Verification**: AUTOMATICALLY VERIFIED

**Who it affects**: A screen reader announces the link as "link" with no destination. Icon-only links such as cart, search and account are the usual cause, which puts them in the critical path of a purchase.

**Fix**: Give the link visible text, or an aria-label, or visually hidden text inside the anchor. An icon alone is not a name.

**Occurrences**: 1 on 1 page(s)
- https://demo-webshop.example/

**Example markup**:
```html
<a href="/index.html"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" width="60" height="20"></a>
```

**Done when**: the defect is gone from this component on every affected page, verified with a keyboard and a screen reader — not only by re-running the scanner.

---

## A11Y-014 · P1 · 0.5–2 days

**[HIGH] Text does not have enough contrast against its background — div > p**

Labels: accessibility, wcag-1.4.3, effort-medium

**Problem**: Text does not have enough contrast against its background

**Component**: `div > p`
**WCAG**: 1.4.3 Contrast (Minimum) (AA)
**Verification**: AUTOMATICALLY VERIFIED

**Who it affects**: Customers with low vision, and anyone on a phone in daylight, cannot read the text. Prices, discounts and error messages are the common victims because they are often set in a light accent colour.

**Fix**: Raise contrast to at least 4.5:1 for body text and 3:1 for text at 24px or 19px bold. Fix it in design tokens rather than per component.

**Occurrences**: 3 on 1 page(s)
- https://demo-webshop.example/

**Example markup**:
```html
<p class="low-contrast">Handduk Lin</p>
```

**Done when**: the defect is gone from this component on every affected page, verified with a keyboard and a screen reader — not only by re-running the scanner.

---

## A11Y-015 · P1 · 0.5–2 days

**[HIGH] Page scrolls horizontally at 320px wide — div**

Labels: accessibility, wcag-1.4.10, effort-medium

**Problem**: Page scrolls horizontally at 320px wide

**Component**: `div`
**WCAG**: 1.4.10 Reflow (AA)
**Verification**: AUTOMATICALLY VERIFIED

**Who it affects**: At 320 CSS pixels — a phone, or a desktop zoomed to 400% — content is cut off or requires scrolling in two directions to read one line.

**Fix**: Find the element wider than the viewport (usually a fixed-width table, image or container) and let it shrink or scroll inside its own box.

**Occurrences**: 1 on 1 page(s)
- https://demo-webshop.example/

**Example markup**:
```html
<div> <img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" width="120" height="120"> <p class="low-contrast">Duk Vinter</p> <a href="/product.html">Läs mer</a> </div>
```

**Done when**: the defect is gone from this component on every affected page, verified with a keyboard and a screen reader — not only by re-running the scanner.

---

## A11Y-016 · P1 · 0.5–2 days

**[HIGH] Page scrolls horizontally at 320px wide — li.product-card**

Labels: accessibility, wcag-1.4.10, effort-medium

**Problem**: Page scrolls horizontally at 320px wide

**Component**: `li.product-card`
**WCAG**: 1.4.10 Reflow (AA)
**Verification**: AUTOMATICALLY VERIFIED

**Who it affects**: At 320 CSS pixels — a phone, or a desktop zoomed to 400% — content is cut off or requires scrolling in two directions to read one line.

**Fix**: Find the element wider than the viewport (usually a fixed-width table, image or container) and let it shrink or scroll inside its own box.

**Occurrences**: 1 on 1 page(s)
- https://demo-webshop.example/collection.html

**Example markup**:
```html
<li class="product-card" id="product-1004"> <a class="product-card__link" href="/product.html"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" width="100" height="100"></a> <button class="qty"></button> </li>
```

**Done when**: the defect is gone from this component on every affected page, verified with a keyboard and a screen reader — not only by re-running the scanner.

---

## A11Y-017 · P2 · 0.5–2 days

**[MEDIUM] All touch targets must be 24px large, or leave sufficient space — [id] > button**

Labels: accessibility, wcag-2.5.8, effort-medium

**Problem**: All touch targets must be 24px large, or leave sufficient space

**Component**: `[id] > button`
**WCAG**: 2.5.8
**Verification**: AUTOMATICALLY VERIFIED

**Who it affects**: Detected by automated testing. Assess the effect on customers during manual review.

**Fix**: https://dequeuniversity.com/rules/axe/4.13/target-size?application=axeAPI

**Occurrences**: 5 on 1 page(s)
- https://demo-webshop.example/collection.html

**Example markup**:
```html
<button class="qty"></button>
```

**Done when**: the defect is gone from this component on every affected page, verified with a keyboard and a screen reader — not only by re-running the scanner.

---
