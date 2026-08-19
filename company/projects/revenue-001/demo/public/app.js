const caseList = document.querySelector('#case-list');
const detailPanel = document.querySelector('#detail-panel');
const filter = document.querySelector('#filter');
const form = document.querySelector('#demo-form');
const toast = document.querySelector('#toast');
let cases = [];
let selectedId = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function badgeClass(level) {
  return level === 'AKUT' ? 'badge-emergency' : level === 'HÖG' ? 'badge-high' : 'badge-normal';
}

function renderMetrics() {
  document.querySelector('#metric-total').textContent = cases.length;
  document.querySelector('#metric-urgent').textContent = cases.filter((item) => item.urgency.level === 'AKUT').length;
  document.querySelector('#metric-missing').textContent = cases.filter((item) => item.missingFields.length > 0).length;
}

function visibleCases() {
  if (filter.value === 'AKUT') return cases.filter((item) => item.urgency.level === 'AKUT');
  if (filter.value === 'missing') return cases.filter((item) => item.missingFields.length > 0);
  return cases;
}

function renderList() {
  const visible = visibleCases();
  caseList.innerHTML = visible.length
    ? visible.map((item) => `
      <button class="case ${item.id === selectedId ? 'active' : ''}" data-id="${escapeHtml(item.id)}">
        <div class="case-top">
          <span class="badge ${badgeClass(item.urgency.level)}">${escapeHtml(item.urgency.level)}</span>
          <span class="case-id">${escapeHtml(item.id)}</span>
        </div>
        <h4>${escapeHtml(item.received.subject || 'Ämne saknas')}</h4>
        <p>${escapeHtml(item.classification.category)} · ${escapeHtml(item.received.location || 'Ort saknas')} · ${item.missingFields.length} luckor</p>
      </button>`).join('')
    : '<div class="empty-state"><p>Inga ärenden matchar filtret.</p></div>';

  caseList.querySelectorAll('[data-id]').forEach((button) => {
    button.addEventListener('click', () => selectCase(button.dataset.id));
  });
}

function renderDetail(item) {
  const missing = item.missingFields.length
    ? item.missingFields.map((field) => `<span class="pill warning">${escapeHtml(field.label)}</span>`).join('')
    : '<span class="pill">Underlaget är komplett för första bedömning</span>';
  const riskFlags = item.riskFlags.length
    ? item.riskFlags.map((flag) => `<span class="pill warning">${escapeHtml(flag)}</span>`).join('')
    : '<span class="pill">Inga extra demo-riskflaggor</span>';

  detailPanel.innerHTML = `
    <div class="detail-head">
      <div>
        <span class="badge ${badgeClass(item.urgency.level)}">${escapeHtml(item.urgency.level)}</span>
        <h3>${escapeHtml(item.received.subject || 'Ämne saknas')}</h3>
        <p>${escapeHtml(item.received.description || 'Beskrivning saknas')}</p>
      </div>
      <div class="confidence"><strong>${Math.round(item.classification.confidence * 100)}%</strong><span>klassificeringssäkerhet</span></div>
    </div>
    <div class="detail-grid">
      <article class="detail-card">
        <h4>Klassificering <span>${escapeHtml(item.classification.category)}</span></h4>
        <div class="pill-list">${item.classification.matchedKeywords.length ? item.classification.matchedKeywords.map((word) => `<span class="pill">${escapeHtml(word)}</span>`).join('') : '<span class="pill warning">Manuell kategorisering behövs</span>'}</div>
        <p>Källfält: ${item.classification.sourceFields.map(escapeHtml).join(', ')}</p>
      </article>
      <article class="detail-card">
        <h4>Informationskontroll <span>${item.missingFields.length} luckor</span></h4>
        <div class="pill-list">${missing}</div>
      </article>
      <article class="detail-card wide">
        <h4>Svarsutkast <span>inte skickat</span></h4>
        <pre>${escapeHtml(item.responseDraft)}</pre>
      </article>
      <article class="detail-card">
        <h4>Internt arbetskort <span>${escapeHtml(item.internalTask.priority)}</span></h4>
        <p><strong>${escapeHtml(item.internalTask.title)}</strong></p>
        <div class="pill-list">${item.internalTask.checklist.map((step) => `<span class="pill">${escapeHtml(step)}</span>`).join('')}</div>
      </article>
      <article class="detail-card">
        <h4>Riskflaggor <span>${item.riskFlags.length}</span></h4>
        <div class="pill-list">${riskFlags}</div>
        <p>Uppföljning: ${new Date(item.followUpAt).toLocaleString('sv-SE')}</p>
      </article>
      <article class="detail-card wide approval-box">
        <div><h4>Manuellt godkännande</h4><strong>${escapeHtml(item.approval.status)}</strong><p>${escapeHtml(item.approval.reason)}</p></div>
        <button disabled>Extern åtgärd blockerad</button>
      </article>
      <article class="detail-card wide">
        <h4>Kontrollspår <span>${item.log.length} steg</span></h4>
        <div class="timeline">${item.log.map((event) => `<div class="timeline-step">${escapeHtml(event.state)}</div>`).join('')}</div>
      </article>
    </div>`;
}

function selectCase(id) {
  selectedId = id;
  renderList();
  const item = cases.find((candidate) => candidate.id === id);
  if (item) renderDetail(item);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2400);
}

filter.addEventListener('change', renderList);
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const response = await fetch('/api/evaluate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    showToast('Analysen kunde inte köras.');
    return;
  }
  const item = await response.json();
  cases = [item, ...cases.filter((candidate) => candidate.id !== item.id)];
  selectedId = item.id;
  filter.value = 'all';
  renderMetrics();
  renderList();
  renderDetail(item);
  showToast('Lokalt demoärende analyserat. Inget skickades.');
});

const response = await fetch('/api/demo');
const payload = await response.json();
cases = payload.cases;
renderMetrics();
renderList();
if (cases[0]) selectCase(cases[0].id);
