# Deadline Ledger — live market validation

Date: 2026-08-25

## Decision

**GO TO LIVE MVP TEST — 84/100**

Do not submit to Marketplace yet. The current evidence is strong enough to build and test a narrow MVP, but not strong enough to claim product-market fit.

## Buyer problem evidence

### Explicit request: track number of due-date changes

monday Community: `Tracking due date changes?`

https://community.monday.com/ask-the-com/post/tracking-due-date-changes-ekiSM61i0q7he4k

A user asks how to track the number of times a deadline/due date changed before completion. This maps directly to Deadline Ledger's change counter.

### Explicit request: mandatory free-text reason for date changes

monday Community: `When changing date fields, make it mandatory to add a reason for change?`

https://community.monday.com/t/when-changing-date-fields-make-it-mandatory-to-add-a-reason-for-change/61465

The described use case is a main roadmap used by ten project managers. Dates change often, and the team wants the person changing a date to provide a free-text reason that can be reported on.

Feature request mirror:

https://community.monday.com/t/make-it-mandatory-to-give-a-reason-when-a-status-or-date-column-changes/61971

This is the strongest direct evidence for the initial product wedge.

## Native-feature kill test

monday already has a capable Activity Log:

https://support.monday.com/hc/en-us/articles/115005310745-The-Activity-Log

Native capability includes:

- changed Dates and Statuses
- person who made the change
- item/group context
- old value → new value
- filtering (plan dependent)
- Item Activity Log
- Excel export of column-value changes

Therefore these are **not products** we should build:

- generic activity history
- generic old/new-value viewer
- generic activity export

Native functionality does **not** provide the focused workflow we are validating:

- deadline-change count per item/column
- exception queue for changed dates with no reason
- reason categories and free-text explanation tied to a specific date-change event
- governance percentage / change-control health
- controlled deadline-change workflow (planned later)

monday's board activity log API is currently available and board-scoped:

https://developer.monday.com/api-reference/reference/activity-logs

It can return up to 10,000 logs for a board query and exposes `event`, `data`, `user_id` and `created_at`. The data payload is JSON encoded as a string.

## Marketplace competitor kill test

### LogBack

Third-party marketplace index:

https://apps-for-monday.com/apps/10000238/

Captured 2026-08-25:

- 1,529 installs
- ~39 installs/month
- paid
- updated January 5, 2026

Job: undo/restore board activity. This validates willingness to install/pay around activity history, but the product job is recovery, not deadline governance.

### Board Reports & Export

https://apps-for-monday.com/apps/10000861/

Captured 2026-08-25:

- 123 installs
- ~8 installs/month
- free plan plus paid tiers
- listed prices from $21/month through $299/month
- historical/current board reporting and scheduled reports

Overlap: historical data, who/what/when, audits.

Difference: it is a general report builder. Deadline Ledger is a narrow operational queue for schedule-change accountability. We must maintain that difference to avoid Marketplace duplication rejection.

### Date & Timeline Mutations

https://apps-for-monday.com/apps/10000267/

Captured search data:

- 755 installs
- ~24 installs/month
- paid

Job: automate Date/Timeline mutations. It proves that teams install paid apps for date/timeline workflow gaps, but it is not an audit/reason product.

### Timeline auto-sync

https://apps-for-monday.com/apps/10000737/

Captured search data:

- 880 installs
- ~58 installs/month
- 4.9 rating (7 ratings)
- paid

Job: keep Date/Timeline columns synchronized. Strong evidence that small, narrow date workflow utilities can acquire meaningful installs.

## Marketplace acceptance risk

monday's current developer policy explicitly rejects functional duplication and apps without clear unique value:

https://developer.monday.com/apps/docs/monday-app-development-process
https://developer.monday.com/apps/docs/submit-your-app

This means Deadline Ledger must not drift into a generic activity-log clone. The product identity is:

> **Schedule change control: count deadline moves, explain them, surface ungoverned changes.**

The current MVP is intentionally built around that wedge.

## Technical feasibility

### Feasible now

- Board View in React.
- Client-side context through `monday-sdk-js`.
- Board Activity Log query with `boards:read`.
- User display names with `users:read`.
- Per-view persistent reason metadata through `monday.storage.instance`.
- No external database required for v0.1.

### Technical limitations / risks

1. Native Date edits cannot simply be intercepted by a board view. v0.1 detects changes after they happen.
2. `monday.storage.instance` is tied to the app instance; cross-board reporting requires a different persistence design.
3. Native activity retention varies by monday plan. Long-term independent history requires event capture/storage in a later version.
4. Activity `data` schema varies by column type; live payload tests are mandatory before release.
5. Cross-board/user Activity Log APIs are evolving; production v0.1 should stay with stable board-scoped logs.

## Commercial score

| Dimension | Score | Notes |
| --- | ---: | --- |
| Explicit pain evidence | 18/20 | Direct community requests map almost exactly to product behavior. |
| Distribution | 18/20 | Marketplace provides native discovery/install path. |
| Competition | 13/20 | Adjacent history/report apps exist; focused change-control wedge remains distinguishable. |
| Build feasibility | 15/15 | Board logs + storage support MVP without external backend. |
| Recurring-value potential | 8/10 | Governance value repeats on active project boards. |
| Support/security burden | 7/10 | Read-heavy MVP is low risk; later background capture raises burden. |
| Monetization evidence | 5/5 | Adjacent narrow apps are paid and continue to acquire installs. |
| **Total** | **84/100** | GO to live MVP test. |

The score reflects evidence for proceeding to a live product test, not proven revenue for this exact wedge.

## First pricing hypothesis

Not approved as final pricing:

- 14-day trial
- Team: $19/month
- Pro: $49/month after cross-board rollup/digest exists

Do not add a large enterprise plan until actual usage/support evidence warrants it.

## Next gates

1. Run `npm test` — parser suite must remain green.
2. Create a monday developer app + Board View.
3. Test with real Date and Timeline activity payloads.
4. Verify reason persistence across reloads and two different users.
5. Test viewer/guest behavior.
6. Seed 100+ mixed activity events and measure load time/errors.
7. Re-run competitor search immediately before Marketplace submission.
8. Only then implement native monetization, privacy/terms/support pages and submission assets.
