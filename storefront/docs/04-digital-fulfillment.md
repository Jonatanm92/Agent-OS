# 4. Digital fulfilment — exact setup

**Constraint from the brief, restated because it drives everything here:**
the customer must **not** automatically receive a blank placeholder file the
moment they pay. Nothing exists to send yet — the issue has not been designed.

Shopify's free **Digital Downloads** app delivers an attached file automatically
on payment. That is exactly the behaviour to avoid at the moment of purchase.

## Verification note

The steps below could not be executed or screenshot-verified — this environment
has no Shopify access, and `shopify.dev` / `help.shopify.com` are blocked by the
session's egress policy, so the wording of individual Admin buttons could not be
re-checked against current documentation. Menu labels move between Admin
releases. Treat the **sequence and intent** as correct and the exact label text
as "close enough to find".

---

## Recommended: Path A — no app at all

Best fit for a validation experiment: zero moving parts, nothing to misfire, and
no app to uninstall later.

### Setup (once)

1. Both products already have **"This is a physical product" unchecked**
   (Phase C). That alone makes them digital: no shipping is requested, no address
   step for a digital-only cart.
2. Automatic fulfilment is off (Phase D1). Orders arrive **Unfulfilled** and stay
   that way until you act.
3. That is the entire setup. Nothing is attached to the product, so nothing can
   be sent early.

### Per order

1. Order arrives. Open it and read the line item properties — every
   personalization answer is there (see `09-verification.md` for the exact list).
2. Collect the material: the ticket screenshot is a link in the properties; the
   photos are either a share link in the properties or, if the customer chose
   "email after ordering", an email you send them now.
3. Design the issue.
4. Upload the finished PDF to **Content → Files**. Copy its URL.
5. Email the customer the link (reply to their order confirmation so it threads).
6. Open the order → **Fulfil item** → add the link in the note. The customer gets
   Shopify's shipping-confirmation email; the order closes properly and the sale
   counts correctly in analytics.

### Why this is the recommendation

It cannot deliver anything before you intend it to, because there is nothing to
deliver until you upload it. There is no app whose default behaviour you have to
fight.

**Caveat to know about:** a file in Content → Files is on a public CDN URL. It is
unguessable, but it is not access-controlled. If a customer's issue is sensitive,
send it as an email attachment instead, or use Path B.

---

## Path B — free Digital Downloads app, attached late

Use this if you want download links, a download count, and re-send buttons.

1. Install **Digital Downloads** (by Shopify, free) from the App Store.
2. **Attach no file to either product.** An attached file is delivered
   automatically on payment — that is the failure mode this whole page exists to
   avoid.
3. Fulfil per order: open the order → the Digital Downloads section → **add the
   file to that order** → send the download link.

**Verify this before relying on it:** place one test order (see below) and
confirm that with no file attached to the product, the customer receives **no**
download email at checkout. If your Admin behaves differently, fall back to
Path A. Do not assume.

---

## What NOT to do

- **Do not attach a placeholder/"your issue is coming" PDF to the product.** It
  delivers instantly on payment, and the customer's first experience of a 349 SEK
  purchase is receiving an empty file.
- **Do not turn automatic fulfilment back on.**
- **Do not buy a digital-delivery app.** Neither path needs one.

---

## Test order procedure (do this before going live)

1. Settings → Payments → **Manage** on your provider → enable
   **Bogus Gateway / test mode**. (Bogus Gateway is available when no real
   provider is active; Shopify Payments has its own test mode.)
2. Buy One Night on your phone, filling the form properly and attaching a real
   ticket screenshot.
3. Confirm, in order:
   - the order shows **every** personalization property (`09-verification.md`
     lists all 15);
   - the ticket screenshot is a **working link** — open it;
   - the order is **Unfulfilled**;
   - **no download email arrived**;
   - the order confirmation email shows the personalization details.
4. Refund/cancel the test order and **turn test mode off**.

Step 3's "no download email arrived" is the one that catches a
Digital-Downloads misconfiguration. Do not skip it.

---

## Post-purchase email (needed for the "email my photos later" path)

Customers who pick "Email my photos after I order" are told they will get
instructions. Nothing sends that automatically — **you must**, or those orders
stall.

Two options:

- **Manual (start here).** Watch for orders where `Photo delivery` is
  `Send by email after ordering` and reply to the order confirmation. Fine at
  validation volume.
- **Automated (later).** Settings → Notifications → **Order confirmation** →
  edit the template to include an instructions block. Shopify's notification
  templates are Liquid and can read `line.properties`, so the block can be shown
  only when that property has that value. Worth doing once order volume makes
  manual replies annoying — not before.

Suggested wording:

> Thanks — your concert issue is booked. Send your photos to **<your email>**
> and put your order number in the subject line. Anything from your phone's
> camera roll is fine; originals are better than screenshots. We start designing
> as soon as they arrive.
