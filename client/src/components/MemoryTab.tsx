import { useEffect, useState } from 'react';
import { api, type NoteSummary } from '../api';

export function MemoryTab() {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    const { notes } = await api.listNotes();
    setNotes(notes);
  };

  useEffect(() => {
    refresh();
  }, []);

  const open = async (path: string) => {
    const { content } = await api.readNote(path);
    setSelected(path);
    setContent(content);
    setDirty(false);
  };

  const newNote = () => {
    const name = prompt('Note path (e.g. people/clients.md):', 'note.md');
    if (!name) return;
    setSelected(name);
    setContent(`# ${name.replace(/\.md$/, '')}\n\n`);
    setDirty(true);
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.saveNote(selected, content);
      setDirty(false);
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="memory">
      <div className="mem-list">
        <button className="primary-btn full" onClick={newNote}>
          + New note
        </button>
        <div className="mem-notes">
          {notes.map((n) => (
            <div
              key={n.path}
              className={`mem-note ${selected === n.path ? 'active' : ''}`}
              onClick={() => open(n.path)}
            >
              <span className="mem-name">{n.path}</span>
              <span className="muted tiny">{(n.size / 1024).toFixed(1)} kb</span>
            </div>
          ))}
          {notes.length === 0 && (
            <p className="muted small">
              Vault is empty. Notes here are injected into chat as memory and open in Obsidian.
            </p>
          )}
        </div>
      </div>

      <div className="mem-editor">
        {!selected && (
          <div className="empty">
            <p className="muted">Select or create a note. This is your plain-markdown memory.</p>
          </div>
        )}
        {selected && (
          <>
            <div className="mem-editor-bar">
              <span className="mem-editor-name">{selected}</span>
              <button className="primary-btn" onClick={save} disabled={!dirty || saving}>
                {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
              </button>
            </div>
            <textarea
              className="mem-textarea"
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setDirty(true);
              }}
              spellCheck={false}
            />
          </>
        )}
      </div>
    </div>
  );
}
