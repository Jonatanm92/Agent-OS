# Systems 1–16: what is built, and what is deliberately not yet

The build order follows the vertical slices, not the system numbers. A system is
"built" when it is used by the running pipeline and covered by tests.

| # | System | Status | Where |
|---|---|---|---|
| 1 | Prospect intelligence | Built | `db/Store.ts`, `scoring/IcpScoring.ts`, provenance in `db/Store.ts` |
| 2 | Site discovery | Built | `discovery/JourneyDiscovery.ts`, `LinkClassifier.ts`, `Robots.ts`, `ConsentManager.ts` |
| 3 | Audit engine | Built | `audit/` — axe-core, keyboard, focus, forms, structure, dialogs, reflow |
| 4 | Finding normalization | Built | `findings/Normalize.ts`, `Dedupe.ts`, `RuleCatalog.ts`, `WcagMap.ts`, `ThirdParty.ts` |
| 5 | Evidence pack | Built | `evidence/EvidencePack.ts`, `Screenshot.ts`, `Storage.ts` |
| 6 | Human review console | Built | `services/ReviewService.ts`, `api/Server.ts`, `public/` |
| 7 | Report engine | Built | `reports/` — mini, professional, developer; HTML, JSON, PDF |
| 8 | Remediation engine | Built | `remediation/` — Shopify, WooCommerce, React, Next.js adapters |
| 9 | GitHub remediation mode | Designed, artefacts generated | `remediation/GithubWorkflow.ts` — plans a branch, patch and PR body; never pushes |
| 10 | Retest engine | Built | `services/RetestService.ts` |
| 11 | Continuous monitoring | Built | `services/MonitoringService.ts` |
| 12 | Compliance memory | Built | `timeline_events` + `a11y-os timeline` |
| 13 | Sales pipeline | Built | `pipeline/Stages.ts`, `services/PipelineService.ts` |
| 14 | Outreach assistant | Built | `pipeline/Outreach.ts`, `services/OutreachService.ts` |
| 15 | Agency mode | Data model only, by design | `agencies`/`clients`/`sites` tables, branding hook in the report renderers |
| 16 | Analytics | Built | `analytics/Metrics.ts` |

## Deliberately not built yet

These would not move a prospect closer to becoming a customer today.

- **Agency UI, white-label dashboards, wholesale pricing, per-client
  permissions.** The data model supports an agency → clients → sites → audits
  hierarchy and the report renderers accept branding, so nothing has to be
  rewritten. The UI waits for demonstrated agency demand, as the brief requires.
- **Automated PR creation against customer repositories.** System 9 generates
  the artefacts; wiring it to a real repository is a per-customer engagement
  decision, and merging always needs a human.
- **Sending email.** Deliberate: outreach at this volume should come from a
  person's own mailbox, and a send button is the easiest way to turn this into
  a spam cannon.
- **Distributed workers, Redis, microservices.** One process, one SQLite file
  and a claim-by-update queue handles a 100-domain batch comfortably. `Queue.ts`
  is one file to replace when that stops being true.
- **Magento, Vue and Nuxt remediation adapters.** The `StackAdapter` interface
  is the extension point; adding one is a ~20-line addition to
  `remediation/Adapters.ts`.
