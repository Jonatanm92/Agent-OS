import { useEffect, useState } from 'react';
import { api, type Agent, type FccStatus, type PipelineItem } from '../api';

interface Overview {
  status: FccStatus;
  agents: Agent[];
  stats: { conversations: number; messages: number; pipeline: number; notes: number; projects: number };
  time: string;
}

interface CompanyRole {
  id: string;
  title: string;
  agent: string;
  mandate: string;
}

const FALLBACK_ROLES: CompanyRole[] = [
  { id: 'ceo', title: 'CEO / Portfolio Lead', agent: 'orchestrator', mandate: 'Prioritize goals, budgets, and work.' },
  { id: 'market', title: 'Market Intelligence Lead', agent: 'growth-hacker', mandate: 'Collect traceable demand and distribution evidence.' },
  { id: 'red-team', title: 'Commercial Red Team', agent: 'reality-checker', mandate: 'Attack assumptions and block weak ventures.' },
  { id: 'product', title: 'Product Lead', agent: 'rapid-prototyper', mandate: 'Turn validated pain into a narrow offer and acceptance test.' },
  { id: 'architecture', title: 'Solutions Architect', agent: 'backend-architect', mandate: 'Design minimal, secure, maintainable systems.' },
  { id: 'builder', title: 'Build Engineer', agent: 'codex', mandate: 'Implement in an isolated workspace with tests.' },
  { id: 'qa', title: 'QA / Security', agent: 'reality-checker', mandate: 'Verify from tests, diffs, screenshots, and risk evidence.' },
  { id: 'revenue', title: 'Revenue Operations', agent: 'free-claude-code', mandate: 'Own offer, CRM, invoicing readiness, and metrics.' },
];

export function MissionControlTab({
  onOpenAgent,
}: {
  onOpenAgent: (id: string) => void;
}) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [ticks, setTicks] = useState(0);
  const [companyName, setCompanyName] = useState('Hermes Oracle Company OS');
  const [companyMission, setCompanyMission] = useState(
    'Create verified software and automation that earns real revenue while the owner controls irreversible actions.'
  );
  const [roles, setRoles] = useState<CompanyRole[]>(FALLBACK_ROLES);
  const [ownerGates, setOwnerGates] = useState<string[]>([]);
  const [revenueMission, setRevenueMission] = useState<PipelineItem | null>(null);

  const refresh = async () => {
    try {
      const [overview, settingsResult, pipelineResult] = await Promise.all([
        api.overview(),
        api.getSettings(),
        api.listPipeline(),
      ]);
      setOv(overview);
      setCompanyName(settingsResult.settings.company_name || 'Hermes Oracle Company OS');
      setCompanyMission(settingsResult.settings.company_mission || companyMission);
      setRoles(parseList<CompanyRole>(settingsResult.settings.company_roles, FALLBACK_ROLES));
      setOwnerGates(parseList<string>(settingsResult.settings.company_owner_gates, []));
      setRevenueMission(
        pipelineResult.items.find((item) => item.id === 'rev-001-ai-workflow-revenue-sprint') ?? null
      );
      setTicks((tick) => tick + 1);
    } catch {
      /* Keep the last useful state if one dependency is temporarily offline. */
    }
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, []);

  const status = ov?.status;
  const onlineAgents = ov?.agents.filter((agent) => agent.available).length ?? 0;
  const buildAllowed = revenueMission?.plan.includes('PRODUCTION BUILD ALLOWED: YES') ?? false;

  const tiles = [
    {
      label: 'Company state',
      value: revenueMission ? 'Operating' : 'Bootstrapping',
      sub: revenueMission ? 'REV-001 loaded' : 'mission seed pending',
      ok: Boolean(revenueMission),
    },
    {
      label: 'First revenue mission',
      value: revenueMission ? `${revenueMission.score}/100` : '—',
      sub: revenueMission ? stageLabel(revenueMission.stage) : 'not loaded',
      ok: Boolean(revenueMission),
    },
    {
      label: 'Production build',
      value: buildAllowed ? 'Allowed' : 'Blocked',
      sub: buildAllowed ? 'evidence gate passed' : 'validation first',
      ok: buildAllowed,
    },
    {
      label: 'Agents online',
      value: `${onlineAgents}/${ov?.agents.length ?? 0}`,
      sub: 'available now',
      ok: onlineAgents > 0,
    },
    {
      label: 'Model gateway',
      value: status?.ok ? 'Online' : 'Offline',
      sub: status?.ok ? short(status.routedModel || status.model) : status?.error?.slice(0, 28) || 'FCC unavailable',
      ok: Boolean(status?.ok),
    },
    {
      label: 'Owner heartbeat',
      value: String(ticks),
      sub: 'cockpit poll · 10s',
      ok: true,
    },
  ];

  return (
    <div className="mission">
      <div className="mission-head">
        <p className="muted tiny mission-studio">OWNER COCKPIT · LOCAL CONTROL PLANE</p>
        <h2><em>{companyName}</em></h2>
        <p className="muted">{companyMission}</p>
      </div>

      <div className="tiles">
        {tiles.map((tile) => (
          <div className={`tile ${tile.ok ? 'ok' : 'down'}`} key={tile.label}>
            <div className="tile-label">
              <span className="tile-led" /> {tile.label}
            </div>
            <div className="tile-value">{tile.value}</div>
            <div className="tile-sub">{tile.sub}</div>
          </div>
        ))}
      </div>

      <div className="section-label">Active company objective</div>
      <div className="agent-card" style={{ cursor: 'default', textAlign: 'left' }}>
        <div className="agent-card-top">
          <span className="agent-card-name">
            {revenueMission?.title || 'REV-001 — Validate the first revenue offer'}
          </span>
          <span className={`agent-pill ${revenueMission ? 'on' : 'off'}`}>
            {revenueMission ? stageLabel(revenueMission.stage) : 'pending'}
          </span>
        </div>
        <p className="agent-card-blurb">
          Sell a fixed-scope, human-approved AI workflow pilot before building an unvalidated SaaS.
          Current test: one sales/admin workflow for a Swedish small service firm.
        </p>
        <div className="agent-card-meta">
          <span>Founder price hypothesis: 6,900 SEK ex VAT</span>
          <span className="agent-card-model">
            {buildAllowed ? 'production build permitted' : 'validation-only mode'}
          </span>
        </div>
      </div>

      <div className="section-label">AI employees · click to open their runtime</div>
      <div className="agent-cards">
        {roles.map((role) => {
          const runtime = ov?.agents.find((agent) => agent.id === role.agent);
          return (
            <button key={role.id} className="agent-card" onClick={() => onOpenAgent(role.agent)}>
              <div className="agent-card-top">
                <span className="agent-card-name">{role.title}</span>
                <span className={`agent-pill ${runtime?.available ? 'on' : 'off'}`}>
                  {runtime?.available ? 'ready' : 'runtime offline'}
                </span>
              </div>
              <p className="agent-card-blurb">{role.mandate}</p>
              <div className="agent-card-meta">
                <span>{runtime?.label || role.agent}</span>
                <span className="agent-card-model">{runtime?.model || 'configured runtime'}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="section-label">Owner approval gates</div>
      <div className="stat-row">
        {(ownerGates.length ? ownerGates : ['customer contact', 'spend', 'contracts', 'production', 'secrets', 'self-modification']).map(
          (gate) => (
            <div className="stat" key={gate} style={{ minWidth: 150 }}>
              <div className="stat-n" style={{ fontSize: 18 }}>LOCKED</div>
              <div className="stat-l">{gate}</div>
            </div>
          )
        )}
      </div>

      <div className="section-label">System signals</div>
      <div className="stat-row">
        <Stat n={ov?.stats.pipeline} label="pipeline items" />
        <Stat n={ov?.stats.projects} label="isolated projects" />
        <Stat n={ov?.stats.notes} label="memory notes" />
        <Stat n={ov?.stats.conversations} label="conversations" />
        <Stat n={ov?.stats.messages} label="messages" />
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
  if (!model) return 'configured';
  const parts = model.split('/');
  return parts[parts.length - 1];
}

function parseList<T>(raw: string | undefined, fallback: T[]): T[] {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function stageLabel(stage: PipelineItem['stage']): string {
  switch (stage) {
    case 'capture':
      return 'unshaped';
    case 'gate':
      return 'owner gate';
    case 'execute':
      return 'in execution';
    case 'shipped':
      return 'verified';
  }
}
