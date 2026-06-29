import { useEffect, useState } from 'react';
import { api, type Agent } from '../api';

export function SettingsTab({ agents, onSaved }: { agents: Agent[]; onSaved: () => void }) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  // Claude Code readiness
  const [ccModel, setCcModel] = useState('');
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<{ supported: boolean; detail: string } | null>(null);
  const [ccMsg, setCcMsg] = useState<string | null>(null);

  const SUGGESTED = [
    'open_router/qwen/qwen3-coder:free',
    'open_router/deepseek/deepseek-chat-v3-0324:free',
    'nvidia_nim/nvidia/nemotron-3-super-120b-a12b',
  ];

  const runProbe = async () => {
    setProbing(true);
    setProbe(null);
    try {
      const r = await api.probeTools(ccModel || undefined);
      setProbe({ supported: r.supported, detail: r.detail });
    } catch (e) {
      setProbe({ supported: false, detail: e instanceof Error ? e.message : 'failed' });
    } finally {
      setProbing(false);
    }
  };

  const applyCc = async () => {
    if (!ccModel) return;
    setCcMsg(null);
    try {
      const r = await api.setFccModel(ccModel);
      setCcMsg(`Saved to ${r.path}. Restart fcc-server for it to take effect.`);
    } catch (e) {
      setCcMsg(e instanceof Error ? e.message : 'failed');
    }
  };

  useEffect(() => {
    api.getSettings().then(({ settings, resolved }) => {
      setSettings(settings);
      setResolved(resolved);
    });
  }, []);

  const set = (key: string, value: string) => {
    setSettings((s) => ({ ...s, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    const payload: Record<string, string> = {
      fcc_base_url: settings.fcc_base_url ?? '',
      fcc_auth_token: settings.fcc_auth_token ?? '',
      model: settings.model ?? '',
      obsidian_vault_path: settings.obsidian_vault_path ?? '',
      hermes_provider: settings.hermes_provider ?? '',
    };
    for (const a of agents) {
      const mk = `agent_model_${a.id}`;
      if (settings[mk] !== undefined) payload[mk] = settings[mk];
      const ik = `agent_identity_${a.id}`;
      if (settings[ik] !== undefined) payload[ik] = settings[ik];
    }
    await api.saveSettings(payload);
    const { resolved } = await api.getSettings();
    setResolved(resolved);
    setSaved(true);
    onSaved();
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const s = await api.status();
      setTestResult(
        s.ok ? `Connected. ${s.models?.length ?? 0} models available via FCC.` : `Failed: ${s.error}`
      );
    } catch (e) {
      setTestResult(e instanceof Error ? e.message : 'Failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="settings">
      <section className="card">
        <h3>Free Claude Code (CLI pillar)</h3>
        <p className="muted small">
          The dashboard sends every agent's traffic to your running FCC proxy. Set provider keys
          (OpenRouter, etc.) in the FCC Admin UI — here you only point at the proxy.
        </p>
        <label>
          FCC base URL
          <input
            value={settings.fcc_base_url ?? ''}
            placeholder="http://127.0.0.1:8082"
            onChange={(e) => set('fcc_base_url', e.target.value)}
          />
        </label>
        <label>
          FCC auth token
          <input
            value={settings.fcc_auth_token ?? ''}
            placeholder="freecc"
            onChange={(e) => set('fcc_auth_token', e.target.value)}
          />
        </label>
        <label>
          Default model (used by agents with no model set)
          <input
            value={settings.model ?? ''}
            placeholder="claude-sonnet-4-20250514"
            onChange={(e) => set('model', e.target.value)}
          />
        </label>
        <button className="ghost-btn" onClick={test} disabled={testing}>
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        {testResult && <p className="test-result">{testResult}</p>}
      </section>

      <section className="card">
        <h3>🧩 Claude Code — free coding readiness</h3>
        <p className="muted small">
          Test whether a free model's <strong>tools actually work with Claude Code</strong> (Owl
          Alpha's don't round-trip through FCC). Pick a model, test it, then set it as FCC's model.
        </p>
        <label>
          Model to test / use
          <input
            value={ccModel}
            placeholder="open_router/qwen/qwen3-coder:free"
            onChange={(e) => setCcModel(e.target.value)}
          />
        </label>
        <div className="chips">
          {SUGGESTED.map((m) => (
            <button key={m} className="chip" onClick={() => setCcModel(m)} type="button">
              {m}
            </button>
          ))}
        </div>
        <div className="row-btns">
          <button className="ghost-btn" onClick={runProbe} disabled={probing} type="button">
            {probing ? 'Testing tools…' : 'Test tool support'}
          </button>
          <button className="ghost-btn" onClick={applyCc} disabled={!ccModel} type="button">
            Set as FCC model
          </button>
        </div>
        {probe && (
          <p className={`test-result ${probe.supported ? 'ok' : 'bad'}`}>{probe.detail}</p>
        )}
        {ccMsg && <p className="muted small">{ccMsg}</p>}
        <p className="muted tiny">
          Browse free models at openrouter.ai/models?max_price=0. NVIDIA NIM models need a (free)
          NVIDIA key in the FCC Admin UI.
        </p>
      </section>

      <section className="card">
        <h3>Agents — shared memory</h3>
        <p className="muted small">
          Every agent reads the <strong>same Obsidian vault</strong> as memory. Each agent is a
          backend + model: Free Claude Code & Codex route through FCC; Hermes runs as a local CLI.
          Override a model per agent (e.g. a free OpenRouter slug to stay $0).
        </p>
        {agents.map((a) => (
          <div key={a.id} className="agent-config">
            <label>
              {a.label}{' '}
              <span className="muted tiny">
                ({a.backend === 'cli'
                  ? 'Hermes CLI'
                  : a.transport === 'responses'
                  ? 'OpenAI Responses'
                  : 'Anthropic Messages'}
                {a.available === false ? ' • not installed' : ''})
              </span>
              <input
                value={settings[`agent_model_${a.id}`] ?? ''}
                placeholder={a.model || '(uses hermes setup / default)'}
                onChange={(e) => set(`agent_model_${a.id}`, e.target.value)}
              />
            </label>
            <label>
              <span className="muted tiny">Identity (system prompt / persona)</span>
              <textarea
                className="identity-box"
                rows={4}
                value={settings[`agent_identity_${a.id}`] ?? ''}
                placeholder={a.identity}
                onChange={(e) => set(`agent_identity_${a.id}`, e.target.value)}
              />
            </label>
          </div>
        ))}
        <label>
          Hermes provider (optional, e.g. <code>openrouter</code> or <code>nous</code>)
          <input
            value={settings.hermes_provider ?? ''}
            placeholder="leave blank to use hermes setup"
            onChange={(e) => set('hermes_provider', e.target.value)}
          />
        </label>
      </section>

      <section className="card">
        <h3>Obsidian memory (Memory pillar)</h3>
        <label>
          Vault folder path
          <input
            value={settings.obsidian_vault_path ?? ''}
            placeholder={resolved.vaultPath || '~/freeclaude-vault'}
            onChange={(e) => set('obsidian_vault_path', e.target.value)}
          />
        </label>
        <p className="muted small">
          Resolved: <code>{resolved.vaultPath}</code>. For full agent access via Claude Code, wire{' '}
          <code>obsidian-mcp-server</code> (see <code>mcp/obsidian.mcp.json</code>).
        </p>
      </section>

      <section className="card">
        <h3>Workspace</h3>
        <p className="muted small">
          Projects are folders under <code>{resolved.scratchDir}</code>. Manage the active project
          from the pill in the top bar.
        </p>
      </section>

      <button className="primary-btn" onClick={save}>
        {saved ? 'Saved ✓' : 'Save settings'}
      </button>
    </div>
  );
}
