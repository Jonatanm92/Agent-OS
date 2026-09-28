/* Aura — Life: the everyday systems behind the day. Inbox, shopping, admin, home. */
(function (root) {
  const A = root.Aura;
  const U = A.util, I = A.i18n, M = A.model, It = A.items, S = A.store, icon = A.icon;
  const UI = A.ui, V = A.views;
  const { esc, t } = UI;

  I.add({
    'life.title': ['Livet', 'Life'],
    'life.eyebrow': ['Det Aura håller reda på åt dig', 'What Aura keeps track of for you'],
    'life.inbox': ['Inkorg', 'Inbox'],
    'life.inboxSub': ['{n} att sortera|{n} att sortera', '{n} to sort|{n} to sort'],
    'life.inboxEmpty': ['Tom', 'Empty'],
    'life.shopping': ['Handla', 'Shopping'],
    'life.shoppingSub': ['{n} på listan|{n} på listan', '{n} on the list|{n} on the list'],
    'life.admin': ['Ärenden', 'Life admin'],
    'life.adminSub': ['{n} behöver göras|{n} behöver göras', '{n} needs action|{n} need action'],
    'life.home': ['Hemmet', 'Home'],
    'life.homeSub': ['{n} dags nu|{n} dags nu', '{n} due now|{n} due now'],
    'life.projects': ['Projekt', 'Projects'],
    'life.projectsSub': ['{n} pågår|{n} pågår', '{n} ongoing|{n} ongoing'],
    'life.routines': ['Rutiner', 'Routines'],
    'life.routinesSub': ['{n} rutin|{n} rutiner', '{n} routine|{n} routines'],
    'life.evening': ['Kvällsavstämning', 'Evening reset'],
    'life.review': ['Veckogenomgång', 'Weekly review'],
    'life.cycle': ['Cykel', 'Cycle'],
    'life.reflect': ['Reflektion', 'Reflection'],
    'life.settings': ['Inställningar', 'Settings'],
    'life.none': ['Inget än', 'Nothing yet'],

    'inbox.title': ['Inkorg', 'Inbox'],
    'inbox.eyebrow': ['Fångat men inte sorterat. Ingen brådska.', 'Captured, not sorted. No rush.'],
    'inbox.empty': ['Inget väntar på att sorteras.', 'Nothing is waiting to be sorted.'],
    'inbox.sortAll': ['Sortera allt åt mig', 'Sort all of it for me'],
    'inbox.suggest': ['Förslag: {kind}', 'Suggested: {kind}'],
    'inbox.keep': ['Ok', 'OK'],
    'inbox.other': ['Annat …', 'Other …'],
    'inbox.sorted': ['{n} sak sorterad.|{n} saker sorterade.', '{n} thing sorted.|{n} things sorted.'],

    'shop.title': ['Handla', 'Shopping'],
    'shop.addPh': ['Lägg till på listan …', 'Add to the list …'],
    'shop.empty': ['Listan är tom.', 'The list is empty.'],
    'shop.usuals': ['Brukar köpas', 'Usuals'],
    'shop.bought': ['Nyss köpt', 'Just bought'],
    'shop.category': ['Kategori', 'Category'],
    'shop.cat.produce': ['Frukt och grönt', 'Fruit & veg'],
    'shop.cat.dairy': ['Mejeri och ägg', 'Dairy & eggs'],
    'shop.cat.bread': ['Bröd', 'Bread'],
    'shop.cat.meat': ['Kött, fisk och vegetariskt', 'Meat, fish & veggie'],
    'shop.cat.pantry': ['Skafferi', 'Pantry'],
    'shop.cat.frozen': ['Fryst', 'Frozen'],
    'shop.cat.drinks': ['Dryck', 'Drinks'],
    'shop.cat.household': ['Hushåll', 'Household'],
    'shop.cat.hygiene': ['Hygien', 'Toiletries'],
    'shop.cat.pharmacy': ['Apotek', 'Pharmacy'],
    'shop.cat.baby': ['Barn och bebis', 'Baby & kids'],
    'shop.cat.clothing': ['Kläder och skor', 'Clothes & shoes'],
    'shop.cat.pets': ['Djur', 'Pets'],
    'shop.cat.other': ['Övrigt', 'Other'],

    'adm.title': ['Ärenden', 'Life admin'],
    'adm.eyebrow': ['Samtal, blanketter, betalningar, leveranser', 'Calls, forms, payments, deliveries'],
    'adm.addPh': ['Nytt ärende, t.ex. ”Förnya passet senast 1 dec”', 'New admin, e.g. "Renew passport by 1 Dec"'],
    'adm.action': ['Behöver göras', 'Needs action'],
    'adm.waiting': ['Väntar på svar', 'Waiting'],
    'adm.later': ['Följ upp senare', 'Follow up later'],
    'adm.empty': ['Inga ärenden. Skönt.', 'No admin. Nice.'],
    'adm.toWaiting': ['Väntar', 'Waiting'],
    'adm.followUpOn': ['följ upp {when}', 'follow up {when}'],

    'hm.title': ['Hemmet', 'Home'],
    'hm.eyebrow': ['Aura minns det tråkiga som återkommer', 'Aura remembers the boring recurring things'],
    'hm.empty': ['Inget återkommande än. Välj några vanliga nedan — Aura håller koll på när det är dags.', 'Nothing recurring yet. Pick a few common ones below — Aura keeps track of when they are due.'],
    'hm.add': ['Lägg till', 'Add'],
    'hm.suggestions': ['Vanliga saker', 'Common ones'],
    'hm.custom': ['Något eget …', 'Something else …'],
    'hm.customPh': ['t.ex. Rensa kylen varje vecka', 'e.g. Clear out the fridge every week'],
    'hm.overdue': ['{n} dag sen|{n} dagar sen', '{n} day late|{n} days late'],
    'hm.dueToday': ['Dags i dag', 'Due today'],
    'hm.dueIn': ['om {n} dag|om {n} dagar', 'in {n} day|in {n} days'],
    'hm.noDate': ['Ingen dag satt', 'No date set'],
    'hm.lastDone': ['senast {when}', 'last {when}'],
  });

  /* Recurring household things Aura can remember. Added only when chosen. */
  const CHORES = {
    sv: [['Tvätt', 'day', 3, 5, 'light', true], ['Byta lakan', 'week', 2, 15, 'medium'], ['Städa badrummet', 'week', 1, 40, 'heavy'], ['Dammsuga', 'week', 1, 20, 'medium'],
      ['Sopor och återvinning', 'week', 1, 10, 'light'], ['Vattna blommorna', 'day', 4, 5, 'light'], ['Torka av kylskåpet', 'month', 1, 15, 'medium'], ['Avkalka vattenkokaren', 'month', 2, 10, 'light'],
      ['Byt tandborsthuvud', 'month', 3, 2, 'light'], ['Kolla brandvarnaren', 'month', 6, 5, 'light']],
    en: [['Laundry', 'day', 3, 5, 'light', true], ['Change the bedding', 'week', 2, 15, 'medium'], ['Clean the bathroom', 'week', 1, 40, 'heavy'], ['Vacuum', 'week', 1, 20, 'medium'],
      ['Rubbish and recycling', 'week', 1, 10, 'light'], ['Water the plants', 'day', 4, 5, 'light'], ['Wipe out the fridge', 'month', 1, 15, 'medium'], ['Descale the kettle', 'month', 2, 10, 'light'],
      ['Replace toothbrush head', 'month', 3, 2, 'light'], ['Test the smoke alarm', 'month', 6, 5, 'light']],
  };

  function hubRow(ic, title, sub, view) {
    return `<button class="row link-row" data-action="go" data-view="${view}">${icon(ic, 21)}<span class="row-main"><span class="title">${esc(title)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</span>${icon('chevron', 18)}</button>`;
  }

  UI.view('life', {
    render(state) {
      const key = UI.today();
      const c = It.counts(state, key);
      const mod = (m) => M.moduleOn(state, m);
      const rows = [];
      rows.push(hubRow('inbox', t('life.inbox'), c.inbox ? t('life.inboxSub', { n: c.inbox }) : t('life.inboxEmpty'), 'inbox'));
      if (mod('shopping')) rows.push(hubRow('cart', t('life.shopping'), c.shopping ? t('life.shoppingSub', { n: c.shopping }) : t('shop.empty'), 'shopping'));
      if (mod('admin')) rows.push(hubRow('admin', t('life.admin'), c.adminAction ? t('life.adminSub', { n: c.adminAction }) : t('life.none'), 'admin'));
      if (mod('home')) rows.push(hubRow('home', t('life.home'), c.choresDue ? t('life.homeSub', { n: c.choresDue }) : t('life.none'), 'household'));
      if (mod('projects')) rows.push(hubRow('project', t('life.projects'), c.projects ? t('life.projectsSub', { n: c.projects }) : t('life.none'), 'projects'));
      if (mod('routines')) rows.push(hubRow('routine', t('life.routines'), state.routines.length ? t('life.routinesSub', { n: state.routines.length }) : t('life.none'), 'routines'));
      const rhythm = [hubRow('moon', t('life.evening'), '', 'evening'), hubRow('review', t('life.review'), '', 'review')];
      const personal = [];
      if (mod('cycle')) personal.push(hubRow('cycle', t('life.cycle'), '', 'cycle'));
      if (mod('reflection')) personal.push(hubRow('reflect', t('life.reflect'), '', 'reflect'));
      return `<header class="top"><div class="grow"><div class="eyebrow">${esc(t('life.eyebrow'))}</div><h1>${esc(t('life.title'))}</h1></div></header>
        <div class="panel">${rows.join('')}</div>
        <div class="panel gap-top">${rhythm.join('')}</div>
        ${personal.length ? `<div class="panel gap-top">${personal.join('')}</div>` : ''}
        <div class="panel gap-top">${hubRow('settings', t('life.settings'), S.statusText(), 'settings')}</div>`;
    },
  });

  /* ---------------- Inbox ---------------- */

  UI.view('inbox', {
    tab: 'life',
    render(state) {
      const items = It.inbox(state);
      return `${UI.backHeader(t('inbox.title'), t('inbox.eyebrow'))}
        ${items.length ? `<div class="panel">${items.map((i) => {
          const guess = A.parse.parse(state, i.title, UI.ui.now).candidates[0];
          const kind = guess ? guess.kind : 'task';
          return `<div class="row item stack-row"><button class="row-main" data-action="item-open" data-id="${esc(i.id)}"><span class="title">${esc(i.title)}</span>
            <span class="sub">${esc(t('inbox.suggest', { kind: t(`kind.${kind}`) }))}</span></button>
            <div class="btnrow tight"><button class="btn tiny primary" data-action="inbox-accept" data-id="${esc(i.id)}" data-kind="${esc(kind)}">${esc(t('inbox.keep'))}</button>
            <button class="btn tiny ghost" data-action="item-open" data-id="${esc(i.id)}">${esc(t('inbox.other'))}</button>
            <button class="btn tiny quiet" data-action="item-delete" data-id="${esc(i.id)}">${esc(t('a.delete'))}</button></div></div>`;
        }).join('')}</div>
        <button class="btn ghost wide gap-top" data-action="inbox-all">${esc(t('inbox.sortAll'))}</button>` : `<p class="calm-line pad">${esc(t('inbox.empty'))}</p>`}`;
    },
  });

  function processOp(state, item) {
    const c = A.parse.parse(state, item.title, new Date()).candidates[0];
    if (!c) return { op: 'item.process', id: item.id, patch: { kind: 'task' } };
    const patch = { kind: c.kind === 'event' ? 'task' : c.kind, title: c.title, category: c.category, date: c.date, dueDate: c.dueDate, time: c.time,
      minutes: c.minutes, energy: c.energy, context: c.context, background: c.background, recur: c.recur, adminStatus: c.adminStatus, forPerson: c.forPerson };
    return { op: 'item.process', id: item.id, patch };
  }

  UI.action('inbox-accept', (el) => {
    const item = M.itemById(S.state, el.dataset.id);
    if (item) UI.commit([processOp(S.state, item)]);
  });
  UI.action('inbox-all', () => {
    const ops = It.inbox(S.state).map((i) => processOp(S.state, i));
    UI.commit(ops, { message: t('inbox.sorted', { n: ops.length }) });
  });

  /* ---------------- Shopping ---------------- */

  UI.view('shopping', {
    tab: 'life',
    render(state) {
      const list = It.shoppingList(state);
      const key = UI.today();
      const recent = state.items.filter((i) => i.kind === 'shopping' && i.status === 'done' && A.items.doneOn(i, key) && !i.staple);
      return `${UI.backHeader(t('shop.title'))}
        <div class="quickadd">
          <label class="sr" for="shop-add">${esc(t('shop.addPh'))}</label>
          <input id="shop-add" class="input" data-model="shop.add" data-enter="shop-add" placeholder="${esc(t('shop.addPh'))}" value="${esc(UI.draft('shop.add'))}" autocomplete="off" enterkeyhint="done">
          ${V.voiceButton('shop.add')}
          <button class="icon-btn solid" data-action="shop-add" aria-label="${esc(t('a.add'))}">${icon('plus', 22)}</button>
        </div>
        ${list.count ? list.groups.map((g) => `<section class="section">${UI.sectionHead(t(`shop.cat.${g.category}`), `<span class="count mono">${g.items.length}</span>`)}
          <div class="panel">${g.items.map((i) => UI.itemRow(i, { noKindTag: true, meta: [i.forPerson ? t('meta.for', { name: i.forPerson }) : '', i.date ? I.relativeDay(i.date, key) : ''].filter(Boolean).join(' · ') })).join('')}</div></section>`).join('')
          : `<p class="calm-line pad">${esc(t('shop.empty'))}</p>`}
        ${list.usuals.length ? `<section class="section">${UI.sectionHead(t('shop.usuals'))}<div class="chips">${list.usuals.map((u) => `<button class="chip" data-action="shop-usual" data-id="${esc(u.id)}">${icon('plus', 14)}${esc(u.title)}</button>`).join('')}</div></section>` : ''}
        ${recent.length ? `<section class="section">${UI.sectionHead(t('shop.bought'))}<div class="panel soft">${recent.map((i) => UI.itemRow(i, { meta: '', noKindTag: true })).join('')}</div></section>` : ''}`;
    },
  });

  UI.action('shop-add', () => {
    const text = UI.draft('shop.add').trim();
    if (!text) return true;
    UI.clearDraft('shop.add');
    const parts = text.split(/,|\s+(?:and|och)\s+/i).map((s) => s.trim()).filter(Boolean);
    const ops = parts.map((p) => {
      const when = A.parse.extractWhen(p, UI.today());
      const title = A.parse.cleanTitle(A.parse.stripLeads(when.rest).replace(/^(buy|köp|köpa)\s+/i, '')) || A.parse.cleanTitle(p);
      return { op: 'item.add', item: { kind: 'shopping', title, category: A.parse.productCategory(title) || 'other', date: when.date, source: 'manual' } };
    });
    UI.commit(ops);
  });
  UI.action('shop-usual', (el) => { UI.commit([{ op: 'item.reopen', id: el.dataset.id, date: '' }]); });

  /* ---------------- Life admin ---------------- */

  UI.view('admin', {
    tab: 'life',
    render(state) {
      const key = UI.today();
      const l = It.adminList(state, key);
      const row = (i, trailing) => UI.itemRow(i, {
        trailing,
        meta: [UI.itemMeta(i), i.followUp && i.adminStatus !== 'action' ? t('adm.followUpOn', { when: I.relativeDay(i.followUp, key) }) : ''].filter(Boolean).join(' · '),
      });
      const sec = (label, list, trailingFn) => (list.length ? `<section class="section">${UI.sectionHead(label, `<span class="count mono">${list.length}</span>`)}<div class="panel">${list.map((i) => row(i, trailingFn ? trailingFn(i) : '')).join('')}</div></section>` : '');
      return `${UI.backHeader(t('adm.title'), t('adm.eyebrow'))}
        <div class="quickadd">
          <label class="sr" for="adm-add">${esc(t('adm.addPh'))}</label>
          <input id="adm-add" class="input" data-model="adm.add" data-enter="adm-add" placeholder="${esc(t('adm.addPh'))}" value="${esc(UI.draft('adm.add'))}" autocomplete="off" enterkeyhint="done">
          <button class="icon-btn solid" data-action="adm-add" aria-label="${esc(t('a.add'))}">${icon('plus', 22)}</button>
        </div>
        ${sec(t('adm.action'), l.action, (i) => `<button class="btn tiny ghost" data-action="adm-wait" data-id="${esc(i.id)}">${esc(t('adm.toWaiting'))}</button>`)}
        ${sec(t('adm.waiting'), l.waiting)}
        ${sec(t('adm.later'), l.later)}
        ${!l.action.length && !l.waiting.length && !l.later.length ? `<p class="calm-line pad">${esc(t('adm.empty'))}</p>` : ''}`;
    },
  });

  UI.action('adm-add', () => {
    const text = UI.draft('adm.add').trim();
    if (!text) return true;
    UI.clearDraft('adm.add');
    const c = A.parse.quick(S.state, text, new Date());
    c.kind = 'admin';
    c.adminStatus = 'action';
    if (!c.category) c.category = 'other';
    UI.commit([A.parse.toOp(c, { today: UI.today(), source: 'manual' })]);
  });
  UI.action('adm-wait', (el) => { UI.commit([{ op: 'item.admin', id: el.dataset.id, adminStatus: 'waiting' }]); });

  /* ---------------- Home (household) ---------------- */

  UI.view('household', {
    tab: 'life',
    render(state) {
      const key = UI.today();
      const chores = It.choresList(state, key);
      const lang = I.language() === 'sv' ? 'sv' : 'en';
      const have = new Set(chores.map((c) => U.normalize(c.item.title)));
      const suggestions = CHORES[lang].filter((c) => !have.has(U.normalize(c[0])));
      const due = (c) => {
        if (c.dueIn == null) return t('hm.noDate');
        if (c.dueIn < 0) return t('hm.overdue', { n: -c.dueIn });
        if (c.dueIn === 0) return t('hm.dueToday');
        return t('hm.dueIn', { n: c.dueIn });
      };
      return `${UI.backHeader(t('hm.title'), t('hm.eyebrow'))}
        ${chores.length ? `<div class="panel">${chores.map((c) => UI.itemRow(c.item, {
          meta: [due(c), A.items.describeRecur(c.item.recur), c.item.lastDone ? t('hm.lastDone', { when: I.relativeDay(c.item.lastDone, key) }) : ''].filter(Boolean).join(' · '),
        }).replace('class="row item', `class="row item${c.dueIn != null && c.dueIn <= 0 ? ' due' : ''}`)).join('')}</div>`
          : `<p class="muted pad">${esc(t('hm.empty'))}</p>`}
        ${suggestions.length ? `<section class="section">${UI.sectionHead(t('hm.suggestions'))}
          <div class="chips">${suggestions.map((c) => `<button class="chip" data-action="hm-add" data-title="${esc(c[0])}" data-unit="${c[1]}" data-every="${c[2]}" data-min="${c[3]}" data-energy="${c[4]}" data-bg="${c[5] ? 1 : 0}">${icon('plus', 14)}${esc(c[0])} <span class="faint">· ${esc(A.items.describeRecur({ unit: c[1], every: c[2] }))}</span></button>`).join('')}</div></section>` : ''}
        <section class="section">${UI.sectionHead(t('hm.custom'))}
          <div class="quickadd"><label class="sr" for="hm-custom">${esc(t('hm.custom'))}</label>
            <input id="hm-custom" class="input" data-model="hm.custom" data-enter="hm-custom" placeholder="${esc(t('hm.customPh'))}" value="${esc(UI.draft('hm.custom'))}">
            <button class="icon-btn solid" data-action="hm-custom" aria-label="${esc(t('a.add'))}">${icon('plus', 22)}</button></div></section>`;
    },
  });

  UI.action('hm-add', (el) => {
    const d = el.dataset;
    UI.commit([{ op: 'item.add', item: { kind: 'chore', title: d.title, category: 'home', context: 'home', recur: { unit: d.unit, every: Number(d.every) },
      dueDate: UI.today(), minutes: Number(d.min), energy: d.energy, background: d.bg === '1', source: 'template' } }]);
  });
  UI.action('hm-custom', () => {
    const text = UI.draft('hm.custom').trim();
    if (!text) return true;
    UI.clearDraft('hm.custom');
    const c = A.parse.quick(S.state, text, new Date());
    UI.commit([{ op: 'item.add', item: { kind: 'chore', title: c.title, category: 'home', context: 'home', recur: c.recur || { unit: 'week', every: 1 },
      dueDate: c.date || c.dueDate || UI.today(), minutes: c.minutes, energy: c.energy, background: c.background, source: 'manual' } }]);
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
