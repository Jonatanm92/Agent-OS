---
kind: task
slug: build-synthetic-demo
name: Build and verify the synthetic workflow demonstration
project: revenue-001
assignee: build-engineer
priority: high
---

Implement the approved synthetic-demo acceptance contract in an isolated branch or worktree.

## Build rules

- inspect the selected codebase before editing
- use only synthetic fixtures and non-secret local configuration
- keep the human approval step explicit and impossible to bypass accidentally
- do not add production connectors, authentication, billing, or broad configurability unless the acceptance contract requires them
- include deterministic tests and a production build command
- record exact run instructions and known limitations

## Required evidence

- changed-file list and diff summary
- dependency installation result
- unit/integration test command and output
- type/lint/build command and output
- screenshot or manual-path evidence for the full happy path and one failure path
- privacy/security self-check
- approximate per-run model cost under the configured provider

## Ship gate

The task moves to review, not done, when implementation evidence is complete. Only QA / Security may issue `APPROVED`, and that approval covers a synthetic demonstration—not production or customer data.
