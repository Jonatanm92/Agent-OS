# 9. Verification results

All results below were produced by running the real code, not by inspection.
Reproduce them with:

```bash
cd storefront/tools
npm install
node render-preview.mjs   # renders the actual .liquid files to preview/*.html
node verify.mjs           # runs every check below in Chromium
```

`render-preview.mjs` renders the **actual section files** through `liquidjs`
against a fixture standing in for Shopify's `product` / `all_products` objects.
It is not a re-implementation of the markup — if a section is edited, the preview
changes with it.

---

## Personalization data captured on the order

Confirmed present in the rendered form, as native Shopify line item properties:

| Property | Type | Required |
|---|---|---|
| `Artist` | text | yes |
| `Venue` | text | yes |
| `City` | text | yes |
| `Concert date` | date | yes |
| `Seat or section` | text | no |
| `Attended with` | text | yes |
| `Favourite song` | text | yes |
| `Favourite moment` | textarea | yes |
| `Setlist` | textarea (1500) | no |
| `Playlist URL` | url | no |
| `Notes` | textarea (900) | no |
| `Ticket screenshot` | **file** | no |
| `Photo delivery` | radio | yes (pre-selected) |
| `Photo link` | url | conditional |
| `Acknowledgement` | checkbox | yes |
| `_form_version` | hidden | — |
| `_engagement` | hidden, JS-filled | — |

Underscore-prefixed properties are retained on the order but hidden from
customer-facing cart and email displays.

`Ticket screenshot` is optional by design: the FAQ tells customers who no longer
have their ticket that they can still order, so requiring it would contradict the
page.

## Form mechanics confirmed

- Form posts to `/cart/add` with `enctype="multipart/form-data"` — required for
  the native file input.
- `payment_button` is **not** rendered: accelerated checkout cannot be used to
  bypass the form. Confirmed by grep on the rendered output (0 matches).
- Quantity fixed at 1; `return_to=/cart` so the customer lands on the cart and
  can see their answers.
- Tier detection from product tags: the One Night page renders
  `data-cmi-tier="one-night"` and highlights the One Night column; the Full Issue
  page renders `data-cmi-tier="full-issue"` and says "8 to 14 photos" instead of
  "3 to 6".
- Prices read live from the products (349,00 kr / 549,00 kr in the fixture), so
  the comparison table cannot drift from what is charged.

## Full automated run

```

product-one-night.html @ 360px
  PASS  no horizontal overflow (scrollWidth 360 vs 360)
  PASS  tap targets >= 44px
  PASS  all form controls have an accessible name
  PASS  examples grid is 2-up on mobile (154px 154px)
  PASS  "After" card keeps its dark override (rgb(16, 16, 20))
  PASS  step number keeps its accent override (rgb(242, 112, 58))

product-one-night.html @ 390px
  PASS  no horizontal overflow (scrollWidth 390 vs 390)
  PASS  tap targets >= 44px
  PASS  all form controls have an accessible name
  PASS  examples grid is 2-up on mobile (169px 169px)
  PASS  "After" card keeps its dark override (rgb(16, 16, 20))
  PASS  step number keeps its accent override (rgb(242, 112, 58))

product-one-night.html @ 430px
  PASS  no horizontal overflow (scrollWidth 430 vs 430)
  PASS  tap targets >= 44px
  PASS  all form controls have an accessible name
  PASS  examples grid is 2-up on mobile (189px 189px)
  PASS  "After" card keeps its dark override (rgb(16, 16, 20))
  PASS  step number keeps its accent override (rgb(242, 112, 58))

home.html @ 360px
  PASS  no horizontal overflow (scrollWidth 360 vs 360)
  PASS  tap targets >= 44px
  PASS  all form controls have an accessible name
  PASS  examples grid is 2-up on mobile (154px 154px)
  PASS  "After" card keeps its dark override (rgb(16, 16, 20))
  PASS  step number keeps its accent override (rgb(242, 112, 58))

home.html @ 390px
  PASS  no horizontal overflow (scrollWidth 390 vs 390)
  PASS  tap targets >= 44px
  PASS  all form controls have an accessible name
  PASS  examples grid is 2-up on mobile (169px 169px)
  PASS  "After" card keeps its dark override (rgb(16, 16, 20))
  PASS  step number keeps its accent override (rgb(242, 112, 58))

home.html @ 430px
  PASS  no horizontal overflow (scrollWidth 430 vs 430)
  PASS  tap targets >= 44px
  PASS  all form controls have an accessible name
  PASS  examples grid is 2-up on mobile (189px 189px)
  PASS  "After" card keeps its dark override (rgb(16, 16, 20))
  PASS  step number keeps its accent override (rgb(242, 112, 58))

form validation @ 390px (JS on)
  PASS  empty form is invalid (blocked before add-to-cart)
  PASS  9 required controls block submit — properties[Artist], properties[Venue], properties[City], properties[Concert date], properties[Attended with], properties[Favourite song], properties[Favourite moment], properties[Photo link], properties[Acknowledgement]
  PASS  photo link is required when "share link" is chosen
  PASS  photo link is hidden and not required when "email after ordering" is chosen
  PASS  form becomes valid once required fields are filled
  PASS  engagement recorded: "fields=10; seconds=0"
  PASS  enhancement marker present when JS runs
  PASS  contrast .cmi__lede = 9.21:1 (needs 4.5:1)
  PASS  contrast .cmi__muted = 9.21:1 (needs 4.5:1)
  PASS  contrast .cmi__label = 18.06:1 (needs 4.5:1)
  PASS  contrast .cmi__hint = 7.41:1 (needs 4.5:1)
  PASS  contrast .cmi__btn--primary = 6.38:1 (needs 4.5:1)
  PASS  contrast .cmi__h2 = 18.06:1 (needs 3:1)
  PASS  contrast .cmi__eyebrow = 6.47:1 (needs 4.5:1)
  PASS  contrast .cmi__faq-q = 18.06:1 (needs 4.5:1)

no-JS degradation @ 390px
  PASS  page scripts genuinely did not run (no data-cmi-enhanced marker)
  PASS  photo-link field stays visible and submittable without JS
  PASS  form still posts to /cart/add without JS
  PASS  multipart enctype present without JS (file upload works)
  PASS  9 native required attributes still enforce validation without JS
  PASS  FAQ <details> expands without JS

ALL CHECKS PASSED
```

## What these checks do and do not prove

**Proven:** the markup, CSS and JavaScript behave correctly in a real browser at
real mobile widths, including with JavaScript switched off.

**Not proven, because it needs a live store:**

- that Shopify accepts the uploaded file and turns it into a CDN URL on the order;
- that the host theme does not hijack add-to-cart with AJAX (`03-admin-steps.md`
  B1, and checklist item L6);
- how the theme's cart page renders line item properties;
- anything about checkout, taxes or emails.

Those are exactly the items in `07-launch-checklist.md`. Passing the checks above
is a precondition for launch, not a substitute for the checklist.

## Screenshots

In `storefront/preview/screens/`:

- `product-one-night-390.png`, `home-390.png` — full page (360px and 430px are
  regenerated by `verify.mjs`; all three widths pass, see the run above)
- `form-01-details.png`, `form-02-material.png`, `form-03-submit.png` — the form
- `compare.png`, `examples.png`, `faq.png`, `home-hero.png` — key sections

## Page weight

| Page | Height at 390px | HTML |
|---|---|---|
| Product | ~11,100px | 36 KB |
| Homepage | ~7,300px | 21 KB |

Shared assets: `cmi.css` 11 KB, `cmi-personalizer.js` 6 KB, both uncompressed
and cached after first load. **No web fonts, no images, no third-party scripts,
no libraries** — the only network requests a section adds are those two files.
