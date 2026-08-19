import type { Tab } from '../App';
import type { Agent, FccStatus } from '../api';

// Tools that belong to the generic company operating system.
const TOOLS: { id: string; label: string; tab: Tab }[] = [
  { id: 'pipeline', label: 'Venture Pipeline', tab: 'pipeline' },
  { id: 'studio', label: 'Skills & Routines', tab: 'studio' },
  { id: 'workspace', label: 'Workspaces', tab: 'workspace' },
  { id: 'memory', label: 'Company Memory', tab: 'memory' },
  { id: 'terminal', label: 'Terminal', tab: 'terminal' },
];

// These profiles remain compatible with old conversations but are no longer
// presented as normal company employees or default revenue paths.
const LEGACY_AGENT_IDS = new Set(['dsp-engineer', 'plugin-architect']);

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
  const visibleAgents = agents.filter((agent) => !LEGACY_AGENT_IDS.has(agent.id));

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">◆</span>
        <span className="brand-name">Hermes Oracle</span>
      </div>

      <div className="nav-section-label">Company</div>
      <nav className="nav">
        <button
          className={`nav-item ${tab === 'mission' ? 'active' : ''}`}
          onClick={() => setTab('mission')}
        >
          <span className="nav-dot" />
          <span className="nav-label">Owner Cockpit</span>
        </button>
      </nav>

      <div className="nav-section-label">Agent runtimes</div>
      <nav className="nav">
        {visibleAgents.map((agent) => (
          <button
            key={agent.id}
            className={`nav-item ${tab === 'chat' && activeAgentId === agent.id ? 'active' : ''}`}
            onClick={() => onSelectAgent(agent.id)}
            title={`${agent.blurb}${agent.model ? `  •  model: ${agent.model}` : ''}`}
          >
            <span className="nav-dot" />
            <span className="nav-label">{agent.label}</span>
            {agent.available === false ? (
              <span className="agent-transport install">install</span>
            ) : (
              <span className="agent-transport">
                {agent.backend === 'cli' ? 'cli' : agent.transport === 'responses' ? 'resp' : 'msgs'}
              </span>
            )}
          </button>
        ))}
        {visibleAgents.length === 0 && (
          <p className="muted small" style={{ padding: '0 10px' }}>Loading…</p>
        )}
      </nav>

      <div className="shared-memory-note" title="Every company agent reads the same durable memory">
        ◇ shared company memory
      </div>

      <div className="nav-section-label">Operations</div>
      <nav className="nav">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            className={`nav-item ${tab === tool.tab ? 'active' : ''}`}
            onClick={() => setTab(tool.tab)}
          >
            <span className="nav-dot" />
            <span className="nav-label">{tool.label}</span>
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
          {status?.ok ? 'Model gateway online' : 'Model gateway offline'}
        </div>
      </div>
    </aside>
  );
}
