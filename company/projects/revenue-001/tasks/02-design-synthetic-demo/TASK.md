---
kind: task
slug: design-synthetic-demo
name: Design the synthetic workflow demonstration
project: revenue-001
assignee: solutions-architect
priority: high
---

Design a local or isolated demonstration of the proposed inquiry-to-follow-up workflow using synthetic company and customer data only.

## Required behavior

1. Accept a synthetic web-form or email inquiry.
2. Extract and classify the inquiry with visible confidence and source fields.
3. Detect required missing information from an editable rule set.
4. Draft a response without sending it.
5. Create an internal task record.
6. Require explicit human approval before any external action.
7. Create a follow-up reminder.
8. Log every transition and allow a failed step to be retried safely.

## Architecture constraints

- no customer credentials or production integrations
- no autonomous sending
- deterministic fixture and expected output
- local-first where practical
- simple components before infrastructure
- exact test, build, run, screenshot, cost, and rollback instructions

## Acceptance evidence

An architecture decision record and acceptance contract exist; QA / Security confirms the design is safe for synthetic demonstration; the Build Engineer receives a bounded implementation brief.
