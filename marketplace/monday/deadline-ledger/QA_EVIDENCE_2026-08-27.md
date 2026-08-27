# Deadline Ledger — QA evidence

Date: 2026-08-27

This file distinguishes what has actually been demonstrated from what remains a release gate.

## PASS — private board Activity Log path

Private QA board `Deadline Ledger — QA` has real controlled Date and Timeline activity.

Verified live:

- Date: old → new payloads
- repeated Date changes
- Timeline: old range → new range
- monday emits live Timeline Activity Log payloads as `column_type: "timerange"`
- exact GraphQL query used by the Board View returns those events

## PASS — Activity Log pagination semantics

The private QA board was queried live using three separate Activity Log pages with a small test limit of five rows/page.

Observed:

- page 1: five event IDs
- page 2: five different event IDs
- page 3: the remaining three event IDs
- no overlap between the returned pages
- event order continued from newer to older activity across pages

This verifies that monday's `activity_logs(limit, page)` paging advances through distinct history rather than repeating page 1. The production app uses the same paging arguments with 500 rows/page and a bounded maximum of 10 pages.

## PASS — public board Activity Log path

A temporary synthetic public board was created through the monday API, given a Date column/item, and changed from:

`2026-08-27 → 2026-08-29`

After Activity Log propagation, the board returned one matching `update_column_value` event with the correct old/new values.

The temporary board was deleted in the same QA run.

## PASS — shareable board Activity Log path

A separate temporary synthetic shareable board was created with the same controlled Date transition.

After Activity Log propagation, it returned one matching `update_column_value` event with the correct old/new values.

The temporary board was deleted in the same QA run.

## Important propagation finding

Activity Log updates are not guaranteed to be immediately visible after a mutation. The first fast-read attempt returned no events on the temporary boards. A polling rerun observed:

- public board: event visible on first 2-second polling attempt
- shareable board: event visible on third 2-second polling attempt

This is not a parser failure; it is a data-availability timing behavior that matters for UX.

Product implication: a user who clicks Refresh immediately after moving a deadline may need a short interval before monday exposes the Activity Log event. Do not claim synchronous capture.

## PASS — deterministic code/build

The feature branch uses a committed npm lockfile and CI runs:

`npm ci -> npm test -> npm run build`

The locked CI chain is green on the current release-hardening work.

## PASS — storage architecture at code/review level

Product code now uses board-namespaced global monday app storage with optimistic `previous_version` writes and best-effort migration from the old instance-storage prototype.

Reason audit metadata supports:

- creator
- created time
- latest editor
- latest update time
- monotonically derived revision number

The same-event concurrency path derives a new revision from the latest stored reason after a version conflict rather than replaying a stale precomputed entry.

## NOT YET PASS — embedded persistence

Still requires the real hosted Board View to demonstrate:

1. reason save succeeds inside monday iframe
2. reason remains after reload/view switch
3. edit increments revision and preserves creator metadata

Do not mark this pass until there is a real durable HTTPS deployment.

## NOT YET PASS — roles

Viewer behavior is implemented in code with `context.user.isViewOnly`, but has not yet been exercised with a real second Viewer account in the embedded app.

Admin/member/guest/viewer matrix remains a Marketplace QA gate.

## NOT YET PASS — full app on public/shareable boards

The **core Activity Log data path** has passed on private, public and shareable boards.

The full embedded Board View UI has not yet been installed/exercised on public/shareable boards. Keep those as distinct claims.

## NOT YET PASS — production deployment

Dedicated Netlify project exists but is intentionally still empty until the source/build is uploaded from an environment with working outbound network access.

Do not point the monday live app at the empty Netlify URL.
