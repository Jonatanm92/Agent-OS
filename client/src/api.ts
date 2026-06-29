// Thin fetch wrapper around the Agent OS backend API.

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export interface FccStatus {
  ok: boolean;
  baseUrl: string;
  model: string;
  models?: string[];
  error?: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  project_id: string | null;
  agent_id: string;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  label: string;
  backend: 'fcc' | 'cli';
  transport: 'messages' | 'responses';
  defaultModel: string;
  model: string;
  blurb: string;
  available?: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface WorkspaceFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  kind: 'html' | 'image' | 'source';
}

export interface NoteSummary {
  name: string;
  path: string;
  size: number;
  modified: string;
}

export const api = {
  status: () => req<FccStatus>('/api/status'),
  getSettings: () =>
    req<{ settings: Record<string, string>; resolved: Record<string, string> }>('/api/settings'),
  saveSettings: (settings: Record<string, string>) =>
    req<{ ok: boolean }>('/api/settings', { method: 'POST', body: JSON.stringify(settings) }),

  listProjects: () =>
    req<{ projects: Project[]; activeProjectId: string }>('/api/projects'),
  createProject: (name: string) =>
    req<{ project: Project }>('/api/projects', { method: 'POST', body: JSON.stringify({ name }) }),
  activateProject: (id: string) =>
    req<{ ok: boolean; activeProjectId: string }>(`/api/projects/${id}/activate`, { method: 'POST' }),

  listConversations: () => req<{ conversations: Conversation[] }>('/api/conversations'),
  getConversation: (id: string) =>
    req<{ conversation: Conversation; messages: Message[] }>(`/api/conversations/${id}`),
  deleteConversation: (id: string) =>
    req<{ ok: boolean }>(`/api/conversations/${id}`, { method: 'DELETE' }),
  chat: (message: string, agentId: string, conversationId?: string, useMemory = true) =>
    req<{ conversationId: string; agentId: string; reply: string; model: string }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message, agentId, conversationId, useMemory }),
    }),

  listAgents: () => req<{ agents: Agent[] }>('/api/agents'),

  listFiles: (projectId?: string) =>
    req<{ files: WorkspaceFile[] }>(
      `/api/workspace/files${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`
    ),
  fileUrl: (projectId: string, path: string) =>
    `/api/workspace/file?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}`,

  listNotes: () => req<{ notes: NoteSummary[] }>('/api/memory/notes'),
  readNote: (path: string) =>
    req<{ path: string; content: string }>(`/api/memory/note?path=${encodeURIComponent(path)}`),
  saveNote: (path: string, content: string, append = false) =>
    req<{ note: NoteSummary }>('/api/memory/note', {
      method: 'POST',
      body: JSON.stringify({ path, content, append }),
    }),
};
