/* Aura — Home: what matters right now. And Focus: what should I do now? */
(function (root) {
  const A = root.Aura;
  const U = A.util, I = A.i18n, M = A.model, It = A.items, P = A.planner, E = A.engine, S = A.store, icon = A.icon;
  const UI = A.ui, V = A.views;
  const { esc, t } = UI;

  I.add({
    'home.today': ['I dag', 'Today'],
    'home.openDay': ['Min dag', 'My day'],
    'home.emptyToday': ['Inget måste göras i dag. Lägg till något med +, eller njut av luften i dagen.', 'Nothing has to happen today. Add something with +, or enjoy the space.'],
    'home.andMore': ['+ {n} till', '+ {n} more'],
    'home.coming': ['Senare i dag', 'Later today'],
    'home.q.now': ['Vad ska jag göra nu?', 'What should I do now?'],
    'home.q.dump': ['Tömma huvudet', 'Brain dump'],
    'home.q.talk': ['Prata med Aura', 'Talk to Aura'],
    'home.q.pulse': ['Checka in', 'Check in'],
    'home.settings': ['Inställningar', 'Settings'],
    'home.notSaved': ['Den här webbläsaren sparar inget. Det du gör försvinner när du stänger sidan.', "This browser isn't saving anything. What you do disappears when the page closes."],
    'home.planned': ['Aura lade till {n} sak eftersom du hade tid över.|Aura lade till {n} saker eftersom du hade tid över.', 'Aura added {n} thing because you had room.|Aura added {n} things because you had room.'],
    'sugg.low': ['Låg energi i dag? Vi gör dagen mindre.', "Low energy today? Let's make today smaller."],
    'sugg.lowGo': ['Gör dagen mindre', 'Make it smaller'],
    'sugg.chaos': ['Mycket i huvudet? Vi tar en sak i taget.', "A lot on your mind? Let's take one thing at a time."],
    'sugg.chaosGo': ['Börja', 'Start'],
    'sugg.evening': ['Två minuter för att avsluta dagen?', 'Two minutes to close the day?'],
    'sugg.eveningGo': ['Kvällsavstämning', 'Evening reset'],
    'sugg.review': ['En snabb blick tillbaka på veckan?', 'A quick look back at the week?'],
    'sugg.reviewGo': ['Veckogenomgång', 'Weekly review'],
    'sugg.inbox': ['{n} osorterad sak i inkorgen.|{n} osorterade saker i inkorgen.', '{n} unsorted thing in the inbox.|{n} unsorted things in the inbox.'],
    'sugg.inboxGo': ['Sortera', 'Sort them'],
    'sugg.later': ['Senare', 'Later'],
    'sugg.pattern': ['Något jag har märkt', 'Something I noticed'],
    'focus.title': ['Vad ska jag göra nu?', 'What should I do now?'],
    'focus.eyebrow': ['En sak i taget', 'One thing at a time'],
    'focus.orPick': ['Eller välj själv', 'Or pick yourself'],
    'focus.reset': ['Visa det jag sa nej till igen', "Show what I said no to again"],
  });

  function eyebrow(state) {
    const key = UI.today();
    const mode = E.effectiveMode(state, key);
    return `${I.longDate(key)} · ${U.toClock(UI.nowMin())}${mode !== 'normal' ? ` · ${t(`mode.${mode}`)}` : ''}`;
  }

  function suggestionCard(state) {
    const nudges = A.notify.candidates(state, UI.ui.now);
    if (nudges.length) {
      return nudges.map((n) => `<section class="nudge" role="note">
        <p>${esc(I.msg(n.text))}</p>
        <div class="btnrow">${n.actions.map((a, i) => `<button class="btn small ${i === 0 ? 'primary' : 'ghost'}" data-action="nudge-act" data-key="${esc(n.key)}" data-index="${i}">${esc(I.msg(a.label))}</button>`).join('')}</div>
      </section>`).join('');
    }
    const s = E.suggestion(state, UI.ui.now);
    if (!s) return '';
    const card = (text, goLabel, goAction, extraAttr, laterLabel) => `<section class="suggest" role="note"><p>${esc(text)}</p>
      <div class="btnrow"><button class="btn small primary" data-action="${goAction}" ${extraAttr || ''}>${esc(goLabel)}</button>
      <button class="btn small quiet" data-action="sugg-dismiss" data-key="${esc(s.key)}">${esc(laterLabel || t('a.noThanks'))}</button></div></section>`;
    switch (s.kind) {
      case 'mode': return s.mode === 'low'
        ? card(t('sugg.low'), t('sugg.lowGo'), 'go', 'data-view="low"')
        : card(t('sugg.chaos'), t('sugg.chaosGo'), 'go', 'data-view="chaos"');
      case 'evening': return card(t('sugg.evening'), t('sugg.eveningGo'), 'go', 'data-view="evening"', t('sugg.later'));
      case 'review': return card(t('sugg.review'), t('sugg.reviewGo'), 'go', 'data-view="review"', t('sugg.later'));
      case 'inbox': return card(t('sugg.inbox', { n: s.n }), t('sugg.inboxGo'), 'go', 'data-view="inbox"', t('sugg.later'));
      case 'pattern': {
        const o = s.observation;
        return `<section class="suggest pattern" role="note"><div class="eyebrow">${esc(t('sugg.pattern'))}</div><p>${esc(I.msg(o.text))}</p>
          <div class="btnrow">${o.actions.map((a, i) => `<button class="btn small ${i === 0 ? 'primary' : 'ghost'}" data-action="pattern-act" data-key="${esc(o.key)}" data-index="${i}">${esc(I.msg(a.label))}</button>`).join('')}
          <button class="btn small quiet" data-action="pattern-dismiss" data-key="${esc(o.key)}">${esc(t('a.noThanks'))}</button></div></section>`;
      }
      default: return '';
    }
  }

  function todaySection(state, plan) {
    const b = plan.buckets;
    const list =[...b.must.slice(0, 3), ...b.good.slice(0, Math.max(1, 4 - Math.min(3, b.must.length)))].slice(0, 4);
    const more = b.must.length + b.good.length - list.length;
    const tri = (k, n) => `<button class="tri t-${k}" data-action="go" data-view="day"><span class="tri-n mono">${n}</span><span class="tri-l">${esc(t(`bucket.${k}`))}</span></button>`;
    const day = M.getDay(state, plan.dateKey);
    const picked = (day.planned && day.planned.picked || []).filter((id) => { const i = M.itemById(state, id); return i && i.status === 'open' && i.date === plan.dateKey; });
    return `<section class="section today">
      ${UI.sectionHead(t('home.today'), `<button class="link" data-action="go" data-view="day">${esc(t('home.openDay'))}${icon('chevron', 16)}</button>`)}
      <div class="triad">${tri('must', b.must.length)}${tri('good', b.good.length)}${tri('later', b.later.length)}</div>
      ${list.length ? `<div class="panel">${list.map((i) => UI.itemRow(i)).join('')}
        ${more > 0 ? `<button class="row more-row" data-action="go" data-view="day">${esc(t('home.andMore', { n: more }))}</button>` : ''}</div>`
        : `<div class="panel soft"><div class="row empty-row"><p class="muted">${esc(t('home.emptyToday'))}</p></div></div>`}
      ${picked.length ? `<p class="faint note-line">${icon('spark', 14)} ${esc(t('home.planned', { n: picked.length }))}</p>` : ''}
    </section>`;
  }

  function comingUp(plan) {
    const rest = plan.fixed.filter((f) => f.start > plan.nowMin && (!plan.next || f !== plan.next || plan.minutesUntilNext > E.LEAVE_WINDOW)).slice(0, 3);
    if (!rest.length) return '';
    return `<p class="coming mono">${icon('clock', 14)} ${rest.map((f) => `${esc(U.toClock(f.start))} ${esc(f.title)}`).join(' · ')}</p>`;
  }

  function quickActions() {
    const q = (ic, label, attrs) => `<button class="quick" ${attrs}>${icon(ic, 19)}<span>${esc(label)}</span></button>`;
    return `<nav class="quicks" aria-label="${esc(t('home.q.now'))}">
      ${q('now', t('home.q.now'), 'data-action="go" data-view="focus"')}
      ${q('list', t('home.q.dump'), 'data-action="go" data-view="capture"')}
      ${q('aura', t('home.q.talk'), 'data-action="go" data-view="aura"')}
      ${q('bolt', t('home.q.pulse'), 'data-action="sheet" data-sheet="pulse"')}
    </nav>`;
  }

  function pulseRow(state, plan) {
    if (M.pulseFor(state, plan.dateKey) || plan.nowMin >= plan.sleep - 30) return '';
    return `<section class="pulse-row" aria-label="${esc(t('pulse.quick'))}">
      <span class="pulse-q">${esc(t('pulse.quick'))}</span>
      <div class="pulse-dots">${[1, 2, 3, 4, 5].map((n) => `<button class="pdot" data-action="pulse-quick" data-value="${n}" aria-label="${esc(`${n} — ${t(`energy.${n}`)}`)}"><span class="mono">${n}</span></button>`).join('')}</div>
      <button class="btn tiny quiet" data-action="sheet" data-sheet="pulse">${esc(t('pulse.more'))}</button>
    </section>`;
  }

  UI.view('home', {
    render(state) {
      const plan = P.planDay(state, UI.ui.now);
      if (S.takeRemoteNote()) setTimeout(() => UI.toast(t('toast.remote')), 0);
      return `<header class="top hello">
          <div class="grow"><div class="eyebrow">${esc(eyebrow(state))}</div><h1 class="greet">${esc(V.greeting(state))}</h1></div>
          <button class="icon-btn" data-action="go" data-view="settings" aria-label="${esc(t('home.settings'))}">${icon('settings', 22)}</button>
        </header>
        ${UI.dayBand(state, plan)}
        ${S.mode === 'memory' ? `<div class="warn-line" role="alert">${esc(t('home.notSaved'))}</div>` : ''}
        ${V.modeBanner(state)}
        ${V.nowCard(state, 'home')}
        ${pulseRow(state, plan)}
        ${suggestionCard(state)}
        ${todaySection(state, plan)}
        ${comingUp(plan)}
        ${quickActions()}`;
    },
  });

  UI.action('sugg-dismiss', (el) => { UI.commit([{ op: 'day.dismiss', date: UI.today(), key: el.dataset.key }], { silent: true, system: true }); });
  UI.action('nudge-act', (el) => {
    const n = A.notify.candidates(S.state, new Date()).find((x) => x.key === el.dataset.key);
    if (!n) return false;
    const a = n.actions[Number(el.dataset.index)];
    UI.commit([{ op: 'day.dismiss', date: UI.today(), key: n.key }], { silent: true, system: true });
    if (a.ops) UI.commit(a.ops);
    if (a.nav) { UI.go(a.nav.view); return true; }
    return false;
  });
  UI.action('pattern-act', (el) => {
    const o = A.patterns.observations(S.state, new Date()).find((x) => x.key === el.dataset.key);
    if (!o) return false;
    const a = o.actions[Number(el.dataset.index)];
    UI.commit([{ op: 'pattern.dismiss', key: o.key }], { silent: true, system: true });
    if (a.ops) UI.commit(a.ops);
    if (a.nav && a.nav.view === 'item') { UI.openSheet('item', { id: a.nav.id, split: !!a.nav.split }); return true; }
    return false;
  });
  UI.action('pattern-dismiss', (el) => { UI.commit([{ op: 'pattern.dismiss', key: el.dataset.key }], { message: t('op.patternDismiss') }); });

  /* ---------------- Focus: What should I do now? ---------------- */

  UI.view('focus', {
    tab: 'home',
    render(state) {
      const ranked = E.rank(state, UI.ui.now).scored;
      const card = E.nowCard(state, UI.ui.now);
      const shownId = card.type === 'task' ? card.rec.item.id : card.type === 'focus' ? card.item.id : null;
      const alts = ranked.filter((e) => e.item.id !== shownId).slice(0, 3);
      const declined = M.getDay(state, UI.today()).declined.length;
      return `${UI.backHeader(t('focus.title'), t('focus.eyebrow'))}
        ${V.nowCard(state, 'focus')}
        ${alts.length && card.type !== 'focus' ? `<section class="section">${UI.sectionHead(t('focus.orPick'))}
          <div class="panel">${alts.map((e) => UI.itemRow(e.item, { trailing: `<button class="btn tiny ghost" data-action="now-do" data-id="${esc(e.item.id)}">${esc(t('now.doIt'))}</button>` })).join('')}</div></section>` : ''}
        ${!ranked.length && card.type === 'free' ? `<p class="muted center pad">${esc(t('now.nothingToSuggest'))}</p>` : ''}
        ${declined ? `<div class="center pad"><button class="btn quiet small" data-action="focus-reset">${esc(t('focus.reset'))}</button></div>` : ''}`;
    },
  });

  UI.action('focus-reset', () => {
    const day = M.getDay(S.state, UI.today());
    UI.commit([...day.declined.map((id) => ({ op: 'day.undecline', date: UI.today(), itemId: id })), { op: 'day.quiet', date: UI.today(), until: null }], { silent: true });
    V.flow.override = null;
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
