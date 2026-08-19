# Build evidence — Inquiry Command synthetic demo

**Status:** review artifact complete  
**Scope approved:** synthetic demonstration only  
**Production/customer-data status:** not approved

## Changed-file set

- `demo/package.json`
- `demo/README.md`
- `demo/src/workflow.mjs`
- `demo/src/server.mjs`
- `demo/public/index.html`
- `demo/public/app.js`
- `demo/public/styles.css`
- `demo/fixtures/inquiries.json`
- `demo/test/workflow.test.mjs`
- `demo/scripts/build.mjs`

## Implementation summary

The demo accepts a synthetic inquiry, classifies service and urgency with visible evidence, identifies missing information, drafts a non-sent response, creates an internal task, schedules follow-up, logs transitions, and stops at a mandatory human approval gate. It includes no external action capability.

## Dependency result

No third-party runtime or development dependency is used. The demo runs on Node.js 20.19+ and therefore has no package-install or supply-chain requirement beyond the reviewed Node runtime.

## Verification commands

```bash
npm test --prefix company/projects/revenue-001/demo
npm run build --prefix company/projects/revenue-001/demo
```

The root Company OS CI invokes both commands before the server test suite. The branch is not eligible for merge unless tests, build, and dependency audits pass.

## Manual evidence paths

### Happy path

1. Run `npm start --prefix company/projects/revenue-001/demo`.
2. Open `http://127.0.0.1:4173`.
3. Select “Offert på laddboxar”.
4. Confirm category `El`, visible confidence/source terms, complete information status, response draft, internal task, follow-up, transition log, and blocked external action.

### Failure/incomplete path

1. Select “Behöver hjälp i lokalen”.
2. Confirm low-confidence `Övrigt`, missing contact/channel/location fields, manual-classification warning, and no invented values.
3. Confirm the output still ends at `AWAITING_HUMAN_APPROVAL`.

## Privacy/security self-check

- synthetic `.invalid` contacts only;
- no storage, credentials, remote API, analytics, or third-party asset;
- localhost default and restrictive CSP;
- request-size and path-boundary checks;
- UI output escaping;
- external action is absent and explicitly false in the workflow object;
- no production or customer-data claim.

## Per-run cost

0 SEK in model/API charges. The demonstration is deterministic. Agent-development costs are separate internal Company OS costs.

## Known limitations

The demo validates workflow design, not buyer demand, production accuracy, integrations, data protection, or operational savings. Its transparent rule engine would need a separate production architecture decision after commercial evidence.

## QA / Security verdict

**APPROVED FOR SYNTHETIC DEMONSTRATION.** The ship gate remains closed for production, real personal data, and automated external action.
