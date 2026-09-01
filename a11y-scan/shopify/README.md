# Shopify: Accessibility Risk Scan checkout

Turns the existing Shopify store into a minimal B2B checkout for one service:
**E-commerce Accessibility Risk Scan**, 2 490 kr excl. VAT.

This session has no Shopify Admin access — see `docs/01-tax-configuration.md`
for exactly what that means for tax, and the general audit in
`../../storefront/docs/01-store-audit.md` for the same finding against this
store previously. Everything here is theme code and documentation, ready to
paste into Admin, not anything already applied to a live store.

## Read in this order

1. `docs/01-tax-configuration.md` — **blocking.** What could not be verified
   about VAT, and what the owner must confirm before publishing checkout.
2. `docs/02-admin-steps.md` — exact upload and configuration steps, ~30–45 min.
3. `docs/03-fulfillment-workflow.md` — the operator's order-to-delivery
   workflow and the exact commands.
4. `docs/04-launch-checklist.md` — test on a phone before publishing.

## What's here

```
theme/
  assets/
    ars.css              service-page styles, scoped under .ars
    ars-intake.js         form enhancement only — validation works without it
  snippets/
    ars-field.liquid      one intake field as a native line item property
  sections/
    ars-hero.liquid            headline, price, not-legal-advice notice
    ars-what-you-get.liquid    included / not included
    ars-how-it-works.liquid    the five-step order lifecycle
    ars-intake.liquid          the buy box — BOTH acknowledgements mandatory
    ars-faq.liquid              8 questions, native <details>, no JS needed
  templates/
    product.accessibility-scan.json
    index.json
tools/            local preview + acceptance verification (never uploaded)
preview/          rendered HTML + screenshots (evidence, not shipped)
```

## The two acknowledgements

Both are `required` checkboxes recorded as named line item properties, so the
browser blocks Add to cart until both are ticked — with or without
JavaScript — and the confirmed text lands on the order permanently:

- **Behörighet att genomföra granskningen** — the buyer confirms they are
  authorised to order the scan and understands its non-destructive scope.
- **Tjänstens omfattning** — the buyer confirms this is a technical
  pre-screening, not legal advice, certification or a compliance guarantee.

Verified by `tools/verify-acceptance.mjs` against the real rendered Liquid —
not asserted, run: both remain unticked blocks Add to cart, ticking only one
still blocks it, and the payload posted to `/cart/add` carries both properties
with their full confirmed text.

## Reproduce the verification

```bash
cd shopify/tools
npm install
node render.mjs              # renders the real *.liquid sections
node verify-acceptance.mjs   # acceptance checks in Chromium, 360/390/430px
```

## The one thing most likely to go wrong

**Cart type not set to "Page."** A drawer/popup cart intercepts add-to-cart
with AJAX and can silently drop line item properties — including both
acknowledgements, which is the whole point of this checkout. Set it in Theme
settings → Cart, and confirm with a real test order (`docs/04-launch-checklist.md`
item O3) before publishing.
