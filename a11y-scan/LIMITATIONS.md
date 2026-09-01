# Limitations

Written plainly, because the product is sold on the strength of being honest
about what automated testing can and cannot do. Anything here that would
embarrass us if a customer discovered it themselves belongs in the report too —
and it is: see the "Scope and limitations" section of every scan.

---

## The big one: automated testing covers a minority of WCAG

Automated rules can decide questions like "does this image have an alt
attribute". They cannot decide "is this alt text meaningful", "is the focus order
logical", or "does this modal trap focus correctly". Commonly cited figures put
automated coverage around a third of WCAG success criteria.

**A page with zero automated failures can be unusable with a keyboard.**

This is why every scan ships a manual verification script, why no item in it is
ever pre-marked as passed, and why the product is priced as a *pre-audit* rather
than an audit.

## What the scanner does not test

- **Anything behind a login.** The scanner never authenticates and never
  bypasses authentication. Account pages, order history, and any logged-in
  checkout are outside the scan.
- **The checkout flow itself.** Nothing is added to a cart and no order is
  placed, so only the checkout *entry* page is reachable. The highest-risk part
  of an e-commerce journey for accessibility is therefore the part with the
  least automated coverage. Say so to the customer.
- **Pages beyond the budget.** 12 pages at depth 2 for a scan, 4 at depth 1 for
  a prescan. A large catalogue is sampled, not covered.
- **PDFs, videos and embedded third-party widgets.** A payment iframe is checked
  for a title and nothing more; its contents belong to the provider.
- **Anything the site only renders after interaction** — mega-menus that build on
  hover, modals, cart drawers, variant pickers. The crawler never clicks, so
  these are only covered by the manual script.

## Where the automated checks are weaker than they look

- **Colour contrast.** axe cannot compute contrast against a background image, a
  gradient, or a semi-transparent overlay, and reports those as "incomplete"
  rather than failing. Text over a hero image is a common real failure that this
  scan will not report.
- **Focus visibility.** The check compares computed style before and after
  focus. It reliably catches `outline: none` with no replacement. It does **not**
  judge whether a focus indicator that does change is *sufficiently* visible —
  a 1px light-grey outline passes here and fails in practice.
- **Touch target size.** Measured at a 360px viewport against the 24x24 minimum
  of WCAG 2.2 SC 2.5.8. Spacing-based exemptions are not modelled, so some
  reported targets are technically conforming.
- **Non-semantic clickables.** Detected via `cursor: pointer` and inline
  handlers. Handlers attached with `addEventListener` on a div that is not
  styled as clickable will be missed, and a decorative element styled with
  `cursor: pointer` will be a false positive.
- **Reflow.** Detects horizontal overflow at 320px. Content that is clipped
  rather than overflowing is not detected.
- **`region` / landmark rules** produce noise on many themes. They are
  deliberately rated low.

## Where the grouping can mislead

Grouping keys on rule plus normalized selector. Two consequences:

- A shop whose markup is generated with unstable class names (hashed CSS
  modules, `sc-a1b2c3`) will group less effectively, inflating the issue count.
- Conversely, two genuinely different components that happen to normalize alike
  will be merged, understating the count.

The report always states occurrence and page counts alongside the issue, so a
reviewer can see what was merged.

## Severity is a business judgement, not a standard

The severity scale (critical / high / medium / low) is **ours**, not WCAG's. WCAG
has conformance levels (A / AA / AAA), which describe a different thing: how
fundamental a criterion is, not how much a given defect costs this shop. A
level-A failure in a footer may matter less commercially than a level-AA failure
in checkout, and this tool ranks it that way deliberately.

Do not present our severity as a legal grading.

## Legal limitations

- **Not legal advice, not certification, no compliance guarantee.** Stated in
  the report, the JSON, the prescan and the sales page.
- **Passing every automated check does not demonstrate LPTT or European
  Accessibility Act compliance**, and no output of this tool should be quoted as
  if it did.
- Whether a given shop falls under the legislation at all — the microenterprise
  exemption, the service categories covered, transition periods — is a legal
  question about that business, not something a scanner can determine.
- The operator is responsible for having a legitimate basis to scan a given
  site. The tool cannot know that.

## Security limitations

Fully described in `THREAT-MODEL.md`. The headline residual risks:

- **DNS rebinding** is mitigated but not eliminated; closing it needs an
  egress allowlist at the network layer, which is an ops control. The same
  time-of-check window exists between the redirect preflight and the browser's
  own navigation — a server can answer the two differently.
- **The declared-size cap only binds when the server sends a
  `content-length`.** A chunked response bypasses it; the DOM element cap is the
  backstop that does not depend on the server being honest.
- **A malicious page exploiting a browser vulnerability** is out of scope; run
  bulk prospecting in a disposable container and keep Playwright current.
- The tool is polite but does **not** implement adaptive back-off on 429/503.

## Operational limitations

- **Single-threaded by design.** A 12-page scan takes roughly one to three
  minutes. Parallelising it would put more load on someone else's shop for a
  saving that does not matter at this volume.
- **No persistence.** No database, no history, no diffing between scans. Each
  run writes files and forgets.
- **No scheduling, no queue, no API.** It is a local CLI, deliberately.
- **Chromium only.** Safari- and Firefox-specific behaviour is not covered.

## What would need to change before this could be sold as an audit

Listed so the boundary is explicit rather than assumed:

1. A qualified person performs the manual script and signs the result.
2. Authenticated and full-checkout coverage, which needs customer-supplied test
   credentials and a written scope agreement.
3. Screen-reader verification with at least NVDA and VoiceOver.
4. A conformance statement written against a stated WCAG version and level.

Steps 1 and 4 are human work. This tool exists to make them cheaper, not to
replace them.
