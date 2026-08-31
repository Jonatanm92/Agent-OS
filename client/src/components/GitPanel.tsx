import { useEffect, useState } from 'react';
import { api } from '../api';

interface GitView {
  initialized: boolean;
  branch: string;
  files: { path: string; status: string }[];
  log: string[];
  remotes: string[];
  mutationsEnabled?: boolean;
}

/**
 * Read-only repository evidence.
 *
 * Workspaces are untrusted. Commit/push/init remain outside the autonomous
 * dashboard and are promoted through the owner-reviewed repository PR workflow.
 */
export function GitPanel({ projectId }: { projectId: string }) {
  const [state, setState] = useState<GitView | null>(null);
  const [diffText, setDiffText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setState(await api.gitStatus(projectId));
      setError(null);
    } catch (cause) {
      setState(null);
      setError(cause instanceof Error ? cause.message : 'Git status unavailable');
    }
  };

  useEffect(() => {
    setDiffText(null);
    refresh();
  }, [projectId]);

  const showDiff = async () => {
    try {
      const { diff } = await api.gitDiff(projectId);
      setDiffText(diff);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Diff unavailable');
    }
  };

  if (!state && !error) return null;

  return (
    <div className="git-panel">
      <div className="git-head">
        <span className="git-icon">⎇</span>
        <span className="git-branch">
          {state?.initialized ? state.branch || 'detached HEAD' : 'not a repository'}
        </span>
        {state?.initialized && (
          <span className="muted tiny">{state.files.length} changed · read-only</span>
        )}
      </div>

      {state?.initialized ? (
        <>
          {state.files.length > 0 && (
            <div className="git-files">
              {state.files.slice(0, 12).map((file) => (
                <div key={`${file.status}:${file.path}`} className="git-file">
                  <span className="git-st">{file.status || '·'}</span>
                  <span className="git-fp">{file.path}</span>
                </div>
              ))}
            </div>
          )}
          <div className="git-actions">
            <button className="ghost-btn small-btn" onClick={showDiff}>
              Review diff
            </button>
            <span className="muted tiny">Commit and push require the owner PR gate.</span>
          </div>
          {diffText !== null && <pre className="git-diff">{diffText}</pre>}
          {state.log.length > 0 && (
            <div className="git-log">
              {state.log.slice(0, 5).map((line) => (
                <div key={line} className="muted tiny">{line}</div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="muted tiny">
          Repository mutation is deliberately unavailable in autonomous workspaces.
        </p>
      )}

      {error && <p className="muted tiny">{error}</p>}
    </div>
  );
}
