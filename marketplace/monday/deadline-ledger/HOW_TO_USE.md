# Deadline Ledger — How to use

## What it does

Deadline Ledger gives a monday board a focused schedule-change control view. It reads Date and Timeline changes from the board Activity Log and shows which deadline moves still need an explanation.

## Before you start

The board should contain at least one **Date** or **Timeline** column.

Deadline Ledger does not modify your Date/Timeline values. v0.1 observes native monday changes after they happen and manages the governance context around those changes.

## Add the view

1. Install Deadline Ledger on the monday account.
2. Open the board you want to govern.
3. Add the **Deadline Ledger** Board View.
4. Open the view.

The app reads board activity and keeps only Date/Timeline change events in its ledger.

## Understand a change row

Each row shows:

- item name
- Date/Timeline column
- previous value → new value
- who changed the deadline
- when the deadline changed
- `change #N` for that item + deadline field
- whether the change has a recorded reason

`change #1`, `change #2`, etc. make repeated schedule movement visible without manually counting Activity Log entries.

## Resolve a missing reason

1. Open **Missing reason**.
2. Choose a deadline change.
3. Select an optional reason category:
   - Scope
   - Client
   - Dependency
   - Resource
   - Risk
   - Correction
   - Other
4. Enter a free-text explanation (3–1,000 characters).
5. Select **Save reason**.

The reason is tied to that exact Activity Log event, not merely to the item's current deadline.

## Edit an existing reason

Select **Edit** on a reasoned event and save the correction.

Deadline Ledger retains audit metadata for the reason, including its revision number and the latest editor/time. Earlier prototype data is migrated when possible.

## Filters

**Missing reason** — schedule changes without an explanation.

**All changes** — every detected Date/Timeline move.

**Reasoned** — changes that already have governance context.

The search box matches item, deadline column, old/new value, category and reason text.

## Governance summary

The top metrics show:

- total deadline changes
- impacted items
- missing reasons
- governed percentage

The governed percentage is the share of detected deadline moves that currently have a recorded reason.

## View-only users

monday Viewers can inspect the ledger and recorded reasons but cannot add or edit reason data.

## Data and storage

v0.1 stores reason metadata in monday's global app storage, namespaced by board ID. It does not use an external customer database.

The app requests only:

- `boards:read`
- `users:read`

## Activity-history boundary

v0.1 loads the newest board activity in 500-row pages with a maximum of 5,000 activity rows per refresh. If the cap is reached, the UI explicitly says that older history was not loaded.

Deadline Ledger does not yet run an independent background event archive, so it should not be marketed as unlimited-retention compliance storage.

## What v0.1 does not do

- block a Date/Timeline cell edit before it happens
- replace monday's Gantt or baseline tools
- provide generic board reporting
- provide cross-board portfolio governance
- use AI to infer or invent change reasons

A future Guard mode may add a more active reason-required workflow, but it is not part of the current product promise.
