import type Database from 'better-sqlite3';

/**
 * Company bootstrap data.
 *
 * Provider credentials and connection settings are never seeded. Company role
 * IDs and owner gates are governed runtime contracts and are migrated from the
 * legacy personal-project profiles when their exact old values are detected.
 */

const COMPANY_ROLES = [
  {
    id: 'ceo',
    title: 'CEO / Orchestrator',
    agent: 'ceo',
    mandate: 'Own the mission, sequence work, enforce budgets and escalate irreversible decisions.',
  },
  {
    id: 'market',
    title: 'Market Intelligence',
    agent: 'market-intelligence',
    mandate: 'Collect source-traceable demand, buyer, pricing and distribution evidence.',
  },
  {
    id: 'red-team',
    title: 'Commercial Red Team',
    agent: 'commercial-red-team',
    mandate: 'Attempt to falsify weak opportunities before build time or money is committed.',
  },
  {
    id: 'product',
    title: 'Product Lead',
    agent: 'product-lead',
    mandate: 'Freeze the smallest sellable scope and its measurable acceptance contract.',
  },
  {
    id: 'architecture',
    title: 'Software Architect',
    agent: 'software-architect',
    mandate: 'Design the simplest reversible implementation and its trust boundaries.',
  },
  {
    id: 'builder',
    title: 'Build Engineer',
    agent: 'build-engineer',
    mandate: 'Implement bounded work inside the governed workspace and fixed sandbox tasks.',
  },
  {
    id: 'qa',
    title: 'QA & Security',
    agent: 'qa-security',
    mandate: 'Independently verify tests, evidence, security, rollback and residual risk.',
  },
  {
    id: 'revenue',
    title: 'Revenue Operations',
    agent: 'revenue-operations',
    mandate: 'Prepare qualified prospects, outreach drafts, CRM and payment readiness without sending.',
  },
];

const OWNER_GATES = [
  'external customer contact',
  'spend or paid subscriptions',
  'contracts and binding legal acceptance',
  'payment-account changes and invoice submission',
  'production deployment or public release',
  'secret or credential access',
  'self-modification promotion',
];

const DEFAULT_SETTINGS: Record<string, string> = {
  active_project_id: '',
  company_name: 'Hermes Oracle Company OS',
  company_mission:
    'Create verified software and automation that earns real revenue while the owner controls customers, money, legal commitments, secrets, production and self-modification.',
  company_owner_gates: JSON.stringify(OWNER_GATES),
  company_roles: JSON.stringify(COMPANY_ROLES),
};

const FIRST_MISSION_PLAN = `DECISION: EXPERIMENT
DETERMINISTIC SCORE: 74/100
PRODUCTION BUILD ALLOWED: NO

STATUS:
This is a commercial hypothesis, not proof of demand, a customer, a payment, or permission to build production software.

EVIDENCE GAPS:
- Collect 10 independent pain signals from qualified Swedish small service firms.
- Collect 3 price or payment signals from real buyers or directly comparable purchases.
- Identify at least 20 reachable decision-makers.
- Pass one technical feasibility probe using synthetic data.
- Document one concrete acquisition path and response metric.
- Complete privacy, legal, security, and delivery-risk review.

THESIS:
Swedish service firms with 5-49 employees may have repetitive lead-intake, email, follow-up, and administrative work but lack a defined, safe implementation path. Test a fixed-scope, human-approved workflow service before considering a software product.

FOUNDER OFFER UNDER TEST:
AI Workflow Revenue Sprint — map one repetitive sales or administrative workflow, build one human-approved automation, define acceptance metrics, hand over the system, and include 14 days of correction support.
Founder-pilot price hypothesis: 6,900 SEK excluding VAT. This is not validated pricing.

FIRST TARGET WEDGE:
Swedish installation and field-service firms with 5-49 employees that receive quote or service requests by website form or email. Initial workflow hypothesis: inquiry arrives → classify → detect missing information → draft reply → create internal task → human approves → follow-up reminder.

RED TEAM:
A generic “AI automation” offer is hard to trust and easy to compare with cheap tools. The test must be sold around a measurable operational result, keep a human approval step, use the customer's existing workflow where possible, and avoid sensitive or high-risk decisions.

NEXT EXPERIMENT:
Create a synthetic, non-production demonstration and a 30-prospect evidence pack. Do not contact prospects until the owner approves the final offer and outreach.

EXECUTION PLAN:
1. Freeze the exact input, output, integrations, exclusions, acceptance test, privacy boundary and delivery ceiling.
2. Build only the synthetic technical probe and record its assumptions, failures and measured runtime.
3. Assemble 30 qualified prospects and a traceable evidence ledger.
4. Prepare a one-page offer, discovery script, CRM schema and personalized outreach drafts marked NOT SENT.
5. Prepare the legitimate Swedish payment path; identity, account, assignment and invoice actions remain owner-gated.
6. Owner reviews evidence and explicitly approves or rejects external contact.
7. Build customer production work only after a real paid scope is agreed and the technical/security gate passes.`;

interface SkillSeed {
  id: string;
  name: string;
  description: string;
  prompt: string;
  agent: string;
}

const COMPANY_SKILLS: SkillSeed[] = [
  {
    id: 'company-evidence-packet',
    name: 'Company: Build an evidence packet',
    description: 'Separates observed evidence, inference and unknowns before a commercial decision.',
    agent: 'market-intelligence',
    prompt:
      'Build a traceable evidence packet for this venture: {{input}}. Separate observed facts, sourced claims, inferences, contradictions, and unknowns. Cover painful job, current workaround, buyer authority, payment signals, reachable prospects, substitutes, acquisition route, feasibility, privacy/security/legal risk, delivery burden, and the cheapest decisive experiment. Never treat an LLM opinion as market evidence.',
  },
  {
    id: 'company-red-team',
    name: 'Company: Red-team a venture',
    description: 'Attempts to kill weak commercial ideas before they consume build time.',
    agent: 'commercial-red-team',
    prompt:
      'Red-team this venture: {{input}}. Attack urgency, willingness to pay, reachability, switching friction, distribution, differentiation, margins, feasibility, support burden, privacy/security/legal exposure, and founder fit. State what evidence would reverse each objection. End with KILL, EXPERIMENT, or PASS-TO-PRODUCT.',
  },
  {
    id: 'company-acceptance-contract',
    name: 'Company: Write a build acceptance contract',
    description: 'Turns approved work into deterministic completion criteria before coding.',
    agent: 'product-lead',
    prompt:
      'Write a build acceptance contract for: {{input}}. Include buyer outcome, exact scope, exclusions, inputs, outputs, user path, data policy, failure modes, deterministic tests, evidence artifacts, security checks, cost ceiling, stop conditions, rollback, and the owner gates still required.',
  },
  {
    id: 'company-founder-validation',
    name: 'Company: Prepare founder validation',
    description: 'Creates internal revenue assets without contacting prospects.',
    agent: 'revenue-operations',
    prompt:
      'Prepare a founder validation pack for: {{input}}. Include fixed offer, ICP, qualification rules, 30-prospect research schema, personalized outreach drafts marked NOT SENT, CRM fields, discovery questions, objections, follow-up logic, payment-readiness checklist, metrics, and kill thresholds. External contact and invoice actions remain owner-gated.',
  },
  {
    id: 'company-improvement-proposal',
    name: 'Company: Propose a safe self-improvement',
    description: 'Creates one measured proposal; it never modifies or promotes itself.',
    agent: 'software-architect',
    prompt:
      'Using this failure trace or performance history: {{input}}, propose exactly one bounded improvement. Define baseline, eval dataset, hidden holdout, success threshold, safety and cost ceilings, regression checks, canary, independent QA, rollback, and owner promotion gate. Do not modify code, prompts, tools, permissions, tests, budgets, or production configuration.',
  },
];

const LEGACY_SKILL_NAMES = [
  'DSP: Design a waveshaper',
  'Plugin: Scaffold JUCE project',
  'YouTube: Video title ideas',
  'Song: Chord progression for metal',
  'YouTube: Cover video plan',
  'YouTube: Description + tags',
  'YouTube: 2-week content calendar',
];

export function seedDefaults(db: Database.Database): void {
  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  const upsertGovernedSetting = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  const insertPipeline = db.prepare(`
    INSERT OR IGNORE INTO pipeline_items
      (id, title, raw, stage, item_type, tags, plan, score, deliverable, project_id, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, '', NULL, ?, ?)
  `);
  const upsertSkill = db.prepare(`
    INSERT INTO skills (id, name, description, prompt, agent_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      prompt = excluded.prompt,
      agent_id = excluded.agent_id
  `);
  const insertLoop = db.prepare(`
    INSERT OR IGNORE INTO loops
      (id, name, prompt, agent_id, interval_minutes, enabled, last_run, next_run, created_at)
    VALUES (?, ?, ?, ?, ?, 0, NULL, NULL, ?)
  `);

  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    insertSetting.run('active_project_id', '');
    insertSetting.run('company_name', DEFAULT_SETTINGS.company_name);
    insertSetting.run('company_mission', DEFAULT_SETTINGS.company_mission);
    upsertGovernedSetting.run('company_owner_gates', DEFAULT_SETTINGS.company_owner_gates);
    upsertGovernedSetting.run('company_roles', DEFAULT_SETTINGS.company_roles);

    insertPipeline.run(
      'rev-001-ai-workflow-revenue-sprint',
      'REV-001 — Validate the AI Workflow Revenue Sprint',
      'Find the fastest legitimate path to the first paid AI software or automation customer without building an unvalidated SaaS.',
      'gate',
      'venture',
      JSON.stringify(['revenue', 'sweden', 'automation', 'founder-pilot', 'experiment']),
      FIRST_MISSION_PLAN,
      74,
      now,
      now
    );

    for (const skill of COMPANY_SKILLS) {
      upsertSkill.run(
        skill.id,
        skill.name,
        skill.description,
        skill.prompt,
        skill.agent,
        now
      );
    }

    const deleteLegacySkill = db.prepare('DELETE FROM skills WHERE name = ?');
    for (const name of LEGACY_SKILL_NAMES) deleteLegacySkill.run(name);

    insertLoop.run(
      'company-ceo-heartbeat',
      'Company CEO heartbeat',
      `Review the governed company mission below. Produce only an internal operating brief: current objective, next three bounded tasks, blockers, owner approvals, budget or risk warning, and one measurable outcome. Never invent customer contact, market evidence, payment, deployment, or completion.\n\n${FIRST_MISSION_PLAN}`,
      'ceo',
      720,
      now
    );
    insertLoop.run(
      'company-safe-improvement-review',
      'Safe self-improvement review',
      'Review recent audit outcomes and propose at most one bounded improvement with baseline, evals, hidden holdout, success threshold, regression checks, safety and cost ceilings, canary, independent QA, rollback, and owner promotion. Never edit or promote code, prompts, tools, permissions, tests, budgets, secrets, models, or production directly.',
      'software-architect',
      10080,
      now
    );

    // One-time migration of the exact legacy role assignments. Existing owner
    // activation made after this migration is preserved on subsequent boots.
    db.prepare(`
      UPDATE loops
      SET agent_id = 'ceo', enabled = 0, next_run = NULL
      WHERE id = 'company-ceo-heartbeat' AND agent_id = 'orchestrator'
    `).run();
    db.prepare(`
      UPDATE loops
      SET agent_id = 'software-architect', enabled = 0, next_run = NULL
      WHERE id = 'company-safe-improvement-review' AND agent_id = 'ai-engineer'
    `).run();
  });

  transaction();
}

export { COMPANY_ROLES, DEFAULT_SETTINGS, FIRST_MISSION_PLAN, OWNER_GATES };
