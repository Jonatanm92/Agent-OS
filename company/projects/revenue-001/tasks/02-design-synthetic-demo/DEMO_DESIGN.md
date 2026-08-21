# Architecture decision record — synthetic inquiry workflow

**Decision:** build a dependency-free Node.js demonstration with deterministic fixtures and a browser dashboard.  
**Status:** accepted for synthetic evidence only.  
**Date:** 2026-08-19.

## Why this design

A founder-validation demonstration must prove the workflow and safety gate without creating integration, hosting, model, credential, or data-processing liabilities. A transparent rule engine is easier to inspect than an opaque model and costs nothing per run. It also gives the commercial test something concrete to show before any production architecture is justified.

## Components

- `src/workflow.mjs` — pure deterministic classification, information checks, draft/task creation, approval gate, follow-up date, and transition log.
- `src/server.mjs` — local HTTP server with fixture/evaluation endpoints and static-file delivery.
- `fixtures/inquiries.json` — five synthetic cases using `.invalid` addresses.
- `public/` — responsive review dashboard; no external assets or analytics.
- `test/workflow.test.mjs` — deterministic contract tests.
- `scripts/build.mjs` — creates a review artifact and checks that safety notices/external-URL restrictions remain present.

## State contract

`RECEIVED → CLASSIFIED → INFORMATION_CHECKED → DRAFT_CREATED → INTERNAL_TASK_CREATED → APPROVAL_REQUIRED → FOLLOW_UP_SCHEDULED`

The approval state is deliberately non-retryable and cannot trigger an external action. Failed deterministic steps can be rerun by evaluating the same input again.

## Threat and failure model

- **Real data accidentally entered:** prominent warning; no persistence; localhost binding; 32 KiB body cap. Operator remains responsible for using synthetic data.
- **Path traversal:** static paths are resolved under the fixed public root.
- **Browser injection:** UI escapes rendered values; restrictive CSP is applied.
- **External exfiltration:** no third-party scripts, API endpoints, model calls, analytics, or production connectors.
- **False AI confidence:** confidence and matched source terms are visible; low confidence creates a flag.
- **Automated harm:** every output stops at `AWAITING_HUMAN_APPROVAL`; external action is absent rather than merely hidden.

## Build Engineer brief

Implement only the components above. Do not add authentication, database, cloud deployment, email/CRM connectors, billing, user accounts, model providers, or broad settings. A clean local happy path and one incomplete/failure path are sufficient.

## Acceptance checklist

- [x] Synthetic fixtures only.
- [x] Visible classification confidence and source fields.
- [x] Editable rules kept in one source module.
- [x] Missing-information detection.
- [x] Draft, internal task, follow-up, and audit trail.
- [x] Human approval is explicit and external action unavailable.
- [x] Deterministic tests and build command.
- [x] Exact run/cost/rollback instructions.
- [x] No customer credentials, production integrations, or model/API cost.

## QA / Security decision

**APPROVED FOR SYNTHETIC DEMONSTRATION ONLY.** This decision does not approve production use, personal data, external sending, or customer-system access.
