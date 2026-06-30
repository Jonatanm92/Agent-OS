import { useState, useEffect } from 'react';
import type { Project } from '../api';
import { api } from '../api';

export function ProjectPill({
  projects,
  activeProjectId,
  onChange,
  onCreate,
}: {
  projects: Project[];
  activeProjectId: string;
  onChange: (id: string) => void;
  onCreate: (name: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [showTpl, setShowTpl] = useState(false);
  const [tpls, setTpls] = useState<{ id: string; name: string; description: string }[]>([]);

  useEffect(() => {
    api.listTemplates().then(({ templates }) => setTpls(templates)).catch(() => {});
  }, []);

  const scaffoldTpl = async (tplId: string) => {
    const tplName = prompt('Project name?', tpls.find((t) => t.id === tplId)?.name ?? '');
    if (!tplName) return;
    const { projectId } = await api.scaffold(tplId, tplName);
    onChange(projectId);
    setShowTpl(false);
  };

  return (
    <div className="project-pill">
      <span className="project-pill-label">Active project</span>
      <select value={activeProjectId} onChange={(e) => onChange(e.target.value)}>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {creating ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) {
              onCreate(name.trim());
              setName('');
              setCreating(false);
            }
          }}
        >
          <input
            autoFocus
            placeholder="new-project"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setCreating(false)}
          />
        </form>
      ) : (
        <>
          <button className="ghost-btn" onClick={() => setCreating(true)} title="New empty project">
            +
          </button>
          <button className="ghost-btn" onClick={() => setShowTpl((s) => !s)} title="Scaffold from template">
            ⧫
          </button>
        </>
      )}
      {showTpl && (
        <div className="tpl-dropdown">
          {tpls.map((t) => (
            <button key={t.id} className="tpl-item" onClick={() => scaffoldTpl(t.id)}>
              <span className="tpl-name">{t.name}</span>
              <span className="tpl-desc">{t.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
