# Deadline Ledger — Marketplace readiness

Date: 2026-08-25

Status: **PRIVATE QA — NOT READY FOR MARKETPLACE SUBMISSION**

This checklist separates what is already implemented from what still requires product QA, legal/account information or Developer Center actions.

## Already implemented / verified

- [x] Unique product wedge: deadline-change governance, not a generic Activity Log clone.
- [x] Private monday developer app created.
- [x] Board View feature created and installed on a private QA board.
- [x] Minimal scopes only: `boards:read`, `users:read`.
- [x] Live board Activity Log query verified against controlled real monday Date activity.
- [x] Live Timeline payload verified; monday emits Timeline activity as `column_type: timerange`.
- [x] Parser supports `date`, `timeline` and live `timerange` payloads.
- [x] Repeated deadline changes counted per item + deadline column.
- [x] Missing-reason exception queue.
- [x] Reason text + category persisted against the exact activity-event ID.
- [x] Storage implementation uses optimistic concurrency (`previous_version`) and retries version conflicts.
- [x] View-only users are detected with `context.user.isViewOnly` and cannot write reasons.
- [x] `monday.execute('valueCreatedForUser')` fires only after a previously missing reason is successfully persisted.
- [x] Activity logs paginate in 500-row pages, capped at 5,000 rows with an explicit truncation notice.
- [x] Responsive UI.
- [x] Automated parser tests.
- [x] GitHub Actions runs test + production build and is currently used as the merge gate.

## Runtime QA still required

- [ ] Open the installed `Deadline Ledger` Board View inside the private QA board.
- [ ] Confirm the iframe loads the current QA code successfully.
- [ ] Confirm the four controlled Date/Timeline changes display correctly.
- [ ] Save a reason on one previously unreasoned event.
- [ ] Reload/switch views and verify the reason persists.
- [ ] Edit an existing reason and verify it persists.
- [ ] Confirm filtering updates immediately after save.
- [ ] Verify storage conflict behavior with two simultaneous editors when a second test user is available.
- [ ] Verify Viewer role cannot write.
- [ ] Verify Guest role behavior.
- [ ] Verify private, public and shareable boards.
- [ ] Stress-test at least 100 mixed activity events and one board with >500 activity-log rows.
- [ ] Uninstall/reinstall QA and document the resulting storage behavior.

## Production hosting/security blockers

The current installed QA feature uses temporary external QA hosting. **Do not submit this host to Marketplace.**

Before Marketplace submission:

- [ ] Choose a permanent HTTPS domain/host controlled by the developer.
- [ ] Deploy the production Vite build there or migrate to approved monday-hosted client-side code.
- [ ] TLS 1.2+ and HSTS verified.
- [ ] Create the required public `monday-app-association.json` on the verified domain.
- [ ] Run the required security/malware checks requested by monday review.
- [ ] Document every third-party domain used in production. Remove temporary RawGitHack/jsDelivr dependencies if possible.
- [ ] Define production log policy; avoid logging board content or reason text unless strictly necessary.
- [ ] Implement and document end-user metadata deletion within monday's required post-uninstall window if any storage moves outside monday instance storage.

## Legal/support blockers — owner information required

Do not invent these values. They require the legal operator's decision/information:

- [ ] Legal entity / individual developer name to use consistently in policies and Marketplace listing.
- [ ] Verified public domain.
- [ ] Support email on that domain.
- [ ] Public Privacy Policy URL.
- [ ] Public Terms of Service URL.
- [ ] Public support/how-to page URL that can be embedded by `*.monday.com`.
- [ ] Statement on whether users may be contacted for product/support communication.

## Monetization

All new Marketplace billing should use monday-native monetization.

Implementation status:

- [ ] Pricing model selected in Developer Center (Standard/feature-based is the current default hypothesis; not final).
- [ ] Pricing version and plan IDs created in Developer Center.
- [ ] Payoneer/vendor registration completed for payouts.
- [ ] Runtime paid-feature enforcement implemented using verified session/subscription state before any paid-only capability ships.
- [ ] Upgrade UX wired to `monday.execute('openPlanSelection', { isInPlanSelection: true })` when paid gating exists.

Current pricing hypothesis for validation, **not approved pricing**:

- Team: **$19/month** — single-board Deadline Ledger core.
- Pro: **$49/month** — only once cross-board rollup/digest exists and is verified.

Do not charge for Pro until the Pro-only functionality exists.

## Marketplace listing/review package

- [ ] Final app name availability rechecked immediately before submission.
- [ ] Short description and long description finalized.
- [ ] Screenshots produced from real app UI, not mockups presented as product output.
- [ ] Walkthrough/demo video.
- [ ] Installation and first-use documentation.
- [ ] Reviewer demo board with realistic Date + Timeline data.
- [ ] Reviewer access instructions.
- [ ] Scope justification for `boards:read` and `users:read`.
- [ ] Privacy/security questionnaire completed.
- [ ] Final competitor search immediately before submission to ensure the app is still materially differentiated.

## Merge gate for PR #11

PR #11 may move from draft to ready only after:

1. GitHub CI is green.
2. Live iframe renders correctly in the monday QA board.
3. Reason save + reload persistence passes.
4. No regression in Date and `timerange` handling.

Marketplace submission is a later gate and does **not** follow automatically from merging the MVP.
