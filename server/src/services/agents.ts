import { getSetting, resolveConfig } from '../config.js';

/**
 * Agent registry.
 *
 * An "agent" is a named profile with a backend:
 *
 *   backend "fcc" — runs through the Free Claude Code proxy over HTTP.
 *       transport "messages"  -> POST /v1/messages   (Anthropic Messages API)
 *       transport "responses" -> POST /v1/responses  (OpenAI Responses API, Codex)
 *
 *   backend "cli" — a separate local runtime driven as a subprocess
 *       (Hermes Agent: `hermes chat -q ... -Q --yolo`).
 *
 * Every agent shares ONE memory: the Obsidian vault. The dashboard injects the
 * same vault context into each agent (system prompt for FCC agents, folded into
 * the prompt for CLI agents), so they all read the same persistent memory.
 *
 * Per-agent model override lives in Settings under `agent_model_<id>`.
 */

export type Transport = 'messages' | 'responses';
export type Backend = 'fcc' | 'cli';

export interface AgentDef {
  id: string;
  label: string;
  backend: Backend;
  transport: Transport; // only meaningful for backend "fcc"
  /** Default model slug (fcc agents fall back to the global MODEL setting). */
  defaultModel: string;
  blurb: string;
}

export const AGENTS: AgentDef[] = [
  {
    id: 'free-claude-code',
    label: 'Free Claude Code',
    backend: 'fcc',
    transport: 'messages',
    defaultModel: '', // uses the global model setting (claude tier name)
    blurb: 'Claude Code harness via FCC. Anthropic Messages protocol.',
  },
  {
    id: 'codex',
    label: 'Codex',
    backend: 'fcc',
    transport: 'responses',
    defaultModel: 'gpt-5.3-codex',
    blurb: "OpenAI Codex harness via FCC's Responses endpoint.",
  },
  {
    id: 'hermes',
    label: 'Hermes',
    backend: 'cli',
    transport: 'messages',
    defaultModel: '', // empty => use whatever `hermes setup`/`hermes model` configured
    blurb: 'Nous Research Hermes Agent (free, open-source) driven as a local CLI.',
  },
];

export function getAgent(id: string): AgentDef {
  return AGENTS.find((a) => a.id === id) ?? AGENTS[0];
}

/**
 * Resolve the effective model for an agent.
 * - fcc agents: per-agent override -> agent default -> global model setting.
 * - cli agents: per-agent override only (empty means "use the CLI's own config").
 */
export function resolveAgentModel(id: string): string {
  const agent = getAgent(id);
  const override = getSetting(`agent_model_${id}`);
  if (override) return override;
  if (agent.backend === 'cli') return '';
  if (agent.defaultModel) return agent.defaultModel;
  return resolveConfig().model;
}

export interface AgentView extends AgentDef {
  model: string; // resolved model, or '' for cli agents using their own config
}

export function listAgentViews(): AgentView[] {
  return AGENTS.map((a) => ({ ...a, model: resolveAgentModel(a.id) }));
}
