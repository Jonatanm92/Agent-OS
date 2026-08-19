import type Database from 'better-sqlite3';

/**
 * Default settings rows.
 *
 * Connection settings are deliberately not seeded: DB values override .env,
 * so an inserted default would hide the owner's actual FCC/provider settings.
 */
const DEFAULT_SETTINGS: Record<string, string> = {
  active_project_id: '',
  company_name: 'Hermes Oracle Company OS',
  company_mission:
    'Create verified, useful software and automation that earns real revenue while keeping the owner in control of money, customer contact, legal commitments, secrets, and production changes.',
  company_owner_gates: JSON.stringify([
    'external customer contact',
    'spend or paid subscriptions',
    'contracts and binding legal acceptance',
    'payment-account changes',
    'production deployment',
    'secret access',
    'self-modification promotion',
  ]),
  company_roles: JSON.stringify([
    { id: 'ceo', title: 'CEO / Portfolio Lead', agent: 'orchestrator', mandate: 'prioritize goals, budgets, and work' },
    { id: 'market', title: 'Market Intelligence Lead', agent: 'growth-hacker', mandate: 'collect traceable demand and distribution evidence' },
    { id: 'red-team', title: 'Commercial Red Team', agent: 'reality-checker', mandate: 'attack assumptions and block weak ventures' },
    { id: 'product', title: 'Product Lead', agent: 'rapid-prototyper', mandate: 'turn validated pain into a narrow offer and acceptance test' },
    { id: 'architecture', title: 'Solutions Architect', agent: 'backend-architect', mandate: 'design minimal, secure, maintainable systems' },
    { id: 'builder', title: 'Build Engineer', agent: 'codex', mandate: 'implement in an isolated workspace with tests' },
    { id: 'qa', title: 'QA / Security', agent: 'reality-checker', mandate: 'verify from tests, diffs, screenshots, and risk evidence' },
    { id: 'revenue', title: 'Revenue Operations', agent: 'free-claude-code', mandate: 'offer, CRM, invoicing readiness, and metrics' },
  ]),
};

const FIRST_MISSION_PLAN = `DECISION: EXPERIMENT
DETERMINISTIC SCORE: 74/100
PRODUCTION BUILD ALLOWED: NO

EVIDENCE GAPS:
- Collect 10 independent pain signals from qualified Swedish small service firms.
- Collect 3 price/payment signals from real buyers or directly comparable purchases.
- Identify at least 20 reachable decision-makers.
- Pass one technical feasibility probe using synthetic data.
- Document one concrete acquisition path and response metric.
- Complete privacy, legal, security, and delivery-risk review.

THESIS:
Swedish service firms with 10-49 employees often have repetitive lead-intake, email, follow-up, and administrative work but lack the expertise to turn AI experimentation into a defined, safe workflow. Sell one fixed-scope, human-approved workflow implementation rather than speculative custom software.

FOUNDER OFFER UNDER TEST:
AI Workflow Revenue Sprint — map one repetitive sales/admin workflow, build one human-approved automation, define acceptance metrics, hand over the system, and include 14 days of correction support.
Founder-pilot hypothesis: 6,900 SEK excluding VAT. Regular-price hypothesis after proof: 14,900 SEK setup plus optional 1,490 SEK/month support.

FIRST TARGET WEDGE:
Swedish installation and field-service firms with 5-49 employees that receive quote/service requests by website form or email. Initial workflow hypothesis: inquiry arrives → classify → detect missing information → draft reply → create internal task → human approves → follow-up reminder.

RED TEAM:
A generic “AI automation” offer is hard to trust and easy to compare with cheap tools. The offer must be sold around a measurable operational result, keep a human approval step, use the customer's existing inbox/workflow where possible, and avoid handling sensitive/high-risk decisions in the founder pilot.

NEXT EXPERIMENT:
Create a synthetic, non-production demonstration and a 30-prospect evidence pack. Do not contact prospects until the owner approves the final offer and outreach.

EXECUTION PLAN:
1. Define the exact input, output, integrations, exclusions, and acceptance test.
2. Build the synthetic demonstration and record before/after time and error assumptions.
3. Assemble 30 qualified prospects and capture 10 traceable pain signals.
4. Produce one-page offer, founder terms, discovery script, and personalized outreach drafts.
5. Route invoicing through Frilans Finans; register the assignment before agreeing the paid work.
6. Owner approves external contact. Track replies, calls, objections, and payment signals.
7. Build production work only after the evidence gate passes.`;

export function seedDefaults(db: Database.Database): void {
  const settingInsert = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  const pipelineInsert = db.prepare(`
    INSERT OR IGNORE INTO pipeline_items
      (id, title, raw, stage, item_type, tags, plan, score, deliverable, project_id, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, '', NULL, ?, ?)
  `);
  const skillInsert = db.prepare(`
    INSERT OR IGNORE INTO skills
      (id, name, description, prompt, agent_id, created_at)
    VALUES
      (?, ?, ?, ?, ?, ?)
  `);
  const loopInsert = db.prepare(`
    INSERT OR IGNORE INTO loops
      (id, name, prompt, agent_id, interval_minutes, enabled, last_run, next_run, created_at)
    VALUES
      (?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `);

  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      settingInsert.run(key, value);
    }

    pipelineInsert.run(
      'rev-001-ai-workflow-revenue-sprint',
      'REV-001 — Validate the AI Workflow Revenue Sprint',
      'Find the fastest legitimate path to the first paid AI software/automation customer without building an unvalidated SaaS.',
      'gate',
      'venture',
      JSON.stringify(['revenue', 'sweden', 'automation', 'founder-pilot', 'experiment']),
      FIRST_MISSION_PLAN,
      74,
      now,
      now
    );

    const skills = [
      {
        id: 'company-evidence-packet',
        name: 'Company: Build an evidence packet',
        description: 'Collects claims, counter-evidence, assumptions, and decisive tests without inventing demand.',
        agent: 'growth-hacker',
        prompt:
          'Build a traceable evidence packet for this venture: {{input}}. Separate observed facts, sourced claims, inferences, and unknowns. Include pain evidence, price/payment evidence, reachable buyers, competitors/substitutes, acquisition path, technical probe, risks, and the cheapest decisive experiment. Never treat an LLM opinion as market evidence.',
      },
      {
        id: 'company-red-team',
        name: 'Company: Red-team a venture',
        description: 'Attempts to kill weak commercial ideas before they consume build time.',
        agent: 'reality-checker',
        prompt:
          'Red-team this venture: {{input}}. Default to NEEDS WORK. Attack urgency, willingness to pay, reachability, distribution, differentiation, feasibility, support burden, privacy/security/legal exposure, and founder fit. State what evidence would reverse each objection. End with KILL, EXPERIMENT, or BUILD-READY.',
      },
      {
        id: 'company-acceptance-contract',
        name: 'Company: Write a build acceptance contract',
        description: 'Turns a validated task into deterministic completion criteria before coding starts.',
        agent: 'backend-architect',
        prompt:
          'Write a build acceptance contract for: {{input}}. Include exact scope, exclusions, inputs, outputs, user path, data policy, failure modes, deterministic tests, build command, screenshot/manual checks, security checks, rollback, and what evidence is required before shipping.',
      },
      {
        id: 'company-improvement-proposal',
        name: 'Company: Propose a safe self-improvement',
        description: 'Creates a measured improvement proposal; it never edits production directly.',
        agent: 'ai-engineer',
        prompt:
          'Using this failure trace or performance history: {{input}}, propose exactly one bounded improvement. Define baseline, eval dataset, hidden holdout, success threshold, cost ceiling, regression checks, canary, rollback, and owner approval gate. Do not directly modify prompts, skills, code, or production configuration.',
      },
    ];

    for (const skill of skills) {
      skillInsert.run(
        skill.id,
        skill.name,
        skill.description,
        skill.prompt,
        skill.agent,
        now
      );
    }

    loopInsert.run(
      'company-ceo-heartbeat',
      'Company CEO heartbeat',
      `You are the CEO / Portfolio Lead for Hermes Oracle Company OS. Review the mission below and produce a concise operating brief with: current objective, next three internal tasks, blockers, owner approvals needed, cost/risk warning, and one measurable outcome for the next cycle. Do not claim customer contact, payment, web research, deployment, or completed evidence unless supplied in the mission. Do not invent progress.\n\n${FIRST_MISSION_PLAN}`,
      'orchestrator',
      720,
      1,
      now,
      now
    );

    loopInsert.run(
      'company-safe-improvement-review',
      'Safe self-improvement review',
      'Review recent agent audit outcomes and propose at most one bounded improvement. A proposal must define a baseline, evals, success threshold, regression checks, cost ceiling, canary, rollback, and owner approval. Never edit or promote production code, prompts, tools, skills, permissions, secrets, or models directly.',
      'ai-engineer',
      10080,
      0,
      null,
      now
    );
  });

  transaction();
}

export { DEFAULT_SETTINGS, FIRST_MISSION_PLAN };
