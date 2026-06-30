import * as fcc from './fcc.js';
import { getAgent, resolveAgentIdentity } from './agents.js';
import * as studio from './studio.js';

/**
 * Auto-chaining Orchestrator.
 *
 * Given a goal, it:
 *   1. Asks the Orchestrator agent to produce a numbered plan (which agents, in what order).
 *   2. Executes each step by calling the named agent, feeding the previous deliverable as context.
 *   3. Ends with the Reality Checker (always last).
 *   4. Returns the full chain of deliverables.
 *
 * This is the "real unlock" — you give it the whole goal, it runs the squad.
 */

export interface ChainStep {
  step: number;
  agentId: string;
  agentLabel: string;
  brief: string;
  deliverable: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

export interface ChainResult {
  goal: string;
  steps: ChainStep[];
  finalVerdict: string;
}

const PLAN_PROMPT = `You are the Orchestrator. Given the user's goal below, produce an execution plan as a JSON array.
Each entry: {"agent": "<agent-id>", "brief": "<what to tell that agent>"}
Available agent IDs: rapid-prototyper, backend-architect, ai-engineer, whimsy-injector, growth-hacker, content-creator, dsp-engineer, plugin-architect, free-claude-code, codex
Rules:
- Pick only the agents relevant to THIS goal (usually 3-5, not all).
- Order matters: each agent gets the previous one's output as context.
- ALWAYS end with reality-checker as the final step.
- Output ONLY the JSON array, no markdown fences, no explanation.

USER'S GOAL:
`;

function parseSteps(text: string): { agent: string; brief: string }[] {
  const t = text.replace(/```json?/gi, '').replace(/```/g, '').trim();
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start === -1 || end === -1) return [];
  try {
    const arr = JSON.parse(t.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s: any) => typeof s.agent === 'string' && typeof s.brief === 'string')
      .map((s: any) => ({ agent: String(s.agent), brief: String(s.brief) }));
  } catch {
    return [];
  }
}

export async function runChain(goal: string): Promise<ChainResult> {
  // Step 0: get the plan from the orchestrator.
  const planResult = await fcc.runAgent(
    'orchestrator',
    [{ role: 'user', content: PLAN_PROMPT + goal }],
    resolveAgentIdentity('orchestrator')
  );

  let planned = parseSteps(planResult.text);
  if (planned.length === 0) {
    // Fallback: a sensible default chain.
    planned = [
      { agent: 'rapid-prototyper', brief: goal },
      { agent: 'reality-checker', brief: 'Audit the above for production readiness.' },
    ];
  }

  // Ensure reality-checker is last.
  if (planned[planned.length - 1]?.agent !== 'reality-checker') {
    planned.push({ agent: 'reality-checker', brief: 'Audit the full deliverable for production readiness. Default: NEEDS WORK.' });
  }

  const steps: ChainStep[] = planned.map((p, i) => ({
    step: i + 1,
    agentId: getAgent(p.agent).id,
    agentLabel: getAgent(p.agent).label,
    brief: p.brief,
    deliverable: '',
    status: 'pending',
  }));

  let previousDeliverable = '';

  for (const step of steps) {
    step.status = 'running';
    const context = previousDeliverable
      ? `CONTEXT FROM PREVIOUS AGENT:\n${previousDeliverable.slice(0, 6000)}\n\nYOUR TASK:\n${step.brief}`
      : step.brief;

    try {
      const result = await fcc.runAgent(
        step.agentId,
        [{ role: 'user', content: context }],
        resolveAgentIdentity(step.agentId)
      );
      step.deliverable = result.text;
      step.status = 'done';
      previousDeliverable = result.text;

      // Audit each step.
      studio.audit('orchestrator', {
        agent: step.agentId,
        title: `Step ${step.step}: ${step.agentLabel}`,
        detail: step.deliverable.slice(0, 400),
      });
    } catch (e) {
      step.deliverable = e instanceof Error ? e.message : 'failed';
      step.status = 'error';
      break; // stop the chain on error
    }
  }

  const last = steps[steps.length - 1];
  const finalVerdict = last?.agentId === 'reality-checker' && last.status === 'done'
    ? last.deliverable
    : '(chain did not complete to Reality Checker)';

  return { goal, steps, finalVerdict };
}
