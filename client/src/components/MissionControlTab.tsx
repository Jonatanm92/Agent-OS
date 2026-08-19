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

type MetricTone = 'positive' | 'guarded' | 'offline' | 'neutral';

interface MetricTile {
  label: string;
  value: string;
  sub: string;
  tone: MetricTone;
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

const DEFAULT_OWNER_GATES = [
  'external customer contact',
  'spending and subscriptions',
  'contracts and legal acceptance',
  'payment-account changes',
  'production deployment',
  'secret access',
  'self-modification promotion',
];

const FLOW_STEPS = [
  { label: 'Evidence', detail: 'pain · price · prospects' },
  { label: 'Red team', detail: 'attack the thesis' },
  { label: 'Owner gate', detail: 'approve next risk' },
  { label: 'Build', detail: 'isolated worktree' },
  { label: 'QA', detail: 'tests · diff · review' },
  { label: 'Customer test', detail: 'measured outcome' },
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
  const totalAgents = ov?.agents.length ?? roles.length;
  const missionScore = Math.max(0, Math.min(100, revenueMission?.score ?? 0));
  const buildAllowed = revenueMission?.plan.includes('PRODUCTION BUILD ALLOWED: YES') ?? false;
  const currentMode = buildAllowed ? 'Production eligible' : 'Validation only';
  const currentStage = revenueMission ? stageLabel(revenueMission.stage) : 'bootstrapping';
  const activeFlowIndex = revenueMission ? flowIndex(revenueMission.stage) : 0;

  const tiles: MetricTile[] = [
    {
      label: 'Company state',
      value: revenueMission ? 'Operating' : 'Bootstrapping',
      sub: revenueMission ? 'REV-001 is loaded' : 'mission seed pending',
      tone: revenueMission ? 'positive' : 'guarded',
    },
    {
      label: 'Commercial score',
      value: revenueMission ? `${missionScore}/100` : '—',
      sub: revenueMission ? currentStage : 'not assessed',
      tone: missionScore >= 75 ? 'positive' : missionScore >= 65 ? 'guarded' : 'neutral',
    },
    {
      label: 'Operating mode',
      value: currentMode,
      sub: buildAllowed ? 'evidence gate passed' : 'production remains locked',
      tone: buildAllowed ? 'positive' : 'guarded',
    },
    {
      label: 'Agent runtimes',
      value: `${onlineAgents}/${totalAgents}`,
      sub: onlineAgents > 0 ? 'available now' : 'local runtime required',
      tone: onlineAgents > 0 ? 'positive' : 'offline',
    },
    {
      label: 'Model gateway',
      value: status?.ok ? 'Online' : 'Offline',
      sub: status?.ok ? short(status.routedModel || status.model) : status?.error?.slice(0, 34) || 'FCC unavailable',
      tone: status?.ok ? 'positive' : 'offline',
    },
    {
      label: 'Control-plane pulse',
      value: String(ticks).padStart(2, '0'),
      sub: 'local poll · every 10s',
      tone: 'neutral',
    },
  ];

  return (
    <div className="mission">
      <section className="mission-hero">
        <div className="mission-hero-copy">
          <div className="mission-eyebrow">
            <span className="mission-live-dot" /> Owner cockpit · local control plane
          </div>
          <h2>{companyName}</h2>
          <p>{companyMission}</p>
          <div className="mission-command">
            <span>Current command</span>
            <strong>Prove one painful workflow, earn one legitimate payment, then compound.</strong>
          </div>
        </div>

        <div className="mission-score-panel" aria-label={`Commercial score ${missionScore} of 100`}>
          <div className="mission-score-head">
            <span>REV-001</span>
            <span className={`mission-mode ${buildAllowed ? 'allowed' : 'guarded'}`}>{currentMode}</span>
          </div>
          <div className="mission-score-value">
            <strong>{revenueMission ? missionScore : '—'}</strong>
            <span>/ 100</span>
          </div>
          <div className="mission-progress" aria-hidden="true">
            <span style={{ width: `${missionScore}%` }} />
          </div>
          <div className="mission-score-foot">
            <span>{currentStage}</span>
            <span>{nextAction(revenueMission, buildAllowed)}</span>
          </div>
        </div>
      </section>

      <section className="mission-metrics" aria-label="Company status">
        {tiles.map((tile) => (
          <div className={`mission-metric ${tile.tone}`} key={tile.label}>
            <div className="mission-metric-label">
              <span className="mission-metric-led" />
              {tile.label}
            </div>
            <div className="mission-metric-value">{tile.value}</div>
            <div className="mission-metric-sub">{tile.sub}</div>
          </div>
        ))}
      </section>

      <div className="section-label">Active revenue objective</div>
      <section className="mission-objective">
        <div className="mission-objective-main">
          <div className="mission-objective-head">
            <div>
              <span className="mission-kicker">FIRST COMMERCIAL WEDGE</span>
              <h3>{revenueMission?.title || 'REV-001 — Validate the AI Workflow Revenue Sprint'}</h3>
            </div>
            <span className={`agent-pill ${revenueMission ? 'on' : 'off'}`}>
              {revenueMission ? currentStage : 'pending'}
            </span>
          </div>
          <p>
            Sell one fixed-scope, human-approved intake and follow-up workflow to a Swedish
            installation or field-service firm before building an unvalidated SaaS product.
          </p>
          <div className="mission-offer-facts">
            <div>
              <span>Buyer</span>
              <strong>Installation / field service · 5–49 employees</strong>
            </div>
            <div>
              <span>Founder price</span>
              <strong>6,900 SEK excl. VAT</strong>
            </div>
            <div>
              <span>Workflow</span>
              <strong>Inquiry → draft → approval → follow-up</strong>
            </div>
            <div>
              <span>Primary proof</span>
              <strong>One paid pilot with measured outcome</strong>
            </div>
          </div>
        </div>

        <aside className="mission-objective-aside">
          <span className="mission-kicker">BUILD PERMISSION</span>
          <strong>{buildAllowed ? 'OPEN' : 'LOCKED'}</strong>
          <p>
            {buildAllowed
              ? 'Commercial evidence is sufficient for the bounded production scope.'
              : 'Complete pain, price, prospect, feasibility, acquisition, and risk evidence first.'}
          </p>
          <div className={`mission-lock-state ${buildAllowed ? 'open' : 'locked'}`}>
            <span>{buildAllowed ? '◇' : '◆'}</span>
            {buildAllowed ? 'Production gate passed' : 'Validation artifacts only'}
          </div>
        </aside>
      </section>

      <div className="section-label">Operating chain</div>
      <section className="mission-flow" aria-label="Revenue mission operating chain">
        {FLOW_STEPS.map((step, index) => {
          const state = index < activeFlowIndex ? 'complete' : index === activeFlowIndex ? 'current' : 'locked';
          return (
            <div className={`mission-flow-step ${state}`} key={step.label}>
              <div className="mission-flow-index">{String(index + 1).padStart(2, '0')}</div>
              <div>
                <strong>{step.label}</strong>
                <span>{step.detail}</span>
              </div>
            </div>
          );
        })}
      </section>

      <div className="section-label">AI employees · open a role runtime</div>
      <section className="agent-cards" aria-label="Company employees">
        {roles.map((role) => {
          const runtime = ov?.agents.find((agent) => agent.id === role.agent);
          return (
            <button
              key={role.id}
              className="agent-card company-agent-card"
              onClick={() => onOpenAgent(role.agent)}
              aria-label={`Open ${role.title}`}
            >
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
      </section>

      <div className="section-label">Owner approval gates</div>
      <section className="mission-gates" aria-label="Actions locked to the owner">
        {(ownerGates.length ? ownerGates : DEFAULT_OWNER_GATES).map((gate) => (
          <div className="mission-gate" key={gate}>
            <span className="mission-gate-icon">◆</span>
            <div>
              <strong>LOCKED</strong>
              <span>{gate}</span>
            </div>
          </div>
        ))}
      </section>

      <div className="section-label">System evidence</div>
      <section className="mission-signals" aria-label="System evidence counters">
        <Stat n={ov?.stats.pipeline} label="pipeline items" />
        <Stat n={ov?.stats.projects} label="isolated projects" />
        <Stat n={ov?.stats.notes} label="memory notes" />
        <Stat n={ov?.stats.conversations} label="conversations" />
        <Stat n={ov?.stats.messages} label="messages" />
      </section>
    </div>
  );
}

function Stat({ n, label }: { n?: number; label: string }) {
  return (
    <div className="mission-signal">
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

function flowIndex(stage: PipelineItem['stage']): number {
  switch (stage) {
    case 'capture':
      return 0;
    case 'gate':
      return 2;
    case 'execute':
      return 3;
    case 'shipped':
      return FLOW_STEPS.length;
  }
}

function nextAction(item: PipelineItem | null, buildAllowed: boolean): string {
  if (!item) return 'Load the first governed mission';
  if (item.stage === 'capture') return 'Shape and red-team the thesis';
  if (item.stage === 'gate' && !buildAllowed) return 'Close evidence gaps; run validation only';
  if (item.stage === 'gate') return 'Owner reviews bounded build permission';
  if (item.stage === 'execute') return 'Produce deterministic delivery evidence';
  return 'Measure customer outcome and compound the reusable kit';
}
