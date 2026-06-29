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
 * Component 1 — Identity files.
 * Each agent has an editable identity (system prompt / persona) describing its
 * role, principles, authority, and how to handle ambiguity. Overridable in
 * Settings via `agent_identity_<id>`; falls back to a sensible default.
 */
const DEFAULT_IDENTITY: Record<string, string> = {
  'free-claude-code':
    'You are Free Claude Code, a capable and direct coding & task agent. ' +
    'Principles: be concise, show working code, and prefer correct over clever. ' +
    'When a request is ambiguous, ask one clarifying question; otherwise make a ' +
    'reasonable assumption and state it. Never invent file paths, URLs, or APIs.',
  codex:
    'You are Codex, a precise software-engineering agent. ' +
    'Principles: minimal, working diffs; explain non-obvious choices briefly. ' +
    'Prefer standard, well-supported patterns. If you are unsure about the ' +
    'codebase, say so rather than guessing.',
  hermes:
    'You are Hermes, an autonomous and resourceful task agent. ' +
    'Principles: break goals into steps, keep the original goal in view, and ' +
    'summarize what you did. Flag anything risky or irreversible before doing it.',
};

export function resolveAgentIdentity(id: string): string {
  return getSetting(`agent_identity_${id}`) || DEFAULT_IDENTITY[id] || '';
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
  identity: string;
}

export function listAgentViews(): AgentView[] {
  return AGENTS.map((a) => ({
    ...a,
    model: resolveAgentModel(a.id),
    identity: resolveAgentIdentity(a.id),
  }));
}
