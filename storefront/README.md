# JM Store — Personalized Concert Memory Issues

Validation storefront for a made-to-order personalized product, built as
drop-in Shopify Online Store 2.0 theme files.

**Nothing here has been applied to the live store.** This environment has no
Shopify access of any kind — see `docs/01-store-audit.md` for what was checked.
Everything buildable locally is built and verified; everything needing Admin is
written up as exact steps.

---

## Read in this order

| # | Document | |
|---|---|---|
| 1 | [`docs/01-store-audit.md`](docs/01-store-audit.md) | What could and could not be inspected |
| 2 | [`docs/02-backup-and-rollback.md`](docs/02-backup-and-rollback.md) | **Do this first** — 5 minutes |
| 3 | [`docs/03-admin-steps.md`](docs/03-admin-steps.md) | Exact Admin steps, 45–70 min |
| 4 | [`docs/04-digital-fulfillment.md`](docs/04-digital-fulfillment.md) | Digital delivery without instant placeholder files |
| 5 | [`docs/05-legal-review.md`](docs/05-legal-review.md) | Swedish/EU items needing your review |
| 6 | [`docs/06-analytics.md`](docs/06-analytics.md) | What is measurable for free |
| 7 | [`docs/07-launch-checklist.md`](docs/07-launch-checklist.md) | Test on a phone before publishing |
| 8 | [`docs/08-known-limitations.md`](docs/08-known-limitations.md) | Constraints and trade-offs |
| 9 | [`docs/09-verification.md`](docs/09-verification.md) | 71 automated checks, all passing |
| 10 | [`docs/10-seo.md`](docs/10-seo.md) | Honest metadata |

## Files

```
theme/
  assets/
    cmi.css                              shared styles (11 KB, no web fonts)
    cmi-personalizer.js                  form enhancement only (6 KB, no deps)
  snippets/
    cmi-css.liquid                       loads the stylesheet
    cmi-field.liquid                     renders one line-item-property field
  sections/
    cmi-hero.liquid                      1. hero
    cmi-before-after.liquid              2. before -> after
    cmi-how-it-works.liquid              3. four steps
    cmi-included.liquid                  4. One Night vs Full Issue
    cmi-examples.liquid                  5. 4-8 example pages (placeholder-aware)
    cmi-personalizer.liquid              -- the buy box / order intake
    cmi-gift.liquid                      6. gift positioning
    cmi-faq.liquid                       7. FAQ
    cmi-trust.liquid                     8. rights and non-affiliation
    cmi-returns-notice.liquid            9. made-to-order notice (DRAFT COPY)
  templates/
    product.concert-memory.json          alternate product template
    index.json                           homepage
tools/                                   local preview + verification (never uploaded)
preview/                                 rendered HTML + screenshots
```

Nothing outside `storefront/` was modified. No existing theme file is edited, so
the sections are added, not merged — reverting is deleting files and republishing
the backup theme.

## How it works

**Order intake is 100% native Shopify.** Every field is a line item property
(`properties[Artist]` and so on) posted to `/cart/add`. No app, no subscription,
no external service. 15 customer-facing properties plus 2 hidden diagnostics
land on the order.

**Validation is the browser's own**, so it still works with JavaScript disabled.
The JavaScript only improves how errors are presented, toggles the conditional
photo-link field, catches oversized files early, and records a small engagement
metric.

**Accelerated checkout is not rendered** on the product page, so Shop Pay /
Apple Pay / Google Pay cannot be used to skip the personalization form.

**Two products, one template.** Tier-specific behaviour is driven by the product
tags `cmi-tier-one-night` and `cmi-tier-full-issue`.

## Reproduce the verification

```bash
cd storefront/tools
npm install
node render-preview.mjs   # renders the real .liquid files
node verify.mjs           # 71 checks in Chromium at 360/390/430px
```

`tools/` and `preview/` are development aids. Do not upload them to Shopify.

## The three things most likely to go wrong

1. **Cart type not set to "Page."** Uploaded ticket screenshots are silently
   dropped. `docs/03-admin-steps.md` B1, checklist L6.
2. **A missing `cmi-tier-*` tag.** The product renders as One Night. Checklist L4.
3. **A product handle that does not match** the comparison section's settings.
   The other tier shows "Not published yet" instead of a price.
