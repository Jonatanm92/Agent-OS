import { useCallback, useEffect, useMemo, useState } from 'react';
import mondaySdk from 'monday-sdk-js';

import { buildDeadlineChanges, filterChanges, summarizeChanges } from './lib/activity.js';

const monday = mondaySdk();
monday.setApiVersion('2026-07');

const REASONS_KEY = 'deadline-ledger-reasons-v1';
const REASON_CATEGORIES = ['Scope', 'Client', 'Dependency', 'Resource', 'Risk', 'Correction', 'Other'];
const STORAGE_RETRY_LIMIT = 3;
const ACTIVITY_PAGE_SIZE = 500;
const MAX_ACTIVITY_PAGES = 10;

function formatDateTime(value) {
  if (!value) return 'Unknown time';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function decodeReasons(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function readReasonStore() {
  const result = await monday.storage.instance.getItem(REASONS_KEY);
  return {
    reasons: decodeReasons(result?.data?.value),
    version: result?.data?.version || '',
  };
}

function isVersionConflict(errorLike) {
  const text = String(
    errorLike?.data?.error || errorLike?.message || errorLike?.error || errorLike || '',
  ).toLowerCase();
  return text.includes('version mismatch');
}

async function saveReasonWithConcurrency(changeId, entry) {
  for (let attempt = 0; attempt < STORAGE_RETRY_LIMIT; attempt += 1) {
    const current = await readReasonStore();
    const next = {
      ...current.reasons,
      [changeId]: entry,
    };

    try {
      const options = current.version ? { previous_version: current.version } : undefined;
      const result = await monday.storage.instance.setItem(
        REASONS_KEY,
        JSON.stringify(next),
        options,
      );

      if (result?.data?.success === false) {
        if (isVersionConflict(result)) continue;
        throw new Error(result?.data?.error || 'Storage write failed.');
      }

      return next;
    } catch (error) {
      if (isVersionConflict(error) && attempt < STORAGE_RETRY_LIMIT - 1) continue;
      throw error;
    }
  }
  throw new Error('Reason storage changed repeatedly. Refresh and try again.');
}

async function fetchBoardActivity(boardId) {
  const query = `query DeadlineLedgerActivity($boardId: [ID!], $page: Int!) {
    boards(ids: $boardId) {
      id
      name
      activity_logs(limit: ${ACTIVITY_PAGE_SIZE}, page: $page) {
        id
        event
        data
        user_id
        created_at
      }
    }
  }`;

  const logs = [];
  let boardName = 'Current board';
  let truncated = false;

  for (let page = 1; page <= MAX_ACTIVITY_PAGES; page += 1) {
    const result = await monday.api(query, {
      variables: { boardId: [String(boardId)], page },
    });
    const board = result?.data?.boards?.[0];
    if (!board) throw new Error('This board could not be read. Check app permissions and board access.');

    boardName = board.name || boardName;
    const pageLogs = board.activity_logs || [];
    logs.push(...pageLogs);

    if (pageLogs.length < ACTIVITY_PAGE_SIZE) {
      truncated = false;
      break;
    }
    if (page === MAX_ACTIVITY_PAGES) truncated = true;
  }

  return { boardName, logs, truncated };
}

function Metric({ label, value, detail, danger = false }) {
  return (
    <div className={`metric ${danger ? 'metric--danger' : ''}`}>
      <div className="metric__label">{label}</div>
      <div className="metric__value">{value}</div>
      <div className="metric__detail">{detail}</div>
    </div>
  );
}

function ReasonEditor({ change, onSave, onCancel, saving }) {
  const [reason, setReason] = useState(change.reason || '');
  const [category, setCategory] = useState(change.reasonCategory || '');
  const canSave = reason.trim().length >= 3 && !saving;

  return (
    <div className="reason-editor" role="dialog" aria-label="Record deadline change reason">
      <div className="reason-editor__title">Record why this deadline moved</div>
      <div className="reason-editor__hint">
        {change.itemName} · {change.columnTitle} · {change.previousValue} → {change.nextValue}
      </div>
      <label>
        Category
        <select value={category} onChange={(event) => setCategory(event.target.value)} disabled={saving}>
          <option value="">Choose a category</option>
          {REASON_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label>
        Reason
        <textarea
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Example: Client approval moved from Friday to Tuesday."
          rows={3}
          disabled={saving}
        />
      </label>
      <div className="reason-editor__actions">
        <button type="button" className="button button--ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button
          type="button"
          className="button button--primary"
          disabled={!canSave}
          onClick={() => onSave({ reason: reason.trim(), category })}
        >
          {saving ? 'Saving…' : 'Save reason'}
        </button>
      </div>
    </div>
  );
}

function ChangeRow({ change, userName, isEditing, onEdit, onSave, onCancel, saving, readOnly }) {
  return (
    <article className={`change-row ${change.needsReason ? 'change-row--missing' : ''}`}>
      <div className="change-row__main">
        <div className="change-row__topline">
          <span className="change-row__item">{change.itemName}</span>
          <span className="change-row__column">{change.columnTitle}</span>
          <span className="change-row__count">change #{change.sequence}</span>
        </div>
        <div className="change-row__values">
          <span className="value value--old">{change.previousValue}</span>
          <span className="arrow">→</span>
          <span className="value value--new">{change.nextValue}</span>
        </div>
        <div className="change-row__meta">
          {formatDateTime(change.occurredAt)} · {userName || (change.userId ? `User ${change.userId}` : 'Unknown user')}
        </div>
      </div>

      <div className="change-row__governance">
        {change.needsReason ? (
          <>
            <span className="badge badge--danger">Reason missing</span>
            {!readOnly && !isEditing && <button className="button button--small" type="button" onClick={onEdit}>Add reason</button>}
          </>
        ) : (
          <>
            <span className="badge badge--ok">Reason recorded</span>
            <div className="reason-summary">
              {change.reasonCategory && <strong>{change.reasonCategory}: </strong>}
              {change.reason}
            </div>
            {!readOnly && !isEditing && <button className="link-button" type="button" onClick={onEdit}>Edit</button>}
          </>
        )}
      </div>

      {!readOnly && isEditing && (
        <ReasonEditor
          change={change}
          onSave={onSave}
          onCancel={onCancel}
          saving={saving}
        />
      )}
    </article>
  );
}

export default function App() {
  const [context, setContext] = useState(null);
  const [boardName, setBoardName] = useState('Current board');
  const [logs, setLogs] = useState([]);
  const [reasons, setReasons] = useState({});
  const [users, setUsers] = useState({});
  const [filter, setFilter] = useState('missing');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState('');
  const [savingId, setSavingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [activityTruncated, setActivityTruncated] = useState(false);

  const isViewOnly = Boolean(context?.user?.isViewOnly);
  const changes = useMemo(() => buildDeadlineChanges(logs, reasons), [logs, reasons]);
  const summary = useMemo(() => summarizeChanges(changes), [changes]);
  const visibleChanges = useMemo(() => filterChanges(changes, filter, search), [changes, filter, search]);

  const loadReasons = useCallback(async () => {
    try {
      const stored = await readReasonStore();
      setReasons(stored.reasons);
    } catch {
      setReasons({});
    }
  }, []);

  const loadUsers = useCallback(async (userIds) => {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return;
    try {
      const result = await monday.api(
        `query DeadlineLedgerUsers($ids: [ID!]) { users(ids: $ids) { id name } }`,
        { variables: { ids } },
      );
      const next = {};
      for (const user of result?.data?.users || []) next[String(user.id)] = user.name;
      setUsers(next);
    } catch {
      setUsers({});
    }
  }, []);

  const loadBoard = useCallback(async (boardId) => {
    if (!boardId) return;
    setLoading(true);
    setError('');
    try {
      const activity = await fetchBoardActivity(boardId);
      setBoardName(activity.boardName);
      setLogs(activity.logs);
      setActivityTruncated(activity.truncated);
      await loadUsers(activity.logs.map((log) => String(log.user_id || '')));
      setLastLoadedAt(new Date());
    } catch (err) {
      setError(err?.message || 'Deadline Ledger could not load this board.');
    } finally {
      setLoading(false);
    }
  }, [loadUsers]);

  useEffect(() => {
    let active = true;
    Promise.all([monday.get('context'), loadReasons()]).then(([contextResult]) => {
      if (!active) return;
      const nextContext = contextResult?.data || {};
      setContext(nextContext);
      if (nextContext.boardId) loadBoard(nextContext.boardId);
      else setLoading(false);
    }).catch(() => {
      if (active) {
        setLoading(false);
        setError('Could not read monday board context.');
      }
    });
    return () => { active = false; };
  }, [loadBoard, loadReasons]);

  const saveReason = useCallback(async (change, payload) => {
    if (isViewOnly) {
      setError('View-only users can inspect deadline governance but cannot record or edit reasons.');
      return;
    }

    const entry = {
      reason: payload.reason,
      category: payload.category,
      recordedAt: new Date().toISOString(),
      recordedBy: String(context?.user?.id || context?.userId || ''),
    };
    const previousReasons = reasons;
    const optimisticReasons = { ...reasons, [change.id]: entry };

    setReasons(optimisticReasons);
    setSavingId(change.id);
    setError('');

    try {
      const savedReasons = await saveReasonWithConcurrency(change.id, entry);
      setReasons(savedReasons);
      setEditingId('');
      if (!change.reason) {
        try {
          await monday.execute('valueCreatedForUser');
        } catch {
          // Value-created analytics must never block the core customer action.
        }
      }
    } catch (err) {
      setReasons(previousReasons);
      setError(err?.message || 'Could not save the reason. Refresh and try again.');
    } finally {
      setSavingId('');
    }
  }, [context, isViewOnly, reasons]);

  const refresh = async () => {
    await loadReasons();
    if (context?.boardId) await loadBoard(context.boardId);
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <div className="eyebrow">Deadline governance</div>
          <h1>Deadline Ledger</h1>
          <p>See every date or timeline move, how often it moved, and which changes still have no recorded reason.</p>
        </div>
        <button className="button button--ghost" type="button" onClick={refresh} disabled={loading || !context?.boardId}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <section className="board-strip">
        <div>
          <strong>{boardName}</strong>
          <span>{lastLoadedAt ? `Loaded ${formatDateTime(lastLoadedAt.toISOString())}` : 'Waiting for board data'}</span>
        </div>
        <span className="scope-note">
          {activityTruncated
            ? `Newest ${ACTIVITY_PAGE_SIZE * MAX_ACTIVITY_PAGES} activity rows checked · older history not loaded`
            : `${logs.length} activity rows checked · Date + Timeline changes`}
        </span>
      </section>

      {isViewOnly && (
        <div className="viewer-notice">
          You have view-only access. You can review deadline changes and recorded reasons, but you cannot add or edit a reason.
        </div>
      )}
      {error && <div className="error-box">{error}</div>}

      <section className="metrics" aria-label="Deadline governance summary">
        <Metric label="Deadline changes" value={summary.totalChanges} detail={`${summary.trackedDeadlines} tracked deadline fields`} />
        <Metric label="Impacted items" value={summary.impactedItems} detail={`Max ${summary.maxChangesOnOneDeadline} changes on one deadline`} />
        <Metric label="Missing reasons" value={summary.missingReasons} detail="Needs governance follow-up" danger={summary.missingReasons > 0} />
        <Metric label="Governed" value={`${summary.governedPercent}%`} detail="Changes with a recorded reason" />
      </section>

      <section className="toolbar">
        <div className="segmented" role="group" aria-label="Change filter">
          <button className={filter === 'missing' ? 'active' : ''} type="button" onClick={() => setFilter('missing')}>Missing reason</button>
          <button className={filter === 'all' ? 'active' : ''} type="button" onClick={() => setFilter('all')}>All changes</button>
          <button className={filter === 'reasoned' ? 'active' : ''} type="button" onClick={() => setFilter('reasoned')}>Reasoned</button>
        </div>
        <input
          className="search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search item, column, date, reason…"
          aria-label="Search deadline changes"
        />
      </section>

      <section className="change-list">
        {loading && <div className="empty-state">Reading board activity…</div>}
        {!loading && !visibleChanges.length && (
          <div className="empty-state">
            <strong>No matching deadline changes.</strong>
            <span>{changes.length ? 'Try another filter.' : 'Change a Date or Timeline value on this board, then refresh.'}</span>
          </div>
        )}
        {!loading && visibleChanges.map((change) => (
          <ChangeRow
            key={change.id}
            change={change}
            userName={users[change.userId]}
            isEditing={editingId === change.id}
            onEdit={() => setEditingId(change.id)}
            onCancel={() => setEditingId('')}
            onSave={(payload) => saveReason(change, payload)}
            saving={savingId === change.id}
            readOnly={isViewOnly}
          />
        ))}
      </section>

      <footer className="footer-note">
        MVP boundary: Deadline Ledger audits native date/timeline edits and records governance context. It does not block a native monday date edit yet.
      </footer>
    </main>
  );
}
