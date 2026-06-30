import { useEffect, useState } from 'react';
import { api, type Project, type WorkspaceFile } from '../api';

export function WorkspaceTab({ activeProject }: { activeProject?: Project }) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selected, setSelected] = useState<WorkspaceFile | null>(null);
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [source, setSource] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');

  const refresh = async () => {
    if (!activeProject) return;
    const { files } = await api.listFiles(activeProject.id);
    setFiles(files);
    if (selected && !files.find((f) => f.path === selected.path)) setSelected(null);
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id]);

  // Load file contents when a file is opened (don't clobber unsaved edits).
  useEffect(() => {
    if (selected && activeProject) {
      fetch(api.fileUrl(activeProject.id, selected.path))
        .then((r) => r.text())
        .then((t) => {
          setSource(t);
          setDirty(false);
        })
        .catch(() => setSource('(could not read file)'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.path, activeProject?.id]);

  const save = async () => {
    if (!activeProject || !selected) return;
    setSaving(true);
    try {
      await api.writeFile(activeProject.id, selected.path, source);
      setDirty(false);
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const createFile = async () => {
    if (!activeProject || !newName.trim()) return;
    const path = newName.trim();
    await api.writeFile(activeProject.id, path, '');
    setNewName('');
    await refresh();
    setSelected({ name: path, path, size: 0, modified: '', kind: 'source' });
    setMode('source');
  };

  if (!activeProject) {
    return (
      <div className="empty">
        <p className="muted">No active project. Pick one from the pill at the top right.</p>
      </div>
    );
  }

  const editable = mode === 'source' || selected?.kind === 'source';

  return (
    <div className="workspace">
      <div className="ws-files">
        <div className="ws-files-head">
          <span>{activeProject.name}</span>
          <button className="ghost-btn" onClick={refresh} title="Refresh">↻</button>
        </div>
        <p className="muted tiny path">{activeProject.path}</p>
        <form
          className="ws-new"
          onSubmit={(e) => {
            e.preventDefault();
            createFile();
          }}
        >
          <input
            value={newName}
            placeholder="new-file.js"
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="ghost-btn small-btn" type="submit">+ file</button>
        </form>
        <div className="ws-file-list">
          {files.map((f) => (
            <div
              key={f.path}
              className={`ws-file ${selected?.path === f.path ? 'active' : ''}`}
              onClick={() => {
                setSelected(f);
                setMode(f.kind === 'source' ? 'source' : 'preview');
              }}
            >
              <span className={`ws-kind ${f.kind}`}>{kindIcon(f.kind)}</span>
              <span className="ws-name">{f.path}</span>
            </div>
          ))}
          {files.length === 0 && (
            <p className="muted small">Empty. Files the agent writes appear here — or create one above.</p>
          )}
        </div>
      </div>

      <div className="ws-preview">
        {!selected && <div className="empty"><p className="muted">Select or create a file.</p></div>}
        {selected && (
          <>
            <div className="ws-preview-bar">
              <span className="ws-preview-name">{selected.path}</span>
              <div className="ws-bar-right">
                {selected.kind !== 'source' && (
                  <div className="toggle">
                    <button className={mode === 'preview' ? 'on' : ''} onClick={() => setMode('preview')}>
                      Preview
                    </button>
                    <button className={mode === 'source' ? 'on' : ''} onClick={() => setMode('source')}>
                      Edit
                    </button>
                  </div>
                )}
                {editable && (
                  <button className="primary-btn small-btn" onClick={save} disabled={!dirty || saving}>
                    {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
                  </button>
                )}
              </div>
            </div>
            <div className="ws-preview-body">
              {mode === 'preview' && selected.kind === 'html' && (
                <iframe
                  className="preview-frame"
                  src={api.fileUrl(activeProject.id, selected.path)}
                  title={selected.path}
                  sandbox="allow-scripts"
                />
              )}
              {mode === 'preview' && selected.kind === 'image' && (
                <div className="img-wrap">
                  <img src={api.fileUrl(activeProject.id, selected.path)} alt={selected.path} />
                </div>
              )}
              {editable && (
                <textarea
                  className="code-editor"
                  value={source}
                  spellCheck={false}
                  onChange={(e) => {
                    setSource(e.target.value);
                    setDirty(true);
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function kindIcon(kind: WorkspaceFile['kind']): string {
  if (kind === 'html') return '◳';
  if (kind === 'image') return '▦';
  return '≣';
}
