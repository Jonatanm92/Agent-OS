/* Aura — Projects (next actions, not plans) and Routines (adaptive, never nagging). */
(function (root) {
  const A = root.Aura;
  const U = A.util, I = A.i18n, M = A.model, It = A.items, S = A.store, icon = A.icon;
  const UI = A.ui;
  const { esc, t } = UI;

  I.add({
    'pj.title': ['Projekt', 'Projects'],
    'pj.eyebrow': ['Större saker, ett steg i taget', 'Bigger things, one step at a time'],
    'pj.new': ['Nytt projekt', 'New project'],
    'pj.empty': ['Inga projekt än. Ett projekt är något som inte går att göra på en gång — Aura visar bara nästa steg.', "No projects yet. A project is something that can't be done in one go — Aura only shows the next step."],
    'pj.next': ['Nästa steg', 'Next step'],
    'pj.noNext': ['Inget nästa steg. Vad är det minsta som för det framåt?', "No next step. What's the smallest thing that moves it forward?"],
    'pj.progress': ['{done} av {total} steg klara', '{done} of {total} steps done'],
    'pj.paused': ['Pausade', 'Paused'],
    'pj.done': ['Klara', 'Done'],
    'pj.outcome': ['Hur ser det ut när det är klart?', 'What does done look like?'],
    'pj.name': ['Vad heter projektet?', "What's the project called?"],
    'pj.namePh': ['t.ex. Ordna sovrummet', 'e.g. Sort out the bedroom'],
    'pj.outcomePh': ['t.ex. Ett lugnt sovrum utan högar', 'e.g. A calm bedroom without piles'],
    'pj.first': ['Första steget (frivilligt)', 'First step (optional)'],
    'pj.firstPh': ['t.ex. Töm stolen med kläder', 'e.g. Clear the clothes chair'],
    'pj.create': ['Skapa', 'Create'],
    'pj.steps': ['Resten av stegen', 'The other steps'],
    'pj.addStep': ['Lägg till ett steg …', 'Add a step …'],
    'pj.status': ['Läge', 'Status'],
    'pj.st.active': ['Pågår', 'Active'],
    'pj.st.paused': ['Pausat', 'Paused'],
    'pj.st.done': ['Klart', 'Done'],
    'pj.delete': ['Ta bort projektet', 'Delete project'],
    'pj.deleteQ': ['Ta bort projektet?', 'Delete the project?'],
    'pj.deleteBody': ['Stegen finns kvar som vanliga saker.', 'The steps stay as ordinary items.'],
    'pj.editOutcome': ['Ändra', 'Edit'],
    'pj.needName': ['Ge projektet ett namn.', 'Give the project a name.'],

    'rtv.title': ['Rutiner', 'Routines'],
    'rtv.eyebrow': ['Skrivs in en gång, anpassar sig varje dag', 'Written once, adapts every day'],
    'rtv.today': ['I dag', 'Today'],
    'rtv.all': ['Alla rutiner', 'All routines'],
    'rtv.none': ['Inga rutiner än. Börja med ett förslag nedan — du kan ändra allt.', 'No routines yet. Start from a suggestion below — you can change everything.'],
    'rtv.templates': ['Förslag', 'Suggestions'],
    'rtv.new': ['Egen rutin', 'Custom routine'],
    'rtv.full': ['Hela', 'Full'],
    'rtv.short': ['Kort', 'Short'],
    'rtv.skip': ['Hoppa över', 'Skip'],
    'rtv.unskip': ['Ta med', 'Include'],
    'rtv.progress': ['{done} av {total}', '{done} of {total}'],
    'rtv.notToday': ['Inte i dag', 'Not today'],
    'rtv.window': ['brukar vara {from}–{to}', 'usually {from}–{to}'],
    'rtv.anyTime': ['när som helst', 'any time'],
    'rtv.edit': ['Ändra rutinen', 'Edit routine'],
    'rtv.name': ['Namn', 'Name'],
    'rtv.from': ['Brukar börja', 'Usually starts'],
    'rtv.to': ['Senast', 'Until'],
    'rtv.days': ['Dagar (inga valda = alla)', 'Days (none selected = every day)'],
    'rtv.dayType': ['Gäller', 'Applies on'],
    'rtv.dt.any': ['Alla dagar', 'Any day'],
    'rtv.dt.work': ['Arbetsdagar', 'Workdays'],
    'rtv.dt.free': ['Lediga dagar', 'Free days'],
    'rtv.steps': ['Steg', 'Steps'],
    'rtv.core': ['Kärna', 'Core'],
    'rtv.optional': ['Extra', 'Extra'],
    'rtv.coreHint': ['Kärnsteg finns kvar i den korta versionen.', 'Core steps stay in the short version.'],
    'rtv.addStep': ['Nytt steg …', 'New step …'],
    'rtv.delete': ['Ta bort rutinen', 'Delete routine'],
    'rtv.deleteQ': ['Ta bort rutinen?', 'Delete the routine?'],
    'rtv.created': ['Rutinen är tillagd. Ändra den som du vill.', 'Routine added. Change it however you like.'],
    'rtv.needName': ['Rutinen behöver ett namn och minst ett steg.', 'The routine needs a name and at least one step.'],
    'rtv.removeStep': ['Ta bort steget', 'Remove step'],
    'rtv.done': ['Klar för i dag.', 'Done for today.'],
  });

  /* ---------------- Projects ---------------- */

  function projectCard(state, p) {
    const next = It.nextAction(state, p.id);
    const prog = It.projectProgress(state, p.id);
    return `<div class="project-card">
      <button class="project-head" data-action="go" data-view="project" data-id="${esc(p.id)}">
        <span class="title">${esc(p.title)}</span>${p.outcome ? `<span class="sub">${esc(p.outcome)}</span>` : ''}
        ${prog.total ? `<span class="meter-bar" aria-label="${esc(t('pj.progress', prog))}"><span style="width:${Math.round((prog.done / prog.total) * 100)}%"></span></span>` : ''}
      </button>
      ${next ? `<div class="next-line"><span class="label">${esc(t('pj.next'))}</span>${UI.itemRow(next, { noProject: true })}</div>`
        : `<button class="next-line empty" data-action="go" data-view="project" data-id="${esc(p.id)}"><span class="muted">${esc(t('pj.noNext'))}</span></button>`}
    </div>`;
  }

  UI.view('projects', {
    tab: 'life',
    render(state) {
      const active = state.projects.filter((p) => p.status === 'active');
      const paused = state.projects.filter((p) => p.status === 'paused');
      const done = state.projects.filter((p) => p.status === 'done');
      const small = (list) => `<div class="panel soft">${list.map((p) => `<button class="row link-row" data-action="go" data-view="project" data-id="${esc(p.id)}"><span class="grow">${esc(p.title)}</span>${icon('chevron', 16)}</button>`).join('')}</div>`;
      return `${UI.backHeader(t('pj.title'), t('pj.eyebrow'), `<button class="btn small ghost" data-action="sheet" data-sheet="project-new">${icon('plus', 16)}${esc(t('pj.new'))}</button>`)}
        ${active.length ? `<div class="stack">${active.map((p) => projectCard(state, p)).join('')}</div>` : `<p class="muted pad">${esc(t('pj.empty'))}</p>`}
        ${paused.length ? `<section class="section">${UI.sectionHead(t('pj.paused'))}${small(paused)}</section>` : ''}
        ${done.length ? `<section class="section">${UI.sectionHead(t('pj.done'))}${small(done)}</section>` : ''}`;
    },
  });

  UI.sheet('project-new', {
    render(data) {
      return {
        title: t('pj.new'),
        body: `<div class="stack">
          <div class="field"><label class="label" for="pj-name">${esc(t('pj.name'))}</label><input id="pj-name" class="input big" data-model="pj.name" placeholder="${esc(t('pj.namePh'))}" value="${esc(UI.draft('pj.name'))}" maxlength="80" data-autofocus></div>
          <div class="field"><label class="label" for="pj-out">${esc(t('pj.outcome'))}</label><input id="pj-out" class="input" data-model="pj.outcome" placeholder="${esc(t('pj.outcomePh'))}" value="${esc(UI.draft('pj.outcome'))}" maxlength="200"></div>
          <div class="field"><label class="label" for="pj-first">${esc(t('pj.first'))}</label><input id="pj-first" class="input" data-model="pj.first" placeholder="${esc(t('pj.firstPh'))}" value="${esc(UI.draft('pj.first'))}" maxlength="120"></div>
          ${data.error ? `<div class="warn-line">${esc(data.error)}</div>` : ''}
          <button class="btn primary wide" data-action="pj-create">${esc(t('pj.create'))}</button></div>`,
      };
    },
  });
  UI.action('pj-create', () => {
    const title = UI.draft('pj.name').trim();
    if (!title) { UI.ui.sheet.data.error = t('pj.needName'); UI.renderSheet(); return true; }
    const res = S.commit([{ op: 'project.add', project: { title, outcome: UI.draft('pj.outcome').trim() } }], { now: new Date() });
    const pid = res.ids[0];
    const first = UI.draft('pj.first').trim();
    if (first) S.commit([{ op: 'item.add', item: { title: first, projectId: pid, minutes: 15, source: 'manual' } }], { now: new Date(), system: true });
    for (const k of ['pj.name', 'pj.outcome', 'pj.first']) UI.clearDraft(k);
    UI.ui.sheet = null;
    UI.toast(t('op.projectAdd', { title }), { undo: true });
    UI.go('project', { id: pid });
    return true;
  });

  UI.view('project', {
    tab: 'life',
    render(state, params) {
      const p = M.projectById(state, params.id);
      if (!p) return `${UI.backHeader(t('pj.title'))}<p class="muted pad">${esc(t('item.gone'))}</p>`;
      const actions = It.projectActions(state, p.id);
      const next = actions[0];
      const done = state.items.filter((i) => i.projectId === p.id && i.status === 'done');
      const prog = It.projectProgress(state, p.id);
      return `${UI.backHeader(p.title, prog.total ? t('pj.progress', prog) : '')}
        ${p.outcome ? `<p class="lead outcome">${esc(p.outcome)}</p>` : ''}
        <section class="section">${UI.sectionHead(t('pj.next'))}
          ${next ? `<div class="panel next-panel">${UI.itemRow(next, { noProject: true, trailing: `<button class="btn tiny ghost" data-action="now-do" data-id="${esc(next.id)}">${esc(t('now.doIt'))}</button>` })}</div>`
            : `<p class="muted">${esc(t('pj.noNext'))}</p>`}
        </section>
        <div class="quickadd">
          <label class="sr" for="pj-step">${esc(t('pj.addStep'))}</label>
          <input id="pj-step" class="input" data-model="pj.step" data-enter="pj-step" data-id="${esc(p.id)}" placeholder="${esc(t('pj.addStep'))}" value="${esc(UI.draft('pj.step'))}" autocomplete="off">
          <button class="icon-btn solid" data-action="pj-step" data-id="${esc(p.id)}" aria-label="${esc(t('a.add'))}">${icon('plus', 22)}</button>
        </div>
        ${actions.length > 1 ? `<section class="section">${UI.sectionHead(t('pj.steps'))}<div class="panel soft">${actions.slice(1).map((i) => UI.itemRow(i, { noProject: true })).join('')}</div></section>` : ''}
        ${done.length ? `<section class="section">${UI.sectionHead(t('pj.done'))}<div class="panel soft">${done.map((i) => UI.itemRow(i, { noProject: true, meta: '' })).join('')}</div></section>` : ''}
        <section class="section">${UI.sectionHead(t('pj.status'))}
          ${UI.chips(['active', 'paused', 'done'].map((v) => ({ v, t: t(`pj.st.${v}`) })), p.status, 'pj-status', `data-id="${esc(p.id)}"`)}</section>
        <div class="btnrow gap-top"><button class="btn quiet small" data-action="sheet" data-sheet="project-edit" data-id="${esc(p.id)}">${icon('edit', 16)}${esc(t('a.edit'))}</button>
          <button class="btn quiet small danger" data-action="pj-delete" data-id="${esc(p.id)}">${icon('trash', 16)}${esc(t('pj.delete'))}</button></div>`;
    },
  });

  UI.sheet('project-edit', {
    render(data, state) {
      const p = M.projectById(state, data.id);
      if (!p) return null;
      return {
        title: t('a.edit'),
        body: `<div class="stack">
          <div class="field"><label class="label" for="pje-name">${esc(t('pj.name'))}</label><input id="pje-name" class="input big" data-model="pje.name" value="${esc(UI.draft('pje.name', p.title))}" maxlength="80"></div>
          <div class="field"><label class="label" for="pje-out">${esc(t('pj.outcome'))}</label><input id="pje-out" class="input" data-model="pje.outcome" value="${esc(UI.draft('pje.outcome', p.outcome))}" maxlength="200"></div>
          <button class="btn primary wide" data-action="pj-save" data-id="${esc(p.id)}">${esc(t('a.save'))}</button></div>`,
      };
    },
    onClose() { UI.clearDraft('pje.name'); UI.clearDraft('pje.outcome'); },
  });
  UI.action('pj-save', (el) => {
    const p = M.projectById(S.state, el.dataset.id);
    const patch = { title: UI.draft('pje.name', p.title).trim() || p.title, outcome: UI.draft('pje.outcome', p.outcome).trim() };
    UI.closeSheet();
    UI.commit([{ op: 'project.update', id: el.dataset.id, patch }]);
    return true;
  });
  UI.action('pj-step', (el) => {
    const text = UI.draft('pj.step').trim();
    if (!text) return true;
    UI.clearDraft('pj.step');
    const actions = It.projectActions(S.state, el.dataset.id);
    const c = A.parse.quick(S.state, text, new Date());
    UI.commit([{ op: 'item.add', item: { title: c.title, projectId: el.dataset.id, minutes: c.minutes || 15, energy: c.energy, dueDate: c.dueDate, date: c.date, order: actions.length, source: 'manual' } }]);
  });
  UI.action('pj-status', (el) => { UI.commit([{ op: 'project.update', id: el.dataset.id, patch: { status: el.dataset.value } }]); });
  UI.action('pj-delete', async (el) => {
    const ok = await UI.confirm({ title: t('pj.deleteQ'), body: t('pj.deleteBody'), yes: t('a.delete'), danger: true });
    if (!ok) return true;
    UI.commit([{ op: 'project.delete', id: el.dataset.id }]);
    UI.go('projects', {}, { replace: true });
    return true;
  });

  /* ---------------- Routines ---------------- */

  UI.view('routines', {
    tab: 'life',
    render(state) {
      const todays = A.routines.todays(state, UI.ui.now);
      const todayIds = new Set(todays.map((v) => v.routine.id));
      const others = state.routines.filter((r) => !todayIds.has(r.id));
      const have = new Set(state.routines.map((r) => r.kind));
      const templates = A.routines.templateKinds().filter((k) => !have.has(k));
      const win = (r) => (r.start ? t('rtv.window', { from: r.start, to: r.end || U.toClock(U.toMinutes(r.start) + 90) }) : t('rtv.anyTime'));
      return `${UI.backHeader(t('rtv.title'), t('rtv.eyebrow'))}
        ${todays.length ? `<section class="section">${UI.sectionHead(t('rtv.today'))}<div class="panel">${todays.map((v) => `<button class="row link-row" data-action="go" data-view="routine" data-id="${esc(v.routine.id)}">
          <span class="ring" style="--p:${v.total ? Math.round((v.done / v.total) * 100) : 0}"><span class="mono">${v.done}/${v.total}</span></span>
          <span class="row-main"><span class="title">${esc(v.routine.name)}</span><span class="sub">${esc(v.complete ? t('rtv.done') : `${win(v.routine)}${v.variant === 'short' ? ` · ${t(v.reason)}` : ''}`)}</span></span>${icon('chevron', 16)}</button>`).join('')}</div></section>` : ''}
        ${others.length ? `<section class="section">${UI.sectionHead(t('rtv.all'))}<div class="panel soft">${others.map((r) => `<button class="row link-row" data-action="go" data-view="routine" data-id="${esc(r.id)}"><span class="row-main"><span class="title">${esc(r.name)}</span><span class="sub">${esc(t('rtv.notToday'))}</span></span>${icon('chevron', 16)}</button>`).join('')}</div></section>` : ''}
        ${!state.routines.length ? `<p class="muted pad">${esc(t('rtv.none'))}</p>` : ''}
        <section class="section">${UI.sectionHead(t('rtv.templates'))}
          <div class="chips">${templates.map((k) => `<button class="chip" data-action="rt-template" data-kind="${k}">${icon('plus', 14)}${esc(t(`rt.${k}`))}</button>`).join('')}
          <button class="chip" data-action="rt-new">${icon('edit', 14)}${esc(t('rtv.new'))}</button></div></section>`;
    },
  });

  UI.action('rt-template', (el) => {
    const tpl = A.routines.template(el.dataset.kind);
    const res = UI.commit([{ op: 'routine.add', routine: tpl }], { message: t('rtv.created') });
    if (res.ids[0]) { UI.go('routine', { id: res.ids[0] }); return true; }
  });
  UI.action('rt-new', () => {
    const res = UI.commit([{ op: 'routine.add', routine: { name: t('rt.custom'), kind: 'custom', steps: [] } }], { silent: true });
    if (res.ids[0]) { UI.go('routine', { id: res.ids[0] }); UI.openSheet('routine-edit', { id: res.ids[0] }); return true; }
  });

  UI.view('routine', {
    tab: 'life',
    render(state, params) {
      const r = M.routineById(state, params.id);
      if (!r) return `${UI.backHeader(t('rtv.title'))}<p class="muted pad">${esc(t('item.gone'))}</p>`;
      const v = A.routines.view(state, r, UI.ui.now);
      const applies = A.routines.appliesOn(state, r, UI.today());
      const hasOptional = r.steps.some((s) => !s.core);
      return `${UI.backHeader(r.name, applies ? t('rtv.progress', { done: v.done, total: v.total }) : t('rtv.notToday'), `<button class="icon-btn" data-action="sheet" data-sheet="routine-edit" data-id="${esc(r.id)}" aria-label="${esc(t('rtv.edit'))}">${icon('edit', 20)}</button>`)}
        ${hasOptional ? UI.chips([{ v: 'full', t: t('rtv.full') }, { v: 'short', t: t('rtv.short') }], v.variant, 'rt-variant', `data-id="${esc(r.id)}"`) : ''}
        <p class="calm-line">${esc(t(v.reason))}</p>
        <div class="progress"><span style="width:${v.total ? (v.done / v.total) * 100 : 0}%"></span></div>
        <div class="panel">${v.steps.map((s) => `<div class="row item${s.done ? ' is-done' : ''}${s.skipped ? ' is-skipped' : ''}">
          <button class="tick${s.done ? ' done' : ''}" data-action="rt-check" data-id="${esc(r.id)}" data-step="${esc(s.id)}" data-done="${s.done ? 1 : 0}" aria-label="${esc(s.label)}" ${s.skipped ? 'disabled' : ''}></button>
          <span class="row-main"><span class="title">${esc(s.label)}</span><span class="sub">${esc(UI.approx(s.minutes))}${s.core ? '' : ` · ${esc(t('rtv.optional'))}`}</span></span>
          ${s.done ? '' : `<button class="btn tiny quiet" data-action="rt-skip" data-id="${esc(r.id)}" data-step="${esc(s.id)}" data-skip="${s.skipped ? 0 : 1}">${esc(s.skipped ? t('rtv.unskip') : t('rtv.skip'))}</button>`}
        </div>`).join('')}</div>`;
    },
  });

  UI.action('rt-check', (el) => { UI.commit([{ op: 'routine.check', routineId: el.dataset.id, stepId: el.dataset.step, done: el.dataset.done !== '1', date: UI.today() }], { silent: true }); });
  UI.action('rt-skip', (el) => { UI.commit([{ op: 'routine.skip', routineId: el.dataset.id, stepId: el.dataset.step, skip: el.dataset.skip === '1', date: UI.today() }], { silent: true }); });
  UI.action('rt-variant', (el) => { UI.commit([{ op: 'routine.variant', routineId: el.dataset.id, variant: el.dataset.value, date: UI.today() }], { silent: true }); });

  const WEEK = [1, 2, 3, 4, 5, 6, 0];

  UI.sheet('routine-edit', {
    render(data, state) {
      const r = M.routineById(state, data.id);
      if (!r) return null;
      if (!data.v) data.v = { name: r.name, start: r.start, end: r.end, weekdays: r.weekdays.slice(), dayType: r.dayType, steps: r.steps.map((s) => ({ ...s })) };
      const v = data.v;
      return {
        title: t('rtv.edit'), tall: true,
        body: `<div class="stack">
          <div class="field"><label class="label" for="rte-name">${esc(t('rtv.name'))}</label><input id="rte-name" class="input big" data-model="rte.name" value="${esc(UI.draft('rte.name', v.name))}" maxlength="60"></div>
          <div class="grid2">
            <div class="field"><label class="label" for="rte-from">${esc(t('rtv.from'))}</label><input id="rte-from" class="input" type="time" data-model="rte.start" value="${esc(UI.draft('rte.start', v.start))}"></div>
            <div class="field"><label class="label" for="rte-to">${esc(t('rtv.to'))}</label><input id="rte-to" class="input" type="time" data-model="rte.end" value="${esc(UI.draft('rte.end', v.end))}"></div></div>
          <div class="field"><div class="label">${esc(t('rtv.days'))}</div><div class="daypick">${WEEK.map((d) => `<button class="${v.weekdays.includes(d) ? 'on' : ''}" data-action="rte-day" data-day="${d}" aria-pressed="${v.weekdays.includes(d)}">${esc(I.weekdayShort(d))}</button>`).join('')}</div></div>
          <div class="field"><div class="label">${esc(t('rtv.dayType'))}</div>${UI.chips(['any', 'work', 'free'].map((x) => ({ v: x, t: t(`rtv.dt.${x}`) })), v.dayType, 'rte-daytype')}</div>
          <div class="field"><div class="label">${esc(t('rtv.steps'))}</div><p class="faint">${esc(t('rtv.coreHint'))}</p>
            <div class="panel">${v.steps.map((s, i) => `<div class="row">
              <input class="input bare" id="rte-step-${i}" data-model="rte.step:${s.id}" value="${esc(UI.draft(`rte.step:${s.id}`, s.label))}" aria-label="${esc(t('rtv.steps'))} ${i + 1}" maxlength="80">
              <button class="chip small${s.core ? ' on' : ''}" data-action="rte-core" data-index="${i}" aria-pressed="${s.core}">${esc(s.core ? t('rtv.core') : t('rtv.optional'))}</button>
              <button class="icon-btn small" data-action="rte-remove" data-index="${i}" aria-label="${esc(t('rtv.removeStep'))}">${icon('close', 16)}</button></div>`).join('')}</div>
            <div class="quickadd gap-top"><label class="sr" for="rte-add">${esc(t('rtv.addStep'))}</label>
              <input id="rte-add" class="input" data-model="rte.add" data-enter="rte-add" placeholder="${esc(t('rtv.addStep'))}" value="${esc(UI.draft('rte.add'))}">
              <button class="icon-btn solid" data-action="rte-add" aria-label="${esc(t('a.add'))}">${icon('plus', 20)}</button></div></div>
          ${data.error ? `<div class="warn-line">${esc(data.error)}</div>` : ''}
          <div class="btnrow"><button class="btn primary" data-action="rte-save">${esc(t('a.save'))}</button>
            <button class="btn quiet danger" data-action="rte-delete">${icon('trash', 16)}${esc(t('rtv.delete'))}</button></div>
        </div>`,
      };
    },
    onClose(data) {
      for (const k of Object.keys(UI.ui.drafts)) if (k.startsWith('rte.')) UI.clearDraft(k);
      if (data) data.v = null;
    },
  });

  function rteSync() {
    const v = UI.ui.sheet.data.v;
    v.name = UI.draft('rte.name', v.name);
    v.start = UI.draft('rte.start', v.start);
    v.end = UI.draft('rte.end', v.end);
    v.steps = v.steps.map((s) => ({ ...s, label: UI.draft(`rte.step:${s.id}`, s.label) }));
    return v;
  }
  UI.action('rte-day', (el) => {
    const v = rteSync(); const d = Number(el.dataset.day);
    v.weekdays = v.weekdays.includes(d) ? v.weekdays.filter((x) => x !== d) : [...v.weekdays, d];
    UI.renderSheet(); return true;
  });
  UI.action('rte-daytype', (el) => { rteSync().dayType = el.dataset.value; UI.renderSheet(); return true; });
  UI.action('rte-core', (el) => { const v = rteSync(); const s = v.steps[Number(el.dataset.index)]; if (s) s.core = !s.core; UI.renderSheet(); return true; });
  UI.action('rte-remove', (el) => { const v = rteSync(); v.steps.splice(Number(el.dataset.index), 1); UI.renderSheet(); return true; });
  UI.action('rte-add', () => {
    const v = rteSync();
    const label = UI.draft('rte.add').trim();
    if (!label) return true;
    UI.clearDraft('rte.add');
    v.steps.push(M.newStep({ label, minutes: 5, core: true }));
    UI.renderSheet(); return true;
  });
  UI.action('rte-save', () => {
    const s = UI.ui.sheet;
    const v = rteSync();
    const steps = v.steps.filter((x) => String(x.label).trim());
    if (!String(v.name).trim() || !steps.length) { s.data.error = t('rtv.needName'); UI.renderSheet(); return true; }
    const id = s.data.id;
    UI.closeSheet();
    UI.commit([{ op: 'routine.update', id, patch: { name: v.name, start: v.start, end: v.end, weekdays: v.weekdays, dayType: v.dayType, steps } }]);
    return true;
  });
  UI.action('rte-delete', async () => {
    const id = UI.ui.sheet.data.id;
    const ok = await UI.confirm({ title: t('rtv.deleteQ'), yes: t('a.delete'), danger: true });
    if (!ok) { UI.renderSheet(); return true; }
    UI.ui.sheet = null;
    UI.commit([{ op: 'routine.delete', id }]);
    UI.go('routines', {}, { replace: true });
    return true;
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
