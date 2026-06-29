import type { Tab } from '../App';
import type { Agent, FccStatus } from '../api';

// Sidebar tools that aren't model agents (still routed locally, not via FCC).
const TOOLS: { id: string; label: string; tab: Tab }[] = [
  { id: 'pipeline', label: 'Pipeline', tab: 'pipeline' },
  { id: 'workspace', label: 'Workspace', tab: 'workspace' },
  { id: 'memory', label: 'Memory', tab: 'memory' },
  { id: 'terminal', label: 'Terminal', tab: 'terminal' },
];

export function Sidebar({
  tab,
  setTab,
  status,
  agents,
  activeAgentId,
  onSelectAgent,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  status: FccStatus | null;
  agents: Agent[];
  activeAgentId: string;
  onSelectAgent: (id: string) => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">◆</span>
        <span className="brand-name">Agent OS</span>
      </div>

      <div className="nav-section-label">Agents</div>
      <nav className="nav">
        {agents.map((a) => (
          <button
            key={a.id}
            className={`nav-item ${tab === 'chat' && activeAgentId === a.id ? 'active' : ''}`}
            onClick={() => onSelectAgent(a.id)}
            title={`${a.blurb}${a.model ? `  •  model: ${a.model}` : ''}`}
          >
            <span className="nav-dot" />
            <span className="nav-label">{a.label}</span>
            {a.available === false ? (
              <span className="agent-transport install">install</span>
            ) : (
              <span className="agent-transport">{a.backend === 'cli' ? 'cli' : a.transport === 'responses' ? 'resp' : 'msgs'}</span>
            )}
          </button>
        ))}
        {agents.length === 0 && <p className="muted small" style={{ padding: '0 10px' }}>Loading…</p>}
      </nav>

      <div className="shared-memory-note" title="Every agent reads the same Obsidian vault">
        ◇ shared memory
      </div>

      <div className="nav-section-label">Tools</div>
      <nav className="nav">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`nav-item ${tab === t.tab ? 'active' : ''}`}
            onClick={() => setTab(t.tab)}
          >
            <span className="nav-dot" />
            <span className="nav-label">{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-foot">
        <button
          className={`nav-item ${tab === 'settings' ? 'active' : ''}`}
          onClick={() => setTab('settings')}
        >
          <span className="nav-dot" /> <span className="nav-label">Settings</span>
        </button>
        <div className={`fcc-status ${status?.ok ? 'up' : 'down'}`}>
          <span className="status-led" />
          {status?.ok ? 'FCC connected' : 'FCC offline'}
        </div>
      </div>
    </aside>
  );
}
