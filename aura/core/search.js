/* Aura — Ask Aura (deterministic life search).
 *
 * Most questions about your own life are database questions: what to buy,
 * what is waiting, what is due before Friday. Those are answered here,
 * instantly and exactly, without AI. Only open-ended questions go to the
 * coach (and only when AI is available and allowed).
 */
(function (root) {
  const A = root.Aura || (root.Aura = {});
  const U = A.util, M = A.model, It = A.items, I = A.i18n;

  I.add({
    'ask.shopping': ['Det här står på inköpslistan', "Here's what's on the shopping list"],
    'ask.shoppingEmpty': ['Inköpslistan är tom.', 'The shopping list is empty.'],
    'ask.postponed': ['Det här har du skjutit upp', "Here's what you've put off"],
    'ask.postponedWeek': ['Uppskjutet den här veckan', 'Put off this week'],
    'ask.postponedEmpty': ['Inget har skjutits upp nyligen.', 'Nothing has been put off recently.'],
    'ask.waiting': ['Det här väntar du på', "Here's what you're waiting for"],
    'ask.waitingEmpty': ['Du väntar inte på något just nu.', "You're not waiting on anything right now."],
    'ask.before': ['Att göra före {when}', 'To do before {when}'],
    'ask.beforeEmpty': ['Inget behöver bli klart före {when}.', 'Nothing needs to be done before {when}.'],
    'ask.today': ['I dag', 'Today'],
    'ask.todayEmpty': ['Inget står på planen i dag.', "Nothing's on the plan today."],
    'ask.tomorrow': ['I morgon', 'Tomorrow'],
    'ask.tomorrowEmpty': ['Inget planerat i morgon ännu.', 'Nothing planned for tomorrow yet.'],
    'ask.forgotten': ['Sådant som kan ha glömts bort', 'Things that may have slipped'],
    'ask.forgottenEmpty': ['Jag hittar inget som verkar ha glömts bort.', "I can't find anything that seems to have slipped."],
    'ask.done': ['Klart', 'Done'],
    'ask.doneEmpty': ['Inget markerat som klart än.', 'Nothing marked done yet.'],
    'ask.canMove': ['Det här kan flyttas utan problem', 'These can move without trouble'],
    'ask.canMoveEmpty': ['Allt som är kvar i dag verkar viktigt.', 'Everything left today looks important.'],
    'ask.found': ['Det här hittade jag', "Here's what I found"],
    'ask.nothing': ['Jag hittade inget som matchar.', "I couldn't find anything that matches."],
    'ask.now': ['Nu', 'Now'],
    'ask.nowEmpty': ['Inget brådskar just nu.', 'Nothing urgent right now.'],
    'ask.projects': ['Pågående projekt', 'Ongoing projects'],
    'ask.projectsEmpty': ['Inga pågående projekt.', 'No ongoing projects.'],
  });

  const STOP = new Set(('what was i supposed to the a an for my did plan planned about is are do have has of in on to and with ' +
    'vad var jag skulle den det en ett för min mitt mina planerat om är har till och med på i att som').split(' '));

  const WD = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
    söndag: 0, måndag: 1, tisdag: 2, onsdag: 3, torsdag: 4, fredag: 5, lördag: 6 };

  function tokens(q) {
    return U.normalize(q).split(' ').filter((w) => w.length > 1 && !STOP.has(w));
  }

  function textSearch(state, q) {
    const toks = tokens(q);
    if (!toks.length) return [];
    const scored = [];
    const test = (text) => { const n = U.normalize(text); return toks.reduce((s, t) => s + (n.includes(t) ? 1 : 0), 0); };
    for (const item of state.items) {
      if (item.status === 'dropped') continue;
      const s = test(`${item.title} ${item.note} ${item.forPerson}`) * 2 + (item.projectId ? test((M.projectById(state, item.projectId) || {}).title || '') : 0);
      if (s > 0) scored.push({ type: 'item', item, s: s + (item.status === 'open' ? 1 : 0) });
    }
    for (const p of state.projects) {
      const s = test(`${p.title} ${p.outcome}`) * 2;
      if (s > 0) scored.push({ type: 'project', project: p, s: s + 1 });
    }
    for (const e of state.events) {
      const s = test(`${e.title} ${e.location}`) * 2;
      if (s > 0) scored.push({ type: 'event', event: e, s });
    }
    return scored.sort((a, b) => b.s - a.s).slice(0, 20);
  }

  /**
   * @returns {{intent, title, items, events?, projects?, rec?, empty}}
   */
  function ask(state, query, now) {
    const q = ` ${U.normalize(query)} `;
    const today = U.dateKey(now);
    const has = (re) => re.test(q);
    const res = (intent, titleKey, items, emptyKey, extra) => Object.assign({ intent, title: I.t(titleKey, extra && extra.params), items, empty: I.t(emptyKey, extra && extra.params) }, extra || {});

    if (has(/(buy|shopping|groceries|grocery|shop list|köpa|handla|inköp|affären)/u)) {
      const list = It.shoppingList(state);
      return res('shopping', 'ask.shopping', list.groups.flatMap((g) => g.items), 'ask.shoppingEmpty');
    }
    if (has(/(postpon|put off|moved|pushed|skjutit upp|skjuter upp|skjuta upp|flyttat|flyttar)/u)) {
      const week = has(/(this week|den här veckan|i veckan)/u);
      const from = week ? U.startOfWeek(today) : U.addDays(today, -30);
      const ids = U.uniq(state.log.filter((l) => l.ev === 'postpone' && l.d >= from && l.id).map((l) => l.id));
      const items = ids.map((id) => M.itemById(state, id)).filter((i) => i && i.status === 'open');
      return res('postponed', week ? 'ask.postponedWeek' : 'ask.postponed', items, 'ask.postponedEmpty');
    }
    if (has(/(waiting|wait for|waiting for|väntar)/u)) {
      return res('waiting', 'ask.waiting', It.adminList(state, today).waiting, 'ask.waitingEmpty');
    }
    const beforeM = /(before|by|until|innan|före|senast|till)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|söndag|måndag|tisdag|onsdag|torsdag|fredag|lördag|tomorrow|i morgon|imorgon|the weekend|helgen)/u.exec(q);
    if (beforeM) {
      const w = beforeM[2];
      let until;
      if (/tomorrow|morgon/.test(w)) until = U.addDays(today, 1);
      else if (/weekend|helgen/.test(w)) until = U.nextWeekday(today, 6, true);
      else until = U.nextWeekday(today, WD[w], true);
      const items = state.items.filter((i) => i.status === 'open' && ['task', 'admin', 'chore', 'reminder', 'shopping'].includes(i.kind)
        && ((i.dueDate && i.dueDate <= until) || (i.date && i.date <= until && i.date >= today) || (It.classify(state, i, today) === 'must')))
        .sort((a, b) => (a.dueDate || a.date || '9').localeCompare(b.dueDate || b.date || '9'));
      const when = I.relativeDay(until, today);
      return res('before', 'ask.before', items, 'ask.beforeEmpty', { params: { when } });
    }
    if (has(/(forgot|forget|forgotten|missed|slipped|glömt|glömmer|missat)/u)) {
      const b = It.dayBuckets(state, today);
      const overdue = state.items.filter((i) => i.status === 'open' && i.dueDate && i.dueDate < today);
      const oldInbox = It.inbox(state).filter((i) => U.daysBetween(String(i.createdAt).slice(0, 10), today) >= 3);
      const followUps = It.adminList(state, today).waiting.filter((i) => i.followUp && i.followUp <= today);
      const carried = b.later.filter((i) => It.isCarried(i, today));
      const reminders = b.must.filter((i) => i.kind === 'reminder');
      const items = U.uniq([...overdue, ...reminders, ...followUps, ...carried, ...oldInbox].map((i) => i.id)).map((id) => M.itemById(state, id));
      return res('forgotten', 'ask.forgotten', items.slice(0, 15), 'ask.forgottenEmpty');
    }
    if (has(/(what should i do|what do i do|what now|what first|do first|vad ska jag göra|vad gör jag|vad nu|först)/u)) {
      const rec = A.engine.whatNow(state, now);
      return res('now', 'ask.now', rec ? [rec.item] : [], 'ask.nowEmpty', { rec });
    }
    if (has(/(what can (i )?move|can wait|move until tomorrow|move to tomorrow|vad kan (jag )?flytta|kan vänta|flytta till i morgon)/u)) {
      const b = It.dayBuckets(state, today);
      const movable = b.good.filter((i) => !(i.dueDate && i.dueDate <= today));
      return res('canMove', 'ask.canMove', movable, 'ask.canMoveEmpty');
    }
    const planQuestion = has(/(plan|planned|planning|planerat|planerade|planera)/u);
    if (!planQuestion && has(/(done|did i|finished|accomplished|klart|gjort|avklarat|fick jag)/u)) {
      const week = has(/(week|veckan|vecka)/u);
      const from = week ? U.startOfWeek(today) : today;
      const ids = U.uniq(state.log.filter((l) => l.ev === 'done' && l.d >= from && l.id).map((l) => l.id));
      return res('done', 'ask.done', ids.map((id) => M.itemById(state, id)).filter(Boolean), 'ask.doneEmpty');
    }
    if (has(/(tomorrow|i morgon|imorgon)/u)) {
      const b = It.dayBuckets(state, U.addDays(today, 1));
      const events = A.planner.fixedFor(state, U.addDays(today, 1)).fixed;
      return res('tomorrow', 'ask.tomorrow', [...b.must, ...b.good, ...state.items.filter((i) => i.status === 'open' && i.date === U.addDays(today, 1) && !b.must.includes(i) && !b.good.includes(i))], 'ask.tomorrowEmpty', { events });
    }
    if (has(/(today|i dag|idag)/u) && has(/(what|vad|plan)/u)) {
      const b = It.dayBuckets(state, today);
      return res('today', 'ask.today', [...b.must, ...b.good], 'ask.todayEmpty', { events: A.planner.fixedFor(state, today).fixed });
    }
    if (has(/(projects?|projekt)/u) && !tokens(query.replace(/projects?|projekt/giu, '')).length) {
      return res('projects', 'ask.projects', [], 'ask.projectsEmpty', { projects: state.projects.filter((p) => p.status === 'active') });
    }
    const found = textSearch(state, query);
    return res('search', 'ask.found', found.filter((f) => f.type === 'item').map((f) => f.item), 'ask.nothing', {
      projects: found.filter((f) => f.type === 'project').map((f) => f.project),
      eventsFound: found.filter((f) => f.type === 'event').map((f) => f.event),
      matched: found.length,
    });
  }

  /** Is this a question Aura can answer exactly without AI? */
  function isKnownIntent(result) { return result && result.intent !== 'search'; }

  A.search = { ask, textSearch, tokens, isKnownIntent };
})(typeof globalThis !== 'undefined' ? globalThis : this);
