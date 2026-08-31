import { useEffect, useRef, useState } from 'react';
import { api, type Agent, type Conversation, type FccStatus, type Message } from '../api';

interface ChainView {
  steps: { step: number; agentLabel: string; deliverable: string; status: string }[];
  finalVerdict: string;
}

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
  const [agentMode, setAgentMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastModel, setLastModel] = useState<string | null>(null);
  const [savingMem, setSavingMem] = useState(false);
  const [memMsg, setMemMsg] = useState<string | null>(null);
  const [fileMsg, setFileMsg] = useState<Record<string, string>>({});
  const [chain, setChain] = useState<ChainView | null>(null);
  const [chainRunning, setChainRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const agentId = activeAgent?.id ?? 'ceo';
  const agentLabel = activeAgent?.label ?? 'CEO / Orchestrator';

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
    setChain(null);
    const { conversation, messages } = await api.getConversation(id);
    setMessages(messages);
    if (conversation.agent_id) onAgentFromConversation(conversation.agent_id);
  };

  const newChat = () => {
    setActiveId(undefined);
    setMessages([]);
    setChain(null);
    setError(null);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setBusy(true);
    setInput('');
    setMessages((current) => [
      ...current,
      { id: 'tmp-u', conversation_id: '', role: 'user', content: text, created_at: '' },
    ]);

    // The CEO endpoint runs the governed multi-employee chain and always ends at QA & Security.
    if (agentId === 'ceo') {
      setChainRunning(true);
      try {
        const result = await api.runSquad(text);
        setChain({ steps: result.steps, finalVerdict: result.finalVerdict });
        const summary = [
          ...result.steps.map(
            (step) => `**Step ${step.step} — ${step.agentLabel} [${step.status.toUpperCase()}]:**\n${step.deliverable}`
          ),
          `**Final internal verdict:**\n${result.finalVerdict}`,
        ].join('\n\n---\n\n');
        setMessages((current) => [
          ...current.filter((message) => message.id !== 'tmp-u'),
          { id: 'chain-u', conversation_id: '', role: 'user', content: text, created_at: '' },
          { id: 'chain-a', conversation_id: '', role: 'assistant', content: summary, created_at: '' },
        ]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Company chain failed');
        setMessages((current) => current.filter((message) => message.id !== 'tmp-u'));
      } finally {
        setChainRunning(false);
        setBusy(false);
      }
      return;
    }

    try {
      const response = await api.chat(text, agentId, activeId, useMemory, agentMode);
      setActiveId(response.conversationId);
      if (response.model) setLastModel(response.model);
      const loaded = await api.getConversation(response.conversationId);
      setMessages(loaded.messages);
      await loadConversations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request failed');
      setMessages((current) => current.filter((message) => message.id !== 'tmp-u'));
    } finally {
      setBusy(false);
    }
  };

  const agentOf = (id: string) =>
    conversations.find((conversation) => conversation.id === id)?.agent_id ?? agentId;

  const saveToMemory = async () => {
    if (!activeId || savingMem) return;
    setSavingMem(true);
    setMemMsg(null);
    try {
      const { note } = await api.summarizeMemory(activeId);
      setMemMsg(`Saved to ${note.path}. Future agents receive it as untrusted background context.`);
    } catch (cause) {
      setMemMsg(cause instanceof Error ? cause.message : 'Could not save');
    } finally {
      setSavingMem(false);
    }
  };

  const rate = async (id: string, value: number) => {
    if (!id || id.startsWith('tmp') || id.startsWith('chain')) return;
    const current = messages.find((message) => message.id === id)?.rating ?? 0;
    const next = current === value ? 0 : value;
    setMessages((items) =>
      items.map((message) => (message.id === id ? { ...message, rating: next } : message))
    );
    try {
      await api.rateMessage(id, next);
    } catch {
      // Rating is advisory and does not alter protected prompts or permissions.
    }
  };

  const saveFiles = async (message: Message) => {
    setFileMsg((state) => ({ ...state, [message.id]: 'Saving…' }));
    try {
      const result = await api.extractFiles(message.content);
      setFileMsg((state) => ({
        ...state,
        [message.id]: result.written.length
          ? `Saved ${result.written.length} file(s) to the active workspace${result.skipped ? `; skipped ${result.skipped}` : ''}.`
          : 'No safely named files were found in this message.',
      }));
    } catch (cause) {
      setFileMsg((state) => ({
        ...state,
        [message.id]: cause instanceof Error ? cause.message : 'File extraction failed',
      }));
    }
  };

  const runtimeUnavailable = activeAgent?.available === false;

  return (
    <div className="chat">
      <div className="chat-history">
        <button className="primary-btn full" onClick={newChat}>
          + New channel with {agentLabel}
        </button>
        <div className="history-list">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`history-item ${conversation.id === activeId ? 'active' : ''}`}
              onClick={() => openConversation(conversation.id)}
            >
              <span className="history-title">{conversation.title || 'Untitled'}</span>
              <span className="history-agent">{shortAgent(conversation.agent_id)}</span>
              <button
                className="del"
                title="Delete conversation"
                onClick={async (event) => {
                  event.stopPropagation();
                  await api.deleteConversation(conversation.id);
                  if (conversation.id === activeId) newChat();
                  loadConversations();
                }}
              >
                ×
              </button>
            </div>
          ))}
          {conversations.length === 0 && <p className="muted small">No saved conversations.</p>}
        </div>
      </div>

      <div className="chat-main">
        {!status?.ok && activeAgent?.backend !== 'cli' && (
          <div className="banner warn">
            The FCC gateway is offline ({status?.error || 'not reachable'}). Start the configured gateway and verify its base URL in Settings.
          </div>
        )}
        {runtimeUnavailable && (
          <div className="banner warn">
            {activeAgent?.backend === 'cli'
              ? 'The optional Hermes runtime is unavailable. Review the official Hermes setup before enabling it.'
              : 'The configured model gateway is unavailable. This employee cannot run until the gateway health check passes.'}
          </div>
        )}

        {(lastModel || status?.routedModel) && (
          <div className="model-chip" title="Model reported by the configured gateway">
            running on <code>{lastModel || status?.routedModel}</code>
          </div>
        )}

        {activeId && (
          <div className="chat-actions">
            <button className="ghost-btn small-btn" onClick={saveToMemory} disabled={savingMem}>
              {savingMem ? 'Distilling…' : 'Save conversation to memory'}
            </button>
            {memMsg && <span className="muted tiny mem-msg">{memMsg}</span>}
          </div>
        )}

        <div className="messages" ref={scrollRef}>
          {messages.length === 0 && !busy && (
            <div className="empty">
              <div className="agent-badge">{agentLabel}</div>
              <h2>Company command channel.</h2>
              <p className="muted">
                Talking to <strong>{agentLabel}</strong>. The role uses the{' '}
                {activeAgent?.backend === 'cli' ? 'optional local Hermes runtime' : 'configured FCC gateway'}{' '}
                and model{' '}
                <code>{lastModel || status?.routedModel || activeAgent?.model || 'configured by the owner'}</code>.
                {agentId === 'ceo' && (
                  <>
                    <br />
                    <strong>The CEO runs the governed company chain.</strong> It may delegate only to registered employees and always ends at the independent QA & Security gate.
                  </>
                )}
              </p>
              <p className="muted small">
                Shared memory is treated as fallible background data, never as permission to bypass the current mission or an owner gate.
              </p>
            </div>
          )}

          {messages.map((message, index) => (
            <div key={message.id || index} className={`msg ${message.role}`}>
              <div className="msg-role">
                {message.role === 'user'
                  ? 'Owner'
                  : activeId
                    ? shortAgent(agentOf(activeId))
                    : agentLabel}
              </div>
              <div className="msg-body">{message.content}</div>
              {message.role === 'assistant' &&
                message.id &&
                !message.id.startsWith('tmp') &&
                !message.id.startsWith('chain') && (
                  <div className="msg-rate">
                    <button
                      className={message.rating === 1 ? 'on' : ''}
                      title="Useful answer"
                      onClick={() => rate(message.id, 1)}
                    >
                      ↑
                    </button>
                    <button
                      className={message.rating === -1 ? 'on' : ''}
                      title="Unhelpful answer"
                      onClick={() => rate(message.id, -1)}
                    >
                      ↓
                    </button>
                    {message.content.includes('```') && (
                      <button
                        className="save-files-btn"
                        title="Extract safely named code blocks into the active workspace"
                        onClick={() => saveFiles(message)}
                      >
                        Save files
                      </button>
                    )}
                    {fileMsg[message.id] && <span className="muted tiny">{fileMsg[message.id]}</span>}
                  </div>
                )}
            </div>
          ))}

          {busy && (
            <div className="msg assistant">
              <div className="msg-role">{agentLabel}</div>
              <div className="msg-body thinking">
                {chainRunning ? 'Running the governed company chain…' : 'Working…'}
              </div>
            </div>
          )}
        </div>

        {chain && (
          <div className="banner">
            Internal chain completed with {chain.steps.length} employee step(s). External action remains owner-gated. Final verdict: {chain.finalVerdict.slice(0, 240)}
          </div>
        )}
        {error && <div className="banner error">{error}</div>}

        <div className="composer">
          <label className="memory-toggle" title="Load bounded company-memory context">
            <input
              type="checkbox"
              checked={useMemory}
              onChange={(event) => setUseMemory(event.target.checked)}
            />
            memory
          </label>
          <label className="memory-toggle" title="Allow bounded workspace file tools and fixed sandbox tasks">
            <input
              type="checkbox"
              checked={agentMode}
              onChange={(event) => setAgentMode(event.target.checked)}
              disabled={agentId === 'ceo'}
            />
            build tools
          </label>
          <textarea
            value={input}
            placeholder={`Give ${agentLabel} one measurable internal objective…`}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            rows={2}
          />
          <button className="primary-btn" onClick={send} disabled={busy || !input.trim()}>
            Run
          </button>
        </div>
      </div>
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  ceo: 'CEO',
  'market-intelligence': 'Market Intelligence',
  'commercial-red-team': 'Commercial Red Team',
  'product-lead': 'Product Lead',
  'software-architect': 'Software Architect',
  'build-engineer': 'Build Engineer',
  'qa-security': 'QA & Security',
  'revenue-operations': 'Revenue Operations',
  'free-claude-code': 'FCC',
  codex: 'Codex',
  hermes: 'Hermes',
};

function shortAgent(id: string): string {
  return ROLE_LABELS[id] ?? id;
}
