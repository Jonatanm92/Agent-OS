export function createReasonEntry(previous = {}, { reason, category = '', userId = '', now }) {
  const timestamp = now || new Date().toISOString();
  const actor = String(userId || '');
  const previousRevision = Number(previous.revision || (previous.reason ? 1 : 0));

  return {
    ...previous,
    reason: String(reason || '').trim(),
    category: String(category || ''),
    createdAt: previous.createdAt || previous.recordedAt || timestamp,
    createdBy: previous.createdBy || previous.recordedBy || actor,
    updatedAt: timestamp,
    updatedBy: actor,
    revision: previousRevision + 1,
  };
}
