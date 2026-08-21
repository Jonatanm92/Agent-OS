# Revenue OS v1

Revenue OS is the commercial control plane in front of the existing Agent OS build pipeline.
It is designed to prevent a common failure mode: agents producing convincing software before
anyone has proved that a reachable buyer will pay.

## What this version does

- Operates one active revenue mission at a time.
- Uses a deterministic 100-point commercial scorecard.
- Enforces eight hard gates before a mission can receive `GO`.
- Returns `GO`, `TEST`, or `KILL`; a model cannot override open gates.
- Maps nine company roles onto the existing Agent OS agents.
- Executes only internal work products through the existing `/api/chat` route.
- Permanently blocks automated outreach, publishing, spending, banking, identity verification,
  binding legal acceptance, refunds, and other external actions.
- Records real prospects, replies, calls, payments, refunds, deliveries, and testimonials.
- Persists state locally as JSON with atomic writes and a bounded audit trail.
- Provides a responsive dashboard for computer and phone.
- Can run a deterministic grill with or without an additional AI red team.
- Includes a bounded scheduler for queued **internal** tasks while both services are online.

It has no runtime dependencies beyond Node.js 20 or newer.

## Commercial mission already loaded

The default mission is **Music Performance Release Pack** under a separate global brand:

- One finished performance in.
- Two musically coherent vertical clips out.
- One cover concept.
- Titles, description, captions, and a concise keyword/hashtag set.
- Upload-ready delivery folder.
- Founder price: **$29 USD**.
- Future hypotheses: 5 packs for $99; 12 packs for $179; no subscription initially.

The seeded score is **80/100**, but the verdict is correctly **TEST**, not `GO`, because:

1. A real customer-grade proof must pass the acceptance test.
2. A legitimate international payment path must be live and owner-verified.

A full SaaS build remains prohibited until paid founder validation exists.

## Work products already included

- `playbooks/founder-proof-acceptance.md`
- `playbooks/founder-offer.md`
- `playbooks/prospect-rubric.md`
- `playbooks/outreach-framework.md`
- `playbooks/payment-readiness.md`

These are also loaded into the relevant task cards in the dashboard.

## Start on Windows

Open PowerShell in the `revenue-os` folder:

```powershell
.\start.ps1
```

Then open:

```text
http://127.0.0.1:3010
```

The existing Agent OS is expected at `http://127.0.0.1:3001` by default.
To use another address:

```powershell
.\start.ps1 -AgentOsUrl "http://127.0.0.1:3001"
```

When Agent OS itself requires a password/token:

```powershell
.\start.ps1 -AgentOsToken "YOUR_AGENT_OS_TOKEN"
```

## Private phone access through Tailscale

Bind Revenue OS to all local interfaces **only with an access token**:

```powershell
.\start.ps1 `
  -HostAddress "0.0.0.0" `
  -AccessToken "USE-A-LONG-RANDOM-TOKEN"
```

On the phone, open the desktop computer’s private Tailscale IP on port `3010`.
Do not expose this dashboard directly to the public internet. It contains commercial plans,
agent outputs, prospect notes, and payment events.

## Start on macOS / Linux

```bash
REVENUE_OS_TOKEN='use-a-long-random-token' ./start.sh
```

For local-only operation, the token may be omitted because the default bind is `127.0.0.1`.

## Internal automation

Automation is disabled by default. When enabled in the dashboard:

- It runs at most the configured number of internal tasks per UTC day.
- It uses the assigned Agent OS role.
- It stops rather than inventing a result when Agent OS is offline.
- It never runs `human` or `external` tasks.
- It only runs while this process and the desktop machine are online.

This is not a claim that ChatGPT itself continues working after the conversation ends. A real
24/7 process requires the local server to remain running on an always-on machine or a separately
secured host.

## Tests

```bash
npm test
npm run check
```

The test suite verifies the 80-point seeded verdict, the hard-gate requirement for `GO`, kill
logic, fatal-risk override, internal-only task selection, event/revenue accounting, and safe
candidate initialization.

## Environment variables

| Variable | Default | Purpose |
|---|---:|---|
| `REVENUE_OS_HOST` | `127.0.0.1` | Bind address |
| `REVENUE_OS_PORT` | `3010` | Dashboard port |
| `REVENUE_OS_TOKEN` | blank | Optional dashboard/API access token |
| `REVENUE_OS_DATA_DIR` | `./data` | Local persistent state directory |
| `AGENT_OS_URL` | `http://127.0.0.1:3001` | Existing Agent OS base URL |
| `AGENT_OS_TOKEN` | blank | Existing Agent OS token, when configured |
| `REVENUE_OS_AUTOMATION_INTERVAL_MS` | `60000` | Internal scheduler poll interval |

## Authority boundary

The CEO remains the only authority for identity verification, BankID/2FA, banking, binding
legal terms, spending, final brand/offer/price decisions, customer sends, publishing, refunds,
and irreversible commitments. Revenue OS prepares and records those actions; it does not impersonate
the owner or silently execute them.
