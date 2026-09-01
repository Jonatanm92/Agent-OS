import { useEffect, useState } from 'react';
import { api, type Project, type WorkspaceFile } from '../api';
import { GitPanel } from './GitPanel';

export function WorkspaceTab({ activeProject }: { activeProject?: Project }) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selected, setSelected] = useState<WorkspaceFile | null>(null);
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [source, setSource] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [runCmd, setRunCmd] = useState('');
  const [run, setRun] = useState<{ running: boolean; suggested: string } | null>(null);
  const [runLogs, setRunLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [port, setPort] = useState('5173');

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

  // Poll the run status + logs for the active project.
  useEffect(() => {
    if (!activeProject) return;
    let alive = true;
    const poll = async () => {
      try {
        const st = await api.runStatus(activeProject.id);
        if (!alive) return;
        setRun({ running: st.running, suggested: st.suggested });
        setRunCmd((c) => c || st.command || st.suggested || '');
        if (st.running) {
          const { logs } = await api.runLogs(activeProject.id);
          if (alive) setRunLogs(logs);
        }
      } catch {
        /* ignore */
      }
    };
    poll();
    const t = setInterval(poll, 2500);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id]);

  const toggleRun = async () => {
    if (!activeProject) return;
    if (run?.running) {
      await api.runStop(activeProject.id);
      setRun((r) => (r ? { ...r, running: false } : r));
    } else {
      if (!runCmd.trim()) return;
      await api.runStart(activeProject.id, runCmd.trim());
      setShowLogs(true);
      setRun((r) => (r ? { ...r, running: true } : { running: true, suggested: '' }));
    }
  };

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
          <button className="ghost-btn" onClick={refresh} title="Refresh" aria-label="Refresh file list"><span aria-hidden="true">↻</span></button>
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
            aria-label="New file name"
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="ghost-btn small-btn" type="submit">+ file</button>
        </form>

        <div className="ws-run">
          <div className="ws-run-row">
            <input
              value={runCmd}
              placeholder={run?.suggested || 'npm run dev'}
              aria-label="Run command"
              onChange={(e) => setRunCmd(e.target.value)}
            />
            <button
              className={`ghost-btn small-btn ${run?.running ? 'running' : ''}`}
              onClick={toggleRun}
              title="Start/stop a dev server or command"
            >
              {run?.running ? '■ Stop' : '▶ Run'}
            </button>
          </div>
          <div className="ws-run-row">
            <span className="muted tiny" id="ws-port-label">localhost:</span>
            <input
              className="port-input"
              value={port}
              aria-labelledby="ws-port-label"
              onChange={(e) => setPort(e.target.value)}
            />
            <button
              className="ghost-btn small-btn"
              onClick={() => window.open(`http://localhost:${port}`, '_blank')}
              title="Open the running app in a new tab"
            >
              ⇗ Preview
            </button>
            <button className="ghost-btn small-btn" onClick={() => setShowLogs((s) => !s)} aria-expanded={showLogs} aria-controls="ws-run-logs">
              {showLogs ? 'Hide logs' : 'Logs'}
            </button>
            <span className={`run-led ${run?.running ? 'on' : ''}`} aria-hidden="true" />
          </div>
          {showLogs && (
            <pre className="run-logs" id="ws-run-logs">{runLogs.length ? runLogs.join('\n') : '(no output yet)'}</pre>
          )}
        </div>

        {activeProject && <GitPanel projectId={activeProject.id} />}
        <div className="ws-file-list">
          {files.map((f) => (
            <button
              key={f.path}
              type="button"
              className={`ws-file ${selected?.path === f.path ? 'active' : ''}`}
              aria-current={selected?.path === f.path ? 'true' : undefined}
              onClick={() => {
                setSelected(f);
                setMode(f.kind === 'source' ? 'source' : 'preview');
              }}
            >
              <span className={`ws-kind ${f.kind}`} aria-hidden="true">{kindIcon(f.kind)}</span>
              <span className="ws-name">{f.path}</span>
            </button>
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
                  <div className="toggle" role="group" aria-label="View mode">
                    <button className={mode === 'preview' ? 'on' : ''} aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>
                      Preview
                    </button>
                    <button className={mode === 'source' ? 'on' : ''} aria-pressed={mode === 'source'} onClick={() => setMode('source')}>
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
