/* Aura — shared pieces: the NOW card, Pulse, the item sheet, modes, voice. */
(function (root) {
  const A = root.Aura;
  const U = A.util, I = A.i18n, M = A.model, It = A.items, E = A.engine, S = A.store, icon = A.icon;
  const UI = A.ui;
  const { esc, t } = UI;

  I.add({
    'now.kicker': ['Nu', 'Now'],
    'now.kickerFocus': ['Pågår', 'In progress'],
    'now.kickerLeave': ['Snart', 'Coming up'],
    'now.kickerCalm': ['Just nu', 'Right now'],
    'now.kickerNight': ['Kväll', 'Evening'],
    'now.doIt': ['Gör det', 'Do it'],
    'now.easier': ['Något lättare', 'Something easier'],
    'now.else': ['Något annat', 'Something else'],
    'now.notNow': ['Inte nu', 'Not now'],
    'now.done': ['Klart', 'Done'],
    'now.pause': ['Pausa', 'Pause'],
    'now.askAgain': ['Vad ska jag göra nu?', 'What should I do now?'],
    'now.also': ['Hinns först: {title} · {min}', 'Fits first: {title} · {min}'],
    'now.start': ['Börja', 'Start'],
    'now.open': ['Öppna', 'Open'],
    'now.elapsed': ['{min} har gått', '{min} so far'],
    'now.eventTitle': ['{title}', '{title}'],
    'now.nothingToSuggest': ['Inget att föreslå just nu. Lägg till något, eller vila.', 'Nothing to suggest right now. Add something, or rest.'],
    'now.lowBanner': ['Låg energi i dag · bara det nödvändiga', 'Low energy today · only what is necessary'],
    'now.recoveryBanner': ['Återhämtning · Aura håller det litet', 'Recovery · Aura keeps things small'],
    'now.chaosBanner': ['Kaosläge · en sak i taget', 'Chaos mode · one thing at a time'],
    'now.backToNormal': ['Tillbaka till vanlig dag', 'Back to a normal day'],
    'now.continueChaos': ['Fortsätt', 'Continue'],

    'pulse.title': ['Incheckning', 'Check in'],
    'pulse.lead': ['Välj det som stämmer. Allt är frivilligt.', 'Pick what fits. Everything is optional.'],
    'pulse.energy': ['Energi', 'Energy'],
    'pulse.mood': ['Humör', 'Mood'],
    'pulse.stress': ['Stress', 'Stress'],
    'pulse.sleep': ['Sömn i natt', 'Sleep last night'],
    'pulse.note': ['Något mer? (frivilligt)', 'Anything else? (optional)'],
    'pulse.save': ['Spara', 'Save'],
    'pulse.quick': ['Hur är energin?', "How's your energy?"],
    'pulse.more': ['Mer', 'More'],
    'pulse.chip': ['Energi: {v}', 'Energy: {v}'],
    'pulse.chipNone': ['Checka in', 'Check in'],

    'item.title': ['Titel', 'Title'],
    'item.kind': ['Sort', 'Kind'],
    'item.bucket': ['I dag', 'Today'],
    'item.when': ['När', 'When'],
    'item.pickDate': ['Välj datum', 'Pick a date'],
    'item.due': ['Senast', 'Deadline'],
    'item.noDue': ['Ingen', 'None'],
    'item.duration': ['Tar ungefär', 'Takes about'],
    'item.energy': ['Kräver', 'Takes'],
    'item.energy.light': ['Lite', 'Little'],
    'item.energy.medium': ['En del', 'Some'],
    'item.energy.heavy': ['Mycket', 'A lot'],
    'item.background': ['Sköter sig själv när den väl är igång', 'Runs by itself once started'],
    'item.repeat': ['Återkommer', 'Repeats'],
    'item.repeat.none': ['Nej', 'No'],
    'item.repeat.day': ['Varje dag', 'Daily'],
    'item.repeat.week': ['Varje vecka', 'Weekly'],
    'item.repeat.2week': ['Varannan vecka', 'Every 2 weeks'],
    'item.repeat.month': ['Varje månad', 'Monthly'],
    'item.note': ['Anteckning', 'Note'],
    'item.project': ['Projekt', 'Project'],
    'item.noProject': ['Inget', 'None'],
    'item.person': ['Till', 'For'],
    'item.staple': ['Köps ofta — visa under ”Brukar köpas”', 'Bought often — show under "Usuals"'],
    'item.admin': ['Läge', 'Status'],
    'item.waitingOn': ['Väntar på vem/vad?', 'Waiting on whom/what?'],
    'item.followUp': ['Följ upp', 'Follow up'],
    'item.smaller': ['Gör mindre', 'Make it smaller'],
    'item.smallerLead': ['Vad är ett första steg på 5–15 minuter?', 'What is a first step of 5–15 minutes?'],
    'item.smallerPh': ['t.ex. Bara handfatet', 'e.g. Just the sink'],
    'item.smallerGo': ['Gör det till dagens steg', "Make it today's step"],
    'item.drop': ['Släpp den', 'Let it go'],
    'item.doneBtn': ['Markera klar', 'Mark done'],
    'item.reopenBtn': ['Inte klar', 'Not done'],
    'item.moveUp': ['Flytta upp', 'Move up'],
    'item.moveDown': ['Flytta ner', 'Move down'],
    'item.focus': ['Gör det nu', 'Do it now'],
    'item.processLead': ['Vad är det här?', 'What is this?'],
    'item.created': ['Tillagd {when}', 'Added {when}'],
    'item.deleted': ['Borttagen.', 'Deleted.'],
    'item.gone': ['Den här saken finns inte längre.', 'This item no longer exists.'],

    'mode.title': ['Hur ska dagen vara?', 'What kind of day is it?'],
    'mode.lead': ['Aura anpassar sig. Du kan alltid byta tillbaka.', 'Aura adapts. You can always switch back.'],
    'mode.auto': ['Automatiskt', 'Automatic'],
    'mode.autoSub': ['Arbetsdag eller ledig enligt din vecka', 'Workday or free day from your week'],
    'mode.lowSub': ['Gör dagen mindre', 'Make the day smaller'],
    'mode.chaosSub': ['För mycket i huvudet — en sak i taget', 'Too much in your head — one thing at a time'],
    'mode.recoverySub': ['Sjuk eller återhämtar dig — bara det nödvändigaste', 'Ill or recovering — only the bare essentials'],
    'mode.workSub': ['Arbetstider räknas in', 'Working hours count'],
    'mode.freeSub': ['Inga arbetstider i dag', 'No working hours today'],
  });

  /* ---------------- greeting ---------------- */

  function greeting(state) {
    const m = UI.nowMin();
    const key = m < 300 ? 'greet.night' : m < 660 ? 'greet.morning' : m < 780 ? 'greet.day' : m < 1080 ? 'greet.afternoon' : m < 1380 ? 'greet.evening' : 'greet.night';
    return state.prefs.name ? `${t(key)}, ${state.prefs.name}` : t(key);
  }

  /* ---------------- NOW card ---------------- */

  function modeBanner(state) {
    const key = UI.today();
    const mode = M.getDay(state, key).mode;
    if (!['low', 'chaos', 'recovery'].includes(mode)) return '';
    const text = t(`now.${mode}Banner`);
    return `<div class="mode-banner m-${mode}">${icon(mode === 'chaos' ? 'wave' : 'leaf', 18)}<span class="grow">${esc(text)}</span>
      ${mode === 'chaos' ? `<button class="btn tiny ghost" data-action="go" data-view="chaos">${esc(t('now.continueChaos'))}</button>` : ''}
      <button class="btn tiny quiet" data-action="mode-set" data-value="">${esc(t('now.backToNormal'))}</button></div>`;
  }

  /** The one thing that matters now. `variant: 'home' | 'focus'`. */
  function nowCard(state, variant) {
    const card = E.nowCard(state, UI.ui.now);
    const big = variant === 'focus';
    const wrap = (kind, kicker, body, calm) => `<section class="now${calm ? ' calm' : ''} t-${kind}${big ? ' big' : ''}" aria-live="polite" aria-label="${esc(kicker)}">
      <div class="glow" aria-hidden="true"></div>
      <div class="now-kicker">${esc(kicker)}</div>${body}</section>`;

    switch (card.type) {
      case 'focus': {
        const started = new Date(card.startedAt);
        const elapsed = Math.max(0, Math.round((UI.ui.now - started) / 60000));
        return wrap('focus', t('now.kickerFocus'), `<h2 class="now-title">${esc(card.item.title)}</h2>
          <p class="now-why">${esc(t('now.focusSince', { at: U.toClock(U.minutesOfDay(started)), min: I.duration(card.minutes) }))}${elapsed >= 1 ? ` · ${esc(t('now.elapsed', { min: I.duration(elapsed) }))}` : ''}</p>
          <div class="now-actions"><button class="btn signal" data-action="now-done" data-id="${esc(card.item.id)}">${icon('check', 18)}${esc(t('now.done'))}</button>
          <button class="btn ghost-on" data-action="now-pause">${esc(t('now.pause'))}</button></div>`);
      }
      case 'event':
        return wrap('event', t('now.kickerCalm'), `<h2 class="now-title">${esc(card.event.title)}</h2>
          <p class="now-why">${esc(t('now.eventRunning', { until: U.toClock(card.until) }))}</p>`, true);
      case 'soon':
        return wrap('soon', t('now.kickerLeave'), `<h2 class="now-title">${esc(t('now.eventSoon', { what: card.event.title, mins: I.duration(card.startsIn) }))}</h2>`, false);
      case 'leave': {
        const title = card.leaveIn <= 5 ? t('now.leaveNow') : t('now.leaveIn', { mins: I.duration(card.leaveIn) });
        const also = card.also ? `<div class="now-also"><span>${esc(t('now.also', { title: card.also.title, min: UI.approx(card.also.minutes) }))}</span>
          <button class="btn tiny ghost-on" data-action="now-do" data-id="${esc(card.also.item.id)}">${esc(t('now.doIt'))}</button></div>` : '';
        return wrap('leave', t('now.kickerLeave'), `<h2 class="now-title">${esc(title)}</h2>
          <p class="now-why">${esc(t('now.leaveFor', { what: card.event.title, at: U.toClock(card.event.start) }))}</p>${also}`);
      }
      case 'quiet':
        return wrap('quiet', t('now.kickerCalm'), `<h2 class="now-title">${esc(t('now.quiet'))}</h2>
          <p class="now-why">${esc(t('now.quietDetail'))}</p>
          <div class="now-actions"><button class="btn ghost" data-action="now-ask">${esc(t('now.askAgain'))}</button></div>`, true);
      case 'windDown':
        return wrap('night', t('now.kickerNight'), `<h2 class="now-title">${esc(t('now.windDown'))}</h2>
          <p class="now-why">${esc(t('now.windDownDetail'))}</p>
          ${card.routine ? `<div class="now-actions"><button class="btn ghost" data-action="go" data-view="routine" data-id="${esc(card.routine.routine.id)}">${esc(card.routine.routine.name)} · ${esc(t('now.routineDetail', { n: card.routine.remaining, min: I.duration(card.routine.minutesLeft) }))}</button></div>` : ''}`, true);
      case 'routine': {
        const v = card.routine;
        return wrap('routine', t('now.kicker'), `<h2 class="now-title">${esc(v.routine.name)}</h2>
          <p class="now-why">${esc(t('now.routineDetail', { n: v.remaining, min: I.duration(v.minutesLeft) }))}${v.variant === 'short' ? ` · ${esc(t(v.reason))}` : ''}</p>
          <div class="now-actions"><button class="btn signal" data-action="go" data-view="routine" data-id="${esc(v.routine.id)}">${esc(t('now.start'))}</button>
          <button class="btn ghost-on" data-action="now-quiet">${esc(t('now.notNow'))}</button></div>`);
      }
      case 'task': {
        let r = card.rec;
        const o = flow.override;
        if (o && Date.now() - o.at < 30 * 60000) {
          const still = M.itemById(state, o.rec.item.id);
          if (still && still.status === 'open') r = o.rec;
          else flow.override = null;
        }
        return wrap('task', t('now.kicker'), `<h2 class="now-title">${esc(r.title)}</h2>
          <p class="now-why">${esc(I.msg(r.reason))}</p>
          <p class="now-meta mono">${esc(UI.approx(r.minutes))}</p>
          <div class="now-actions">
            <button class="btn signal" data-action="now-do" data-id="${esc(r.item.id)}">${esc(t('now.doIt'))}</button>
            <button class="btn ghost-on" data-action="now-easier" data-id="${esc(r.item.id)}">${esc(t('now.easier'))}</button>
            <button class="btn ghost-on" data-action="now-else" data-id="${esc(r.item.id)}">${esc(t('now.else'))}</button>
            <button class="btn quiet-on" data-action="now-quiet" data-id="${esc(r.item.id)}">${esc(t('now.notNow'))}</button>
          </div>`);
      }
      case 'rest':
        return wrap('rest', t('now.kickerCalm'), `<h2 class="now-title">${esc(t('now.rest'))}</h2><p class="now-why">${esc(t('now.restDetail'))}</p>`, true);
      default: {
        const plan = card.plan;
        let detail;
        if (plan.next && plan.minutesUntilNext != null) {
          detail = plan.next.away ? t('now.freeUntilLeave', { mins: I.duration(plan.minutesUntilNext) })
            : t('now.freeUntil', { mins: I.duration(plan.minutesUntilNext), what: plan.next.title });
        } else detail = plan.nowMin >= 17 * 60 ? t('now.freeEvening') : t('now.freeDay');
        return wrap('free', t('now.kickerCalm'), `<h2 class="now-title">${esc(t('now.nothingUrgent'))}</h2><p class="now-why">${esc(detail)}</p>`, true);
      }
    }
  }

  /* ---------------- focus-flow actions (shared by Home and Focus) ---------------- */

  /* "Something easier" keeps showing the easier pick (or a five-minute version) until acted on. */
  const flow = { override: null };

  UI.action('now-do', (el) => {
    UI.commit([{ op: 'day.focus', date: UI.today(), itemId: el.dataset.id }], { silent: true });
    flow.override = null;
  });
  UI.action('now-done', (el) => {
    const item = M.itemById(S.state, el.dataset.id);
    UI.commit([{ op: 'item.done', id: el.dataset.id }], { message: item ? t('op.itemDone', { title: item.title }) : null });
    flow.override = null;
  });
  UI.action('now-pause', () => { UI.commit([{ op: 'day.focus', date: UI.today(), itemId: null }], { silent: true }); });
  UI.action('now-else', (el) => {
    flow.override = null;
    UI.commit([{ op: 'day.decline', date: UI.today(), itemId: el.dataset.id }], { silent: true });
  });
  UI.action('now-easier', (el) => {
    const rec = E.whatNow(S.state, new Date(), { easierThan: el.dataset.id });
    if (!rec) return false;
    if (!rec.tiny) UI.commit([{ op: 'day.decline', date: UI.today(), itemId: el.dataset.id }], { silent: true });
    flow.override = { rec, at: Date.now() };
    return false;
  });
  UI.action('now-quiet', (el) => {
    flow.override = null;
    const ops = [{ op: 'day.quiet', date: UI.today(), until: UI.nowMin() + 45 }];
    if (el.dataset.id) ops.unshift({ op: 'day.decline', date: UI.today(), itemId: el.dataset.id });
    UI.commit(ops, { silent: true });
  });
  UI.action('now-ask', () => {
    UI.commit([{ op: 'day.quiet', date: UI.today(), until: null }], { silent: true });
    UI.go('focus');
    return true;
  });

  /* ---------------- Pulse ---------------- */

  function scale(field, value) {
    return `<div class="scale" role="group" aria-label="${esc(t(`pulse.${field}`))}">${[1, 2, 3, 4, 5].map((n) => `<button class="scale-btn${value === n ? ' on' : ''}" data-action="pulse-pick" data-field="${field}" data-value="${n}" aria-pressed="${value === n}">
      <span class="scale-n mono">${n}</span><span class="scale-l">${esc(t(`${field}.${n}`))}</span></button>`).join('')}</div>`;
  }

  UI.sheet('pulse', {
    render(data) {
      data.values = data.values || {};
      const v = data.values;
      return {
        title: t('pulse.title'), lead: t('pulse.lead'),
        body: `<div class="stack-lg">
          ${['energy', 'mood', 'stress', 'sleep'].map((f) => `<div class="field"><div class="label">${esc(t(`pulse.${f}`))}</div>${scale(f, v[f])}</div>`).join('')}
          <div class="field"><label class="label" for="pulse-note">${esc(t('pulse.note'))}</label>
            <input id="pulse-note" class="input" data-model="pulse.note" value="${esc(UI.draft('pulse.note'))}" maxlength="280"></div>
          <button class="btn primary wide" data-action="pulse-save" ${Object.keys(v).length || UI.draft('pulse.note') ? '' : 'disabled'}>${esc(t('pulse.save'))}</button>
        </div>`,
      };
    },
  });
  UI.action('pulse-pick', (el) => {
    const s = UI.ui.sheet;
    if (!s || s.name !== 'pulse') return true;
    const n = Number(el.dataset.value);
    s.data.values[el.dataset.field] = s.data.values[el.dataset.field] === n ? undefined : n;
    if (s.data.values[el.dataset.field] === undefined) delete s.data.values[el.dataset.field];
    UI.renderSheet();
    return true;
  });
  UI.action('pulse-save', () => {
    const s = UI.ui.sheet;
    const v = (s && s.data.values) || {};
    const note = UI.draft('pulse.note').trim();
    UI.clearDraft('pulse.note');
    UI.closeSheet();
    UI.commit([Object.assign({ op: 'day.pulse', date: UI.today() }, v, note ? { note } : {})]);
    return true;
  });
  UI.action('pulse-quick', (el) => {
    UI.commit([{ op: 'day.pulse', date: UI.today(), energy: Number(el.dataset.value) }]);
  });

  function pulseChip(state) {
    const p = M.pulseFor(state, UI.today());
    return `<button class="chip${p && p.energy ? ' on' : ''}" data-action="sheet" data-sheet="pulse">${icon('bolt', 15)}${esc(p && p.energy ? t('pulse.chip', { v: t(`energy.${p.energy}`) }) : t('pulse.chipNone'))}</button>`;
  }

  /* ---------------- modes ---------------- */

  UI.sheet('mode', {
    render(data, state) {
      const cur = M.getDay(state, UI.today()).mode;
      const opt = (v, labelKey, subKey, ic) => `<button class="choice${cur === v ? ' on' : ''}" data-action="mode-set" data-value="${v}">
        ${icon(ic, 20)}<span class="grow"><span class="title">${esc(t(labelKey))}</span><span class="sub">${esc(t(subKey))}</span></span></button>`;
      return {
        title: t('mode.title'), lead: t('mode.lead'),
        body: `<div class="stack">
          ${opt('', 'mode.auto', 'mode.autoSub', 'sun')}
          ${opt('low', 'mode.low', 'mode.lowSub', 'leaf')}
          ${opt('chaos', 'mode.chaos', 'mode.chaosSub', 'wave')}
          ${opt('recovery', 'mode.recovery', 'mode.recoverySub', 'moon')}
          ${opt('work', 'mode.work', 'mode.workSub', 'admin')}
          ${opt('free', 'mode.free', 'mode.freeSub', 'sun')}
        </div>`,
      };
    },
  });
  UI.action('mode-set', (el) => {
    const mode = el.dataset.value;
    UI.closeSheet();
    if (mode === 'low') { UI.go('low'); return true; }
    if (mode === 'chaos') { UI.go('chaos'); return true; }
    UI.commit([{ op: 'day.mode', date: UI.today(), mode }]);
    return false;
  });

  function modeChip(state) {
    const mode = E.effectiveMode(state, UI.today());
    return `<button class="chip${['low', 'chaos', 'recovery'].includes(mode) ? ' on' : ''}" data-action="sheet" data-sheet="mode">${esc(t(`mode.${mode}`))}</button>`;
  }

  /* ---------------- voice ---------------- */

  const voice = { ctl: null, key: null };

  function voiceButton(draftKey) {
    const listening = voice.key === draftKey;
    return `<button class="icon-btn mic${listening ? ' live' : ''}" data-action="voice" data-key="${esc(draftKey)}" aria-label="${esc(listening ? t('a.listening') : t('a.dictate'))}" aria-pressed="${listening}">${icon('mic', 22)}</button>`;
  }

  UI.action('voice', (el) => {
    const key = el.dataset.key;
    if (voice.ctl) { voice.ctl.stop(); voice.ctl = null; voice.key = null; return false; }
    if (!A.voice.supported()) { UI.toast(t('voice.none')); return true; }
    const base = UI.draft(key);
    voice.key = key;
    voice.ctl = A.voice.start(I.language(), {
      onPartial: (text) => { UI.setDraft(key, `${base ? `${base} ` : ''}${text}`.trim()); UI.render(); },
      onError: (code) => {
        voice.ctl = null; voice.key = null;
        if (code === 'denied' || code === 'unavailable') UI.toast(t('voice.denied'));
        else if (code === 'silence') UI.toast(t('voice.silence'));
        UI.render();
      },
      onEnd: () => { voice.ctl = null; voice.key = null; UI.render(); },
    });
    if (!voice.ctl) { voice.key = null; UI.toast(t('voice.denied')); return true; }
    return false;
  });

  A.views = Object.assign(A.views || {}, { greeting, nowCard, modeBanner, pulseChip, modeChip, voiceButton, flow });
})(typeof globalThis !== 'undefined' ? globalThis : this);
