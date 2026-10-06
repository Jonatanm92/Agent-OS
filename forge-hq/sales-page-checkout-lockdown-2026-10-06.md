# Sales page — Checkout Lockdown for WooCommerce — 2026-10-06

Output of the Studio skill **Sales: Direct-response sales page** for the #1 opportunity
in `problem-research-woocommerce-2026-10-06.md`. Draft for owner review — **not ready to
publish** (see blockers below).

## Owner notes (not part of the page)

**Price: $249 one-time** (placeholder, owner decides). Anchors: the official
[Anti-Fraud for WooCommerce](https://woocommerce.com/products/woocommerce-anti-fraud/)
extension is $139/yr and [StoreGuard](https://woocommerce.com/products/storeguard-ip-rate-limiter/)
$29/yr — both are software the merchant configures alone. This is done-for-you, covers
every checkout path, and ships with proof. It sits inside ForgeHQ's 0.5–2 day job shape.

**Blockers before publishing:**

1. **The proof doesn't exist yet.** The page's core promise is a bot replay test. Build
   the read-only audit and the replay harness, then run the full process on your own demo
   store (classic + block checkout, Stripe test mode) at least once. Until then the page
   promises something you can't deliver.
2. Decide and test how every path gets covered. Two hard parts: the classic
   `?wc-ajax=checkout` path (WooCommerce's UI toggle skips it), and bots that rotate IPs
   (340 in one reported attack), which per-IP rate limits alone won't stop. The promise
   needs server-side checks that scripted requests fail on every path, including express
   pay, which can't show a challenge.
3. Confirm every commitment in the list at the bottom.
4. Set up booking and payment, plus simple terms (scope, access, liability) before the
   first booking.

**Truth boundary:** the page claims no past clients, reviews or years of experience. Trust
comes from the test and from paying only after it passes. Facts about WooCommerce and Stripe are
sourced at the end.

---

# Card-testing bots stop at your checkout. You'll watch the test that proves it.

**A one-time, done-for-you lockdown of every checkout path your WooCommerce store
exposes — classic checkout, block checkout and the Store API — verified with a bot
replay test before you pay. $249 flat.**

[Book your Checkout Lockdown →]

---

## The promise

When the lockdown is done:

- **Scripted checkout requests are rejected before they reach your payment gateway** —
  on every checkout path your store has, not just the one you can see.
- **Rejected attempts create no orders.** No more pages of "Failed order" emails.
- **Real customers check out normally**, including express pay buttons if you use them.
- **You get the evidence**: a before/after test report showing both.

If the test on your staging site doesn't pass, you don't pay.

---

## The problem

You open your inbox and it's wall-to-wall "Failed order." Hundreds of them, all for your
cheapest product, with billing details that don't belong to real people.

It isn't a payment bug. Someone is using your checkout to check which stolen cards still
work. One store owner on the WooCommerce support forums
[reported 350+ of these in a few days](https://wordpress.org/support/topic/hundreds-of-credit-card-test-bot-orders-in-the-past-three-days/).
Another merchant [described](https://woocommerce.com/feature-request/native-rate-limiting-and-bot-screening-for-store-api-checkout-endpoints-cart-checkout-order-creation/)
"340 unique IPs in 24 hours … none of them loading any HTML page first."

What it costs you:

- **Fees.** Depending on your gateway, attempts and refunds can cost money — one owner
  wrote the attack was "costing us paypal fees to refund."
- **Your approval rate.** [Stripe warns](https://docs.stripe.com/disputes/prevention/card-testing)
  that a pile of declines tied to your business can make issuers treat *all* your
  payments as riskier — more declines for real customers, even after the bots leave.
- **Your time.** Cleaning orders, reading logs, wondering if it's over.

---

## Why what you've tried hasn't worked

**The CAPTCHA on your checkout page.** Card-testing bots usually never load your page.
They send requests straight to the checkout endpoints behind it. A challenge only helps
if your server *rejects* requests that arrive without it — on every path.

**WooCommerce's built-in rate limiting.** It exists, and it's
[off by default](https://developer.woocommerce.com/2024/12/18/card-testing-attacks-and-the-store-api/).
The settings toggle applies
["only … to the `POST /checkout` and Place Order flow for Checkout block"](https://developer.woocommerce.com/docs/apis/store-api/rate-limiting/).
If your store runs the classic checkout, that toggle isn't protecting it. And behind a
proxy like Cloudflare, an IP-based limit can end up throttling your customers instead.

**Your gateway's fraud filter.** It screens the card *after* the attempt reaches it — the
failed order and the decline already happened. Turned up too far, it blocks real buyers:
one merchant's
[PayPal filters stopped legitimate payments with no override](https://wordpress.org/support/topic/card-testing-bot-posting-to-wc-ajaxcheckout-creates-hundreds-of-failed-orders/),
and they switched providers.

**Your host's "under attack" mode.** Same merchant: it stopped the bot, but was "too
disruptive for real visitors."

**A fraud plugin.** Some are good, and one might be all you need. But you still have to
set it up, and nothing proves it covers every checkout path on *your* store, with *your*
theme, gateway and proxy.

The gap is always the same: **protection on the wrong path, or at the wrong moment, and
nothing that proves it works.**

---

## What changes for you

- **A quiet inbox.** Failed-order emails go back to the occasional real customer whose
  card declined.
- **Your gateway stops seeing bot traffic**, which is what protects your approval rate.
- **No new burden on customers.** Protections run on checkout requests only. If a
  visible challenge is needed anywhere, I'll tell you before adding it.
- **You know exactly what's protected**, and how to check it yourself in two minutes.
- **No surprise subscriptions.** I use WooCommerce's built-in protections and free tools
  where they're enough. If your setup genuinely needs a paid plugin, I'll say so before
  you buy anything — your call.

---

## What's included

1. **Exposure audit.** Which checkout paths your store has open (classic, block, Store
   API, express buttons); what currently protects each; failed-order history for the last
   30 days; your gateway's fraud settings; how your site sees visitor IPs behind a proxy.
2. **Lockdown setup.** Rate limiting and server-side bot checks on every open path, tuned
   so real customers aren't affected. Express pay keeps working.
3. **Bot replay test on your staging site.** Scripted checkout requests on every path,
   before and after — including requests that rotate IP addresses. Pass criteria:
   scripted requests are rejected before any payment call and create zero orders, and a
   real test checkout still succeeds on each checkout type.
4. **Go-live with your approval.** Same changes applied to your live store at a time you
   choose, followed by a short live check that the protections are active and a real
   checkout goes through.
5. **Cleanup.** Bot orders exported (you keep the file) and removed from your order list.
6. **Handover sheet.** One page: what changed, how to undo each change, the 2-minute
   self-check, and what to do if a new wave shows up.
7. **30 days of re-tuning.** If a new wave gets through a covered path within 30 days,
   I re-tune and re-test at no charge.

---

## How it works

1. **Book and share access.** A staging copy of your store and a temporary admin login.
   No staging? Most hosts make one in a click — I'll point you to the button.
2. **Audit (day 1).** You get the exposure report.
3. **Lockdown + replay test on staging.** You get the before/after report.
   **You pay when the test passes.**
4. **Go live** at a time you approve. Handover sheet delivered. You delete my admin
   account.

Turnaround: 3 business days from access.

I use automated tooling for the audit and the replay test, and I review every result
myself before you see it.

---

## Before → after

| Before | After |
|---|---|
| Waves of failed orders for your cheapest product | Bot requests rejected before an order exists |
| Bot attempts reaching your payment gateway | Scripted attempts stopped before the gateway |
| Not sure which checkout path is exposed | Every path listed, protected and tested |
| "Is it over?" | A 2-minute check you can run yourself |
| Advice that blocks real customers | Real checkouts verified on every checkout type |

---

## "But…"

**"I could do this myself."** You could. It takes: finding every checkout path your
store exposes, protecting the ones WooCommerce's toggle skips, getting IP detection right
behind your proxy, and proving it with a test that doesn't touch real cards. If you have
the time and the staging setup, the "Why what you've tried hasn't worked" section above
is your checklist.

**"A plugin is cheaper."** It might be all you need. The difference here is coverage and
proof: every path, tested on your setup, before you pay.

**"You don't have reviews."** True — this is a new service. That's why you pay only after
the test passes on your own staging site, and why you get the raw test report, not my
word for it.

**"I don't want to give anyone access."** Fair. I work on a staging copy first, the live
change happens only with your go-ahead, I never need your payment gateway login or API
keys, and you delete my temporary admin account when we're done.

**"What if the bots change tactics?"** The protections don't depend on recognizing a
particular bot. They limit how often checkout requests get through and reject requests
that can't show they came through your real checkout, on every path. If a new wave gets through a covered path within
30 days, re-tuning is included.

**"$249 for a fix?"** Look at your last attack: count the failed orders, check your
gateway's fee schedule, and add the afternoon you spent cleaning up. That's your
comparison — not mine to guess.

---

## FAQ

**Who is this for?**
WooCommerce stores that are being hit by card testing now, or have been and want it not
to happen again.

**Who is it not for?**
Shopify or other platforms; fully custom headless checkouts (ask first); stores that need
fraud screening for *human* fraudsters using stolen cards — that's a job for your
gateway's fraud tools.

**Does this stop all fraud and chargebacks?**
No. It stops automated card testing through your checkout. Disputes from real people
using stolen cards need your gateway's fraud tools.

**Will my customers have to solve a CAPTCHA?**
Usually not. If a challenge is needed on any path, I'll tell you what customers would
see before adding it.

**Will it slow my site down?**
The protections act on checkout requests. Nothing is added to your product or
category pages.

**Do you need my Stripe or PayPal login?**
No. Never.

**I'm being attacked right now. What do I do?**
Two free steps first: if your checkout page uses the Checkout block, turn on WooCommerce
→ Settings → Advanced → Features → "Rate limiting Checkout block and Store API". Then
tell your payment gateway's support team you're under a card-testing attack. Then book.

**What if the staging test doesn't pass?**
You don't pay.

**What if a WooCommerce update breaks something later?**
The handover sheet includes a 2-minute self-check to run after updates. Within 30 days,
re-tuning is included.

---

## Stop being someone's card checker.

**Checkout Lockdown for WooCommerce — $249, paid only after the test passes.**

[Book your Checkout Lockdown →]

Not sure you're affected? Go to Orders, filter by **Failed**, and look at the last 30
days. Bursts of cheap failed orders mean yes.

---

## Commitments this page makes — confirm each before publishing

| Commitment | Where |
|---|---|
| Price $249 one-time | Hero, CTA |
| Payment only after the staging replay test passes | Promise, How it works, FAQ, CTA |
| Covers every checkout path the store exposes (classic, block, Store API, express buttons) | Hero, What's included |
| Pass criteria: scripted requests (incl. rotating IPs) rejected before any payment call, zero orders, real checkout succeeds on each type | What's included |
| Turnaround 3 business days from access | How it works |
| 30 days of free re-tuning and re-testing | What's included, Objections, FAQ |
| Never asks for gateway login or API keys | Objections, FAQ |
| Live changes only with the merchant's approval | What's included, Objections |
| Tells the merchant before adding a visible challenge or recommending a paid plugin | What changes, FAQ |
| Bot orders exported and removed; merchant keeps the export | What's included |
| Help making a staging copy | How it works |

## Sources

- Rate limiting off by default; Store API used by WooPayments and express buttons —
  [WooCommerce developer blog, Dec 2024](https://developer.woocommerce.com/2024/12/18/card-testing-attacks-and-the-store-api/)
- Toggle scope, settings path and label —
  [WooCommerce developer docs](https://developer.woocommerce.com/docs/apis/store-api/rate-limiting/)
- 340 IPs quote —
  [WooCommerce feature request](https://woocommerce.com/feature-request/native-rate-limiting-and-bot-screening-for-store-api-checkout-endpoints-cart-checkout-order-creation/)
- 350+ test orders; "costing us paypal fees to refund" —
  [WordPress.org](https://wordpress.org/support/topic/hundreds-of-credit-card-test-bot-orders-in-the-past-three-days/)
- Defenses tried, "too disruptive for real visitors", PayPal filters blocking legit
  payments → switched provider —
  [WordPress.org](https://wordpress.org/support/topic/card-testing-bot-posting-to-wc-ajaxcheckout-creates-hundreds-of-failed-orders/)
- Declines affecting future approvals —
  [Stripe: card testing](https://docs.stripe.com/disputes/prevention/card-testing)
- Price anchors — [Anti-Fraud for WooCommerce](https://woocommerce.com/products/woocommerce-anti-fraud/),
  [StoreGuard](https://woocommerce.com/products/storeguard-ip-rate-limiter/)
