# Research ledger — Revenue Mission 001

**Research date:** 2026-08-19  
**Purpose:** document decision inputs and prevent unsupported claims.

## Market context

- Statistics Sweden reported that 35.0% of Swedish enterprises with at least 10 employees used AI in 2025, an increase of 10.9 percentage points. This supports growing familiarity, not demand for this specific offer.
- Public prospect sites repeatedly expose generic forms/inboxes, quote routes, service categories, and response-time promises. This proves reachability and observable workflow structure only.

## Outreach and privacy controls

- Treat public business contact information as personal data when it can identify a natural person.
- Use generic legal-person channels in the first test, document purpose/source, offer an easy objection route, and maintain suppression.
- Do not use sole traders or private addresses in the first batch.
- No automated sending is authorized.

## Contracting/payment readiness

- Frilans Finans publicly describes a free account, invoicing through its system, and a 4–6% invoice fee.
- Its guidance states that the assignment agreement should be between Frilans Finans and the client before work is performed, and work orders should be registered/approved before start for the relevant protections.
- The authenticated terms and suitability for this exact software/automation assignment must be checked before accepting or starting paid work.

## Architecture references

Julian Goldie’s public description of Hermes Agent OS emphasizes models, memory, tools, roles, schedules, and a visible command center rather than a single chatbot. Nous Research’s Hermes Agent remains an active agent engine. Paperclip publicly positions itself as a control plane for AI-run companies. These are references, not proof that an autonomous company is safe or profitable.

The implementation decision for this repository is therefore:

- Agent OS is the governed primary control plane.
- Hermes can be a model/tool worker, not an unrestricted host administrator.
- Paperclip remains optional until its local adapter passes a real smoke test.
- Human approval remains mandatory before outreach, money, contracts, production, secrets, or customer data.
- Self-improvement means measured proposals, tests, review, rollback, and owner approval—not uncontrolled self-modification.

## Evidence gaps

- 30 fully qualified prospects: incomplete; candidate ledger exists, several size checks remain.
- Independent pain signals: 0 direct.
- Explicit price/payment signals: 0.
- Paid pilot: 0.
- Production integration evidence: intentionally not pursued before commercial validation.
