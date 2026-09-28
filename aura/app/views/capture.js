/* Aura — Capture (brain dump). Type or speak; Aura sorts; you confirm. */
(function (root) {
  const A = root.Aura;
  const U = A.util, I = A.i18n, M = A.model, S = A.store, icon = A.icon;
  const UI = A.ui, V = A.views;
  const { esc, t } = UI;

  I.add({
    'cap.title': ['Vad har du i huvudet?', "What's on your mind?"],
    'cap.eyebrow': ['Skriv eller tala. Aura sorterar.', 'Type or speak. Aura sorts it.'],
    'cap.ph': ['Allt på en gång, i vilken ordning som helst. Till exempel: ”Behöver schampo, boka tandläkaren, tvätta jackan och komma ihåg mammas present.”', 'Everything at once, in any order. For example: "I need shampoo, book the dentist, wash the jacket and remember Mum\'s present."'],
    'cap.sort': ['Sortera', 'Sort it'],
    'cap.inbox': ['Spara i inkorgen', 'Save to inbox'],
    'cap.sorting': ['Sorterar …', 'Sorting …'],
    'cap.aiOn': ['Aura AI sorterar med ditt Claude-konto. Inget skapas innan du godkänner.', 'Aura AI sorts this using your Claude account. Nothing is created until you confirm.'],
    'cap.aiOff': ['Sorteras med Auras inbyggda regler (ingen AI). Inget skapas innan du godkänner.', "Sorted with Aura's built-in rules (no AI). Nothing is created until you confirm."],
    'cap.modeAi': ['Sorterat med Aura AI', 'Sorted with Aura AI'],
    'cap.modeRules': ['Sorterat med inbyggda regler (ingen AI)', 'Sorted with built-in rules (no AI)'],
    'cap.found': ['Aura hittade {n} sak. Stämmer det?|Aura hittade {n} saker. Stämmer det?', 'Aura found {n} thing. Does this look right?|Aura found {n} things. Does this look right?'],
    'cap.addN': ['Lägg till {n} sak|Lägg till {n} saker', 'Add {n} thing|Add {n} things'],
    'cap.again': ['Börja om', 'Start over'],
    'cap.allInbox': ['Lägg allt i inkorgen i stället', 'Put it all in the inbox instead'],
    'cap.none': ['Jag hittade inget att lägga till. Skriv lite mer, eller spara texten i inkorgen.', "I couldn't find anything to add. Write a little more, or save the text to the inbox."],
    'cap.question': ['Det låter som en fråga.', 'That sounds like a question.'],
    'cap.askAura': ['Fråga Aura', 'Ask Aura'],
    'cap.anyway': ['Spara ändå', 'Save anyway'],
    'cap.added': ['{n} sak tillagd.|{n} saker tillagda.', '{n} thing added.|{n} things added.'],
    'cap.inboxed': ['Sparat i inkorgen.', 'Saved to the inbox.'],
    'cap.remove': ['Ta bort {title}', 'Remove {title}'],
    'cap.hintEvent': ['Blir en fast tid i din dag — kolla dag och klockslag.', 'Becomes a fixed event in your day — check the day and time.'],
    'cap.hintWhen': ['När? Välj en dag så påminner Aura dig.', 'When? Pick a day and Aura will remind you.'],
    'cap.hintKind': ['Osäker på sorten — ändra om det blev fel.', 'Not sure of the kind — change it if it is wrong.'],
    'cap.when.none': ['Ingen dag', 'No day'],
    'cap.kindLabel': ['Sort för {title}', 'Kind for {title}'],
    'cap.whenLabel': ['När för {title}', 'When for {title}'],
  });

  const cap = { result: null, busy: false, ctl: null, draftKey: 'cap.text' };

  const KIND_OPTIONS = ['task', 'shopping', 'admin', 'chore', 'reminder', 'event', 'note', 'idea'];

  function whenOptions(c) {
    const key = UI.today();
    const opts = [['', t('cap.when.none')], ['today', t('when.today')], ['tomorrow', t('when.tomorrow')], ['weekend', t('when.weekend')], ['nextweek', t('when.nextWeek')]];
    const cur = c.date;
    const known = { [key]: 'today', [U.addDays(key, 1)]: 'tomorrow' };
    let selected = cur ? (known[cur] || `d:${cur}`) : '';
    if (cur && !known[cur]) opts.push([`d:${cur}`, I.relativeDay(cur, key)]);
    if (c.whenChoice) selected = c.whenChoice;
    return opts.map(([v, label]) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(label)}</option>`).join('');
  }

  /** Editable candidate rows — shared by Capture, Chaos and Onboarding. `ns` namespaces drafts and actions. */
  function candidateList(result, ns) {
    const key = UI.today();
    return `<div class="cands">${result.candidates.map((c) => {
      const tk = `${ns}.t:${c.tempId}`;
      const due = c.dueDate ? t('meta.due', { when: I.relativeDay(c.dueDate, key) }) : '';
      const extra = [due, c.recur ? A.items.describeRecur(c.recur) : '', c.forPerson ? t('meta.for', { name: c.forPerson }) : '',
        c.kind === 'shopping' && c.category ? t(`shop.cat.${c.category}`) : ''].filter(Boolean).join(' · ');
      return `<div class="cand${c.review ? ' review' : ''}" data-cand="${esc(c.tempId)}">
        <div class="cand-top">
          <select class="kind-select k-${esc(c.kind)}" data-change="cand-kind" data-ns="${ns}" data-temp="${esc(c.tempId)}" aria-label="${esc(t('cap.kindLabel', { title: c.title }))}">
            ${KIND_OPTIONS.map((k) => `<option value="${k}"${k === c.kind ? ' selected' : ''}>${esc(t(`kind.${k}`))}</option>`).join('')}</select>
          <input class="cand-title" id="${esc(`${ns}-${c.tempId}`)}" data-model="${esc(tk)}" value="${esc(UI.draft(tk, c.title))}" maxlength="140" aria-label="${esc(t('item.title'))}">
          <button class="icon-btn small" data-action="cand-remove" data-ns="${ns}" data-temp="${esc(c.tempId)}" aria-label="${esc(t('cap.remove', { title: c.title }))}">${icon('close', 18)}</button>
        </div>
        <div class="cand-bottom">
          ${c.kind === 'note' || c.kind === 'idea' ? '' : `<select class="when-select" data-change="cand-when" data-ns="${ns}" data-temp="${esc(c.tempId)}" aria-label="${esc(t('cap.whenLabel', { title: c.title }))}">${whenOptions(c)}</select>`}
          ${c.kind === 'event' ? `<input class="time-input" type="time" value="${esc(c.time)}" data-change="cand-time" data-ns="${ns}" data-temp="${esc(c.tempId)}" aria-label="${esc(t('ev.start'))}">` : ''}
          ${extra ? `<span class="sub">${esc(extra)}</span>` : ''}
        </div>
        ${c.review && c.hint ? `<p class="hint">${esc(t(c.hint))}</p>` : ''}
      </div>`;
    }).join('')}</div>`;
  }

  /** Read edits back into candidates, then turn them into ops. */
  function candidatesToOps(result, ns, opts) {
    const key = UI.today();
    const out = [];
    for (const c of result.candidates) {
      const tk = `${ns}.t:${c.tempId}`;
      const title = UI.draft(tk, c.title).trim();
      UI.clearDraft(tk);
      if (!title) continue;
      const cand = Object.assign({}, c, { title });
      if (cand.whenChoice !== undefined) {
        const v = cand.whenChoice;
        cand.date = v.startsWith('d:') ? v.slice(2) : v ? A.apply.resolveWhen(v, key) : '';
      }
      if (cand.kind === 'event' && !cand.time) cand.kind = 'task';
      out.push(A.parse.toOp(cand, Object.assign({ today: key }, opts || {})));
    }
    return out;
  }

  function findCand(result, temp) { return result ? result.candidates.find((c) => c.tempId === temp) : null; }
  function resultFor(ns) { return ns === 'cap' ? cap.result : (A.views.results && A.views.results[ns]) || null; }

  UI.action('cand-kind', (el) => {
    const c = findCand(resultFor(el.dataset.ns), el.dataset.temp);
    if (!c) return true;
    c.kind = el.value;
    c.review = c.kind === 'event' ? !c.time : (c.kind === 'reminder' && !c.date && !c.dueDate);
    c.hint = c.kind === 'event' ? 'cap.hintEvent' : c.review ? 'cap.hintWhen' : '';
    if (c.kind === 'shopping' && !c.category) c.category = A.parse.productCategory(c.title) || 'other';
    if (c.kind === 'admin') c.adminStatus = 'action';
    if (c.kind === 'chore' && !c.recur) c.recur = { unit: 'week', every: 1, weekdays: [] };
    return false;
  });
  UI.action('cand-when', (el) => {
    const c = findCand(resultFor(el.dataset.ns), el.dataset.temp);
    if (!c) return true;
    c.whenChoice = el.value;
    if (el.value && c.kind === 'reminder') { c.review = false; c.hint = ''; }
    return false;
  });
  UI.action('cand-time', (el) => { const c = findCand(resultFor(el.dataset.ns), el.dataset.temp); if (c) c.time = el.value; return true; });
  UI.action('cand-remove', (el) => {
    const r = resultFor(el.dataset.ns);
    if (r) r.candidates = r.candidates.filter((c) => c.tempId !== el.dataset.temp);
    return false;
  });

  /* ---------------- the view ---------------- */

  UI.view('capture', {
    tab: 'capture',
    render(state) {
      const text = UI.draft(cap.draftKey);
      const ai = A.ai.status(state);
      if (cap.result && cap.result.question) {
        return `${UI.backHeader(t('cap.title'))}
          <div class="calm-card"><p class="lead">${esc(t('cap.question'))}</p>
          <div class="btnrow"><button class="btn primary" data-action="cap-ask">${icon('aura', 17)}${esc(t('cap.askAura'))}</button>
          <button class="btn ghost" data-action="cap-anyway">${esc(t('cap.anyway'))}</button></div></div>`;
      }
      if (cap.result) {
        const r = cap.result;
        const n = r.candidates.length;
        return `${UI.backHeader(n ? t('cap.found', { n }) : t('cap.title'), t(r.mode === 'ai' ? 'cap.modeAi' : 'cap.modeRules'))}
          ${r.note ? `<div class="note-line muted">${esc(t(r.note))}</div>` : ''}
          ${n ? candidateList(r, 'cap') : `<p class="muted pad">${esc(t('cap.none'))}</p>`}
          <div class="stack sticky-actions">
            ${n ? `<button class="btn primary wide" data-action="cap-add">${esc(t('cap.addN', { n }))}</button>` : `<button class="btn primary wide" data-action="cap-inbox">${esc(t('cap.inbox'))}</button>`}
            <div class="btnrow center">
              <button class="btn quiet small" data-action="cap-reset">${esc(t('cap.again'))}</button>
              ${n ? `<button class="btn quiet small" data-action="cap-all-inbox">${esc(t('cap.allInbox'))}</button>` : ''}
            </div>
          </div>`;
      }
      return `${UI.backHeader(t('cap.title'), t('cap.eyebrow'))}
        <div class="capture-box${cap.busy ? ' busy' : ''}">
          <label class="sr" for="cap-text">${esc(t('cap.title'))}</label>
          <textarea id="cap-text" class="input dump" data-model="${cap.draftKey}" rows="7" placeholder="${esc(t('cap.ph'))}" ${cap.busy ? 'disabled' : ''} data-autofocus>${esc(text)}</textarea>
          <div class="capture-bar">
            ${V.voiceButton(cap.draftKey)}
            <div class="grow"></div>
            ${cap.busy
              ? `<span class="muted">${esc(t('cap.sorting'))}</span><button class="btn ghost small" data-action="cap-stop">${esc(t('a.stop'))}</button>`
              : `<button class="btn ghost small" data-action="cap-inbox">${esc(t('cap.inbox'))}</button>
                 <button class="btn primary" data-action="cap-sort">${esc(t('cap.sort'))}</button>`}
          </div>
        </div>
        <p class="faint">${esc(t(ai.available ? 'cap.aiOn' : 'cap.aiOff'))}</p>`;
    },
    enter() {
      setTimeout(() => { const el = root.document.getElementById('cap-text'); if (el && !cap.result) el.focus({ preventScroll: true }); }, 80);
    },
  });

  UI.action('cap-sort', async () => {
    const text = UI.draft(cap.draftKey).trim();
    if (!text) { UI.toast(t('cap.none')); return true; }
    cap.busy = true;
    cap.ctl = new AbortController();
    UI.render();
    const r = await A.ai.parseDump(S.state, text, new Date(), { signal: cap.ctl.signal });
    cap.busy = false;
    cap.ctl = null;
    if (r.cancelled) { UI.render(); return true; }
    cap.result = r;
    UI.render({ scrollTop: true });
    return true;
  });
  UI.action('cap-stop', () => { if (cap.ctl) cap.ctl.abort(); return true; });
  UI.action('cap-reset', () => { cap.result = null; });
  UI.action('cap-add', () => {
    const ops = candidatesToOps(cap.result, 'cap', { source: cap.result.mode === 'ai' ? 'dump-ai' : 'dump' });
    if (!ops.length) return false;
    const res = UI.commit(ops, { message: t('cap.added', { n: ops.length }) });
    if (res.applied.length) { cap.result = null; UI.clearDraft(cap.draftKey); UI.go('home'); return true; }
    return false;
  });
  UI.action('cap-all-inbox', () => {
    const ops = candidatesToOps(cap.result, 'cap', { inbox: true, source: 'dump' });
    UI.commit(ops, { message: t('cap.inboxed') });
    cap.result = null; UI.clearDraft(cap.draftKey);
    UI.go('home');
    return true;
  });
  UI.action('cap-inbox', () => {
    const text = UI.draft(cap.draftKey).trim();
    if (!text) { UI.toast(t('cap.none')); return true; }
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 30);
    UI.commit(lines.map((l) => ({ op: 'item.add', item: { kind: 'note', title: l.slice(0, 140), status: 'inbox', source: 'capture' } })), { message: t('cap.inboxed') });
    cap.result = null; UI.clearDraft(cap.draftKey);
    UI.go('home');
    return true;
  });
  UI.action('cap-ask', () => {
    UI.setDraft('aura.q', UI.draft(cap.draftKey));
    UI.clearDraft(cap.draftKey);
    cap.result = null;
    UI.go('aura', { ask: true });
    return true;
  });
  UI.action('cap-anyway', () => {
    const text = UI.draft(cap.draftKey).trim();
    cap.result = { mode: 'rules', candidates: [Object.assign(A.parse.quick(S.state, text.replace(/\?\s*$/, ''), new Date()), { kind: 'note' })] };
  });

  A.views = Object.assign(A.views || {}, { candidateList, candidatesToOps, results: {} });
})(typeof globalThis !== 'undefined' ? globalThis : this);
