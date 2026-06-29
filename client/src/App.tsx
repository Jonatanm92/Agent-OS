import { useEffect, useState, useCallback } from 'react';
import { api, auth, ApiError, type FccStatus, type Project, type Agent } from './api';
import { Sidebar } from './components/Sidebar';
import { ChatTab } from './components/ChatTab';
import { WorkspaceTab } from './components/WorkspaceTab';
import { MemoryTab } from './components/MemoryTab';
import { SettingsTab } from './components/SettingsTab';
import { ProjectPill } from './components/ProjectPill';
import { Login } from './components/Login';

export type Tab = 'chat' | 'workspace' | 'memory' | 'settings';

type Gate = 'loading' | 'login' | 'ready';

export function App() {
  const [gate, setGate] = useState<Gate>('loading');
  const [tab, setTab] = useState<Tab>('chat');
  const [status, setStatus] = useState<FccStatus | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string>('free-claude-code');
  const [navOpen, setNavOpen] = useState(false); // mobile sidebar drawer

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await api.status());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setGate('login');
        return;
      }
      setStatus({ ok: false, baseUrl: '', model: '', error: 'Dashboard backend unreachable' });
    }
  }, []);

  const refreshProjects = useCallback(async () => {
    const { projects, activeProjectId } = await api.listProjects();
    setProjects(projects);
    setActiveProjectId(activeProjectId);
  }, []);

  const refreshAgents = useCallback(async () => {
    const { agents } = await api.listAgents();
    setAgents(agents);
  }, []);

  // Decide whether a login is needed before showing the app.
  const init = useCallback(async () => {
    try {
      const { required } = await api.authStatus();
      if (required) {
        try {
          await api.listProjects(); // probe with stored token
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) {
            setGate('login');
            return;
          }
        }
      }
      setGate('ready');
    } catch {
      setGate('ready'); // if status check fails, fall through to the app
    }
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (gate !== 'ready') return;
    refreshStatus();
    refreshProjects();
    refreshAgents();
    const t = setInterval(refreshStatus, 15000);
    return () => clearInterval(t);
  }, [gate, refreshStatus, refreshProjects, refreshAgents]);

  if (gate === 'loading') {
    return <div className="boot">Loading Agent OS…</div>;
  }
  if (gate === 'login') {
    return (
      <Login
        onSuccess={() => {
          setGate('loading');
          init();
        }}
      />
    );
  }

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const activeAgent = agents.find((a) => a.id === activeAgentId);

  return (
    <div className={`app ${navOpen ? 'nav-open' : ''}`}>
      <div className="nav-scrim" onClick={() => setNavOpen(false)} />
      <Sidebar
        tab={tab}
        setTab={(t) => {
          setTab(t);
          setNavOpen(false);
        }}
        status={status}
        agents={agents}
        activeAgentId={activeAgentId}
        onSelectAgent={(id) => {
          setActiveAgentId(id);
          setTab('chat');
          setNavOpen(false);
        }}
      />
      <main className="main">
        <header className="topbar">
          <button
            className="hamburger"
            aria-label="Menu"
            onClick={() => setNavOpen((v) => !v)}
          >
            ☰
          </button>
          <h1 className="topbar-title">{tabTitle(tab, activeAgent?.label)}</h1>
          <ProjectPill
            projects={projects}
            activeProjectId={activeProjectId}
            onChange={async (id) => {
              await api.activateProject(id);
              await refreshProjects();
            }}
            onCreate={async (name) => {
              const { project } = await api.createProject(name);
              await api.activateProject(project.id);
              await refreshProjects();
            }}
          />
        </header>

        <section className="content">
          {tab === 'chat' && (
            <ChatTab
              status={status}
              activeAgent={activeAgent}
              onAgentFromConversation={(id) => setActiveAgentId(id)}
            />
          )}
          {tab === 'workspace' && <WorkspaceTab activeProject={activeProject} />}
          {tab === 'memory' && <MemoryTab />}
          {tab === 'settings' && (
            <SettingsTab
              agents={agents}
              onSaved={() => {
                refreshStatus();
                refreshAgents();
              }}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function tabTitle(tab: Tab, agentLabel?: string): string {
  switch (tab) {
    case 'chat':
      return `${agentLabel ?? 'Free Claude Code'} — Chat`;
    case 'workspace':
      return 'Workspace';
    case 'memory':
      return 'Memory — Obsidian Vault';
    case 'settings':
      return 'Settings';
  }
}
