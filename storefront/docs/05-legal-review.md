# 5. Legal and compliance — items requiring owner review

**This is not legal advice, and it was not written by a lawyer.** It is a list of
the places where this specific product — a made-to-order *digital* personalized
item, sold from Sweden, using customer-supplied photographs — has obligations
that a normal physical product does not. Each item says what to check and why it
is on the list. None of them is decided here.

Nothing in this delivery silently claims compliance. The one place the storefront
makes a legal-ish statement — the returns notice section — is marked as draft copy
in its own source file.

---

## A. The one that is genuinely tricky: withdrawal rights

Under the EU Consumer Rights Directive as implemented in Swedish law
(distansavtalslagen), a consumer normally has 14 days to withdraw from a distance
contract. Two separate exemptions are potentially relevant here, and **this
product may sit in both at once**, which is exactly why it needs a real answer:

1. **Goods made to the consumer's specifications / clearly personalized.**
2. **Digital content not supplied on a tangible medium**, where supply has begun
   with the consumer's **prior express consent** *and* their **acknowledgement
   that they thereby lose the right of withdrawal**.

**What to get answered by someone qualified:**

- Which exemption actually applies to a made-to-order digital design service?
- If it is the digital-content one: consent and acknowledgement must be obtained
  **before performance begins**, and the trader must provide confirmation of it.
  Is a checkbox at add-to-cart sufficient, or must it be at checkout?
- When does "performance begin" — at payment, or when you start designing?
- Does the "one round of revisions" on Full Issue change the analysis?

**What the storefront does today:** the personalizer has a required
acknowledgement checkbox recording
`"Confirmed — rights to material, and made-to-order item"` as a line item property
on the order. That is a real, timestamped, per-order record.

**What it does not do, and you should not assume it does:** it is *at add-to-cart,
not at checkout*, and its wording has not been reviewed. If your advisor says the
acknowledgement must be at the checkout step, Shopify's checkout is not editable
on non-Plus plans without a Checkout UI extension — that is a real constraint to
raise with them rather than discover later. Adjust the wording in
Theme editor → *CMI Personalizer* → *Acknowledgement checkbox label*.

## B. Policy pages that must exist before selling

Settings → Policies. Shopify generates templates; they need editing for a
made-to-order digital product because the defaults assume physical returns.

- [ ] **Refund policy** — must address made-to-order/personalized items and the
      withdrawal position from (A). The returns section on the product page links
      to `/policies/refund-policy`; that link is dead until this exists.
- [ ] **Terms of service** — delivery expectations, the revision policy, what
      happens if supplied material is unusable, and your licence to use the
      customer's photos *for the sole purpose of producing their issue*.
- [ ] **Privacy policy** — must cover uploaded photographs (see D).
- [ ] **Contact information** — Swedish law requires an identifiable trader:
      legal name, organisation number, geographic address, email.

## C. VAT on digital services

- Digital services to EU consumers are generally taxed in the **customer's**
  country, not yours, typically via the **OSS** scheme.
- There is a threshold below which a small trader may charge domestic VAT
  instead. **Confirm the current threshold and whether you are under it with
  Skatteverket or your accountant** — do not take a number from here.
- Shopify: Settings → Taxes and duties. Digital goods are configured separately
  from physical ones. Verify that both products are treated as digital.
- **Whether you are VAT-registered at all** changes this entirely. If you are not,
  say so to your accountant before the first sale, not after.

## D. Customer photographs — GDPR and copyright

You receive personal data (photographs of identifiable people, often in the
background) and third-party copyright material.

- [ ] Privacy policy states what you do with uploaded photos, how long you keep
      them, and that they are not published without permission.
- [ ] Have a **deletion practice** — e.g. delete source material N months after
      delivery — and state it.
- [ ] The customer warrants they have the right to supply the material (the
      acknowledgement checkbox does this, and the trust section repeats it).
      **A customer's warranty does not transfer their liability to you** —
      ask your advisor how much protection it actually gives.
- [ ] Google Drive / Dropbox share links mean customer photos sit on third-party
      infrastructure. Mention it in the privacy policy.
- [ ] Note that photographs taken *by the customer* are theirs; photographs taken
      by a professional or press photographer at the show are **not**, even if
      the customer has a copy.

## E. Intellectual property — the highest-risk area commercially

The product is a fan keepsake referencing real artists, venues and events.

**Already handled in the storefront:**
- Trust & Rights section states plainly it is not official merchandise and not
  affiliated, licensed or endorsed.
- An FAQ answer says the same in the customer's own words.
- The hero footnote repeats it.
- The souvenir-ticket page is described as decorative and not valid for admission.
- The examples section's theme-editor help text forbids uploading artist
  photography, tour artwork, logos, album covers or ticketing-company branding.

**Still on you, and no code can enforce it:**
- [ ] Do not reproduce artist logos, album covers, tour graphics, or the visual
      trade dress of Ticketmaster/venues in the issues you actually design.
- [ ] Using an artist's **name** to describe factual content ("Ghost, Avicii
      Arena, 14 November 2025") is ordinary descriptive use. Using their **logo
      or artwork** is not. Keep that line.
- [ ] Do not use any artist name in ads, product titles, or SEO metadata in a way
      that implies endorsement.
- [ ] Any souvenir-ticket design must not imitate a real ticket closely enough to
      be mistaken for one.

## F. Consumer-facing claims

- [ ] **No turnaround time is stated anywhere on the site** — deliberately. Copy
      says "the current production estimate is shown before ordering". Once you
      commit to a number, it becomes a promise: put it in the theme editor
      (*CMI Personalizer* → *Text under button*) and honour it.
- [ ] **No reviews, ratings, customer counts, press mentions, scarcity or urgency
      appear anywhere.** There are no customers yet. Adding any of these before
      they are true is straightforwardly illegal under EU unfair-commercial-
      practices rules, and it is the easiest way to make this store a problem.
- [ ] The example images are placeholders and are labelled as placeholders. When
      you replace them with real demo designs, the rights note must stay accurate.

## G. Cookies and tracking

- [ ] If you add any analytics beyond Shopify's own (see `06-analytics.md`),
      consent handling applies. Shopify has a built-in cookie banner:
      Settings → Customer privacy.
- [ ] The storefront code added here sets **no cookies** and loads **no
      third-party scripts**.

---

## Summary for the owner

Blocking before the first sale: **A** (get an answer), **B** (policy pages must
exist), **F** (already true — keep it true).

Needs an answer soon after: **C** (VAT), **D** (photo retention).

Ongoing discipline, not a task: **E**.
