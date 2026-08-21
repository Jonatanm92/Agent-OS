export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatMoney(cents, currency = 'USD') {
  const value = (Number(cents) || 0) / 100;
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value); }
  catch { return `${value.toFixed(2)} ${currency}`; }
}

export function formatDate(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(value));
  } catch { return String(value); }
}

export function className(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
}

export function activeMission(state) {
  return state?.missions?.find((mission) => mission.status === 'active') || state?.missions?.[0] || null;
}
