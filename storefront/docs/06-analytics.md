# 6. Analytics

Goal from the brief: measure product page view, personalization form start, add
to cart, checkout reached, and purchase — without paying for anything.

## What you get for free, with no setup

Shopify's built-in analytics (Analytics → Reports) already covers four of the
five, out of the box, with no code:

| Event | Where | Setup |
|---|---|---|
| Product page view | *Sessions by landing page*, *Top products* | none |
| Add to cart | *Conversion over time* — "Added to cart" | none |
| Checkout reached | *Conversion over time* — "Reached checkout" | none |
| Purchase | *Conversion over time* — "Sessions converted" | none |

For a validation test that funnel is the answer. View → add to cart tells you
whether the offer works. Add to cart → purchase tells you whether the price does.

## The fifth one: form start

**Shopify's built-in analytics cannot report this, and no free workaround makes
it appear there.** Stated plainly rather than worked around, because the
difference matters: without it you cannot separate "nobody wanted it" from
"people wanted it but the form was too much work".

Two ways to close the gap, in increasing order of effort:

### Free, already implemented: per-order engagement data

Every order carries a hidden `_engagement` property recording how many fields
were filled and how long the form took:

```
_engagement: fields=10; seconds=143
```

Read it on any order in Admin. It tells you whether the form is heavy for people
who *completed* it — useful, cheap, no setup.

It says nothing about people who abandoned. That is its limitation.

### Free, needs 15 minutes: a GA4 custom pixel

Google Analytics 4 is free and is not a paid analytics platform, so it is inside
the brief's constraint. Shopify's **Customer events** (Settings → Customer
events → *Add custom pixel*) is the native, consent-aware way to add it.

The form already publishes the event:

```js
window.Shopify.analytics.publish('cmi_personalization_start', { tier: '...' });
```

It fires once, the first time a customer types into any personalization field.
Nothing listens to it today, so it is a no-op — a pixel that subscribes to
`cmi_personalization_start` starts receiving it with no further code changes.

Do this only if the funnel numbers turn out ambiguous. It is not needed to
decide whether the product sells.

## Deliberately not done

- No paid analytics platform.
- No Meta/TikTok pixel — no ad spend is planned during validation.
- No heatmap or session-recording tool. Recording a form containing personal
  memories and photo links is a privacy problem you do not need.
- No A/B testing. With zero orders there is nothing to split.

## What to actually look at after launch

In order:

1. **Sessions to the product page.** Under ~100, you have a traffic problem, not
   a product problem — nothing else is readable yet.
2. **View → add to cart.** This is the offer test.
3. **Add to cart → purchase.** This is the price and trust test. A big drop here
   with a healthy rate above usually means price, delivery uncertainty, or the
   form.
4. **`_engagement` on real orders.** If completed forms routinely take 4+ minutes,
   the form is costing you conversions and is worth shortening.

Do not add tooling to answer a question the first ten orders will answer for you.
