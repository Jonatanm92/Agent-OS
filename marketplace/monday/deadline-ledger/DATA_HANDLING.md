# Deadline Ledger — Data handling

Status: technical data-flow description for Marketplace/privacy preparation. This is not a substitute for the final Privacy Policy under the real legal entity/domain.

## Architecture

v0.1 is intentionally small:

`monday Board View -> static frontend -> monday API + monday storage`

There is no external customer-data database in v0.1.

## monday data read transiently in the browser

Deadline Ledger reads the current board's Activity Log and user names to render schedule-change context.

Transient fields may include:

- board ID and board name
- item ID and item name
- Date/Timeline column ID and title
- previous Date/Timeline value
- new Date/Timeline value
- monday user ID associated with the board activity
- activity timestamp
- user display name for UI attribution

These values are used in the active Board View session. Deadline Ledger does not copy the full Activity Log into an external database.

## Data persisted by Deadline Ledger

Reason metadata is persisted in monday global app storage under a board-scoped key:

`deadline-ledger:reasons:v2:board:<boardId>`

Each reason record is keyed by the monday Activity Log event ID and may contain:

- free-text reason (3–1,000 characters)
- optional reason category
- monday user ID that first recorded the reason
- monday user ID that most recently edited the reason
- creation timestamp
- latest update timestamp
- revision count

Legacy prototype fields (`recordedAt`, `recordedBy`) remain readable and are normalized by the app.

## Storage scope

The app uses global `monday.storage`, not an external data store, for the governance metadata.

Keys are namespaced by board ID so reason data from different boards is not mixed in one value.

The app uses optimistic versioning (`previous_version`) to reduce lost updates when multiple people write governance context concurrently.

## Legacy migration

An earlier private prototype used Board View instance storage under:

`deadline-ledger-reasons-v1`

If the new board-scoped global store is empty, the app performs a best-effort one-time migration of accessible legacy reason data. Failure to read/migrate legacy data does not block normal use of the new storage architecture.

## Permissions

v0.1 requests only:

- `boards:read`
- `users:read`

It does not require `boards:write` to deliver its current feature set.

## View-only behavior

The Board View checks `context.user.isViewOnly` for product behavior and hides reason-writing controls from monday Viewers.

The app must not treat unsigned UI context as a cryptographic authorization mechanism for future paid entitlements; paid-plan security is a separate release gate.

## External hosting

The intended production frontend host is the dedicated Netlify project `deadline-ledger`.

Static hosting necessarily receives normal HTTP/CDN request metadata (for example IP/user-agent information handled by the hosting provider). Deadline Ledger v0.1 does not intentionally send board Activity Log content or saved reason data to Netlify functions, analytics, AI services or an external database.

No analytics SDK is included in v0.1.

## AI

No customer board data is sent to an AI model by Deadline Ledger v0.1.

ForgeHQ/AI may assist development internally, but AI is not part of the deployed customer data flow.

## Secrets

Never place these in browser code, Git or public documentation:

- monday Client Secret
- monday Signing Secret
- Netlify access tokens
- temporary connector/proxy credentials

If a future serverless entitlement endpoint is implemented, secrets belong in host environment variables and the browser sends only a short-lived monday session token.

## Retention boundary

Deadline Ledger v0.1 does not promise unlimited historical retention of monday Activity Log data. It reads available board activity at runtime and bounds a refresh to the newest 5,000 activity rows.

Persisted reason metadata remains in monday storage according to monday platform storage behavior and the app lifecycle.

## Uninstall/deauthorization

The final Privacy Policy must describe the actual monday-storage lifecycle accurately. v0.1 does not maintain an external customer database that requires a separate external deletion job.

Do not claim a specific automatic deletion timeframe unless it is verified against the current monday Marketplace/storage documentation at submission time.

## Third parties to disclose in final Privacy Policy

At minimum, if used in the production release:

- monday.com — application platform, API and app storage
- Netlify — static frontend hosting/CDN

Do not list development-only services as production processors unless they actually receive customer production data.
