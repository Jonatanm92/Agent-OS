import { useEffect, useState } from 'react';
import { api, type Agent, type Skill, type Loop, type AuditEntry } from '../api';

export function StudioTab({ agents }: { agents: Agent[] }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loops, setLoops] = useState<Loop[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  const refresh = async () => {
    try {
      const [a, b, c] = await Promise.all([api.listSkills(), api.listLoops(), api.listAudit()]);
      setSkills(a.skills);
      setLoops(b.loops);
      setAudit(c.entries);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="studio">
      <div className="studio-col">
        <Skills agents={agents} skills={skills} onChange={refresh} />
      </div>
      <div className="studio-col">
        <Loops agents={agents} loops={loops} onChange={refresh} />
        <Audit entries={audit} />
      </div>
    </div>
  );
}

function agentLabel(agents: Agent[], id: string) {
  return agents.find((a) => a.id === id)?.label ?? id;
}

function Skills({ agents, skills, onChange }: { agents: Agent[]; skills: Skill[]; onChange: () => void }) {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [agentId, setAgentId] = useState('free-claude-code');
  const [runInput, setRunInput] = useState<Record<string, string>>({});
  const [output, setOutput] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const create = async () => {
    if (!name.trim() || !prompt.trim()) return;
    await api.createSkill({ name, prompt, agent_id: agentId });
    setName('');
    setPrompt('');
    onChange();
  };
  const run = async (id: string) => {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      const { output } = await api.runSkill(id, runInput[id] ?? '');
      setOutput((o) => ({ ...o, [id]: output }));
    } catch (e) {
      setOutput((o) => ({ ...o, [id]: e instanceof Error ? e.message : 'failed' }));
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  return (
    <section className="card">
      <h3>🧩 Skills</h3>
      <p className="muted small">Reusable prompts any agent can run. Use <code>{'{{input}}'}</code> as a placeholder.</p>
      <div className="studio-create">
        <input placeholder="Skill name (e.g. Summarize URL)" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea
          rows={3}
          placeholder="Prompt — e.g. Summarize the following in 5 bullets: {{input}}"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="studio-create-row">
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            {agents.filter((a) => a.backend !== 'cli').map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
          <button className="primary-btn small-btn" onClick={create}>+ Create skill</button>
        </div>
      </div>

      <div className="studio-list">
        {skills.map((s) => (
          <div className="studio-item" key={s.id}>
            <div className="studio-item-head">
              <span className="studio-item-name">{s.name}</span>
              <span className="muted tiny">{agentLabel(agents, s.agent_id)}</span>
              <button className="del" onClick={async () => { await api.deleteSkill(s.id); onChange(); }}>×</button>
            </div>
            <div className="studio-run-row">
              <input
                placeholder="input (optional)"
                value={runInput[s.id] ?? ''}
                onChange={(e) => setRunInput((r) => ({ ...r, [s.id]: e.target.value }))}
              />
              <button className="ghost-btn small-btn" disabled={busy[s.id]} onClick={() => run(s.id)}>
                {busy[s.id] ? 'Running…' : '▶ Run'}
              </button>
            </div>
            {output[s.id] && <pre className="studio-output">{output[s.id]}</pre>}
          </div>
        ))}
        {skills.length === 0 && <p className="muted small">No skills yet. Create one above.</p>}
      </div>
    </section>
  );
}

function Loops({ agents, loops, onChange }: { agents: Agent[]; loops: Loop[]; onChange: () => void }) {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [agentId, setAgentId] = useState('free-claude-code');
  const [mins, setMins] = useState('60');

  const create = async () => {
    if (!name.trim() || !prompt.trim()) return;
    await api.createLoop({ name, prompt, agent_id: agentId, interval_minutes: Number(mins) || 60 });
    setName('');
    setPrompt('');
    onChange();
  };

  return (
    <section className="card">
      <h3>🔁 Automation loops</h3>
      <p className="muted small">Scheduled recurring agent tasks. Each run is logged and filed to your vault under Loops/.</p>
      <div className="studio-create">
        <input placeholder="Loop name (e.g. Morning email triage)" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea rows={2} placeholder="Task prompt the agent runs each time" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <div className="studio-create-row">
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            {agents.filter((a) => a.backend !== 'cli').map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
          <span className="muted tiny">every</span>
          <input className="port-input" value={mins} onChange={(e) => setMins(e.target.value)} />
          <span className="muted tiny">min</span>
          <button className="primary-btn small-btn" onClick={create}>+ Create</button>
        </div>
      </div>

      <div className="studio-list">
        {loops.map((l) => (
          <div className="studio-item" key={l.id}>
            <div className="studio-item-head">
              <span className="studio-item-name">{l.name}</span>
              <span className="muted tiny">every {l.interval_minutes}m · {agentLabel(agents, l.agent_id)}</span>
              <button className="del" onClick={async () => { await api.deleteLoop(l.id); onChange(); }}>×</button>
            </div>
            <div className="studio-run-row">
              <label className="memory-toggle">
                <input
                  type="checkbox"
                  checked={!!l.enabled}
                  onChange={async (e) => { await api.toggleLoop(l.id, e.target.checked); onChange(); }}
                />
                {l.enabled ? 'on' : 'off'}
              </label>
              <button className="ghost-btn small-btn" onClick={async () => { await api.runLoop(l.id); onChange(); }}>▶ Run now</button>
              {l.last_run && <span className="muted tiny">last: {new Date(l.last_run).toLocaleTimeString()}</span>}
            </div>
          </div>
        ))}
        {loops.length === 0 && <p className="muted small">No loops yet.</p>}
      </div>
    </section>
  );
}

function Audit({ entries }: { entries: AuditEntry[] }) {
  return (
    <section className="card">
      <h3>📋 Workflow audit</h3>
      <div className="audit-list">
        {entries.map((e) => (
          <div className={`audit-row ${e.status}`} key={e.id}>
            <span className="audit-kind">{e.kind}</span>
            <span className="audit-title">{e.title}</span>
            <span className="muted tiny">{new Date(e.ts).toLocaleTimeString()}</span>
          </div>
        ))}
        {entries.length === 0 && <p className="muted small">No activity yet. Run a skill or loop.</p>}
      </div>
    </section>
  );
}
