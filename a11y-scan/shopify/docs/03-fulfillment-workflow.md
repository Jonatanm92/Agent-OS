# 3. Order lifecycle and operator commands

## The lifecycle, as promised on the service page

```
PAID
  -> intake validated        (operator reads the order)
  -> internal scan           (npm run scan)
  -> human verification      (operator reviews the draft)
  -> report finalized        (operator edits, removes false positives)
  -> report delivered        (operator emails it)
  -> order marked fulfilled  (Shopify Admin)
```

No step is automated end to end. That is deliberate: the product being sold
is "a scan plus a person checking it", not "a scan".

## Step by step

### 1. Order arrives

Shopify → Orders. Open the order. The line item properties carry everything
you need:

- Company name, Contact name, Business email, Organisation number (optional)
- **Website URL** — the scan target
- Platform, Known concerns (both optional)
- Two acknowledgement properties, each recording the confirmed text —
  proof the buyer ticked both boxes, on the order itself, forever

### 2. Validate the intake

Before running anything:

- Is the Website URL a real, public address? Open it in a browser.
- Does it look like it belongs to the company named on the order? If in
  doubt, email the contact and ask before scanning — the acknowledgement
  confirms *they* believe they are authorised, not that you have verified it.
- Is it reachable over https? The scanner's own guard refuses anything that
  is not public http/https (see `../../THREAT-MODEL.md`) — if the CLI refuses
  the URL, that is a signal to double check with the customer, not to route
  around the guard.

### 3. Run the scan — one command per order

```bash
cd a11y-scan
npm install            # first time only
npm run scan -- --url https://kundens-butik.se --order 1234 --company "Kundens Butik AB"
```

This writes an isolated bundle:

```
reports/orders/1234/
  report.html            the customer-facing report — print to PDF, or send as-is
  scan.json              machine-readable, for your own records or tooling
  handoff.md             developer task list, paste into Jira/Linear/GitHub
  manual-checklist.md    the human verification script — DO THIS, do not skip it
  evidence/              extracted screenshots, numbered to match the report
  run-metadata.json      what was scanned, when, and a humanReviewCompleted flag
```

**Data minimisation, by design:** the bundle records the order reference and
the scanned URL. It does **not** copy the contact name, email or organisation
number out of Shopify — those already live there, and duplicating them onto a
laptop for no operational reason is exactly the kind of unnecessary personal
data the brief asks not to store. `run-metadata.json` states this explicitly.

### 4. Human verification — the paid part

Open `manual-checklist.md`. Work through it against the real site: keyboard
navigation, focus order, menus, modals, cookie consent, forms, mobile
navigation, zoom, screen-reader labels. Tick Pass / Fail / N/A for each and
add notes. **A checklist item you did not actually perform must stay
unticked** — that is what makes the record honest.

Open `report.html` in a browser. Read every finding:

- Remove anything that is a false positive for this specific site.
- Adjust severity if the automated flow-position heuristic got the business
  context wrong (see `../../ARCHITECTURE.md` — severity is assigned
  mechanically and a person is expected to sanity-check it).
- Fold in anything you found manually that the scanner could not see.

### 5. Finalize and deliver

- Print `report.html` to PDF (Ctrl/Cmd+P → Save as PDF), or send the HTML
  file directly — it is self-contained, no external assets.
- Attach `handoff.md` if the customer has a developer who wants the task list.
- Email both to the **Business email** address from the order.
- Update `run-metadata.json`: set `delivery.humanReviewCompleted: true`,
  `delivery.reviewedBy`, and `delivery.deliveredAt`. This is your own audit
  trail, not sent to the customer.

### 6. Mark the order fulfilled

Shopify Admin → the order → **Fulfil item**. This is a manual click — Phase F
of `02-admin-steps.md` turned off automatic fulfilment specifically so this
step cannot happen before delivery.

## Ad-hoc scans (not tied to an order)

For your own testing, or a scan you are not yet ready to bill:

```bash
npm run scan -- --url https://example.se --out ./out
```

Writes to `./out/` as loose files instead of an order bundle. No
`run-metadata.json`, no evidence folder structure — just the three report
files, same as before this milestone's `--order` flag was added.

## Prospecting (before a sale exists)

```bash
npm run prospect -- https://prospect.se
```

Lightweight, fast, a handful of pages, no acknowledgements needed because
nothing is purchased or delivered — this is purely internal. See
`../../docs/shopify-service-spec.md` and `../../PRESCAN` behaviour in
`src/prescan/prescan.ts` for the language rules: observational, never
accusatory, never asserts illegality. **Never send this output to the
prospect** — it is explicitly headed "INTERNAL LEAD SUMMARY — NOT FOR
SENDING TO THE PROSPECT".

## Delivery time

No turnaround time is hard-coded anywhere in the theme or the tool. The
service page says "Aktuell leveranstid visas innan beställning" (current
delivery estimate is shown before ordering) and nothing more specific. If you
want to commit to a number, that is a business decision to make once you know
how long one order actually takes you end to end — try it on yourself first.
