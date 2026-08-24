# ForgeHQ Revenue Factory v1

ForgeHQ is an internal production engine for earning revenue with local-first AI-assisted software work. It is **not** the product being sold.

This module is intentionally separate from `revenue-os/`, which remains the BidSprint 48 control plane. ForgeHQ must not overwrite, migrate, or silently reprioritize BidSprint 48.

## Objective

Maximize **real SEK earned per owner hour** through two parallel lanes:

1. **Paid Fixes & Automation** — bounded buyer-intent coding/integration work for first cash.
2. **WordPress Micro-Products** — demand-first reusable products for repeatable revenue.

## Operating rule

**Buyer evidence before build. Acceptance test before implementation. Human QA before delivery.**

ForgeHQ may research, plan, implement, test, package, benchmark and prepare drafts. It must not impersonate the owner, invent credentials, claim paid experience that does not exist, send proposals, accept contracts, spend money, publish marketplace listings, or modify customer production systems without an explicit human gate.

## Paid Fixes & Automation lane

Prefer work where the deliverable can be verified objectively and the AI system can perform most production work inside a sandbox or repository.

Priority categories:

- API/webhook integrations and repairs
- deterministic data transformation and cleanup
- CSV/Excel/PDF extraction utilities
- small WordPress/WooCommerce fixes with staging/reproducible tests
- n8n/Sheets/CRM workflow implementation when requirements are bounded
- small internal tools with an explicit input/output contract

Reject by default:

- roles that require credentials or years of experience the owner does not truthfully have
- generic full-site builds with large ambiguous scope
- live AnyDesk-only emergency work without a reproducible/staging path
- CAPTCHA/rate-limit/ToS evasion or stealth scraping
- high-stakes regulated systems where human domain expertise is required
- work where success cannot be tested before delivery

### Delivery loop

`Buyer signal -> Scope -> Acceptance test -> Planner -> Coder -> Tests -> Independent reviewer -> Fix -> Human QA -> Delivery gate`

Target initial job shape: **0.5–2 days of bounded work**, low support burden, no irreversible production access required during development.

## WordPress Micro-Products lane

Do not clone a successful plugin and do not build from a keyword alone.

A candidate may enter implementation only when all of these are true:

- current user/install/search demand is visible, or there is direct willingness-to-pay evidence
- the exact job-to-be-done is not already solved well for free
- the wedge is narrow enough for a small, testable MVP
- there is a credible paid expansion (automation, team workflow, reporting/export, advanced rules, integrations or support)
- support/security burden is manageable
- MVP can be independently tested before submission

Current status: **VALIDATE, not BUILD** for the first WooCommerce operational-context candidate. Existing plugins already cover generic customer metrics, so the wedge must be materially narrower and operationally useful before code is authorized.

## Model routing

See `models.json`. Local models are preferred for routine work; cloud escalation is optional and must never be required for the economics to work.

The default workflow uses different models for different roles rather than asking one model to do everything:

`Planner -> Coder -> Test runner -> Reviewer -> Fixer`

No large model is downloaded automatically. First run `hardware-check.ps1`, inspect available RAM/VRAM and installed Ollama models, then benchmark candidates one at a time.

## North-star metrics

- real revenue, SEK
- owner minutes per delivered job
- proposal-to-payment conversion
- delivery pass rate on first human QA
- repeat/reusable code percentage
- product revenue generated from previously validated work

A technically impressive system that produces no buyer activity or revenue is a failed ForgeHQ iteration.
