# 8. Known limitations

Listed so they are decisions rather than surprises.

---

## 1. No Shopify access from the build environment

Everything buildable locally is built and verified. Everything requiring Admin is
written up in `03-admin-steps.md`. No claim is made about the live store's current
state beyond what `01-store-audit.md` could actually check. Nothing was changed in
the store.

`shopify.dev` and `help.shopify.com` are both blocked by the session's egress
policy, so Shopify's documentation could not be re-read while building. The
platform behaviour relied on here is long-standing and stable, but where a claim
depends on current Admin behaviour it is flagged in place and paired with a test.

## 2. File upload: one file, 20 MB, and it needs a real form POST

Shopify's native line-item-property file input has hard constraints:

- **one file per input** — `multiple` is not supported;
- **20 MB maximum**, not adjustable;
- it requires a genuine multipart form submission.

**Consequences, and what was done about each:**

| Constraint | Handling |
|---|---|
| One file only | Only the ticket screenshot uses a file input. Photos come via a share link or by email — see below. |
| 20 MB | The JS blocks an oversized file *before* the customer waits through a doomed upload; the hint states the limit. |
| Needs a real POST | The form is never intercepted by JavaScript. **But if the host theme hijacks add-to-cart with AJAX, the file is silently dropped.** Set cart type to "Page" (`03-admin-steps.md` B1) and verify with checklist item L6. |

That last row is the highest-risk item in this build. The failure is silent: the
order looks perfectly normal and the file simply is not there.

## 3. Photos are not uploaded directly

The brief allowed a share-link or post-purchase fallback if native uploads were
insufficient for multiple files. They are insufficient — 3 to 6 photos cannot go
through one 20 MB input — and **no paid app was added**.

Instead the customer chooses:

1. **Share link** (default) — Drive/Dropbox/iCloud/WeTransfer. One field, no size
   limit, works on a phone.
2. **Email after ordering** — for customers who have not prepared a link.

Cost of this: option 2 needs a reply from you (`04-digital-fulfillment.md`), and
option 1 depends on the customer setting sharing permissions correctly. Expect
some orders to need one follow-up email. At validation volume that is cheaper than
an app subscription, and it is reversible.

## 4. Conditional "required" needs JavaScript

`Photo link` is required only when "share link" is selected. HTML cannot express
that, so JavaScript sets it.

Without JavaScript the field is visible and submittable but not enforced. The
alternative — marking it required in the HTML — would trap no-JS customers who
chose "email after ordering". Enforcement was chosen to degrade, rather than the
purchase path. Such an order arrives with `Photo delivery: Share link` and an
empty link; treat it like the email path.

## 5. Both products share one template

Shopify JSON template settings are per template, not per product. Tier-specific
content is therefore driven by the product tags `cmi-tier-one-night` /
`cmi-tier-full-issue`, and text that differs (the photo-count hint) is a pair of
settings selected in Liquid.

**If the tag is missing, the product silently renders as One Night.** This is the
second-most-likely misconfiguration after cart type. Checklist item L4 catches it.

## 6. Each section links the stylesheet separately

`{% render %}` runs in an isolated scope, so an "emit once" guard is impossible.
Each section links `cmi.css` independently — 10 link tags to one cached file.
The fetch happens once; the parse happens per tag. The cost is small and it is
what makes the sections drop-in with no `theme.liquid` edit.

**The subtle consequence** (found and fixed during verification, now guarded by an
automated check): a later section's `<link>` sits after an earlier section's
inline `<style>` in document order, so equal-specificity section overrides get
reverted. Every section-level selector is therefore prefixed with `.cmi ` to raise
its specificity. **Keep that prefix when editing section styles.**

`03-admin-steps.md` documents the optional single-link optimisation.

## 7. The preview renderer is not Shopify

`tools/render-preview.mjs` implements only what these sections use: `{% form %}`
is approximated, and `money`, `image_url`, `asset_url`, `handle`, `stylesheet_tag`
are simplified. It proves the markup, CSS and JS are correct. It cannot prove
anything about Shopify's server behaviour — the checklist covers that.

Money formatting in particular is the store's own setting; the preview's
`349,00 kr` is a stand-in.

## 8. Line item property value length is an unverified limit

The setlist field accepts 1,500 characters and the notes field 900. **Shopify's
maximum length for a line item property value is not publicly documented**, and
this could not be tested from here — there are scattered developer reports of an
undocumented cap, but no authoritative figure, and `shopify.dev` is blocked by
this session's egress policy.

Realistically a 20-song setlist is about 500 characters, so the limits are
generous headroom rather than an expected case. The risk is silent truncation:
the order would look fine with the end of a long setlist missing.

**Handled by test, not by guessing:** launch checklist item O10 pastes a
deliberately long setlist into the test order and checks it arrives complete.

**If it truncates:** lower `maxlength` on the Setlist field in
`cmi-personalizer.liquid` to just under whatever survived, and add a line to the
field's hint telling customers to email longer setlists.

## 9. Deliberately not built

Each of these is cheap to add later and unjustifiable now:

- No sticky mobile buy-bar. Three CTAs above the form anchor to it.
- No image gallery/lightbox on the examples.
- No customer accounts, order tracking portal, or upload dashboard.
- No automated post-purchase email (manual first — `04-digital-fulfillment.md`).
- No print-on-demand integration. Explicitly out of scope until digital sells.
- No reviews section — there are no reviews.
- No blog, no collections beyond what exists, no additional products.

## 10. Untestable from here

- Actual Shopify file-upload round trip
- Cart page rendering of line item properties (theme-dependent)
- Checkout, taxes, currency, emails
- Real-device Safari/Chrome behaviour (verified in Chromium at mobile viewports)
- Lighthouse against a live URL. Structurally the pages are light — no fonts, no
  images, no libraries, ~17 KB of shared assets — but a real score depends on the
  host theme's own scripts, which cannot be measured from here.
