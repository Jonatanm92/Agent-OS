# Inquiry Command — synthetic workflow demonstration

A dependency-free, local-first demonstration for Revenue Mission 001. It turns a **synthetic** service inquiry into a transparent classification, missing-information checklist, response draft, internal task, approval gate, follow-up date, and transition log.

## Safety boundary

- Synthetic fixtures only. Example addresses use the reserved `.invalid` domain.
- No email, SMS, CRM, calendar, payment, browser automation, analytics, external API, or model provider.
- No persistence. Restarting the server resets the demonstration.
- Every result ends in `AWAITING_HUMAN_APPROVAL`; `externalActionAllowed` is always `false`.
- The server binds to `127.0.0.1` by default and applies a restrictive Content Security Policy.
- This is evidence for a founder-validation conversation, not a production customer system.

## Run

```bash
npm test
npm run build
npm start
```

Open `http://127.0.0.1:4173`.

## Acceptance path

1. The five deterministic fixtures appear in the inbox.
2. Selecting a case shows source fields, confidence, urgency, missing information, answer draft, internal task, follow-up date, and full transition log.
3. The approval card visibly states that external action is blocked.
4. The custom form accepts fictitious data and returns a new local result.
5. The deliberately vague fixture exposes missing contact, location, and classification information rather than inventing values.

## Verification evidence

- Unit test: `npm test`
- Production artifact check: `npm run build`
- Health endpoint: `GET /health`
- Fixture endpoint: `GET /api/demo`
- Local evaluation: `POST /api/evaluate`

The build script fails if the safety notices disappear or if the browser application introduces an external URL.

## Cost

This demonstration makes zero model/API calls. Local per-run model cost is **0 SEK**. Development-agent costs belong to the Agent OS provider ledger and are not attributed to a customer workflow run.

## Rollback

Delete `company/projects/revenue-001/demo` or revert its commit. It has no database migration, remote resource, account, credential, or production integration to clean up.

## Known limitations

The classifier is a transparent keyword/rule engine, not a production AI model. It is deliberately bounded to prove workflow and approval behavior before validating demand, data access, integrations, model quality, security terms, and willingness to pay.
