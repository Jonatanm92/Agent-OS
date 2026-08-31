# 7. Launch checklist

Work top to bottom. **Do the L-series on a real phone**, not a desktop browser
resized — touch targets, the native date picker, and the file picker all behave
differently.

The acceptance bar is one sentence: *a real customer on a phone can understand
the product, submit the required personalization details, pay, and give us enough
to build and deliver their issue without confusion.*

---

## B — Before touching anything (`02-backup-and-rollback.md`)

- [ ] **B1** Live theme duplicated as `BACKUP <date> — pre concert pivot`
- [ ] **B2** Theme `.zip` downloaded and stored outside Shopify
- [ ] **B3** All products exported to CSV and saved
- [ ] **B4** Second duplicate created as the working theme; live theme untouched
- [ ] **B5** Current `templates/index.json` copied to a text file

## S — Setup (`03-admin-steps.md`)

- [ ] **S1** 2 assets, 2 snippets, 10 sections uploaded to the working theme
- [ ] **S2** `product.concert-memory` JSON template created
- [ ] **S3** `index.json` replaced (or homepage rebuilt in the editor)
- [ ] **S4** Theme settings → Cart type = **Page** ← *file uploads break without this*
- [ ] **S5** Both products created, digital (no shipping), inventory untracked
- [ ] **S6** Tags set: `cmi-tier-one-night` / `cmi-tier-full-issue`
- [ ] **S7** Handles match the two in the comparison section's settings
- [ ] **S8** Both products assigned the `concert-memory` template
- [ ] **S9** Settings → Checkout → automatic fulfilment **off**
- [ ] **S10** SEO title/description set on both products and the homepage (`10-seo.md`)

## L — On a real phone, in theme preview

- [ ] **L1** Homepage: hero reads correctly, **Create Your Issue** reaches the product
- [ ] **L2** Product page: all 10 sections present, in order, nothing overlapping
- [ ] **L3** No horizontal scrolling anywhere. Try landscape too.
- [ ] **L4** **One Night** page highlights the One Night column and says "3 to 6
      photos"; **Full Issue** highlights Full Issue and says "8 to 14".
      *If both say 3 to 6, a tag is missing (S6).*
- [ ] **L5** Tap **Create My Concert Issue** in the hero — it jumps to the form
- [ ] **L6** **The critical one.** Fill the form, attach a real ticket screenshot,
      add to cart. Then:
      - [ ] you land on the **cart page** (not a drawer)
      - [ ] the cart shows your typed answers
      - [ ] **the ticket screenshot appears as a link, and the link opens the image**
      *If the file is missing, the theme is hijacking add-to-cart. Fix S4.*
- [ ] **L7** Submit the form empty — it must not add to cart, and it must scroll to
      and name the first missing field
- [ ] **L8** Select "Email my photos after I order" — the link field disappears and
      no longer blocks submission. Switch back — it returns and is required.
- [ ] **L9** Attach a file over 20 MB — a clear error, no silent failure
- [ ] **L10** Every FAQ item opens and closes
- [ ] **L11** No accelerated-checkout buttons (Shop Pay / Apple Pay / Google Pay)
      on the product page — the only button is **Create My Concert Issue**
- [ ] **L12** Nothing anywhere claims a review, rating, customer count, press
      mention, scarcity or a turnaround time you have not committed to
- [ ] **L13** Example placeholders replaced with real demo designs, **or** you have
      consciously decided to launch with the labelled placeholders. The orange
      "Demo placeholders in use" banner is visible while any remain — it must not
      be live by accident.
- [ ] **L14** Zoom text to 200% — nothing is cut off or unreadable

## O — Order data (`04-digital-fulfillment.md`)

- [ ] **O1** Test mode / Bogus Gateway enabled
- [ ] **O2** Real test purchase completed on a phone
- [ ] **O3** Order shows **all** personalization properties
- [ ] **O4** Ticket screenshot link opens the real file
- [ ] **O5** Order is **Unfulfilled**
- [ ] **O6** **No download email arrived** ← catches Digital Downloads misconfig
- [ ] **O7** Order confirmation email shows the personalization details
- [ ] **O8** You can answer, from the order alone: what to design, and where the
      photos are. If not, the form needs another field.
- [ ] **O9** Paste a deliberately long setlist (fill the field) into the test
      order and confirm it arrives **complete** on the order — Shopify's maximum
      line item property length is undocumented, and truncation would be silent
      (`08-known-limitations.md` item 8)
- [ ] **O10** Test order refunded/cancelled and **test mode turned off**

## C — Legal (`05-legal-review.md`) — blocking

- [ ] **C1** Refund policy written, covering made-to-order digital items
- [ ] **C2** Terms of service written
- [ ] **C3** Privacy policy covers customer-uploaded photographs
- [ ] **C4** Trader identity published (legal name, org number, address, email)
- [ ] **C5** Withdrawal-rights position confirmed with someone qualified (item A)
- [ ] **C6** Returns-notice section's link points at your real refund policy
- [ ] **C7** VAT treatment of digital services confirmed with your accountant

## P — Publish

- [ ] **P1** Both products set to **Active**
- [ ] **P2** Working theme **Published**
- [ ] **P3** L5–L8 re-run on the live storefront (preview ≠ live)
- [ ] **P4** Legacy products confirmed still present (Draft is fine — nothing
      should have been deleted)
- [ ] **P5** Zendrop and other apps confirmed still installed and untouched
- [ ] **P6** One real purchase by you, with a real card, refunded afterwards

---

## Stop-the-launch conditions

Do not go live if any of these is true:

- **L6 fails** — you will lose customer material and not know it.
- **O3 or O8 fails** — you cannot fulfil what you sold.
- **Any of C1–C5 is unresolved** — you are selling without the legal basics.
- **L12 fails** — fabricated social proof is both illegal and unnecessary.

Everything else can be fixed after launch.
