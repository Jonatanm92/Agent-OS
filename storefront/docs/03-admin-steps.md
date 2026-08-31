# 3. Exact Shopify Admin steps

Everything in this file must be done by the owner in Shopify Admin. None of it
could be done from the build environment (see `01-store-audit.md`).

**Do `02-backup-and-rollback.md` first.** Steps marked
**[not undone by theme rollback]** change data outside the theme.

Estimated time end to end: 45–70 minutes.

---

## Phase A — upload the code (~20 min)

Work in the duplicated theme named `JM Store — Concert Memory (working)`, never
the live one. Online Store → Themes → `⋯` → **Edit code**.

### A1. Assets (2 files)

Assets → **Add a new asset** → *Create a blank file* → paste the contents of:

| Create as | From |
|---|---|
| `cmi.css` | `storefront/theme/assets/cmi.css` |
| `cmi-personalizer.js` | `storefront/theme/assets/cmi-personalizer.js` |

### A2. Snippets (2 files)

Snippets → **Add a new snippet** → name it (Shopify adds `.liquid`) → paste:

| Create as | From |
|---|---|
| `cmi-css` | `storefront/theme/snippets/cmi-css.liquid` |
| `cmi-field` | `storefront/theme/snippets/cmi-field.liquid` |

### A3. Sections (10 files)

Sections → **Add a new section** → name it → **delete the scaffold Shopify
inserts** → paste the file contents. Repeat for all ten:

`cmi-hero`, `cmi-before-after`, `cmi-how-it-works`, `cmi-included`,
`cmi-examples`, `cmi-personalizer`, `cmi-gift`, `cmi-faq`, `cmi-trust`,
`cmi-returns-notice`

(all from `storefront/theme/sections/<name>.liquid`)

### A4. Product template

Templates → **Add a new template** → For: **product** → Type: **JSON** →
Name: `concert-memory`.

Shopify creates `templates/product.concert-memory.json`. Replace its entire
contents with `storefront/theme/templates/product.concert-memory.json`.

### A5. Homepage template

**Copy the existing `templates/index.json` into a text file first** — this
overwrite is the one code step that discards the current homepage layout.
(Republishing the backup theme restores it, but keep the copy anyway.)

Templates → `index.json` → replace contents with
`storefront/theme/templates/index.json` → Save.

> Prefer not to overwrite? Equivalent alternative: leave `index.json` alone, open
> the theme editor on the homepage, remove the pet-store sections, and add the
> `CMI *` sections from **Add section**. Slower, but nothing is overwritten.
> Either way the old products are untouched — only what the homepage *displays*
> changes.

---

## Phase B — theme settings (~5 min)

### B1. Cart type must be "Page" — this one is not optional

Theme editor → **Theme settings** → **Cart** → Cart type: **Page**
(not *Drawer*, not *Popup*).

Why: Shopify's native file upload needs a real form POST. A drawer/popup cart
submits add-to-cart over AJAX, and the uploaded ticket file is **silently
dropped** — the order looks fine and the file simply is not there. This is the
single most likely way to lose customer material. The test in `07-launch-checklist.md`
(L6) exists to catch it.

### B2. Confirm no accelerated checkout on the product page

The personalizer deliberately does not render `payment_button`, so Shop Pay /
Apple Pay / Google Pay buttons do not appear on the product page and cannot be
used to skip the personalization form. After publishing, open the product page
and confirm the only button is **Create My Concert Issue**.

Accelerated checkout on the *cart* page is fine and can stay — the personalization
is already attached to the line item by then.

---

## Phase C — create the two products (~20 min) **[not undone by theme rollback]**

Products → **Add product**. Repeat for both.

### Shared settings for both products

| Field | Value |
|---|---|
| Media | Leave empty for now, or add your own example artwork |
| **Inventory → Track quantity** | **Unchecked** (a made-to-order service never sells out) |
| **Shipping → This is a physical product** | **Unchecked** (this makes it a digital product) |
| Options / variants | None |
| Theme template | **`concert-memory`** |
| Status | **Draft** until the launch checklist passes, then Active |

### Product 1 — One Night

| Field | Value |
|---|---|
| Title | `One Night — Personalized Concert Memory Issue` |
| Price | `349.00` SEK |
| Tags | `cmi`, `cmi-tier-one-night` |
| URL handle | `one-night-personalized-concert-memory-issue` |

### Product 2 — Full Issue

| Field | Value |
|---|---|
| Title | `Full Issue — Personalized Concert Memory Edition` |
| Price | `549.00` SEK |
| Tags | `cmi`, `cmi-tier-full-issue` |
| URL handle | `full-issue-personalized-concert-memory-edition` |

### Two things that will silently misbehave if you skip them

1. **The tags are functional, not decorative.** `cmi-tier-full-issue` is how the
   page knows to highlight the right column in the comparison and to say "8 to 14
   photos" instead of "3 to 6". A product with neither tag is treated as One Night.
2. **The handles must match exactly.** Shopify derives the handle from the title
   and may append `-1` if anything similar exists. Check it under
   *Search engine listing* → **Edit** → *URL handle*. The comparison section
   looks products up by these handles; a mismatch shows "Not published yet"
   instead of the price. If you must use different handles, update them in the
   theme editor: *CMI What's Included* → the two handle fields.

### Product descriptions

The product page copy lives in the theme sections, so the description field is
only used in search results and cart previews. Suggested text:

> **One Night** — A personalized concert memory issue, designed by hand from your
> own ticket, photos and story. Around 8 pages, delivered as a digital file. A
> personalized fan keepsake — not official artist or ticketing merchandise.

> **Full Issue** — An expanded personalized concert memory edition, around 12–16
> pages, designed by hand from your own photos and memories, with room for more
> images and one round of revisions. Delivered as a digital file. A personalized
> fan keepsake — not official artist or ticketing merchandise.

SEO title and description for each: see `10-seo.md`.

---

## Phase D — order handling (~5 min) **[not undone by theme rollback]**

### D1. Turn off automatic fulfilment

Settings → **Checkout** → *Order processing* → choose
**"Don't fulfil any of the order's line items automatically."**

Nothing may be marked fulfilled before a human has designed the issue.

### D2. Digital delivery

See `04-digital-fulfillment.md` — it is a decision, not a single click.

### D3. Legal configuration

See `05-legal-review.md`. **Do not start selling before working through it.**

---

## Phase E — preview, test, publish

1. Themes → `⋯` → **Preview** on the working theme.
2. Work through `07-launch-checklist.md` end to end, on a real phone.
3. Set both products to **Active**.
4. Themes → **Publish** the working theme.
5. Re-run checklist items L5–L8 on the live storefront (a test order behaves
   differently from a preview).

---

## Optional: load the stylesheet once instead of ten times

Each section links `cmi.css` independently, which is what makes them drop-in with
no theme-file edits. The browser fetches the file once and caches it, so the cost
is small — but if you want it strictly once, add this to `layout/theme.liquid`
just before `</head>`:

```liquid
{{ 'cmi.css' | asset_url | stylesheet_tag }}
```

and delete the `{% render 'cmi-css' %}` line from each section. **Only do this if
you are comfortable editing `theme.liquid`** — it is a theme file, so it is
overwritten by a theme update. The sections work correctly either way.
