import { useState } from 'react';
import type { Project } from '../api';

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
        <button className="ghost-btn" onClick={() => setCreating(true)} title="New project">
          +
        </button>
      )}
    </div>
  );
}
