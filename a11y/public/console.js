/**
 * Internal review console.
 *
 * Vanilla ES modules on purpose: the console must start with `node dist/api/Main.js`
 * and nothing else. It is also the one piece of UI we ship, so it follows the
 * rules we sell — real buttons, visible focus, live status region, no
 * mouse-only controls.
 */
const statusEl = document.getElementById('status');
const REVIEWER = localStorage.getItem('a11y.reviewer') || 'operator';

const say = (message) => {
  statusEl.textContent = message;
};

const api = async (path, options = {}) => {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `${response.status} ${response.statusText}`);
  return data;
};

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value !== null && value !== undefined) node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) if (child) node.appendChild(child);
  return node;
};

const badge = (text, kind) => el('span', { class: `badge ${kind ?? ''}`, text });

// ------------------------------------------------------------------ review

async function renderReview() {
  const list = document.getElementById('review-list');
  list.replaceChildren(el('p', { text: 'Laddar…' }));
  const { items } = await api('/api/review/queue');
  list.replaceChildren();
  if (items.length === 0) {
    list.appendChild(el('p', { text: 'Inget att granska just nu.' }));
    return;
  }
  say(`${items.length} fynd i kön.`);
  for (const item of items) list.appendChild(reviewCard(item));
}

function reviewCard(item) {
  const { finding, pack, group, prospectDomain, prospectId } = item;
  const severitySelect = el('select', { 'aria-label': `Ändra allvarlighet för ${pack.title}` });
  for (const level of ['critical', 'high', 'medium', 'low']) {
    severitySelect.appendChild(el('option', { value: level, text: level, ...(level === finding.severity ? { selected: 'selected' } : {}) }));
  }
  const note = el('input', { type: 'text', placeholder: 'Anteckning (valfri)', 'aria-label': 'Anteckning till granskningsbeslutet' });

  const decide = async (action, extra = {}) => {
    try {
      await api('/api/review/decision', { method: 'POST', body: { reviewer: REVIEWER, action, findingId: finding.id, note: note.value || undefined, ...extra } });
      say(`${action} sparat för ${pack.title}.`);
      await renderReview();
    } catch (error) {
      say(`Fel: ${error.message}`);
    }
  };

  const evidence = el('div', { class: 'evidence' }, [
    pack.screenshot
      ? el('img', { src: `/evidence/${encodeURIComponent(pack.screenshot.key)}`, alt: `Skärmbild av ${pack.component} på ${pack.url}` })
      : el('p', { class: 'meta', text: 'Ingen skärmbild för det här fyndet.' }),
    el('dl', {}, [
      el('dt', { text: 'Vad som händer' }),
      el('dd', { text: pack.observedBehaviour }),
      el('dt', { text: 'Konsekvens' }),
      el('dd', { text: pack.userImpact }),
      el('dt', { text: 'Reproduktion' }),
      el('dd', { html: pack.reproduction.map((s) => `<div>• ${escapeHtml(s)}</div>`).join('') }),
      el('dt', { text: 'Element' }),
      el('dd', { html: `<code>${escapeHtml(pack.selector)}</code>` }),
    ]),
  ]);

  return el('article', { class: `card ${finding.severity}` }, [
    el('div', { class: 'badges' }, [
      badge(finding.severity, finding.severity),
      badge(finding.confidence === 'REVIEW_REQUIRED' ? 'kräver kontroll' : finding.confidence, finding.confidence === 'REVIEW_REQUIRED' ? 'review' : ''),
      group?.systemic ? badge(`${group.affectedPageCount} sidor`, '') : null,
      ...pack.wcag.map((w) => badge(`WCAG ${w.criterion}`, '')),
    ]),
    // A finding with no natural component name falls back to the rule title as
    // its component too — showing both would repeat the same text twice.
    el('h3', { text: pack.component && pack.component !== pack.title ? `${pack.title} — ${pack.component}` : pack.title }),
    el('p', { class: 'meta', text: `${prospectDomain} · ${pack.pageType} · ${pack.url}` }),
    evidence,
    el('div', { class: 'actions' }, [
      el('button', { class: 'action', type: 'button', text: 'Godkänn', onclick: () => decide('APPROVE') }),
      el('button', { class: 'action danger', type: 'button', text: 'Avvisa', onclick: () => decide('REJECT') }),
      el('button', { class: 'action secondary', type: 'button', text: 'Begär manuell test', onclick: () => decide('REQUEST_MANUAL_TEST') }),
      el('button', { class: 'action secondary', type: 'button', text: 'Manuell test bekräftad', onclick: () => decide('CONFIRM_MANUAL_TEST') }),
      severitySelect,
      el('button', { class: 'action secondary', type: 'button', text: 'Spara allvarlighet', onclick: () => decide('CHANGE_SEVERITY', { severity: severitySelect.value }) }),
      note,
      el('button', {
        class: 'action secondary',
        type: 'button',
        text: 'Klarmarkera prospektet',
        onclick: async () => {
          await api('/api/review/signoff', { method: 'POST', body: { prospectId, reviewer: REVIEWER } });
          say(`${prospectDomain} är klar för outreach.`);
          await renderReview();
        },
      }),
    ]),
  ]);
}

// ---------------------------------------------------------------- pipeline

async function renderPipeline() {
  const { board, stages, worklist } = await api('/api/pipeline');
  const boardEl = document.getElementById('board');
  boardEl.replaceChildren(
    ...Object.entries(board)
      .filter(([, count]) => count > 0)
      .map(([stage, count]) =>
        el('div', { class: 'cell' }, [el('span', { class: 'n', text: String(count) }), el('span', { class: 'l', text: stages[stage].label })]),
      ),
  );

  const tbody = document.querySelector('#worklist tbody');
  tbody.replaceChildren(
    ...worklist.map((row) =>
      el('tr', {}, [
        el('td', { text: row.prospect.domain }),
        el('td', { text: row.stageLabel }),
        el('td', { text: String(row.prospect.leadScore) }),
        el('td', { text: String(row.prospect.evidenceScore) }),
        el('td', { text: row.nextAction }),
        el('td', { text: String(row.daysInStage) }),
        el('td', {}, [
          el('button', {
            class: 'action secondary',
            type: 'button',
            text: 'Skapa outreach',
            onclick: async () => {
              try {
                await api('/api/outreach/draft', { method: 'POST', body: { prospectId: row.prospect.id } });
                say(`Utkast skapat för ${row.prospect.domain}. Gå till fliken Outreach.`);
              } catch (error) {
                say(`Kunde inte skapa utkast: ${error.message}`);
              }
            },
          }),
        ]),
      ]),
    ),
  );
}

// ---------------------------------------------------------------- outreach

async function renderOutreach() {
  const list = document.getElementById('outreach-list');
  const { drafts } = await api('/api/outreach?status=drafted');
  list.replaceChildren();
  if (drafts.length === 0) {
    list.appendChild(el('p', { text: 'Inga utkast väntar på granskning.' }));
    return;
  }
  for (const draft of drafts) {
    const note = el('input', { type: 'text', placeholder: 'Anteckning', 'aria-label': `Anteckning för utkast till ${draft.toValue ?? 'okänd mottagare'}` });
    list.appendChild(
      el('article', { class: 'card' }, [
        el('h3', { text: draft.subject }),
        el('p', { class: 'meta', text: `Till: ${draft.toValue ?? 'ingen kontaktväg'} · ${draft.channel} · citerar ${draft.citedFindingIds.length} fynd` }),
        el('pre', { text: draft.body }),
        el('div', { class: 'actions' }, [
          el('button', {
            class: 'action',
            type: 'button',
            text: 'Godkänn',
            onclick: async () => {
              await api('/api/outreach/approve', { method: 'POST', body: { draftId: draft.id, reviewer: REVIEWER, note: note.value } });
              say('Utkastet är godkänt. Skicka det från din egen mejl och markera det sedan som skickat.');
              await renderOutreach();
            },
          }),
          el('button', {
            class: 'action danger',
            type: 'button',
            text: 'Avvisa',
            onclick: async () => {
              await api('/api/outreach/reject', { method: 'POST', body: { draftId: draft.id, reviewer: REVIEWER, note: note.value } });
              await renderOutreach();
            },
          }),
          el('button', {
            class: 'action secondary',
            type: 'button',
            text: 'Markera som skickad',
            onclick: async () => {
              try {
                await api('/api/outreach/sent', { method: 'POST', body: { draftId: draft.id } });
                say('Markerad som skickad.');
                await renderOutreach();
              } catch (error) {
                say(error.message);
              }
            },
          }),
          note,
        ]),
      ]),
    );
  }
}

// ----------------------------------------------------------------- metrics

const METRIC_LABELS = {
  domainsDiscovered: 'Domäner upptäckta',
  sitesScannedSuccessfully: 'Sajter skannade',
  sitesUntestable: 'Ej testbara',
  qualifiedProspects: 'Kvalificerade',
  miniAuditsGenerated: 'Mini-audits',
  miniAuditsApproved: 'Godkända mini-audits',
  prospectsContacted: 'Kontaktade',
  responses: 'Svar',
  positiveResponses: 'Positiva svar',
  meetings: 'Möten',
  proposals: 'Offerter',
  customersWon: 'Kunder',
  auditRevenueSek: 'Auditintäkt (SEK)',
  remediationRevenueSek: 'Åtgärdsintäkt (SEK)',
  monitoringMrrSek: 'Övervakning MRR (SEK)',
  deliveryHoursPerCustomer: 'Leveranstimmar/kund',
  computeCostPerAuditSek: 'Datorkostnad/audit (SEK)',
};

// Keys match BusinessMetrics['rates'] in src/analytics/Metrics.ts.
const RATE_LABELS = {
  scanToQualified: 'Scan → kvalificerad',
  qualifiedToContacted: 'Kvalificerad → kontaktad',
  contactedToResponse: 'Kontaktad → svar',
  responseToMeeting: 'Svar → möte',
  meetingToWon: 'Möte → vunnen',
  discoveredToWon: 'Upptäckt → vunnen',
};

async function renderMetrics() {
  const { metrics, biggestDropOff } = await api('/api/metrics');
  const target = document.getElementById('metrics');
  target.replaceChildren(
    ...Object.entries(METRIC_LABELS).map(([key, label]) =>
      el('div', { class: 'cell' }, [el('span', { class: 'n', text: String(metrics[key] ?? 0) }), el('span', { class: 'l', text: label })]),
    ),
    ...Object.entries(metrics.rates).map(([key, value]) =>
      el('div', { class: 'cell' }, [el('span', { class: 'n', text: `${value}%` }), el('span', { class: 'l', text: RATE_LABELS[key] ?? key })]),
    ),
  );
  say(`Största tappet: ${biggestDropOff}.`);
}

// -------------------------------------------------------------------- tabs

const VIEWS = { review: renderReview, pipeline: renderPipeline, outreach: renderOutreach, metrics: renderMetrics };

function show(view) {
  for (const section of document.querySelectorAll('.view')) section.hidden = section.id !== `view-${view}`;
  for (const tab of document.querySelectorAll('.tab')) {
    if (tab.dataset.view === view) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  say('');
  VIEWS[view]().catch((error) => say(`Fel: ${error.message}`));
}

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => show(tab.dataset.view));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

show('review');
