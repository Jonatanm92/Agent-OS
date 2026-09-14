import { useEffect, useState } from 'react';
import { api, type PipelineItem, type PipelineStage } from '../api';

const COLUMNS: { stage: PipelineStage; label: string; sub: string }[] = [
  { stage: 'capture', label: 'Capture', sub: 'Raw input — no structure' },
  { stage: 'gate', label: 'Human Gate', sub: 'The one checkpoint' },
  { stage: 'execute', label: 'Execute', sub: 'Agent builds it' },
  { stage: 'shipped', label: 'Shipped & Filed', sub: 'Done — in your vault' },
];

export function PipelineTab({ onOpenProject }: { onOpenProject?: (projectId: string) => void }) {
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [idea, setIdea] = useState('');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [capturing, setCapturing] = useState(false);
  const [viewing, setViewing] = useState<PipelineItem | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const { items } = await api.listPipeline();
      setItems(items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to load');
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // Close the "what was built" modal with Escape (keyboard users).
  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewing(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewing]);

  const setItemBusy = (id: string, v: boolean) => setBusy((b) => ({ ...b, [id]: v }));

  const capture = async () => {
    const text = idea.trim();
    if (!text || capturing) return;
    setCapturing(true);
    setErr(null);
    try {
      await api.capturePipeline(text);
      setIdea('');
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'capture failed');
    } finally {
      setCapturing(false);
    }
  };

  const act = async (id: string, fn: (id: string) => Promise<unknown>) => {
    setItemBusy(id, true);
    setErr(null);
    try {
      await fn(id);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'action failed');
    } finally {
      setItemBusy(id, false);
    }
  };

  const byStage = (s: PipelineStage) => items.filter((i) => i.stage === s);

  return (
    <div className="pipeline">
      <div className="pipeline-capture">
        <input
          value={idea}
          placeholder="Drop an idea — a project, a thought, a link, anything. Agents take it from here…"
          aria-label="Capture a new idea"
          onChange={(e) => setIdea(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && capture()}
        />
        <button className="primary-btn" onClick={capture} disabled={capturing || !idea.trim()}>
          {capturing ? 'Capturing…' : 'Capture'}
        </button>
      </div>
      {err && <div className="banner error" role="alert" style={{ margin: '0 16px' }}>{err}</div>}

      <div className="pipeline-board">
        {COLUMNS.map((col) => {
          const colItems = byStage(col.stage);
          return (
            <div className="pipe-col" key={col.stage}>
              <div className="pipe-col-head">
                <span className="pipe-col-title">{col.label}</span>
                <span className="pipe-col-count">{colItems.length}</span>
              </div>
              <div className="pipe-col-sub">{col.sub}</div>
              <div className="pipe-col-body">
                {colItems.map((it) => (
                  <div className="pipe-card" key={it.id}>
                    <div className="pipe-card-top">
                      <span className="pipe-card-title">{it.title}</span>
                      <button className="del" title="Delete" aria-label={`Delete ${it.title}`} onClick={() => act(it.id, api.deletePipeline)}>
                        <span aria-hidden="true">×</span>
                      </button>
                    </div>
                    {(it.score > 0 || it.tags.length > 0) && (
                      <div className="pipe-tags">
                        {it.score > 0 && <span className="pipe-score">{it.item_type} {it.score}%</span>}
                        {it.tags.map((t) => (
                          <span key={t} className="pipe-tag">#{t}</span>
                        ))}
                      </div>
                    )}

                    {col.stage === 'capture' && (
                      <button className="pipe-action shape" disabled={busy[it.id]} onClick={() => act(it.id, api.shapePipeline)}>
                        {busy[it.id] ? 'Shaping…' : 'Shape it →'}
                      </button>
                    )}
                    {col.stage === 'gate' && (
                      <>
                        {it.plan && <pre className="pipe-plan">{it.plan}</pre>}
                        <button className="pipe-action approve" disabled={busy[it.id]} onClick={() => act(it.id, api.approvePipeline)}>
                          ✓ Approve
                        </button>
                      </>
                    )}
                    {col.stage === 'execute' && (
                      <button className="pipe-action build" disabled={busy[it.id]} onClick={() => act(it.id, api.executePipeline)}>
                        {busy[it.id] ? 'Building…' : '🛠 Build the deliverable'}
                      </button>
                    )}
                    {col.stage === 'shipped' && (
                      <div className="pipe-shipped-actions">
                        <button className="pipe-action view" onClick={() => setViewing(it)}>
                          ▸ View what was built
                        </button>
                        {it.project_id && onOpenProject && (
                          <button className="pipe-action open" onClick={() => onOpenProject(it.project_id!)}>
                            ⇢ Open in Workspace
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {colItems.length === 0 && <p className="muted tiny pipe-empty">—</p>}
              </div>
            </div>
          );
        })}
      </div>

      {viewing && (
        <div className="modal-scrim" onClick={() => setViewing(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pipe-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <strong id="pipe-modal-title">{viewing.title}</strong>
              <button className="del" aria-label="Close" onClick={() => setViewing(null)}><span aria-hidden="true">×</span></button>
            </div>
            {viewing.plan && (
              <>
                <div className="muted tiny">PLAN</div>
                <pre className="modal-pre">{viewing.plan}</pre>
              </>
            )}
            <div className="muted tiny">DELIVERABLE</div>
            <pre className="modal-pre">{viewing.deliverable || '(nothing recorded)'}</pre>
            <p className="muted tiny">Filed to your vault under Pipeline/. Files are in the Workspace tab.</p>
          </div>
        </div>
      )}
    </div>
  );
}
