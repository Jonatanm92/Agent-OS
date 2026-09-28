/* Aura — My Day: must, good if possible, can wait. Not a to-do list; a day that fits. */
(function (root) {
  const A = root.Aura;
  const U = A.util, I = A.i18n, M = A.model, It = A.items, P = A.planner, E = A.engine, S = A.store, icon = A.icon;
  const UI = A.ui, V = A.views;
  const { esc, t } = UI;

  I.add({
    'day.title': ['Min dag', 'My day'],
    'day.rebuild': ['Bygg om dagen', 'Rebuild my day'],
    'day.addPh': ['Lägg till i dag …', 'Add to today …'],
    'day.addBtn': ['Lägg till i dag', 'Add to today'],
    'day.fixed': ['Fast i dag', 'Fixed today'],
    'day.addEvent': ['Lägg in en tid', 'Add an event'],
    'day.mustEmpty': ['Inget är ett måste i dag.', 'Nothing is a must today.'],
    'day.goodEmpty': ['Inget planerat utöver det. Luft är bra.', 'Nothing else planned. Space is good.'],
    'day.laterCount': ['Kan vänta ({n})', 'Can wait ({n})'],
    'day.doneCount': ['Klart i dag ({n})', 'Done today ({n})'],
    'day.comingCount': ['Kommer snart ({n})', 'Coming up ({n})'],
    'day.toToday': ['I dag', 'Today'],
    'day.tight': ['Måstena tar mer tid än dagen har kvar. Kan något av dem flyttas?', "The musts need more time than the day has left. Could one of them move?"],
    'day.loadRoom': ['Plats för ungefär {mins} till i dag.', 'Room for about {mins} more today.'],
    'day.loadFull': ['Dagen är full nog.', 'Today is full enough.'],
    'day.fixedNone': ['Inget fast inlagt i dag.', 'Nothing fixed today.'],
    'day.laterNote': ['Inget här försvinner. Aura tar fram det när det finns plats.', 'Nothing here disappears. Aura brings it forward when there is room.'],
    'rb.title': ['Ny plan för resten av dagen', 'A new plan for the rest of the day'],
    'rb.lead': ['Baserat på {free} kvar, din energi och dina måsten.', 'Based on {free} left, your energy and your musts.'],
    'rb.keepMust': ['Måste (ligger kvar)', 'Must (staying)'],
    'rb.keep': ['Hinns med', 'Fits'],
    'rb.move': ['Flyttas', 'Moves'],
    'rb.add': ['Tas fram — du har plats', 'Brought forward — you have room'],
    'rb.fits': ['Dagen går redan ihop. Inget behöver ändras.', 'The day already fits. Nothing needs to change.'],
    'rb.apply': ['Gör så', 'Do it'],
    'rb.applied': ['Dagen är ombyggd.', 'Day rebuilt.'],
    'rb.tight': ['Måstena ensamma fyller mer än dagen rymmer. Titta på dem en gång till.', 'The musts alone fill more than the day holds. Have another look at them.'],
    'ev.title': ['Tid', 'Event'],
    'ev.new': ['Ny tid', 'New event'],
    'ev.what': ['Vad', 'What'],
    'ev.date': ['Dag', 'Day'],
    'ev.start': ['Börjar', 'Starts'],
    'ev.end': ['Slutar', 'Ends'],
    'ev.away': ['Hemifrån — räkna med restid', 'Away from home — allow travel time'],
    'ev.repeat': ['Upprepa varje vecka på', 'Repeat every week on'],
    'ev.save': ['Spara', 'Save'],
    'ev.delete': ['Ta bort tiden', 'Delete event'],
    'ev.needTitle': ['Skriv vad det är och när det börjar.', 'Say what it is and when it starts.'],
  });

  function collapsible(key, label, inner, defaultOpen) {
    const open = UI.ui.open[key] != null ? UI.ui.open[key] : !!defaultOpen;
    return `<section class="section fold">
      <button class="fold-head" data-action="toggle" data-key="${key}" aria-expanded="${open}"><h2>${esc(label)}</h2>${icon(open ? 'up' : 'down', 18)}</button>
      ${open ? inner : ''}</section>`;
  }

  UI.view('day', {
    render(state) {
      const plan = P.planDay(state, UI.ui.now);
      const b = plan.buckets;
      const key = plan.dateKey;
      const coming = It.upcoming(state, key, 7);

      const fixed = plan.fixed.filter((f) => f.end > plan.nowMin);
      const fixedHtml = `<section class="section">
        ${UI.sectionHead(t('day.fixed'), `<button class="btn tiny ghost" data-action="sheet" data-sheet="event">${icon('plus', 15)}${esc(t('day.addEvent'))}</button>`)}
        ${fixed.length ? `<div class="panel">${fixed.map((f) => `<button class="row fixed" data-action="${f.eventId ? 'sheet' : 'go'}" ${f.eventId ? `data-sheet="event" data-id="${esc(f.eventId)}"` : 'data-view="settings"'}>
          <span class="at mono">${esc(U.toClock(f.start))}</span><span class="row-main"><span class="title">${esc(f.title)}</span>
          <span class="sub">${esc(`${U.toClock(f.start)}–${U.toClock(f.end)}`)}${f.away ? ` · ${esc(t('ev.awayShort'))}` : ''}</span></span></button>`).join('')}</div>` : `<div class="panel soft">${UI.emptyLine(t('day.fixedNone'))}</div>`}
      </section>`;

      return `<header class="top">
          <div class="grow"><div class="eyebrow">${esc(I.longDate(key))}</div><h1>${esc(t('day.title'))}</h1></div>
          <button class="btn small ghost" data-action="rebuild">${icon('repeat', 16)}${esc(t('day.rebuild'))}</button>
        </header>
        <div class="chips">${V.modeChip(state)}${V.pulseChip(state)}</div>
        ${UI.dayBand(state, plan)}
        ${V.modeBanner(state)}
        <div class="quickadd">
          <label class="sr" for="day-add">${esc(t('day.addPh'))}</label>
          <input id="day-add" class="input" data-model="day.add" data-enter="day-add" placeholder="${esc(t('day.addPh'))}" value="${esc(UI.draft('day.add'))}" autocomplete="off" enterkeyhint="done">
          <button class="icon-btn solid" data-action="day-add" aria-label="${esc(t('day.addBtn'))}">${icon('plus', 22)}</button>
        </div>
        ${plan.mustMinutes > plan.budget && b.must.length ? `<div class="warn-line">${esc(t('day.tight'))}</div>` : ''}
        <section class="section bucket b-must">
          ${UI.sectionHead(t('bucket.must'), `<span class="count mono">${b.must.length}</span>`)}
          <div class="panel">${b.must.length ? b.must.map((i) => UI.itemRow(i)).join('') : UI.emptyLine(t('day.mustEmpty'))}</div>
        </section>
        <section class="section bucket b-good">
          ${UI.sectionHead(t('bucket.good'), `<span class="count mono">${b.good.length}</span>`)}
          <div class="panel">${b.good.length ? b.good.map((i) => UI.itemRow(i)).join('') : UI.emptyLine(t('day.goodEmpty'))}</div>
          <p class="faint load">${esc(plan.budget - plan.mustMinutes - plan.goodMinutes >= 20
            ? t('day.loadRoom', { mins: I.duration(Math.floor((plan.budget - plan.mustMinutes - plan.goodMinutes) / 5) * 5) })
            : t('day.loadFull'))}</p>
        </section>
        ${fixedHtml}
        ${b.later.length ? collapsible('day.later', t('day.laterCount', { n: b.later.length }), `<div class="panel soft">${b.later.map((i) => UI.itemRow(i, {
          trailing: `<button class="btn tiny ghost" data-action="day-today" data-id="${esc(i.id)}">${esc(t('day.toToday'))}</button>`,
        })).join('')}</div><p class="faint">${esc(t('day.laterNote'))}</p>`) : ''}
        ${coming.length ? collapsible('day.coming', t('day.comingCount', { n: coming.length }), `<div class="panel soft">${coming.map((i) => UI.itemRow(i)).join('')}</div>`) : ''}
        ${b.done.length ? collapsible('day.done', t('day.doneCount', { n: b.done.length }), `<div class="panel soft">${b.done.map((i) => UI.itemRow(i)).join('')}</div>`) : ''}`;
    },
  });

  I.add({ 'ev.awayShort': ['hemifrån', 'away'] });

  UI.action('day-add', () => {
    const text = UI.draft('day.add').trim();
    if (!text) return true;
    const c = A.parse.quick(S.state, text, new Date());
    UI.clearDraft('day.add');
    const key = UI.today();
    if (c.kind === 'event' && c.time) {
      UI.commit([A.parse.toOp(c, { today: key, source: 'manual' })]);
      return false;
    }
    if (!c.date && !c.dueDate && !c.recur && c.kind !== 'note' && c.kind !== 'idea') c.date = key;
    if (c.kind === 'shopping' && !c.date) c.date = '';
    c.priority = c.priority || (c.date === key ? 'good' : '');
    UI.commit([A.parse.toOp(c, { today: key, source: 'manual' })]);
    return false;
  });
  UI.action('day-today', (el) => { UI.commit([{ op: 'item.bucket', id: el.dataset.id, bucket: 'good' }]); });

  /* ---------------- rebuild ---------------- */

  UI.action('rebuild', () => { UI.openSheet('rebuild', {}); return true; });
  UI.sheet('rebuild', {
    render(data, state) {
      const r = P.rebuild(state, new Date());
      data.ops = r.ops;
      const key = UI.today();
      const list = (items, fn) => `<div class="panel soft">${items.map((x) => `<div class="row"><span class="row-main"><span class="title">${esc(x.title)}</span>${fn ? `<span class="sub">${esc(fn(x))}</span>` : ''}</span></div>`).join('')}</div>`;
      const parts = [];
      if (r.must.length) parts.push(`<h3 class="h3">${esc(t('rb.keepMust'))}</h3>${list(r.must)}`);
      if (r.kept.length) parts.push(`<h3 class="h3">${esc(t('rb.keep'))}</h3>${list(r.kept)}`);
      if (r.moved.length) parts.push(`<h3 class="h3">${esc(t('rb.move'))}</h3>${list(r.moved, (m) => `→ ${I.relativeDay(m.to, key)}`)}`);
      if (r.added.length) parts.push(`<h3 class="h3">${esc(t('rb.add'))}</h3>${list(r.added)}`);
      const changes = r.ops.length;
      return {
        title: t('rb.title'), lead: t('rb.lead', { free: I.duration(r.freeMinutes) }),
        body: `<div class="stack">${r.tight ? `<div class="warn-line">${esc(t('rb.tight'))}</div>` : ''}
          ${changes ? parts.join('') : `<p class="calm-line">${esc(t('rb.fits'))}</p>`}
          <div class="btnrow">${changes ? `<button class="btn primary" data-action="rebuild-apply">${esc(t('rb.apply'))}</button>` : ''}
          <button class="btn ghost" data-action="sheet-close">${esc(changes ? t('a.cancel') : t('a.close'))}</button></div></div>`,
        tall: true,
      };
    },
  });
  UI.action('rebuild-apply', () => {
    const s = UI.ui.sheet;
    const ops = (s && s.data.ops) || [];
    UI.closeSheet();
    if (ops.length) UI.commit(ops, { message: t('rb.applied') });
    return true;
  });

  /* ---------------- events ---------------- */

  const WEEK = [1, 2, 3, 4, 5, 6, 0];

  UI.sheet('event', {
    render(data, state) {
      const ev = data.id ? M.eventById(state, data.id) : null;
      if (!data.init) {
        data.init = true;
        data.v = ev ? { title: ev.title, date: ev.date || UI.today(), start: ev.start, end: ev.end, away: ev.away, days: ev.recur ? ev.recur.weekdays.slice() : [] }
          : { title: '', date: UI.today(), start: '', end: '', away: true, days: [] };
      }
      const v = data.v;
      return {
        title: ev ? t('ev.title') : t('ev.new'),
        body: `<div class="stack">
          <div class="field"><label class="label" for="ev-title">${esc(t('ev.what'))}</label>
            <input id="ev-title" class="input big" data-model="ev.title" value="${esc(UI.draft('ev.title', v.title))}" maxlength="120" data-autofocus></div>
          ${v.days.length ? '' : `<div class="field"><label class="label" for="ev-date">${esc(t('ev.date'))}</label><input id="ev-date" class="input date" type="date" data-model="ev.date" value="${esc(UI.draft('ev.date', v.date))}"></div>`}
          <div class="grid2">
            <div class="field"><label class="label" for="ev-start">${esc(t('ev.start'))}</label><input id="ev-start" class="input" type="time" data-model="ev.start" value="${esc(UI.draft('ev.start', v.start))}"></div>
            <div class="field"><label class="label" for="ev-end">${esc(t('ev.end'))}</label><input id="ev-end" class="input" type="time" data-model="ev.end" value="${esc(UI.draft('ev.end', v.end))}"></div>
          </div>
          <button class="toggle${v.away ? ' on' : ''}" data-action="ev-away" aria-pressed="${v.away}"><span class="knob"></span>${esc(t('ev.away'))}</button>
          <div class="field"><div class="label">${esc(t('ev.repeat'))}</div><div class="daypick">${WEEK.map((d) => `<button class="${v.days.includes(d) ? 'on' : ''}" data-action="ev-day" data-day="${d}" aria-pressed="${v.days.includes(d)}">${esc(I.weekdayShort(d))}</button>`).join('')}</div></div>
          ${data.error ? `<div class="warn-line">${esc(data.error)}</div>` : ''}
          <div class="btnrow"><button class="btn primary" data-action="ev-save">${esc(t('ev.save'))}</button>
          ${ev ? `<button class="btn quiet danger" data-action="ev-delete">${icon('trash', 16)}${esc(t('ev.delete'))}</button>` : ''}</div>
        </div>`,
      };
    },
    onClose() { for (const k of ['ev.title', 'ev.date', 'ev.start', 'ev.end']) UI.clearDraft(k); },
  });
  UI.action('ev-away', () => { const s = UI.ui.sheet; s.data.v.away = !s.data.v.away; UI.renderSheet(); return true; });
  UI.action('ev-day', (el) => {
    const s = UI.ui.sheet; const d = Number(el.dataset.day);
    const set = new Set(s.data.v.days);
    if (set.has(d)) set.delete(d); else set.add(d);
    s.data.v.days = Array.from(set);
    UI.renderSheet();
    return true;
  });
  UI.action('ev-save', () => {
    const s = UI.ui.sheet; const v = s.data.v;
    const title = UI.draft('ev.title', v.title).trim();
    const start = UI.draft('ev.start', v.start);
    if (!title || U.toMinutes(start) === null) { s.data.error = t('ev.needTitle'); UI.renderSheet(); return true; }
    const event = { title, start, end: UI.draft('ev.end', v.end), away: v.away, date: v.days.length ? '' : UI.draft('ev.date', v.date), recur: v.days.length ? { weekdays: v.days } : null };
    const id = s.data.id;
    UI.closeSheet();
    UI.commit([id ? { op: 'event.update', id, patch: event } : { op: 'event.add', event }]);
    return true;
  });
  UI.action('ev-delete', () => { const id = UI.ui.sheet.data.id; UI.closeSheet(); UI.commit([{ op: 'event.delete', id }]); return true; });
})(typeof globalThis !== 'undefined' ? globalThis : this);
