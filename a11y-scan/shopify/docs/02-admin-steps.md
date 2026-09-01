# 2. Exact Shopify Admin steps

Everything here must be done by the owner in Shopify Admin. This session has
no Shopify access — see `01-tax-configuration.md` for what that means for tax.

**Read `01-tax-configuration.md` first.** Two of its steps are blocking on
publishing checkout.

Estimated time: 30–45 minutes, plus the tax investigation in doc 1.

---

## Phase A — rollback point (5 min)

Same discipline as any storefront change:

1. Online Store → Themes → `⋯` on the **live** theme → **Duplicate**. Name it
   `BACKUP <date> — pre accessibility service`.
2. `⋯` → **Download theme file**. Keep the zip off Shopify.
3. Products → **Export** → All products → CSV. Keep it.
4. Duplicate the live theme a second time and do all work on that copy —
   `JM Store — Accessibility Scan (working)` or similar.

## Phase B — legacy products (5 min)

**Do not delete anything.**

1. Products → filter Status: Active → select everything that is not this
   service → **Actions → Set as draft**.
2. Online Store → Navigation → remove legacy collections from the **Main
   menu** and the **Footer menu**. A drafted product stays reachable by direct
   URL; nothing links to it, which satisfies "customer-facing navigation
   should focus only on the accessibility service" without destroying anything.
3. Leave the underlying collections in place.

## Phase C — upload the theme code (15 min)

Work on the duplicated **working** theme only. `⋯` → **Edit code**.

### C1. Assets (2 files)

Assets → **Add a new asset** → *Create a blank file*:

| Create as | From |
|---|---|
| `ars.css` | `shopify/theme/assets/ars.css` |
| `ars-intake.js` | `shopify/theme/assets/ars-intake.js` |

### C2. Snippets (1 file)

Snippets → **Add a new snippet** → name `ars-field` (Shopify adds `.liquid`) →
paste `shopify/theme/snippets/ars-field.liquid`.

### C3. Sections (4 files)

Sections → **Add a new section** → name it → delete the scaffold Shopify
inserts → paste:

`ars-hero`, `ars-what-you-get`, `ars-how-it-works`, `ars-intake`, `ars-faq`

(5 files — all from `shopify/theme/sections/<name>.liquid`)

### C4. Product template

Templates → **Add a new template** → For: **product** → Type: **JSON** →
Name: `accessibility-scan`.

Replace the generated `templates/product.accessibility-scan.json` contents
entirely with `shopify/theme/templates/product.accessibility-scan.json`.

### C5. Homepage template

**Copy the existing `templates/index.json` to a text file first** — this is
the one step that discards the current homepage layout (recoverable by
republishing the backup theme).

Templates → `index.json` → replace with `shopify/theme/templates/index.json`.

> Prefer not to overwrite? Leave `index.json` alone, open the theme editor on
> the homepage, remove existing sections, and add the `ARS *` sections from
> **Add section** instead.

## Phase D — theme settings (5 min)

### D1. Cart type must be "Page" — not optional

Theme editor → **Theme settings** → **Cart** → Cart type: **Page**.

Why: the intake form's native file-less line-item-property submission needs a
real form POST. A drawer/popup cart intercepts add-to-cart with AJAX and can
silently drop line item properties — including both acknowledgements. This is
the single most likely way to lose the authorisation record for an order.

### D2. Confirm no accelerated checkout on the product page

The intake section deliberately does not render `{{ form | payment_button }}`.
After publishing, open the product page and confirm the **only** button is
"Lägg till i varukorgen" (Add to cart) — no Shop Pay / Apple Pay / Google Pay
button. Those bypass the form and both acknowledgements entirely.

If your theme's product template independently injects an accelerated
checkout button outside this section (some theme headers do, via a dynamic
checkout block), **disable dynamic checkout buttons for this specific
product**: Product → scroll to **Publishing** — there is no per-product
toggle in core Shopify for this; the reliable method is ensuring this section
is the only buy box on the page and that the theme has no global "dynamic
checkout button" setting turned on for product templates. Check Theme
settings → Cart / Checkout for a "Show dynamic checkout buttons" toggle and
turn it off if present.

## Phase E — the product (10 min) — after tax doc is resolved

Products → **Add product**.

| Field | Value |
|---|---|
| Title | `E-commerce Accessibility Risk Scan` |
| Price | `2490.00` — **confirm against `01-tax-configuration.md` first** |
| **Shipping → This is a physical product** | **Unchecked** |
| Inventory → Track quantity | Unchecked, or capped to your real weekly delivery capacity (see below) |
| Product type | `Service` |
| Tags | `service`, `accessibility` |
| URL handle | `accessibility-risk-scan` |
| Theme template | `accessibility-scan` |
| Status | **Draft** until Phase G passes |

### Throughput cap

Every order needs a human review pass before delivery. If you want to cap
concurrent orders to what you can actually review, **track quantity** and set
it to your weekly capacity, topping up manually. This is honest — you cannot
deliver more than you can review — and is not the fabricated-scarcity pattern
the brief prohibits (never a countdown timer, never "3 left" language).

## Phase F — fulfilment settings (2 min)

Settings → Checkout → Order processing → **"Don't fulfil any of the order's
line items automatically."**

No report is generated automatically. See `03-fulfillment-workflow.md` for the
full lifecycle from paid to delivered.

## Phase G — verify before publishing

Preview the working theme (`⋯` → Preview) and go through
`04-launch-checklist.md` in full, on a real phone, including a real test
order. Only after that passes:

1. Set the product to **Active**.
2. Themes → **Publish** the working theme.
3. Re-run the add-to-cart and acknowledgement tests on the **live** store —
   preview and live can behave differently.

## Rollback

Publish the `BACKUP <date>` theme. Under a minute, fully reverses the theme
side. Product creation and tax settings are Admin data, not theme data, and
are not undone by a theme rollback — see
`../../storefront/docs/02-backup-and-rollback.md` for the general pattern,
which applies unchanged here.
