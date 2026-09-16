/* Min vardag — gränssnitt.
 * Mobilen först: stora tryckytor, få val per skärm, en tydlig nästa handling. */
(function (root) {
  const MV = root.MinVardag;
  const U = MV.util, M = MV.model, P = MV.planner, S = MV.store;
  const R = MV.recurring, Rt = MV.routines, icon = MV.icon;

  const app = document.getElementById('app');
  const navEl = document.getElementById('nav');
  const toastEl = document.getElementById('toast');
  const sheetEl = document.getElementById('sheet');

  const VIEWS = [
    { id: 'dag', label: 'Min dag', icon: 'dag' },
    { id: 'vecka', label: 'Vecka', icon: 'vecka' },
    { id: 'berat', label: 'Berätta', icon: 'berat' },
    { id: 'barn', label: 'Barn', icon: 'barn' },
    { id: 'kvall', label: 'Kväll', icon: 'kvall' },
  ];
  const DAY_SHORT = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];

  const ui = {
    view: 'dag',
    now: new Date(),
    draft: '',
    proposal: null,
    busy: false,
    expanded: null,
    moveFor: null,
    showMoved: false,
    openRoutine: null,
    sheet: null,          // { kind, data, values }
    aiStatus: { available: false, checked: false },
  };

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function toast(message, undoable) {
    toastEl.innerHTML = `<div class="toast"><span class="grow">${esc(message)}</span>${
      undoable ? '<button data-action="undo">Ångra</button>' : ''
    }<button data-action="dismiss-toast" aria-label="Stäng">${icon('kryss', 16)}</button></div>`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toastEl.innerHTML = ''; }, undoable ? 9000 : 4200);
  }

  /* ═══════════ dagsband ═══════════ */

  function ribbon(state, plan) {
    const dayStart = U.toMinutes(state.settings.wakeTime) ?? 300;
    const dayEnd = Math.max(dayStart + 60, U.toMinutes(state.settings.bedtime) ?? 1290);
    const span = dayEnd - dayStart;
    const pct = (m) => Math.max(0, Math.min(100, ((m - dayStart) / span) * 100));

    const blocks = plan.fixed.filter((f) => f.id !== 'morgon').map((f) => {
      const left = pct(f.start), width = Math.max(1.5, pct(f.end) - left);
      const own = f.kind === 'egen';
      // Smala block får ingen text — en avhuggen bokstav säger ingenting.
      const label = width >= 13 ? `<span>${esc(f.title)}</span>` : '';
      return `<div class="ribbon-block${own ? ' egen' : ''}" style="left:${left}%;width:${width}%"
        title="${esc(f.title)}">${label}</div>`;
    }).join('');

    const nowPct = pct(plan.nowMinutes);
    const inDay = plan.nowMinutes >= dayStart && plan.nowMinutes <= dayEnd;

    return `<div class="ribbon">
      <div class="ribbon-track" role="img" aria-label="Dagens fasta åtaganden från ${esc(state.settings.wakeTime)} till ${esc(state.settings.bedtime)}">
        ${blocks}
        <div class="ribbon-past" style="width:${nowPct}%"></div>
        ${inDay ? `<div class="ribbon-now" style="left:${nowPct}%"></div>` : ''}
      </div>
      <div class="ribbon-scale"><span>${esc(state.settings.wakeTime)}</span>
        <span>${esc(U.toClock(dayStart + span / 2))}</span>
        <span>${esc(state.settings.bedtime)}</span></div>
    </div>`;
  }

  /* ═══════════ MIN DAG ═══════════ */

  function renderDag(state) {
    const plan = P.planDay(state, ui.now);
    if (!state.children.length) return renderWelcome(state, plan);

    const presence = plan.presence;
    const presenceText = presence.present.length
      ? `${presence.present.map((c) => c.name).join(', ')} hos dig`
      : presence.unknown.length === state.children.length ? 'Barnens dag okänd' : 'Inga barn i dag';
    const energyLabel = (M.ENERGY[plan.energy] || {}).label || 'Okänd';
    const morning = Rt.summary(state, plan.dateKey, 'morgon');
    const waiting = M.openTasks(state).filter((t) => !plan.priorities.some((p) => p.taskId === t.id));

    return `
    <header class="top">
      <div class="grow">
        <div class="eyebrow"><span>${esc(U.longDate(plan.dateKey))}</span>
          <span class="now mono">${esc(plan.nowClock)}</span></div>
        <h1>Min dag</h1>
      </div>
      <button class="btn small ghost" data-action="replan">Planera om</button>
    </header>

    ${ribbon(state, plan)}

    <div class="chiprow">
      <button class="chip${plan.energy !== 'okand' ? ' on' : ''}" data-action="sheet" data-kind="ork">Ork: ${esc(energyLabel)}</button>
      <button class="chip${plan.workday === 'ja' ? ' on' : plan.workday === 'okand' ? ' ask' : ''}" data-action="cycle-work">${
        plan.workday === 'ja' ? 'Arbetsdag' : plan.workday === 'nej' ? 'Ledig' : 'Arbete okänt'}</button>
      <button class="chip${presence.present.length ? ' on' : presence.unknown.length ? ' ask' : ''}"
        data-action="sheet" data-kind="narvaro" data-date="${esc(plan.dateKey)}">${esc(presenceText)}</button>
    </div>

    ${nextCard(plan)}
    ${askCards(state, plan)}
    ${morning && !morning.complete && plan.nowMinutes < 720 ? routineBlock(state, morning, plan.dateKey) : ''}
    ${priorities(state, plan)}
    ${fixedToday(plan)}
    ${later(plan)}
    ${movedOut(plan)}

    ${waiting.length ? `<section class="section">
      <button class="daycard" data-action="go" data-view="vantar" style="align-items:center">
        <span class="date" style="width:34px;color:var(--muted)">${icon('vanta', 22)}</span>
        <span class="body"><span class="title" style="font-weight:500">Kan vänta</span>
        <span class="sub" style="display:block">${waiting.length} ${waiting.length === 1 ? 'sak' : 'saker'} som inte behöver göras i dag</span></span>
        <span style="color:var(--faint)">${icon('pil', 18)}</span>
      </button>
    </section>` : ''}

    <div class="chiprow" style="margin-top:22px">${statusChips(state)}</div>`;
  }

  function nextCard(plan) {
    const c = plan.nowCard;
    const kicker = {
      pagaende: 'Pågår nu', snart: 'Strax', uppgift: 'Gör det här nu',
      egen: 'Din tid', fritt: 'Just nu', kvall: 'Kvällen',
    }[c.type] || 'Gör det här nu';
    const calm = c.type === 'egen' || c.type === 'fritt' || c.type === 'kvall';

    return `<section class="next${calm ? ' calm' : ''}" aria-label="${esc(kicker)}">
      <div class="kicker">${esc(kicker)}</div>
      <h2>${esc(c.title)}</h2>
      ${c.detail ? `<p class="detail">${esc(c.detail)}</p>` : ''}
      ${c.taskId ? `<div class="btnrow">
        <button class="btn signal" data-action="task-done" data-id="${esc(c.taskId)}">Klar</button>
        <button class="btn ghost" data-action="task-less" data-id="${esc(c.taskId)}">Gör mindre</button>
        <button class="btn ghost" data-action="sheet" data-kind="flytta" data-id="${esc(c.taskId)}">Flytta</button>
      </div>` : ''}
    </section>`;
  }

  function askCards(state, plan) {
    return plan.notes.map((n) => {
      if (n.field === 'work') {
        return `<div class="ask-card"><div class="q">${esc(n.text)}</div><div class="btnrow">
          <button class="btn small" data-action="set-work" data-value="ja">Jag arbetar</button>
          <button class="btn small" data-action="set-work" data-value="nej">Jag är ledig</button></div></div>`;
      }
      if (n.field === 'children') {
        return `<div class="ask-card"><div class="q">${esc(n.text)}</div><div class="btnrow">
          <button class="btn small" data-action="set-all-children" data-value="ja">De är här</button>
          <button class="btn small" data-action="set-all-children" data-value="nej">Inte i dag</button>
          <button class="btn small quiet" data-action="sheet" data-kind="narvaro" data-date="${esc(plan.dateKey)}">Per barn</button>
        </div></div>`;
      }
      if (n.field === 'pickUp') {
        return `<div class="ask-card"><div class="q">${esc(n.text)}</div><div class="btnrow">
          <button class="btn small" data-action="sheet" data-kind="tider">Ange hämtningstid</button></div></div>`;
      }
      return `<div class="note">${esc(n.text)}</div>`;
    }).join('');
  }

  function priorities(state, plan) {
    if (!plan.priorities.length) {
      return `<section class="section">
        <div class="section-head"><h2>Dagens prioriteringar</h2></div>
        <div class="panel sunk"><div class="row"><p class="muted">${
          plan.energy === 'lag' ? 'Låg ork i dag. Bara det nödvändiga är inplanerat.'
            : M.openTasks(state).length ? 'Inget behöver pressas in i dag.'
              : 'Inget planerat. Berätta vad som behöver göras.'
        }</p></div></div></section>`;
    }
    return `<section class="section">
      <div class="section-head"><h2>Dagens prioriteringar</h2>
        <span class="hint">${plan.priorities.length}/3</span></div>
      <div class="panel">${plan.priorities.map((p) => priorityRow(state, p)).join('')}</div>
    </section>`;
  }

  function priorityRow(state, p) {
    const child = p.childId ? M.childName(state, p.childId) : '';
    const open = ui.expanded === p.taskId;
    const bits = [U.duration(p.minutes), child, p.why].filter(Boolean);
    return `<div class="row">
      <span class="at">${esc(U.toClock(p.start))}</span>
      <button class="tick" data-action="task-done" data-id="${esc(p.taskId)}"
        aria-label="Markera ${esc(p.title)} som klar"></button>
      <div class="grow"><div class="title">${esc(p.title)}</div>
        <div class="sub">${esc(bits.join(' · '))}</div></div>
      <button class="btn tiny quiet" data-action="expand" data-id="${esc(p.taskId)}"
        aria-label="Fler val för ${esc(p.title)}">${open ? icon('kryss', 16) : '···'}</button>
    </div>
    ${open ? `<div class="row" style="padding-top:0;border:none">
      <span class="at"></span>
      <div class="btnrow grow">
        <button class="btn small ghost" data-action="task-less" data-id="${esc(p.taskId)}">Gör mindre</button>
        <button class="btn small ghost" data-action="sheet" data-kind="flytta" data-id="${esc(p.taskId)}">Flytta</button>
      </div></div>` : ''}`;
  }

  function fixedToday(plan) {
    const rest = plan.fixed.filter((f) => f.end > plan.nowMinutes);
    if (!rest.length) return '';
    return `<section class="section">
      <div class="section-head"><h2>Fast i dag</h2></div>
      <div class="panel">${rest.map((f) => `<div class="row fixed">
        <span class="at">${esc(U.toClock(f.start))}</span>
        <div class="grow"><div class="title">${esc(f.title)}</div>
          <div class="sub">till ${esc(U.toClock(f.end))}</div></div>
      </div>`).join('')}</div>
    </section>`;
  }

  function later(plan) {
    const today = plan.later.filter((i) => i.type !== 'fast');
    if (!today.length && !plan.upcoming.length && !plan.reserved) return '';
    return `<section class="section">
      <div class="section-head"><h2>Senare</h2><span class="hint">översikt</span></div>
      <div class="panel sunk">
        ${plan.reserved ? `<div class="row"><span class="at">${esc(U.toClock(plan.reserved.start))}</span>
          <div class="grow"><div class="title">${esc(plan.reserved.title)}</div>
          <div class="sub">${esc(plan.reserved.detail)}</div></div></div>` : ''}
        ${today.map((i) => `<div class="row"><span class="at">${esc(i.at)}</span>
          <div class="grow"><div class="title">${esc(i.title)}</div></div></div>`).join('')}
        ${plan.upcoming.map((i) => `<div class="row">
          <span class="at" style="color:var(--faint)">${icon('vanta', 17)}</span>
          <div class="grow"><div class="title">${esc(i.title)}</div>
          <div class="sub">Tidsgräns ${esc(i.at)}</div></div></div>`).join('')}
      </div></section>`;
  }

  function movedOut(plan) {
    if (!plan.moved.length) return '';
    return `<section class="section">
      <button class="btn wide quiet" data-action="toggle-moved">${
        ui.showMoved ? 'Dölj' : `Visa vad som inte ryms i dag (${plan.moved.length})`}</button>
      ${ui.showMoved ? `<div class="panel sunk" style="margin-top:8px">${plan.moved.map((m) => `
        <div class="row"><div class="grow"><div class="title">${esc(m.title)}</div>
        <div class="sub">${esc(m.reason)}</div></div></div>`).join('')}
        <div class="row"><p class="faint">Inget är borttaget. Det ligger kvar under Kan vänta.</p></div>
      </div>` : ''}</section>`;
  }

  function statusChips(state) {
    const mode = S.mode;
    const label = mode === 'moln' ? 'Sparat skyddat' : mode === 'lokalt' ? 'Sparat i webbläsaren' : 'Sparas inte';
    const aiLabel = !ui.aiStatus.checked ? 'AI: kontrollerar'
      : ui.aiStatus.available ? 'AI ansluten' : 'Ingen AI — regeltolkning';
    return `<span class="chip${mode === 'moln' ? ' on' : mode === 'minne' ? ' ask' : ''}"><span class="dot"></span>${esc(label)}</span>
      <span class="chip${ui.aiStatus.available ? ' on' : ''}">${esc(aiLabel)}</span>
      <button class="chip" data-action="go" data-view="installningar">${icon('kugg', 14)} Inställningar</button>`;
  }

  function renderWelcome(state, plan) {
    return `<header class="top"><div class="grow">
      <div class="eyebrow">${esc(U.longDate(plan.dateKey))}</div><h1>Min vardag</h1></div></header>
      <section class="next calm"><div class="kicker">Kom igång</div>
      <h2>Lägg till dina barn</h2>
      <p class="detail">Jag antar ingenting om vilka dagar de är hos dig — du anger det själv och kan ändra när som helst.</p>
      <div class="btnrow"><button class="btn primary" data-action="sheet" data-kind="barn">Lägg till barn</button></div>
      </section>
      <div class="chiprow">${statusChips(state)}</div>`;
  }

  /* ═══════════ rutiner ═══════════ */

  function routineBlock(state, summary, dateKey) {
    return `<section class="section">
      <div class="section-head"><h2>${summary.when === 'morgon' ? 'Morgon' : 'Kväll'}</h2>
        <span class="hint">${esc(summary.label)}</span></div>
      ${summary.groups.map((g) => routineCard(g, dateKey)).join('')}
    </section>`;
  }

  function routineCard(group, dateKey) {
    const open = ui.openRoutine === group.routine.id;
    const done = group.total - group.remaining;
    const frac = group.total ? done / group.total : 0;
    const circ = 2 * Math.PI * 14;
    return `<div class="routine">
      <button class="routine-head" data-action="open-routine" data-id="${esc(group.routine.id)}"
        aria-expanded="${open}">
        <span class="meter">
          <svg width="34" height="34" viewBox="0 0 34 34">
            <circle cx="17" cy="17" r="14" fill="none" stroke="var(--line)" stroke-width="3"/>
            <circle cx="17" cy="17" r="14" fill="none" stroke="var(--deep)" stroke-width="3"
              stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - frac)}"/>
          </svg>
          <span class="val mono">${done}/${group.total}</span>
        </span>
        <span class="grow"><span class="title">${esc(group.routine.name)}</span>
          <span class="sub" style="display:block">${group.complete ? 'Klar' : `${group.remaining} kvar`}</span></span>
        <span style="color:var(--faint);transition:rotate .15s;rotate:${open ? '180deg' : '0deg'}">${icon('ner', 18)}</span>
      </button>
      ${open ? group.items.map((item) => `<div class="row">
        <span class="at"></span>
        <button class="tick${item.done ? ' done' : ''}" data-action="routine-item"
          data-routine="${esc(group.routine.id)}" data-item="${esc(item.id)}" data-done="${item.done ? '1' : '0'}"
          data-date="${esc(dateKey)}" aria-label="${esc(item.label)}"></button>
        <div class="grow"><div class="title${item.done ? ' strike' : ''}">${esc(item.label)}</div></div>
      </div>`).join('') : ''}
    </div>`;
  }

  /* ═══════════ VECKA ═══════════ */

  function renderVecka(state) {
    const week = R.weekOverview(state, ui.now, 7);
    const rec = state.recurring || [];
    return `<header class="top"><div class="grow">
      <div class="eyebrow">Sju dagar framåt</div><h1>Vecka</h1></div></header>

      <div class="stack">${week.map((d) => dayCard(state, d)).join('')}</div>

      <section class="section">
        <div class="section-head"><h2>Återkommande</h2>
          <button class="btn tiny ghost" data-action="sheet" data-kind="aterkommande">${icon('plus', 14)} Lägg till</button></div>
        ${rec.length ? `<div class="panel">${rec.map((r) => `<div class="row">
          <div class="grow"><div class="title${r.active ? '' : ' strike'}">${esc(r.title)}</div>
            <div class="sub">${esc(R.describe(r))}${r.childIds && r.childIds.length
              ? ` · ${esc(r.childIds.map((id) => M.childName(state, id)).filter(Boolean).join(', '))}` : ''}</div></div>
          <button class="btn tiny quiet" data-action="rec-toggle" data-id="${esc(r.id)}">${r.active ? 'Pausa' : 'Starta'}</button>
          <button class="btn tiny quiet" data-action="rec-remove" data-id="${esc(r.id)}" aria-label="Ta bort">${icon('kryss', 15)}</button>
        </div>`).join('')}</div>`
        : `<div class="panel sunk"><div class="row"><p class="muted">Inget återkommande än. Lägg in träning, aktiviteter eller fasta pass en gång — sedan dyker de upp av sig själva.</p></div></div>`}
      </section>

      <div class="note" style="margin-top:20px">En återkommande aktivitet gör inte dagen till arbetsdag eller barndag. Det svarar du på per dag.</div>`;
  }

  function dayCard(state, d) {
    const bits = [];
    if (d.work === 'ja') bits.push('<span class="tag planerat">Arbete</span>');
    else if (d.work === 'nej') bits.push('<span class="tag">Ledig</span>');
    else bits.push('<span class="tag behover">Arbete okänt</span>');

    if (d.present.length) bits.push(`<span class="tag bekraftat">${esc(d.present.map((c) => c.name).join(', '))}</span>`);
    else if (d.unknownChildren.length) bits.push('<span class="tag behover">Barn okänt</span>');
    else bits.push('<span class="tag">Inga barn</span>');

    for (const dl of d.deadlines) bits.push(`<span class="tag behover">Tidsgräns: ${esc(dl.title)}</span>`);

    const shown = d.fixed.slice(0, 3).map((f) => `${f.at} ${f.title}`).join(' · ');
    const hidden = d.fixed.length - 3;
    const fixedText = d.fixed.length
      ? `${shown}${hidden > 0 ? ` · +${hidden} till` : ''}`
      : 'Inget fast inlagt';

    return `<button class="daycard${d.isToday ? ' today' : ''}" data-action="sheet" data-kind="dag" data-date="${esc(d.dateKey)}">
      <span class="date"><span class="d mono">${d.dayNumber}</span><span class="w">${esc(DAY_SHORT[d.weekday])}</span></span>
      <span class="body">
        <span class="title" style="font-weight:550">${esc(d.isToday ? 'I dag' : d.relative.charAt(0).toUpperCase() + d.relative.slice(1))}</span>
        <span class="sub" style="display:block">${esc(fixedText)}${d.taskCount ? ` · ${d.taskCount} uppgifter` : ''}</span>
        <span class="meta">${bits.join('')}</span>
      </span>
    </button>`;
  }

  /* ═══════════ BERÄTTA ═══════════ */

  function quickPhrases(state) {
    const out = ['Jag har låg ork i dag.', 'Barnen kommer till mig i kväll.', 'Det här hann jag inte.',
      'Vad behöver jag förbereda inför i morgon?'];
    const open = M.openNeeds(state).filter((n) => n.status !== 'bekraftat');
    if (open.length) out.unshift(`${open[0].title} är köpt.`);
    return out;
  }

  function renderBerat(state) {
    const speech = 'webkitSpeechRecognition' in root || 'SpeechRecognition' in root;
    return `<header class="top"><div class="grow">
      <div class="eyebrow"><span>${esc(U.longDate(U.dateKey(ui.now)))}</span>
        <span class="now mono">${esc(U.toClock(U.minutesOfDay(ui.now)))}</span></div>
      <h1>Berätta</h1></div></header>

      <div class="tell">
        <label class="sr" for="tell">Skriv vad som gäller</label>
        <textarea id="tell" placeholder="${esc(placeholder(state))}">${esc(ui.draft)}</textarea>
        <div class="scroller">${quickPhrases(state).map((e) =>
          `<button class="chip" data-action="example" data-text="${esc(e)}">${esc(e)}</button>`).join('')}</div>
        <div class="btnrow">
          ${speech ? `<button class="btn ghost" data-action="dictate" style="flex:0 0 auto" aria-label="Diktera">${icon('mick', 18)}</button>` : ''}
          <button class="btn primary" data-action="interpret" ${ui.busy ? 'disabled' : ''}>${
            ui.busy ? 'Tolkar …' : 'Föreslå ändringar'}</button>
        </div>
        <p class="faint" style="margin-top:11px">${
          ui.aiStatus.available ? 'AI-tolkning är ansluten. Ingenting ändras förrän du godkänner.'
            : 'Ingen AI ansluten — texten tolkas med enkla regler. Ingenting ändras förrän du godkänner.'}</p>
      </div>

      ${ui.proposal ? renderProposal(state) : ''}
      ${recentlyDone(state)}`;
  }

  function placeholder(state) {
    const name = state.children.length ? state.children[0].name : '';
    return name
      ? `Skriv eller diktera. Till exempel: "${name} behöver fler byxor. Jag fixar det efter jobbet."`
      : 'Skriv eller diktera vad som gäller just nu.';
  }

  function renderProposal(state) {
    const p = ui.proposal;
    const picked = p.picks || {};
    const pending = p.questions.filter((q) => !(q.id in picked));
    const answered = [];
    for (const q of p.questions) {
      const choice = picked[q.id];
      if (!choice || choice === '__skip__') continue;
      const opt = q.options.find((o) => o.id === choice);
      if (opt) answered.push(...opt.ops);
    }
    const all = [...p.ops, ...answered];

    if (!all.length && !p.questions.length) {
      return `<div class="proposal">
        <h2>Jag förstod inte riktigt</h2>
        <p class="muted" style="margin:8px 0 14px">${esc(p.summary || 'Försök skriva om det, gärna med barnets namn och vad det gäller.')}</p>
        ${p.answerText ? `<p style="margin-bottom:14px">${p.answerText}</p>` : ''}
        <button class="btn wide" data-action="clear-proposal">Stäng</button></div>`;
    }

    return `<div class="proposal">
      <div class="eyebrow">${p.mode === 'ai' ? 'Tolkat med AI' : 'Tolkat med regler (ingen AI)'}</div>
      <h2 style="margin:7px 0 12px">Förslag</h2>
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

      ${all.length ? `<div style="margin:12px 0">${all.map((op) =>
        `<div class="change"><span class="mark">→</span><span>${esc(MV.apply.describeOp(state, op))}</span></div>`).join('')}</div>`
        : '<p class="muted" style="margin:10px 0">Svara på frågan ovan så visar jag vad som ändras.</p>'}

      ${(p.unmatched || []).map((u) => `<div class="note">${esc(u)}</div>`).join('')}
      ${all.length && pending.length ? `<p class="faint" style="margin:4px 0 10px">${
        pending.length === 1 ? 'En fråga är obesvarad' : `${pending.length} frågor är obesvarade`} — det lämnas oförändrat.</p>` : ''}

      <div class="btnrow" style="margin-top:6px">
        <button class="btn primary" data-action="accept" ${all.length ? '' : 'disabled'}>Godkänn</button>
        <button class="btn ghost" data-action="clear-proposal">Avbryt</button>
      </div></div>`;
  }

  function recentlyDone(state) {
    const done = state.tasks.filter((t) => t.status === 'klar')
      .sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt))).slice(0, 3);
    if (!done.length) return '';
    return `<section class="section"><div class="section-head"><h2>Nyss klart</h2></div>
      <div class="panel sunk">${done.map((t) => `<div class="row">
        <div class="grow"><div class="title strike">${esc(t.title)}</div></div>
        <button class="btn tiny quiet" data-action="task-reopen" data-id="${esc(t.id)}">Ångra</button>
      </div>`).join('')}</div></section>`;
  }

  /* ═══════════ BARN ═══════════ */

  function renderBarn(state) {
    if (!state.children.length) {
      return `<header class="top"><div class="grow"><h1>Barn</h1></div></header>
        <div class="empty"><div class="mark">${icon('barn', 44)}</div><p>Inga barn tillagda än.</p>
        <div class="btnrow" style="justify-content:center;margin-top:14px">
        <button class="btn primary" data-action="sheet" data-kind="barn" style="flex:0 0 auto">Lägg till barn</button></div></div>`;
    }
    return `<header class="top"><div class="grow">
      <div class="eyebrow">Behov, storlekar och packning</div><h1>Barn</h1></div></header>
      ${state.children.map((c) => childSection(state, c)).join('')}
      <div class="note" style="margin-top:18px">Storlekar märkta <span class="tag prel">preliminär</span>
      är provstorlekar, inte uppmätta kroppsmått. Inget är ett bekräftat köp förrän du säger det.</div>`;
  }

  function childSection(state, child) {
    const needs = state.needs.filter((n) => n.childId === child.id);
    const sizes = state.sizes.filter((s) => s.childId === child.id);
    const packs = (state.packLists || []).filter((l) => l.childId === child.id);
    const today = U.dateKey(ui.now);
    const presence = M.childPresence(state, today, child.id);
    const groups = [['behover', 'Behöver ordnas'], ['planerat', 'Planerat'], ['bekraftat', 'Bekräftat klart']];

    return `<section class="section">
      <div class="section-head"><h2>${esc(child.name)}</h2>
        <span class="hint">${presence === 'ja' ? 'hos dig i dag' : presence === 'nej' ? 'inte i dag' : 'i dag okänt'}</span></div>

      <div class="panel">
        ${groups.map(([key, label]) => {
          const items = needs.filter((n) => n.status === key);
          if (!items.length) return '';
          return `<div class="row" style="padding-bottom:4px"><span class="tag ${key}">${esc(label)}</span></div>
            ${items.map((n) => needRow(state, n)).join('')}`;
        }).join('')}
        ${!needs.length ? '<div class="row"><p class="muted">Inga behov registrerade.</p></div>' : ''}
        <div class="row"><button class="btn small ghost wide" data-action="sheet" data-kind="behov" data-child="${esc(child.id)}">
          ${icon('plus', 15)} Lägg till behov</button></div>
      </div>

      <div class="section-head" style="margin-top:16px"><h3>Storlekar</h3>
        <button class="btn tiny quiet" data-action="sheet" data-kind="storlek" data-child="${esc(child.id)}">${icon('plus', 14)} Lägg till</button></div>
      <div class="panel">
        ${sizes.length ? sizes.map((s) => `<div class="row">
          <div class="grow"><div class="title">${esc(s.value)}</div>
            <div class="sub">${s.kind === 'kropp' ? esc(s.label) : `${esc(s.brand || 'Märke ej angivet')} · ${esc(s.label)}`}</div></div>
          ${s.preliminary ? '<span class="tag prel">preliminär</span>' : '<span class="tag bekraftat">uppmätt</span>'}
          <button class="btn tiny quiet" data-action="del-size" data-id="${esc(s.id)}" aria-label="Ta bort storlek">${icon('kryss', 15)}</button>
        </div>`).join('') : '<div class="row"><p class="faint">Ingen storlek registrerad.</p></div>'}
      </div>

      <div class="section-head" style="margin-top:16px"><h3>Packlistor</h3>
        <button class="btn tiny quiet" data-action="sheet" data-kind="packlista" data-child="${esc(child.id)}">${icon('plus', 14)} Lägg till</button></div>
      <div class="panel">
        ${packs.length ? packs.map((l) => `<div class="row">
          <div class="grow"><div class="title">${esc(l.name)}</div>
            <div class="sub">${l.items.length} ${l.items.length === 1 ? 'sak' : 'saker'} · bockas av under Kväll</div></div>
          <button class="btn tiny quiet" data-action="pack-remove" data-id="${esc(l.id)}" aria-label="Ta bort packlista">${icon('kryss', 15)}</button>
        </div>`).join('') : '<div class="row"><p class="faint">Ingen packlista än.</p></div>'}
      </div>
    </section>`;
  }

  function needRow(state, need) {
    const remaining = M.needRemaining(need);
    const progress = need.qty > 1 ? `${need.doneQty} av ${need.qty} klara` : '';
    const sub = [progress, need.note].filter(Boolean).join(' · ')
      || (need.status === 'planerat' ? 'Inplanerat, ännu inte köpt' : remaining ? `${remaining} kvar att ordna` : '');
    const open = ui.expanded === need.id;
    return `<div class="row">
      <button class="tick${need.status === 'bekraftat' ? ' done' : ''}" data-action="need-step" data-id="${esc(need.id)}"
        aria-label="Bekräfta ${esc(need.title)}"></button>
      <div class="grow"><div class="title${need.status === 'bekraftat' ? ' strike' : ''}">${esc(need.title)}</div>
        ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
      <button class="btn tiny quiet" data-action="expand" data-id="${esc(need.id)}" aria-label="Fler val">···</button>
    </div>
    ${open ? `<div class="row" style="padding-top:0;border:none"><div class="btnrow grow">
      <button class="btn tiny ghost" data-action="need-status" data-id="${esc(need.id)}" data-value="behover">Behövs</button>
      <button class="btn tiny ghost" data-action="need-status" data-id="${esc(need.id)}" data-value="planerat">Planerat</button>
      <button class="btn tiny ghost" data-action="need-status" data-id="${esc(need.id)}" data-value="bekraftat">Klart</button>
      <button class="btn tiny danger" data-action="need-remove" data-id="${esc(need.id)}">Ta bort</button>
    </div></div>` : ''}`;
  }

  /* ═══════════ KVÄLL ═══════════ */

  function renderKvall(state) {
    const e = MV.evening.eveningPlan(state, ui.now);
    const today = U.dateKey(ui.now);
    const routine = Rt.summary(state, today, 'kvall');
    const packs = Rt.packForDate(state, e.tomorrow);

    // Rubriken räknar ALLT som återstår — förberedelser, kvällsrutin och packning.
    // Annars säger den "3 kvar" medan det står åtta saker på skärmen.
    const totalItems = e.items.length + (routine ? routine.total : 0)
      + packs.reduce((sum, p) => sum + p.total, 0);
    const totalLeft = e.remaining + (routine ? routine.remaining : 0)
      + packs.reduce((sum, p) => sum + p.remaining, 0);
    const headline = totalItems === 0 ? e.headline
      : totalLeft === 0 ? 'Allt är förberett inför i morgon.'
        : totalLeft === 1 ? 'En sak kvar innan du kan släppa dagen.'
          : `${totalLeft} saker kvar innan du kan släppa dagen.`;

    return `<header class="top"><div class="grow">
      <div class="eyebrow">Inför ${esc(U.relativeDay(e.tomorrow, e.date))}</div>
      <h1>Kväll och morgon</h1></div></header>

      <section class="next calm"><div class="kicker">Läget</div>
        <h2>${esc(headline)}</h2>
        ${e.bedtimeHint ? `<p class="detail">${esc(e.bedtimeHint)}</p>` : ''}</section>

      ${e.notes.map((n) => `<div class="ask-card"><div class="q">${esc(n.text)}</div><div class="btnrow">
        ${n.field === 'work'
          ? `<button class="btn small" data-action="set-work-date" data-date="${esc(n.date)}" data-value="ja">Jag arbetar</button>
             <button class="btn small" data-action="set-work-date" data-date="${esc(n.date)}" data-value="nej">Ledig</button>`
          : `<button class="btn small" data-action="set-children-date" data-date="${esc(n.date)}" data-value="ja">De är här</button>
             <button class="btn small" data-action="set-children-date" data-date="${esc(n.date)}" data-value="nej">Inte då</button>
             <button class="btn small quiet" data-action="sheet" data-kind="narvaro" data-date="${esc(n.date)}">Per barn</button>`}
      </div></div>`).join('')}

      ${routine ? routineBlock(state, routine, today) : `<section class="section">
        <div class="section-head"><h2>Kvällsrutin</h2></div>
        <div class="panel sunk"><div class="row"><div class="grow">
          <p class="muted">Ingen kvällsrutin än. Lägg in den en gång så återkommer den av sig själv.</p>
          <div class="btnrow" style="margin-top:10px"><button class="btn small ghost" data-action="sheet" data-kind="rutin" data-when="kvall">Lägg till rutin</button></div>
        </div></div></div></section>`}

      ${e.items.length ? `<section class="section">
        <div class="section-head"><h2>Att förbereda</h2><span class="hint">${e.remaining} kvar</span></div>
        <div class="panel">${e.items.map((i) => `<div class="row">
          <span class="at"></span>
          <button class="tick${i.done ? ' done' : ''}" data-action="prep" data-key="${esc(i.key)}" data-done="${i.done ? '1' : '0'}"
            aria-label="${esc(i.label)}"></button>
          <div class="grow"><div class="title${i.done ? ' strike' : ''}">${esc(i.label)}</div>
            <div class="sub">${esc(i.why)}</div></div></div>`).join('')}</div></section>` : ''}

      ${packs.length ? `<section class="section">
        <div class="section-head"><h2>Packning inför i morgon</h2></div>
        ${packs.map((pk) => `<div class="routine">
          <div class="routine-head" style="cursor:default">
            <span class="grow"><span class="title">${esc(pk.list.name)}${pk.childName ? ` · ${esc(pk.childName)}` : ''}</span>
              <span class="sub" style="display:block">${pk.complete ? 'Packat' : `${pk.remaining} kvar`}</span></span>
            ${pk.complete ? '' : `<button class="btn tiny quiet" data-action="pack-reset" data-list="${esc(pk.list.id)}" data-date="${esc(e.tomorrow)}">Nollställ</button>`}
          </div>
          ${pk.items.map((item) => `<div class="row"><span class="at"></span>
            <button class="tick${item.done ? ' done' : ''}" data-action="pack-item" data-list="${esc(pk.list.id)}"
              data-item="${esc(item.id)}" data-done="${item.done ? '1' : '0'}" data-date="${esc(e.tomorrow)}"
              aria-label="${esc(item.label)}"></button>
            <div class="grow"><div class="title${item.done ? ' strike' : ''}">${esc(item.label)}</div></div></div>`).join('')}
        </div>`).join('')}
      </section>` : ''}

      ${e.tomorrowFixed.length ? `<section class="section">
        <div class="section-head"><h2>Fast i morgon</h2></div>
        <div class="panel sunk">${e.tomorrowFixed.map((f) => `<div class="row fixed">
          <span class="at">${esc(f.at)}</span><div class="grow"><div class="title">${esc(f.title)}</div></div>
        </div>`).join('')}</div></section>` : ''}

      <div class="note" style="margin-top:20px">Appen skickar inga påminnelser och ändrar ingenting i din kalender.</div>`;
  }

  /* ═══════════ KAN VÄNTA ═══════════ */

  function renderVantar(state) {
    const today = U.dateKey(ui.now);
    const plan = P.planDay(state, ui.now);
    const inPlan = new Set(plan.priorities.map((p) => p.taskId));
    const waiting = M.openTasks(state).filter((t) => !inPlan.has(t.id));
    const withDeadline = waiting.filter((t) => t.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline));
    const rest = waiting.filter((t) => !t.deadline);
    const openNeeds = M.openNeeds(state).filter((n) => n.status === 'behover');

    return `<header class="top">
      <button class="btn small ghost" data-action="go" data-view="dag" aria-label="Tillbaka" style="rotate:180deg">${icon('pil', 18)}</button>
      <div class="grow"><div class="eyebrow">Ingenting försvinner</div><h1>Kan vänta</h1></div></header>

      ${withDeadline.length ? `<section class="section">
        <div class="section-head"><h2>Har en tidsgräns</h2></div>
        <div class="panel">${withDeadline.map((t) => waitRow(state, t, today)).join('')}</div></section>` : ''}

      ${rest.length ? `<section class="section">
        <div class="section-head"><h2>När det passar</h2></div>
        <div class="panel">${rest.map((t) => waitRow(state, t, today)).join('')}</div></section>` : ''}

      ${openNeeds.length ? `<section class="section">
        <div class="section-head"><h2>Behov utan plan</h2><span class="hint">${openNeeds.length}</span></div>
        <div class="panel sunk">${openNeeds.map((n) => `<div class="row"><div class="grow">
          <div class="title">${esc(n.title)}</div><div class="sub">${esc(M.childName(state, n.childId))}</div></div></div>`).join('')}
          <div class="row"><button class="btn wide ghost" data-action="plan-needs">Planera in ett inköp</button></div>
        </div></section>` : ''}

      ${!waiting.length && !openNeeds.length
        ? `<div class="empty"><div class="mark">${icon('vanta', 44)}</div><p>Inget väntar just nu.</p></div>` : ''}`;
  }

  function waitRow(state, task, today) {
    const late = task.deadline && task.deadline < today;
    return `<div class="row">
      <button class="tick" data-action="task-done" data-id="${esc(task.id)}" aria-label="Markera ${esc(task.title)} klar"></button>
      <div class="grow"><div class="title">${esc(task.title)}</div>
        <div class="sub">${task.deadline ? `${late ? 'Passerad: ' : 'Senast '}${esc(U.relativeDay(task.deadline, today))} · ` : ''}${esc(U.duration(task.minutes))}</div></div>
      <button class="btn tiny ghost" data-action="task-today" data-id="${esc(task.id)}">I dag</button>
    </div>`;
  }

  /* ═══════════ INSTÄLLNINGAR ═══════════ */

  function renderSettings(state) {
    const s = state.settings;
    const names = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
    const order = [1, 2, 3, 4, 5, 6, 0];

    return `<header class="top">
      <button class="btn small ghost" data-action="go" data-view="dag" aria-label="Tillbaka" style="rotate:180deg">${icon('pil', 18)}</button>
      <div class="grow"><h1>Inställningar</h1></div></header>

      <section class="section"><div class="section-head"><h2>Barn</h2>
        <button class="btn tiny ghost" data-action="sheet" data-kind="barn">${icon('plus', 14)} Lägg till</button></div>
        <div class="panel">${state.children.map((c) => `<div class="row">
          <div class="grow"><div class="title">${esc(c.name)}</div></div>
          <button class="btn tiny quiet danger" data-action="del-child" data-id="${esc(c.id)}">Ta bort</button>
        </div>`).join('') || '<div class="row"><p class="faint">Inga barn än.</p></div>'}</div></section>

      <section class="section"><div class="section-head"><h2>Vanlig vecka</h2></div>
        <p class="faint" style="margin-bottom:12px">Okänt är helt i sin ordning. Enstaka dagar ändrar du under Vecka.</p>
        <div class="panel"><div class="row" style="flex-direction:column;align-items:stretch;gap:14px">
        ${order.map((d) => {
          const t = state.weekTemplate[String(d)] || { work: 'okand', children: 'okand' };
          return `<div>
            <div class="sub" style="margin-bottom:6px;font-weight:600;color:var(--ink)">${esc(names[d])}</div>
            <div class="grid2">
              <div class="seg">${['ja', 'nej', 'okand'].map((v) => `<button class="${t.work === v ? 'on' : ''}"
                data-action="tpl" data-day="${d}" data-key="work" data-value="${v}">${v === 'ja' ? 'Jobb' : v === 'nej' ? 'Ledig' : '?'}</button>`).join('')}</div>
              <div class="seg">${['ja', 'nej', 'okand'].map((v) => `<button class="${t.children === v ? 'on' : ''}"
                data-action="tpl" data-day="${d}" data-key="children" data-value="${v}">${v === 'ja' ? 'Barn' : v === 'nej' ? 'Nej' : '?'}</button>`).join('')}</div>
            </div></div>`;
        }).join('')}</div></div></section>

      <section class="section"><div class="section-head"><h2>Tider</h2>
        <button class="btn tiny ghost" data-action="sheet" data-kind="tider">Ändra</button></div>
        <div class="panel"><div class="row"><div class="grow">
          <div class="sub">Upp ${esc(s.wakeTime)} · läggdags ${esc(s.bedtime)}</div>
          <div class="sub">Arbete ${esc(s.workStart)}–${esc(s.workEnd)} · lämning ${esc(s.dropOffTime)}</div>
          <div class="sub">Hämtning ${s.pickUpTime ? esc(s.pickUpTime) : 'ej angiven'}</div>
        </div></div></div></section>

      <section class="section"><div class="section-head"><h2>Rutiner</h2>
        <button class="btn tiny ghost" data-action="sheet" data-kind="rutin">${icon('plus', 14)} Lägg till</button></div>
        <div class="panel">${(state.routines || []).map((r) => `<div class="row">
          <div class="grow"><div class="title">${esc(r.name)}</div>
            <div class="sub">${r.when === 'morgon' ? 'Morgon' : 'Kväll'} · ${r.items.length} punkter${r.requiresChildren ? ' · när barnen är här' : ''}</div></div>
          <button class="btn tiny quiet danger" data-action="routine-remove" data-id="${esc(r.id)}">Ta bort</button>
        </div>`).join('') || '<div class="row"><p class="faint">Inga rutiner än.</p></div>'}</div></section>

      <section class="section"><div class="section-head"><h2>Egen tid</h2>
        <button class="btn tiny ghost" data-action="sheet" data-kind="egen">${icon('plus', 14)} Lägg till</button></div>
        <p class="faint" style="margin-bottom:10px">Appen föreslår bara sådant du själv lagt in här. Den hittar aldrig på städning eller nya projekt.</p>
        <div class="panel">${(s.ownTime || []).map((o, i) => `<div class="row">
          <div class="grow"><div class="title">${esc(o.label)}</div><div class="sub">${esc(U.duration(o.minutes || 60))}</div></div>
          <button class="btn tiny quiet danger" data-action="del-own" data-index="${i}">Ta bort</button>
        </div>`).join('') || '<div class="row"><p class="faint">Inget tillagt än.</p></div>'}</div></section>

      <section class="section"><div class="section-head"><h2>AI och kalender</h2></div>
        <div class="panel">
          <div class="row"><div class="grow"><div class="title">AI-tolkning</div>
            <div class="sub">${esc(ui.aiStatus.checked
              ? (ui.aiStatus.available ? 'Ansluten. Din text och dagens uppgifter skickas till Claude för tolkning.'
                : 'Ingen AI-anslutning i den här vyn. Texten tolkas med enkla regler.') : 'Kontrollerar …')}</div></div>
            <button class="btn small ghost" data-action="toggle-ai">${s.aiOptIn === false ? 'Av' : 'På'}</button></div>
          <div class="row"><div class="grow"><div class="title">Google Kalender</div>
            <div class="sub">Inte ansluten. Ingen verifierad koppling finns i den här versionen. När den byggs blir den endast läsning och kräver ditt godkännande.</div></div></div>
        </div>
        <p class="faint" style="margin-top:10px">Appen skickar inga meddelanden, skapar inga påminnelser och ändrar ingenting i någon kalender.</p></section>

      <section class="section"><div class="section-head"><h2>Dina uppgifter</h2></div>
        <p class="faint" style="margin-bottom:12px">Lagring: ${esc(S.statusText())}.
          ${S.mode === 'moln' ? 'Bara du kommer åt sidans data.' : 'Uppgifterna ligger i den här webbläsaren.'}</p>
        <div class="btnrow">
          <button class="btn ghost" data-action="export">Kopiera mina data</button>
          <button class="btn danger" data-action="erase">Radera allt</button>
        </div></section>`;
  }

  /* ═══════════ ARK (formulär) ═══════════ */

  const WEEK_BUTTONS = [1, 2, 3, 4, 5, 6, 0];

  const SHEETS = {
    barn: () => ({
      title: 'Nytt barn', lead: 'Bara namnet räcker. Allt annat fyller du i när du vill.',
      fields: [{ key: 'name', label: 'Namn', type: 'text', autofocus: true }],
      submit: 'Lägg till',
      run(v) {
        if (!v.name) return null;
        S.update((n) => n.children.push(M.newChild(v.name)));
        return `${v.name} tillagd.`;
      },
    }),
    behov: (data, state) => ({
      title: 'Nytt behov', lead: `Vad behöver ${M.childName(state, data.child)}?`,
      fields: [
        { key: 'title', label: 'Vad', type: 'text', placeholder: 't.ex. 2 par byxor', autofocus: true },
        { key: 'qty', label: 'Antal', type: 'number', value: '1', min: 1 },
      ],
      submit: 'Lägg till',
      run(v) {
        if (!v.title) return null;
        commit([{ op: 'need.add', childId: data.child, title: v.title, qty: Number(v.qty) || 1 }]);
        return null;
      },
    }),
    storlek: (data, state) => ({
      title: 'Storlek', lead: `För ${M.childName(state, data.child)}. Kroppsmått hålls åtskilt från ett märkes storlek.`,
      fields: [
        { key: 'kind', label: 'Typ', type: 'segment', value: 'marke',
          options: [{ v: 'marke', t: 'Märkesstorlek' }, { v: 'kropp', t: 'Kroppsmått' }] },
        { key: 'value', label: 'Värde', type: 'text', placeholder: 't.ex. 110 eller 108 cm', autofocus: true },
        { key: 'brand', label: 'Märke eller butik', type: 'text', placeholder: 'lämna tomt om okänt', showIf: (vals) => vals.kind !== 'kropp' },
        { key: 'preliminary', label: 'Preliminär provstorlek (inte uppmätt)', type: 'check', value: true },
      ],
      submit: 'Spara',
      run(v) {
        if (!v.value) return null;
        commit([{ op: 'size.set', childId: data.child, kind: v.kind, brand: v.kind === 'kropp' ? '' : v.brand,
          label: v.kind === 'kropp' ? 'Kroppslängd' : 'Storlek', value: v.value, preliminary: !!v.preliminary }]);
        return null;
      },
    }),
    aterkommande: (data, state) => ({
      title: 'Återkommande', lead: 'Skriv in en gång — sedan dyker det upp av sig självt de dagar du valt.',
      fields: [
        { key: 'title', label: 'Vad', type: 'text', placeholder: 't.ex. Styrketräning', autofocus: true },
        { key: 'weekdays', label: 'Vilka dagar', type: 'days', value: [] },
        { key: 'start', label: 'Börjar', type: 'time', value: '18:00' },
        { key: 'end', label: 'Slutar', type: 'time', value: '19:00' },
        { key: 'kind', label: 'Sort', type: 'segment', value: 'egen',
          options: [{ v: 'egen', t: 'Egen tid' }, { v: 'barn', t: 'Barnen' }, { v: 'annat', t: 'Annat' }] },
      ],
      submit: 'Lägg till',
      run(v) {
        if (!v.title || !v.weekdays.length) return 'Skriv vad det gäller och välj minst en dag.';
        commit([{ op: 'recurring.add', title: v.title, weekdays: v.weekdays, start: v.start, end: v.end, kind: v.kind }]);
        return null;
      },
    }),
    rutin: (data) => ({
      title: 'Ny rutin', lead: 'Välj ett färdigt förslag eller skriv en egen. Den återkommer sedan utan att skrivas in på nytt.',
      templates: Rt.ROUTINE_TEMPLATES.filter((t) => !data.when || t.when === data.when),
      fields: [
        { key: 'name', label: 'Namn', type: 'text', placeholder: 't.ex. Kvällsrutin' },
        { key: 'when', label: 'När', type: 'segment', value: data.when || 'kvall',
          options: [{ v: 'morgon', t: 'Morgon' }, { v: 'kvall', t: 'Kväll' }] },
        { key: 'items', label: 'Punkter, en per rad', type: 'textarea', placeholder: 'Diska\nLägg fram kläder' },
        { key: 'requiresChildren', label: 'Bara när barnen är hos mig', type: 'check', value: false },
      ],
      submit: 'Lägg till',
      run(v) {
        const items = String(v.items || '').split('\n').map((x) => x.trim()).filter(Boolean);
        if (!v.name || !items.length) return 'Ge rutinen ett namn och minst en punkt.';
        commit([{ op: 'routine.add', name: v.name, when: v.when, items, requiresChildren: !!v.requiresChildren }]);
        return null;
      },
      applyTemplate(t) {
        return { name: t.name, when: t.when, items: t.items.join('\n'), requiresChildren: t.requiresChildren };
      },
    }),
    packlista: (data, state) => ({
      title: 'Packlista', lead: data.child ? `För ${M.childName(state, data.child)}.` : 'Gäller alla barn.',
      templates: Rt.PACK_TEMPLATES,
      fields: [
        { key: 'name', label: 'Namn', type: 'text', placeholder: 't.ex. Förskola' },
        { key: 'items', label: 'Saker, en per rad', type: 'textarea', placeholder: 'Extrakläder\nBlöjor' },
      ],
      submit: 'Lägg till',
      run(v) {
        const items = String(v.items || '').split('\n').map((x) => x.trim()).filter(Boolean);
        if (!v.name || !items.length) return 'Ge listan ett namn och minst en sak.';
        commit([{ op: 'pack.add', name: v.name, childId: data.child || null, items }]);
        return null;
      },
      applyTemplate(t) { return { name: t.name, items: t.items.join('\n') }; },
    }),
    egen: () => ({
      title: 'Egen tid', lead: 'Det du vill ha plats för. Appen föreslår bara sådant du lagt in själv.',
      fields: [
        { key: 'label', label: 'Vad', type: 'text', placeholder: 't.ex. Gitarr', autofocus: true },
        { key: 'minutes', label: 'Ungefär hur länge (minuter)', type: 'number', value: '60', min: 10 },
      ],
      submit: 'Lägg till',
      run(v) {
        if (!v.label) return null;
        S.update((n) => n.settings.ownTime.push({ id: U.makeId('egen'), label: v.label, minutes: Number(v.minutes) || 60 }));
        return 'Tillagt.';
      },
    }),
    tider: (data, state) => ({
      title: 'Tider', lead: 'Lämna hämtningstiden tom om den varierar — då skapas ingen hämtning.',
      fields: [
        { key: 'wakeTime', label: 'Går upp', type: 'time', value: state.settings.wakeTime },
        { key: 'bedtime', label: 'Läggdags', type: 'time', value: state.settings.bedtime },
        { key: 'workStart', label: 'Arbete börjar', type: 'time', value: state.settings.workStart },
        { key: 'workEnd', label: 'Arbete slutar', type: 'time', value: state.settings.workEnd },
        { key: 'dropOffTime', label: 'Lämning', type: 'time', value: state.settings.dropOffTime },
        { key: 'pickUpTime', label: 'Hämtning', type: 'time', value: state.settings.pickUpTime },
      ],
      submit: 'Spara',
      run(v) {
        S.update((n) => { for (const k of Object.keys(v)) n.settings[k] = v[k]; });
        return 'Tiderna sparade.';
      },
    }),
    ork: (data, state) => ({
      title: 'Hur är orken i dag?', lead: 'Låg ork ger en lättare dag — och visar vad som lyfts ur.',
      choices: [
        { label: 'God', ops: [{ op: 'day.energy', date: U.dateKey(ui.now), energy: 'god' }] },
        { label: 'Okej', ops: [{ op: 'day.energy', date: U.dateKey(ui.now), energy: 'ok' }] },
        { label: 'Låg', ops: [{ op: 'day.energy', date: U.dateKey(ui.now), energy: 'lag' }] },
        { label: 'Vet inte', ops: [{ op: 'day.energy', date: U.dateKey(ui.now), energy: 'okand' }] },
      ],
    }),
    flytta: (data) => ({
      title: 'Flytta till', lead: '',
      choices: [
        { label: 'Senare i dag', ops: [{ op: 'task.move', taskId: data.id, to: 'senare' }] },
        { label: 'I morgon', ops: [{ op: 'task.move', taskId: data.id, to: 'imorgon' }] },
        { label: 'Kan vänta', ops: [{ op: 'task.move', taskId: data.id, to: 'vantar' }] },
      ],
    }),
    narvaro: (data, state) => ({
      title: 'Vilka barn är hos dig?', lead: U.relativeDay(data.date, U.dateKey(ui.now)),
      perChild: state.children.map((c) => ({
        id: c.id, name: c.name, value: M.childPresence(state, data.date, c.id),
      })),
      date: data.date,
    }),
    dag: (data, state) => ({
      title: U.longDate(data.date), lead: 'Bekräfta vad som gäller. Okänt är ett giltigt svar.',
      dayEditor: data.date,
      work: M.workdayFor(state, data.date),
      perChild: state.children.map((c) => ({
        id: c.id, name: c.name, value: M.childPresence(state, data.date, c.id),
      })),
      date: data.date,
    }),
  };

  function sheetSpec() {
    if (!ui.sheet) return null;
    const build = SHEETS[ui.sheet.kind];
    return build ? build(ui.sheet.data || {}, S.state) : null;
  }

  function renderSheet() {
    const spec = sheetSpec();
    if (!spec) { sheetEl.innerHTML = ''; return; }
    const vals = ui.sheet.values;

    let bodyHtml = '';

    if (spec.choices) {
      bodyHtml = `<div class="stack">${spec.choices.map((c, i) =>
        `<button class="btn wide ghost" data-action="sheet-choice" data-index="${i}">${esc(c.label)}</button>`).join('')}</div>`;
    } else if (spec.perChild) {
      bodyHtml = `${spec.dayEditor ? `<div class="field"><label>Arbetsdag</label>
        <div class="seg">${['ja', 'nej', 'okand'].map((v) => `<button class="${spec.work === v ? 'on' : ''}"
          data-action="sheet-work" data-date="${esc(spec.date)}" data-value="${v}">${v === 'ja' ? 'Jobb' : v === 'nej' ? 'Ledig' : 'Okänt'}</button>`).join('')}</div></div>` : ''}
        <div class="field"><label>Barnen</label><div class="stack">
        ${spec.perChild.map((c) => `<div>
          <div class="sub" style="margin-bottom:5px;color:var(--ink);font-weight:500">${esc(c.name)}</div>
          <div class="seg">${['ja', 'nej', 'okand'].map((v) => `<button class="${c.value === v ? 'on' : ''}"
            data-action="sheet-presence" data-child="${esc(c.id)}" data-date="${esc(spec.date)}" data-value="${v}">${
            v === 'ja' ? 'Hos mig' : v === 'nej' ? 'Inte' : 'Okänt'}</button>`).join('')}</div>
        </div>`).join('')}</div></div>
        <button class="btn wide primary" data-action="close-sheet">Klar</button>`;
    } else {
      const templates = spec.templates && spec.templates.length
        ? `<div class="field"><label>Färdiga förslag</label><div class="scroller">
            ${spec.templates.map((t, i) => `<button class="chip" data-action="sheet-template" data-index="${i}">${esc(t.name)}</button>`).join('')}
          </div></div>` : '';

      const fields = spec.fields.filter((f) => !f.showIf || f.showIf(vals)).map((f) => fieldHtml(f, vals)).join('');
      bodyHtml = `${templates}${fields}
        <div class="btnrow" style="margin-top:6px">
          <button class="btn primary" data-action="sheet-submit">${esc(spec.submit || 'Spara')}</button>
          <button class="btn ghost" data-action="close-sheet">Avbryt</button>
        </div>`;
    }

    sheetEl.innerHTML = `<div class="scrim" data-action="close-sheet-bg"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(spec.title)}">
      <h2>${esc(spec.title)}</h2>
      ${spec.lead ? `<p class="lead">${esc(spec.lead)}</p>` : '<div style="height:12px"></div>'}
      ${ui.sheet.error ? `<div class="ask-card"><div class="q">${esc(ui.sheet.error)}</div></div>` : ''}
      ${bodyHtml}
    </div></div>`;

    const first = sheetEl.querySelector('[data-autofocus]');
    if (first) setTimeout(() => first.focus(), 60);
  }

  function fieldHtml(f, vals) {
    const v = vals[f.key];
    const id = `f_${f.key}`;
    if (f.type === 'segment') {
      return `<div class="field"><label>${esc(f.label)}</label><div class="seg">
        ${f.options.map((o) => `<button class="${v === o.v ? 'on' : ''}" data-action="sheet-seg"
          data-key="${esc(f.key)}" data-value="${esc(o.v)}">${esc(o.t)}</button>`).join('')}</div></div>`;
    }
    if (f.type === 'days') {
      return `<div class="field"><label>${esc(f.label)}</label><div class="daypick">
        ${WEEK_BUTTONS.map((d) => `<button class="${(v || []).includes(d) ? 'on' : ''}" data-action="sheet-day"
          data-key="${esc(f.key)}" data-day="${d}" aria-pressed="${(v || []).includes(d)}">${esc(DAY_SHORT[d])}</button>`).join('')}</div></div>`;
    }
    if (f.type === 'check') {
      return `<div class="field"><button class="btn wide ghost" data-action="sheet-check" data-key="${esc(f.key)}"
        style="justify-content:flex-start;gap:12px">
        <span class="tick${v ? ' done' : ''}" style="pointer-events:none"></span>
        <span style="text-align:left;font-weight:450">${esc(f.label)}</span></button></div>`;
    }
    if (f.type === 'textarea') {
      return `<div class="field"><label for="${id}">${esc(f.label)}</label>
        <textarea id="${id}" data-input="${esc(f.key)}" placeholder="${esc(f.placeholder || '')}"${f.autofocus ? ' data-autofocus' : ''}>${esc(v || '')}</textarea></div>`;
    }
    const type = f.type === 'number' ? 'number' : f.type === 'time' ? 'time' : 'text';
    return `<div class="field"><label for="${id}">${esc(f.label)}</label>
      <input id="${id}" type="${type}" data-input="${esc(f.key)}" value="${esc(v == null ? '' : v)}"
      placeholder="${esc(f.placeholder || '')}"${f.min != null ? ` min="${f.min}"` : ''}${f.autofocus ? ' data-autofocus' : ''}></div>`;
  }

  function openSheet(kind, data) {
    const build = SHEETS[kind];
    if (!build) return;
    const spec = build(data || {}, S.state);
    const values = {};
    for (const f of spec.fields || []) values[f.key] = f.value !== undefined ? f.value : '';
    ui.sheet = { kind, data: data || {}, values, error: null };
    render();
  }

  function readSheetInputs() {
    if (!ui.sheet) return;
    for (const el of sheetEl.querySelectorAll('[data-input]')) {
      ui.sheet.values[el.dataset.input] = el.value;
    }
  }

  function closeSheet() { ui.sheet = null; renderSheet(); }

  /* ═══════════ handlingar ═══════════ */

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
    try { result = await MV.ai.interpret(S.state, text, new Date()); }
    catch (e) { result = MV.language.interpret(S.state, text, new Date()); result.mode = 'regler'; }
    ui.aiStatus = MV.ai.status();
    result.picks = {};
    if (result.query) result.answerText = answerFor(result.query);
    ui.proposal = result;
    ui.busy = false;
    render();
  }

  function answerFor(kind) {
    const state = S.state;
    if (kind === 'forberedelse') {
      const e = MV.evening.eveningPlan(state, new Date());
      const left = e.items.filter((i) => !i.done);
      return esc(left.length ? `${e.headline} ${left.map((i) => i.label).join('. ')}.` : e.headline)
        + ' <button class="btn tiny quiet" data-action="go" data-view="kvall">Öppna Kväll</button>';
    }
    if (kind === 'nu') {
      const plan = P.planDay(state, new Date());
      return esc(`${plan.nowCard.title}. ${plan.nowCard.detail || ''}`)
        + ' <button class="btn tiny quiet" data-action="go" data-view="dag">Öppna Min dag</button>';
    }
    if (kind === 'behov') {
      const open = M.openNeeds(state);
      if (!open.length) return 'Inga öppna behov just nu.';
      return esc(open.slice(0, 8).map((n) => `${M.childName(state, n.childId)}: ${n.title}`).join('. ') + '.');
    }
    return '';
  }

  function cycle(list, current) { return list[(list.indexOf(current) + 1) % list.length]; }

  const ACTIONS = {
    go(el) { ui.view = el.dataset.view; ui.expanded = null; closeSheet(); window.scrollTo(0, 0); },
    nav(el) { ACTIONS.go(el); },
    replan() { ui.now = new Date(); ui.expanded = null; toast(`Planerat om från ${U.toClock(U.minutesOfDay(ui.now))}.`); },
    'toggle-moved'() { ui.showMoved = !ui.showMoved; },
    expand(el) { ui.expanded = ui.expanded === el.dataset.id ? null : el.dataset.id; },
    'open-routine'(el) { ui.openRoutine = ui.openRoutine === el.dataset.id ? null : el.dataset.id; },

    sheet(el) { openSheet(el.dataset.kind, { child: el.dataset.child, id: el.dataset.id, date: el.dataset.date, when: el.dataset.when }); return true; },
    'close-sheet'() { closeSheet(); return true; },
    'close-sheet-bg'(el, event) { if (event.target.classList.contains('scrim')) { closeSheet(); return true; } return true; },
    'sheet-seg'(el) { readSheetInputs(); ui.sheet.values[el.dataset.key] = el.dataset.value; renderSheet(); return true; },
    'sheet-check'(el) { readSheetInputs(); ui.sheet.values[el.dataset.key] = !ui.sheet.values[el.dataset.key]; renderSheet(); return true; },
    'sheet-day'(el) {
      readSheetInputs();
      const key = el.dataset.key, d = Number(el.dataset.day);
      const list = new Set(ui.sheet.values[key] || []);
      if (list.has(d)) list.delete(d); else list.add(d);
      ui.sheet.values[key] = Array.from(list).sort();
      renderSheet(); return true;
    },
    'sheet-template'(el) {
      const spec = sheetSpec();
      const t = spec.templates[Number(el.dataset.index)];
      Object.assign(ui.sheet.values, spec.applyTemplate(t));
      renderSheet(); return true;
    },
    'sheet-submit'() {
      readSheetInputs();
      const spec = sheetSpec();
      const error = spec.run(ui.sheet.values);
      if (error) { ui.sheet.error = error; renderSheet(); return true; }
      closeSheet(); return false;
    },
    'sheet-choice'(el) {
      const spec = sheetSpec();
      const choice = spec.choices[Number(el.dataset.index)];
      closeSheet();
      commit(choice.ops);
    },
    'sheet-presence'(el) {
      commit([{ op: 'day.children', date: el.dataset.date, childId: el.dataset.child, value: el.dataset.value }]);
    },
    'sheet-work'(el) {
      commit([{ op: 'day.work', date: el.dataset.date, value: el.dataset.value }]);
    },

    'cycle-work'() {
      const date = U.dateKey(new Date());
      commit([{ op: 'day.work', date, value: cycle(['okand', 'ja', 'nej'], M.workdayFor(S.state, date)) }]);
    },
    'set-work'(el) { commit([{ op: 'day.work', date: U.dateKey(new Date()), value: el.dataset.value }]); },
    'set-work-date'(el) { commit([{ op: 'day.work', date: el.dataset.date, value: el.dataset.value }]); },
    'set-all-children'(el) {
      const date = U.dateKey(new Date());
      commit(S.state.children.map((c) => ({ op: 'day.children', date, childId: c.id, value: el.dataset.value })),
        el.dataset.value === 'ja' ? 'Barnen är hos dig i dag.' : 'Inga barn hos dig i dag.');
    },
    'set-children-date'(el) {
      commit(S.state.children.map((c) => ({ op: 'day.children', date: el.dataset.date, childId: c.id, value: el.dataset.value })));
    },

    'task-done'(el) { commit([{ op: 'task.done', taskId: el.dataset.id }]); ui.expanded = null; },
    'task-less'(el) {
      const t = S.state.tasks.find((x) => x.id === el.dataset.id);
      if (t) commit([{ op: 'task.reduce', taskId: t.id, minutes: Math.max(10, Math.round(t.minutes / 2)) }]);
    },
    'task-today'(el) {
      S.update((n) => {
        const t = n.tasks.find((x) => x.id === el.dataset.id);
        if (t) { t.status = 'oppen'; t.scheduledDate = U.dateKey(new Date()); }
        const day = n.days[U.dateKey(new Date())];
        if (day) day.skipped = (day.skipped || []).filter((id) => id !== el.dataset.id);
      });
      toast('Flyttad till i dag.', true); ui.view = 'dag';
    },
    'task-reopen'(el) {
      S.update((n) => { const t = n.tasks.find((x) => x.id === el.dataset.id); if (t) { t.status = 'oppen'; t.doneAt = ''; } });
      toast('Återöppnad.', true);
    },

    'need-step'(el) {
      const n = S.state.needs.find((x) => x.id === el.dataset.id);
      if (!n) return;
      commit(n.status === 'bekraftat'
        ? [{ op: 'need.status', needId: n.id, status: 'behover' }]
        : [{ op: 'need.done', needId: n.id, qty: 1 }]);
    },
    'need-status'(el) { commit([{ op: 'need.status', needId: el.dataset.id, status: el.dataset.value }]); ui.expanded = null; },
    'need-remove'(el) {
      const n = S.state.needs.find((x) => x.id === el.dataset.id);
      if (n && confirm(`Ta bort "${n.title}"?`)) { commit([{ op: 'need.remove', needId: n.id }]); ui.expanded = null; }
    },
    'plan-needs'() {
      const needs = M.openNeeds(S.state).filter((n) => n.status === 'behover');
      if (!needs.length) return;
      commit([{ op: 'task.addForNeeds', needIds: needs.map((n) => n.id), minutes: 60,
        context: 'butik', earliest: S.state.settings.workEnd || '' }], 'Inköp inplanerat. Det räknas inte som köpt.');
      ui.view = 'dag';
    },
    'del-size'(el) { S.update((n) => { n.sizes = n.sizes.filter((s) => s.id !== el.dataset.id); }); toast('Storlek borttagen.', true); },

    prep(el) { commit([{ op: el.dataset.done === '1' ? 'prep.undone' : 'prep.done', date: U.dateKey(new Date()), key: el.dataset.key }]); },
    'routine-item'(el) {
      commit([{ op: 'routine.item', date: el.dataset.date, routineId: el.dataset.routine,
        itemId: el.dataset.item, done: el.dataset.done !== '1' }]);
    },
    'routine-remove'(el) {
      const r = (S.state.routines || []).find((x) => x.id === el.dataset.id);
      if (r && confirm(`Ta bort rutinen "${r.name}"?`)) commit([{ op: 'routine.remove', id: r.id }]);
    },
    'pack-item'(el) {
      commit([{ op: 'pack.item', date: el.dataset.date, listId: el.dataset.list,
        itemId: el.dataset.item, done: el.dataset.done !== '1' }]);
    },
    'pack-reset'(el) { commit([{ op: 'pack.reset', date: el.dataset.date, listId: el.dataset.list }]); },
    'pack-remove'(el) {
      const l = (S.state.packLists || []).find((x) => x.id === el.dataset.id);
      if (l && confirm(`Ta bort packlistan "${l.name}"?`)) commit([{ op: 'pack.remove', id: l.id }]);
    },
    'rec-toggle'(el) { commit([{ op: 'recurring.toggle', id: el.dataset.id }]); },
    'rec-remove'(el) {
      const r = (S.state.recurring || []).find((x) => x.id === el.dataset.id);
      if (r && confirm(`Ta bort "${r.title}"?`)) commit([{ op: 'recurring.remove', id: r.id }]);
    },

    example(el) { ui.draft = el.dataset.text; ui.view = 'berat'; },
    interpret() { runInterpret(); return true; },
    dictate() { startDictation(); return true; },
    'clear-proposal'() { ui.proposal = null; ui.draft = ''; },
    pick(el) { if (ui.proposal) ui.proposal.picks = Object.assign({}, ui.proposal.picks, { [el.dataset.q]: el.dataset.o }); },
    accept() {
      const p = ui.proposal;
      if (!p) return;
      const ops = [...p.ops];
      for (const q of p.questions) {
        const choice = (p.picks || {})[q.id];
        if (!choice || choice === '__skip__') continue;
        const opt = q.options.find((o) => o.id === choice);
        if (opt) ops.push(...opt.ops);
      }
      if (!ops.length) { toast('Inget valt.'); return; }
      const result = commit(ops, `${ops.length} ${ops.length === 1 ? 'ändring' : 'ändringar'} gjorda.`);
      if (result.applied.length) { ui.proposal = null; ui.draft = ''; ui.view = 'dag'; }
    },

    undo() { if (S.undo()) toast('Ångrat.'); },
    'dismiss-toast'() { toastEl.innerHTML = ''; return true; },

    'del-child'(el) {
      const c = M.childById(S.state, el.dataset.id);
      if (!c || !confirm(`Ta bort ${c.name}? Behov, storlekar och packlistor för ${c.name} tas också bort.`)) return;
      S.update((n) => {
        n.children = n.children.filter((x) => x.id !== c.id);
        n.needs = n.needs.filter((x) => x.childId !== c.id);
        n.sizes = n.sizes.filter((x) => x.childId !== c.id);
        n.packLists = (n.packLists || []).filter((x) => x.childId !== c.id);
      });
      toast('Borttaget.', true);
    },
    tpl(el) {
      S.update((n) => {
        const day = n.weekTemplate[el.dataset.day] || { work: 'okand', children: 'okand' };
        day[el.dataset.key] = el.dataset.value;
        n.weekTemplate[el.dataset.day] = day;
      });
    },
    'del-own'(el) { S.update((n) => { n.settings.ownTime.splice(Number(el.dataset.index), 1); }); toast('Borttaget.', true); },
    'toggle-ai'() { S.update((n) => { n.settings.aiOptIn = n.settings.aiOptIn === false; }); },
    export() {
      navigator.clipboard?.writeText(S.exportJson())
        .then(() => toast('Kopierat till urklipp.'))
        .catch(() => toast('Kunde inte kopiera automatiskt.'));
    },
    async erase() {
      if (!confirm('Radera allt? Barn, behov, uppgifter, rutiner och storlekar tas bort permanent. Detta går inte att ångra.')) return;
      if (!confirm('Är du helt säker? Uppgifterna går inte att få tillbaka.')) return;
      await S.eraseAll();
      ui.view = 'dag';
      toast('Allt raderat.');
    },
  };

  /* ═══════════ diktering ═══════════ */

  function startDictation() {
    const Ctor = root.SpeechRecognition || root.webkitSpeechRecognition;
    if (!Ctor) { toast('Diktering finns inte i den här webbläsaren. Använd tangentbordets mikrofon.'); return; }
    try {
      const rec = new Ctor();
      rec.lang = 'sv-SE';
      rec.interimResults = false;
      rec.continuous = false;
      toast('Lyssnar … tala nu.');
      rec.onresult = (event) => {
        const said = Array.from(event.results).map((r) => r[0].transcript).join(' ').trim();
        if (said) {
          ui.draft = (ui.draft ? `${ui.draft} ${said}` : said).trim();
          toastEl.innerHTML = '';
          render();
        }
      };
      rec.onerror = () => toast('Dikteringen kom inte igång. Använd tangentbordets mikrofon.');
      rec.start();
    } catch (e) {
      toast('Diktering går inte att starta här. Använd tangentbordets mikrofon.');
    }
  }

  /* ═══════════ rendering ═══════════ */

  function render() {
    const state = S.state;
    if (!state) return;
    ui.now = new Date();
    const views = {
      dag: renderDag, vecka: renderVecka, berat: renderBerat,
      barn: renderBarn, kvall: renderKvall, vantar: renderVantar,
      installningar: renderSettings,
    };
    app.innerHTML = (views[ui.view] || renderDag)(state);

    navEl.innerHTML = VIEWS.map((v) => `<button class="${ui.view === v.id ? 'on' : ''}"
      data-action="nav" data-view="${v.id}" aria-current="${ui.view === v.id}">
      ${icon(v.icon, 21)}<span>${esc(v.label)}</span></button>`).join('');

    renderSheet();

    const tell = document.getElementById('tell');
    if (tell) {
      tell.value = ui.draft;
      tell.addEventListener('input', (e) => { ui.draft = e.target.value; });
    }
  }

  document.addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]');
    if (!el) return;
    const fn = ACTIONS[el.dataset.action];
    if (!fn) return;
    event.preventDefault();
    if (!fn(el, event)) render();
  });

  S.onChange(render);
  render();

  S.init().then(() => { render(); return MV.ai.probe(); })
    .then(() => { ui.aiStatus = MV.ai.status(); render(); })
    .catch(() => { ui.aiStatus = MV.ai.status(); render(); });

  setInterval(() => { if (!ui.proposal && !ui.sheet) render(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !ui.sheet) render(); });
})(typeof globalThis !== 'undefined' ? globalThis : this);
