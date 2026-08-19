# Hermes Oracle Company OS — Architecture

**Version:** 0.1.0  
**Status:** Implemented foundation; local installation and owner acceptance pending  
**Design principle:** Maximum useful internal autonomy with minimum irreversible authority.

---

## 1. System objective

Hermes Oracle Company OS is not a chatbot dashboard. It is a governed operating system for an AI-assisted software and automation company.

It must be able to:

- accept a business objective or task
- decompose it into accountable work
- collect evidence and attack assumptions
- run bounded validation experiments
- implement approved software in isolation
- verify work with deterministic evidence and independent review
- preserve durable company memory
- schedule recurring work
- propose measured self-improvements
- stop at explicit owner gates for external, financial, legal, security, and production actions

The architecture deliberately rejects unrestricted recursive autonomy. An agent that can rewrite its own permissions, evidence rules, tests, budgets, or deployment path is not a reliable employee; it is an uncontrolled administrator.

---

## 2. Runtime topology

```text
┌──────────────────────────────────────────────────────────────────────┐
│                         OWNER / BOARD                               │
│ customer contact · money · contracts · secrets · production        │
│ identity · BankID/2FA · invoice submission · self-change promotion │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ explicit approval gates
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  HERMES ORACLE OWNER COCKPIT                        │
│ React/Vite UI · Express API · deterministic venture pipeline        │
│ local status · workspaces · memory · terminal · evidence display    │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ local operator control
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    PAPERCLIP COMPANY CONTROL PLANE                   │
│ company · org chart · goals · issues · assignments · budgets        │
│ schedules · heartbeat history · audit trail · agent sessions        │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ hermes_local adapter
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         HERMES EMPLOYEES                             │
│ CEO · Market · Red Team · Product · Architecture · Build · QA · Rev │
│ persistent sessions · skills · toolsets · bounded permissions       │
└──────────────┬──────────────────────────┬────────────────────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────────┐   ┌──────────────────────────────────────┐
│ ISOLATED BUILD SURFACES  │   │ DURABLE KNOWLEDGE / EVIDENCE        │
│ branch · worktree        │   │ Paperclip state · SQLite            │
│ synthetic fixtures       │   │ Obsidian-compatible notes           │
│ tests · build · diff     │   │ source ledger · audit outcomes       │
└──────────────┬───────────┘   └──────────────────────────────────────┘
               │ independent QA + owner deployment gate
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│ CUSTOMER / PRODUCTION / PAYMENT SYSTEMS                             │
│ disabled until separately authorized                               │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component authority

### 3.1 Owner

The owner is the board, legal human operator, and final authority for irreversible actions.

The owner does not need to perform routine research, drafting, decomposition, coding, testing, documentation, or internal project administration when agents can do so safely.

### 3.2 Owner Cockpit

The existing Agent OS application is the local operator surface and deterministic safety layer.

Implemented responsibilities:

- display company mission, first revenue objective, score, operating mode, employee status, and owner gates
- accept ideas/tasks into a governed pipeline
- call independent research and red-team roles
- compute the commercial score outside the model
- block killed ventures and production builds without evidence
- create isolated workspaces
- run available deterministic verification commands
- require independent Reality Checker approval before shipped status
- preserve local notes, audit records, projects, and agent conversations
- provide a Windows preflight/status/start path

The Owner Cockpit is not currently a replacement for every Paperclip management screen. It is a focused control and evidence projection.

### 3.3 Paperclip

Paperclip is the durable company orchestration layer after the portable company package is imported.

It owns:

- company and organizational hierarchy
- goals, projects, issues, assignees, and dependencies
- recurring routines and heartbeats
- per-agent runtime configuration and budgets
- persistent agent sessions
- run history and operational audit trail

The company package is stored as portable Markdown plus `.paperclip.yaml`; it can be reviewed in Git before import.

### 3.4 Hermes

Hermes is the employee runtime.

The `hermes_local` adapter launches an employee for assigned work or a scheduled heartbeat, preserves session state, and exposes only the configured toolsets.

Technical employees use worktree mode and checkpoints. Provider credentials remain in local secret/configuration stores and are never exported with the company package.

### 3.5 Git and CI

Git is the change-control and rollback boundary for company code, skills, employee instructions, and portable company definitions.

The current pull request runs:

```text
npm ci
npm test
npm run build
```

The test command first validates the company package, then runs deterministic server tests. The build command compiles the client and server.

Main remains unchanged until the owner reviews the pull request and all checks pass.

---

## 4. Company package

```text
company/
├── COMPANY.md
├── .paperclip.yaml
├── agents/
│   ├── ceo/AGENTS.md
│   ├── market-intelligence/AGENTS.md
│   ├── commercial-red-team/AGENTS.md
│   ├── product-lead/AGENTS.md
│   ├── solutions-architect/AGENTS.md
│   ├── build-engineer/AGENTS.md
│   ├── qa-security/AGENTS.md
│   └── revenue-operations/AGENTS.md
├── skills/
│   ├── venture-evidence/SKILL.md
│   ├── commercial-red-team/SKILL.md
│   ├── acceptance-contract/SKILL.md
│   └── safe-self-improvement/SKILL.md
└── projects/
    └── revenue-001/
        ├── PROJECT.md
        └── tasks/
            ├── 01-freeze-founder-offer/TASK.md
            ├── 02-design-synthetic-demo/TASK.md
            ├── 03-build-synthetic-demo/TASK.md
            ├── 04-build-market-evidence-pack/TASK.md
            ├── 05-prepare-revenue-operations/TASK.md
            └── 06-owner-outreach-gate/TASK.md
```

The validator checks:

- required package files and frontmatter
- unique agent and skill identifiers
- valid reporting hierarchy
- valid project, task, assignee, and skill references
- required owner gates
- Paperclip runtime declarations
- common committed-secret patterns

---

## 5. Task lifecycle

### 5.1 General company task

```text
objective
  → task contract
  → assignee
  → execution
  → evidence
  → independent review
  → accepted / blocked / revised
```

### 5.2 Commercial venture

```text
capture
  → research packet
  → independent red team
  → deterministic score
  → evidence gap list
  → validation experiment
  → owner gate
  → bounded implementation
  → delivery QA
  → customer test
  → measured result
```

A model never sets production-build permission by itself.

### 5.3 Coding task

```text
approved product contract
  → architecture / threat model
  → isolated branch or worktree
  → inspect existing code
  → smallest coherent change
  → tests / type / lint / build
  → diff / secrets / scope review
  → screenshot or manual evidence where needed
  → independent QA
  → owner deployment gate
```

A coding loop stops instead of faking completion when:

- the same failure repeats without new evidence
- the iteration or cost ceiling is reached
- acceptance criteria change
- production credentials or customer data become necessary
- verification cannot represent the promised result
- a guardrail would need to be weakened

---

## 6. Autonomy levels

### Level 0 — Read and propose

Allowed:

- inspect public sources, repository files, instructions, and non-sensitive records
- summarize, compare, score, red-team, and draft

No external mutation.

### Level 1 — Internal reversible work

Allowed:

- create internal issues, plans, notes, synthetic fixtures, drafts, local files, and isolated branches
- run bounded models, tests, builds, and evaluations

This is the default founder-validation level.

### Level 2 — Reviewed external preparation

Allowed after task-specific approval:

- prepare personalized outreach, proposals, contracts, invoice fields, deployment plans, and customer-data access requests

The agent still does not send, accept, submit, or deploy.

### Level 3 — Controlled external action

Requires explicit owner authorization defining target, channel, scope, volume, time window, budget, and rollback.

Examples:

- reviewed outreach to an approved prospect set
- creating a non-binding account
- limited customer-system connection
- canary deployment

Identity, BankID/2FA, legal acceptance, payment-account changes, and invoice submission remain human actions.

### Level 4 — Production operation

Requires:

- passed commercial and architecture gates
- independent QA approval
- production-specific owner approval
- monitoring, cost ceiling, incident path, and rollback

### Prohibited autonomy

No agent may independently:

- widen permissions or tool access
- access new secrets
- spend money or accept paid terms
- contact unapproved external parties
- bind the owner or Frilans Finans contractually
- submit invoices
- weaken tests, audits, budgets, or owner gates
- deploy its own code or self-improvement
- delete the baseline or rollback path

---

## 7. Evidence model

Every material claim is classified as:

- `observed` — directly present in an artifact, source, customer statement, or recorded run
- `sourced` — supported by an identified credible external source
- `inferred` — a reasoned conclusion from observed/sourced facts
- `unknown` — not established

Model consensus, synthetic personas, unsourced search snippets, and generated market narratives are not evidence.

A deliverable requires an evidence bundle:

```text
claim
source artifact
captured date/time
responsible role
assumptions
commands/tool calls
changed files/diff
verification output
cost
review verdict
owner gate
```

---

## 8. Memory model

### Working context

Short-lived task context remains inside the current Paperclip/Hermes session and issue.

### Durable company memory

Store only information with continuing operational value:

- decisions and rationale
- accepted product and architecture contracts
- evidence ledgers
- customer objections and measured outcomes
- incident and delivery postmortems
- reusable implementation patterns
- eval datasets and baselines
- approved skills and runbooks

### Memory rules

- do not store secrets in memory notes
- minimize personal/customer data
- distinguish fact, inference, and proposal
- preserve source and date
- do not silently overwrite contradictory evidence
- archive superseded decisions rather than erasing the audit trail

---

## 9. Self-improvement architecture

```text
recorded failure or correction
  → immutable baseline
  → one bounded candidate change
  → representative eval set
  → hidden holdout
  → quality / safety / latency / cost thresholds
  → red-team for reward hacking and regression
  → reviewable diff
  → isolated canary
  → independent QA
  → owner promotion decision
  → immediate rollback retained
```

Candidate areas include:

- employee instructions
- skill procedure
- model routing
- tool sequence
- retry policy
- retrieval strategy
- validation rule
- user-interface decision support

A proposal must change one major variable at a time. A system that changes prompt, model, tools, permissions, and architecture simultaneously cannot determine why performance changed.

---

## 10. Failure and recovery

### Model/provider failure

- mark the employee/runtime unavailable
- preserve the issue and latest checkpoint
- retry only under the configured limit
- switch provider/model only under approved routing policy
- never treat a fallback answer as equivalent without eval evidence

### Tool failure

- record tool, arguments excluding secrets, error, attempt count, and recovery decision
- stop repeated identical calls
- create a blocked task when owner access or a new permission is required

### Build failure

- preserve failing command and output
- do not mark task complete
- return to Build Engineer with the smallest reproducible failure
- require a new passing run before QA

### Paperclip or Owner Cockpit outage

- local state and Git artifacts remain intact
- runtime script reports endpoint status and log locations
- restart only missing processes
- do not expose local services publicly as an outage workaround

### Unsafe or ambiguous external action

- stop
- create an owner gate
- state the exact target, action, data, consequence, cost, and rollback
- wait for explicit authorization in the active task

---

## 11. Security boundary

Initial deployment is loopback-only:

- Paperclip: `127.0.0.1:3100`
- Owner Cockpit/API: `127.0.0.1:3001`
- optional Hermes gateway: `127.0.0.1:9119`

Remote access should use an authenticated private network such as Tailscale, not a public port.

Secrets belong in approved OS, Hermes, Paperclip, provider, or deployment secret stores. They must not appear in:

- Git
- Markdown company files
- issue descriptions
- model prompts
- terminal screenshots
- audit summaries
- customer demonstrations

Synthetic fixtures are mandatory before customer-data processing.

---

## 12. Current implementation boundary

Implemented in the pull-request branch:

- deterministic venture scoring and evidence gates
- independent red-team and QA passes
- isolated validation/production execution modes
- verification command runner
- company mission, roles, owner gates, skills, routines, and first revenue mission
- portable Paperclip company package using Hermes runtimes
- company-package validator and CI
- responsive Owner Cockpit
- Windows preflight/status/start script
- exact installation/import/payment runbook
- evidence-led business plan

Requires the owner/local machine:

- check out or merge the reviewed branch
- install/configure Hermes and Paperclip
- enter provider credentials in local secret stores
- import the company package
- set actual agent budgets and approved provider models
- complete Frilans Finans identity/account actions
- authorize any customer contact

Intentionally not implemented before commercial evidence:

- automatic external outreach
- customer production connectors
- billing automation
- multi-tenant SaaS infrastructure
- unrestricted recursive self-modification
- public hosting
- automatic bidirectional synchronization of every Paperclip screen into the Owner Cockpit

These omissions are commercial and safety constraints, not hidden claims of completion.

---

## 13. Architecture acceptance criteria

The foundation is acceptable when:

- locked dependencies install
- deterministic tests pass
- client and server production builds pass
- company package validates with eight employees, four skills, one project, and six tasks
- local health checks pass
- Paperclip imports the company without missing references
- Hermes environment tests pass for each configured employee
- one internal starter task executes and leaves an evidence artifact
- no external action occurs without the matching owner gate
- rollback to the pre-merge main branch remains possible

The first business acceptance criterion is separate:

> one qualified customer pays for one controlled pilot and receives a measured useful outcome.
