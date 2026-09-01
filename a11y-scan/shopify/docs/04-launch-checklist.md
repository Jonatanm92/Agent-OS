# 4. Launch checklist

Work top to bottom. **L-series items on a real phone**, not a resized desktop
browser — touch targets and native form controls behave differently.

Acceptance bar, restated from the brief: a customer on a phone understands
what is being sold, supplies the required details, both acknowledgements are
genuinely mandatory, the data survives into the order, they can pay, and the
operator can identify the target, run the scan, generate the report and mark
the order fulfilled.

---

## T — Tax (blocking, do first)

- [ ] **T1** VAT-registration status confirmed with accountant/Skatteverket
- [ ] **T2** Shopify Settings → Taxes and duties inspected and documented
      (`01-tax-configuration.md`)
- [ ] **T3** `show_inc_vat` set correctly for the confirmed status
- [ ] **T4** Shopify's own checkout price display matches the theme's price copy

## B — Backup (`02-admin-steps.md` Phase A)

- [ ] **B1** Live theme duplicated as `BACKUP <date>`
- [ ] **B2** Theme `.zip` downloaded and stored outside Shopify
- [ ] **B3** All products exported to CSV
- [ ] **B4** Second duplicate created as the working theme

## L — Legacy products (Phase B)

- [ ] **L1** All non-service products set to Draft
- [ ] **L2** Legacy collections removed from Main menu and Footer menu
- [ ] **L3** No collection or product deleted

## S — Setup (Phases C–F)

- [ ] **S1** 2 assets, 1 snippet, 5 sections uploaded to the working theme
- [ ] **S2** `product.accessibility-scan` JSON template created
- [ ] **S3** `index.json` replaced or homepage rebuilt in the editor
- [ ] **S4** Theme settings → Cart type = **Page**
- [ ] **S5** No global "dynamic checkout button" setting enabled
- [ ] **S6** Product created: digital, untracked or capacity-capped inventory,
      correct handle, template = `accessibility-scan`
- [ ] **S7** Settings → Checkout → automatic fulfilment **off**

## P — Product page, on a real phone

- [ ] **P1** Hero states the headline, price, and the not-legal-advice notice
      above the fold
- [ ] **P2** No horizontal scrolling anywhere, including landscape
- [ ] **P3** "Vad ni får" / "Vad ingår inte" both render — the excluded list is
      what stops the "is this legal advice" question before it's asked
- [ ] **P4** How-it-works shows the five-step lifecycle with no promised
      turnaround time
- [ ] **P5** FAQ opens and closes, every entry
- [ ] **P6** **No accelerated-checkout button anywhere on the page.** The
      only purchase control is "Lägg till i varukorgen".

## A — Acknowledgements (the item most likely to be gotten wrong)

- [ ] **A1** Both acknowledgement checkboxes are visually present with their
      full Swedish text, not truncated or hidden behind a collapse
- [ ] **A2** Ticking only acknowledgement 1 does not enable Add to cart
- [ ] **A3** Ticking only acknowledgement 2 does not enable Add to cart
- [ ] **A4** Submitting with neither ticked scrolls to and names the problem,
      does not silently fail
- [ ] **A5** With both ticked and all required fields filled, Add to cart
      succeeds

## O — Order data survival

- [ ] **O1** Test order placed (test mode / Bogus Gateway) with every field
      filled realistically, including a Swedish organisation number
- [ ] **O2** Order shows: Company name, Contact name, Business email,
      Website URL, Platform, Organisation number, Known concerns
- [ ] **O3** Order shows **both** acknowledgement properties with their full
      confirmed-value text, not just "true" or a checkbox glyph
- [ ] **O4** Order is **Unfulfilled** after payment
- [ ] **O5** No automatic report or file was sent to the customer
- [ ] **O6** Order confirmation email shows the intake details

## F — Fulfilment (`03-fulfillment-workflow.md`), on this test order

- [ ] **F1** `npm run scan -- --url <test order's URL> --order <test order id>`
      completes and writes `reports/orders/<id>/`
- [ ] **F2** `report.html` opens, reads as a professional document, answers
      the seven required questions (see `../../tests/commercial-report.test.ts`
      for the automated version of this check)
- [ ] **F3** `manual-checklist.md` is a real, tickable checklist
- [ ] **F4** `handoff.md` reads as a task list a developer could act on
- [ ] **F5** `run-metadata.json` contains the order reference and target, and
      **no** contact name, email or organisation number
- [ ] **F6** Order manually marked Fulfilled in Shopify Admin after the above

## C — Compliance copy

- [ ] **C1** "Technical accessibility risk scan. Not legal advice,
      certification or guarantee of compliance." appears on the service page
- [ ] **C2** No fabricated review, customer count, certification claim, or
      urgency/scarcity language appears anywhere on the page
- [ ] **C3** Refund/terms pages exist and address a made-to-order technical
      service (see the equivalent item in
      `../../storefront/docs/05-legal-review.md` — the same class of question
      applies here: what happens if the target cannot be scanned, what
      "delivered" means for a non-physical service)

---

## Stop-launch conditions

Do not go live if any of these is true:

- **T1–T4 unresolved** — you would be either charging VAT you cannot legally
  charge, or under-charging VAT you are legally required to charge.
- **A2 or A3 fails** — a customer can order without confirming authorisation
  or understanding the scope. That is the two acknowledgements' entire reason
  for existing.
- **S4 fails and O3 confirms properties are missing** — line item properties
  lost to an AJAX cart means the authorisation record does not exist.
- **P6 fails** — accelerated checkout bypassing the form defeats A2/A3 by a
  different route.

Everything else can be fixed after launch.
