/* Aura — Low Energy Mode and Chaos Mode. Both reduce pressure; neither adds any. */
(function (root) {
  const A = root.Aura;
  const U = A.util, I = A.i18n, M = A.model, It = A.items, E = A.engine, S = A.store, icon = A.icon;
  const UI = A.ui, V = A.views;
  const { esc, t } = UI;

  I.add({
    'low.title': ['Vi gör dagen mindre.', "Let's make today smaller."],
    'low.eyebrow': ['Låg energi', 'Low energy'],
    'low.must': ['Måste', 'Must'],
    'low.mustEmpty': ['Inget är verkligen nödvändigt i dag.', 'Nothing is truly necessary today.'],
    'low.tiny': ['En liten vinst', 'Tiny win'],
    'low.tinyEmpty': ['Ingen behövs. Vila räknas.', 'None needed. Rest counts.'],
    'low.moved': ['Flyttas', 'Moved'],
    'low.movedEmpty': ['Inget behöver flyttas.', 'Nothing needs to move.'],
    'low.safe': ['Inget tas bort. Allt kan tas tillbaka när du vill.', 'Nothing is deleted. You can bring anything back whenever you like.'],
    'low.apply': ['Gör så', 'Make it so'],
    'low.no': ['Inte i dag', 'Not today'],
    'low.applied': ['Dagen är mindre nu. Ta det i din takt.', 'Today is smaller now. Take it at your pace.'],
    'low.active': ['Dagen är redan mindre.', 'Today is already smaller.'],
    'low.activeLead': ['Det här är allt som behövs i dag:', 'This is all that is needed today:'],
    'low.rest': ['Allt annat kan vänta.', 'Everything else can wait.'],

    'chaos.title': ['En sak i taget', 'One thing at a time'],
    'chaos.eyebrow': ['Kaosläge', 'Chaos mode'],
    'chaos.dumpLead': ['Töm huvudet. Allt, i vilken ordning som helst. Aura sorterar.', 'Empty your head. Everything, in any order. Aura sorts it.'],
    'chaos.ph': ['Räkningar, tvätt, ringa skolan, köpa present …', 'Bills, laundry, call the school, buy a present …'],
    'chaos.organize': ['Sortera åt mig', 'Sort it for me'],
    'chaos.useExisting': ['Använd det som redan finns i dag', "Use what's already on today"],
    'chaos.looksRight': ['Ser rätt ut', 'Looks right'],
    'chaos.start': ['Börja här', 'Start here'],
    'chaos.progress': ['{done} av {total} avklarat', '{done} of {total} handled'],
    'chaos.skip': ['Senare', 'Later'],
    'chaos.showAll': ['Visa allt ({n})', 'Show everything ({n})'],
    'chaos.hideAll': ['Dölj resten', 'Hide the rest'],
    'chaos.finished': ['Det som brådskade är hanterat.', 'The urgent part is handled.'],
    'chaos.finishedLead': ['Resten kan vänta. Det ligger kvar i Min dag.', "The rest can wait. It's still in My day."],
    'chaos.end': ['Tillbaka till vanlig dag', 'Back to a normal day'],
    'chaos.nothing': ['Det finns inget att ta tag i just nu.', "There's nothing to deal with right now."],
  });

  /* ---------------- Low Energy ---------------- */

  UI.view('low', {
    tab: 'home',
    render(state) {
      const key = UI.today();
      const day = M.getDay(state, key);
      if (day.mode === 'low') {
        const b = It.dayBuckets(state, key);
        return `${UI.backHeader(t('low.active'), t('low.eyebrow'))}
          <p class="lead">${esc(t('low.activeLead'))}</p>
          <div class="panel">${[...b.must, ...b.good].length ? [...b.must, ...b.good].map((i) => UI.itemRow(i)).join('') : UI.emptyLine(t('low.mustEmpty'))}</div>
          <p class="calm-line">${esc(t('low.rest'))}</p>
          <button class="btn ghost wide" data-action="mode-set" data-value="">${esc(t('now.backToNormal'))}</button>`;
      }
      const p = E.lowEnergyPlan(state, UI.ui.now);
      const row = (title, sub) => `<div class="row"><span class="row-main"><span class="title">${esc(title)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</span></div>`;
      return `${UI.backHeader(t('low.title'), t('low.eyebrow'))}
        <section class="section">${UI.sectionHead(t('low.must'))}
          <div class="panel">${p.must.length ? p.must.map((i) => row(i.title, UI.itemMeta(i))).join('') : UI.emptyLine(t('low.mustEmpty'))}</div></section>
        <section class="section">${UI.sectionHead(t('low.tiny'))}
          <div class="panel soft">${p.tiny ? row(p.tinyText || p.tiny.title, UI.approx(p.tinyText ? 5 : E.effort(p.tiny))) : UI.emptyLine(t('low.tinyEmpty'))}</div></section>
        <section class="section">${UI.sectionHead(t('low.moved'))}
          <div class="panel soft">${p.moved.length ? p.moved.map((m) => row(m.title, `→ ${I.relativeDay(m.to, UI.today())}`)).join('') : UI.emptyLine(t('low.movedEmpty'))}</div></section>
        <p class="faint">${esc(t('low.safe'))}</p>
        <div class="btnrow"><button class="btn primary" data-action="low-apply">${icon('leaf', 17)}${esc(t('low.apply'))}</button>
          <button class="btn ghost" data-action="low-no">${esc(t('low.no'))}</button></div>`;
    },
  });

  UI.action('low-apply', () => {
    const p = E.lowEnergyPlan(S.state, new Date());
    UI.commit(p.ops, { message: t('low.applied') });
    UI.go('home');
    return true;
  });
  UI.action('low-no', () => {
    UI.commit([{ op: 'day.dismiss', date: UI.today(), key: 'mode:low' }], { silent: true, system: true });
    UI.back();
    return true;
  });

  /* ---------------- Chaos ---------------- */

  const ch = { result: null, busy: false, showAll: false, ctl: null };
  V.results.chaos = null;

  function chaosOne(state) {
    const cs = E.chaosState(state, UI.ui.now);
    if (!cs) return '';
    if (!cs.current) {
      return `${UI.backHeader(t('chaos.title'), t('chaos.eyebrow'))}
        <section class="now calm t-rest"><div class="glow" aria-hidden="true"></div><div class="now-kicker">${esc(t('chaos.progress', { done: cs.doneCount, total: cs.total }))}</div>
          <h2 class="now-title">${esc(t('chaos.finished'))}</h2><p class="now-why">${esc(t('chaos.finishedLead'))}</p>
          <div class="now-actions"><button class="btn ghost" data-action="chaos-end">${esc(t('chaos.end'))}</button></div></section>`;
    }
    const item = cs.current;
    const plan = A.planner.planDay(state, UI.ui.now);
    const ctx = { state, key: plan.dateKey, energy: plan.energy, next: plan.next, minutesUntilNext: plan.minutesUntilNext, business: E.businessHours(plan.dateKey, plan.nowMin) };
    const reason = E.reasonFor({ item, bucket: It.classify(state, item, plan.dateKey) || 'later' }, ctx, null);
    return `${UI.backHeader(t('chaos.title'), t('chaos.eyebrow'))}
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${cs.total}" aria-valuenow="${cs.doneCount}"><span style="width:${cs.total ? (cs.doneCount / cs.total) * 100 : 0}%"></span></div>
      <p class="faint mono center">${esc(t('chaos.progress', { done: cs.doneCount, total: cs.total }))}</p>
      <section class="now big t-task" aria-live="polite"><div class="glow" aria-hidden="true"></div><div class="now-kicker">${esc(t('chaos.start'))}</div>
        <h2 class="now-title">${esc(item.title)}</h2>
        <p class="now-why">${esc(I.msg(reason))}</p>
        <p class="now-meta mono">${esc(UI.approx(E.effort(item)))}</p>
        <div class="now-actions"><button class="btn signal" data-action="chaos-done" data-id="${esc(item.id)}">${icon('check', 18)}${esc(t('now.done'))}</button>
          <button class="btn ghost-on" data-action="chaos-skip" data-id="${esc(item.id)}">${esc(t('chaos.skip'))}</button></div>
      </section>
      ${cs.rest.length ? `<section class="section"><button class="btn quiet wide" data-action="chaos-toggle">${esc(ch.showAll ? t('chaos.hideAll') : t('chaos.showAll', { n: cs.rest.length }))}</button>
        ${ch.showAll ? `<div class="panel soft">${cs.rest.map((i) => UI.itemRow(i, { noTick: true })).join('')}</div>` : ''}</section>` : ''}`;
  }

  UI.view('chaos', {
    tab: 'home',
    render(state) {
      const day = M.getDay(state, UI.today());
      if (day.chaos) return chaosOne(state);
      if (ch.result) {
        V.results.chaos = ch.result;
        const n = ch.result.candidates.length;
        return `${UI.backHeader(n ? t('cap.found', { n }) : t('chaos.title'), t(ch.result.mode === 'ai' ? 'cap.modeAi' : 'cap.modeRules'))}
          ${n ? V.candidateList(ch.result, 'chaos') : `<p class="muted">${esc(t('cap.none'))}</p>`}
          <div class="btnrow"><button class="btn primary" data-action="chaos-confirm">${esc(t('chaos.looksRight'))}</button>
            <button class="btn quiet" data-action="chaos-reset">${esc(t('cap.again'))}</button></div>`;
      }
      const hasToday = E.chaosQueue(state, UI.ui.now).length > 0;
      return `${UI.backHeader(t('chaos.title'), t('chaos.eyebrow'))}
        <p class="lead">${esc(t('chaos.dumpLead'))}</p>
        <div class="capture-box${ch.busy ? ' busy' : ''}">
          <label class="sr" for="chaos-text">${esc(t('chaos.dumpLead'))}</label>
          <textarea id="chaos-text" class="input dump" rows="7" data-model="chaos.text" placeholder="${esc(t('chaos.ph'))}" ${ch.busy ? 'disabled' : ''}>${esc(UI.draft('chaos.text'))}</textarea>
          <div class="capture-bar">${V.voiceButton('chaos.text')}<div class="grow"></div>
            ${ch.busy ? `<span class="muted">${esc(t('cap.sorting'))}</span><button class="btn ghost small" data-action="chaos-stop">${esc(t('a.stop'))}</button>`
              : `<button class="btn primary" data-action="chaos-organize">${esc(t('chaos.organize'))}</button>`}</div>
        </div>
        ${hasToday ? `<button class="btn ghost wide" data-action="chaos-existing">${esc(t('chaos.useExisting'))}</button>` : ''}`;
    },
  });

  UI.action('chaos-organize', async () => {
    const text = UI.draft('chaos.text').trim();
    if (!text) { UI.toast(t('cap.none')); return true; }
    ch.busy = true; ch.ctl = new AbortController(); UI.render();
    const r = await A.ai.parseDump(S.state, text, new Date(), { signal: ch.ctl.signal });
    ch.busy = false; ch.ctl = null;
    if (!r.cancelled) ch.result = r;
    UI.render({ scrollTop: true });
    return true;
  });
  UI.action('chaos-stop', () => { if (ch.ctl) ch.ctl.abort(); return true; });
  UI.action('chaos-reset', () => { ch.result = null; V.results.chaos = null; });
  UI.action('chaos-confirm', () => {
    const ops = V.candidatesToOps(ch.result, 'chaos', { source: 'chaos' });
    const res = ops.length ? UI.commit(ops, { message: t('cap.added', { n: ops.length }) }) : { ids: [] };
    const key = UI.today();
    const existing = E.chaosQueue(S.state, new Date());
    const queue = E.chaosQueue(S.state, new Date(), U.uniq([...res.ids.filter((id) => M.itemById(S.state, id)), ...existing]));
    // Bookkeeping, not a user change of its own: undoing the adds also leaves chaos mode.
    S.commit([{ op: 'day.chaos', date: key, queue }], { now: new Date(), system: true });
    ch.result = null; V.results.chaos = null; UI.clearDraft('chaos.text');
    return false;
  });
  UI.action('chaos-existing', () => {
    const queue = E.chaosQueue(S.state, new Date());
    if (!queue.length) { UI.toast(t('chaos.nothing')); return true; }
    UI.commit([{ op: 'day.chaos', date: UI.today(), queue }], { silent: true });
  });
  UI.action('chaos-done', (el) => { UI.commit([{ op: 'item.done', id: el.dataset.id }]); });
  UI.action('chaos-skip', (el) => {
    const day = M.getDay(S.state, UI.today());
    const queue = day.chaos.queue.filter((id) => id !== el.dataset.id).concat([el.dataset.id]);
    UI.commit([{ op: 'day.chaos', date: UI.today(), queue }], { silent: true, system: true });
  });
  UI.action('chaos-toggle', () => { ch.showAll = !ch.showAll; });
  UI.action('chaos-end', () => { UI.commit([{ op: 'day.chaos', date: UI.today(), queue: null }], { message: t('op.modeOff') }); UI.go('home'); return true; });
})(typeof globalThis !== 'undefined' ? globalThis : this);
