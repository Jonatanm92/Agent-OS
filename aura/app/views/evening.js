/* Aura — Evening reset (fast) and Weekly review (useful, not vanity). */
(function (root) {
  const A = root.Aura;
  const U = A.util, I = A.i18n, M = A.model, It = A.items, S = A.store, icon = A.icon;
  const UI = A.ui, V = A.views;
  const { esc, t } = UI;

  I.add({
    'eve.title': ['Kvällsavstämning', 'Evening reset'],
    'eve.eyebrow': ['Två minuter, sedan är dagen släppt', 'Two minutes, then the day is done'],
    'eve.done': ['Det här blev gjort', 'What got done'],
    'eve.doneN': ['{n} sak blev gjord i dag.|{n} saker blev gjorda i dag.', '{n} thing got done today.|{n} things got done today.'],
    'eve.doneNone': ['Inget bockades av i dag. Det är också en dag.', 'Nothing was ticked off today. That is a day too.'],
    'eve.routineSteps': ['plus {n} rutinsteg', 'plus {n} routine steps'],
    'eve.open': ['Inte klart', 'Still open'],
    'eve.openNone': ['Inget hänger kvar från i dag.', 'Nothing is left hanging from today.'],
    'eve.tomorrow': ['I morgon', 'Tomorrow'],
    'eve.later': ['Senare', 'Later'],
    'eve.drop': ['Släpp', 'Let go'],
    'eve.moveAll': ['Flytta allt', 'Move everything'],
    'eve.mind': ['Något du fortfarande bär på?', 'Anything still on your mind?'],
    'eve.mindPh': ['Skriv av dig — det hamnar i inkorgen.', "Write it down — it goes to the inbox."],
    'eve.mindSave': ['Lägg i inkorgen', 'Put in the inbox'],
    'eve.tomorrowTitle': ['Inför i morgon', 'For tomorrow'],
    'eve.first': ['Först: {title} kl. {at}', 'First: {title} at {at}'],
    'eve.nothingFixed': ['Inget fast i morgon.', 'Nothing fixed tomorrow.'],
    'eve.intention': ['En sak som spelar roll i morgon (frivilligt)', 'One thing that matters tomorrow (optional)'],
    'eve.finish': ['Klar för i dag', 'Done for today'],
    'eve.finished': ['Dagen är släppt. Sov gott.', 'The day is done. Sleep well.'],
    'eve.reflect': ['Skriv en rad om dagen', 'Write a line about the day'],
    'eve.wake': ['Du går upp {at}.', 'You get up at {at}.'],

    'rev.title': ['Veckan', 'The week'],
    'rev.eyebrow': ['Vecka från {from}', 'Week of {from}'],
    'rev.done': ['Blev gjort', 'Got done'],
    'rev.doneN': ['{n} sak klar den här veckan.|{n} saker klara den här veckan.', '{n} thing done this week.|{n} things done this week.'],
    'rev.postponed': ['Flyttas om och om igen', 'Keeps getting moved'],
    'rev.postponedN': ['flyttad {n} gånger', 'moved {n} times'],
    'rev.overloaded': ['Överfulla dagar', 'Overloaded days'],
    'rev.overloadedLine': ['{day}: {n} saker flyttades vidare', '{day}: {n} things moved on'],
    'rev.routines': ['Rutiner', 'Routines'],
    'rev.routineLine': ['{done} av {days} dagar', '{done} of {days} days'],
    'rev.unfinished': ['Viktigt och fortfarande öppet', 'Important and still open'],
    'rev.patterns': ['Förslag', 'Suggestions'],
    'rev.energy': ['Snittenergi {e} av 5 över {n} incheckningar.', 'Average energy {e} of 5 across {n} check-ins.'],
    'rev.markDone': ['Veckan är genomgången', 'Mark the week reviewed'],
    'rev.reviewed': ['Veckan är genomgången.', 'Week reviewed.'],
    'rev.empty': ['För lite data den här veckan för att säga något. Det kommer.', 'Too little data this week to say much yet. It will come.'],
    'rev.smaller': ['Gör mindre', 'Make smaller'],
    'rev.schedule': ['Ge den en dag', 'Give it a day'],
    'rev.drop': ['Släpp', 'Let go'],
    'rev.apply': ['Gör så', 'Apply'],
  });

  UI.view('evening', {
    tab: 'life',
    render(state) {
      const r = A.evening.eveningReset(state, UI.ui.now);
      const key = r.date;
      const done = r.done;
      const reflectOn = M.moduleOn(state, 'reflection');
      return `${UI.backHeader(t('eve.title'), t('eve.eyebrow'))}
        <section class="section">${UI.sectionHead(t('eve.done'))}
          <p class="calm-line">${esc(done.length ? t('eve.doneN', { n: done.length }) : t('eve.doneNone'))}${r.routineSteps ? ` ${esc(t('eve.routineSteps', { n: r.routineSteps }))}` : ''}</p>
          ${done.length ? `<div class="panel soft">${done.slice(0, 8).map((i) => UI.itemRow(i, { meta: '' })).join('')}</div>` : ''}
        </section>
        <section class="section">${UI.sectionHead(t('eve.open'), r.unfinished.length > 1 ? `<button class="btn tiny ghost" data-action="eve-move-all">${esc(t('eve.moveAll'))}</button>` : '')}
          ${r.unfinished.length ? `<div class="panel">${r.unfinished.map(({ item }) => `<div class="row item stack-row">
              <button class="row-main" data-action="item-open" data-id="${esc(item.id)}"><span class="title">${esc(item.title)}</span><span class="sub">${esc(UI.itemMeta(item))}</span></button>
              <div class="btnrow tight">
                <button class="btn tiny ghost" data-action="eve-move" data-id="${esc(item.id)}" data-to="tomorrow">${esc(t('eve.tomorrow'))}</button>
                <button class="btn tiny ghost" data-action="eve-move" data-id="${esc(item.id)}" data-to="later">${esc(t('eve.later'))}</button>
                <button class="btn tiny quiet" data-action="eve-drop" data-id="${esc(item.id)}">${esc(t('eve.drop'))}</button>
                <button class="btn tiny quiet" data-action="item-done" data-id="${esc(item.id)}">${esc(t('a.done'))}</button>
              </div></div>`).join('')}</div>` : `<p class="calm-line">${esc(t('eve.openNone'))}</p>`}
        </section>
        <section class="section">${UI.sectionHead(t('eve.mind'))}
          <div class="capture-box small">
            <label class="sr" for="eve-mind">${esc(t('eve.mind'))}</label>
            <textarea id="eve-mind" class="input" rows="3" data-model="eve.mind" placeholder="${esc(t('eve.mindPh'))}">${esc(UI.draft('eve.mind'))}</textarea>
            <div class="capture-bar">${V.voiceButton('eve.mind')}<div class="grow"></div><button class="btn small ghost" data-action="eve-mind">${esc(t('eve.mindSave'))}</button></div>
          </div>
        </section>
        <section class="section">${UI.sectionHead(t('eve.tomorrowTitle'))}
          <div class="panel soft">
            <div class="row"><span class="row-main"><span class="title">${esc(r.tomorrow.first ? t('eve.first', { title: r.tomorrow.first.title, at: r.tomorrow.first.at }) : t('eve.nothingFixed'))}</span>
              <span class="sub">${esc(t('eve.wake', { at: r.tomorrow.wake }))}</span></span></div>
            ${r.tomorrow.must.map((i) => `<div class="row"><span class="row-main"><span class="title">${esc(i.title)}</span><span class="sub">${esc(t('bucket.must'))}</span></span></div>`).join('')}
          </div>
          <div class="field"><label class="label" for="eve-int">${esc(t('eve.intention'))}</label>
            <input id="eve-int" class="input" data-model="eve.intention" value="${esc(UI.draft('eve.intention', r.intention))}" maxlength="200"></div>
        </section>
        ${r.routine ? `<button class="row link-row" data-action="go" data-view="routine" data-id="${esc(r.routine.routine.id)}">${icon('routine', 20)}<span class="grow">${esc(r.routine.routine.name)}</span><span class="sub">${esc(r.routine.complete ? t('rt.complete') : t('now.routineDetail', { n: r.routine.remaining, min: I.duration(r.routine.minutesLeft) }))}</span>${icon('chevron', 18)}</button>` : ''}
        ${reflectOn ? `<button class="row link-row" data-action="go" data-view="reflect">${icon('reflect', 20)}<span class="grow">${esc(t('eve.reflect'))}</span>${icon('chevron', 18)}</button>` : ''}
        <div class="stack pad-top"><button class="btn primary wide" data-action="eve-finish">${icon('moon', 18)}${esc(t('eve.finish'))}</button></div>`;
    },
  });

  UI.action('eve-move', (el) => { UI.commit([{ op: 'item.postpone', id: el.dataset.id, to: el.dataset.to }]); });
  UI.action('eve-drop', (el) => { UI.commit([{ op: 'item.drop', id: el.dataset.id }]); });
  UI.action('eve-move-all', () => { UI.commit(A.evening.moveAllOps(S.state, new Date())); });
  UI.action('eve-mind', () => {
    const text = UI.draft('eve.mind').trim();
    if (!text) return true;
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 20);
    UI.commit(lines.map((l) => ({ op: 'item.add', item: { kind: 'note', title: l.slice(0, 140), status: 'inbox', source: 'evening' } })), { message: t('cap.inboxed') });
    UI.clearDraft('eve.mind');
  });
  UI.action('eve-finish', () => {
    const key = UI.today();
    const ops = [{ op: 'day.evening', date: key, done: true }];
    const intention = UI.draft('eve.intention').trim();
    if (intention) ops.push({ op: 'day.intention', date: U.addDays(key, 1), text: intention });
    const mind = UI.draft('eve.mind').trim();
    if (mind) ops.push({ op: 'item.add', item: { kind: 'note', title: mind.slice(0, 140), status: 'inbox', source: 'evening' } });
    UI.clearDraft('eve.intention'); UI.clearDraft('eve.mind');
    UI.commit(ops, { message: t('eve.finished') });
    UI.go('home');
    return true;
  });

  /* ---------------- Weekly review ---------------- */

  UI.view('review', {
    tab: 'life',
    render(state) {
      const r = A.review.weeklyReview(state, UI.ui.now);
      const key = UI.today();
      const parts = [];
      parts.push(`<section class="section">${UI.sectionHead(t('rev.done'))}
        <p class="calm-line">${esc(t('rev.doneN', { n: r.doneCount }))}</p>
        ${r.done.length ? `<div class="panel soft">${r.done.slice(0, 10).map((i) => UI.itemRow(i, { noTick: true, meta: '' })).join('')}</div>` : ''}
        ${r.energy ? `<p class="faint">${esc(t('rev.energy', { e: String(r.energy).replace('.', I.language() === 'sv' ? ',' : '.'), n: r.pulses }))}</p>` : ''}</section>`);
      if (r.postponed.length) {
        parts.push(`<section class="section">${UI.sectionHead(t('rev.postponed'))}<div class="panel">${r.postponed.map(({ item, count }) => `<div class="row item stack-row">
          <button class="row-main" data-action="item-open" data-id="${esc(item.id)}"><span class="title">${esc(item.title)}</span><span class="sub">${esc(t('rev.postponedN', { n: count }))}</span></button>
          <div class="btnrow tight"><button class="btn tiny ghost" data-action="rev-smaller" data-id="${esc(item.id)}">${esc(t('rev.smaller'))}</button>
            <button class="btn tiny ghost" data-action="rev-schedule" data-id="${esc(item.id)}">${esc(t('rev.schedule'))}</button>
            <button class="btn tiny quiet" data-action="eve-drop" data-id="${esc(item.id)}">${esc(t('rev.drop'))}</button></div></div>`).join('')}</div></section>`);
      }
      if (r.overloaded.length) {
        parts.push(`<section class="section">${UI.sectionHead(t('rev.overloaded'))}<div class="panel soft">${r.overloaded.map((d) => `<div class="row"><span class="row-main"><span class="title">${esc(t('rev.overloadedLine', { day: U.capitalize(I.dayName(d.date)), n: d.moves }))}</span></span></div>`).join('')}</div></section>`);
      }
      if (r.routines.length) {
        parts.push(`<section class="section">${UI.sectionHead(t('rev.routines'))}<div class="panel soft">${r.routines.map((x) => `<div class="row"><span class="row-main"><span class="title">${esc(x.routine.name)}</span>
          <span class="sub">${esc(t('rev.routineLine', { done: x.completed, days: x.applicable }))}</span></span><span class="meter-bar" aria-hidden="true"><span style="width:${Math.round((x.rate || 0) * 100)}%"></span></span></div>`).join('')}</div></section>`);
      }
      if (r.unfinishedImportant.length) {
        parts.push(`<section class="section">${UI.sectionHead(t('rev.unfinished'))}<div class="panel">${r.unfinishedImportant.map((i) => UI.itemRow(i)).join('')}</div></section>`);
      }
      const obs = r.observations.filter((o) => o.actions.length);
      if (obs.length) {
        parts.push(`<section class="section">${UI.sectionHead(t('rev.patterns'))}${obs.slice(0, 4).map((o) => `<div class="suggest pattern"><p>${esc(I.msg(o.text))}</p>
          <div class="btnrow">${o.actions.map((a, i) => `<button class="btn small ${i === 0 ? 'primary' : 'ghost'}" data-action="pattern-act" data-key="${esc(o.key)}" data-index="${i}">${esc(I.msg(a.label))}</button>`).join('')}
          <button class="btn small quiet" data-action="pattern-dismiss" data-key="${esc(o.key)}">${esc(t('a.noThanks'))}</button></div></div>`).join('')}</section>`);
      }
      const thin = r.doneCount + r.postponed.length + r.routines.length === 0;
      return `${UI.backHeader(t('rev.title'), t('rev.eyebrow', { from: I.shortDate(r.week) }))}
        ${thin ? `<p class="muted pad">${esc(t('rev.empty'))}</p>` : parts.join('')}
        <div class="stack pad-top">${r.reviewed ? `<p class="calm-line center">${esc(t('rev.reviewed'))}</p>` : `<button class="btn primary wide" data-action="rev-done" data-week="${esc(r.week)}">${esc(t('rev.markDone'))}</button>`}</div>`;
    },
  });

  UI.action('rev-smaller', (el) => { UI.openSheet('item', { id: el.dataset.id, split: true }); return true; });
  UI.action('rev-schedule', (el) => {
    const item = M.itemById(S.state, el.dataset.id);
    if (!item) return true;
    const to = A.planner.nextGoodDay(S.state, UI.today(), item);
    UI.commit([{ op: 'item.schedule', id: item.id, date: to }]);
  });
  UI.action('rev-done', (el) => { UI.commit([{ op: 'meta.review', week: el.dataset.week }], { message: t('op.review') }); });
})(typeof globalThis !== 'undefined' ? globalThis : this);
