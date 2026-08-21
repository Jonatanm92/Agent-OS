---
name: acceptance-contract
description: Convert approved work into explicit scope, safety boundaries, deterministic tests, review evidence, and rollback conditions before implementation.
---

# Acceptance Contract

Create this contract before coding begins.

## Required sections

### Outcome

- user and triggering event
- observable result
- metric and minimum pass threshold

### Scope

- exact happy path
- inputs and outputs
- integrations and environments
- exclusions and non-goals
- human approval points

### Data and security

- data classification and minimization
- identity and authorization
- secret source and access boundary
- retention, deletion, logging, and redaction
- threat cases and mitigations

### Failure behavior

- validation errors
- provider or network failure
- retries, timeout, idempotency, and duplicate prevention
- partial completion and recovery
- manual fallback

### Verification

- deterministic unit/integration tests
- type check, lint, and production build command
- synthetic fixture
- negative tests
- manual UI path and screenshot evidence when required
- performance/cost ceiling
- regression checks

### Release

- isolated branch/worktree
- reviewer independent of implementer
- deployment owner gate
- canary or limited exposure
- rollback command and data recovery
- known limitations and support owner

## Completion rule

A task is not complete because files exist or an agent says “done.” It is complete only when every material acceptance criterion maps to recorded evidence and independent QA approves the declared scope.
