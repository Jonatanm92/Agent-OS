# Deadline Ledger — Marketplace listing draft

Status: copy draft only. Do not submit until runtime QA and legal/security requirements pass.

## Name

**Deadline Ledger**

## One-line value proposition

Make every moved deadline accountable: see what changed, how often it moved, and which changes still need an explanation.

## Short description

Deadline Ledger turns monday.com Date and Timeline activity into a focused schedule-change control view. Track old → new dates, change counts, who moved the deadline, and missing change reasons without digging through a generic activity log.

## Problem

Project dates move constantly, but teams often lose the context behind those changes. A raw activity log can show that a value changed, yet project leaders still need to answer:

- How many times has this deadline moved?
- Which schedule changes have no explanation?
- What caused the change — client, scope, dependency, resource, risk or correction?
- Which projects are repeatedly slipping?

## Core features — v0.1

- Date and Timeline change ledger for the current board.
- Old value → new value for each deadline move.
- Actor and timestamp from monday Activity Log.
- Change counter per item + deadline field.
- Missing-reason queue.
- Reason category + free-text explanation tied to the exact change event.
- Governance summary: total changes, impacted items, missing reasons and governed percentage.
- Search and reason-state filters.
- View-only mode for monday Viewers.

## What Deadline Ledger is not

- Not another generic Activity Log viewer.
- Not a Gantt/baseline replacement.
- Not an AI assistant.
- Not a project-management suite.

It is a deliberately narrow **schedule change-control layer**.

## Initial audience

- PMOs
- project managers
- agencies
- implementation teams
- operations teams
- client-delivery teams
- any monday board where deadline movement needs an audit trail and explanation

## Suggested screenshots

1. **Missing Reason queue** — several deadline moves with change # counters.
2. **Reason editor** — category + explanation against one exact event.
3. **Governance summary** — total changes / missing reasons / governed percentage.
4. **All Changes view** — old → new dates with actor/time.
5. **Viewer mode** — read-only user can review but not edit.

Use screenshots from the real production app after QA. Do not use a mockup that implies unimplemented functionality.

## Pricing hypothesis — not final

### Team — $19/month

Intended v0.1 value:

- current-board Deadline Ledger
- Date + Timeline change tracking
- reason capture
- governance metrics
- filters/search

### Pro — $49/month

Do not activate this tier until these features actually exist:

- cross-board rollup
- scheduled digest
- portfolio-level schedule-change reporting
- export/reporting controls beyond the native board view

## First-use flow

1. Install Deadline Ledger.
2. Add the Deadline Ledger Board View to a board that uses Date or Timeline columns.
3. Open the view to see detected schedule changes.
4. Filter to **Missing reason**.
5. Record the reason behind an unexplained deadline move.
6. Use the governance summary to see whether schedule changes are being documented.

## Reviewer demo scenario

The review board should contain at minimum:

- two project items;
- one Date column;
- one Timeline column;
- multiple controlled deadline changes on the same item;
- at least one reasoned and one unreasoned event.

Expected reviewer result:

- repeated moves show `change #1`, `change #2`, etc.;
- Date and Timeline events both appear;
- missing reasons are visibly flagged;
- a saved reason persists after reload;
- Viewer role cannot write.

## Positioning line candidates

Preferred:

**Know why every deadline moved.**

Alternates:

- **Turn schedule changes into an accountable audit trail.**
- **Stop losing the reason behind moved deadlines.**
- **Deadline history with the context your Activity Log is missing.**
