import { useEffect, useState } from 'react';
import { api } from '../api';

export function GitPanel({ projectId }: { projectId: string }) {
  const [st, setSt] = useState<{
    initialized: boolean; branch: string;
    files: { path: string; status: string }[];
    log: string[]; remotes: string[];
  } | null>(null);
  const [msg, setMsg] = useState('');
  const [diffText, setDiffText] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);

  const refresh = async () => {
    try { setSt(await api.gitStatus(projectId)); } catch { setSt(null); }
  };

  useEffect(() => { refresh(); }, [projectId]);

  if (!st) return null;

  const doInit = async () => { await api.gitInit(projectId); refresh(); };
  const doDiff = async () => { const { diff } = await api.gitDiff(projectId); setDiffText(diff); };
  const doCommit = async () => {
    if (!msg.trim()) return;
    try { const { output } = await api.gitCommit(projectId, msg); setOutput(output); setMsg(''); refresh(); }
    catch (e) { setOutput(e instanceof Error ? e.message : 'failed'); }
  };
  const doPush = async () => {
    try { const { output } = await api.gitPush(projectId); setOutput(output); }
    catch (e) { setOutput(e instanceof Error ? e.message : 'failed'); }
  };

  return (
    <div className="git-panel">
      <div className="git-head">
        <span className="git-icon">⎇</span>
        <span className="git-branch">{st.initialized ? st.branch || 'no branch' : 'not a repo'}</span>
        {st.initialized && <span className="muted tiny">{st.files.length} changed</span>}
      </div>
      {!st.initialized ? (
        <button className="ghost-btn small-btn" onClick={doInit}>git init</button>
      ) : (
        <>
          {st.files.length > 0 && (
            <div className="git-files">
              {st.files.slice(0, 12).map((f, i) => (
                <div key={i} className="git-file">
                  <span className="git-st">{f.status}</span>
                  <span className="git-fp">{f.path}</span>
                </div>
              ))}
            </div>
          )}
          <div className="git-actions">
            <input value={msg} placeholder="commit message" onChange={(e) => setMsg(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doCommit()} />
            <button className="ghost-btn small-btn" onClick={doCommit}>Commit</button>
            <button className="ghost-btn small-btn" onClick={doDiff}>Diff</button>
            {st.remotes.length > 0 && (
              <button className="ghost-btn small-btn" onClick={doPush}>Push</button>
            )}
          </div>
          {diffText !== null && <pre className="git-diff">{diffText}</pre>}
          {output && <p className="muted tiny">{output}</p>}
          {st.log.length > 0 && (
            <div className="git-log">
              {st.log.slice(0, 5).map((l, i) => <div key={i} className="muted tiny">{l}</div>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
