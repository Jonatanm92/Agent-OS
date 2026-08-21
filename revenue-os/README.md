# Revenue OS v1 — BidSprint 48

Revenue OS is the commercial control plane in front of the existing Agent OS pipeline.
It keeps one revenue mission active, blocks speculative product work and lets the AI team perform
bounded internal work while Jonatan retains control over outreach, contracts, payments and other
irreversible decisions.

## Active revenue mission

**BidSprint 48** is the CEO-approved first revenue engine.

For Swedish service companies evaluating one public procurement, the founder pilot delivers within
48 hours after complete input and a confirmed start:

- a source-traced go/avstå recommendation with a decision score
- a requirement matrix
- missing evidence, attachments and attestations
- critical deadlines, questions and internal responsibilities
- a bid-structure skeleton
- a final pre-submission requirement check list

Founder pilot price: **1,900 SEK excluding VAT, paid upfront**.

The first 1–3 pilots must be contracted through an approved self-employment company. Frilans Finans
is the first route and Cool Company is reserve. The contracting party must be in place before a
binding order is accepted or work begins.

## Current deterministic verdict

The seeded mission scores **80/100** and remains **TEST**, not `GO`, because three hard gates are open:

1. A customer-grade, source-traced sample must pass its acceptance test.
2. A 30-company source-backed prospect list must be completed, with ten 8/10 prospects ready for CEO review.
3. The legitimate contracting and payment path must be operational.

No SaaS build is authorized before at least three unrelated customers have paid for and received the
manual founder service.

## AI company roles

Revenue OS maps nine company roles onto the existing Agent OS agents:

- Chief of Staff / Project Lead
- Market Intelligence Lead
- Customer Discovery Lead
- Offer & Pricing Lead
- Sales & Distribution Lead
- Delivery Engineering Lead
- QA & Red Team Lead
- Finance & Risk Lead
- Customer Success Lead

Internal automation is enabled in the default state with a limit of four task runs per UTC day.
It can produce research, samples, prospect evidence, delivery assets and red-team reports only while
both Revenue OS and Agent OS are running.

It can never send outreach, publish, spend money, accept contracts, change banking/payment settings,
log in with BankID/2FA, submit an offer or issue a refund.

## Seeded internal work queue

1. Build one customer-grade BidSprint 48 sample from official Swedish procurement documents.
2. Complete the 30-company source-backed prospect list; retain existing job reference `job-0371e9a776` where available.
3. Build the Swedish customer intake and delivery package.
4. Run the commercial and delivery grill.

The approved offer and proof acceptance standard are already loaded. Contracting/payment verification,
exact outreach approval and sends remain human-gated.

## Start on Windows

Open PowerShell in the `revenue-os` folder:

```powershell
.\start.ps1
```

Then open:

```text
http://127.0.0.1:3010
```

The existing Agent OS is expected at `http://127.0.0.1:3001` by default. To use another address:

```powershell
.\start.ps1 -AgentOsUrl "http://127.0.0.1:3001"
```

When Agent OS requires a token:

```powershell
.\start.ps1 -AgentOsToken "YOUR_AGENT_OS_TOKEN"
```

## Private phone access through Tailscale

Bind Revenue OS to all local interfaces only with a strong access token:

```powershell
.\start.ps1 `
  -HostAddress "0.0.0.0" `
  -AccessToken "USE-A-LONG-RANDOM-TOKEN"
```

On the phone, open the desktop computer's private Tailscale IP on port `3010`.
Do not expose the dashboard directly to the public internet.

## Start on macOS or Linux

```bash
REVENUE_OS_TOKEN='use-a-long-random-token' ./start.sh
```

For local-only operation, the token may be omitted because the default bind is `127.0.0.1`.

## Tests

```bash
npm test
npm run check
```

The nine-test suite verifies:

- the seeded 80-point `TEST` decision and its three open gates
- deterministic `GO` and `KILL` behavior
- fatal-risk override
- internal-only task selection
- failed automation attempts count toward the daily safety limit
- real SEK payment/refund metrics
- safe candidate initialization
- migration from the unused legacy music-release seed without discarding real revenue events

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

## State migration

When an unused version-1 state contains only the original Music Performance Release Pack seed and no
revenue events, Revenue OS replaces it with BidSprint 48. A state containing any payment or other
revenue event is preserved rather than silently overwritten.

## Authority boundary

Jonatan remains the only authority for identity verification, BankID/2FA, banking, binding terms,
self-employment-company acceptance, spending, final price changes, customer sends, publishing,
refunds and irreversible commitments. Revenue OS prepares and records those actions; it does not
impersonate the owner or execute them silently.
