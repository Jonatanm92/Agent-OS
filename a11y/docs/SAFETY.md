# Safety and quality contract

These are enforced in code, not just stated. Where a rule is enforced, the file is named.

## What the crawler will never do

| Rule | Where it is enforced |
|---|---|
| Never buy a product or submit an order | `audit/DialogProbe.ts` refuses to activate anything matching the purchase/submit vocabulary, and skips every `type="submit"` control. `discovery/JourneyDiscovery.ts` visits the cart and checkout entry as an empty session. |
| Never submit a form | Forms are analysed statically (`audit/FormProbe.ts`). Behaviour only observable by submitting is raised as a manual-validation item instead of being asserted. |
| Never bypass authentication | The login page is tested as a form. No credentials are ever entered or stored. |
| Never circumvent a CAPTCHA or access control | Nothing in the platform interacts with one. A page we cannot reach is recorded as untested. |
| Never overload a site | `discovery/Browser.ts` serialises requests per host with a configurable minimum gap (default 1.5 s) and `core/Config.ts` caps pages per scan (default 8). |
| Respect robots.txt | `discovery/Robots.ts`. A disallowed path is recorded as untested, never fetched. |
| Never leave the page under test | `audit/DialogProbe.ts` aborts and navigates back if a probe causes a navigation. |
| Never accept cookies on the merchant's behalf | `discovery/ConsentManager.ts` only ever clicks a control that *declines* non-essential cookies, and only inside the identified consent container. "Accept all" is explicitly excluded. When there is no way to decline, the overlay is left in place and the scan records that. |
| Never contact anything but the site under test | `discovery/Browser.ts` launches Chromium with background networking, sync, safebrowsing updates and autofill telemetry disabled. |
| Never modify a customer's production system | `remediation/` produces proposals only. `remediation/GithubWorkflow.ts` generates a branch name, patch and PR body for a human to apply; it does not push, open or merge anything. |

The end-to-end test asserts the first two directly: it records every request the
fixture storefronts receive and fails if any of them is not a `GET` or `HEAD`,
or touches a robots-disallowed path (`test/EndToEnd.test.ts`).

## The cookie wall

Nearly every European storefront puts a consent overlay in front of the page.
Ignoring it means auditing somebody's consent manager instead of the merchant's
checkout, so the platform handles it explicitly and records what it did:

- It declines non-essential cookies — "endast nödvändiga", "neka alla" and
  equivalents — and clicks only inside the detected consent container.
- It never clicks "acceptera alla". Consenting to tracking is the operator's
  decision, and accepting changes what the site loads.
- When the overlay offers no way to decline, it stays. The scan records
  `not_dismissible`, and every report says the store was tested with the
  overlay present — which is also what a visitor who declines actually sees.

## Third-party code

Consent managers, chat widgets, review badges and payment widgets fail
accessibility checks constantly, and the merchant does not own the markup.
`findings/ThirdParty.ts` attributes those findings to the vendor. They are:

- excluded from the mini audit, so we never lead a sales conversation with a
  defect the recipient cannot fix;
- excluded from lead and evidence scoring, so a vendor's bugs cannot inflate
  what a prospect appears to be worth;
- reported to a paying customer in their own section with the vendor named,
  because they do affect real customers and someone should push the vendor.

Detection is deliberately conservative: unrecognised markup is treated as the
merchant's own, because wrongly excusing a real defect costs us a finding we
could have sold.

## What we will never claim

An automated test can demonstrate that a specific barrier exists on a specific
page. It cannot establish that a website conforms to WCAG 2.1/2.2, EN 301 549 or
any legislation.

Every report carries that statement (`reports/Html.ts`, `disclaimer()`), and
every JSON export carries it as a `disclaimer` field. The platform never uses
the words *certified*, *compliant*, *guaranteed* or *approved* about a site, and
outreach never mentions legal consequences. The end-to-end test asserts the
absence of legal-threat and certification language in generated reports.

## What we will never invent

- **Company data.** Every prospect fact is written with provenance — the URL it
  came from and the method that read it (`db/Store.ts`, `setProspectFacts`). A
  fact we could not read stays `null`, and the scoring model raises a review
  flag telling the operator not to invent one.
- **Findings.** Every finding stores the selector, the DOM snippet, the engine
  that produced it and a screenshot. `findings/Normalize.ts` renders the
  description from a catalog template over observed parameters; probes report
  what happened, they do not editorialise.
- **Confidence.** axe-core "incomplete" results become `REVIEW_REQUIRED`, never
  a confirmed defect. Only `CONFIRMED_AUTOMATED`, `HIGH_CONFIDENCE` or
  reviewer-approved findings may appear in a customer-facing report
  (`reports/Selection.ts`).

## Outreach

- Drafted from findings that exist in a scan, never from a template with the
  company name filled in.
- Refused outright when the domain or address is suppressed, when there is no
  contact path, or when no finding has evidence strong enough to show
  (`services/OutreachService.ts`).
- Never sent by the platform. A person approves the draft and sends it from
  their own mailbox; the platform records that it happened.
- Opt-out phrasing in a reply immediately and permanently suppresses the domain
  and the address (`pipeline/Outreach.ts`, `looksLikeOptOut`).
