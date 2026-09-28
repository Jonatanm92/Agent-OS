/* Aura — the coach and Ask Aura, in one place.
 *
 * Not a chatbot bolted on: questions about your own plan are answered from
 * the plan itself, instantly and exactly. Open-ended help goes to Claude with
 * today's plan as context, and anything it proposes is shown as changes you
 * can apply — never applied by itself. Conversations are not saved.
 */
(function (root) {
  const A = root.Aura;
  const U = A.util, I = A.i18n, M = A.model, It = A.items, E = A.engine, S = A.store, icon = A.icon;
  const UI = A.ui, V = A.views;
  const { esc, t } = UI;

  I.add({
    'aura.title': ['Aura', 'Aura'],
    'aura.eyebrow': ['Fråga om din dag, eller få hjälp att välja', 'Ask about your day, or get help deciding'],
    'aura.ph': ['Fråga Aura …', 'Ask Aura …'],
    'aura.send': ['Skicka', 'Send'],
    'aura.aiOn': ['Svar från din plan direkt; öppna frågor via Aura AI (ditt Claude-konto).', 'Answers come straight from your plan; open questions go to Aura AI (your Claude account).'],
    'aura.aiOff': ['Aura svarar utifrån din plan. Öppna frågor kräver AI, som inte är tillgängligt här.', "Aura answers from your plan. Open-ended questions need AI, which isn't available here."],
    'aura.notSaved': ['Samtal sparas inte.', "Conversations aren't saved."],
    'aura.fromPlan': ['Från din plan', 'From your plan'],
    'aura.fromAi': ['Aura AI', 'Aura AI'],
    'aura.thinking': ['Tänker …', 'Thinking …'],
    'aura.proposed': ['Föreslagna ändringar', 'Proposed changes'],
    'aura.apply': ['Gör så', 'Apply'],
    'aura.applied': ['Ändringarna är gjorda.', 'Changes applied.'],
    'aura.dismiss': ['Nej tack', 'No thanks'],
    'aura.noAiFallback': ['Det här kan jag inte svara på utan AI. Men jag kan svara på frågor om din plan — prova något av förslagen nedan.', "I can't answer that without AI. I can answer questions about your plan, though — try one of the suggestions below."],
    'aura.clear': ['Rensa', 'Clear'],
    'aura.truncated': ['Svaret blev avkortat. Fråga om en sak i taget.', 'The answer was cut short. Ask about one thing at a time.'],
    'aura.interrupted': ['(avbrutet)', '(interrupted)'],
    'aura.q.first': ['Vad ska jag göra först?', 'What should I do first?'],
    'aura.q.energy': ['Jag har ingen energi i dag', "I don't have energy today"],
    'aura.q.sort': ['Hjälp mig reda ut dagen', 'Help me sort today out'],
    'aura.q.forgot': ['Vad har jag glömt?', 'What have I forgotten?'],
    'aura.q.move': ['Vad kan jag flytta till i morgon?', 'What can I move until tomorrow?'],
    'aura.q.postponed': ['Vad har jag skjutit upp?', 'What have I been postponing?'],
    'aura.q.home': ['Hjälp mig få ordning hemma', 'Help me get the apartment under control'],
    'aura.q.buy': ['Vad skulle jag köpa?', 'What was I supposed to buy?'],
    'aura.q.waiting': ['Vad väntar jag på?', 'What am I waiting for?'],
    'aura.energyAnswer': ['Då gör vi dagen mindre: bara det nödvändiga, en liten vinst, och resten flyttas.', "Then let's make today smaller: only what's necessary, one tiny win, and the rest moves."],
    'aura.energyGo': ['Gör dagen mindre', 'Make today smaller'],
    'aura.sortAnswer': ['Två sätt: bygg om dagen efter tiden och energin som finns kvar, eller töm huvudet och ta en sak i taget.', "Two ways: rebuild the day around the time and energy left, or empty your head and take one thing at a time."],
    'aura.sortRebuild': ['Bygg om dagen', 'Rebuild my day'],
    'aura.sortChaos': ['En sak i taget', 'One thing at a time'],
    'aura.homeAnswer': ['Ett stort mål blir hanterbart som ett projekt: Aura visar bara nästa lilla steg. En snabbstädsrutin hjälper också.', 'A big goal gets manageable as a project: Aura only shows the next small step. A cleaning reset routine helps too.'],
    'aura.homeProject': ['Skapa projektet', 'Create the project'],
    'aura.homeProjectTitle': ['Ordning hemma', 'Home under control'],
    'aura.homeProjectOutcome': ['Ett hem som är lätt att hålla i ordning', 'A home that is easy to keep tidy'],
    'aura.homeRoutine': ['Lägg till snabbstäd', 'Add a cleaning reset'],
    'aura.homeSteps': ['Plocka upp från golvet i ett rum; Gå igenom en låda; Bestäm en plats för det som alltid ligger framme', 'Pick up the floor in one room; Go through one drawer; Decide a home for the thing that is always lying around'],
    'aura.moveAllTomorrow': ['Flytta alla till i morgon', 'Move them all to tomorrow'],
    'aura.projects': ['Projekt', 'Projects'],
  });

  const coach = { thread: [], turns: [], busy: false, ctl: null, streaming: '' };

  function aiOk(state) { return A.ai.status(state).available; }

  /* ---------------- deterministic answers ---------------- */

  function planAnswer(result) {
    return { role: 'aura', kind: 'plan', title: result.title, items: result.items.map((i) => i.id), empty: result.empty, intent: result.intent,
      projects: (result.projects || []).map((p) => p.id), events: (result.events || []).map((f) => ({ title: f.title, at: U.toClock(f.start) })) };
  }

  function route(state, q, now) {
    const n = ` ${U.normalize(q)} `;
    if (/(no energy|don't have energy|dont have energy|exhausted|so tired|drained|no capacity|ingen energi|orkar inte|trött|slut|utmattad)/u.test(n)) {
      return { role: 'aura', kind: 'offer', text: t('aura.energyAnswer'), buttons: [{ label: t('aura.energyGo'), action: 'go', view: 'low' }] };
    }
    if (/(sort (today|my day|out)|sort today out|help me (plan|sort|organi)|overwhelm|too much|reda ut|hjälp mig (planera|sortera)|för mycket|kaos)/u.test(n)) {
      return { role: 'aura', kind: 'offer', text: t('aura.sortAnswer'), buttons: [{ label: t('aura.sortRebuild'), action: 'rebuild' }, { label: t('aura.sortChaos'), action: 'go', view: 'chaos' }] };
    }
    const r = A.search.ask(state, q, now);
    if (A.search.isKnownIntent(r)) return planAnswer(r);
    return null;
  }

  function homeOffer() {
    return { role: 'aura', kind: 'offer', text: t('aura.homeAnswer'), buttons: [{ label: t('aura.homeProject'), action: 'aura-home-project' }, { label: t('aura.homeRoutine'), action: 'aura-home-routine' }] };
  }

  /* ---------------- rendering ---------------- */

  function renderMessage(state, m, index) {
    if (m.role === 'user') return `<div class="msg user"><p>${esc(m.text)}</p></div>`;
    if (m.kind === 'plan') {
      const items = m.items.map((id) => M.itemById(state, id)).filter(Boolean);
      const projects = (m.projects || []).map((id) => M.projectById(state, id)).filter(Boolean);
      let extra = '';
      if (m.intent === 'canMove' && items.some((i) => i.status === 'open')) {
        extra = `<button class="btn small ghost" data-action="aura-move-all" data-index="${index}">${esc(t('aura.moveAllTomorrow'))}</button>`;
      }
      if (m.intent === 'now' && items[0]) {
        extra = `<button class="btn small primary" data-action="now-do" data-id="${esc(items[0].id)}">${esc(t('now.doIt'))}</button>`;
      }
      return `<div class="msg aura"><div class="msg-src">${icon('list', 14)}${esc(t('aura.fromPlan'))}</div>
        <p class="msg-title">${esc(m.title)}</p>
        ${m.events && m.events.length ? `<p class="sub mono">${m.events.map((e) => `${esc(e.at)} ${esc(e.title)}`).join(' · ')}</p>` : ''}
        ${items.length ? `<div class="panel">${items.slice(0, 12).map((i) => UI.itemRow(i, { showKind: m.intent === 'search' || m.intent === 'forgotten' })).join('')}</div>`
          : projects.length ? '' : `<p class="muted">${esc(m.empty)}</p>`}
        ${projects.length ? `<div class="panel">${projects.map((p) => `<button class="row link-row" data-action="go" data-view="project" data-id="${esc(p.id)}">${icon('project', 18)}<span class="grow">${esc(p.title)}</span>${icon('chevron', 16)}</button>`).join('')}</div>` : ''}
        ${extra ? `<div class="btnrow">${extra}</div>` : ''}</div>`;
    }
    if (m.kind === 'offer') {
      return `<div class="msg aura"><div class="msg-src">${icon('list', 14)}${esc(t('aura.fromPlan'))}</div><p>${esc(m.text)}</p>
        <div class="btnrow">${m.buttons.map((b, i) => `<button class="btn small ${i === 0 ? 'primary' : 'ghost'}" data-action="${b.action}"${b.view ? ` data-view="${b.view}"` : ''}>${esc(b.label)}</button>`).join('')}</div></div>`;
    }
    if (m.kind === 'ai') {
      const actions = m.actions || [];
      return `<div class="msg aura ai"><div class="msg-src">${icon('aura', 14)}${esc(t('aura.fromAi'))}</div>
        <p class="pre">${esc(m.text)}${m.interrupted ? ` <span class="muted">${esc(t('aura.interrupted'))}</span>` : ''}</p>
        ${m.truncated ? `<p class="faint">${esc(t('aura.truncated'))}</p>` : ''}
        ${actions.length && !m.resolved ? `<div class="proposal"><div class="label">${esc(t('aura.proposed'))}</div>
          ${actions.map((op) => `<div class="change">${icon('chevron', 14)}<span>${esc(A.apply.describe(state, op, UI.ui.now))}</span></div>`).join('')}
          <div class="btnrow"><button class="btn small primary" data-action="aura-apply" data-index="${index}">${esc(t('aura.apply'))}</button>
          <button class="btn small quiet" data-action="aura-reject" data-index="${index}">${esc(t('aura.dismiss'))}</button></div></div>` : ''}
      </div>`;
    }
    if (m.kind === 'error') return `<div class="msg aura muted-msg"><p>${esc(m.text)}</p></div>`;
    return '';
  }

  function prompts(state) {
    const key = UI.today();
    const b = It.dayBuckets(state, key);
    const list = [];
    if (b.must.length + b.good.length) list.push('aura.q.first');
    list.push('aura.q.energy', 'aura.q.sort', 'aura.q.forgot');
    if (b.good.length) list.push('aura.q.move');
    if (state.items.some((i) => i.status === 'open' && i.postponed)) list.push('aura.q.postponed');
    if (It.shoppingList(state).count) list.push('aura.q.buy');
    if (It.adminList(state, key).waiting.length) list.push('aura.q.waiting');
    list.push('aura.q.home');
    return coach.thread.length ? list.slice(0, 4) : list;
  }

  UI.view('aura', {
    render(state, params) {
      const ai = aiOk(state);
      const thread = coach.thread.map((m, i) => renderMessage(state, m, i)).join('');
      const streaming = coach.busy ? `<div class="msg aura ai"><div class="msg-src">${icon('aura', 14)}${esc(t('aura.fromAi'))}</div><p class="pre">${coach.streaming ? esc(coach.streaming) : `<span class="dots">${esc(t('aura.thinking'))}</span>`}</p>
        <button class="btn tiny quiet" data-action="aura-stop">${esc(t('a.stop'))}</button></div>` : '';
      if (params && params.ask && UI.draft('aura.q') && !coach.busy) { params.ask = false; setTimeout(() => A.ui.actions['aura-send'](), 0); }
      return `<header class="top"><div class="grow"><div class="eyebrow">${esc(t('aura.eyebrow'))}</div><h1>${esc(t('aura.title'))}</h1></div>
          ${coach.thread.length ? `<button class="btn tiny quiet" data-action="aura-clear">${esc(t('aura.clear'))}</button>` : ''}</header>
        <p class="faint">${esc(t(ai ? 'aura.aiOn' : 'aura.aiOff'))} ${esc(t('aura.notSaved'))}</p>
        <div class="thread" aria-live="polite">${thread}${streaming}</div>
        <div class="chips prompts">${prompts(state).map((k) => `<button class="chip" data-action="aura-prompt" data-key="${k}">${esc(t(k))}</button>`).join('')}</div>
        <div class="askbar">
          <label class="sr" for="aura-q">${esc(t('aura.ph'))}</label>
          <input id="aura-q" class="input" data-model="aura.q" data-enter="aura-send" placeholder="${esc(t('aura.ph'))}" value="${esc(UI.draft('aura.q'))}" autocomplete="off" enterkeyhint="send" ${coach.busy ? 'disabled' : ''}>
          ${V.voiceButton('aura.q')}
          <button class="icon-btn solid" data-action="aura-send" aria-label="${esc(t('aura.send'))}" ${coach.busy ? 'disabled' : ''}>${icon('send', 20)}</button>
        </div>`;
    },
  });

  async function ask(q) {
    const state = S.state;
    const now = new Date();
    coach.thread.push({ role: 'user', text: q });
    const det = route(state, q, now);
    if (det) { coach.thread.push(det); UI.render(); scrollThread(); return; }
    if (!aiOk(state)) {
      const r = A.search.ask(state, q, now);
      if (r.items.length || (r.projects || []).length) coach.thread.push(planAnswer(r));
      else coach.thread.push({ role: 'aura', kind: 'error', text: t('aura.noAiFallback') });
      UI.render(); scrollThread();
      return;
    }
    coach.turns.push({ role: 'user', content: q });
    coach.busy = true; coach.streaming = ''; coach.ctl = new AbortController();
    UI.render(); scrollThread();
    const res = await A.ai.coach(state, coach.turns, now, {
      signal: coach.ctl.signal,
      onText: (text) => { coach.streaming = text; paintStream(); },
    });
    coach.busy = false; coach.ctl = null;
    if (res.ok) {
      coach.thread.push({ role: 'aura', kind: 'ai', text: res.reply, actions: res.actions, truncated: res.truncated });
      coach.turns.push({ role: 'assistant', content: res.reply });
    } else if (res.cancelled) {
      if (coach.streaming) coach.thread.push({ role: 'aura', kind: 'ai', text: coach.streaming, actions: [], interrupted: true });
      coach.turns.pop();
    } else {
      if (res.partial) coach.thread.push({ role: 'aura', kind: 'ai', text: res.partial, actions: [], interrupted: true });
      coach.thread.push({ role: 'aura', kind: 'error', text: t(res.key || 'ai.err.failed') });
      coach.turns.pop();
    }
    coach.streaming = '';
    UI.render(); scrollThread();
  }

  function paintStream() {
    const el = root.document.querySelector('.thread .msg.ai:last-child .pre');
    if (el && coach.busy) el.textContent = coach.streaming; else UI.render();
  }
  function scrollThread() {
    const last = root.document.querySelector('.thread > :last-child');
    if (last && last.scrollIntoView) last.scrollIntoView({ block: 'nearest' });
  }

  UI.action('aura-send', () => {
    const q = UI.draft('aura.q').trim();
    if (!q || coach.busy) return true;
    UI.clearDraft('aura.q');
    ask(q);
    return true;
  });
  UI.action('aura-prompt', (el) => {
    if (coach.busy) return true;
    if (el.dataset.key === 'aura.q.home') {
      coach.thread.push({ role: 'user', text: t('aura.q.home') });
      if (aiOk(S.state)) { coach.thread.pop(); ask(t('aura.q.home')); return true; }
      coach.thread.push(homeOffer());
      return false;
    }
    ask(t(el.dataset.key));
    return true;
  });
  UI.action('aura-stop', () => { if (coach.ctl) coach.ctl.abort(); return true; });
  UI.action('aura-clear', () => { coach.thread = []; coach.turns = []; });
  UI.action('aura-apply', (el) => {
    const m = coach.thread[Number(el.dataset.index)];
    if (!m || !m.actions) return true;
    const res = UI.commit(m.actions, { message: t('aura.applied') });
    if (res.applied.length) m.resolved = true;
  });
  UI.action('aura-reject', (el) => { const m = coach.thread[Number(el.dataset.index)]; if (m) m.resolved = true; });
  UI.action('aura-move-all', (el) => {
    const m = coach.thread[Number(el.dataset.index)];
    if (!m) return true;
    const ops = m.items.map((id) => M.itemById(S.state, id)).filter((i) => i && i.status === 'open').map((i) => ({ op: 'item.postpone', id: i.id, to: 'tomorrow' }));
    UI.commit(ops);
  });
  UI.action('aura-home-project', () => {
    const title = t('aura.homeProjectTitle');
    const existing = S.state.projects.find((p) => p.title === title && p.status !== 'done');
    if (existing) { UI.go('project', { id: existing.id }); return true; }
    const res = S.commit([{ op: 'project.add', project: { title, outcome: t('aura.homeProjectOutcome') } }], { now: new Date() });
    const pid = res.ids[0];
    UI.commit(t('aura.homeSteps').split(/;\s*/).map((s, i) => ({ op: 'item.add', item: { title: s, projectId: pid, minutes: 15, energy: 'light', order: i, source: 'coach' } })), { message: t('op.projectAdd', { title }) });
    UI.go('project', { id: pid });
    return true;
  });
  UI.action('aura-home-routine', () => {
    const tpl = A.routines.template('reset');
    UI.commit([{ op: 'routine.add', routine: tpl }]);
    UI.go('routines');
    return true;
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
