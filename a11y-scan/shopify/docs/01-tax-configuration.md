# 1. Tax configuration — observed state and owner action required

## What was checked

This session has no Shopify Admin access of any kind — no CLI, no API
credentials, no MCP connector. Confirmed by checking for Shopify environment
variables, a Shopify CLI installation, and MCP server configuration; none were
present. See `../../storefront/docs/01-store-audit.md` for the exhaustive audit
from the earlier work on this same store, which reached the same conclusion.

**Consequence: the store's actual tax configuration could not be inspected,
and none of the following is verified against your store. Every price shown in
the theme files is a *display string* the owner must confirm is correct before
publishing.**

## What was NOT done, on instruction

- Tax registrations were not altered.
- No tax setting was changed, blindly or otherwise.
- No assumption about VAT-registration status was baked into the checkout logic.

## Why VAT registration status changes the answer

Whether the including-VAT price line is even correct depends on a fact only
the store owner knows:

| Seller status | What "moms" (VAT) means for this sale |
|---|---|
| VAT-registered in Sweden | Must charge 25% Swedish VAT on a B2C sale to a Swedish customer. The "inkl. moms" figure (3 112,50 kr) is the actual amount charged. |
| **Not** VAT-registered (e.g. under the small-business threshold) | Cannot charge VAT at all. Charging it while unregistered is a compliance problem in the other direction. The price is just 2 490 kr — no VAT line, no "inkl. moms" figure. |
| VAT-registered, selling B2B to an EU business with a valid VAT number | Reverse charge may apply — the buyer accounts for VAT in their own country, and the seller charges no VAT on the invoice. |
| VAT-registered, selling to a non-EU business | Different rules again, generally no Swedish VAT. |

**This is exactly why the brief says not to assume registration status, and why
the theme ships with the including-VAT line switchable rather than fixed.**
`shopify/theme/sections/ars-hero.liquid` and `ars-intake.liquid` both expose a
`show_inc_vat` checkbox in the theme editor, **defaulting to on** (matching the
requested launch price display) but meant to be turned off in one click if the
owner is not VAT-registered.

## Owner action required before publishing checkout

1. **Confirm VAT-registration status** with your accountant or Skatteverket if
   you do not already know it with certainty.
2. In Shopify Admin: **Settings → Taxes and duties**. Check:
   - Is a tax region configured for Sweden?
   - Is a Swedish VAT registration number entered?
   - Is the store set to charge tax on digital/service products, and is this
     product going to be tagged/categorised as such?
3. Confirm what customer type you are actually selling to (B2C consumer, B2B
   Swedish business, B2B EU business, B2B non-EU business) — the product may
   need different presentment depending on who is buying. At minimum decide
   whether this is a B2C storefront sale or requires a VAT-number capture step
   for B2B reverse charge.
4. Set `show_inc_vat` accordingly:
   - **VAT-registered, selling to Swedish consumers/businesses without reverse
     charge** → leave `show_inc_vat` on, values as specified in the brief
     (2 490 kr exkl. moms / 3 112,50 kr inkl. moms).
   - **Not VAT-registered, or reverse charge applies** → turn `show_inc_vat`
     off in the theme editor for both `ars-hero` and `ars-intake` sections, and
     update `price_ex_vat` to whatever the correct single price string is.
5. Verify Shopify's own price display at checkout matches what the theme says.
   Shopify calculates the actual tax charged from its tax settings, not from
   these display strings — **the theme's price text is informational copy, not
   a tax calculation.** If Admin's tax settings disagree with the copy, the
   customer sees two different numbers and the checkout looks broken.

## What this build does NOT do

- It does not calculate VAT. Shopify's checkout does that from Admin tax
  settings, which are unverified here.
- It does not determine whether this store must register for VAT. That is an
  accounting question this delivery explicitly declines to answer — see
  "Do not give tax or legal advice" in the brief.
- It does not collect a VAT number from B2B buyers. If reverse charge turns
  out to apply, a VAT-number field would need to be added to intake and
  Shopify's B2B/company-account features would need to be evaluated — not done
  here, flagged for a future iteration only if it turns out to be needed.

**This item is blocking.** Do not publish the product live until the owner has
completed the steps above.
