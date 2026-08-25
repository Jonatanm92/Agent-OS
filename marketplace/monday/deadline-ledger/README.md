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

## MVP boundary

### Included now

1. Board View UI.
2. Read the current board's Activity Log through the monday GraphQL API.
3. Parse `update_column_value` events where `column_type` is `date` or `timeline`.
4. Parse old/new values defensively from monday's JSON-string `data` payload.
5. Count repeated changes per item + deadline field.
6. Persist reason/category against the immutable activity event id with `monday.storage.instance`.
7. Mobile-width responsive layout.
8. Deterministic parser/metric tests.

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

monday's Activity Log `data` is a JSON string and its payload varies by column type. The parser therefore treats the payload as untrusted/variable data and only extracts fields needed for Date/Timeline changes.

## Local development

Requires Node.js and a monday developer account.

```bash
cd marketplace/monday/deadline-ledger
npm install
npm test
npm run dev
```

For actual monday embedding, follow the current monday app CLI flow:

```bash
npm i -g @mondaycom/apps-cli
mapps init -t YOUR_TOKEN
mapps tunnel:create -p 5173 -a YOUR_APP_ID
```

In Developer Center:

1. Create an app named `Deadline Ledger` (or a replacement unique name if unavailable).
2. Add a **Board View** feature.
3. Add `boards:read` and `users:read` scopes.
4. Point the feature URL to the secure tunnel URL during development.
5. Add the view to a test board containing Date and Timeline columns.
6. Change those dates several times and verify that Deadline Ledger shows the correct old/new values and counts.

For production, build and upload/host using the current monday app deployment flow rather than leaving a development tunnel in place.

## Acceptance test for v0.1

Create a monday developer test board with two items and one Date column:

1. Set Item A to 2026-08-25.
2. Move Item A to 2026-08-28.
3. Move Item A again to 2026-09-01.
4. Move Item B once.
5. Open Deadline Ledger and refresh.

Pass criteria:

- Item A shows two deadline-change events in correct reverse chronology.
- Item A's latest row shows `change #2`.
- Item B shows `change #1`.
- Every unreasoned change is flagged `Reason missing`.
- Recording a reason removes that event from the Missing Reason filter after save.
- Refreshing the board view preserves the recorded reason.
- Non-Date/Timeline activity does not appear.

## Commercial test after functional QA

Do **not** submit to Marketplace purely because the code works.

Before submission:

1. Test with at least three realistic project boards and 100+ mixed activity rows.
2. Verify Date and Timeline payload shapes against live monday data.
3. Confirm viewer/guest behavior and permission errors.
4. Search the current Marketplace again for functional duplication.
5. Prepare privacy policy, Terms of Service and support route required by Marketplace review.
6. Use monday-native monetization for any paid plan.

Initial pricing hypothesis, to validate rather than assume:

- Trial: 14 days
- Team: $19/month
- Pro: $49/month with cross-board rollup/digest when that feature exists

The north-star metric is not installs. It is **accounts with repeated deadline changes that actively record reasons and retain the app**.
