// Thin fetch wrapper around the Agent OS backend API.

const TOKEN_KEY = 'agentos_token';
export const auth = {
  get: () => localStorage.getItem(TOKEN_KEY) || '',
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const token = auth.get();
  const res = await fetch(url, {
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-agentos-token': token } : {}),
    },
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
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

export interface FccStatus {
  ok: boolean;
  baseUrl: string;
  model: string;
  models?: string[];
  routedModel?: string;
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
  identity: string;
  blurb: string;
  available?: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
  rating?: number;
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

export type PipelineStage = 'capture' | 'gate' | 'execute' | 'shipped';
export interface PipelineItem {
  id: string;
  title: string;
  raw: string;
  stage: PipelineStage;
  item_type: string;
  tags: string[];
  plan: string;
  score: number;
  deliverable: string;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

export const api = {
  authStatus: () => req<{ required: boolean }>('/api/auth/status'),
  login: (password: string) =>
    req<{ ok: boolean; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  status: () => req<FccStatus>('/api/status'),
  probeTools: (model?: string) =>
    req<{ supported: boolean; model: string; detail: string }>('/api/fcc/probe', {
      method: 'POST',
      body: JSON.stringify({ model }),
    }),
  setFccModel: (model: string) =>
    req<{ ok: boolean; path: string; note: string }>('/api/fcc/set-model', {
      method: 'POST',
      body: JSON.stringify({ model }),
    }),
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
  rateMessage: (id: string, rating: number) =>
    req<{ ok: boolean }>(`/api/messages/${id}/rating`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    }),
  chat: (message: string, agentId: string, conversationId?: string, useMemory = true, agentic = false) =>
    req<{ conversationId: string; agentId: string; reply: string; model: string }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message, agentId, conversationId, useMemory, agentic }),
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
  summarizeMemory: (conversationId: string) =>
    req<{ note: NoteSummary; summary: string }>('/api/memory/summarize', {
      method: 'POST',
      body: JSON.stringify({ conversationId }),
    }),
  remember: (text: string) =>
    req<{ note: NoteSummary }>('/api/memory/remember', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  // Pipeline — From Inbox to Shipped
  listPipeline: () => req<{ items: PipelineItem[] }>('/api/pipeline'),
  capturePipeline: (idea: string) =>
    req<{ item: PipelineItem }>('/api/pipeline/capture', {
      method: 'POST',
      body: JSON.stringify({ idea }),
    }),
  shapePipeline: (id: string) =>
    req<{ item: PipelineItem }>(`/api/pipeline/${id}/shape`, { method: 'POST', body: '{}' }),
  approvePipeline: (id: string) =>
    req<{ item: PipelineItem }>(`/api/pipeline/${id}/approve`, { method: 'POST', body: '{}' }),
  executePipeline: (id: string) =>
    req<{ item: PipelineItem }>(`/api/pipeline/${id}/execute`, { method: 'POST', body: '{}' }),
  deletePipeline: (id: string) =>
    req<{ ok: boolean }>(`/api/pipeline/${id}`, { method: 'DELETE' }),
};
