# Jarful — market evidence and launch playbook

_Research run 2026-09-23 with `app-gap-radar` (US App Store, 16 non-game categories, top 12 grossing apps each: 192 apps, 25,313 recent reviews)._

## 1. What the data says

**The money pattern:** across almost every category, the angriest paying users are in **simple utility apps that use a hard paywall, weekly subscriptions and cancel traps**. Examples: scanners, invoice makers, package trackers, recipe savers, text-to-speech and spam blockers. "billing_trap" (cancel / refund / charged / auto-renew) is the #1 or #2 complaint theme in 10 of 16 categories.

| Category | 1–2★ share of recent reviews | Top complaint themes | Gap score |
|---|---|---|---|
| **Food & Drink** | **42%** | billing trap (103), pricing (86), paywall (78), ads (44) | **38.1 (highest)** |
| Finance | 51% | billing trap, pricing, bugs, support | 36.4 |
| Productivity | 41% | ads, billing trap, pricing, paywall | 33.7 |
| Business | 49% | billing trap, pricing, bugs, paywall | 33.0 |

Full table: `app-gap-radar/data/report.md`.

**Why Food & Drink, and why recipe saving specifically:**

- 4 of the 12 top-grossing US Food & Drink apps sell the same job: *save recipes from social media, then plan meals and shop*. They are ReciMe (#1 grossing, ~296k ratings), TapCook (#3), mise (#5) and Osta (#9). The demand and willingness to pay are already proven.
- Their recent 1–2★ share is very high: mise 69%, Osta 60%, TapCook 57%.
- The complaints are the same across all of them, and each one is fixable by product and pricing choices rather than by a huge budget:

| What users say (paraphrased from real reviews) | Jarful's answer |
|---|---|
| "It only does 5 imports every WEEK" / "ReciMe only allows 5 imports before charging" | Website imports are **unlimited and free** (schema.org parsing costs $0). 20 AI imports/month free. |
| "We have lost another incredible app to corporate greed… long ads just to save a single recipe" | **No ads**, stated as a promise on the landing page. |
| "It missed half the ingredients" | The AI prompt cross-checks steps against the ingredient list, plus a deterministic **missing-ingredient check** flagged in the UI. |
| "Immediately asked to sign up for a monthly subscription" after onboarding / "paywall at the very last step" | **No paywall to try**: full app in 10 seconds, no card, no trial. |
| "Trial reminder never sent… charged for the year" | **No trials to trap anyone.** Pro is a straight purchase, monthly plans can be cancelled in one tap (Stripe portal), and a 14-day refund promise. |
| "$10/month for AI meal plans isn't worth it… I would gladly pay $2" | Pro is **$2.99/mo, $19.99/yr or $39 lifetime**. |
| "Can't family share… my wife can't use it when buying groceries" / "tried to join the household, it deleted his work" | **Household sharing is free**: one invite code, and grocery ticks sync live between members. |
| "Lost all my data" | **One-tap export** of everything, plus an offline cache. |

## 2. Customer base

Who they are, inferred from review language and the competitors' positioning (this is an inference, not survey data):

- **Primary:** home cooks who discover recipes on TikTok, Instagram, YouTube and Pinterest, and lose them in screenshots and saved folders. They cook for a household, often with kids ("picky 6 and 10 year old", "my husband", "my wife"), and are price-sensitive ("college student", "budget").
- **Job to be done:** "Get this recipe out of the video and into a list I can cook and shop from, for my whole household, without paying $10/month."
- **Where they are:** food creators on TikTok and Instagram. Reviewers say they found Osta through "an instagram food creator promoting it", and creator distribution is how this category grows.

## 3. Pricing and unit economics

- Free: unlimited recipes and website imports, meal plan, shared grocery list, 20 AI imports per month.
- Pro: $2.99/mo · $19.99/yr · $39 lifetime. Web checkout via Stripe Payment Links, so there's no 15–30% app-store cut on the web.

**AI cost per import (you should decide this):** the default model is `claude-opus-5` (best extraction quality). A typical page or caption import is ~3–8k input and ~0.5k output tokens, which works out to about **$0.02–0.05 per AI import**. A free user who uses all 20 AI imports costs about $1/month. Two levers, set in `.env`:
- `FREE_AI_IMPORTS`: lower it if free usage gets expensive.
- `JARFUL_MODEL=claude-haiku-4-5`: about 5× cheaper per import. Run it on 20–30 real captions first and compare accuracy before switching.

Website imports never touch the AI, and most recipe blogs publish schema.org Recipe markup.

Illustrative revenue math (these are scenarios, not forecasts):

| Monthly active households | Paid conversion | Blended $/paying household/month | MRR |
|---|---|---|---|
| 2,000 | 4% | ~$2.20 | ~$176 |
| 20,000 | 4% | ~$2.20 | ~$1,760 |
| 100,000 | 4% | ~$2.20 | ~$8,800 |

The product will not make money on its own. **Distribution decides the outcome.**

## 4. Launch plan (first 30 days)

1. **Deploy** (day 1): see README → Deploy. Put it on a domain, and get a privacy policy and terms written (generator plus your own review).
2. **Payments** (day 1): create three Stripe Payment Links, the webhook and the customer portal (README → Stripe).
3. **Content engine** (days 2–30, the part that makes money while you sleep):
   - Post 1–3 short videos a day: "I saved this viral TikTok recipe in 3 seconds → it built my grocery list". Screen-record the real app. Hook ideas: *"Stop screenshotting recipes"*, *"The recipe app that doesn't charge $10 a WEEK"*, *"My whole family shops from one list now"*.
   - Reply to comments under viral recipe videos asking "recipe?!" by showing the imported recipe.
   - Offer food micro-creators (5k–50k followers) a free lifetime Pro account plus a revenue share for a mention.
4. **SEO pages** (week 2): "save TikTok recipes", "Instagram recipe saver", "Paprika alternative", "ReciMe alternative" and "free meal planner with grocery list".
5. **App stores** (weeks 3–6, after demand is proven): wrap the PWA with Capacitor. Apple charges $99/yr and Google $25 one-time. For in-app digital purchases on iOS/Android, **check the current store rules**: Apple IAP / Google Play Billing may be required depending on region and link-out entitlements, so budget for a store-billing path. ASO keywords: recipe keeper, recipe saver, save recipes from tiktok, meal planner, grocery list, recipe organizer.

## 5. Metrics and kill criteria

- North star: households that import 3 or more recipes in their first week.
- Target by day 30: 1,000 signups, 25% week-1 activation, first 20 paying households.
- **Kill or pivot:** fewer than 300 signups after 30 days of daily posting means the channel or message isn't working. Re-run `app-gap-radar` and take the next gap. Scanner and TTS apps with "$15/week" traps score almost as high.

## 6. Things only you (the owner) can do

- [ ] Anthropic API key (console.anthropic.com) → `ANTHROPIC_API_KEY`
- [ ] Stripe account, 3 Payment Links, webhook secret, customer portal link
- [ ] Hosting with a persistent disk and a domain
- [ ] Privacy policy and terms of service; business/tax registration where you live
- [ ] Social accounts for the content engine (the posting has to come from you; nothing here posts on your behalf)
- [ ] Apple/Google developer accounts once you wrap for the stores
