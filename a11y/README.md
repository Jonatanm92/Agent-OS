# A11Y Revenue OS

An internal operating system for running an accessibility business: find
qualified ecommerce companies, find the barriers that actually cost them
customers, produce evidence a developer can act on, get a human to check it,
turn it into a report and a piece of outreach, and keep the fixed sites fixed.

Initial market: Swedish B2C ecommerce. The architecture is market- and
stack-agnostic — copy is localized per market, remediation is per stack, and the
data model already carries agency → client → site.

## Run it

```bash
npm install
npm run build

# The whole vertical slice against local fixture storefronts
node dist/cli/Main.js demo

# One real domain, end to end, with a mini audit
node dist/cli/Main.js scan example.se --report --pdf

# A batch, then the ranked worklist
node dist/cli/Main.js batch domains.txt --concurrency 3
node dist/cli/Main.js rank

# The internal review console
node dist/cli/Main.js console        # http://localhost:4300
```

`node dist/cli/Main.js` with no arguments lists every command.

Chromium is resolved from `A11Y_CHROMIUM_PATH`, then `/opt/pw-browsers/chromium`,
then Playwright's own download.

## What one scan does

```
domain
  → robots.txt check and politeness gate
  → cookie wall: decline non-essential cookies, or record that we could not
  → journey discovery: homepage, search, category, product, cart, login, checkout entry
  → per page: axe-core + keyboard walk + focus analysis + forms + structure + dialogs + reflow
  → normalization: WCAG mapping, severity weighted by journey position, confidence
  → deduplication and systemic grouping (one component, N pages, one problem)
  → screenshot evidence for the findings that could reach a customer
  → ICP scoring → qualification → sales stage → next action
```

Everything is recorded: which journey steps could *not* be tested and why, which
probes failed, where every company fact came from.

## What makes the findings worth paying for

axe-core alone produces a list of contrast ratios and missing alt attributes.
That does not sell, and it does not describe what actually breaks a purchase.
The probes in `src/audit/` drive a real browser to find the barriers that only
show up when something is operated:

- **`KeyboardProbe`** presses Tab up to 60 times and records every stop: focus
  traps, focus parked inside a closed off-canvas menu, focus inside
  `aria-hidden`, unnamed stops, and — by diffing each stop's focused styling
  against its unfocused styling — controls with no visible focus indicator at
  all.
- **`DialogProbe`** opens filters, size pickers and menus *with the keyboard*
  and checks the four things that decide whether a keyboard user can shop: does
  Enter activate it, does focus move into the panel, does Escape close it, is
  the dialog announced. It refuses to touch anything that could buy, order, pay
  or submit, and aborts if a probe navigates away.
- **`FormProbe`** catches placeholder-as-label, missing autocomplete on checkout
  fields, unlabelled option groups and error text wired to nothing.
- **`ReflowProbe`** renders at 360 px — roughly 400% zoom — and measures the
  actual overflow.

Two things decide whether any of that survives contact with a real storefront.
**The cookie wall** sits in front of nearly every European shop; the platform
declines non-essential cookies to get at the store behind it, never accepts on
the merchant's behalf, and states in the report which of the two happened.
**Third-party widgets** — Cookiebot, Klarna, Trustpilot, Zendesk — fail these
checks constantly and the merchant cannot fix them, so those findings are
attributed to the vendor, kept out of the mini audit and out of the scoring, and
reported separately to a paying customer.

The result is a finding like *"Filtrera opens when clicked with a mouse but does
nothing when it has keyboard focus and Enter is pressed"*, with a screenshot of
the highlighted element, three reproduction steps, and the affected page count.
A merchant can verify that in ten seconds.

## The three reports

| Level | For | Contents |
|---|---|---|
| **Mini audit** | Prospecting | 3–5 strong findings, each with a screenshot and reproduction. Visually convincing, no legal language, one clear next step. |
| **Professional audit** | A paying customer | Every reviewed finding, split into critical customer barriers / high / medium / improvements / manual validation, plus the systemic-component table. |
| **Developer report** | The developer who fixes it | Grouped by page, with selectors, DOM evidence, source engine and remediation. |

All three export as HTML (screenshots inlined, so one portable file), JSON, and
PDF. Reports accept agency branding.

## The pipeline

`DISCOVERED → SCANNED → QUALIFIED → MINI_AUDIT_READY → REVIEWED →
READY_FOR_OUTREACH → CONTACTED → REPLIED → MEETING → PROPOSAL → WON →
MONITORING` (or `LOST`).

Every prospect has exactly one next action at every stage. Transitions that are
not defined are refused unless forced. Winning a customer turns the domain into
a monitored site.

## Human review is not optional

A finding may only reach a customer if an engine confirmed it outright or a
reviewer approved it. The console (`a11y-os console`) shows the evidence and
offers approve, reject, change severity, edit description, request manual test,
confirm manual test and merge duplicates. Every decision is stored with the
value before the change and who made it.

Systemic components are reviewed once, not once per affected page.

## Safety

New here? [`docs/RUNBOOK.md`](docs/RUNBOOK.md) is the operator guide: seed list
to sent mini audit, what to do when a scan fails, and which metric to read first.

Read [`docs/SAFETY.md`](docs/SAFETY.md). Short version: read-only crawling,
robots.txt honoured, per-host rate limiting, nothing purchased or submitted, no
authentication bypassed, no production system ever modified, no company data
invented, and no automated result presented as a legal determination.

## Metrics that decide whether the business is working

`a11y-os metrics` reports the funnel (discovered → scanned → qualified → mini
audits → contacted → responses → meetings → proposals → won), the revenue split
(audit / remediation / monitoring MRR), delivery hours per customer, compute
cost per audit, and the conversion rate at every step — plus which step is
leaking worst. There is deliberately no "issues detected" headline: that number
goes up when the crawler gets noisier, not when the business gets better.

## Tests

```bash
npm test
```

93 tests. The important one is `test/EndToEnd.test.ts`, which runs the real
browser against five local fixture storefronts — a badly built shop, a well
built shop, a B2B site, a Shopify-shaped shop behind a dismissible cookie wall,
and a shop behind a wall with no way to decline — and asserts the whole slice: journey discovery, the
keyboard barrier, systemic grouping, that a well built store is *not* worked up
into a case, that a B2B site is disqualified, that the mini audit contains only
evidenced findings and no legal claims, that the consent wall is declined rather
than accepted, that a vendor's defects never lead a mini audit, and that no
request to any fixture was ever anything but a `GET`.

## Layout

```
src/core/         types, config, ids, localization
src/db/           SQLite schema, prospect store, audit store
src/discovery/    browser session, robots, journey discovery, platform detection
src/audit/        axe runner and the deterministic probes
src/findings/     rule catalog, WCAG mapping, normalization, grouping
src/evidence/     screenshots, evidence packs, object storage abstraction
src/scoring/      configurable ICP model
src/reports/      selection rules and the three renderers
src/remediation/  stack adapters, patch proposals, GitHub PR planning
src/pipeline/     sales stages, outreach composition
src/services/     scan, batch, report, review, pipeline, outreach, retest, monitoring
src/analytics/    business metrics
src/queue/        SQLite work queue
src/api/ public/  the internal review console
fixtures/         local storefronts used by the tests and the demo
```

## Known limitations

- **Automated testing finds a subset of barriers.** Screen reader announcement
  quality, cognitive load, and anything behind a login or a real checkout need a
  human with assistive technology. The reports say so, and the platform tracks
  manual-validation items as a first-class category.
- **The checkout flow itself is not tested.** Reaching it requires products in
  the basket, and we do not add products to a real store. The checkout *entry*
  is tested and the limitation is recorded in the journey table of every report.
- **Company size is inferred, not known.** Catalogue breadth is a proxy. The
  scorer raises a review flag rather than asserting a size bucket, and no
  external company register is integrated yet.
- **Client-rendered stores can under-report.** The crawler waits for network
  idle with a timeout; a store that renders its navigation after that window may
  yield fewer journey steps. Untested steps are always shown as untested.
- **The console has no authentication.** It binds to localhost and shows
  customer evidence. Do not expose it.
