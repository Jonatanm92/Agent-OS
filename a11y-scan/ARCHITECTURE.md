# Architecture

## What this is

A local CLI that scans a public e-commerce site for accessibility problems, groups
and prioritizes them, and produces a report good enough to sit behind a
2,490 SEK fixed-price engagement **that a human reviews before delivery**.

The tool produces the draft. A person signs it off. That split is deliberate and
is what keeps the product honest: automated testing detects roughly a third of
WCAG issues, so anything sold as "complete" on automated output alone would be a
lie. See `LIMITATIONS.md`.

## Pipeline

```
URL ──▶ guard ──▶ discover ──▶ audit ──▶ normalize ──▶ group ──▶ prioritize ──▶ report
        (1)        (2)          (3)        (4)          (5)       (6)           (7)
```

| # | Module | Responsibility |
|---|---|---|
| 1 | `src/security/url-guard.ts` + `redirect-guard.ts` | Decide whether a URL may be fetched at all. Protocol, DNS, IP range, and a Node-side preflight that validates every redirect hop before the browser is used. |
| 2 | `src/crawl/discover.ts` | Bounded, role-aware BFS. Respects robots.txt. Never submits a form. |
| 3 | `src/audit/*` | Per page: axe-core + custom structural checks in a real browser. |
| 4 | `src/analyze/normalize.ts` | Engine output → one `Finding` shape. |
| 5 | `src/analyze/group.ts` | Collapse the same defect across pages into one issue. |
| 6 | `src/analyze/severity.ts` | Severity, effort, priority score. |
| 7 | `src/report/*` | JSON, HTML, developer handoff, manual test script. |

Each stage takes the previous stage's plain data and returns plain data. Only
stages 2 and 3 touch the network or a browser, which is what makes 4–7 testable
without one.

## Key design decisions

### Role-aware crawling, not breadth-first page counting

A 12-page budget spent on 12 product pages tells you nothing about checkout. The
crawler keeps a set of **unfilled page roles** (home, collection, product, cart,
search, contact, account, checkout-entry) and scores every queued link by whether
it would fill one. Filling a role always outranks depth.

The consequence is that a scan of a 40,000-product store and a scan of a 40-product
store examine roughly the same *kinds* of page, so reports are comparable and the
fixed price is predictable.

### Grouping keyed on component, not page

The brief's requirement — one defect must not become 40 findings because it appears
on 40 pages — is met by grouping on `ruleId + normalizedSelector`, where
normalization strips positional noise:

```
.product-grid > li:nth-child(7) > a.card__link   ──▶   .product-grid > li > a.card__link
#product-4821 .qty-input                          ──▶   [id] .qty-input
```

Two instances that normalize to the same shape are the same component, so they are
one finding with N affected pages.

### Effort scales with distinct components, impact with pages

A missing `alt` on one shared card template that appears on 40 pages is a
**small** fix with **wide** impact. Forty different hand-written images are a
**large** fix with the same impact. Page count therefore drives severity, and the
count of *distinct normalized selectors* drives effort. Getting this backwards is
the most common way automated reports mislead buyers about cost.

### Severity is assigned by flow position, not by axe's impact field

axe's `impact` is context-free: a button with no accessible name is "critical" in
axe whether it is a footer social icon or the add-to-cart button. This tool starts
from a per-rule base severity and then applies modifiers:

- on a cart / checkout / product page → escalate one level
- rule is in the *blocking* class (no accessible name on a control, unlabelled
  form field, missing page language, keyboard trap) → floor at `high`
- present on more than half the scanned pages → escalate one level

Capped at `critical`. The rule table and modifiers live in
`src/analyze/severity.ts` and are unit-tested.

### Every finding is labelled by how it was established

`verification: 'automatic' | 'manual-required'`. The report renders these as
distinct badges and never merges them into a single count. Checks that a browser
cannot honestly decide — is focus order *logical*, does the modal trap focus
correctly, is that alt text *meaningful* — are emitted as `manual-required` items
with instructions, never as passes. The tool never records a manual test as
having succeeded.

## Engines: why axe-core only

The brief allows pa11y and Lighthouse "where useful". They were evaluated and
deliberately left out of v1:

- **Lighthouse's accessibility category is axe-core.** Adding it would triple
  runtime to re-run the same rules and produce duplicate findings to de-duplicate.
- **pa11y (HTML_CodeSniffer)** overlaps axe heavily and its extra findings skew
  noisy — high false-positive rates on exactly the notice/warning classes that
  would erode trust in a paid report.

What actually closes the gap is not a second generic engine but **checks axe does
not attempt**: touch-target size, focus-visibility detection, 320px reflow,
zoom suppression, non-semantic clickables, checkout autocomplete. Those are in
`src/audit/checks/`.

The seam is kept open: `src/audit/engines.ts` defines an `Engine` interface, and
axe is one implementation. Adding pa11y later is a new file, not a refactor.

## Safety posture in one line

Target sites are treated as hostile input from the first character of the URL to
the last character of the rendered report. See `THREAT-MODEL.md`.

One consequence worth naming here, because it shaped the pipeline: **a redirect
is resolved and validated in Node before `page.goto()` is called at all.**
Playwright's route handler does not fire for redirect hops the network stack
follows internally, so the guard cannot live only there. This was found by
testing the claim rather than trusting it — the earlier design let a
`302 → 169.254.169.254` through.

## What runs where

Node process: crawling decisions, guards, grouping, reporting.
Browser page context: axe-core and the custom check scripts.

Anything crossing back from the page — selectors, DOM snippets, titles, link text —
is **untrusted data** and is escaped at every render site. The browser is the
sandbox; the Node process never evaluates target-supplied code.

## File map

```
src/
  cli.ts                    argument parsing, both commands
  config.ts                 all limits in one place
  types.ts                  Finding, Issue, PageAudit, ScanResult
  security/
    url-guard.ts            protocol + DNS + IP checks, normalization
    redirect-guard.ts       hop-by-hop redirect validation before navigation
    escape.ts               HTML escaping and snippet truncation
  crawl/
    robots.ts               robots.txt fetch + parse + match
    discover.ts             role-aware bounded BFS
  audit/
    browser.ts              Playwright lifecycle, request blocking
    engines.ts              Engine interface
    axe-engine.ts           axe-core injection and run
    checks/                 custom in-page checks axe does not cover
    page-audit.ts           per-page orchestration
  analyze/
    normalize.ts            engine output → Finding[]
    group.ts                dedup + selector normalization
    severity.ts             severity, effort, priority
    journey.ts              browse → product → cart → checkout rollup
    manual-script.ts        human verification checklist
  report/
    html-report.ts          printable single-file HTML
    json-report.ts          machine-readable
    handoff.ts              Jira/Linear/GitHub task list
  prescan/prescan.ts        lightweight prospect mode
  audit/screenshot.ts       best-effort element evidence
fixtures/broken-shop/       intentionally defective webshop
tests/                      deterministic vitest suite
```
