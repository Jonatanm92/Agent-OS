# ForgeHQ problem research — WooCommerce store operators — 2026-10-06

Output of the Studio skill **Research: Problem discovery** run against the audience
behind the active `wordpress-micro-products` lane. This is buyer-pain evidence, not a
build authorization: the lane's hard gates in `tracks.json` still apply.

**Method and limits.** Sources are WordPress.org support threads and plugin listings,
WooCommerce developer docs and feature requests, and vendor/community pages, fetched on
2026-10-06. Reddit refused this crawler, so no Reddit evidence is included — re-run the
searches at the end before any build or bid. Relative forum dates ("1 year ago") are
converted to approximate months as of the fetch date. Every "own words" line is marked
**[CITED]** (verbatim, with link) or **[PARAPHRASE — verify]**.

## Market finding that changes the plan

Most visible WooCommerce operational pains already have either a **vendor fix in
progress** or a **cluster of tiny new free/freemium "doctor" plugins** on WordPress.org
— e.g. Velocity Guard (20+ installs), Repeat Customer for WooCommerce (10+), StallRadar
(<10), Checkout Pilot (<10). Building a small plugin is no longer the bottleneck;
**distribution and trust are**. That favors selling a verified *outcome* (Paid Fixes
lane) and using a small free tool as the delivery accelerator and proof, over shipping
another micro-plugin and hoping for installs.

**Current lane candidate `woo-repeat-customer-context`:** a maintained free plugin,
[Repeat Customer for WooCommerce](https://wordpress.org/plugins/repeat-customer-for-woocommerce/)
(updated ~Apr 2026, HPOS-compatible), already puts order count, first/last order, AOV,
average days between orders, refunds, LTV, guest matching by email/phone/postcode and a
visual order timeline in the order sidebar. It has 10+ installs — a weak demand signal for
the whole job. The remaining wedge (product progression, intervention flags) has no buyer
evidence in this pass. Recommendation: treat the kill condition as met and park it unless
new buyer evidence appears. (Owner decision — `tracks.json` left unchanged.)

---

## The 10 problems

### 1. Card-testing bots flood checkout with failed orders — urgency 9

- **Own words [CITED]:** "The bot sends repeated POST requests directly to:
  `/wp-admin/admin-ajax.php?wc-ajax=checkout`" → "hundreds of failed order emails" —
  [WordPress.org, ~Oct 2025](https://wordpress.org/support/topic/card-testing-bot-posting-to-wc-ajaxcheckout-creates-hundreds-of-failed-orders/).
  "Our WooCommerce site received 350+ credit card 'test' orders that all failed in the
  past few days." — [WordPress.org, ~Dec 2024](https://wordpress.org/support/topic/hundreds-of-credit-card-test-bot-orders-in-the-past-three-days/).
  "340 unique IPs in 24 hours hitting /wp-json/wc/store/\* directly, none of them loading
  any HTML page first" — [WooCommerce feature request, Jun 2026, still open](https://woocommerce.com/feature-request/native-rate-limiting-and-bot-screening-for-store-api-checkout-endpoints-cart-checkout-order-creation/).
- **Current solutions:** Cloudflare Turnstile/reCAPTCHA on checkout; WooCommerce's
  built-in Store API rate limiting; gateway fraud tools (Stripe Radar, PayPal filters);
  plugins such as [StoreGuard](https://woocommerce.com/products/storeguard-ip-rate-limiter/)
  ($29/yr) and [Velocity Guard](https://wordpress.org/plugins/velocity-guard-for-woocommerce/).
- **Why they fall short:** the forum merchant tried a honeypot, reCAPTCHA, Wordfence,
  PayPal fraud filters and host "Under Attack" mode ("too disruptive for real visitors")
  and finally switched gateways. WooCommerce's native rate limiting is
  [disabled by default](https://developer.woocommerce.com/2024/12/18/card-testing-attacks-and-the-store-api/),
  and its settings toggle applies
  ["only … to the `POST /checkout` and Place Order flow for Checkout block"](https://developer.woocommerce.com/docs/apis/store-api/rate-limiting/)
  — not the classic `?wc-ajax=checkout` path seen in the attack above. The Store API
  can't simply be disabled because WooPayments and express-pay buttons use it. The open
  feature request says fraud plugins screen *after* the payment attempt and WAFs
  challenge real customers. Consequences beyond fees: Stripe warns that card testing
  [raises decline rates for legitimate payments](https://docs.stripe.com/disputes/prevention/card-testing).
- **Simple product:** a read-only *Checkout Attack Audit* that checks both checkout paths
  and reports exposure, plus a fixed-scope lockdown service verified by a replay test.

### 2. Updates silently break checkout — urgency 9

- **Own words [CITED]:** "Since upgrading (currently on 10.5.3), our checkout page is
  throwing a PHP Fatal Error and failing to load the payment section entirely." —
  [WordPress.org, ~Apr 2026](https://wordpress.org/support/topic/checkout-page-critical-error-when-updating-the-plugin-to-10-4-1/).
  Review titled **"Never update"**: "The 2.1.0 update completely broke my WordPress
  installation with fatal errors." — [WordPress.org, ~Feb 2025](https://wordpress.org/support/topic/never-update/).
  After WooCommerce 8.3, totals and shipping stopped updating at checkout —
  [WordPress.org](https://wordpress.org/support/topic/checkout-broke-with-8-3-0/).
- **Current solutions:** staging + manual conflict tests; managed-host update tooling;
  synthetic checkout monitors — [CheckView](https://wordpress.org/plugins/checkview/)
  (1,000+ installs, paid SaaS account required), [ShopMonitor](https://shopmonitor.io/),
  [Checkout Pilot](https://wordpress.org/plugins/checkout-pilot-for-woocommerce/) (free, <10 installs).
- **Why they fall short:** small stores rarely run staging; the store looks fine while
  "Place Order" fails; the established monitor is a paid external SaaS.
- **Simple product:** post-update checkout smoke test (test-mode order through both
  checkout paths after each plugin/core update) with alert + rollback pointer.

### 3. Subscription renewals fail silently — urgency 9 (subscription stores)

- **Own words [CITED]:** "Renewal order is created successfully. Renewal order remains in
  'Pending Payment' status." — [WordPress.org, ~Jun 2026](https://wordpress.org/support/topic/woocommerce-subscription-renewal-order-created-but-payment-not-captured/).
- **Current solutions:** WooCommerce Subscriptions retry system; the new
  [Subscriptions Health Check](https://developer.woocommerce.com/2026/04/30/subscriptions-health-check/)
  (Apr 2026, read-only: manual-renewal-but-has-token, missing renewals);
  [Token Expiry Notifier](https://woocommerce.com/products/saai-ten4wc/).
- **Why they fall short:** causes vary by gateway (token saved without off-session
  permission, gateway ID change flips subscriptions to manual renewal, cron stalls), and
  the Health Check covers two categories only.
- **Simple product:** renewal-risk monitor with alerts. **Roadmap risk:** WooCommerce says
  in-context fixes for the Health Check are "already in progress" — competing with the
  vendor here is a poor bet.

### 4. Classic checkout customizations vanish on block checkout — urgency 7

- **Own words [CITED]:** "It is working well when I use the shortcode checkout. But when
  I use the woocommerce blocks checkout, the field is missing." —
  [WordPress.org, Jan 2024](https://wordpress.org/support/topic/custom-fields-in-woocommerce-checkout-block-not-working/).
- **Current solutions:** stay on the classic shortcode; block-native field editors
  ([Fieldwright](https://wordpress.org/plugins/fieldwright-checkout-fields/),
  [Fieldnest](https://wordpress.org/plugins/fieldnest/)).
- **Why they fall short:** nothing tells a merchant *which* of their existing classic
  hooks/fields/plugins will disappear before they switch; the move is all-or-nothing.
- **Simple product:** block-checkout migration audit — scan classic checkout hooks and
  field filters, list what won't render, map fields to the Additional Checkout Fields API.

### 5. Order emails don't arrive — urgency 8

- **Own words [CITED]:** "I cannot get woocommerce to send emails to my customer or my
  admin." … fixed by "I changed the SMTP setting to TLS" —
  [WordPress.org, ~Dec 2023](https://wordpress.org/support/topic/woocommerce-not-sending-emails-4/).
- **Current solutions:** SMTP plugins, mail logging plugins, host mail.
- **Why they fall short:** setup (SPF/DKIM/DMARC, ports, TLS) is the hard part, not the
  plugin; failures are invisible until customers complain. Market is crowded with
  strong free plugins — low opportunity.
- **Simple product:** deliverability checker for order emails (DNS + test send + alert).

### 6. Background-job backlog slows the admin — urgency 6

- **Own words [CITED]:** "Action Scheduler: 183839 past-due actions found" after a theme
  update installed a wishlist plugin — [WordPress.org, Mar 2023](https://wordpress.org/support/topic/action-scheduler-183839-past-due-actions-found/)
  (later posters say it persisted). "It takes about 15 seconds when I click from one
  area to another" — [WordPress.org](https://wordpress.org/support/topic/schedule-actions-slowing-woo-by-half-on-backend/page/2/).
- **Current solutions:** manual cleanup under Status → Scheduled Actions; real server
  cron; cleaners ([Easy Actions Scheduler Cleaner](https://wordpress.org/plugins/easy-actions-scheduler-cleaner-ayudawp/));
  [StallRadar](https://wordpress.org/plugins/stallradar-past-due-monitor/) ($39/yr Pro).
- **Why they fall short:** cleaners delete completed rows but don't fix stuck ones;
  attributing a runaway hook to its plugin is manual.
- **Simple product:** backlog doctor (group by hook → owning plugin, growth rate,
  cron health). Already being built by others; low willingness to pay.

### 7. Shipping zones charge the wrong rate — urgency 7

- **Own words [CITED]:** "it doesn't matter which product is put into the basket the
  shipping cost is always package." — [WordPress.org, ~Dec 2023](https://wordpress.org/support/topic/wrong-shipping-assigned-at-checkout/)
  (cause: zone priority order).
- **Current solutions:** WooCommerce shipping debug mode; docs;
  [Shipping Doctor for WooCommerce](https://wordpress.org/plugins/shipping-doctor-for-woocommerce/).
- **Why they fall short:** zone order, catch-all zones and missing product weights fail
  silently; the merchant learns from undercharged orders.
- **Simple product:** shipping config linter + test-address matrix. Already exists.

### 8. Product CSV imports stall or mangle variations — urgency 5

- **Own words [CITED]:** "It's been stuck on the animated status bar going on 3 hours,
  and I'm afraid to close out the tab or edit anything." —
  [WordPress.org, ~Nov 2023](https://wordpress.org/support/topic/csv-import-suite-stuck-for-3-hours-merging-product-variations/).
- **Current solutions:** core importer, CSV Import Suite, raise PHP limits, split files.
- **Why they fall short:** no progress truth, no pre-flight validation of variation rows.
- **Simple product:** pre-flight CSV validator + resumable importer. Fits the existing
  `proofs/pdf-table-extractor` data-transformation pattern but low urgency.

### 9. Multichannel inventory drifts and oversells — urgency 7

- **Own words [PARAPHRASE — verify]:** sync apps work at first, then stop syncing, and
  stock numbers change unexpectedly. Seen only in search summaries of sync-vendor pages,
  not in a merchant post — weakest evidence in this list.
- **Current solutions:** paid sync SaaS (Trunk, LitCommerce, Platy, QuickSync).
- **Why they fall short:** recurring cost and opaque failures. Integration-heavy,
  external APIs, high support burden — poor ForgeHQ fit.
- **Simple product:** drift detector comparing channel stock snapshots.

### 10. Paid extension renewals add up — urgency 5

- **Own words [CITED]:** "Slipping this pricing change in was not an honest move." —
  developer reaction to WooCommerce.com dropping the 50% renewal discount
  ([WP Tavern, 2017](https://wptavern.com/woocommerce-drops-50-renewal-discount-on-subscriptions)).
  [PARAPHRASE — verify] 2026 pricing roundups list flagship extensions at roughly
  $199–$279/yr each.
- **Current solutions:** cheaper third-party alternatives, fewer extensions.
- **Why they fall short:** lock-in on Subscriptions/Bookings data.
- **Simple product:** extension cost/usage auditor. Old evidence; weak today.

---

## Top 3 opportunities

Scored on urgency, money at risk, gap in *trusted* solutions, ForgeHQ fit (bounded,
objectively testable, no production access needed to build), and vendor-roadmap risk.

| Rank | Opportunity | Urgency | Money at risk | Gap | ForgeHQ fit | Roadmap risk |
|---|---|---|---|---|---|---|
| **1** | Card-testing lockdown (audit + verified fix) | 9 | Direct: fees, decline rate, gateway account | Native protection is off by default and the toggle skips classic checkout | High — replay test is objective | Medium: feature request open, 2 votes |
| 2 | Post-update checkout guard | 9 | Direct: lost sales | Established option is paid SaaS | Medium — theme/builder variance raises support load | Low |
| 3 | Block-checkout migration audit | 7 | Indirect | No pre-switch audit found | High — static scan, fixture-testable | Medium: shrinks as plugins migrate |

Excluded despite urgency: **subscription renewals** (problem 3) — WooCommerce is
actively building the fix.

**Why #1 wins:** it is the only pain where merchants lose money *during* the problem, the
native fix demonstrably leaves a gap (off by default; UI toggle covers block checkout
only, while observed attacks hit `?wc-ajax=checkout`), merchants already pay for partial
fixes, and success is objectively verifiable before delivery. It also bundles naturally
with #2 into one "checkout reliability" offer later.

## #1 — offer shape and frozen draft acceptance test

**Offer (Paid Fixes lane):** fixed-scope *Checkout lockdown* — audit, configuration across
both checkout paths, cleanup of bot orders, and before/after evidence. Pitch the test
method; claim no prior card-fraud consulting experience. Price set by owner.

**Free tool (delivery accelerator + proof):** read-only *Checkout Attack Audit* reporting:
WooCommerce version and whether Store API checkout rate limiting is on; which checkout
paths are live (classic `wc-ajax=checkout`, Store API `/checkout`, express buttons);
whether a bot challenge covers each path; failed/pending order velocity and clustering
over 30 days; active gateways and links to their fraud settings. Output: exposure score +
ordered fix list. No writes, no external calls.

**Acceptance test (run only against a staging site the owner controls, gateway in test
mode, no real card data):**

1. Baseline on stock WooCommerce: scripted rapid POSTs to `?wc-ajax=checkout` and
   `/wp-json/wc/store/v1/checkout` from rotating client identities create failed orders
   and reach the gateway — the audit reports the exposure.
2. After lockdown: past the configured threshold, ≥99% of scripted requests on **both**
   paths are rejected before any gateway call (zero new payment attempts in gateway
   test logs) and create **zero** orders.
3. A real browser checkout succeeds on first attempt with a test card on classic and
   block checkout, and via one express-pay button if enabled.
4. Rejected attempts are logged with path, timestamp and reason.
5. The audit re-run reports no exposed checkout path.

## Searches to run before any build or bid

- Reddit: `site:reddit.com/r/woocommerce card testing`, `… fake orders stripe`,
  `… wc-ajax checkout bots`
- Reddit: `site:reddit.com/r/woocommerce checkout broke after update`
- WordPress.org: `site:wordpress.org/support "card testing" woocommerce` (count threads
  from the last 6 months)
- WooCommerce feature requests: vote count and status on the Store API bot-screening
  request
- Freelancer/Upwork/Codeable: "woocommerce card testing", "fake orders" — live buyer
  listings and budgets (this is the Paid Fixes buyer-evidence gate)
