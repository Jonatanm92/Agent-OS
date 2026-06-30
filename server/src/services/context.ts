import * as fcc from './fcc.js';
import { resolveAgentIdentity } from './agents.js';
import { getDb } from '../db/index.js';

/**
 * Context management (Primitive #3).
 *
 * Summarizes long conversations so the agent doesn't choke on context limits.
 * When a conversation exceeds a token-estimate threshold, older messages are
 * compressed into a summary that replaces them — preserving meaning while
 * freeing context space.
 */

const CHARS_PER_TOKEN = 4; // rough estimate
const MAX_CONTEXT_TOKENS = 12000; // compress when history exceeds this
const KEEP_RECENT = 4; // always keep the last N messages uncompressed

export interface CompressResult {
  compressed: boolean;
  summary?: string;
  removedCount?: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Check if a conversation needs compression, and if so, summarize old messages
 * and replace them with a single summary message.
 */
export async function compressIfNeeded(conversationId: string, agentId = 'free-claude-code'): Promise<CompressResult> {
  const db = getDb();
  const messages = db
    .prepare('SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(conversationId) as { id: string; role: string; content: string; created_at: string }[];

  if (messages.length <= KEEP_RECENT + 2) {
    return { compressed: false };
  }

  const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  if (totalTokens <= MAX_CONTEXT_TOKENS) {
    return { compressed: false };
  }

  // Split: old messages to compress, recent messages to keep.
  const toCompress = messages.slice(0, messages.length - KEEP_RECENT);
  const transcript = toCompress
    .map((m) => `${m.role}: ${m.content.slice(0, 500)}`)
    .join('\n');

  const prompt =
    'Summarize this conversation so far into a concise paragraph (max 200 words). ' +
    'Preserve key decisions, facts, code context, and the current goal. ' +
    'Output ONLY the summary, no preamble.\n\nCONVERSATION:\n' + transcript;

  const result = await fcc.runAgent(
    agentId,
    [{ role: 'user', content: prompt }],
    resolveAgentIdentity(agentId)
  );

  // Delete old messages and insert the summary as a system-style message.
  const deleteIds = toCompress.map((m) => m.id);
  const deletePlaceholders = deleteIds.map(() => '?').join(',');
  db.prepare(`DELETE FROM messages WHERE id IN (${deletePlaceholders})`).run(...deleteIds);

  const { randomUUID } = await import('crypto');
  const summaryContent = `[CONTEXT SUMMARY — ${deleteIds.length} messages compressed]\n\n${result.text}`;
  db.prepare(
    'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(
    randomUUID(),
    conversationId,
    'system',
    summaryContent,
    toCompress[0].created_at // place it at the start
  );

  return { compressed: true, summary: result.text, removedCount: deleteIds.length };
}

/**
 * Auto-compress hook: call after each assistant reply in long conversations.
 */
export async function autoCompress(conversationId: string, agentId: string): Promise<void> {
  try {
    await compressIfNeeded(conversationId, agentId);
  } catch {
    // Non-critical — don't break the chat if compression fails.
  }
}
