export function safeJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function activityTimestampToDate(value) {
  if (!value) return null;
  const text = String(value);
  if (/^\d{17}$/.test(text)) {
    const ms = Number(BigInt(text) / 10000n);
    return Number.isFinite(ms) ? new Date(ms) : null;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeDateObject(value) {
  if (!value || typeof value !== 'object') return '';
  if (value.date) return [value.date, value.time].filter(Boolean).join(' ');
  if (value.from || value.to) return [value.from || '—', value.to || '—'].join(' → ');
  return '';
}

export function displayValue(payload, key) {
  const textualKey = key === 'previous_value' ? 'previous_textual_value' : 'textual_value';
  if (payload?.[textualKey] != null && String(payload[textualKey]).trim()) {
    return String(payload[textualKey]).trim();
  }
  const normalized = normalizeDateObject(payload?.[key]);
  if (normalized) return normalized;
  if (payload?.[key] == null) return '—';
  if (typeof payload[key] === 'string') return payload[key] || '—';
  try {
    return JSON.stringify(payload[key]);
  } catch {
    return '—';
  }
}

export function isDeadlineChange(log) {
  if (log?.event !== 'update_column_value') return false;
  const payload = safeJson(log.data);
  if (!payload) return false;
  const type = String(payload.column_type || '').toLowerCase();
  return type === 'date' || type === 'timeline' || type === 'timerange';
}

export function parseDeadlineChange(log) {
  if (!isDeadlineChange(log)) return null;
  const payload = safeJson(log.data);
  const timestamp = activityTimestampToDate(log.created_at);
  const rawType = String(payload.column_type ?? '').toLowerCase();
  return {
    id: String(log.id ?? `${payload.board_id ?? ''}:${payload.pulse_id ?? ''}:${payload.column_id ?? ''}:${log.created_at ?? ''}`),
    boardId: String(payload.board_id ?? ''),
    itemId: String(payload.pulse_id ?? payload.pulse?.id ?? ''),
    itemName: String(payload.pulse_name ?? payload.pulse?.name ?? 'Untitled item'),
    columnId: String(payload.column_id ?? ''),
    columnTitle: String(payload.column_title ?? 'Date'),
    columnType: rawType === 'timerange' ? 'timeline' : rawType,
    previousValue: displayValue(payload, 'previous_value'),
    nextValue: displayValue(payload, 'value'),
    userId: String(log.user_id ?? ''),
    occurredAt: timestamp ? timestamp.toISOString() : '',
    occurredAtMs: timestamp ? timestamp.getTime() : 0,
  };
}

export function buildDeadlineChanges(logs = [], reasons = {}) {
  const parsed = logs.map(parseDeadlineChange).filter(Boolean);
  const counts = new Map();

  parsed
    .slice()
    .sort((a, b) => a.occurredAtMs - b.occurredAtMs)
    .forEach((change) => {
      const key = `${change.itemId}:${change.columnId}`;
      const count = (counts.get(key) || 0) + 1;
      counts.set(key, count);
      change.sequence = count;
    });

  return parsed
    .map((change) => {
      const reason = reasons[change.id] || {};
      const createdAt = reason.createdAt || reason.recordedAt || '';
      const createdBy = reason.createdBy || reason.recordedBy || '';
      const updatedAt = reason.updatedAt || reason.recordedAt || createdAt;
      const updatedBy = reason.updatedBy || reason.recordedBy || createdBy;
      return {
        ...change,
        reason: reason.reason || '',
        reasonCategory: reason.category || '',
        reasonCreatedAt: createdAt,
        reasonCreatedBy: createdBy,
        reasonUpdatedAt: updatedAt,
        reasonUpdatedBy: updatedBy,
        reasonRevision: Number(reason.revision || (reason.reason ? 1 : 0)),
        needsReason: !String(reason.reason || '').trim(),
      };
    })
    .sort((a, b) => b.occurredAtMs - a.occurredAtMs);
}

export function summarizeChanges(changes = []) {
  const itemIds = new Set(changes.map((c) => c.itemId).filter(Boolean));
  const missing = changes.filter((c) => c.needsReason).length;
  const changedPairs = new Set(changes.map((c) => `${c.itemId}:${c.columnId}`));
  const maxSequence = changes.reduce((max, c) => Math.max(max, Number(c.sequence) || 0), 0);

  return {
    totalChanges: changes.length,
    impactedItems: itemIds.size,
    missingReasons: missing,
    governedPercent: changes.length ? Math.round(((changes.length - missing) / changes.length) * 100) : 100,
    trackedDeadlines: changedPairs.size,
    maxChangesOnOneDeadline: maxSequence,
  };
}

export function filterChanges(changes, filter, search = '') {
  const needle = search.trim().toLowerCase();
  return changes.filter((change) => {
    if (filter === 'missing' && !change.needsReason) return false;
    if (filter === 'reasoned' && change.needsReason) return false;
    if (!needle) return true;
    return [
      change.itemName,
      change.columnTitle,
      change.previousValue,
      change.nextValue,
      change.reason,
      change.reasonCategory,
    ].some((value) => String(value || '').toLowerCase().includes(needle));
  });
}
