# Deadline Ledger — monday.com Marketplace MVP

A focused monday board view for **deadline-change governance**.

Deadline Ledger turns raw Date/Timeline activity into a usable project-control ledger:

- every Date and Timeline change on the current board
- old value → new value
- who changed it and when
- change counter per item + deadline column
- missing-reason queue
- free-text reason + reason category stored against the exact activity-log event
- governance summary: total changes, impacted items, missing reasons, governed percentage
- search and reason-state filters

## Why this product exists

The wedge is deliberately narrower than a generic activity-log/reporting app.

Current monday native behavior already provides an Activity Log with old/new column values, filtering and Excel export. monday also has baseline/dependency functionality. Building another generic history viewer or baseline app would therefore be weak and risks Marketplace duplication rejection.

The unmet job is different:

> **When a project deadline is moved, make the movement accountable and reviewable.**

Public monday community evidence includes teams explicitly asking to:

- count how many times a deadline/due date changed before completion
- require a free-text reason whenever a Date field changes
- make those reasons reportable for project-plan analytics

The initial MVP audits native Date/Timeline edits after they happen and highlights missing governance context.

## Live QA status — 2026-08-25

The MVP has progressed beyond synthetic-only testing:

- a private monday developer app named Deadline Ledger exists
- the app has only the MVP scopes `boards:read` and `users:read`
- a private QA board with Date and Timeline columns was created
- controlled live changes were generated: three Date changes and one Timeline change
- the exact GraphQL query used by the app returned those four live changes successfully
- live QA discovered that monday Activity Log represents Timeline columns as `column_type: "timerange"`; the parser now accepts and normalizes that payload
- the private app was promoted, installed and attached to the QA board as a real Board View
- a temporary standalone QA surface is attached for iframe/runtime verification

Still intentionally unverified:

- visual iframe rendering in the end-user monday UI
- `monday.storage.instance` reason save + reload persistence in the actual Board View runtime
- viewer/guest behavior
- production hosting

The draft PR remains unmerged until those runtime gates are closed.

## MVP boundary

### Included now

1. Board View UI.
2. Read the current board's Activity Log through the monday GraphQL API.
3. Parse `update_column_value` events where `column_type` is `date`, `timerange`, or a compatible `timeline` payload.
4. Normalize `timerange` to the product concept `timeline`.
5. Parse old/new values defensively from monday's JSON-string `data` payload.
6. Count repeated changes per item + deadline field.
7. Persist reason/category against the immutable activity event id with `monday.storage.instance`.
8. Mobile-width responsive layout.
9. Deterministic parser/metric tests including a regression fixture derived from the live monday Timeline payload shape.

### Explicitly not claimed yet

- The app **does not block** a user from editing a native Date/Timeline cell.
- A reason is therefore not technically mandatory before the edit in v0.1; unreasoned edits are surfaced as governance exceptions.
- Cross-board reporting is not included in v0.1.
- Background retention beyond monday's available Activity Log window is not included in v0.1.
- No AI is required for the product to work.

Those boundaries are intentional. They keep the first version small, useful and testable.

## Differentiation against current alternatives

### monday Activity Log

Native Activity Log already answers: **what changed, when, by whom, old → new**.

Deadline Ledger adds the project-control layer:

- how many times did this deadline move?
- which moves still have no explanation?
- what category caused the slip?
- what percentage of deadline moves are governed?

### Generic historical reporting apps

Existing apps can report broad historical board data and schedule exports. Deadline Ledger is not a report builder; it is an operational exception queue for deadline changes.

### Log/restore apps

Existing restore tools focus on undoing board mistakes. Deadline Ledger focuses on **why schedule commitments moved**, not restoring data.

## Technical approach

Client-side React board view using `monday-sdk-js`.

GraphQL scope required for MVP:

- `boards:read`
- `users:read` for user display names

Persistent reason metadata uses monday's instance-level app storage, so the MVP does not need an external database.

Activity query:

```graphql
query DeadlineLedgerActivity($boardId: [ID!]) {
  boards(ids: $boardId) {
    id
    name
    activity_logs(limit: 500, page: 1) {
      id
      event
      data
      user_id
      created_at
    }
  }
}
```

monday's Activity Log `data` is a JSON string and its payload varies by column type. Live QA confirmed Date uses `column_type: "date"` and Timeline uses `column_type: "timerange"` in the tested account. The parser treats the payload as variable data and extracts only fields required for deadline governance.

## Local development

Requires Node.js and a monday developer account.

```bash
cd marketplace/monday/deadline-ledger
npm install
npm test
npm run dev
```

## Acceptance test for v0.1

On the private developer QA board:

1. Move the same Date value twice on one item.
2. Move a Date value once on a second item.
3. Move one Timeline range.
4. Open Deadline Ledger and refresh.

Pass criteria:

- the first item's latest Date row shows `change #2`
- the second item shows `change #1`
- the Timeline change appears with the correct old and new range
- every unreasoned change is flagged `Reason missing`
- recording a reason removes that event from the Missing Reason filter after save
- refreshing the Board View preserves the recorded reason
- non-Date/Timeline activity does not appear

The API/read portion of this acceptance test has passed against live monday data. The iframe/storage portion remains the final browser-runtime gate.

## Commercial test after functional QA

Do **not** submit to Marketplace purely because the code works.

Before submission:

1. Close the iframe + instance-storage QA gate.
2. Test with at least three realistic project boards and 100+ mixed activity rows.
3. Confirm viewer/guest behavior and permission errors.
4. Replace the temporary QA host with production-grade hosting.
5. Re-run the current Marketplace search for functional duplication.
6. Prepare privacy policy, Terms of Service and support route required by Marketplace review.
7. Use monday-native monetization for any paid plan.

Initial pricing hypothesis, to validate rather than assume:

- Trial: 14 days
- Team: $19/month
- Pro: $49/month with cross-board rollup/digest when that feature exists

The north-star metric is not installs. It is **accounts with repeated deadline changes that actively record reasons and retain the app**.
