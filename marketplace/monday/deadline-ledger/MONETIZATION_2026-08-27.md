# Deadline Ledger — monetization hypothesis

Date: 2026-08-27

## Principle

Do not add a cosmetic client-side paywall and call it monetization.

A paid Marketplace release must use monday native Pricing & Plans and must enforce the subscription state through a verified entitlement path before paid-only features are shipped.

## Current comparable signal

A narrow monday Date/Timeline utility (`Timeline auto-sync`) has roughly 880 installs and currently offers:

- Free: 30 syncs/month
- Starter: $7/month
- Pro: $15/month
- Unlimited: $24/month

Source: https://apps-for-monday.com/apps/10000737/

Deadline Ledger targets a more managerial/governance-oriented job, so a higher willingness-to-pay is plausible, but v0.1 must earn that premium with real retention and usage.

## Pricing hypothesis — not approved pricing

### v0.1 launch target

Prefer one paid tier plus a frictionless evaluation path rather than three artificial tiers.

**Team — $19/month hypothesis**

- Date + Timeline change ledger
- repeated-change count
- missing-reason exception queue
- free-text reasons + categories
- reason revision/actor/timestamp metadata
- governance score
- read-only audit access

A trial/free evaluation mechanism should be configured through monday native Pricing & Plans rather than a home-grown payment system.

### Future Pro — only after differentiated value exists

**Pro — $49/month hypothesis**

Do not create this tier until at least one of these exists and is validated:

- cross-board governance rollup
- Guard mode / immediate reason-required exception workflow
- scheduled governance digest
- export/report specifically for deadline-change control
- policy thresholds / escalation rules

Do not charge $49 for the current single-board audit view alone.

## Runtime entitlement security gate

monday's session token from `monday-sdk-js` is cryptographically signed with the app Client Secret and can be verified on a backend.

However, do not implement a paid gate until the complete server-side path for retrieving/verifying the account's native monday app subscription is demonstrated with the production authentication model.

Explicitly reject:

- trusting only `context.subscription` as a security boundary
- putting the app Client Secret in browser code
- external Stripe billing for a new Marketplace app
- relying on hidden UI buttons as subscription enforcement

## Hosting implication

The current v0.1 remains primarily static:

`monday Board View -> static frontend -> monday SDK/API -> monday global storage`

If a serverless entitlement endpoint is required for native subscription enforcement, it should do only authentication/entitlement work and should not become a shadow database for customer board data.

## Vendor/owner gates

These remain manual because they require real legal/payment information:

- choose and submit the Pricing & Plans version in monday Developer Center
- vendor registration
- payout setup
- legal entity/contact details

Do not fabricate or infer any of those values in code or submission materials.
