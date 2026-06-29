import { useEffect, useState } from 'react';
import { api, type Project, type WorkspaceFile } from '../api';

export function WorkspaceTab({ activeProject }: { activeProject?: Project }) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selected, setSelected] = useState<WorkspaceFile | null>(null);
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [source, setSource] = useState('');

  const refresh = async () => {
    if (!activeProject) return;
    const { files } = await api.listFiles(activeProject.id);
    setFiles(files);
    if (selected && !files.find((f) => f.path === selected.path)) {
      setSelected(null);
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id]);

  useEffect(() => {
    if (selected && (mode === 'source' || selected.kind === 'source') && activeProject) {
      fetch(api.fileUrl(activeProject.id, selected.path))
        .then((r) => r.text())
        .then(setSource)
        .catch(() => setSource('(could not read file)'));
    }
  }, [selected, mode, activeProject]);

  if (!activeProject) {
    return <div className="empty"><p className="muted">No active project.</p></div>;
  }

  return (
    <div className="workspace">
      <div className="ws-files">
        <div className="ws-files-head">
          <span>{activeProject.name}</span>
          <button className="ghost-btn" onClick={refresh} title="Refresh">↻</button>
        </div>
        <p className="muted tiny path">{activeProject.path}</p>
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
            <p className="muted small">
              Empty. Files Free Claude Code writes into this project's folder appear here.
            </p>
          )}
        </div>
      </div>

      <div className="ws-preview">
        {!selected && <div className="empty"><p className="muted">Select a file to preview.</p></div>}
        {selected && (
          <>
            <div className="ws-preview-bar">
              <span className="ws-preview-name">{selected.path}</span>
              {selected.kind !== 'source' && (
                <div className="toggle">
                  <button
                    className={mode === 'preview' ? 'on' : ''}
                    onClick={() => setMode('preview')}
                  >
                    Preview
                  </button>
                  <button
                    className={mode === 'source' ? 'on' : ''}
                    onClick={() => setMode('source')}
                  >
                    Source
                  </button>
                </div>
              )}
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
              {(mode === 'source' || selected.kind === 'source') && (
                <pre className="source-view">{source}</pre>
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
