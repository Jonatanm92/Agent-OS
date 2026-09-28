/* Aura — onboarding. Short, skippable, and ends on a useful first day. */
(function (root) {
  const A = root.Aura;
  const U = A.util, I = A.i18n, M = A.model, P = A.planner, S = A.store, icon = A.icon;
  const UI = A.ui, V = A.views;
  const { esc, t } = UI;

  I.add({
    'ob.tagline': ['Ett lugnt operativsystem för vardagen. Aura håller reda på det du inte ska behöva tänka på.', 'A calm operating system for everyday life. Aura keeps track of what you should not have to think about.'],
    'ob.start': ['Kom igång', 'Get started'],
    'ob.skip': ['Hoppa över introduktionen', 'Skip the introduction'],
    'ob.skipStep': ['Hoppa över', 'Skip'],
    'ob.next': ['Nästa', 'Next'],
    'ob.back': ['Tillbaka', 'Back'],
    'ob.step': ['{n} av {total}', '{n} of {total}'],
    'ob.name': ['Vad ska Aura kalla dig?', 'What should Aura call you?'],
    'ob.nameLead': ['Frivilligt. Det används bara för att hälsa.', 'Optional. It is only used to say hello.'],
    'ob.help': ['Vad vill du att Aura hjälper till med?', 'What would you like Aura to help with?'],
    'ob.helpLead': ['Välj så många du vill. Du kan ändra det sen.', 'Pick as many as you like. You can change this later.'],
    'ob.h.planning': ['Planera dagen', 'Planning my day'],
    'ob.h.remembering': ['Komma ihåg saker', 'Remembering things'],
    'ob.h.home': ['Hemmet och det som återkommer', 'Home and recurring chores'],
    'ob.h.admin': ['Ärenden, samtal och blanketter', 'Admin, calls and forms'],
    'ob.h.shopping': ['Inköpslistor', 'Shopping lists'],
    'ob.h.routines': ['Rutiner morgon och kväll', 'Morning and evening routines'],
    'ob.h.projects': ['Större projekt', 'Bigger projects'],
    'ob.h.lowEnergy': ['Dagar med lite energi', 'Low-energy days'],
    'ob.h.cycle': ['Cykelspårning', 'Cycle tracking'],
    'ob.h.reflection': ['Reflektion och stillhet', 'Reflection and quiet'],
    'ob.hard': ['Vad brukar göra vardagen svår?', 'What usually makes everyday life hard?'],
    'ob.hardLead': ['Så att Aura vet hur mycket den ska lägga i en dag.', 'So Aura knows how much to put in a day.'],
    'ob.x.head': ['För mycket i huvudet', 'Too much in my head'],
    'ob.x.energy': ['Ojämn energi', 'Uneven energy'],
    'ob.x.start': ['Att komma igång', 'Getting started'],
    'ob.x.forget': ['Jag glömmer saker', 'I forget things'],
    'ob.x.time': ['Tiden rinner iväg', 'Time slips away'],
    'ob.x.small': ['Alla små saker', 'All the small things'],
    'ob.x.overplan': ['Jag planerar för mycket', 'I plan too much'],
    'ob.rhythm': ['Din rytm', 'Your rhythm'],
    'ob.rhythmLead': ['Ungefär räcker. Aura planerar aldrig över din sovtid.', 'Roughly is fine. Aura never plans into your sleep.'],
    'ob.routinesToo': ['Lägg till en enkel morgon- och kvällsrutin', 'Add a simple morning and evening routine'],
    'ob.pulse': ['Hur är det i dag?', 'How are you today?'],
    'ob.pulseLead': ['Två knapptryck. Aura anpassar dagen efter det.', 'Two taps. Aura shapes the day around it.'],
    'ob.dump': ['Vad har du i huvudet i dag?', "What's on your mind today?"],
    'ob.dumpLead': ['Skriv allt som dyker upp. Aura gör en första dag av det.', 'Write whatever comes up. Aura turns it into a first day.'],
    'ob.dumpPh': ['t.ex. Handla mjölk, ringa vårdcentralen, tvätta, jobbmöte kl 14', 'e.g. Buy milk, call the GP, laundry, work meeting at 2pm'],
    'ob.build': ['Bygg min dag', 'Build my day'],
    'ob.sortFirst': ['Sortera', 'Sort it'],
    'ob.noDump': ['Inget just nu', 'Nothing right now'],
    'ob.welcome': ['Välkommen. Här är det som spelar roll just nu.', 'Welcome. Here is what matters right now.'],
  });

  const HELP = ['planning', 'remembering', 'home', 'admin', 'shopping', 'routines', 'projects', 'lowEnergy', 'cycle', 'reflection'];
  const HARD = ['head', 'energy', 'start', 'forget', 'time', 'small', 'overplan'];
  const STEPS = ['welcome', 'name', 'help', 'hard', 'rhythm', 'pulse', 'dump'];
  const WEEK = [1, 2, 3, 4, 5, 6, 0];

  const ob = { step: 0, help: [], hard: [], energy: null, mood: null, workDays: null, hours: false, routines: null, result: null, busy: false };
  V.results.ob = null;

  function prefsNow() { return S.state.prefs; }

  function stepHeader() {
    const n = ob.step;
    return `<div class="ob-top">
      ${n > 0 ? `<button class="icon-btn" data-action="ob-back" aria-label="${esc(t('ob.back'))}">${icon('back', 22)}</button>` : '<span></span>'}
      ${n > 0 ? `<div class="ob-dots" aria-label="${esc(t('ob.step', { n, total: STEPS.length - 1 }))}">${STEPS.slice(1).map((s, i) => `<span class="${i + 1 <= n ? 'on' : ''}"></span>`).join('')}</div>` : '<span></span>'}
      <button class="btn tiny quiet" data-action="ob-skip-all">${esc(t('ob.skip'))}</button></div>`;
  }

  function multi(list, chosen, prefix, action) {
    return `<div class="chips big">${list.map((k) => `<button class="chip${chosen.includes(k) ? ' on' : ''}" data-action="${action}" data-value="${k}" aria-pressed="${chosen.includes(k)}">${chosen.includes(k) ? icon('check', 15) : ''}${esc(t(`${prefix}.${k}`))}</button>`).join('')}</div>`;
  }

  function footer(nextLabel, nextAction, skip) {
    return `<div class="ob-foot">
      ${skip ? `<button class="btn quiet" data-action="ob-next">${esc(t('ob.skipStep'))}</button>` : '<span></span>'}
      <button class="btn primary" data-action="${nextAction || 'ob-next'}">${esc(nextLabel || t('ob.next'))}</button></div>`;
  }

  UI.view('onboarding', {
    noDock: true,
    render(state) {
      const p = state.prefs;
      const step = STEPS[ob.step];
      if (step === 'welcome') {
        return `<div class="ob welcome">
          <div class="ob-mark" aria-hidden="true"><span class="ob-glow"></span></div>
          <h1 class="ob-word">Aura</h1>
          <p class="lead">${esc(t('ob.tagline'))}</p>
          <div class="chips center" role="group" aria-label="${esc(t('set.language'))}">${[{ v: 'sv', t: 'Svenska' }, { v: 'en', t: 'English' }].map((l) => `<button class="chip${I.language() === l.v ? ' on' : ''}" data-action="ob-lang" data-value="${l.v}" aria-pressed="${I.language() === l.v}">${esc(l.t)}</button>`).join('')}</div>
          <button class="btn primary wide big-btn" data-action="ob-next">${esc(t('ob.start'))}</button>
          <button class="btn quiet" data-action="ob-skip-all">${esc(t('ob.skip'))}</button>
        </div>`;
      }
      let body = '';
      if (step === 'name') {
        body = `<h1>${esc(t('ob.name'))}</h1><p class="lead">${esc(t('ob.nameLead'))}</p>
          <label class="sr" for="ob-name">${esc(t('ob.name'))}</label>
          <input id="ob-name" class="input big" data-model="ob.name" data-enter="ob-next" value="${esc(UI.draft('ob.name', p.name))}" maxlength="40" autocomplete="given-name" data-autofocus>
          ${footer(null, null, true)}`;
      } else if (step === 'help') {
        body = `<h1>${esc(t('ob.help'))}</h1><p class="lead">${esc(t('ob.helpLead'))}</p>${multi(HELP, ob.help, 'ob.h', 'ob-help')}${footer(null, null, true)}`;
      } else if (step === 'hard') {
        body = `<h1>${esc(t('ob.hard'))}</h1><p class="lead">${esc(t('ob.hardLead'))}</p>${multi(HARD, ob.hard, 'ob.x', 'ob-hard')}${footer(null, null, true)}`;
      } else if (step === 'rhythm') {
        const days = ob.workDays || p.workDays;
        const routines = ob.routines != null ? ob.routines : ob.help.includes('routines');
        body = `<h1>${esc(t('ob.rhythm'))}</h1><p class="lead">${esc(t('ob.rhythmLead'))}</p>
          <div class="grid2">
            <div class="field"><label class="label" for="ob-wake">${esc(t('set.wake'))}</label><input id="ob-wake" class="input" type="time" data-model="ob.wake" value="${esc(UI.draft('ob.wake', p.wake))}"></div>
            <div class="field"><label class="label" for="ob-sleep">${esc(t('set.sleep'))}</label><input id="ob-sleep" class="input" type="time" data-model="ob.sleep" value="${esc(UI.draft('ob.sleep', p.sleep))}"></div></div>
          <div class="field"><div class="label">${esc(t('set.workDays'))}</div><div class="daypick">${WEEK.map((d) => `<button class="${days.includes(d) ? 'on' : ''}" data-action="ob-day" data-day="${d}" aria-pressed="${days.includes(d)}">${esc(I.weekdayShort(d))}</button>`).join('')}</div></div>
          <div class="field"><div class="label">${esc(t('set.workHours'))}</div>${UI.chips([{ v: '0', t: t('set.noHours') }, { v: '1', t: t('set.hasHours') }], ob.hours ? '1' : '0', 'ob-hours')}</div>
          ${ob.hours ? `<div class="grid2"><div class="field"><label class="label" for="ob-ws">${esc(t('set.from'))}</label><input id="ob-ws" class="input" type="time" data-model="ob.ws" value="${esc(UI.draft('ob.ws', '08:00'))}"></div>
            <div class="field"><label class="label" for="ob-we">${esc(t('set.to'))}</label><input id="ob-we" class="input" type="time" data-model="ob.we" value="${esc(UI.draft('ob.we', '16:00'))}"></div></div>` : ''}
          <button class="toggle${routines ? ' on' : ''}" data-action="ob-routines" aria-pressed="${routines}"><span class="knob"></span>${esc(t('ob.routinesToo'))}</button>
          ${footer(null, null, true)}`;
      } else if (step === 'pulse') {
        const scale = (field, value) => `<div class="field"><div class="label">${esc(t(`pulse.${field}`))}</div><div class="scale">${[1, 2, 3, 4, 5].map((n) => `<button class="scale-btn${value === n ? ' on' : ''}" data-action="ob-pulse" data-field="${field}" data-value="${n}" aria-pressed="${value === n}"><span class="scale-n mono">${n}</span><span class="scale-l">${esc(t(`${field}.${n}`))}</span></button>`).join('')}</div></div>`;
        body = `<h1>${esc(t('ob.pulse'))}</h1><p class="lead">${esc(t('ob.pulseLead'))}</p>${scale('energy', ob.energy)}${scale('mood', ob.mood)}${footer(null, null, true)}`;
      } else if (step === 'dump') {
        if (ob.result) {
          V.results.ob = ob.result;
          body = `<h1>${esc(ob.result.candidates.length ? t('cap.found', { n: ob.result.candidates.length }) : t('ob.dump'))}</h1>
            <p class="faint">${esc(t(ob.result.mode === 'ai' ? 'cap.modeAi' : 'cap.modeRules'))}</p>
            ${ob.result.candidates.length ? V.candidateList(ob.result, 'ob') : `<p class="muted">${esc(t('cap.none'))}</p>`}
            ${footer(t('ob.build'), 'ob-finish', false)}`;
        } else {
          body = `<h1>${esc(t('ob.dump'))}</h1><p class="lead">${esc(t('ob.dumpLead'))}</p>
            <div class="capture-box${ob.busy ? ' busy' : ''}"><label class="sr" for="ob-dump">${esc(t('ob.dump'))}</label>
              <textarea id="ob-dump" class="input dump" rows="6" data-model="ob.dump" placeholder="${esc(t('ob.dumpPh'))}" ${ob.busy ? 'disabled' : ''}>${esc(UI.draft('ob.dump'))}</textarea>
              <div class="capture-bar">${V.voiceButton('ob.dump')}<div class="grow"></div>${ob.busy ? `<span class="muted">${esc(t('cap.sorting'))}</span>` : ''}</div></div>
            <div class="ob-foot"><button class="btn quiet" data-action="ob-finish">${esc(t('ob.noDump'))}</button>
              <button class="btn primary" data-action="ob-sort" ${ob.busy ? 'disabled' : ''}>${esc(t('ob.sortFirst'))}</button></div>`;
        }
      }
      return `<div class="ob">${stepHeader()}<div class="ob-body">${body}</div></div>`;
    },
  });

  UI.action('ob-lang', (el) => {
    I.setLanguage(el.dataset.value);
    S.commit([{ op: 'prefs.set', patch: { language: el.dataset.value } }], { now: new Date(), system: true });
  });
  UI.action('ob-next', () => {
    if (STEPS[ob.step] === 'welcome' && !prefsNow().language) {
      S.commit([{ op: 'prefs.set', patch: { language: I.language() } }], { now: new Date(), system: true });
    }
    if (ob.step < STEPS.length - 1) ob.step += 1;
    UI.render({ scrollTop: true, animate: true });
    return true;
  });
  UI.action('ob-back', () => { if (ob.step > 0) ob.step -= 1; UI.render({ scrollTop: true }); return true; });
  UI.action('ob-help', (el) => { const v = el.dataset.value; ob.help = ob.help.includes(v) ? ob.help.filter((x) => x !== v) : [...ob.help, v]; });
  UI.action('ob-hard', (el) => { const v = el.dataset.value; ob.hard = ob.hard.includes(v) ? ob.hard.filter((x) => x !== v) : [...ob.hard, v]; });
  UI.action('ob-day', (el) => {
    const d = Number(el.dataset.day);
    const cur = ob.workDays || prefsNow().workDays.slice();
    ob.workDays = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d];
  });
  UI.action('ob-hours', (el) => { ob.hours = el.dataset.value === '1'; });
  UI.action('ob-routines', () => { ob.routines = !(ob.routines != null ? ob.routines : ob.help.includes('routines')); });
  UI.action('ob-pulse', (el) => { const n = Number(el.dataset.value); ob[el.dataset.field] = ob[el.dataset.field] === n ? null : n; });
  UI.action('ob-sort', async () => {
    const text = UI.draft('ob.dump').trim();
    if (!text) { UI.actions['ob-finish'](); return true; }
    ob.busy = true; UI.render();
    ob.result = await A.ai.parseDump(S.state, text, new Date());
    ob.busy = false;
    UI.render({ scrollTop: true });
    return true;
  });

  function buildPrefs() {
    const p = prefsNow();
    const help = ob.help;
    const hard = ob.hard;
    const patch = {
      language: I.language(),
      name: UI.draft('ob.name', p.name).trim().slice(0, 40),
      wake: U.toMinutes(UI.draft('ob.wake', p.wake)) !== null ? UI.draft('ob.wake', p.wake) : p.wake,
      sleep: U.toMinutes(UI.draft('ob.sleep', p.sleep)) !== null ? UI.draft('ob.sleep', p.sleep) : p.sleep,
      workDays: (ob.workDays || p.workDays).slice().sort(),
      helpWith: help, hardThings: hard,
      onboarded: true, onboardedAt: new Date().toISOString(),
      timeZone: U.deviceTimeZone(),
    };
    if (ob.hours) { patch.workStart = UI.draft('ob.ws', '08:00'); patch.workEnd = UI.draft('ob.we', '16:00'); }
    if (hard.includes('head') || hard.includes('energy') || hard.includes('overplan') || help.includes('lowEnergy')) patch.density = 'light';
    if (hard.includes('forget')) patch.notifications = 'helpful';
    if (help.length) {
      patch.modules = {
        shopping: true, admin: true, home: true, projects: true, routines: true,
        cycle: help.includes('cycle'), reflection: help.includes('reflection'),
      };
    }
    return patch;
  }

  function finish(skipped) {
    const key = UI.today();
    const ops = [{ op: 'prefs.set', patch: skipped ? { onboarded: true, onboardedAt: new Date().toISOString(), language: I.language(), timeZone: U.deviceTimeZone() } : buildPrefs() }];
    if (!skipped) {
      const wantRoutines = ob.routines != null ? ob.routines : ob.help.includes('routines');
      if (wantRoutines && !S.state.routines.length) {
        ops.push({ op: 'routine.add', routine: Object.assign(A.routines.template('morning'), { start: UI.draft('ob.wake', prefsNow().wake) }) });
        ops.push({ op: 'routine.add', routine: A.routines.template('evening') });
      }
      if (ob.energy || ob.mood) ops.push(Object.assign({ op: 'day.pulse', date: key }, ob.energy ? { energy: ob.energy } : {}, ob.mood ? { mood: ob.mood } : {}));
      if (ob.result) ops.push(...V.candidatesToOps(ob.result, 'ob', { source: 'onboarding' }));
    }
    S.commit(ops, { now: new Date(), system: true });
    const plan = P.autoPlan(S.state, new Date());
    if (plan.ops.length) S.commit(plan.ops, { now: new Date(), system: true });
    for (const k of Object.keys(UI.ui.drafts)) if (k.startsWith('ob.')) UI.clearDraft(k);
    Object.assign(ob, { step: 0, help: [], hard: [], energy: null, mood: null, workDays: null, hours: false, routines: null, result: null });
    V.results.ob = null;
    UI.go('home', {}, { replace: true });
    if (!skipped) UI.toast(t('ob.welcome'));
  }

  UI.action('ob-finish', () => { finish(false); return true; });
  UI.action('ob-skip-all', () => { finish(true); return true; });
})(typeof globalThis !== 'undefined' ? globalThis : this);
