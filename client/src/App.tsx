import { useEffect, useState, useCallback } from 'react';
import { api, type FccStatus, type Project, type Agent } from './api';
import { Sidebar } from './components/Sidebar';
import { ChatTab } from './components/ChatTab';
import { WorkspaceTab } from './components/WorkspaceTab';
import { MemoryTab } from './components/MemoryTab';
import { SettingsTab } from './components/SettingsTab';
import { ProjectPill } from './components/ProjectPill';

export type Tab = 'chat' | 'workspace' | 'memory' | 'settings';

export function App() {
  const [tab, setTab] = useState<Tab>('chat');
  const [status, setStatus] = useState<FccStatus | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string>('free-claude-code');

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await api.status());
    } catch {
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

  useEffect(() => {
    refreshStatus();
    refreshProjects();
    refreshAgents();
    const t = setInterval(refreshStatus, 15000);
    return () => clearInterval(t);
  }, [refreshStatus, refreshProjects, refreshAgents]);

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const activeAgent = agents.find((a) => a.id === activeAgentId);

  return (
    <div className="app">
      <Sidebar
        tab={tab}
        setTab={setTab}
        status={status}
        agents={agents}
        activeAgentId={activeAgentId}
        onSelectAgent={(id) => {
          setActiveAgentId(id);
          setTab('chat');
        }}
      />
      <main className="main">
        <header className="topbar">
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
