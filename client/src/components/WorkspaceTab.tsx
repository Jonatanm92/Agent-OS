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

        <div className="ws-run">
          <div className="ws-run-row">
            <input
              value={runCmd}
              placeholder={run?.suggested || 'npm run dev'}
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
            <span className="muted tiny">localhost:</span>
            <input
              className="port-input"
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
            <button
              className="ghost-btn small-btn"
              onClick={() => window.open(`http://localhost:${port}`, '_blank')}
              title="Open the running app in a new tab"
            >
              ⇗ Preview
            </button>
            <button className="ghost-btn small-btn" onClick={() => setShowLogs((s) => !s)}>
              {showLogs ? 'Hide logs' : 'Logs'}
            </button>
            <span className={`run-led ${run?.running ? 'on' : ''}`} />
          </div>
          {showLogs && (
            <pre className="run-logs">{runLogs.length ? runLogs.join('\n') : '(no output yet)'}</pre>
          )}
        </div>
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
