# Shopify implementation specification

Turning the existing store into the checkout for the accessibility scan service.

**Price is not approved.** Everything below assumes **2,490 SEK excluding VAT**
as the working figure from the brief. Do not publish the product until the owner
has confirmed the price and the VAT treatment (see §7).

This session had no Shopify access, so nothing here has been applied. These are
instructions for the owner.

---

## 1. Before anything: back up

Same procedure as any store change, and it takes five minutes.

1. Online Store → Themes → `⋯` on the **live** theme → **Duplicate**. Name it
   `BACKUP <date> — pre accessibility service`.
2. `⋯` → **Download theme file**. Keep the zip off Shopify.
3. Products → **Export** → *All products* → CSV. Keep it.
4. Duplicate the live theme a second time and do all work on that copy.

## 2. Legacy products

**Do not delete anything.** The instruction is to get old products out of the
customer's way, not out of the database.

1. Products → filter by Status **Active** → select everything that is not the
   new service → **Actions** → *Set as draft*.
2. Online Store → Navigation → remove legacy collections from the **Main menu**
   and the **Footer menu**. Draft products stay reachable by direct URL, which
   is fine; nothing links to them.
3. Leave the collections themselves in place. Deleting them breaks any external
   link that still exists and gains nothing.

A drafted product keeps its history, its handle and its analytics. It can be
re-activated in one click.

## 3. The product

Products → **Add product**.

| Field | Value |
|---|---|
| Title | `E-commerce Accessibility Risk Scan` |
| Price | `2490.00` SEK **excluding VAT** — see §7 before publishing |
| Charge tax | Confirm with the accountant before enabling |
| **Shipping → This is a physical product** | **Unchecked** — this is a service |
| Inventory → Track quantity | **Unchecked**, or set a deliberate weekly cap |
| Product type | `Service` |
| Tags | `service`, `accessibility` |
| URL handle | `accessibility-risk-scan` |
| Status | **Draft** until §8 is complete |

### Limiting throughput

Each scan needs human review, so unlimited sales are a delivery problem. If you
want a cap, **track quantity** and set it to the number you can deliver in a
week, topping it up on Mondays. That is honest scarcity — you genuinely cannot
deliver more. It is not the fake countdown kind, which is both prohibited here
and illegal under EU unfair-commercial-practices rules.

## 4. Intake

The scan cannot start without the customer's details, and they must arrive
attached to the order rather than in a separate inbox.

Use **native line item properties** — the same mechanism as the concert-issue
product already in this repository (`storefront/theme/snippets/cmi-field.liquid`
is directly reusable). No app, no subscription.

| Field | Property name | Required | Notes |
|---|---|---|---|
| Company name | `Company name` | yes | |
| Website URL | `Website URL` | yes | `type="url"`, must start with https:// |
| Organisation number | `Organisation number` | no | 10 digits, `NNNNNN-NNNN` |
| Contact name | `Contact name` | yes | |
| Email | `Email` | yes | `type="email"`, `autocomplete="email"` |
| E-commerce platform | `Platform` | no | select: Shopify / WooCommerce / Magento / Custom / Don't know |
| Notes | `Notes` | no | textarea — known concerns, deadlines, who will act on the report |

Implementation notes, all learned the hard way on the other product:

- Put the fields inside the product form so they post to `/cart/add`.
- **Set the theme's cart type to "Page", not "Drawer".** A drawer cart submits
  over AJAX, and line item properties can be lost silently.
- Do **not** render `payment_button`. Accelerated checkout submits straight past
  the form, and an order with no website URL cannot be delivered.
- Validate `Website URL` with `type="url"` so the browser blocks a malformed
  entry before add-to-cart.

### Website URL is the one field worth validating properly

It is the input to the scanner, and the scanner refuses anything that is not a
public http/https target. Add a note under the field:

> The public address of your webshop, for example https://dinbutik.se — we scan
> publicly reachable pages only, and never anything behind a login.

## 5. Sales page

Reuse the `cmi-*` section pattern already in this repository if you want section
structure; the copy below is what matters.

**Headline**

> Find the accessibility risks in your webshop before they become expensive.

**Supporting copy**

> A focused technical accessibility scan for Swedish e-commerce. Get a
> prioritized list of concrete problems and fixes without starting with a full
> agency audit.

**Disclaimer — must be visible on the page, not only at checkout**

> Technical accessibility risk scan. Not legal advice, certification, or
> guarantee of compliance.

### What you get

- A prioritized list of concrete accessibility problems across the customer
  journey: browse, product, cart and checkout entry.
- For each: what is broken, where, who it affects, the relevant WCAG criterion,
  how to fix it, and an effort estimate.
- A quick-wins list — high impact, low effort.
- A developer handoff you can paste straight into Jira, Linear or GitHub.
- A manual verification script for the checks software cannot decide.

### What this is not

State it on the page, not in small print:

- Not a legal certification, and not a compliance guarantee.
- Not a full formal WCAG audit.
- Not an accessibility overlay — we do not sell one, and we would advise against
  buying one.
- Automated testing finds a portion of accessibility problems. The report says
  which findings were verified automatically and which need a person.

### Forbidden on this page

No testimonials, no customer logos, no customer counts, no "X shops scanned",
no countdown timers, no fabricated scarcity, no claims about fines. There are no
customers yet. Inventing social proof is illegal under EU unfair-commercial-
practices rules and would be the fastest way to destroy the credibility this
service is entirely built on.

When there are real customers and they have agreed in writing, add real quotes.

## 6. Fulfilment

1. Settings → Checkout → Order processing → **"Don't fulfil any of the order's
   line items automatically."**
2. On each order: read the line item properties, confirm the URL is in scope,
   run `npm run full-scan -- <url>`.
3. **Review the draft.** Delete false positives, sanity-check severities, and
   perform as much of the manual script as the price supports.
4. Deliver the HTML report (print to PDF) plus the handoff markdown by email.
5. Mark the order fulfilled.

**The review step is the product.** The tool produces a draft; a person is what
makes it worth 2,490 SEK. Never send raw tool output.

### A prospect whose site cannot be scanned

The scanner refuses non-public targets. If a customer's site is behind a
password, on a private address, or blocks the crawler, refund the order and say
why. Do not improvise around the guard.

## 7. Legal and tax — owner review required

Same standing as the concert-issue product: flagged, not decided.

- [ ] **VAT.** 2,490 SEK is quoted excluding VAT, so the store must display and
      charge correctly for both B2B and B2C. Consultancy services to Swedish
      businesses, to EU businesses with a VAT number (reverse charge), and to
      consumers are three different treatments. Confirm with the accountant
      before publishing.
- [ ] **Right of withdrawal.** A B2B sale is not a consumer distance contract, but
      the store will accept consumer orders unless you prevent it. Decide which
      you are selling to and write the refund policy accordingly.
- [ ] **Terms of service** covering: what a scan covers, that it is not a
      certification, that the customer confirms they own or are authorised to
      scan the site, turnaround, and liability limits.
- [ ] **Authorisation to scan.** The order form should state that the customer
      confirms they own the site or are authorised to have it scanned. Add it as
      a required acknowledgement checkbox recorded as a line item property.
- [ ] **Professional liability.** You are giving technical advice a business will
      act on. Ask an insurer whether existing cover extends to it.
- [ ] **GDPR.** Scans capture page content, which can include personal data.
      State retention in the privacy policy and delete raw scan output on a
      schedule.

Do not publish the product until VAT and the authorisation checkbox are settled.
Those two are blocking.

## 8. Launch checklist

- [ ] Backup theme duplicated and downloaded; product CSV exported
- [ ] Legacy products drafted, legacy collections out of both menus
- [ ] Product created, digital (no shipping), correct handle
- [ ] Intake fields present and posting as line item properties
- [ ] Cart type set to **Page**
- [ ] No accelerated-checkout button on the product page
- [ ] Test order placed on a phone; **all** intake fields present on the order
- [ ] Automatic fulfilment off
- [ ] Sales page carries the disclaimer above the fold
- [ ] No testimonials, logos, counts or scarcity anywhere on the page
- [ ] VAT treatment confirmed (§7) — **blocking**
- [ ] Authorisation acknowledgement in the intake form — **blocking**
- [ ] Refund policy and terms written
- [ ] Price confirmed by the owner — **blocking**
- [ ] End-to-end rehearsal: place an order against a site you own, run the scan,
      review it, deliver it. Time it. That time is your real cost of delivery.

## 9. What to build only after the first paid orders

Not now, in this order when demand justifies it:

1. An order-confirmation email that includes the intake details back to the
   customer for correction.
2. A tracked delivery SLA once you know the real turnaround.
3. A recurring re-scan offer — the natural second sale, and worthless before you
   know whether the first one sells.
4. Anything resembling a dashboard, a login, or a SaaS.
