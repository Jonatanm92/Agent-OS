# Start Today — Hermes Oracle Company OS

This runbook starts the local owner cockpit, Paperclip control plane, and Hermes employees on Windows. It deliberately separates reversible internal work from actions that create legal, financial, customer, security, or production consequences.

## What “started today” means

By the end of this runbook:

- the Agent OS branch has passed locked dependency installation, tests, company-package validation, and production builds
- Paperclip is running locally as the durable company control plane
- Hermes is installed as the agent runtime
- the portable company package is imported with eight AI employees, four skills, one revenue-validation project, and six starter tasks
- the first internal work can run on heartbeats
- customer contact, spending, contracts, invoices, secrets, deployment, and self-modification remain locked behind the owner

This does not claim that revenue exists before a customer agrees and pays. It creates the fastest controlled path to that event.

## 1. Check out the reviewed branch

From the local clone of `Jonatanm92/Agent-OS`:

```powershell
git fetch origin
git switch codex/company-os-foundation
```

Do not point these commands at an unrelated `F:\hermes-oracle` directory. Confirm the repository first:

```powershell
git remote -v
git status
```

The expected GitHub repository is `Jonatanm92/Agent-OS`.

## 2. Install and verify the repository

```powershell
npm ci
npm test
npm run build
```

Expected company-package counts:

- 8 agents
- 1 project
- 6 tasks
- 4 skills
- 0 validation errors

A failed command is a stop condition. Do not continue by weakening a test or replacing `npm ci` with an unlocked dependency update.

## 3. Install Hermes Agent natively on Windows

The official Hermes installer supports Windows 10 and 11 without WSL. Download the script first so it can be inspected before execution:

```powershell
$HermesInstaller = "$env:TEMP\hermes-install.ps1"
Invoke-WebRequest `
  -Uri "https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1" `
  -OutFile $HermesInstaller

Get-FileHash $HermesInstaller -Algorithm SHA256
notepad $HermesInstaller
& $HermesInstaller
```

Open a new PowerShell window after installation, then verify:

```powershell
hermes --help
hermes setup
```

During setup, configure one approved provider/model route. Provider credentials stay in Hermes/Paperclip secret storage; never paste them into a task, prompt, repository file, screenshot, or chat transcript.

A persistent Hermes gateway is optional for this configuration. The imported company uses Paperclip's built-in `hermes_local` adapter, which launches Hermes for each heartbeat and persists the session.

## 4. Install and onboard Paperclip

Install the official CLI from the public npm registry:

```powershell
npm install -g paperclipai
paperclipai onboard --yes
paperclipai doctor
```

The default first-run mode is local loopback. Do not expose it to LAN or the public internet during founder validation. If remote phone access is later required, use an authenticated private/Tailscale configuration rather than a public port.

Start Paperclip once for the initial import:

```powershell
paperclipai run
```

Paperclip should be reachable at:

```text
http://127.0.0.1:3100
```

Health check:

```powershell
Invoke-WebRequest http://127.0.0.1:3100/api/health -UseBasicParsing
```

## 5. Import the company package

From the Agent OS repository root, while Paperclip is running:

```powershell
npx paperclipai company import .\company `
  --target new `
  --new-company-name "Hermes Oracle Company OS" `
  --api-base http://127.0.0.1:3100
```

Review the import before approving it. The expected organization is:

1. CEO / Portfolio Lead
2. Market Intelligence Lead
3. Commercial Red Team
4. Product Lead
5. Solutions Architect
6. Build Engineer
7. QA / Security Lead
8. Revenue Operations Lead

Expected reusable skills:

- `venture-evidence`
- `commercial-red-team`
- `acceptance-contract`
- `safe-self-improvement`

Expected first project:

- `REV-001 — AI Workflow Revenue Sprint Validation`

Expected first six tasks:

1. Freeze the founder offer and acceptance contract
2. Design the synthetic workflow demonstration
3. Build and verify the synthetic demonstration
4. Build the 30-prospect evidence pack
5. Prepare offer, outreach, CRM, and payment readiness
6. Owner decision — authorize controlled founder outreach

## 6. Start the complete local runtime

After `npm ci` and Paperclip onboarding have completed:

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\scripts\company-runtime.ps1 `
  -Action start `
  -OpenDashboards
```

The script:

- checks Node.js 20+, npm, Git, Hermes, and Paperclip
- checks Paperclip, Agent OS, and optional Hermes gateway health endpoints
- starts only missing local processes
- disables Paperclip telemetry for that started process
- writes stdout/stderr to `.company-runtime\`
- waits for health endpoints before reporting success

Status-only command:

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\scripts\company-runtime.ps1 `
  -Action status
```

JSON status for diagnostics:

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\scripts\company-runtime.ps1 `
  -Action status `
  -Json
```

Expected local interfaces:

- Paperclip company control plane: `http://127.0.0.1:3100`
- Hermes Oracle Owner Cockpit: `http://127.0.0.1:3001`

## 7. Start internal work

In Paperclip:

1. Confirm that the imported agents use `hermes_local` and that the environment test passes.
2. Confirm that provider/model selection and cost visibility are correct.
3. Set conservative per-agent budgets before enabling broad recurring execution.
4. Assign the first task to Product Lead.
5. Allow CEO, Product, Architecture, Build, and QA to progress only through the defined dependencies.
6. Keep the outreach gate blocked.

The first internal execution sequence is:

```text
Product contract
  → commercial red team
  → architecture/acceptance contract
  → isolated synthetic build
  → deterministic tests/build/screenshots
  → independent QA
  → prospect evidence pack
  → revenue/payment readiness
  → owner outreach decision
```

## 8. Payment readiness — Frilans Finans

The current founder path is egenanställning through Frilans Finans rather than forming a company before the first validated paid work.

Internal agents may prepare:

- assignment description
- customer legal/invoice fields
- price and scope
- payment terms
- delivery dates
- expense assumptions
- documentation checklist

The owner must personally perform identity verification, BankID/2FA, banking changes, legal acceptance, assignment approval, and invoice submission.

Critical sequencing rule: register/establish the assignment through Frilans Finans before agreeing the compensation and work arrangement with the customer. The Revenue Operations task treats this as an explicit owner gate.

## 9. First commercial offer under validation

**AI Workflow Revenue Sprint**

Initial target:

- Swedish installation and field-service firms
- roughly 5–49 employees
- quote/service inquiries arrive through email or website form
- repetitive classification, missing-information follow-up, internal task creation, and reminders

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

Production remains blocked until all evidence exists:

- 10 independent pain signals
- 3 price/payment signals
- 20 reachable qualified prospects
- technical feasibility probe passed
- acquisition route documented
- privacy/legal/security/delivery-risk review completed

Validation targets:

- 30 qualified prospects
- 5 substantive buyer conversations or equivalent written exchanges
- 1 paid founder pilot

Targets are not recorded as completed until a source artifact exists.

## 10. Owner-only actions

Agents stop and create an owner gate for:

- sending external outreach or replying to a prospect
- phone/video customer conversations
- accepting platform or provider terms
- purchasing subscriptions or spending money
- signing a contract or data-processing agreement
- entering BankID/2FA, identity, banking, or payment information
- giving access to customer or production data
- deploying publicly
- submitting an invoice
- promoting a self-improvement to production behavior

## 11. Stop conditions

Pause the revenue mission and return it to Commercial Red Team when:

- qualified buyers do not confirm the painful job
- price reactions fail the defined threshold
- the workflow requires broad custom consulting to deliver
- support or integration cost destroys the expected margin
- customer data cannot be handled safely within the founder scope
- acquisition depends on spam, private-data scraping, or a sales burden the owner cannot sustain
- the synthetic demonstration fails its acceptance tests
- an agent reports work without evidence

## 12. Definition of done for day one

Day one is complete when:

- PR branch is checked out
- `npm ci`, `npm test`, and `npm run build` pass
- Hermes is installed and configured
- Paperclip is installed, onboarded, and healthy
- company package is imported and reviewed
- runtime status is green
- first internal task is assigned
- outreach, spend, contracts, payment, production, secrets, and self-modification remain locked

At that point the company is doing real internal work. The next external milestone is not “more features”; it is an owner-approved validation action capable of producing the first legitimate payment signal.
