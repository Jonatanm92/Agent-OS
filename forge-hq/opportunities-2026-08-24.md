# ForgeHQ buyer-intent queue — 2026-08-24

This is a **buyer-intent queue**, not a list of jobs the owner should claim to already have professional experience doing. Every proposal must remain truthful. Listings can close or change; re-verify before any human-approved bid.

## A — pursue first / proof-fit

### 1. Automate PDF Table Extraction Task

- Source: https://www.freelancer.com/projects/automation/automate-pdf-table-extraction-task
- Current listing shape when captured: ₹750–1,250 INR/hour, remote, open, very low early bid count.
- Buyer wants: batch multi-page PDFs -> structured CSV/Excel, document/page traceability, headless Windows/Linux operation, malformed-table flags, setup docs.
- Explicit acceptance criterion: at least 98% row match in spot checks on supplied test PDFs.
- ForgeHQ fit: **9/10** — bounded input/output contract, deterministic validation, easy isolated test environment, reusable extraction harness.
- Commercial risk: new/low-history client and relatively low hourly budget.
- Owner truth boundary: pitch the implementation plan and test method; do not claim years of PDF-extraction consulting.
- Next internal action: build a synthetic proof harness that measures extraction accuracy and flags uncertain tables. Do not fabricate client sample results.

### 2. Online CSV Cleaning Tool

- Source: https://www.freelancer.com/projects/flask/online-csv-cleaning-tool
- Current listing shape when captured: ₹600–1,500 INR fixed, remote, open.
- Buyer wants: paste/upload CSV, remove duplicates, normalize configurable dates, repair obvious delimiter/quote/header errors, download cleaned CSV, optional before/after preview, no accounts or storage.
- ForgeHQ fit: **9/10 technically / 4/10 commercially** — excellent acceptance-test benchmark, but budget is too small to prioritize as paid work unless the bid friction is negligible.
- Use: internal ForgeHQ benchmark/proof pattern rather than a primary revenue target.

## B — pursue selectively

### 3. Fix Paystack Funding Callback Bug

- Source: https://www.freelancer.com/projects/api-integration/fix-paystack-funding-callback-bug
- Current listing shape when captured: $10–30 USD fixed, remote, open.
- Buyer wants: trace redirect/webhook flow, verify Paystack signatures, fix wallet-credit update, review environment/database logic, document changes.
- ForgeHQ fit: **8/10 technically / 5/10 commercially** — clear bug and acceptance criterion, but payment code raises production/security risk and budget is low.
- Gate: only proceed if a staging/test environment is available and no live credentials must be exposed to the AI workflow.

### 4. Booqable–WordPress Site Integration

- Source: https://www.freelancer.com/projects/api/booqable-wordpress-site-integration
- Current listing shape when captured: $25–50 USD/hour, remote, open.
- Buyer wants: connect an already-configured Booqable account to an existing WordPress site, live availability/pricing, on-site rental cart/checkout, native styling and handover notes.
- ForgeHQ fit: **7/10** — stronger budget and bounded integration, but it expects WordPress/Booqable implementation judgement and real end-to-end customer-system testing.
- Gate: only bid after reproducing the integration path in a sandbox/demo and writing an honest proposal based on that proof, not claimed past Booqable client experience.

## C — reject for now

### WordPress HostAway & Stripe Integration

- Source: https://www.freelancer.com/projects/api-integration/WordPress-HostAway-Stripe-Integration
- Reason: useful buyer signal but 65 bids at capture, multiple production/payment systems, and the listing explicitly asks for solid HostAway/Stripe/WordPress experience. Not the best truthful first-cash target.

### GoHighLevel–Twilio Onboarding

- Source: https://www.freelancer.com/projects/api/automate-gohighlevel-twilio-onboarding
- Reason: attractive budget and only a handful of early bids, but the buyer explicitly requests prior GHL + Twilio proof and at least five attached projects. Do not manufacture that proof.

### WooCommerce Gateway & Cloaking Configuration

- Source: https://www.freelancer.com/projects/woocommerce/WooCommerce-Gateway-Cloaking
- Reason: requests payment-processor cloaking designed to show the processor different content. Reject; ForgeHQ must not help evade platform/payment controls.

## WordPress product validation candidate

### WooCommerce repeat-customer operational context

Evidence captured from WordPress.org:

- `Order Status History for WooCommerce` has 1,000+ active installs and a user review explicitly asking for same-page order/product progression and summary metrics; the reviewer says they pay $50/month to an external service and would gladly pay for the information onsite.
- However, `Customer Profile Page for WooCommerce` already provides total spent, average order value, order count, first-order date and average interval between orders, although it currently has fewer than 10 active installations.
- `PureDevs Customer History for WooCommerce` is actively maintained and already covers broad customer intelligence, predicted next-order date and advanced paid analytics, with 40+ active installations at capture.

Decision: **VALIDATE, DO NOT BUILD YET.** Generic customer metrics are not a sufficient wedge.

The next validation question is narrower: can an order-processing operator get a materially better decision in the existing WooCommerce order screen from a compact `customer trajectory` block — sequence of products/quantities, reorder cadence, change since previous order, unusual cancellation/payment pattern and clear intervention flags — without entering a separate analytics dashboard?

Kill the candidate if a maintained free plugin already does this well or if repeated buyer evidence cannot be found.

## Queue policy

Rank an opportunity higher when:

1. the buyer is current and reachable,
2. acceptance is objectively testable,
3. the work fits in roughly 0.5–2 days,
4. most implementation can happen in an isolated workspace,
5. the owner can bid truthfully based on demonstrated proof rather than invented experience,
6. production/security/support risk is low,
7. the solution creates reusable code or market intelligence.

Never optimize for bid volume. Optimize for **expected real SEK per owner hour**.
