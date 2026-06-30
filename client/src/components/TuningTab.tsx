import { useEffect, useState } from 'react';
import { api } from '../api';

interface Tuning {
  notes: string[];
  semitones: number;
}

export function TuningTab() {
  const [tunings, setTunings] = useState<Record<string, Tuning>>({});
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api.tunings().then(({ tunings }) => setTunings(tunings)).catch(() => {});
  }, []);

  const entries = Object.entries(tunings);

  return (
    <div className="tuning-tab">
      <div className="tuning-head">
        <h3>Guitar Tuning Reference</h3>
        <p className="muted small">Quick reference for all your tunings. Drop A through Meshuggah F.</p>
      </div>
      <div className="tuning-grid">
        {entries.map(([name, t]) => (
          <button
            key={name}
            className={`tuning-card ${selected === name ? 'active' : ''}`}
            onClick={() => setSelected(selected === name ? null : name)}
          >
            <div className="tuning-name">{name}</div>
            <div className="tuning-notes">{t.notes.join(' ')}</div>
            <div className="tuning-semi">{t.semitones === 0 ? 'standard' : `${t.semitones} semitones`}</div>
          </button>
        ))}
      </div>
      {selected && tunings[selected] && (
        <div className="tuning-detail">
          <h4>{selected}</h4>
          <div className="tuning-strings">
            {tunings[selected].notes.map((n, i) => (
              <div key={i} className="tuning-string">
                <span className="tuning-str-num">{i + 1}</span>
                <span className="tuning-str-note">{n}</span>
                <div className="tuning-str-bar" style={{ width: `${100 - i * 12}%` }} />
              </div>
            ))}
          </div>
          <p className="muted tiny">
            {tunings[selected].semitones === 0
              ? 'Standard tuning.'
              : `${Math.abs(tunings[selected].semitones)} semitones ${tunings[selected].semitones < 0 ? 'down' : 'up'} from standard.`}
          </p>
        </div>
      )}
    </div>
  );
}
