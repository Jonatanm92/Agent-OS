import { resolveConfig } from '../config.js';
import { getAgent, resolveAgentModel } from './agents.js';
import * as hermes from './hermes.js';

/**
 * Client for the Free Claude Code (FCC) proxy.
 *
 * FCC exposes two inbound protocols that both fan out to the providers you
 * configure (e.g. OpenRouter free model):
 *   - Anthropic Messages  : POST /v1/messages   (Claude Code, Hermes models)
 *   - OpenAI Responses     : POST /v1/responses  (Codex)
 * Model catalog: GET /v1/models. Auth is an Anthropic-style bearer token
 * (ANTHROPIC_AUTH_TOKEN in the FCC Admin UI, default "freecc").
 *
 * We never call a model provider directly — FCC owns provider routing.
 */

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const ANTHROPIC_VERSION = '2023-06-01';

function authHeaders(token: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'anthropic-version': ANTHROPIC_VERSION,
    'x-api-key': token,
    authorization: `Bearer ${token}`,
  };
}

export interface FccStatus {
  ok: boolean;
  baseUrl: string;
  model: string;
  models?: string[];
  error?: string;
}

/** Check whether FCC is reachable and list available model ids. */
export async function getStatus(): Promise<FccStatus> {
  const cfg = resolveConfig();
  try {
    const res = await fetch(`${cfg.fccBaseUrl}/v1/models`, {
      headers: authHeaders(cfg.fccAuthToken),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      return { ok: false, baseUrl: cfg.fccBaseUrl, model: cfg.model, error: `FCC returned HTTP ${res.status}` };
    }
    const body = (await res.json()) as { data?: { id: string }[] };
    return {
      ok: true,
      baseUrl: cfg.fccBaseUrl,
      model: cfg.model,
      models: (body.data ?? []).map((m) => m.id),
    };
  } catch (err) {
    return {
      ok: false,
      baseUrl: cfg.fccBaseUrl,
      model: cfg.model,
      error:
        err instanceof Error
          ? `Cannot reach FCC at ${cfg.fccBaseUrl} — is fcc-server running? (${err.message})`
          : 'Unknown error contacting FCC',
    };
  }
}

export interface ChatResult {
  text: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  model: string;
  agentId: string;
}

/** Pull a human-readable error out of FCC's various error shapes. */
function extractError(body: Record<string, unknown>, status: number): string | null {
  const err = body.error as { message?: string } | undefined;
  if (err?.message) return err.message;
  if (typeof body.detail === 'string') return body.detail;
  if (!body || Object.keys(body).length === 0) return `HTTP ${status}`;
  return null;
}

async function post(
  path: string,
  payload: unknown
): Promise<{ raw: string; status: number; contentType: string }> {
  const cfg = resolveConfig();
  let res: Response;
  try {
    res = await fetch(`${cfg.fccBaseUrl}${path}`, {
      method: 'POST',
      headers: authHeaders(cfg.fccAuthToken),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180000),
    });
  } catch (err) {
    throw new Error(
      `Cannot reach Free Claude Code at ${cfg.fccBaseUrl}. Start it with "fcc-server" and confirm the port. (${
        err instanceof Error ? err.message : String(err)
      })`
    );
  }
  const raw = await res.text();
  return { raw, status: res.status, contentType: res.headers.get('content-type') ?? '' };
}

/** FCC may answer either as one JSON body or as a Server-Sent Events stream. */
function isSSE(raw: string, contentType: string): boolean {
  return (
    contentType.includes('text/event-stream') ||
    /(^|\n)\s*event:/.test(raw) ||
    /(^|\n)data:/.test(raw)
  );
}

/** Yield the JSON payload string from each `data:` line of an SSE body. */
function sseDataLines(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^data:\s?(.*)$/);
    if (m && m[1] && m[1].trim() !== '[DONE]') out.push(m[1]);
  }
  return out;
}

function tryParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function statusOk(status: number): boolean {
  return status >= 200 && status < 300;
}

// ── Anthropic Messages transport (Claude Code, Hermes) ──────────────────────
interface AnthropicBlock { type: string; text?: string }

/** Parse an Anthropic Messages SSE stream into final text + usage. */
function parseMessagesStream(raw: string): { text: string; usage?: ChatResult['usage'] } {
  let text = '';
  let usage: ChatResult['usage'] | undefined;
  for (const data of sseDataLines(raw)) {
    const ev = tryParse(data);
    if (!ev) continue;
    const type = ev.type as string;
    if (type === 'content_block_delta') {
      const delta = ev.delta as { type?: string; text?: string } | undefined;
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') text += delta.text;
    } else if (type === 'content_block_start') {
      const block = ev.content_block as AnthropicBlock | undefined;
      if (block?.type === 'text' && typeof block.text === 'string') text += block.text;
    } else if (type === 'message_start') {
      const u = (ev.message as { usage?: { input_tokens?: number } } | undefined)?.usage;
      if (u) usage = { ...usage, input_tokens: u.input_tokens };
    } else if (type === 'message_delta') {
      const u = ev.usage as { output_tokens?: number } | undefined;
      if (u) usage = { ...usage, output_tokens: u.output_tokens };
    } else if (type === 'error') {
      const e = ev.error as { message?: string } | undefined;
      throw new Error(`Free Claude Code: ${e?.message || 'stream error'}`);
    }
  }
  return { text: text.trim(), usage };
}

async function callMessages(model: string, history: ChatTurn[], system?: string) {
  const payload: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    messages: history.map((t) => ({ role: t.role, content: t.content })),
  };
  if (system && system.trim()) payload.system = system;

  const { raw, status, contentType } = await post('/v1/messages', payload);

  if (isSSE(raw, contentType)) {
    const { text, usage } = parseMessagesStream(raw);
    if (!text && !statusOk(status)) throw new Error(`Free Claude Code: HTTP ${status}`);
    return { text, usage };
  }

  const body = tryParse(raw) ?? {};
  const errMsg = !statusOk(status) || body.error || body.detail ? extractError(body, status) : null;
  if (errMsg) throw new Error(`Free Claude Code: ${errMsg}`);

  const blocks = (body.content as AnthropicBlock[] | undefined) ?? [];
  const text = blocks
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return { text, usage: body.usage as ChatResult['usage'] };
}

// ── OpenAI Responses transport (Codex) ──────────────────────────────────────
interface ResponsesItem { type?: string; content?: { type?: string; text?: string }[] }

/** Parse an OpenAI Responses SSE stream into final text. */
function parseResponsesStream(raw: string): { text: string } {
  let text = '';
  let done = '';
  for (const data of sseDataLines(raw)) {
    const ev = tryParse(data);
    if (!ev) continue;
    const type = (ev.type as string) || '';
    if (type.endsWith('output_text.delta') && typeof ev.delta === 'string') {
      text += ev.delta;
    } else if (type.endsWith('output_text.done') && typeof ev.text === 'string') {
      done = ev.text;
    } else if (type === 'response.completed' || type === 'response.done') {
      const resp = ev.response as { output_text?: string; output?: ResponsesItem[] } | undefined;
      if (resp?.output_text) done = resp.output_text;
    } else if (type.includes('error')) {
      const e = (ev.error as { message?: string } | undefined)?.message || (ev.message as string);
      if (e) throw new Error(`Free Claude Code (Codex): ${e}`);
    }
  }
  return { text: (text || done).trim() };
}

async function callResponses(model: string, history: ChatTurn[], system?: string) {
  const input = history.map((t) => ({
    role: t.role,
    content: [{ type: 'input_text', text: t.content }],
  }));
  const payload: Record<string, unknown> = { model, input };
  if (system && system.trim()) payload.instructions = system;

  const { raw, status, contentType } = await post('/v1/responses', payload);

  if (isSSE(raw, contentType)) {
    const { text } = parseResponsesStream(raw);
    if (!text && !statusOk(status)) throw new Error(`Free Claude Code (Codex): HTTP ${status}`);
    return { text, usage: undefined as ChatResult['usage'] };
  }

  const body = tryParse(raw) ?? {};
  const errMsg = !statusOk(status) || body.error ? extractError(body, status) : null;
  if (errMsg) throw new Error(`Free Claude Code (Codex): ${errMsg}`);

  let text = typeof body.output_text === 'string' ? (body.output_text as string) : '';
  if (!text) {
    const out = (body.output as ResponsesItem[] | undefined) ?? [];
    text = out
      .flatMap((item) => item.content ?? [])
      .filter((c) => typeof c.text === 'string')
      .map((c) => c.text)
      .join('\n');
  }
  return { text: text.trim(), usage: body.usage as ChatResult['usage'] };
}

/** Run a turn for the given agent, dispatching to the right backend/transport. */
export async function runAgent(
  agentId: string,
  history: ChatTurn[],
  system?: string
): Promise<ChatResult> {
  const agent = getAgent(agentId);

  // CLI-backed agents (Hermes) run as a local subprocess, sharing the same
  // injected memory as the FCC agents.
  if (agent.backend === 'cli') {
    const { text } = await hermes.run(history, system);
    return { text: text || '(empty response)', model: resolveAgentModel(agentId) || 'hermes-config', agentId };
  }

  const model = resolveAgentModel(agentId);
  const { text, usage } =
    agent.transport === 'responses'
      ? await callResponses(model, history, system)
      : await callMessages(model, history, system);
  return { text: text || '(empty response)', usage, model, agentId };
}
