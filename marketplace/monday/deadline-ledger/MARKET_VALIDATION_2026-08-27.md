# Deadline Ledger — market revalidation

Date: 2026-08-27

## Decision

**CONTINUE — focused change-control wedge survives the current native-feature and competitor kill tests.**

Do not broaden Deadline Ledger into generic board history, reporting, analytics or export. Those jobs already have strong incumbents.

## Native-feature kill test: monday Validation API

Current monday validation rules (API 2026-07+) can enforce constraints on the proposed/current state of an item and can express conditional rules such as “if status is Done, description must not be empty”. They are enforced in the monday UI and API.

Official docs:

- https://developer.monday.com/api-reference/docs/validation-rules-guide
- https://developer.monday.com/api-reference/reference/validations

This does **not** solve Deadline Ledger’s core job:

> When a Date/Timeline value moves from an old commitment to a new commitment, require/track a reason for that specific transition.

The native validation model has no previous-value/new-value comparison and no “this column was changed” transition operator. A static rule can require a Reason field whenever a Date currently has a value, but it cannot distinguish an initial date from a later date move and cannot bind a reason to a specific old → new transition.

**Result: native Validation API does not kill the product.**

## Direct buyer-pain evidence remains exact

monday Community thread:

https://community.monday.com/t/when-changing-date-fields-make-it-mandatory-to-add-a-reason-for-change/61465

The use case describes a main roadmap shared by 10 project managers where dates change often. The requester wants the person changing a date to provide a mandatory free-text reason and wants the reason to be reportable.

Feature request:

https://community.monday.com/t/make-it-mandatory-to-give-a-reason-when-a-status-or-date-column-changes/61971

A community workaround suggests creating an automated update, marking the item as “waiting on reason”, then clearing that state once a reason is added. That reinforces the operational exception/remediation workflow we are building.

## Competitor kill test: generic reporting is already occupied

`Board Reports Automations` by Fantasy Media LTD currently has roughly 17.7k installs, a 4.9 rating and about 492 installs/month. It explicitly covers current + historical board reporting and paid report automation.

Source:

https://apps-for-monday.com/apps/10000291/

Other reporting/history products also exist. Therefore Deadline Ledger must **not** position as:

- historical board reports
- activity-log viewer
- generic audit log
- CSV/Excel history export
- broad analytics dashboard

## Product identity after revalidation

**Deadline Ledger = schedule change control.**

The primary questions are:

1. Which commitments moved?
2. What was the old value and the new value?
3. Who made the schedule change?
4. How many times has this deadline moved?
5. Which moves have no explanation?
6. Why did each move happen?
7. Who recorded/edited the explanation and when?

This is intentionally narrower than historical reporting.

## v0.1 commercial wedge

**Audit / remediation mode**

- detect Date + Timeline changes
- old → new values
- actor/time
- change number per item + deadline field
- missing-reason exception queue
- free-text reason + optional category
- reason revision metadata
- governance percentage
- read-only user behavior

## Next paid differentiation

**Guard mode** is the candidate paid expansion, but it is not yet approved as a promise.

Goal: turn the after-the-fact exception into a controlled change workflow, for example by flagging a date move immediately, assigning a reason-required state, notifying the relevant owner/changer and clearing the exception once the reason is supplied.

Do not claim that Deadline Ledger can technically block a native cell edit before it occurs until a real supported interception/workflow architecture has been demonstrated.

## Storage architecture correction

Audit reasons must not depend on Board View instance storage because instance data is tied to one app feature instance and can reset across major app-version changes.

Deadline Ledger now uses global monday app storage, namespaced by board ID, with optimistic concurrency. Legacy instance-level reasons are migrated best-effort when a board’s global reason store is still empty.

This keeps the audit context shared at the account/app level and avoids treating an ephemeral view instance as the audit database.

## Status

Market status: **GO**

Submission status: **NOT READY**

Remaining primary gates:

- embedded Board View render + global storage save/reload QA
- durable production hosting/deployment verification
- privacy policy / Terms / support domain and entity details
- monday native pricing-plan setup and vendor payout setup
- role/board-type/uninstall-reinstall QA
- final Marketplace duplicate search immediately before submission
