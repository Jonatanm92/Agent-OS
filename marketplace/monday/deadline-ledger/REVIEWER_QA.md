# Deadline Ledger — Marketplace reviewer QA

Status: reviewer script draft. Replace URLs/contact details only with real production values before submission.

## Product under review

Deadline Ledger is a Board View for schedule change control. It is intentionally narrower than monday Activity Log and general reporting products.

Core value:

> Detect a specific deadline move, show old → new, count repeated moves, and attach an auditable reason to that exact change event.

## Recommended reviewer board

Use a board with:

- Item: `Project Alpha`
- Item: `Project Beta`
- Date column: `Due date`
- Timeline column: `Timeline`

Seed the following activity:

1. Alpha Due date: Aug 25 → Aug 28.
2. Alpha Due date: Aug 28 → Sep 1.
3. Beta Due date: Aug 20 → Aug 22.
4. Alpha Timeline: Aug 25–29 → Aug 26–30.

## Acceptance path

### 1. Load the Board View

Expected:

- Deadline Ledger loads without asking the user to copy an API token.
- Date and Timeline changes appear.
- unrelated Activity Log events do not appear.

### 2. Verify transition detail

For each change, verify:

- item name
- deadline field name
- previous value
- new value
- change actor
- timestamp

Expected on Project Alpha Due date:

- first move is `change #1`
- second move is `change #2`

### 3. Verify exception queue

Open **Missing reason**.

Expected:

- every seeded transition without reason context appears as an exception.
- top summary shows a matching missing-reason count.

### 4. Record a reason

On Project Alpha's latest Due date move:

- Category: `Client`
- Reason: `Client approval moved to Tuesday.`

Expected:

- save succeeds.
- event changes to `Reason recorded`.
- event leaves the Missing reason filter.
- governed percentage increases.
- monday `valueCreatedForUser` is fired only after the successful first save.

### 5. Verify persistence

Reload the Board View or switch to another board view and return.

Expected:

- the exact reason remains attached to the same deadline-change event.
- reason metadata is read from board-namespaced global monday app storage.

### 6. Edit the reason

Edit the saved reason and save again.

Expected:

- new text appears.
- revision number increments.
- latest editor/time metadata updates.
- the original created metadata remains preserved in storage.

### 7. Viewer test

Open the Board View as a monday Viewer/read-only user.

Expected:

- changes and existing reasons are readable.
- Add reason / Edit controls are not offered.
- the app does not attempt a reason write.

### 8. Large-activity behavior

Use a board with more than 500 Activity Log rows.

Expected:

- pagination continues beyond page 1.
- no duplicate deadline events are introduced by pagination.
- v0.1 stops at its bounded maximum of 5,000 activity rows.
- if the maximum is reached, the UI explicitly says older history was not loaded.

## Security/data expectations

v0.1 requests:

- `boards:read`
- `users:read`

v0.1 does not require `boards:write`.

Persisted customer-controlled metadata:

- reason text
- optional reason category
- monday user IDs for reason creation/update attribution
- timestamps
- revision count

The data is stored using monday global app storage, namespaced by board ID. No external customer-data database is part of v0.1.

## Known intentional limitations

Do not fail the app for behavior it does not claim:

- it does not intercept/block a native date edit before it occurs
- it does not provide cross-board rollup in v0.1
- it is not an unlimited historical archive beyond monday Activity Log availability
- it is not a generic reporting/analytics replacement

## Submission stop conditions

Do not submit if any of these are true:

- Board View deployment is still temporary/unverified
- a saved reason disappears after reload
- Date works but live Timeline (`timerange`) does not
- Viewer can write reason data
- CI test/build is red
- legal/support URLs contain placeholders
- pricing claims features that are not implemented
