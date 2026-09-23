# Jarful — the honest recipe box

Save recipes from **any link, caption or photo**, plan the week, and shop from **one grocery list your whole household shares**. Built to fill the gap found by [`app-gap-radar`](../app-gap-radar): the top-grossing recipe apps (ReciMe, TapCook, mise, Osta) get 57–69% 1–2★ recent reviews over import caps, ads, hard paywalls, trial traps and missing ingredients. Evidence and go-to-market: [`docs/LAUNCH.md`](docs/LAUNCH.md). Content calendar, creator outreach and store listings: [`docs/MARKETING.md`](docs/MARKETING.md).

## Features

- **Import from anywhere**
  - Recipe websites: parsed from schema.org JSON-LD, free and unlimited.
  - TikTok captions (oEmbed), YouTube descriptions, pasted text, photos of cookbook pages or handwritten cards: extracted by Claude as structured output.
- **Missing-ingredient check**: flags ingredients that the steps use but the list lacks, and anything the AI couldn't read.
- **Servings scaler, cook mode** (big steps, keeps the screen awake), favorites, tags and search.
- **Weekly meal plan** and an **auto-merged grocery list**:
  - Unit conversion (2 tbsp + ¼ cup oil → ⅜ cup)
  - Grouped by aisle
  - Ticks sync live across the household
- **Household sharing** with a 6-character invite code (free).
- **Installable PWA**: works offline for saved recipes, and on Android it appears in the share sheet ("Share → Jarful" from TikTok/Instagram).
- **Honest billing**: free tier with 20 AI imports/month; Pro via Stripe Payment Links ($2.99/mo, $19.99/yr, $39 lifetime), one-tap cancel through the Stripe portal, and full data export.

## Run locally

```bash
cd jarful
npm install
cp .env.example .env      # add ANTHROPIC_API_KEY for AI imports
npm start                 # http://localhost:8787
npm test                  # parsing, JSON-LD, grocery merge, SSRF guard, Stripe, metrics, API flow
```

## Stripe

1. Stripe dashboard → Payment Links: create **Monthly** and **Yearly** (recurring) and **Lifetime** (one-time) links, with the after-payment redirect set to `https://YOUR_DOMAIN/?upgraded=1`.
2. Put them in `STRIPE_LINK_MONTHLY / _YEARLY / _LIFETIME`. The app appends `client_reference_id=<household>` automatically.
3. Webhooks → endpoint `https://YOUR_DOMAIN/api/stripe/webhook` with events `checkout.session.completed`, `customer.subscription.updated` and `customer.subscription.deleted`. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`.
4. Settings → Customer portal: enable it and set its link in `STRIPE_PORTAL_URL` (this is the one-tap cancel).
5. Settings → Subscriptions and emails: turn on **upcoming renewal** emails. The site promises a reminder before yearly renewals.

## Deploy

Any Node 20+ host with a persistent disk. The data is one JSON file (`JARFUL_DB`), fine for the first few thousand households. **Run a single instance.**

- **Render (easiest):** Dashboard → New → Blueprint → select this repo. `render.yaml` at the repo root creates the service with a 1 GB disk and a generated `ADMIN_TOKEN`; you paste your API key, Stripe links and `PUBLIC_URL` when prompted. The Starter plan (~$7/mo) is needed because free instances have no disk.
- **Fly.io:** see the comments at the top of `fly.toml`.
- **Anything with Docker:**
  ```bash
  docker build -t jarful . && docker run -p 8787:8787 -v jarful-data:/data --env-file .env jarful
  ```

Serve it over HTTPS (needed for the PWA install and share target). Set `TRUST_PROXY=1` behind a proxy. Back up with `scripts/backup.sh` (keeps 14 daily copies).

## Owner metrics

Set `ADMIN_TOKEN` to a long random string, then run:

```bash
curl -H "x-admin-token: $ADMIN_TOKEN" https://YOUR_DOMAIN/api/admin/metrics
```

It returns households (total, last 7/30 days, weekly active, multi-member), week-1 activation rate, the import mix, AI imports this month, free users at their limit, Pro count and conversion rate, and signups per day. Without the right token the endpoint returns 404.

## Pages and SEO

`node scripts/build-pages.mjs` regenerates the landing pages (save TikTok recipes, save Instagram recipes, meal planner, no-subscription comparison) and the privacy and terms **templates** (fill in the `[BRACKETS]`). `/sitemap.xml` and `/robots.txt` are generated from `PUBLIC_URL`. `public/og.png` is the social share card; its source is `scripts/og-card.html`.

## Architecture

| File | Role |
|---|---|
| `server.mjs` | HTTP API + static files, auth by per-member bearer token (stored hashed), rate limits |
| `lib/importer.mjs` | URL capture (SSRF-guarded fetch that checks the IP at connect time, TikTok oEmbed, YouTube description), JSON-LD parsing, quality flags |
| `lib/ai.mjs` | Claude extraction: structured JSON-schema output, server-side refusal fallback |
| `lib/ingredients.mjs` | Ingredient parsing, scaling, unit conversion, aisle grouping |
| `lib/billing.mjs` | Free-tier metering, Stripe signature verification, plan changes |
| `lib/store.mjs` | Atomic JSON-file store |
| `lib/metrics.mjs` | Owner metrics computed from the store (no third-party trackers) |
| `public/` | Vanilla-JS PWA (no build step) |

**Known limits:**
- Instagram blocks server fetches, so users paste the caption instead; the app switches to the text tab automatically.
- There is no account recovery beyond household invite codes.
- The JSON store should move to SQLite/Postgres past a few thousand households.
