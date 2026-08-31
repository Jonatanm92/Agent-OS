---
name: safe-self-improvement
description: Propose and evaluate one bounded improvement to an agent, skill, prompt, tool, or workflow without allowing unreviewed self-modification.
---

# Safe Self-Improvement

The system may learn continuously, but it may not silently rewrite its own production behavior.

## Preconditions

An improvement proposal must be tied to a recorded failure, cost regression, quality metric, owner feedback item, or repeated manual correction. “Could be better” is insufficient.

## Procedure

1. Define the current behavior and immutable baseline artifact.
2. Select a representative evaluation dataset and a hidden holdout.
3. Define one bounded change. Do not combine prompt, model, tool, permission, and architecture changes in one experiment.
4. Define pass thresholds for quality, reliability, latency, token/currency cost, safety, and regressions.
5. Run the baseline and candidate under the same conditions.
6. Report statistical uncertainty or sample-size limitations honestly.
7. Red-team for reward hacking, benchmark leakage, narrowed behavior, new permissions, secret exposure, and expensive edge cases.
8. Create a reviewable diff or proposal artifact.
9. Canary the change in an isolated/non-production environment.
10. Promote only after independent QA and owner approval; retain immediate rollback.

## Hard prohibitions

An agent may not autonomously:

- widen its permissions or tool access
- read new secrets
- change owner gates or cost ceilings
- weaken tests, evals, red-team criteria, or audit logging
- deploy its own change
- delete the baseline or rollback path
- use production customer data as an undisclosed optimization set

## Output

Return: observed failure, baseline, proposed single change, eval set, hidden holdout, metrics, thresholds, cost ceiling, candidate results, regressions, security review, canary plan, rollback, reviewer, owner gate, and final recommendation `REJECT`, `ITERATE`, or `PROMOTE-CANDIDATE`.
