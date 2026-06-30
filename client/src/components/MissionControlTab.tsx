import { useEffect, useState } from 'react';
import { api, type Agent, type FccStatus } from '../api';

interface Overview {
  status: FccStatus;
  agents: Agent[];
  stats: { conversations: number; messages: number; pipeline: number; notes: number; projects: number };
  time: string;
}

export function MissionControlTab({
  onOpenAgent,
}: {
  onOpenAgent: (id: string) => void;
}) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [ticks, setTicks] = useState(0);

  const refresh = async () => {
    try {
      setOv(await api.overview());
      setTicks((t) => t + 1);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, []);

  const s = ov?.status;
  const onlineAgents = ov?.agents.filter((a) => a.available).length ?? 0;

  const tiles = [
    {
      label: 'Free Claude Code',
      value: s?.ok ? 'Online' : 'Offline',
      sub: s?.ok ? (s.routedModel || s.model) : s?.error?.slice(0, 28) || 'fcc-server down',
      ok: !!s?.ok,
    },
    { label: 'Routed model', value: s?.routedModel ? short(s.routedModel) : '—', sub: s?.ok ? `${s.models?.length ?? 0} models` : 'n/a', ok: !!s?.ok },
    { label: 'Latency', value: s?.latencyMs != null ? `${s.latencyMs}ms` : '—', sub: 'FCC /v1/models', ok: (s?.latencyMs ?? 9999) < 4000 },
    { label: 'Agents online', value: `${onlineAgents}/${ov?.agents.length ?? 0}`, sub: 'available now', ok: onlineAgents > 0 },
    { label: 'Heartbeat', value: String(ticks), sub: 'poll · 10s', ok: true },
    { label: 'Memory', value: String(ov?.stats.notes ?? 0), sub: 'vault notes', ok: true },
  ];

  return (
    <div className="mission">
      <div className="mission-head">
        <h2>Mission Control</h2>
        <p className="muted">Status of every agent, every memory, every signal.</p>
      </div>

      <div className="tiles">
        {tiles.map((t) => (
          <div className={`tile ${t.ok ? 'ok' : 'down'}`} key={t.label}>
            <div className="tile-label">
              <span className="tile-led" /> {t.label}
            </div>
            <div className="tile-value">{t.value}</div>
            <div className="tile-sub">{t.sub}</div>
          </div>
        ))}
      </div>

      <div className="section-label">Agents · click to open chat</div>
      <div className="agent-cards">
        {ov?.agents.map((a) => (
          <button key={a.id} className="agent-card" onClick={() => onOpenAgent(a.id)}>
            <div className="agent-card-top">
              <span className="agent-card-name">{a.label}</span>
              <span className={`agent-pill ${a.available ? 'on' : 'off'}`}>
                {a.available ? 'online' : a.backend === 'cli' ? 'not installed' : 'offline'}
              </span>
            </div>
            <p className="agent-card-blurb">{a.blurb}</p>
            <div className="agent-card-meta">
              <span>{a.backend === 'cli' ? 'local CLI' : a.transport === 'responses' ? 'Responses API' : 'Messages API'}</span>
              <span className="agent-card-model">{a.model || 'its own config'}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="section-label">Signals</div>
      <div className="stat-row">
        <Stat n={ov?.stats.conversations} label="conversations" />
        <Stat n={ov?.stats.messages} label="messages" />
        <Stat n={ov?.stats.pipeline} label="pipeline items" />
        <Stat n={ov?.stats.projects} label="projects" />
        <Stat n={ov?.stats.notes} label="memory notes" />
      </div>
    </div>
  );
}

function Stat({ n, label }: { n?: number; label: string }) {
  return (
    <div className="stat">
      <div className="stat-n">{n ?? '—'}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}

function short(model: string): string {
  const parts = model.split('/');
  return parts[parts.length - 1];
}
