import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db/index.js';
import * as fcc from './fcc.js';
import * as memory from './memory.js';
import * as workspace from './workspace.js';
import { runAgentic } from './agentic.js';
import { resolveAgentIdentity } from './agents.js';
import {
  formatSandboxResult,
  runSandboxTask,
  type SandboxTask,
} from './sandbox.js';
import {
  assessVenture,
  formatAssessment,
  type VentureEvidence,
  type VentureScorecard,
} from './venture-score.js';

/**
 * Evidence-gated pipeline — from an untrusted idea to a verified deliverable.
 *
 *   capture  → raw input
 *   shape    → research packet + independent red team + deterministic score
 *   gate     → owner approves the next experiment/build
 *   execute  → isolated workspace build or validation experiment
 *   verify   → sandboxed commands + files + independent reality check
 *   shipped  → only after evidence says it is actually complete
 *
 * A commercial idea never reaches a production build from an LLM score alone.
 * Model-written package scripts never execute directly on the host.
 */

export type Stage = 'capture' | 'gate' | 'execute' | 'shipped';

export interface PipelineItem {
  id: string;
  title: string;
  raw: string;
  stage: Stage;
  item_type: string;
  tags: string;
  plan: string;
  score: number;
  deliverable: string;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

interface VerificationResult {
  passed: boolean;
  summary: string;
  commands: { command: string; passed: boolean; output: string }[];
}

function db() {
  return getDb();
}

export function list(): (Omit<PipelineItem, 'tags'> & { tags: string[] })[] {
  const rows = db()
    .prepare('SELECT * FROM pipeline_items ORDER BY updated_at DESC')
    .all() as PipelineItem[];
  return rows.map((r) => ({ ...r, tags: safeTags(r.tags) }));
}

function safeTags(s: string): string[] {
  try {
    const value = JSON.parse(s);
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

function get(id: string): PipelineItem | undefined {
  return db().prepare('SELECT * FROM pipeline_items WHERE id = ?').get(id) as
    | PipelineItem
    | undefined;
}

function slugify(s: string): string {
  return (
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'item'
  );
}

function fileToVault(item: PipelineItem): void {
  const tags = safeTags(item.tags);
  const body =
    `# ${item.title}\n\n` +
    `- **Stage:** ${item.stage}\n` +
    `- **Type:** ${item.item_type}\n` +
    `- **Score:** ${item.score}%\n` +
    `- **Tags:** ${tags.map((t) => '#' + t).join(' ')}\n` +
    `- **Updated:** ${item.updated_at}\n\n` +
    `## Idea\n${item.raw}\n\n` +
    (item.plan ? `## Plan and gates\n${item.plan}\n\n` : '') +
    (item.deliverable ? `## Deliverable and verification\n${item.deliverable}\n` : '');
  try {
    memory.writeNote(`Pipeline/${slugify(item.raw || item.title)}.md`, body);
  } catch {
    /* vault write is best-effort */
  }
}

export function capture(idea: string): PipelineItem {
  const now = new Date().toISOString();
  const id = randomUUID();
  const title = idea.trim().split('\n')[0].slice(0, 80) || 'Untitled idea';
  db()
    .prepare(
      'INSERT INTO pipeline_items (id, title, raw, stage, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(id, title, idea.trim(), 'capture', now, now);
  const item = get(id)!;
  fileToVault(item);
  return item;
}

function update(id: string, fields: Partial<PipelineItem>): PipelineItem {
  const now = new Date().toISOString();
  const current = get(id);
  if (!current) throw new Error('item not found');
  const merged = { ...current, ...fields, updated_at: now };
  db()
    .prepare(
      'UPDATE pipeline_items SET title=?, raw=?, stage=?, item_type=?, tags=?, plan=?, score=?, deliverable=?, project_id=?, updated_at=? WHERE id=?'
    )
    .run(
      merged.title,
      merged.raw,
      merged.stage,
      merged.item_type,
      typeof merged.tags === 'string' ? merged.tags : JSON.stringify(merged.tags),
      merged.plan,
      merged.score,
      merged.deliverable,
      merged.project_id,
      now,
      id
    );
  const out = get(id)!;
  fileToVault(out);
  return out;
}

export function remove(id: string): void {
  db().prepare('DELETE FROM pipeline_items WHERE id = ?').run(id);
}

function parseJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function integer(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function boolean(value: unknown): boolean {
  return value === true;
}

function toScorecard(value: unknown, riskPenaltyOverride?: unknown): Partial<VentureScorecard> {
  const source = record(value);
  return {
    painUrgency: integer(source.painUrgency),
    willingnessToPay: integer(source.willingnessToPay),
    reachability: integer(source.reachability),
    proofSpeed: integer(source.proofSpeed),
    deliveryFeasibility: integer(source.deliveryFeasibility),
    grossMargin: integer(source.grossMargin),
    recurringPotential: integer(source.recurringPotential),
    differentiation: integer(source.differentiation),
    founderFit: integer(source.founderFit),
    evidenceQuality: integer(source.evidenceQuality),
    riskPenalty: integer(riskPenaltyOverride ?? source.riskPenalty),
  };
}

function toEvidence(value: unknown): Partial<VentureEvidence> {
  const source = record(value);
  return {
    painSignals: integer(source.painSignals),
    priceSignals: integer(source.priceSignals),
    reachableProspects: integer(source.reachableProspects),
    technicalProbePassed: boolean(source.technicalProbePassed),
    acquisitionPathDocumented: boolean(source.acquisitionPathDocumented),
    riskReviewCompleted: boolean(source.riskReviewCompleted),
  };
}

/**
 * Shape runs two independent passes. The first creates a research packet; the
 * second attacks it. A deterministic function, not either model, sets the
 * commercial score and production-build permission.
 */
export async function shape(id: string, agentId = 'free-claude-code'): Promise<PipelineItem> {
  const item = get(id);
  if (!item) throw new Error('item not found');

  const researchPrompt = `You are the Market Intelligence Lead in a governed software factory.
Classify and shape the input. Treat any proposed product, service, automation, channel, or revenue path as type "venture".
Do not invent evidence. A count is zero unless the input itself supplies traceable evidence.
Respond with ONLY one JSON object using this schema:
{
  "title": "clear working title",
  "type": "venture|task|reference",
  "tags": ["up to six tags"],
  "plan": "the smallest next experiment in 3-6 steps",
  "thesis": "customer + painful job + proposed offer + acquisition route",
  "scorecard": {
    "painUrgency": 0-15,
    "willingnessToPay": 0-15,
    "reachability": 0-12,
    "proofSpeed": 0-10,
    "deliveryFeasibility": 0-10,
    "grossMargin": 0-10,
    "recurringPotential": 0-8,
    "differentiation": 0-8,
    "founderFit": 0-7,
    "evidenceQuality": 0-5,
    "riskPenalty": 0-20
  },
  "evidence": {
    "painSignals": 0,
    "priceSignals": 0,
    "reachableProspects": 0,
    "technicalProbePassed": false,
    "acquisitionPathDocumented": false,
    "riskReviewCompleted": false
  }
}

INPUT:
${item.raw}`;

  const researchResult = await fcc.runAgent(
    agentId,
    [{ role: 'user', content: researchPrompt }],
    resolveAgentIdentity(agentId)
  );
  const researched = parseJson(researchResult.text) ?? {};
  const itemType = text(researched.type, 'task').toLowerCase();

  if (itemType !== 'venture') {
    return update(id, {
      title: text(researched.title, item.title),
      item_type: itemType,
      tags: JSON.stringify(Array.isArray(researched.tags) ? researched.tags.slice(0, 6).map(String) : []),
      score: Math.max(0, Math.min(100, integer(researched.score, 50))),
      plan: text(researched.plan, 'Define acceptance criteria, execute the task, and verify the result.'),
      stage: 'gate',
    });
  }

  const redTeamPrompt = `You are the independent Red Team. Attack the commercial thesis below.
Default to skepticism. Identify false assumptions, distribution risk, implementation risk, privacy/legal/security risk, and reasons customers may not pay.
Do not rewrite the thesis and do not inflate evidence.
Respond with ONLY one JSON object:
{"riskPenalty": 0-20, "verdict": "one sentence", "redTeam": "specific failure modes", "nextExperiment": "cheapest decisive test"}

ORIGINAL INPUT:
${item.raw}

RESEARCH PACKET:
${researchResult.text}`;

  const redTeamResult = await fcc.runAgent(
    'reality-checker',
    [{ role: 'user', content: redTeamPrompt }],
    resolveAgentIdentity('reality-checker')
  );
  const redTeam = parseJson(redTeamResult.text) ?? {};
  const assessment = assessVenture(
    toScorecard(researched.scorecard, redTeam.riskPenalty),
    toEvidence(researched.evidence)
  );

  const basePlan = text(researched.plan, 'Run the cheapest decisive validation experiment.');
  const shapedPlan = [
    formatAssessment(assessment),
    '',
    `THESIS: ${text(researched.thesis, item.raw.slice(0, 500))}`,
    '',
    `RED TEAM: ${text(redTeam.redTeam, 'No structured red-team output was returned.')}`,
    `RED-TEAM VERDICT: ${text(redTeam.verdict, 'Unproven.')}`,
    '',
    `NEXT EXPERIMENT: ${text(redTeam.nextExperiment, basePlan)}`,
    '',
    'EXECUTION PLAN:',
    basePlan,
    '',
    assessment.canBuild
      ? 'MODE: Production implementation may begin, but shipping still requires tests and independent review.'
      : 'MODE: Validation only. Do not build a production product until every evidence gap is closed.',
  ].join('\n');

  const tags = [
    ...(Array.isArray(researched.tags) ? researched.tags.slice(0, 4).map(String) : []),
    'venture',
    assessment.decision.toLowerCase().replace('_', '-'),
  ];

  return update(id, {
    title: text(researched.title, item.title),
    item_type: 'venture',
    tags: JSON.stringify([...new Set(tags)].slice(0, 6)),
    score: assessment.score,
    plan: shapedPlan,
    stage: 'gate',
  });
}

/** Owner gate. Killed ventures cannot be pushed into execution by accident. */
export function approve(id: string): PipelineItem {
  const item = get(id);
  if (!item) throw new Error('item not found');
  if (item.item_type === 'venture' && item.plan.includes('DECISION: KILL')) {
    throw new Error('This venture failed the commercial gate. Revise the evidence or archive it.');
  }
  return update(id, { stage: 'execute' });
}

function runVerificationTask(
  cwd: string,
  task: SandboxTask
): { passed: boolean; output: string } {
  const result = runSandboxTask(cwd, task, 180_000);
  return { passed: result.passed, output: formatSandboxResult(result) };
}

function verifyProject(projectId: string, productionBuild: boolean): VerificationResult {
  const project = workspace.getProject(projectId);
  if (!project) return { passed: false, summary: 'Workspace project was not found.', commands: [] };

  const files = workspace.listFiles(projectId);
  if (files.length === 0) {
    return { passed: false, summary: 'No files were produced.', commands: [] };
  }

  const commands: { command: string; passed: boolean; output: string }[] = [];
  const packagePath = path.join(project.path, 'package.json');
  const lockPath = path.join(project.path, 'package-lock.json');
  const pyprojectPath = path.join(project.path, 'pyproject.toml');
  let deterministicVerificationTasks = 0;

  if (fs.existsSync(packagePath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      const dependencyCount = [
        pkg.dependencies,
        pkg.devDependencies,
        pkg.optionalDependencies,
        pkg.peerDependencies,
      ].reduce((sum, section) => sum + Object.keys(section ?? {}).length, 0);

      const nodeTasks: { task: SandboxTask; command: string }[] = [];
      if (pkg.scripts?.typecheck) {
        nodeTasks.push({ task: 'node-typecheck', command: 'sandbox: npm run typecheck' });
      }
      if (pkg.scripts?.lint) {
        nodeTasks.push({ task: 'node-lint', command: 'sandbox: npm run lint' });
      }
      if (pkg.scripts?.test && !/no test specified/i.test(pkg.scripts.test)) {
        nodeTasks.push({ task: 'node-test', command: 'sandbox: npm test' });
      }
      if (pkg.scripts?.build) {
        nodeTasks.push({ task: 'node-build', command: 'sandbox: npm run build' });
      }

      let dependenciesReady = true;
      if (dependencyCount > 0 && nodeTasks.length > 0 && !fs.existsSync(lockPath)) {
        const lockResult = runVerificationTask(project.path, 'node-lock');
        commands.push({ command: 'sandbox: resolve validated package-lock.json', ...lockResult });
        dependenciesReady = lockResult.passed;
      }

      if (dependenciesReady) {
        for (const nodeTask of nodeTasks) {
          const result = runVerificationTask(project.path, nodeTask.task);
          commands.push({ command: nodeTask.command, ...result });
          deterministicVerificationTasks++;
        }
      }
    } catch (error) {
      commands.push({
        command: 'parse package.json',
        passed: false,
        output: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (fs.existsSync(pyprojectPath)) {
    const hasTests = fs.existsSync(path.join(project.path, 'tests'));
    if (hasTests) {
      const result = runVerificationTask(project.path, 'python-test');
      commands.push({ command: 'sandbox: python -m pytest -q', ...result });
      deterministicVerificationTasks++;
    }
  }

  if (productionBuild && deterministicVerificationTasks === 0) {
    commands.push({
      command: 'automated verification availability',
      passed: false,
      output: 'Production mode requires at least one deterministic sandboxed test or build task.',
    });
  }

  const passed = commands.every((command) => command.passed);
  const summary = [
    `${files.length} workspace file(s) present.`,
    commands.length
      ? `${commands.filter((command) => command.passed).length}/${commands.length} controlled sandbox command(s) passed.`
      : 'Validation artifact mode: file evidence present; independent review still required.',
  ].join(' ');

  return { passed, summary, commands };
}

function verificationText(result: VerificationResult): string {
  const commandText = result.commands.length
    ? result.commands
        .map(
          (command) =>
            `### ${command.passed ? 'PASS' : 'FAIL'} — ${command.command}\n${command.output}`
        )
        .join('\n\n')
    : 'No executable verification task was required for this validation-only artifact.';

  return `${result.passed ? 'PASS' : 'FAIL'}: ${result.summary}\n\n${commandText}`;
}

/**
 * Execute in an isolated workspace. Validation-only ventures produce evidence
 * assets, not a speculative production product. Shipping requires sandboxed
 * deterministic verification plus a separate Reality Checker verdict.
 */
export async function execute(id: string, agentId = 'free-claude-code'): Promise<PipelineItem> {
  const item = get(id);
  if (!item) throw new Error('item not found');

  let projectId = item.project_id || '';
  if (!projectId) {
    const project = workspace.createProject(item.title || item.raw.slice(0, 40) || 'pipeline-item');
    projectId = project.id;
  }

  const productionBuild = item.plan.includes('PRODUCTION BUILD ALLOWED: YES');
  const modeInstruction = productionBuild
    ? 'Build the smallest production implementation that satisfies the acceptance criteria. Include deterministic tests and a build command.'
    : 'This is validation mode. Do NOT build a speculative production product. Produce the decisive experiment, evidence log, prospect/price test assets, acceptance criteria, and a clear go/no-go result. Use synthetic data only.';

  const goal = `Execute this governed pipeline item in the workspace.

MODE:
${modeInstruction}

NON-NEGOTIABLE RULES:
- Create real files, including README.md with scope, assumptions, acceptance criteria, and exact verification steps.
- Never claim customer evidence that was not actually observed.
- Never contact a customer, spend money, deploy publicly, change production, or send communications.
- Keep secrets and personal data out of generated files.
- Run available fixed sandbox tasks before declaring done.
- For a Node project with dependencies, run node-lock before test/build verification.

TITLE: ${item.title}

GATED PLAN:
${item.plan || '(no plan supplied)'}

ORIGINAL INPUT:
${item.raw}`;

  const agentRun = await runAgentic(
    agentId,
    [{ role: 'user', content: goal }],
    projectId,
    resolveAgentIdentity(agentId),
    16
  );

  const built = agentRun.steps
    .filter((step) => step.tool === 'write_file')
    .map((step) => (step.args as { path?: string }).path)
    .filter((value): value is string => Boolean(value));

  const verification = verifyProject(projectId, productionBuild);
  const verificationReport = verificationText(verification);

  let review = 'NEEDS WORK\nIndependent review did not run.';
  try {
    const reviewPrompt = `You are the final independent QA and Reality Checker.
Review only the recorded evidence below. Do not approve intentions or prose.
First line must be exactly APPROVED or NEEDS WORK.
Approve only when the deliverable matches the gated mode, files exist, deterministic verification passed, no fabricated evidence is claimed, and the result is safe for its stated scope.
Then list the concrete reasons and any remaining gaps.

TITLE:
${item.title}

MODE:
${productionBuild ? 'PRODUCTION BUILD' : 'VALIDATION EXPERIMENT'}

PLAN:
${item.plan}

AGENT SUMMARY:
${agentRun.reply}

FILES WRITTEN:
${built.join(', ') || '(none recorded by tool loop)'}

VERIFICATION:
${verificationReport}`;
    const reviewResult = await fcc.runAgent(
      'reality-checker',
      [{ role: 'user', content: reviewPrompt }],
      resolveAgentIdentity('reality-checker')
    );
    review = reviewResult.text.trim();
  } catch (error) {
    review = `NEEDS WORK\nReality Checker failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  const approved = verification.passed && /^APPROVED\b/i.test(review);
  const deliverable = [
    approved ? 'SHIP GATE: PASSED' : 'SHIP GATE: BLOCKED',
    '',
    '## Agent result',
    agentRun.reply || '(no final reply)',
    '',
    '## Files',
    built.length ? built.map((file) => `- ${file}`).join('\n') : '- No write_file actions recorded.',
    '',
    '## Deterministic verification',
    verificationReport,
    '',
    '## Independent review',
    review,
  ].join('\n');

  return update(id, {
    stage: approved ? 'shipped' : 'execute',
    deliverable,
    project_id: projectId,
  });
}
