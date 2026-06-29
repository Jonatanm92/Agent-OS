import { useEffect, useRef, useState } from 'react';
import { api, type Agent, type Conversation, type FccStatus, type Message } from '../api';

export function ChatTab({
  status,
  activeAgent,
  onAgentFromConversation,
}: {
  status: FccStatus | null;
  activeAgent?: Agent;
  onAgentFromConversation: (agentId: string) => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [useMemory, setUseMemory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const agentId = activeAgent?.id ?? 'free-claude-code';
  const agentLabel = activeAgent?.label ?? 'Free Claude Code';

  const loadConversations = async () => {
    const { conversations } = await api.listConversations();
    setConversations(conversations);
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const openConversation = async (id: string) => {
    setActiveId(id);
    const { conversation, messages } = await api.getConversation(id);
    setMessages(messages);
    if (conversation.agent_id) onAgentFromConversation(conversation.agent_id);
  };

  const newChat = () => {
    setActiveId(undefined);
    setMessages([]);
    setError(null);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setBusy(true);
    setInput('');
    setMessages((m) => [
      ...m,
      { id: 'tmp-u', conversation_id: '', role: 'user', content: text, created_at: '' },
    ]);
    try {
      const res = await api.chat(text, agentId, activeId, useMemory);
      setActiveId(res.conversationId);
      const { messages } = await api.getConversation(res.conversationId);
      setMessages(messages);
      await loadConversations();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      setMessages((m) => m.filter((x) => x.id !== 'tmp-u'));
    } finally {
      setBusy(false);
    }
  };

  const agentOf = (id: string) =>
    conversations.find((c) => c.id === id)?.agent_id ?? agentId;

  return (
    <div className="chat">
      <div className="chat-history">
        <button className="primary-btn full" onClick={newChat}>
          + New chat with {agentLabel}
        </button>
        <div className="history-list">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`history-item ${c.id === activeId ? 'active' : ''}`}
              onClick={() => openConversation(c.id)}
            >
              <span className="history-title">{c.title || 'Untitled'}</span>
              <span className="history-agent">{shortAgent(c.agent_id)}</span>
              <button
                className="del"
                title="Delete"
                onClick={async (e) => {
                  e.stopPropagation();
                  await api.deleteConversation(c.id);
                  if (c.id === activeId) newChat();
                  loadConversations();
                }}
              >
                ×
              </button>
            </div>
          ))}
          {conversations.length === 0 && <p className="muted small">No conversations yet.</p>}
        </div>
      </div>

      <div className="chat-main">
        {!status?.ok && (
          <div className="banner warn">
            Free Claude Code is offline ({status?.error || 'not reachable'}). Start it with{' '}
            <code>fcc-server</code> and check the base URL in Settings.
          </div>
        )}
        {activeAgent?.available === false && (
          <div className="banner warn">
            {agentLabel} isn't installed yet. Install it with{' '}
            <code>curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash</code>, then{' '}
            <code>hermes setup --portal</code>.
          </div>
        )}

        <div className="messages" ref={scrollRef}>
          {messages.length === 0 && !busy && (
            <div className="empty">
              <div className="agent-badge">{agentLabel}</div>
              <h2>Same engine. Free fuel.</h2>
              <p className="muted">
                Talking to <strong>{agentLabel}</strong>
                {activeAgent?.model && <> (model: <code>{activeAgent.model}</code>)</>}. Replies route
                through your {activeAgent?.backend === 'cli' ? 'local Hermes runtime' : 'FCC proxy'}.
              </p>
              <p className="muted small">
                ◇ All agents share one memory — your Obsidian vault{' '}
                {useMemory ? 'is loaded into this chat.' : '(toggle memory on to load it).'}
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={m.id || i} className={`msg ${m.role}`}>
              <div className="msg-role">
                {m.role === 'user' ? 'You' : activeId ? shortAgent(agentOf(activeId)) : agentLabel}
              </div>
              <div className="msg-body">{m.content}</div>
            </div>
          ))}
          {busy && (
            <div className="msg assistant">
              <div className="msg-role">{agentLabel}</div>
              <div className="msg-body thinking">…thinking</div>
            </div>
          )}
        </div>

        {error && <div className="banner error">{error}</div>}

        <div className="composer">
          <label className="memory-toggle" title="Inject Obsidian vault as context">
            <input
              type="checkbox"
              checked={useMemory}
              onChange={(e) => setUseMemory(e.target.checked)}
            />
            memory
          </label>
          <textarea
            value={input}
            placeholder={`Message ${agentLabel}…  (Enter to send, Shift+Enter for newline)`}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
          />
          <button className="primary-btn" onClick={send} disabled={busy || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function shortAgent(id: string): string {
  if (id === 'free-claude-code') return 'FCC';
  if (id === 'codex') return 'Codex';
  if (id === 'hermes') return 'Hermes';
  return id;
}
