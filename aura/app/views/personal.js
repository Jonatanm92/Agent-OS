/* Aura — optional personal modules: Cycle and Reflection (Mystik). Off by default. */
(function (root) {
  const A = root.Aura;
  const U = A.util, I = A.i18n, M = A.model, S = A.store, icon = A.icon;
  const UI = A.ui, V = A.views;
  const { esc, t } = UI;

  I.add({
    'cy.title': ['Cykel', 'Cycle'],
    'cy.eyebrow': ['Din egen logg — inte medicinsk rådgivning', 'Your own log — not medical advice'],
    'cy.disclaimer': ['Aura räknar bara på dagar du själv loggat. Uppskattningar är ungefärliga och ersätter inte vården. Kontakta vården om något känns fel.', 'Aura only uses days you have logged yourself. Estimates are rough and do not replace healthcare. Talk to a clinician if something feels wrong.'],
    'cy.today': ['I dag', 'Today'],
    'cy.period': ['Mens i dag', 'Period today'],
    'cy.periodYes': ['Ja', 'Yes'],
    'cy.periodNo': ['Nej', 'No'],
    'cy.flow': ['Flöde', 'Flow'],
    'cy.flow.0': ['Stänk', 'Spotting'],
    'cy.flow.1': ['Lätt', 'Light'],
    'cy.flow.2': ['Medel', 'Medium'],
    'cy.flow.3': ['Rikligt', 'Heavy'],
    'cy.symptoms': ['Kroppen i dag', 'Your body today'],
    'cy.note': ['Anteckning (frivilligt)', 'Note (optional)'],
    'cy.saveNote': ['Spara anteckning', 'Save note'],
    'cy.summary': ['Ditt mönster', 'Your pattern'],
    'cy.day': ['Cykeldag {n}', 'Cycle day {n}'],
    'cy.avg': ['Snittcykel {n} dagar, baserat på {k} cykler', 'Average cycle {n} days, based on {k} cycles'],
    'cy.next': ['Nästa mens runt {from}–{to}', 'Next period around {from}–{to}'],
    'cy.nextNote': ['En uppskattning från dina egna loggar.', 'An estimate from your own logs.'],
    'cy.notEnough': ['Logga två hela cykler så kan Aura visa ditt eget mönster.', 'Log two full cycles and Aura can show your own pattern.'],
    'cy.obs': ['I dina anteckningar', 'In your notes'],
    'cy.history': ['Senaste 60 dagarna', 'Last 60 days'],
    'cy.off': ['Stäng av cykelmodulen', 'Turn off the cycle module'],
    'cy.clear': ['Radera all cykeldata', 'Delete all cycle data'],
    'cy.clearQ': ['Radera all cykeldata?', 'Delete all cycle data?'],
    'cy.clearBody': ['Alla loggade dagar tas bort för gott. Det går inte att ångra.', 'Every logged day is removed for good. This cannot be undone.'],
    'cy.cleared': ['All cykeldata är raderad.', 'All cycle data deleted.'],
    'cy.legend': ['Mörka dagar = mens', 'Dark days = period'],

    'rf.title': ['Reflektion', 'Reflection'],
    'rf.eyebrow': ['Stilla stund, när du vill', 'A quiet moment, when you want one'],
    'rf.theme': ['Dagens tema', "Today's theme"],
    'rf.themeNote': ['Ett tema att tänka med — ingen spådom.', 'A theme to think with — not a prediction.'],
    'rf.prompt': ['Dagens fråga', "Today's question"],
    'rf.another': ['En annan fråga', 'Another question'],
    'rf.writePh': ['Skriv så mycket eller lite du vill.', 'Write as much or as little as you like.'],
    'rf.save': ['Spara', 'Save'],
    'rf.rituals': ['Små ritualer', 'Small rituals'],
    'rf.quiet': ['Tyst läge', 'Quiet mode'],
    'rf.quietLead': ['Bara det viktigaste. Tryck var som helst för att gå tillbaka.', 'Only what matters. Tap anywhere to return.'],
    'rf.journal': ['Tidigare', 'Earlier'],
    'rf.empty': ['Inget skrivet än.', 'Nothing written yet.'],
    'rf.limit': ['Aura sparar dina senaste 300 reflektioner. Exportera under Inställningar för att behålla allt.', 'Aura keeps your latest 300 reflections. Export from Settings to keep everything.'],
    'rf.breathe': ['Andas in … och ut.', 'Breathe in … and out.'],
  });

  /* ---------------- Cycle ---------------- */

  UI.view('cycle', {
    tab: 'life',
    render(state) {
      const key = UI.today();
      const sum = A.cycle.summary(state, key);
      const entry = sum.today || {};
      const obs = A.cycle.observations(state);
      const days = [];
      const set = new Set(A.cycle.periodDays(state));
      for (let i = 59; i >= 0; i -= 1) days.push(U.addDays(key, -i));
      return `${UI.backHeader(t('cy.title'), t('cy.eyebrow'))}
        <p class="faint">${esc(t('cy.disclaimer'))}</p>
        <section class="section">${UI.sectionHead(t('cy.today'))}
          <div class="field"><div class="label">${esc(t('cy.period'))}</div>${UI.chips([{ v: '1', t: t('cy.periodYes') }, { v: '0', t: t('cy.periodNo') }], entry.period === true ? '1' : entry.period === false ? '0' : '', 'cy-period')}</div>
          ${entry.period ? `<div class="field"><div class="label">${esc(t('cy.flow'))}</div>${UI.chips([0, 1, 2, 3].map((f) => ({ v: f, t: t(`cy.flow.${f}`) })), entry.flow != null ? entry.flow : '', 'cy-flow')}</div>` : ''}
          <div class="field"><div class="label">${esc(t('cy.symptoms'))}</div>
            <div class="chips">${A.cycle.SYMPTOMS.map((s) => { const on = (entry.symptoms || []).includes(s); return `<button class="chip${on ? ' on' : ''}" data-action="cy-sym" data-value="${s}" aria-pressed="${on}">${esc(t(`cyc.symptom.${s}`))}</button>`; }).join('')}</div></div>
          <div class="field"><label class="label" for="cy-note">${esc(t('cy.note'))}</label>
            <div class="inline"><input id="cy-note" class="input" data-model="cy.note" value="${esc(UI.draft('cy.note', entry.note || ''))}" maxlength="280">
            <button class="btn small ghost" data-action="cy-note">${esc(t('cy.saveNote'))}</button></div></div>
        </section>
        <section class="section">${UI.sectionHead(t('cy.summary'))}
          <div class="panel soft"><div class="row"><span class="row-main">
            ${sum.cycleDay ? `<span class="title">${esc(t('cy.day', { n: sum.cycleDay }))}</span>` : ''}
            ${sum.enoughData ? `<span class="sub">${esc(t('cy.avg', { n: sum.averageLength, k: sum.cycleLengths.length }))}</span>
              ${sum.next ? `<span class="sub">${esc(t('cy.next', { from: I.shortDate(sum.next.from), to: I.shortDate(sum.next.to) }))} — ${esc(t('cy.nextNote'))}</span>` : ''}`
              : `<span class="sub">${esc(t('cy.notEnough'))}</span>`}
          </span></div></div>
          <div class="cal" aria-label="${esc(t('cy.history'))}">${days.map((d) => `<span class="cal-d${set.has(d) ? ' on' : ''}${d === key ? ' today' : ''}" title="${esc(I.shortDate(d))}"></span>`).join('')}</div>
          <p class="faint">${esc(t('cy.history'))} · ${esc(t('cy.legend'))}</p>
        </section>
        ${obs.length ? `<section class="section">${UI.sectionHead(t('cy.obs'))}${obs.map((o) => `<p class="calm-line">${esc(I.msg(o))}</p>`).join('')}</section>` : ''}
        <div class="btnrow gap-top"><button class="btn quiet small" data-action="cy-off">${esc(t('cy.off'))}</button>
          <button class="btn quiet small danger" data-action="cy-clear">${icon('trash', 16)}${esc(t('cy.clear'))}</button></div>`;
    },
  });

  function todayEntry() { return (S.state.cycle.entries || []).find((e) => e.date === UI.today()) || {}; }
  UI.action('cy-period', (el) => { UI.commit([{ op: 'cycle.log', date: UI.today(), period: el.dataset.value === '1' }], { silent: true }); });
  UI.action('cy-flow', (el) => { UI.commit([{ op: 'cycle.log', date: UI.today(), flow: Number(el.dataset.value) }], { silent: true }); });
  UI.action('cy-sym', (el) => {
    const cur = new Set(todayEntry().symptoms || []);
    if (cur.has(el.dataset.value)) cur.delete(el.dataset.value); else cur.add(el.dataset.value);
    UI.commit([{ op: 'cycle.log', date: UI.today(), symptoms: Array.from(cur) }], { silent: true });
  });
  UI.action('cy-note', () => {
    const note = UI.draft('cy.note').trim();
    UI.clearDraft('cy.note');
    UI.commit([{ op: 'cycle.log', date: UI.today(), note }]);
  });
  UI.action('cy-off', () => { UI.commit([{ op: 'prefs.set', patch: { modules: { cycle: false } } }]); UI.go('life', {}, { replace: true }); return true; });
  UI.action('cy-clear', async () => {
    const ok = await UI.confirm({ title: t('cy.clearQ'), body: t('cy.clearBody'), yes: t('a.delete'), danger: true });
    if (!ok) return true;
    UI.commit([{ op: 'cycle.clear' }], { message: t('cy.cleared'), undo: false });
    return false;
  });

  /* ---------------- Reflection (Mystik) ---------------- */

  const rf = { offset: 0, quiet: false };

  UI.view('reflect', {
    tab: 'life',
    noDock: () => rf.quiet,
    render(state) {
      const key = UI.today();
      if (rf.quiet) {
        const card = A.engine.nowCard(state, UI.ui.now);
        const line = card.type === 'task' ? card.rec.title : card.type === 'focus' ? card.item.title : t('now.nothingUrgent');
        return `<button class="quiet-mode" data-action="rf-quiet">
          <span class="q-time mono">${esc(U.toClock(UI.nowMin()))}</span>
          <span class="q-breath" aria-hidden="true"></span>
          <span class="q-line">${esc(t('rf.breathe'))}</span>
          <span class="q-next">${esc(line)}</span>
          <span class="faint">${esc(t('rf.quietLead'))}</span></button>`;
      }
      const theme = A.reflect.themeOfDay(key);
      const prompt = A.reflect.promptOfDay(key, rf.offset);
      const entries = state.journal.slice().reverse().slice(0, 12);
      return `${UI.backHeader(t('rf.title'), t('rf.eyebrow'), `<button class="btn small ghost" data-action="rf-quiet">${icon('moon', 16)}${esc(t('rf.quiet'))}</button>`)}
        <section class="theme-card">
          <div class="eyebrow">${esc(t('rf.theme'))}</div>
          <h2 class="theme-name">${esc(theme.name)}</h2>
          <p class="theme-line">${esc(theme.line)}</p>
          <p class="theme-q">${esc(theme.question)}</p>
          <p class="faint">${esc(t('rf.themeNote'))}</p>
        </section>
        <section class="section">${UI.sectionHead(t('rf.prompt'), `<button class="btn tiny quiet" data-action="rf-another">${esc(t('rf.another'))}</button>`)}
          <p class="prompt-q">${esc(prompt)}</p>
          <div class="capture-box small">
            <label class="sr" for="rf-text">${esc(prompt)}</label>
            <textarea id="rf-text" class="input" rows="4" data-model="rf.text" placeholder="${esc(t('rf.writePh'))}">${esc(UI.draft('rf.text'))}</textarea>
            <div class="capture-bar">${V.voiceButton('rf.text')}<div class="grow"></div><button class="btn small primary" data-action="rf-save" data-prompt="${esc(prompt)}">${esc(t('rf.save'))}</button></div>
          </div>
        </section>
        <section class="section">${UI.sectionHead(t('rf.rituals'))}
          <div class="panel soft">${A.reflect.rituals().map((r) => `<div class="row"><span class="row-main"><span class="title">${esc(r.name)}</span><span class="sub">${esc(r.text)}</span></span></div>`).join('')}</div>
        </section>
        <section class="section">${UI.sectionHead(t('rf.journal'))}
          ${entries.length ? `<div class="panel soft">${entries.map((j) => `<div class="row"><span class="row-main"><span class="sub">${esc(I.relativeDay(j.date, key))}${j.prompt ? ` · ${esc(j.prompt)}` : ''}</span><span class="title pre">${esc(j.text)}</span></span>
            <button class="icon-btn small" data-action="rf-delete" data-id="${esc(j.id)}" aria-label="${esc(t('a.delete'))}">${icon('trash', 16)}</button></div>`).join('')}</div>` : `<p class="muted">${esc(t('rf.empty'))}</p>`}
          ${state.journal.length > 250 ? `<p class="faint">${esc(t('rf.limit'))}</p>` : ''}
        </section>`;
    },
  });

  UI.action('rf-another', () => { rf.offset += 1; });
  UI.action('rf-quiet', () => { rf.quiet = !rf.quiet; UI.render({ scrollTop: true }); return true; });
  UI.action('rf-save', (el) => {
    const text = UI.draft('rf.text').trim();
    if (!text) return true;
    UI.clearDraft('rf.text');
    UI.commit([{ op: 'journal.add', entry: { date: UI.today(), prompt: el.dataset.prompt, text, kind: 'reflection' } }]);
  });
  UI.action('rf-delete', (el) => { UI.commit([{ op: 'journal.delete', id: el.dataset.id }]); });

})(typeof globalThis !== 'undefined' ? globalThis : this);
