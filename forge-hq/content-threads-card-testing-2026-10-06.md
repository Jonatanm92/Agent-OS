# Threads content — card testing on WooCommerce — 2026-10-06

Output of the Studio skill **Content: 30 Threads post ideas**, run on the #1 opportunity
from `problem-research-woocommerce-2026-10-06.md`.

- **Product:** free read-only *Checkout Attack Audit* + fixed-scope *Checkout lockdown*
  (not built yet — see "Product mentions" below before linking anything)
- **Audience:** WooCommerce store owners
- **Problem:** card-testing bots hitting checkout

Every post is under Threads' 500-character limit and stands alone. Facts come only from
the sourced research (sources at the end). Nothing here claims experience the owner
doesn't have. Story posts retell public cases. The one personal story is marked
**[OWNER STORY — post only if true]**.

**Why post at all (ForgeHQ angle):** replies, DMs and "how do I check mine?" questions
are buyer evidence. Log them — they're what the Paid Fixes gate asks for before anything
is built or pitched.

---

## Educational (7)

**E1 — the setting that's off by default**
```text
WooCommerce has a built-in setting that slows card-testing bots. It's off by default.

WooCommerce → Settings → Advanced → Features → "Rate limiting Checkout block and Store API"

Turned on, it allows 3 checkout attempts per 60 seconds from the same source.

The catch: it covers the Checkout block. If your checkout page still uses the classic shortcode, that toggle isn't protecting it.
```

**E2 — the 5-minute check**
```text
Are you being card tested? 5-minute check:

1. Orders → filter by Failed
2. Read the timestamps. Real customers fail once or twice. Bots fail in bursts.
3. Read the totals. Testers favor your cheapest item.
4. Read the billing details. Do they look like real people?

A burst of cheap failed orders isn't a payment bug. Someone is using your store to check stolen cards.
```

**E3 — which checkout are you running**
```text
Quick question that matters more than any security plugin: which checkout are you actually running?

Open your Checkout page in the editor.
• A [woocommerce_checkout] shortcode → classic checkout
• A Checkout block → block checkout

They take orders through different endpoints. A protection built for one can leave the other wide open.
```

**E4 — why you can't just switch off the Store API**
```text
Someone will tell you to disable the WooCommerce Store API so bots can't use it.

Don't. WooPayments and express pay buttons use it too. Switch it off and real customers lose those checkout options.

The goal isn't closing the door. It's limiting how fast anyone can knock — and checking who's knocking before the payment call.
```

**E5 — export before you delete**
```text
Before you bulk-delete 300 bot orders: export them.

Timestamps, IP addresses, emails, amounts. That's your only map of the attack — how fast it came, what it rotated, what it went after.

It's exactly what you tune your blocking against. Delete it and you're guessing.
```

**E6 — the cost that outlasts the attack**
```text
Card testing costs more than fees.

Stripe's own docs warn that a pile of declines tied to your business can make card issuers see all your transactions as riskier — more declines for real customers, even after the attack stops.

The bots leave. The hit to your approval rate doesn't leave with them.
```

**E7 — the proxy trap**
```text
Behind Cloudflare or another proxy? Check one thing before you turn on IP-based rate limits:

What IP does WordPress actually see for each visitor?

If it's the proxy's IP, every customer looks like the same visitor. Your shiny new limit then throttles real buyers, not bots.
```

## Relatable (6)

**R1**
```text
3am inbox:
"Failed order #4812"
"Failed order #4813"
"Failed order #4814"
…

You didn't get hacked. Your checkout got hired — by someone checking which stolen cards still work.
```

**R2**
```text
Nobody opens a WooCommerce store to become a part-time fraud analyst.

Yet here you are at midnight, reading gateway logs, trying to work out why "someone" keeps buying your cheapest item, failing, and trying again with a different card.
```

**R3**
```text
The worst part of card testing isn't the failed orders. It's never knowing if it's over.

Quiet for a couple of days. Then another wave overnight.

If you've been through it: what finally made it stop for you?
```

**R4**
```text
When the advice is "just add a CAPTCHA" and you added one on day one.
```

**R5**
```text
Me, after cleaning out 300 bot orders: "ok, sorted."

The bots, next morning, from a few hundred brand-new IP addresses:
```

**R6**
```text
Things store owners try when card-testing bots show up:

☑ CAPTCHA
☑ Honeypot field
☑ Security plugin
☑ Gateway fraud filter
☑ Host "under attack" mode

Feels like doing everything right. The bots don't care how many boxes you tick — only whether the request they send gets stopped before it reaches the payment call.
```

## Controversial (6)

**C1**
```text
Hot take: "did you add a CAPTCHA?" is the wrong question.

The right one: does your server reject checkout requests that arrive without a solved challenge — on every checkout path?

A widget that only appears on the page does nothing against bots that never load the page.
```

**C2**
```text
"Just turn on your host's Under Attack mode" is great advice if you don't sell anything.

A WooCommerce merchant who tried it said it did stop the bot — but the interstitial was "too disruptive for real visitors."

A fix that blocks your customers is just a slower way to lose sales.
```

**C3**
```text
Your payment gateway's fraud filter is not your checkout's bouncer.

By the time it screens the card, the attempt already happened: the failed order exists, the decline is on your record, and there may be a fee.

Screening has to happen before the payment call. Not after.
```

**C4**
```text
Want checkout bot protection built into WooCommerce core? A feature request for exactly that is open: rate limits and bot checks on the checkout API, before the payment call.

As of October 2026 it had 2 votes.

The support forums are full of card-testing threads. Two votes. If this has hit you, go vote. Silence reads as "not a problem."
```

**C5**
```text
Don't turn off WooCommerce "Failed order" emails to stop the bot spam.

That's pulling the battery out of the smoke alarm because it's loud.

Filter them into a folder. But the moment they spike, you want to know.
```

**C6**
```text
"Off by default" is a decision, not a neutral setting.

WooCommerce ships checkout rate limiting disabled. There are fair reasons — proxies, shared IPs, false positives.

But a store that never finds that toggle is running with the door propped open. You can't flip a switch you've never heard of.
```

## Story-based (6)

**S1 — same attack, different bill**
```text
A WooCommerce store owner posted that their site took 350+ credit card "test" orders in a few days. All failed.

Failed sounds harmless. In the same thread, another owner said the fraudulent orders were going through and "costing us paypal fees to refund."

Same attack. One store got noise. The other got a bill.
```

**S2 — the gauntlet**
```text
One store owner's card-testing week, from the WooCommerce forums:

Honeypot → bypassed.
reCAPTCHA, Wordfence → didn't stop it.
Host "under attack" mode → stopped it, but too disruptive for real visitors.

The page-level defenses never saw the bot. It was posting straight to the checkout endpoint behind the page.
```

**S3 — the overcorrection**
```text
Same store, part two.

PayPal's automated fraud filters kicked in — and blocked legitimate payments too. No override for the account holder.

The owner ended up switching payment providers.

Card testing doesn't only cost you the bot traffic. Sometimes the cure blocks your real customers.
```

**S4 — 340 IPs, zero page views**
```text
"340 unique IPs in 24 hours hitting /wp-json/wc/store/* directly, none of them loading any HTML page first."

That's how a merchant described their attack in a WooCommerce feature request this June.

If your bot defense lives on the page, those visitors never saw it.
```

**S5 — the vendor said it first**
```text
In December 2024, WooCommerce's own developer blog wrote about card testing through the Store API.

Its advice: rate limiting and CAPTCHA.
Its admission: the Store API "ships with rate limiting built-in, but it's disabled by default."

Almost two years later, the docs still say disabled by default.
```

**S6 — [OWNER STORY — post only if true]**
```text
I almost built another WooCommerce plugin nobody asked for.

Then I read the support forums. The same story kept repeating: hundreds of failed orders, a CAPTCHA that didn't help, a gateway that overcorrected.

So I'm building a free, read-only check that shows which checkout paths on your store bots can hit — and whether anything stops them.

Want it when it's ready? Reply "audit."
```

## Curiosity-driven (5)

**Q1**
```text
There's a WooCommerce setting made for card-testing bots. It's off by default — and it only covers one of the two checkouts your store might be running.

Where it is: WooCommerce → Settings → Advanced → Features.
What it skips: the classic shortcode checkout.

Know which one you're on?
```

**Q2**
```text
Your store has more than one door that takes orders.

The checkout page is the one you see. Behind it are endpoints — the classic AJAX checkout and the Store API — and bots go straight to those.

Worth knowing which of your doors are open before someone else finds out for you.
```

**Q3**
```text
Why do card testers love your cheapest product?

A small charge is the quietest way to check whether a stolen card works.

If your $2 item suddenly "sells" 80 times and fails 79, that's not demand.
```

**Q4**
```text
One number tells you more about a card-testing attack than any plugin dashboard: failed orders per hour.

A healthy store: close to zero, almost always.
Under attack: it spikes — sometimes hundreds over a few days.

Check your last 30 days. If you've never looked, you may already have been hit.
```

**Q5**
```text
If 300 bot orders hit your checkout tonight, how would you find out?

Your gateway emailing you? A customer? Your inbox over morning coffee?

If the honest answer is "I'd notice eventually," that gap is the real problem — not the bots.
```

---

## Product mentions

The posts above create interest by surfacing the exact gap the product closes (every
checkout path, screened before the payment call) without selling. Add **one** closer to
the strongest performers — only once it's true:

- *Audit exists:* "I made a free, read-only check for this — it shows which of your
  checkout paths bots can reach. Link in bio."
- *Offering the lockdown service:* "I set this up for WooCommerce stores and prove it
  works with a bot replay test before handing it over. DM 'lockdown'."
- *Still deciding (demand test):* "Thinking of building a free check for this. Reply
  'audit' if you'd use it." ← safe today; replies are buyer evidence.

## Posting order (first 10)

E1 → R1 → C1 → S4 → Q1 → E3 → S2 → C2 → E2 → R3

Lead with the toggle (E1) because it gives instant value and sets up the "which checkout"
gap. Pair each story with an educational post within two days. Ask questions (R3, Q5)
when you want replies to log.

## Sources

- Rate limiting UI path, label, scope ("only … the `POST /checkout` and Place Order flow
  for Checkout block"), off by default, 3 requests / 60 s via UI —
  [WooCommerce developer docs](https://developer.woocommerce.com/docs/apis/store-api/rate-limiting/)
- Store API "disabled by default"; used by WooPayments and express payment buttons —
  [WooCommerce developer blog, Dec 2024](https://developer.woocommerce.com/2024/12/18/card-testing-attacks-and-the-store-api/)
- 340 IPs quote; fraud plugins screen after the payment attempt; 2 votes as of
  2026-10-06 (re-check the count before posting C4) — [WooCommerce feature request](https://woocommerce.com/feature-request/native-rate-limiting-and-bot-screening-for-store-api-checkout-endpoints-cart-checkout-order-creation/)
- Honeypot / reCAPTCHA / Wordfence / host Under Attack mode ("too disruptive for real
  visitors") / PayPal filters blocking legit payments → switched gateway —
  [WordPress.org thread](https://wordpress.org/support/topic/card-testing-bot-posting-to-wc-ajaxcheckout-creates-hundreds-of-failed-orders/)
- 350+ failed test orders; "costing us paypal fees to refund" —
  [WordPress.org thread](https://wordpress.org/support/topic/hundreds-of-credit-card-test-bot-orders-in-the-past-three-days/)
- Declines hurting future approval rates; small test purchases —
  [Stripe: card testing](https://docs.stripe.com/disputes/prevention/card-testing)
- E5, E7, C5, Q3–Q5 are practical advice or illustrative examples, not statistics. The
  "$2 item, 80 times" (Q3) and "300 bot orders" (E5, R5, Q5) figures are hypothetical
  and worded as such.
