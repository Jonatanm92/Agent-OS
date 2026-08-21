# Hermes Oracle Company OS — Revenue Plan

**Version:** 0.1.0  
**Decision date:** 2026-08-19  
**Status:** Founder validation; production product build blocked  
**Primary objective:** Reach the first legitimate paid customer through a narrow, measurable AI-workflow service, then convert repeated paid delivery into reusable software.

---

## 1. Executive decision

The company will **not** begin by building a general SaaS, an agent platform for sale, or a portfolio of speculative applications.

The first commercial wedge is a productized service:

> **AI Workflow Revenue Sprint** — one repetitive inbound sales or administrative workflow is mapped, demonstrated, implemented with a human approval point, tested, documented, and handed over.

The first target segment is:

> Swedish installation and field-service firms with roughly 5–49 employees that receive quote or service inquiries through website forms or shared email inboxes.

The first workflow hypothesis is:

```text
inquiry received
  → classify intent
  → detect missing information
  → draft response
  → create internal task
  → human approval
  → follow-up reminder
```

The founder-pilot price hypothesis is **6,900 SEK excluding VAT**. It is a validation price, not proof of market clearing price.

The standard-price hypothesis after successful proof is **14,900 SEK excluding VAT** for one fixed-scope workflow implementation, plus an optional **1,490 SEK/month** care plan.

No price is treated as validated until a qualified buyer discusses or pays it.

---

## 2. Why this wedge was selected

### 2.1 Current market evidence

Statistics Sweden reported that 35.0% of Swedish enterprises with at least ten employees used AI in 2025, but only 30.8% of small enterprises with 10–49 employees did so. Among enterprises considering AI but not adopting it, 74.7% cited missing internal expertise, 49.1% cited privacy concerns, 44.3% cited data access or quality, 39.2% cited unclear legal consequences, and 37.8% cited incompatibility with existing systems.

Among AI-using enterprises, the most common purposes were marketing or sales at 41.7%, business administration or management at 35.0%, and production or service processes at 26.2%.

This supports—but does not prove—the thesis that small firms need a narrow implementation service that combines business workflow definition, human review, integration restraint, privacy boundaries, and a measurable result.

### 2.2 Segment fit

Installation and field-service firms are a useful first segment because the proposed workflow can be tied to visible operational events: incoming inquiries, missing information, internal work orders, customer response preparation, and follow-up.

The segment is still a hypothesis. Industry tools already emphasize structured documentation, daily follow-up, compliance, and support for both small and large installation firms. That demonstrates workflow digitization in the sector, not willingness to buy this specific offer.

### 2.3 Public price anchors

Publicly advertised Swedish automation offers currently range from a low entry point of 4,900 SEK for automation work to 15,000 SEK/month for lead automation and 25,000 SEK for a document/admin project.

These are vendor asking prices, not verified transaction data. They support using 6,900 SEK as a deliberately low founder price and 14,900 SEK as a plausible standard-price hypothesis; customer reactions must determine the actual price.

### 2.4 Strategic fit

This wedge satisfies the owner's constraints better than speculative SaaS:

- a payment signal can be sought before broad product development
- delivery can be prepared and partially executed by agents
- the owner remains responsible only for unavoidable sales, identity, contract, payment, and approval actions
- work is remote and can be scheduled around full-time employment
- each delivery produces reusable workflow components, tests, objections, and commercial evidence
- the service can later become software only when repeated paid patterns justify it

---

## 3. Ideal customer profile

### 3.1 Required characteristics

A qualified founder prospect should satisfy most of the following:

- Swedish installation, maintenance, repair, or field-service company
- approximately 5–49 employees
- accepts quote, booking, fault, or service requests through email or a website form
- has a visible owner, operations manager, service manager, sales lead, or office manager
- has recurring manual intake, classification, information chasing, task creation, or follow-up
- can trial one workflow without replacing its ERP, CRM, accounting system, or entire operating process
- is able to make a small operational purchase without a long public procurement cycle

### 3.2 Qualification triggers

A prospect becomes higher priority when public evidence or a buyer conversation indicates one or more of:

- delayed responses to incoming inquiries
- repeated requests missing job location, problem description, timing, photos, access details, or other required data
- manual copying between inbox, spreadsheet, calendar, task system, CRM, or ERP
- leads or service requests without a consistent next action
- office staff spending material time routing and drafting repetitive messages
- a desire to test AI but insufficient internal implementation capability

### 3.3 Economic qualification

The workflow should have a credible path to payback. At least one should apply:

- 25 or more relevant inbound requests per month
- high-value requests where one recovered or accelerated opportunity can justify the pilot
- at least four hours of repetitive administrative effort per month that the workflow can materially reduce
- a measurable response-time, completion, follow-up, or error problem that management already wants to improve

These thresholds are qualification hypotheses, not claims about the segment.

### 3.4 Disqualifiers

Do not sell the founder pilot when:

- the customer wants an autonomous system to make consequential decisions or send messages without review
- the workflow requires sensitive or special-category personal data in the founder phase
- success depends on replacing the customer's core ERP or CRM
- the customer expects a broad “AI transformation” for the founder price
- the buyer cannot identify a workflow owner or baseline
- the implementation requires on-site work the owner cannot provide
- the customer requires certifications, insurance, security controls, or procurement processes that cannot be met honestly

---

## 4. Offer architecture

### 4.1 Founder offer — 6,900 SEK excluding VAT

**Purpose:** Obtain the first paid evidence while tightly limiting delivery risk.

**Included:**

1. one remote workflow-mapping session
2. one frozen input-to-output workflow contract
3. one synthetic demonstration before customer-data access
4. one bounded implementation using the customer's existing workflow where feasible
5. one explicit human approval point before external action
6. deterministic acceptance tests and a recorded handover
7. a simple operator guide and rollback/manual fallback
8. 14 calendar days of correction support for defects inside the frozen scope

**Excluded:**

- autonomous outbound sending
- broad CRM/ERP migration
- custom mobile application
- multi-tenant SaaS platform
- unrestricted integrations
- historical data migration
- 24/7 support
- consequential HR, credit, health, legal, safety, or compliance decisions
- additional workflows
- changes caused by third-party platform or API changes after the support window

**Delivery cap:** 8 implementation hours plus 1 support hour. Scope is revised or rejected before sale when the acceptance contract cannot fit this cap.

**Tool-cost cap:** 300 SEK for founder validation unless the owner approves a customer-funded exception.

### 4.2 Standard offer — price hypothesis 14,900 SEK excluding VAT

The standard offer may be used only after the founder workflow has passed delivery QA and produced a useful buyer outcome.

It retains one-workflow scope but may include one established integration, stronger monitoring, and a 30-day correction window. The normal delivery cap is 10 hours unless the price and scope are explicitly revised.

### 4.3 Optional care plan — price hypothesis 1,490 SEK/month excluding VAT

**Included:**

- basic workflow-health review
- failure-log review
- provider/configuration compatibility check
- up to 30 minutes of minor correction work per month
- monthly outcome and incident summary

Unused correction time does not accumulate. New features, new systems, new workflow branches, and major provider changes are quoted separately.

### 4.4 Productization trigger

The company must not convert this offer into SaaS merely because the code can be generalized.

A productization proposal becomes eligible only after:

- at least five paid implementations
- at least three customers using substantially the same workflow
- at least 60% of implementation logic shared without customer-specific code
- a documented repeated acquisition channel
- support burden below the approved ceiling
- a clear buyer preference for self-service or repeatable deployment
- Commercial Red Team, Architecture, and QA approval

Until then, reusable components remain an internal delivery kit.

---

## 5. Customer outcome and measurement

The service sells a controlled operational result, not “AI.”

### 5.1 Baseline metrics

Before implementation, record where feasible:

- median time from inquiry receipt to first prepared response
- percentage of inquiries missing required information
- administrative minutes per inquiry
- percentage receiving a documented next action
- percentage receiving follow-up by the agreed time
- number of duplicate or lost internal tasks

### 5.2 Acceptance metrics

The paid pilot must define exact thresholds. The default acceptance set is:

- a synthetic fixture completes the intended happy path
- missing required fields are detected correctly on the approved fixture set
- no external message is sent without human approval
- duplicate input does not create uncontrolled duplicate actions
- failed provider/integration calls produce a visible recoverable state
- audit log records input reference, transformation state, approval, action, and failure
- operator can disable the workflow and use a documented manual fallback

### 5.3 Value claim policy

No claim about revenue increase, hours saved, response improvement, or accuracy may be used in marketing until it is supported by the customer's recorded baseline and measured outcome.

A synthetic demonstration proves technical behavior only. It does not prove customer value.

---

## 6. Founder-validation funnel

### 6.1 Evidence targets

Before production build permission:

- 10 independent pain signals
- 3 price or payment signals
- 20 reachable qualified prospects
- one passed technical probe with recorded output
- one documented acquisition route and response metric
- completed privacy, legal, security, and delivery-risk review

Founder campaign targets:

- 30 qualified prospects
- 5 substantive buyer conversations or equivalent written exchanges
- 1 paid founder pilot

Targets remain incomplete until a source artifact exists.

### 6.2 Funnel stages

```text
Qualified
  → reviewed for lawful contact
  → owner-approved outreach
  → response observed
  → pain confirmed
  → discovery completed
  → price discussed
  → proposal issued
  → assignment registered/approved through Frilans Finans
  → customer acceptance
  → paid pilot delivered
  → outcome reviewed
  → care plan or referral
```

Each stage has one observable event. Agents may not advance records based on probability or sentiment alone.

### 6.3 Outreach policy

Initial outreach is controlled and low volume:

- use public company contact routes, role addresses, or directly relevant publicly listed business contacts
- do not scrape private addresses or sensitive personal data
- document purpose, necessity, data minimization, retention, and opt-out handling
- identify the sender and commercial purpose clearly
- provide a simple way to decline further contact
- personalize from verified business facts; do not fabricate familiarity
- maximum two touches in the initial test unless the prospect engages
- the owner approves and sends; autonomous outbound communication remains disabled

A legitimate-interest assessment and marketing-law review are required before outreach. Legal uncertainty is a stop condition, not a prompt-engineering problem.

### 6.4 Initial message hypothesis

The message should not lead with a general AI service. It should ask whether one observed workflow problem is real and offer a brief demonstration of the proposed controlled process.

Structure:

1. one verified company-specific observation
2. one narrow problem hypothesis
3. one concrete controlled workflow outcome
4. explicit human approval/safety boundary
5. one low-friction question
6. sender identity and opt-out

The exact message remains an owner-approved artifact in Revenue Operations.

### 6.5 Kill and revision rules

- Fewer than 3 substantive responses after 30 qualified prospects and two controlled touches: stop; revise segment, channel, or message before more outreach.
- Fewer than 2 clear pain confirmations after 5 substantive conversations: kill or materially redefine the problem.
- Three qualified price discussions with no willingness near 6,900 SEK and no credible counter-offer: revise or kill the offer before building more.
- Founder delivery exceeds 12 hours, needs broad custom integration, or produces no measurable customer outcome: do not repeat unchanged.
- Any privacy, security, legal, procurement, or support condition outside the approved boundary: stop and escalate.

---

## 7. Delivery operating procedure

### 7.1 Pre-sale

1. Market Intelligence records evidence.
2. Product Lead freezes the buyer, workflow, outcome, scope, exclusions, and acceptance metrics.
3. Commercial Red Team issues `KILL`, `EXPERIMENT`, `BUILD-READY`, or `PRIORITY`.
4. Solutions Architect defines data, integration, security, tests, cost, and rollback.
5. QA / Security reviews the synthetic-demo design.
6. Build Engineer produces and verifies the synthetic demonstration in an isolated workspace.
7. Revenue Operations prepares scope, proposal, payment path, and CRM evidence.
8. Owner decides whether external contact is authorized.

### 7.2 Paid pilot

1. Register and establish the assignment through Frilans Finans before compensation and work are agreed with the customer.
2. Confirm the customer understands that Frilans Finans is the legal contracting/invoicing party.
3. Freeze the acceptance contract and customer responsibilities.
4. Use synthetic fixtures before any approved customer data.
5. Minimize data and secrets; use customer-controlled or local processing where practical.
6. Build in an isolated branch/worktree.
7. Run deterministic tests, type checks, build, security checks, and manual-path evidence.
8. Independent QA issues `APPROVED` or `NEEDS WORK`.
9. Owner approves any production connection or deployment.
10. Handover, measure outcome, record support time, and create the invoice action for the owner.

### 7.3 Change control

A request is out of scope when it introduces a new workflow, system, data category, autonomous action, user class, deployment environment, or material acceptance criterion.

Revenue Operations records the change; Product and Architecture estimate it; the owner approves a new price and Frilans Finans/customer agreement before work begins.

---

## 8. Payment and legal operating path

### 8.1 Initial seller structure

Use Frilans Finans for the first one to three assignments rather than delaying validation for company formation.

Current public information states that account creation is free and that the service retains 4–6% of the invoice amount. Frilans Finans can pre-approve a registered assignment, provide insurance conditions, contract with the customer, invoice, handle employer contributions/tax, and pay salary under its terms.

This is not a substitute for reading the actual assignment, insurance, customer, and payment terms before each job.

### 8.2 Sequencing rule

Skatteverket states that the individual must first join/agree with the self-employment company about which assignments it will contract and invoice **before agreeing compensation for the assignment**. Therefore:

```text
qualified opportunity
  → prepare scope and price internally
  → register/establish assignment with Frilans Finans
  → confirm Frilans Finans as legal contracting party
  → agree compensation and work with customer
  → deliver
  → owner submits invoice basis
```

Agents may prepare every field but cannot perform BankID/2FA, identity verification, banking changes, legal acceptance, customer commitment, or invoice submission for the owner.

### 8.3 Conservative unit economics

At the founder price of 6,900 SEK excluding VAT:

- invoice revenue: 6,900 SEK
- maximum 6% Frilans Finans fee: 414 SEK
- founder tool-cost cap: 300 SEK
- remaining before employer contributions, income tax, pension effects, and any other approved cost: 6,186 SEK
- at the 9-hour total delivery/support cap: approximately 687 SEK/hour before payroll taxes and personal income tax

At the standard price of 14,900 SEK excluding VAT:

- invoice revenue: 14,900 SEK
- maximum 6% Frilans Finans fee: 894 SEK
- standard tool-cost cap: 400 SEK
- remaining before employer contributions, income tax, pension effects, and other approved cost: 13,606 SEK
- at the 10-hour delivery cap: approximately 1,361 SEK/hour before payroll taxes and personal income tax

These figures are operating comparisons, not take-home-pay estimates. Actual salary depends on Frilans Finans terms, age, pension, tax, expenses, and the individual's tax situation.

### 8.4 Structure review gate

Review whether to establish an own business after the first one to three paid assignments, or earlier if a customer/contract requires it. The decision should compare expected recurring revenue, liability, insurance, VAT/accounting burden, Frilans fees, customer procurement requirements, and the owner's employment situation.

---

## 9. Revenue scenarios

These are capacity scenarios, not forecasts.

| Scenario | Implementations/month | Care clients | Invoiced ex VAT/month |
|---|---:|---:|---:|
| Proof | 1 founder pilot at 6,900 | 0 | 6,900 SEK |
| Conservative repeatability | 1 standard at 14,900 | 3 × 1,490 | 19,370 SEK |
| Base solo operation | 2 standard at 14,900 | 5 × 1,490 | 37,250 SEK |
| High solo capacity | 3 standard at 14,900 | 8 × 1,490 | 56,620 SEK |

The company does not plan around the high-capacity scenario until delivery time, support burden, acquisition cost, and owner availability have been measured.

### 9.1 Cash metric

The only top-line revenue metrics are:

- invoice approved
- invoice sent
- cash received
- salary paid

Simulated revenue, pipeline value, model confidence, proposals, and verbal interest are not revenue.

---

## 10. Company OS operating model

### 10.1 Agent organization

| Role | Primary accountability | Cannot self-approve |
|---|---|---|
| CEO / Portfolio Lead | objectives, priorities, budgets, escalation | strategy completion |
| Market Intelligence | traceable demand and distribution evidence | commercial viability |
| Commercial Red Team | attack assumptions and weak evidence | original proposal |
| Product Lead | buyer, outcome, scope, acceptance contract | market evidence |
| Solutions Architect | system boundary, data, security, tests, rollback | production release |
| Build Engineer | isolated implementation and build evidence | delivery quality |
| QA / Security | independent acceptance and risk verdict | implementation |
| Revenue Operations | offer, CRM, payment readiness, metrics | external contact or contracts |

### 10.2 Venture pipeline

```text
CAPTURE
  → MARKET EVIDENCE
  → COMMERCIAL RED TEAM
  → DETERMINISTIC SCORE
  → VALIDATION EXPERIMENT
  → OWNER GATE
  → PRODUCT CONTRACT
  → ARCHITECTURE / THREAT MODEL
  → ISOLATED BUILD LOOP
  → TEST / BUILD / MANUAL EVIDENCE
  → INDEPENDENT QA
  → OWNER DEPLOYMENT GATE
  → CUSTOMER OUTCOME
  → POSTMORTEM / IMPROVEMENT PROPOSAL
```

A score cannot override missing evidence. A successful build cannot override Commercial Red Team. A model verdict cannot override deterministic failures. An internal approval cannot override an owner gate.

### 10.3 Initial hard budgets

Until the first customer payment signal:

- company model/tool budget: maximum 1,000 SEK/month
- one validation experiment: maximum 250 SEK unless owner approved
- one founder pilot tool budget: maximum 300 SEK unless customer funded
- no paid subscription or provider upgrade without owner approval
- no agent may continue a failed loop merely to consume remaining budget

Paperclip budgets should be configured below these ceilings where provider costs allow.

### 10.4 Required audit trail

Every material task records:

- parent goal and accountable role
- inputs and source artifacts
- assumptions and unknowns
- tool calls or commands
- changed files and diff
- test/build output
- cost and elapsed time
- review verdict
- owner gate
- customer/outcome evidence where applicable

---

## 11. Coding loop contract

A coding task is accepted only when it has:

- approved product and architecture contract
- isolated workspace, branch, or worktree
- smallest coherent scope
- deterministic fixture
- acceptance tests and negative tests
- type/lint/build commands where applicable
- secret and personal-data boundary
- retry/idempotency/failure behavior
- manual-path or screenshot evidence where required
- independent QA reviewer
- rollback path

A loop stops when:

- the same failure repeats without new evidence
- cost or iteration ceiling is reached
- scope changes
- a secret, production credential, or customer-data requirement appears
- tests cannot represent the claimed outcome
- the agent proposes weakening verification

The loop returns `BLOCKED` with evidence; it does not declare success through prose.

---

## 12. Safe self-improvement

The company may continuously propose improvements, but production self-modification is never automatic.

An improvement requires:

1. a recorded failure, correction, cost regression, or quality metric
2. immutable baseline
3. one bounded candidate change
4. representative eval set and hidden holdout
5. quality, reliability, safety, latency, and cost thresholds
6. regression and reward-hacking review
7. reviewable diff
8. isolated canary
9. independent QA
10. owner approval and immediate rollback

Agents may not widen their permissions, access new secrets, change owner gates, weaken tests, modify cost ceilings, delete the baseline, or deploy their own improvement.

---

## 13. Scorecard

### 13.1 Commercial score

Maximum positive score: 100. Risk penalty: up to 20.

- pain urgency: 15
- willingness to pay: 15
- reachability: 12
- proof speed: 10
- delivery feasibility: 10
- gross margin: 10
- recurring potential: 8
- differentiation: 8
- founder fit: 7
- evidence quality: 5
- risk penalty: subtract 0–20

Decision:

- below 65: `KILL`
- 65+ with missing evidence: `EXPERIMENT`
- 75+ with complete evidence: `BUILD-READY`
- 85+ with complete evidence: `PRIORITY`

### 13.2 Operating KPIs

**Commercial truth**

- qualified prospects with sources
- substantive response rate
- pain confirmations
- price/payment signals
- proposals issued
- paid pilots
- cash received

**Delivery truth**

- hours per implementation
- acceptance pass rate
- defects during support window
- support minutes per customer
- cost per accepted deliverable
- percentage of implementation logic reused

**Agent truth**

- tasks accepted by independent review
- false-done rate
- rework rate
- cost per accepted artifact
- owner interventions caused by missing context
- regression rate after improvements

---

## 14. First execution sequence

The initial Paperclip project contains six starter tasks:

1. Freeze the founder offer and acceptance contract.
2. Design the synthetic workflow demonstration.
3. Build and verify the synthetic demonstration.
4. Build the 30-prospect evidence pack.
5. Prepare offer, outreach, CRM, and payment readiness.
6. Present the owner decision gate for controlled outreach.

The first task may begin internally as soon as the local runtime is installed and the company package is imported. No customer contact is required to begin the internal sequence.

---

## 15. What would invalidate this plan

The plan is not “watertight” in the sense of guaranteed demand; no honest plan can be. It is designed to fail cheaply and expose false assumptions.

Material invalidation includes:

- the target firms do not experience the proposed workflow pain
- decision-makers are not reachable through a sustainable lawful channel
- buyers will not discuss a price near the founder hypothesis
- existing tools solve the problem sufficiently with little implementation help
- privacy, system access, or integration requirements exceed the founder boundary
- owner sales time or delivery time is incompatible with family and full-time employment
- repeated delivery does not produce reusable components or manageable support

Any of these produces a documented pivot or kill decision rather than additional speculative building.

---

## 16. Sources and evidence classification

Accessed 2026-08-19.

### Authoritative sources

- Statistics Sweden, *ICT usage in enterprises, 2025*: https://www.scb.se/en/finding-statistics/statistics-by-subject-area/research-and-the-digital-society/the-digital-society/ict-usage-in-enterprises/pong/statistical-news/ict-usage-in-enterprises-2025/
- Statistics Sweden, *Artificial intelligence in enterprises 2025*: https://www.scb.se/en/finding-statistics/statistics-by-subject-area/research-and-the-digital-society/ovrigt/artificial-intelligence-in-sweden/pong/statistical-news/artificiell-intelligens-i-sverige-2025/
- Skatteverket, *Att jobba som egenanställd*: https://www.skatteverket.se/privat/skatter/arbeteochinkomst/inkomster/egenanstallning.4.4a47257e143e26725ae2b73.html
- IMY, *AI och rättslig grund*: https://www.imy.se/verksamhet/dataskydd/innovationsportalen/vagledning-om-gdpr-och-ai/gdpr-och-ai/ai-och-rattslig-grund/
- Installatörsföretagen, *Säker El*: https://www.in.se/tjanster/saker-el/

### Provider/vendor sources

These describe provider terms or asking prices and are not independent proof of customer payment.

- Frilans Finans, service and fee information: https://www.frilansfinans.se/
- Frilans Finans, assignment registration process: https://www.frilansfinans.se/sa-har-fungerar-det/
- Aurora Media, advertised entry price: https://auroramedia.se/ai-automation-linkoping
- Neem AI, advertised automation packages: https://neemai.se/

---

## Final operating instruction

The fastest path is not to make the OS larger. It is to make the OS complete **one evidence-producing sequence**:

```text
one qualified painful workflow
  → one controlled demonstration
  → one owner-approved customer test
  → one paid pilot
  → one measured outcome
  → one repeatable delivery kit
```

Every feature, agent, integration, and self-improvement proposal is subordinate to that sequence.
