# Start Today — Hermes Oracle Company OS

This runbook starts the reviewed Company OS locally on Windows: the Owner Cockpit, Paperclip control plane, Hermes employees, and the restricted Docker verification sandbox.

It starts real **internal company work**. It does not claim revenue before a customer accepts and pays.

## Day-one result

When this runbook is complete:

- the reviewed branch is installed from its lockfile
- tests, dependency audits, and production builds pass
- Docker is ready for fixed no-network verification tasks
- Hermes is configured as the employee runtime
- Paperclip contains the company, eight roles, four skills, one revenue project, and six starter tasks
- the local owner gate is enabled
- the first internal task is assigned
- customer contact, spending, contracts, invoices, secrets, deployment, and self-modification remain locked to the owner

## 1. Open the correct repository

From the local clone of `Jonatanm92/Agent-OS`:

```powershell
git fetch origin
git switch codex/company-os-foundation
git remote -v
git status
```

Expected remote repository:

```text
Jonatanm92/Agent-OS
```

Do not run these commands blindly inside an unrelated `F:\hermes-oracle` directory.

## 2. Verify the pinned Node/npm toolchain

The reviewed runtime is pinned to:

```text
Node.js 24.19.0 or newer within major 24
npm 12.0.2 or newer within major 12
```

Check the installed versions:

```powershell
node --version
npm --version
```

When Node 24 is installed but npm is older, update npm explicitly:

```powershell
npm install --global npm@12.0.2 --ignore-scripts
npm --version
```

Then install only the locked dependency graph and verify it:

```powershell
npm ci
npm audit --omit=dev --audit-level=high
npm audit --audit-level=critical
npm test
npm run build
```

Expected company-package counts:

- 8 agents
- 1 project
- 6 tasks
- 4 skills
- 0 validation errors

A failed command is a stop condition. Do not weaken tests, edit the lockfile manually, or replace `npm ci` with an unlocked update.

## 3. Prepare the Docker verification sandbox

Generated code and project-supplied package scripts must not execute directly on the Windows host. The Company OS runs only named verification tasks in disposable Linux containers.

Install or update Docker Desktop using Docker's official Windows instructions, use the Linux-container/WSL 2 backend, and start Docker Desktop.

Verify the engine:

```powershell
docker version
docker info
```

Review and pull the two required images once:

```powershell
docker pull node:24-bookworm-slim
docker pull python:3.12-slim

docker image inspect node:24-bookworm-slim
docker image inspect python:3.12-slim
```

Runtime tasks use `--pull=never`; agents cannot download or silently update images.

The sandbox enforces:

- no network
- non-root execution
- read-only container root
- read-only mount of the real workspace
- writable ephemeral copy in tmpfs
- all Linux capabilities dropped
- no privilege escalation
- CPU, memory, process, file-descriptor, and timeout ceilings
- no persistent container logs
- cleanup of named containers after timeout

Allowed autonomous verification tasks are limited to:

```text
node-test
node-build
node-lint
node-typecheck
python-test
```

Arbitrary shell commands and automatic package installation are blocked. A generated project needing third-party dependencies requires a separate owner-reviewed locked installation step.

Optional digest-pinned images can later be configured through:

```text
AGENT_OS_NODE_SANDBOX_IMAGE
AGENT_OS_PYTHON_SANDBOX_IMAGE
```

## 4. Install and configure Hermes on Windows

Download the official installer for review before execution:

```powershell
$HermesInstaller = "$env:TEMP\hermes-install.ps1"
Invoke-WebRequest `
  -Uri "https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1" `
  -OutFile $HermesInstaller

Get-FileHash $HermesInstaller -Algorithm SHA256
notepad $HermesInstaller
& $HermesInstaller
```

Open a new PowerShell window, then verify and configure Hermes:

```powershell
hermes --help
hermes setup
```

Configure one approved provider/model route. Keep provider credentials in Hermes/Paperclip secret storage—never in Git, Markdown, tasks, model prompts, screenshots, or chat transcripts.

The company package uses Paperclip's built-in `hermes_local` adapter. A separate persistent Hermes gateway is optional.

## 5. Install and start Paperclip

Install and onboard the official CLI:

```powershell
npm install --global paperclipai
paperclipai onboard --yes
paperclipai doctor
paperclipai run
```

Paperclip should remain loopback-only during founder validation:

```text
http://127.0.0.1:3100
```

Health check:

```powershell
Invoke-WebRequest http://127.0.0.1:3100/api/health -UseBasicParsing
```

Do not expose Paperclip or Agent OS through a public port. Remote access should use an authenticated private configuration such as Tailscale.

## 6. Import the AI company

From the Agent OS repository root, while Paperclip is running:

```powershell
npx paperclipai company import .\company `
  --target new `
  --new-company-name "Hermes Oracle Company OS" `
  --api-base http://127.0.0.1:3100
```

Review the import before accepting it.

Expected employees:

1. CEO / Portfolio Lead
2. Market Intelligence Lead
3. Commercial Red Team
4. Product Lead
5. Solutions Architect
6. Build Engineer
7. QA / Security Lead
8. Revenue Operations Lead

Expected skills:

- `venture-evidence`
- `commercial-red-team`
- `acceptance-contract`
- `safe-self-improvement`

Expected project:

```text
REV-001 — AI Workflow Revenue Sprint Validation
```

Expected tasks:

1. Freeze the founder offer and acceptance contract
2. Design the synthetic workflow demonstration
3. Build and verify the synthetic demonstration
4. Build the 30-prospect evidence pack
5. Prepare offer, outreach, CRM, and payment readiness
6. Owner decision — authorize controlled founder outreach

## 7. Enable the local owner gate

Every state-changing Agent OS action requires an authenticated owner. Set a process-only password before starting the server:

```powershell
.\scripts\set-owner-password.ps1
```

Enter a password containing at least 16 characters. The secure prompt keeps it out of PowerShell history, and the helper does not write it to Git, `.env`, or persistent Windows environment settings.

Keep this PowerShell window open. Agent OS must be started from the same process so its child server receives `AGENT_OS_PASSWORD`.

When the Owner Cockpit opens, enter the same password on its login screen. Full rotation and recovery instructions are in `docs/OWNER_ACCESS.md`.

## 8. Run preflight and start both control planes

First run the non-mutating preflight:

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\scripts\company-runtime.ps1 `
  -Action preflight
```

It must show green for:

- Node 24.19+
- npm 12.0.2+
- Git
- Docker CLI and engine
- both reviewed sandbox images
- Hermes
- Paperclip

Then, from the same PowerShell window in which the owner password was set, start only missing local processes and open the dashboards:

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\scripts\company-runtime.ps1 `
  -Action start `
  -OpenDashboards
```

Expected interfaces:

```text
Paperclip:     http://127.0.0.1:3100
Owner Cockpit: http://127.0.0.1:3001
```

The script checks public health endpoints, writes process logs to `.company-runtime\`, and refuses startup when required prerequisites or sandbox images are missing.

Status-only diagnostics:

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\scripts\company-runtime.ps1 `
  -Action status
```

Machine-readable diagnostics:

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\scripts\company-runtime.ps1 `
  -Action status `
  -Json
```

## 9. Start the first internal work

In Paperclip:

1. Confirm every imported employee uses `hermes_local` and passes its environment test.
2. Confirm provider/model routing and cost visibility.
3. Set conservative per-agent budgets.
4. Assign **Freeze the founder offer and acceptance contract** to Product Lead.
5. Keep the owner-outreach gate blocked.

The controlled sequence is:

```text
product contract
  → commercial red team
  → architecture and acceptance contract
  → isolated synthetic build
  → sandboxed tests/build/manual evidence
  → independent QA
  → 30-prospect evidence pack
  → revenue and payment readiness
  → owner outreach decision
```

## 10. First offer under validation

**AI Workflow Revenue Sprint**

Initial buyer hypothesis:

- Swedish installation and field-service firms
- approximately 5–49 employees
- quote or service inquiries arrive through email or website form
- repetitive classification, missing-information chasing, internal task creation, and follow-up

Workflow hypothesis:

```text
inquiry received
  → classify
  → identify missing information
  → draft response
  → create internal task
  → human approval
  → follow-up reminder
```

Founder-price hypothesis:

```text
6,900 SEK excluding VAT
```

Production work remains blocked until the evidence ledger contains:

- 10 independent pain signals
- 3 price or payment signals
- 20 reachable qualified prospects
- a passed technical feasibility probe
- a documented acquisition route
- completed privacy, legal, security, and delivery-risk review

Founder validation targets:

- 30 qualified prospects
- 5 substantive buyer conversations or equivalent written exchanges
- 1 paid founder pilot

Targets are not recorded as completed without source artifacts.

## 11. Payment readiness through Frilans Finans

The initial seller path is egenanställning through Frilans Finans rather than forming a company before the first validated assignment.

Agents may prepare:

- assignment description
- customer and invoice fields
- price, scope, dates, and payment terms
- delivery and expense assumptions
- documentation checklist

The owner personally handles:

- identity verification
- BankID/2FA
- banking details
- legal acceptance
- assignment approval
- invoice submission

Critical sequence:

```text
prepare scope and price internally
  → register/establish the assignment through Frilans Finans
  → confirm the legal contracting party
  → agree compensation and work with the customer
  → deliver
  → owner submits invoice basis
```

Do not agree compensation first and try to route an already-personal assignment through egenanställning afterward.

## 12. Owner-only actions

Agents stop and create an owner gate before:

- sending outreach or replying to a prospect
- customer calls or meetings
- accepting platform/provider terms
- pulling or changing approved sandbox images
- installing dependencies for a generated customer project
- spending money or purchasing subscriptions
- signing contracts or data-processing agreements
- entering identity, BankID/2FA, banking, or payment information
- accessing customer or production data
- deploying publicly
- submitting an invoice
- promoting a self-improvement to production behavior

## 13. Stop conditions

Pause and return the mission to Commercial Red Team when:

- qualified buyers do not confirm the painful job
- price reactions fail the approved threshold
- delivery requires broad custom consulting
- integration or support cost destroys the margin
- customer data cannot be handled safely within scope
- acquisition depends on spam, private-data scraping, or unsustainable owner sales effort
- the synthetic demo fails its acceptance tests
- Docker verification is unavailable or blocked
- an agent reports progress without evidence

## Definition of done for day one

Day one is complete when:

- the reviewed branch is checked out
- Node/npm versions match the pinned toolchain
- `npm ci`, audits, tests, and production builds pass
- Docker is running with both reviewed images present
- Hermes is configured
- Paperclip is healthy
- the company package is imported and reviewed
- the local owner gate is enabled
- runtime preflight is green
- the first internal task is assigned
- outreach, spending, contracts, payment, production, secrets, and self-modification remain locked

At that point the company is doing real internal work. The next external milestone is not another OS feature; it is one owner-approved validation action capable of producing the first legitimate payment signal.
