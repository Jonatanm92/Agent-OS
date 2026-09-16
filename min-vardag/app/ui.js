/* Min vardag — gränssnitt.
 * Mobilen först: stora tryckytor, få val per skärm, en tydlig nästa handling. */
(function (root) {
  const MV = root.MinVardag;
  const U = MV.util, M = MV.model, P = MV.planner, S = MV.store;

  const app = document.getElementById('app');
  const navEl = document.getElementById('nav');
  const toastEl = document.getElementById('toast');

  const VIEWS = [
    { id: 'dag', label: 'Min dag', icon: '☀︎' },
    { id: 'berat', label: 'Berätta', icon: '✎︎' },
    { id: 'barn', label: 'Barn', icon: '♥︎' },
    { id: 'vantar', label: 'Kan vänta', icon: '◷︎' },
    { id: 'kvall', label: 'Kväll', icon: '☾︎' },
  ];

  const ui = {
    view: 'dag',
    now: new Date(),
    draft: '',
    proposal: null,       // { mode, ops, questions, summary, picks }
    busy: false,
    expanded: null,       // uppgifts-id med öppna knappar
    moveFor: null,
    showMoved: false,
    settingsOpen: false,
    aiStatus: { available: false, checked: false, label: 'Kontrollerar …' },
  };

  /* ---------- små hjälpare ---------- */
  const esc = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function toast(message, undoable) {
    toastEl.innerHTML = `<div class="toast"><span class="grow">${esc(message)}</span>${
      undoable ? '<button data-action="undo">Ångra</button>' : ''
    }<button data-action="dismiss-toast" aria-label="Stäng">✕</button></div>`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toastEl.innerHTML = ''; }, undoable ? 9000 : 4000);
  }

  function statusChips(state) {
    const mode = S.mode;
    const storeLabel = mode === 'moln' ? 'Sparat skyddat'
      : mode === 'lokalt' ? 'Sparat i webbläsaren' : 'Sparas inte';
    const aiLabel = !ui.aiStatus.checked ? 'AI: kontrollerar'
      : ui.aiStatus.available ? 'AI ansluten' : 'Ingen AI — regeltolkning';
    return `<div class="chiprow">
      <span class="chip${mode === 'moln' ? ' on' : mode === 'minne' ? ' warnish' : ''}"><span class="dot"></span>${esc(storeLabel)}</span>
      <span class="chip${ui.aiStatus.available ? ' on' : ''}">${esc(aiLabel)}</span>
      <button class="chip" data-action="open-settings">Inställningar</button>
    </div>`;
  }

  /* ─────────────────── MIN DAG ─────────────────── */

  function renderDag(state) {
    const plan = P.planDay(state, ui.now);
    const day = M.getDay(state, plan.dateKey);

    if (!state.children.length) return renderWelcome(state, plan);

    const energyLabel = (M.ENERGY[plan.energy] || {}).label || 'Okänd';
    const presence = plan.presence;
    const presenceText = presence.present.length
      ? `${presence.present.map((c) => c.name).join(', ')} hos dig`
      : presence.unknown.length === state.children.length ? 'Barnens dag okänd' : 'Inga barn hos dig i dag';

    return `
    <header class="top">
      <div class="grow">
        <div class="eyebrow">${esc(U.longDate(plan.dateKey))} · ${esc(plan.nowClock)}</div>
        <h1>Min dag</h1>
      </div>
      <button class="btn small" data-action="replan" aria-label="Planera om">Planera om</button>
    </header>

    <div class="chiprow">
      <button class="chip${plan.energy !== 'okand' ? ' on' : ''}" data-action="cycle-energy">Ork: ${esc(energyLabel)}</button>
      <button class="chip${plan.workday === 'ja' ? ' on' : plan.workday === 'okand' ? ' warnish' : ''}" data-action="cycle-work">${
        plan.workday === 'ja' ? 'Arbetsdag' : plan.workday === 'nej' ? 'Ledig' : 'Arbete okänt'}</button>
      <button class="chip${presence.present.length ? ' on' : presence.unknown.length ? ' warnish' : ''}" data-action="go-presence">${esc(presenceText)}</button>
    </div>

    ${renderNowCard(plan)}
    ${renderOpenQuestions(state, plan)}
    ${renderPriorities(state, plan)}
    ${renderFixed(plan)}
    ${renderLater(plan)}
    ${renderMoved(plan)}
    ${statusChips(state)}
    `;
  }

  function renderNowCard(plan) {
    const card = plan.nowCard;
    const label = {
      pagaende: 'Pågår nu', snart: 'Strax', uppgift: 'Gör det här nu',
      egen: 'Din tid', fritt: 'Just nu', kvall: 'Kväll',
    }[card.type] || 'Gör det här nu';

    let actions = '';
    if (card.taskId) {
      actions = `<div class="btnrow actions">
        <button class="btn primary" data-action="task-done" data-id="${esc(card.taskId)}">Klar</button>
        <button class="btn" data-action="task-less" data-id="${esc(card.taskId)}">Gör mindre</button>
        <button class="btn" data-action="task-move" data-id="${esc(card.taskId)}">Flytta</button>
      </div>`;
    }
    return `<section class="now" aria-label="${esc(label)}">
      <div class="label">${esc(label)}</div>
      <h2>${esc(card.title)}</h2>
      <p class="detail">${esc(card.detail || '')}</p>
      ${actions}
      ${ui.moveFor && ui.moveFor === card.taskId ? moveChoices(card.taskId) : ''}
    </section>`;
  }

  function moveChoices(taskId) {
    return `<div class="question"><div class="q">Flytta till</div><div class="opts">
      <button class="btn" data-action="move-to" data-id="${esc(taskId)}" data-to="senare">Senare i dag</button>
      <button class="btn" data-action="move-to" data-id="${esc(taskId)}" data-to="imorgon">I morgon</button>
      <button class="btn" data-action="move-to" data-id="${esc(taskId)}" data-to="vantar">Kan vänta</button>
      <button class="btn quiet" data-action="move-cancel">Avbryt</button>
    </div></div>`;
  }

  /** Öppna frågor visas som frågor med snabbsvar — aldrig som antaganden. */
  function renderOpenQuestions(state, plan) {
    if (!plan.notes.length) return '';
    return plan.notes.map((note) => {
      if (note.field === 'work') {
        return `<div class="note"><div class="grow"><div>${esc(note.text)}</div>
          <div class="btnrow"><button class="btn small" data-action="set-work" data-value="ja">Jag arbetar</button>
          <button class="btn small" data-action="set-work" data-value="nej">Jag är ledig</button></div></div></div>`;
      }
      if (note.field === 'children') {
        return `<div class="note"><div class="grow"><div>${esc(note.text)}</div>
          <div class="btnrow"><button class="btn small" data-action="set-all-children" data-value="ja">De är här</button>
          <button class="btn small" data-action="set-all-children" data-value="nej">Inte i dag</button>
          <button class="btn small quiet" data-action="go-presence">Per barn</button></div></div></div>`;
      }
      if (note.field === 'pickUp') {
        return `<div class="note"><div class="grow"><div>${esc(note.text)}</div>
          <div class="btnrow"><button class="btn small" data-action="open-settings">Ange hämtningstid</button></div></div></div>`;
      }
      return `<div class="note">${esc(note.text)}</div>`;
    }).join('');
  }

  function renderPriorities(state, plan) {
    if (!plan.priorities.length) {
      const has = M.openTasks(state).length;
      return `<section class="section">
        <div class="section-head"><h2>Dagens prioriteringar</h2></div>
        <div class="card flat"><p class="muted">${
          plan.energy === 'lag'
            ? 'Låg ork i dag. Inget mer än det nödvändiga är inplanerat.'
            : has ? 'Inget behöver pressas in i dag. Det som finns ligger under Kan vänta.'
              : 'Inget planerat. Berätta vad som behöver göras så hjälper jag dig.'
        }</p></div>
      </section>`;
    }
    return `<section class="section">
      <div class="section-head"><h2>Dagens prioriteringar</h2>
        <span class="hint">${plan.priorities.length} av högst 3</span></div>
      <div class="card">${plan.priorities.map((p) => priorityRow(state, p)).join('')}</div>
    </section>`;
  }

  function priorityRow(state, p) {
    const child = p.childId ? M.childName(state, p.childId) : '';
    const open = ui.expanded === p.taskId;
    return `<div class="row">
      <button class="tick" data-action="task-done" data-id="${esc(p.taskId)}" aria-label="Markera ${esc(p.title)} som klar"></button>
      <div class="grow">
        <div class="title">${esc(p.title)}</div>
        <div class="sub">${esc(U.toClock(p.start))} · ${esc(U.duration(p.minutes))}${
          child ? ` · ${esc(child)}` : ''}${p.why ? ` · ${esc(p.why)}` : ''}</div>
      </div>
      <button class="btn small quiet" data-action="expand" data-id="${esc(p.taskId)}" aria-label="Fler val">${open ? '✕' : '⋯'}</button>
    </div>
    ${open ? `<div class="btnrow" style="padding:4px 0 12px">
        <button class="btn small" data-action="task-less" data-id="${esc(p.taskId)}">Gör mindre</button>
        <button class="btn small" data-action="task-move" data-id="${esc(p.taskId)}">Flytta</button>
      </div>${ui.moveFor === p.taskId ? moveChoices(p.taskId) : ''}` : ''}`;
  }

  function renderFixed(plan) {
    const upcoming = plan.fixed.filter((f) => f.end > plan.nowMinutes);
    if (!upcoming.length) return '';
    return `<section class="section">
      <div class="section-head"><h2>Fast i dag</h2></div>
      <div class="card">${upcoming.map((f) => `<div class="row">
        <span class="time">${esc(U.toClock(f.start))}</span>
        <div class="grow"><div class="title">${esc(f.title)}</div>
        <div class="sub">till ${esc(U.toClock(f.end))}</div></div>
      </div>`).join('')}</div>
    </section>`;
  }

  function renderLater(plan) {
    // Fasta åtaganden står redan under "Fast i dag" — upprepa dem inte här.
    const items = [...plan.later.filter((i) => i.type !== 'fast'), ...plan.upcoming];
    if (!items.length && !plan.reserved) return '';
    return `<section class="section">
      <div class="section-head"><h2>Senare</h2><span class="hint">översikt</span></div>
      <div class="card flat">
        ${plan.reserved ? `<div class="row"><span class="time">${esc(U.toClock(plan.reserved.start))}</span>
          <div class="grow"><div class="title">${esc(plan.reserved.title)}</div>
          <div class="sub">${esc(plan.reserved.detail)}</div></div></div>` : ''}
        ${items.map((i) => `<div class="row"><span class="time">${esc(i.at)}</span>
          <div class="grow"><div class="title">${esc(i.title)}</div></div></div>`).join('')}
      </div>
    </section>`;
  }

  function renderMoved(plan) {
    if (!plan.moved.length) return '';
    return `<section class="section">
      <button class="btn wide quiet" data-action="toggle-moved">${
        ui.showMoved ? 'Dölj' : `Visa vad som inte ryms i dag (${plan.moved.length})`}</button>
      ${ui.showMoved ? `<div class="card flat" style="margin-top:8px">${plan.moved.map((m) => `
        <div class="row"><div class="grow"><div class="title">${esc(m.title)}</div>
        <div class="sub">${esc(m.reason)}</div></div></div>`).join('')}
        <p class="faint" style="margin-top:10px">Inget är borttaget. Det ligger kvar under Kan vänta.</p>
      </div>` : ''}
    </section>`;
  }

  function renderWelcome(state, plan) {
    return `<header class="top"><div class="grow">
      <div class="eyebrow">${esc(U.longDate(plan.dateKey))}</div><h1>Min vardag</h1></div></header>
      <div class="card"><h2>Kom igång</h2>
      <p class="muted" style="margin:8px 0 16px">Lägg till dina barn så kan jag hjälpa dig planera dagen.
      Jag antar ingenting om vilka dagar de är hos dig — du anger det själv, och kan ändra när som helst.</p>
      <button class="btn primary wide" data-action="open-settings">Lägg till barn</button></div>
      ${statusChips(state)}`;
  }

  /* ─────────────────── BERÄTTA ─────────────────── */

  const EXAMPLES = [
    'Jag har låg ork i dag.',
    'Barnen kommer till mig i kväll.',
    'Det här hann jag inte.',
    'Vad behöver jag förbereda inför i morgon?',
  ];

  function renderBerat(state) {
    return `
    <header class="top"><div class="grow">
      <div class="eyebrow">${esc(U.longDate(U.dateKey(ui.now)))} · ${esc(U.toClock(U.minutesOfDay(ui.now)))}</div>
      <h1>Berätta</h1></div></header>

    <div class="card tell">
      <label class="sr" for="tell">Skriv vad som gäller</label>
      <textarea id="tell" placeholder="Skriv eller diktera. Till exempel: &quot;Lo behöver fler byxor. Jag fixar det efter jobbet.&quot;">${esc(ui.draft)}</textarea>
      <div class="suggest">${EXAMPLES.map((e) => `<button class="chip" data-action="example" data-text="${esc(e)}">${esc(e)}</button>`).join('')}</div>
      <button class="btn primary wide" data-action="interpret" ${ui.busy ? 'disabled' : ''}>${
        ui.busy ? 'Tolkar …' : 'Föreslå ändringar'}</button>
      <p class="faint" style="margin-top:10px">${
        ui.aiStatus.available
          ? 'AI-tolkning är ansluten. Ingenting ändras förrän du godkänner.'
          : 'Ingen AI ansluten — texten tolkas med enkla regler. Ingenting ändras förrän du godkänner.'}</p>
    </div>

    ${ui.proposal ? renderProposal(state) : ''}
    ${renderRecent(state)}
    `;
  }

  function renderProposal(state) {
    const p = ui.proposal;
    const changes = p.ops.map((op) => MV.apply.describeOp(state, op));
    const picked = p.picks || {};
    const pendingQuestions = p.questions.filter((q) => !(q.id in picked));

    const answeredOps = [];
    for (const q of p.questions) {
      const choice = picked[q.id];
      if (!choice || choice === '__skip__') continue;
      const option = q.options.find((o) => o.id === choice);
      if (option) answeredOps.push(...option.ops);
    }

    const total = [...p.ops, ...answeredOps];
    const modeLabel = p.mode === 'ai' ? 'Tolkat med AI' : 'Tolkat med regler (ingen AI)';

    if (!total.length && !p.questions.length) {
      return `<div class="proposal">
        <h2>Jag förstod inte riktigt</h2>
        <p class="muted" style="margin:8px 0 14px">${esc(p.summary || 'Försök skriva om det, gärna med barnets namn och vad det gäller.')}</p>
        ${p.answerText ? `<p style="margin-bottom:14px">${p.answerText}</p>` : ''}
        <button class="btn wide" data-action="clear-proposal">Stäng</button>
      </div>`;
    }

    return `<div class="proposal">
      <div class="eyebrow">${esc(modeLabel)}</div>
      <h2 style="margin:6px 0 12px">Förslag</h2>
      ${p.aiNote ? `<div class="note">${esc(p.aiNote)}</div>` : ''}

      ${p.questions.map((q) => {
        const choice = picked[q.id];
        return `<div class="question"><div class="q">${esc(q.text)}</div><div class="opts">
          ${q.options.map((o) => `<button class="btn${choice === o.id ? ' picked' : ''}"
            data-action="pick" data-q="${esc(q.id)}" data-o="${esc(o.id)}">${esc(o.label)}</button>`).join('')}
          <button class="btn quiet${choice === '__skip__' ? ' picked' : ''}"
            data-action="pick" data-q="${esc(q.id)}" data-o="__skip__">${esc(q.skipLabel || 'Hoppa över')}</button>
        </div></div>`;
      }).join('')}

      ${total.length ? `<div style="margin:12px 0">
        ${[...changes, ...answeredOps.map((op) => MV.apply.describeOp(state, op))]
          .map((c) => `<div class="change"><span class="mark">→</span><span>${esc(c)}</span></div>`).join('')}
      </div>` : '<p class="muted" style="margin:10px 0">Svara på frågan ovan så visar jag vad som ändras.</p>'}

      ${p.unmatched && p.unmatched.length ? p.unmatched.map((u) => `<div class="note">${esc(u)}</div>`).join('') : ''}

      ${total.length && pendingQuestions.length ? `<p class="faint" style="margin:4px 0 10px">${
        pendingQuestions.length === 1 ? 'En fråga är obesvarad' : `${pendingQuestions.length} frågor är obesvarade`
      } — det lämnas oförändrat.</p>` : ''}

      <div class="btnrow" style="margin-top:6px">
        <button class="btn primary" data-action="accept" ${total.length ? '' : 'disabled'}>Godkänn</button>
        <button class="btn" data-action="clear-proposal">Avbryt</button>
      </div>
    </div>`;
  }

  function renderRecent(state) {
    const done = state.tasks.filter((t) => t.status === 'klar')
      .sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt))).slice(0, 3);
    if (!done.length) return '';
    return `<section class="section"><div class="section-head"><h2>Nyss klart</h2></div>
      <div class="card flat">${done.map((t) => `<div class="row">
        <div class="grow"><div class="title strike">${esc(t.title)}</div></div>
        <button class="btn small quiet" data-action="task-reopen" data-id="${esc(t.id)}">Ångra</button>
      </div>`).join('')}</div></section>`;
  }

  /* ─────────────────── BARN ─────────────────── */

  function renderBarn(state) {
    if (!state.children.length) {
      return `<header class="top"><div class="grow"><h1>Barn</h1></div></header>
        <div class="empty"><div class="big">♥</div><p>Inga barn tillagda än.</p>
        <button class="btn primary" style="margin-top:14px" data-action="open-settings">Lägg till barn</button></div>`;
    }
    return `<header class="top"><div class="grow">
      <h1>Barn</h1><div class="eyebrow">Behov, storlekar och förberedelser</div></div></header>
      ${state.children.map((c) => childCard(state, c)).join('')}
      <div class="card flat"><p class="faint">Storlekar märkta <span class="tag prel">preliminär</span>
      är provstorlekar, inte uppmätta kroppsmått. Inget här är ett bekräftat köp förrän du säger det.</p></div>`;
  }

  function childCard(state, child) {
    const needs = state.needs.filter((n) => n.childId === child.id);
    const groups = [
      ['behover', 'Behöver ordnas'],
      ['planerat', 'Planerat'],
      ['bekraftat', 'Bekräftat klart'],
    ];
    const sizes = state.sizes.filter((s) => s.childId === child.id);
    const today = U.dateKey(ui.now);
    const presence = M.childPresence(state, today, child.id);

    return `<section class="card">
      <div class="row" style="padding-top:0">
        <div class="grow"><h2>${esc(child.name)}</h2>
        <div class="sub">${presence === 'ja' ? 'Hos dig i dag' : presence === 'nej' ? 'Inte hos dig i dag' : 'I dag: okänt'}</div></div>
        <button class="btn small" data-action="add-need" data-child="${esc(child.id)}">Lägg till</button>
      </div>

      ${groups.map(([key, label]) => {
        const items = needs.filter((n) => n.status === key);
        if (!items.length) return '';
        return `<div style="margin-top:10px">
          <span class="tag ${key}">${esc(label)}</span>
          ${items.map((n) => needRow(state, n)).join('')}
        </div>`;
      }).join('')}

      ${!needs.length ? '<p class="faint" style="margin-top:10px">Inga behov registrerade.</p>' : ''}

      <hr class="hr">
      <div class="row" style="padding-top:0;border:none">
        <div class="grow"><h3>Storlekar</h3></div>
        <button class="btn small quiet" data-action="add-size" data-child="${esc(child.id)}">Lägg till</button>
      </div>
      ${sizes.length ? sizes.map((s) => `<div class="row">
        <div class="grow"><div class="title">${esc(s.value)}</div>
        <div class="sub">${s.kind === 'kropp'
          ? esc(s.label)
          : `${esc(s.brand || 'Märke ej angivet')} · ${esc(s.label)}`}</div></div>
        ${s.preliminary ? '<span class="tag prel">preliminär</span>' : '<span class="tag bekraftat">uppmätt</span>'}
        <button class="btn small quiet" data-action="del-size" data-id="${esc(s.id)}" aria-label="Ta bort">✕</button>
      </div>`).join('') : '<p class="faint">Ingen storlek registrerad.</p>'}
    </section>`;
  }

  function needRow(state, need) {
    const remaining = M.needRemaining(need);
    const progress = need.qty > 1 ? `${need.doneQty} av ${need.qty} klara` : '';
    return `<div class="row">
      <button class="tick${need.status === 'bekraftat' ? ' done' : ''}" data-action="need-step" data-id="${esc(need.id)}"
        aria-label="Bekräfta en ${esc(need.title)}">${need.status === 'bekraftat' ? '✓' : ''}</button>
      <div class="grow">
        <div class="title${need.status === 'bekraftat' ? ' strike' : ''}">${esc(need.title)}</div>
        <div class="sub">${esc([progress, need.note].filter(Boolean).join(' · ')) || (
          need.status === 'planerat' ? 'Inplanerat, ännu inte köpt' : remaining ? `${remaining} kvar att ordna` : '')}</div>
      </div>
      <button class="btn small quiet" data-action="need-menu" data-id="${esc(need.id)}">⋯</button>
    </div>
    ${ui.expanded === need.id ? `<div class="btnrow" style="padding:4px 0 12px">
      <button class="btn small" data-action="need-status" data-id="${esc(need.id)}" data-value="behover">Behöver ordnas</button>
      <button class="btn small" data-action="need-status" data-id="${esc(need.id)}" data-value="planerat">Planerat</button>
      <button class="btn small" data-action="need-status" data-id="${esc(need.id)}" data-value="bekraftat">Bekräftat klart</button>
      <button class="btn small danger" data-action="need-remove" data-id="${esc(need.id)}">Ta bort</button>
    </div>` : ''}`;
  }

  /* ─────────────────── KAN VÄNTA ─────────────────── */

  function renderVantar(state) {
    const today = U.dateKey(ui.now);
    const plan = P.planDay(state, ui.now);
    const inPlan = new Set(plan.priorities.map((p) => p.taskId));
    const waiting = M.openTasks(state).filter((t) => !inPlan.has(t.id));
    const withDeadline = waiting.filter((t) => t.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline));
    const rest = waiting.filter((t) => !t.deadline);
    const openNeeds = M.openNeeds(state).filter((n) => n.status === 'behover');

    return `<header class="top"><div class="grow">
      <h1>Kan vänta</h1><div class="eyebrow">Ingenting försvinner. Inget staplas på i morgon.</div></div></header>

      ${withDeadline.length ? `<section class="section">
        <div class="section-head"><h2>Har en tidsgräns</h2></div>
        <div class="card">${withDeadline.map((t) => waitRow(state, t, today)).join('')}</div>
      </section>` : ''}

      ${rest.length ? `<section class="section">
        <div class="section-head"><h2>När det passar</h2></div>
        <div class="card">${rest.map((t) => waitRow(state, t, today)).join('')}</div>
      </section>` : ''}

      ${openNeeds.length ? `<section class="section">
        <div class="section-head"><h2>Behov utan plan</h2><span class="hint">${openNeeds.length} st</span></div>
        <div class="card flat">${openNeeds.map((n) => `<div class="row"><div class="grow">
          <div class="title">${esc(n.title)}</div>
          <div class="sub">${esc(M.childName(state, n.childId))}</div></div></div>`).join('')}
        <button class="btn wide" style="margin-top:12px" data-action="plan-needs">Planera in ett inköp</button>
        </div>
      </section>` : ''}

      ${!waiting.length && !openNeeds.length ? `<div class="empty"><div class="big">✓</div>
        <p>Inget väntar just nu.</p></div>` : ''}`;
  }

  function waitRow(state, task, today) {
    const late = task.deadline && task.deadline < today;
    return `<div class="row">
      <button class="tick" data-action="task-done" data-id="${esc(task.id)}" aria-label="Markera klar"></button>
      <div class="grow"><div class="title">${esc(task.title)}</div>
        <div class="sub">${task.deadline ? `${late ? 'Passerad: ' : 'Senast '}${esc(U.relativeDay(task.deadline, today))} · ` : ''}${esc(U.duration(task.minutes))}</div></div>
      <button class="btn small quiet" data-action="task-today" data-id="${esc(task.id)}">I dag</button>
    </div>`;
  }

  /* ─────────────────── KVÄLL OCH MORGON ─────────────────── */

  function renderKvall(state) {
    const e = MV.evening.eveningPlan(state, ui.now);
    return `<header class="top"><div class="grow">
      <div class="eyebrow">Inför ${esc(U.relativeDay(e.tomorrow, e.date))}</div>
      <h1>Kväll och morgon</h1></div></header>

      <section class="now">
        <div class="label">Läget</div>
        <h2>${esc(e.headline)}</h2>
        ${e.bedtimeHint ? `<p class="detail">${esc(e.bedtimeHint)}</p>` : ''}
      </section>

      ${e.notes.map((n) => `<div class="note"><div class="grow"><div>${esc(n.text)}</div>
        <div class="btnrow">${n.field === 'work'
          ? `<button class="btn small" data-action="set-work-date" data-date="${esc(n.date)}" data-value="ja">Jag arbetar</button>
             <button class="btn small" data-action="set-work-date" data-date="${esc(n.date)}" data-value="nej">Ledig</button>`
          : `<button class="btn small" data-action="set-children-date" data-date="${esc(n.date)}" data-value="ja">De är här</button>
             <button class="btn small" data-action="set-children-date" data-date="${esc(n.date)}" data-value="nej">Inte då</button>`}
        </div></div></div>`).join('')}

      ${e.items.length ? `<section class="section">
        <div class="section-head"><h2>Att förbereda</h2></div>
        <div class="card">${e.items.map((i) => `<div class="row">
          <button class="tick${i.done ? ' done' : ''}" data-action="prep" data-key="${esc(i.key)}" data-done="${i.done ? '1' : '0'}"
            aria-label="${esc(i.label)}">${i.done ? '✓' : ''}</button>
          <div class="grow"><div class="title${i.done ? ' strike' : ''}">${esc(i.label)}</div>
          <div class="sub">${esc(i.why)}</div></div>
        </div>`).join('')}</div>
      </section>` : ''}

      ${e.tomorrowFixed.length ? `<section class="section">
        <div class="section-head"><h2>Fast i morgon</h2></div>
        <div class="card flat">${e.tomorrowFixed.map((f) => `<div class="row">
          <span class="time">${esc(f.at)}</span><div class="grow"><div class="title">${esc(f.title)}</div></div>
        </div>`).join('')}</div>
      </section>` : ''}

      <div class="card flat"><p class="faint">Appen skickar inga påminnelser och ändrar inget i din kalender.</p></div>`;
  }

  /* ─────────────────── INSTÄLLNINGAR ─────────────────── */

  function renderSettings(state) {
    const s = state.settings;
    const dayNames = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
    const order = [1, 2, 3, 4, 5, 6, 0];

    return `<header class="top"><div class="grow"><h1>Inställningar</h1></div>
      <button class="btn small" data-action="close-settings">Klar</button></header>

      <section class="card">
        <h2>Barn</h2>
        ${state.children.map((c) => `<div class="row">
          <div class="grow"><div class="title">${esc(c.name)}</div></div>
          <button class="btn small quiet danger" data-action="del-child" data-id="${esc(c.id)}">Ta bort</button>
        </div>`).join('')}
        <div class="btnrow" style="margin-top:12px">
          <button class="btn wide" data-action="add-child">Lägg till barn</button>
        </div>
      </section>

      <section class="card">
        <h2>Vanlig vecka</h2>
        <p class="faint" style="margin:6px 0 14px">Okänt är helt i sin ordning. Enstaka dagar ändrar du direkt på Min dag.</p>
        ${order.map((d) => {
          const t = state.weekTemplate[String(d)] || { work: 'okand', children: 'okand' };
          return `<div style="margin-bottom:14px">
            <div class="sub" style="margin-bottom:6px;font-weight:600">${esc(dayNames[d])}</div>
            <div class="grid2">
              <div class="seg" role="group" aria-label="Arbete ${esc(dayNames[d])}">
                ${['ja', 'nej', 'okand'].map((v) => `<button class="${t.work === v ? 'on' : ''}"
                  data-action="tpl" data-day="${d}" data-key="work" data-value="${v}">${
                  v === 'ja' ? 'Jobb' : v === 'nej' ? 'Ledig' : '?'}</button>`).join('')}
              </div>
              <div class="seg" role="group" aria-label="Barn ${esc(dayNames[d])}">
                ${['ja', 'nej', 'okand'].map((v) => `<button class="${t.children === v ? 'on' : ''}"
                  data-action="tpl" data-day="${d}" data-key="children" data-value="${v}">${
                  v === 'ja' ? 'Barn' : v === 'nej' ? 'Nej' : '?'}</button>`).join('')}
              </div>
            </div>
          </div>`;
        }).join('')}
      </section>

      <section class="card">
        <h2>Tider</h2>
        <div class="grid2">
          ${timeField('Går upp', 'wakeTime', s.wakeTime)}
          ${timeField('Läggdags', 'bedtime', s.bedtime)}
          ${timeField('Arbete börjar', 'workStart', s.workStart)}
          ${timeField('Arbete slutar', 'workEnd', s.workEnd)}
          ${timeField('Lämning', 'dropOffTime', s.dropOffTime)}
          ${timeField('Hämtning', 'pickUpTime', s.pickUpTime)}
        </div>
        <p class="faint">Lämning och hämtning används bara de dagar du bekräftat att barnen är hos dig.
        Lämnas hämtningstiden tom skapas ingen hämtning.</p>
      </section>

      <section class="card">
        <h2>Egen tid</h2>
        <p class="faint" style="margin:6px 0 12px">Det du vill ha plats för. Appen föreslår bara sådant du själv lagt in här.</p>
        ${(s.ownTime || []).map((o, i) => `<div class="row">
          <div class="grow"><div class="title">${esc(o.label)}</div><div class="sub">${esc(U.duration(o.minutes || 60))}</div></div>
          <button class="btn small quiet danger" data-action="del-own" data-index="${i}">Ta bort</button>
        </div>`).join('')}
        <div class="btnrow" style="margin-top:12px">
          <button class="btn" data-action="add-own">Lägg till</button>
        </div>
      </section>

      <section class="card">
        <h2>AI och kalender</h2>
        <div class="row" style="padding-top:0">
          <div class="grow"><div class="title">AI-tolkning</div>
          <div class="sub">${esc(ui.aiStatus.checked
            ? (ui.aiStatus.available ? 'Ansluten. Din text och dagens uppgifter skickas till Claude för tolkning.'
              : 'Ingen AI-anslutning i den här vyn. Texten tolkas med enkla regler.')
            : 'Kontrollerar …')}</div></div>
          <button class="btn small" data-action="toggle-ai">${s.aiOptIn === false ? 'Av' : 'På'}</button>
        </div>
        <div class="row">
          <div class="grow"><div class="title">Google Kalender</div>
          <div class="sub">Inte ansluten. Ingen verifierad koppling finns i den här versionen.
          När den byggs blir den endast läsning och kräver ditt godkännande.</div></div>
        </div>
        <p class="faint">Appen skickar inga meddelanden, skapar inga påminnelser och ändrar ingenting i någon kalender.</p>
      </section>

      <section class="card">
        <h2>Dina uppgifter</h2>
        <p class="faint" style="margin:6px 0 12px">Lagring: ${esc(S.statusText())}.
        ${S.mode === 'moln' ? 'Bara du kommer åt sidans data.' : 'Uppgifterna ligger kvar i den här webbläsaren.'}</p>
        <div class="btnrow">
          <button class="btn" data-action="export">Kopiera mina data</button>
          <button class="btn danger" data-action="erase">Radera allt</button>
        </div>
      </section>`;
  }

  function timeField(label, key, value) {
    return `<div class="field"><label for="f_${key}">${esc(label)}</label>
      <input id="f_${key}" type="time" value="${esc(value || '')}" data-action="time" data-key="${esc(key)}"></div>`;
  }

  /* ─────────────────── rendering ─────────────────── */

  function render() {
    const state = S.state;
    if (!state) return;
    ui.now = new Date();
    let html;
    if (ui.settingsOpen) html = renderSettings(state);
    else if (ui.view === 'dag') html = renderDag(state);
    else if (ui.view === 'berat') html = renderBerat(state);
    else if (ui.view === 'barn') html = renderBarn(state);
    else if (ui.view === 'vantar') html = renderVantar(state);
    else html = renderKvall(state);

    app.innerHTML = html;
    navEl.innerHTML = VIEWS.map((v) => `<button class="${!ui.settingsOpen && ui.view === v.id ? 'on' : ''}"
      data-action="nav" data-view="${v.id}" aria-current="${!ui.settingsOpen && ui.view === v.id}">
      <span class="ic" aria-hidden="true">${v.icon}</span><span>${esc(v.label)}</span></button>`).join('');

    const tell = document.getElementById('tell');
    if (tell) {
      tell.value = ui.draft;
      tell.addEventListener('input', (e) => { ui.draft = e.target.value; });
    }
  }

  /* ─────────────────── handlingar ─────────────────── */

  function commit(ops, message) {
    const result = S.commit(ops, new Date());
    if (result.applied.length) toast(message || result.applied[0], true);
    else if (result.skipped.length) toast('Ingenting att ändra — det kan redan vara gjort.');
    return result;
  }

  async function runInterpret() {
    const text = (ui.draft || '').trim();
    if (!text) { toast('Skriv något först.'); return; }
    ui.busy = true; render();
    let result;
    try {
      result = await MV.ai.interpret(S.state, text, new Date());
    } catch (error) {
      result = MV.language.interpret(S.state, text, new Date());
      result.mode = 'regler';
    }
    ui.aiStatus = MV.ai.status();
    result.picks = {};
    if (result.query) result.answerText = answerFor(result.query);
    ui.proposal = result;
    ui.busy = false;
    render();
  }

  /** Svar på rena frågor — kort och konkret, utan att ändra något. */
  function answerFor(kind) {
    const state = S.state;
    if (kind === 'forberedelse') {
      const e = MV.evening.eveningPlan(state, new Date());
      const left = e.items.filter((i) => !i.done);
      return esc(left.length ? `${e.headline} ${left.map((i) => i.label).join('. ')}.` : e.headline)
        + ' <button class="btn small quiet" data-action="nav" data-view="kvall">Öppna Kväll</button>';
    }
    if (kind === 'nu') {
      const plan = P.planDay(state, new Date());
      return esc(`${plan.nowCard.title}. ${plan.nowCard.detail || ''}`)
        + ' <button class="btn small quiet" data-action="nav" data-view="dag">Öppna Min dag</button>';
    }
    if (kind === 'behov') {
      const open = M.openNeeds(state);
      if (!open.length) return 'Inga öppna behov just nu.';
      return esc(open.slice(0, 8).map((n) => `${M.childName(state, n.childId)}: ${n.title}`).join('. ') + '.');
    }
    return '';
  }

  function cycle(list, current) {
    const i = list.indexOf(current);
    return list[(i + 1) % list.length];
  }

  const ACTIONS = {
    nav(el) { ui.settingsOpen = false; ui.view = el.dataset.view; ui.expanded = null; ui.moveFor = null; window.scrollTo(0, 0); },
    'open-settings'() { ui.settingsOpen = true; window.scrollTo(0, 0); },
    'close-settings'() { ui.settingsOpen = false; window.scrollTo(0, 0); },
    replan() { ui.now = new Date(); ui.expanded = null; toast(`Planerat om från ${U.toClock(U.minutesOfDay(ui.now))}.`); },
    'toggle-moved'() { ui.showMoved = !ui.showMoved; },
    expand(el) { ui.expanded = ui.expanded === el.dataset.id ? null : el.dataset.id; ui.moveFor = null; },
    'need-menu'(el) { ui.expanded = ui.expanded === el.dataset.id ? null : el.dataset.id; },

    'cycle-energy'() {
      const date = U.dateKey(new Date());
      const next = cycle(['okand', 'god', 'ok', 'lag'], M.energyFor(S.state, date));
      commit([{ op: 'day.energy', date, energy: next }]);
    },
    'cycle-work'() {
      const date = U.dateKey(new Date());
      const next = cycle(['okand', 'ja', 'nej'], M.workdayFor(S.state, date));
      commit([{ op: 'day.work', date, value: next }]);
    },
    'set-work'(el) {
      commit([{ op: 'day.work', date: U.dateKey(new Date()), value: el.dataset.value }]);
    },
    'set-work-date'(el) {
      commit([{ op: 'day.work', date: el.dataset.date, value: el.dataset.value }]);
    },
    'set-all-children'(el) {
      const date = U.dateKey(new Date());
      commit(S.state.children.map((c) => ({ op: 'day.children', date, childId: c.id, value: el.dataset.value })),
        el.dataset.value === 'ja' ? 'Barnen är hos dig i dag.' : 'Inga barn hos dig i dag.');
    },
    'set-children-date'(el) {
      commit(S.state.children.map((c) => ({ op: 'day.children', date: el.dataset.date, childId: c.id, value: el.dataset.value })));
    },
    'go-presence'() {
      const date = U.dateKey(new Date());
      const state = S.state;
      const ops = state.children.map((c) => {
        const next = cycle(['okand', 'ja', 'nej'], M.childPresence(state, date, c.id));
        return { op: 'day.children', date, childId: c.id, value: next };
      });
      // Ett tryck växlar allihop; per barn ändras enklast på Barn-sidan.
      commit(ops);
    },

    'task-done'(el) { commit([{ op: 'task.done', taskId: el.dataset.id }]); ui.expanded = null; },
    'task-less'(el) {
      const task = S.state.tasks.find((t) => t.id === el.dataset.id);
      if (task) commit([{ op: 'task.reduce', taskId: task.id, minutes: Math.max(10, Math.round(task.minutes / 2)) }]);
    },
    'task-move'(el) { ui.moveFor = ui.moveFor === el.dataset.id ? null : el.dataset.id; },
    'move-cancel'() { ui.moveFor = null; },
    'move-to'(el) { commit([{ op: 'task.move', taskId: el.dataset.id, to: el.dataset.to }]); ui.moveFor = null; ui.expanded = null; },
    'task-today'(el) {
      S.update((next) => {
        const task = next.tasks.find((t) => t.id === el.dataset.id);
        if (task) { task.status = 'oppen'; task.scheduledDate = U.dateKey(new Date()); }
        const day = next.days[U.dateKey(new Date())];
        if (day) day.skipped = (day.skipped || []).filter((id) => id !== el.dataset.id);
      });
      toast('Flyttad till i dag.', true);
      ui.view = 'dag';
    },
    'task-reopen'(el) {
      S.update((next) => {
        const task = next.tasks.find((t) => t.id === el.dataset.id);
        if (task) { task.status = 'oppen'; task.doneAt = ''; }
      });
      toast('Återöppnad.', true);
    },

    'need-step'(el) {
      const need = S.state.needs.find((n) => n.id === el.dataset.id);
      if (!need) return;
      if (need.status === 'bekraftat') commit([{ op: 'need.status', needId: need.id, status: 'behover' }]);
      else commit([{ op: 'need.done', needId: need.id, qty: 1 }]);
    },
    'need-status'(el) { commit([{ op: 'need.status', needId: el.dataset.id, status: el.dataset.value }]); ui.expanded = null; },
    'need-remove'(el) {
      const need = S.state.needs.find((n) => n.id === el.dataset.id);
      if (need && confirm(`Ta bort "${need.title}"?`)) { commit([{ op: 'need.remove', needId: need.id }]); ui.expanded = null; }
    },
    'add-need'(el) {
      const title = prompt('Vad behövs? Till exempel "2 par byxor"');
      if (!title) return;
      const qty = Number(prompt('Hur många?', '1')) || 1;
      commit([{ op: 'need.add', childId: el.dataset.child, title: title.trim(), qty }]);
    },
    'plan-needs'() {
      const needs = M.openNeeds(S.state).filter((n) => n.status === 'behover');
      if (!needs.length) return;
      commit([{
        op: 'task.addForNeeds', needIds: needs.map((n) => n.id),
        minutes: 60, context: 'butik', earliest: S.state.settings.workEnd || '',
      }], 'Inköp inplanerat. Det räknas inte som köpt.');
      ui.view = 'dag';
    },

    'add-size'(el) {
      const kind = confirm('Är detta ett uppmätt kroppsmått?\n\nOK = kroppsmått, Avbryt = storlek på ett märkes plagg') ? 'kropp' : 'marke';
      const value = prompt(kind === 'kropp' ? 'Kroppsmått, t.ex. "108 cm"' : 'Storlek, t.ex. "110"');
      if (!value) return;
      const brand = kind === 'marke' ? (prompt('Vilket märke eller butik?', '') || '') : '';
      commit([{
        op: 'size.set', childId: el.dataset.child, kind, brand,
        label: kind === 'kropp' ? 'Kroppslängd' : 'Storlek', value: value.trim(),
        preliminary: kind === 'marke',
      }]);
    },
    'del-size'(el) {
      S.update((next) => { next.sizes = next.sizes.filter((s) => s.id !== el.dataset.id); });
      toast('Storlek borttagen.', true);
    },

    prep(el) {
      const date = U.dateKey(new Date());
      commit([{ op: el.dataset.done === '1' ? 'prep.undone' : 'prep.done', date, key: el.dataset.key }]);
    },

    example(el) { ui.draft = el.dataset.text; ui.view = 'berat'; ui.settingsOpen = false; },
    interpret() { runInterpret(); return true; },
    'clear-proposal'() { ui.proposal = null; ui.draft = ''; },
    pick(el) {
      if (!ui.proposal) return;
      ui.proposal.picks = Object.assign({}, ui.proposal.picks, { [el.dataset.q]: el.dataset.o });
    },
    accept() {
      const p = ui.proposal;
      if (!p) return;
      const ops = [...p.ops];
      for (const q of p.questions) {
        const choice = (p.picks || {})[q.id];
        if (!choice || choice === '__skip__') continue;
        const option = q.options.find((o) => o.id === choice);
        if (option) ops.push(...option.ops);
      }
      if (!ops.length) { toast('Inget valt.'); return; }
      const result = commit(ops, `${ops.length} ${ops.length === 1 ? 'ändring' : 'ändringar'} gjorda.`);
      if (result.applied.length) { ui.proposal = null; ui.draft = ''; ui.view = 'dag'; }
    },

    undo() { if (S.undo()) toast('Ångrat.'); },
    'dismiss-toast'() { toastEl.innerHTML = ''; },

    /* inställningar */
    'add-child'() {
      const name = prompt('Barnets namn');
      if (!name || !name.trim()) return;
      S.update((next) => { next.children.push(M.newChild(name)); });
      toast(`${name.trim()} tillagd.`, true);
    },
    'del-child'(el) {
      const child = M.childById(S.state, el.dataset.id);
      if (!child) return;
      if (!confirm(`Ta bort ${child.name}? Behov och storlekar för ${child.name} tas också bort.`)) return;
      S.update((next) => {
        next.children = next.children.filter((c) => c.id !== child.id);
        next.needs = next.needs.filter((n) => n.childId !== child.id);
        next.sizes = next.sizes.filter((s) => s.childId !== child.id);
      });
      toast('Borttaget.', true);
    },
    tpl(el) {
      S.update((next) => {
        const day = next.weekTemplate[el.dataset.day] || { work: 'okand', children: 'okand' };
        day[el.dataset.key] = el.dataset.value;
        next.weekTemplate[el.dataset.day] = day;
      });
    },
    'add-own'() {
      const label = prompt('Vad vill du ha plats för? Till exempel "Styrketräning" eller "Gitarr"');
      if (!label || !label.trim()) return;
      const minutes = Number(prompt('Ungefär hur många minuter?', '60')) || 60;
      S.update((next) => { next.settings.ownTime.push({ id: U.makeId('egen'), label: label.trim(), minutes }); });
      toast('Tillagt.', true);
    },
    'del-own'(el) {
      S.update((next) => { next.settings.ownTime.splice(Number(el.dataset.index), 1); });
      toast('Borttaget.', true);
    },
    'toggle-ai'() {
      S.update((next) => { next.settings.aiOptIn = next.settings.aiOptIn === false; });
    },
    export() {
      const text = S.exportJson();
      navigator.clipboard?.writeText(text)
        .then(() => toast('Kopierat till urklipp.'))
        .catch(() => toast('Kunde inte kopiera automatiskt.'));
    },
    async erase() {
      if (!confirm('Radera allt? Barn, behov, uppgifter och storlekar tas bort permanent. Detta går inte att ångra.')) return;
      if (!confirm('Är du helt säker? Uppgifterna går inte att få tillbaka.')) return;
      await S.eraseAll();
      ui.settingsOpen = false;
      toast('Allt raderat.');
    },
  };

  document.addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]');
    if (!el) return;
    const fn = ACTIONS[el.dataset.action];
    if (!fn) return;
    event.preventDefault();
    const skipRender = fn(el);
    if (!skipRender) render();
  });

  document.addEventListener('change', (event) => {
    const el = event.target.closest('[data-action="time"]');
    if (!el) return;
    S.update((next) => { next.settings[el.dataset.key] = el.value; });
  });

  /* ─────────────────── start ─────────────────── */

  S.onChange(render);
  render();

  S.init().then(() => {
    render();
    return MV.ai.probe();
  }).then(() => {
    ui.aiStatus = MV.ai.status();
    render();
  }).catch((error) => {
    console.error('Start misslyckades', error);
    ui.aiStatus = MV.ai.status();
    render();
  });

  // Planen utgår från klockan: uppdatera stillsamt medan appen är öppen.
  setInterval(() => { if (!ui.proposal && !ui.settingsOpen) render(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
})(typeof globalThis !== 'undefined' ? globalThis : this);
