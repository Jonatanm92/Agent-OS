# Deadline Ledger — monday.com Marketplace MVP

Deadline Ledger is a focused monday Board View for **schedule change control**.

It turns raw Date/Timeline activity into an operational governance queue:

- old deadline → new deadline
- who changed it and when
- change counter per item + deadline field
- missing-reason exceptions
- free-text reason + optional category
- who created/last edited the reason, when, and revision number
- governance summary and filters

## Product boundary

monday already has a native Activity Log and strong third-party historical reporting apps. Deadline Ledger is **not** another activity-history viewer or report builder.

The job is narrower:

> When a project commitment moves, make that specific transition accountable and reviewable.

Direct monday Community demand describes a roadmap shared by ten project managers where dates change often and the team wants a mandatory, reportable free-text explanation for each change.

Current revalidation: `MARKET_VALIDATION_2026-08-27.md`.

## Native-feature kill test

monday's 2026-07+ Validation API can validate the proposed/current state of an item, including conditional rules such as requiring text under a static condition.

It cannot compare a column's previous value with its new value and has no transition operator meaning “this Date/Timeline just changed”. Therefore native validations cannot bind an explanation to each specific old → new deadline move.

Result: **the focused change-control wedge survives**.

## Implemented MVP

1. React/Vite Board View using `monday-sdk-js`.
2. Board Activity Log reading with pagination (500 rows/page, bounded at 5,000 rows for v0.1).
3. `update_column_value` parsing for `date`, `timerange`, and compatible `timeline` payloads.
4. Live-tested normalization of monday's `timerange` activity type to the product concept Timeline.
5. Old/new value, actor/time and repeated-change sequence.
6. Missing-reason queue, search and reason-state filters.
7. Global monday app storage namespaced by board ID for reason metadata.
8. Optimistic storage concurrency using `previous_version`.
9. Best-effort migration from the earlier instance-storage prototype.
10. Reason audit metadata: created/updated actor, timestamps and revision count.
11. Viewer/read-only handling through `context.user.isViewOnly`.
12. `valueCreatedForUser` event after first successful reason save.
13. Responsive layout.
14. Deterministic parser/metric/audit tests and CI build.

## Why global storage

Reason metadata is audit context and must not be tied to one Board View instance. Instance-level storage is scoped to a specific app instance and can reset across major app versions.

Deadline Ledger therefore stores reasons with the global monday storage API under:

`deadline-ledger:reasons:v2:board:<boardId>`

The value is shared at the account+app level while the key keeps each board's governance records isolated.

No external database is required for v0.1.

## Live QA completed

A private developer app and a private board named `Deadline Ledger — QA` exist in the connected monday account.

Controlled live data has verified:

- three Date changes
- one Timeline change
- exact GraphQL activity query
- old/new Date payload shape
- old/new Timeline payload shape
- monday Timeline activity arrives as `column_type: "timerange"`
- Board View installation exists on the QA board

GitHub Actions has repeatedly passed `npm test` and `npm run build` on the feature branch.

## Remaining runtime gate

Still requires one embedded UI test inside monday:

1. Open the `Deadline Ledger — QA` board.
2. Open the `Deadline Ledger` Board View.
3. Save a reason on one deadline change.
4. Reload/switch away and return.
5. Confirm the same reason remains.

The QA surface now uses the same global board-scoped storage architecture as the product code, so this test validates the actual persistence design rather than the earlier instance-storage prototype.

## Explicit v0.1 limitations

- Does **not** intercept or block a native Date/Timeline edit before it occurs.
- Unreasoned edits are detected and remediated after the change.
- No cross-board rollup yet.
- No independent background capture beyond monday's available Activity Log history yet.
- Activity reading is bounded to the newest 5,000 board activity rows in v0.1.
- No AI is required in the customer-facing product.

A future **Guard mode** may add immediate exception workflow/notifications, but it is not promised until a supported architecture is demonstrated.

## Required scopes

- `boards:read`
- `users:read`

The app intentionally requests no write scope for board data in v0.1.

## Development

```bash
cd marketplace/monday/deadline-ledger
npm install
npm test
npm run build
npm run dev
```

## Release gates

Do not submit merely because the code builds.

Before Marketplace submission:

1. Pass embedded Board View global-storage save/reload QA.
2. Replace temporary QA hosting with durable production hosting and verify the deployed feature.
3. Test public/private/shareable boards plus member/admin/guest/viewer behavior.
4. Test larger activity histories and uninstall/reinstall behavior.
5. Re-run functional-duplication search immediately before submission.
6. Publish privacy policy, Terms and support/how-to pages under a verified domain/entity.
7. Configure monday native pricing/plans and vendor payout setup.
8. Prepare listing images/video and reviewer instructions.

Current pricing hypothesis (not approved pricing):

- Team: $19/month
- Pro: $49/month after a real cross-board/Guard feature exists

The north-star metric is **accounts with repeated deadline changes that actively resolve missing-reason exceptions and retain the app**.
