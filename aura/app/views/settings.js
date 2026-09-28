/* Aura — Settings: preferences, areas, AI, privacy and data. */
(function (root) {
  const A = root.Aura;
  const U = A.util, I = A.i18n, M = A.model, S = A.store, PF = A.platform, icon = A.icon;
  const UI = A.ui;
  const { esc, t } = UI;

  I.add({
    'set.title': ['Inställningar', 'Settings'],
    'set.you': ['Du', 'You'],
    'set.name': ['Vad ska Aura kalla dig?', 'What should Aura call you?'],
    'set.namePh': ['Ditt namn (frivilligt)', 'Your name (optional)'],
    'set.language': ['Språk', 'Language'],
    'set.rhythm': ['Din rytm', 'Your rhythm'],
    'set.wake': ['Brukar vakna', 'Usually wake'],
    'set.sleep': ['Brukar sova', 'Usually sleep'],
    'set.workDays': ['Arbetsdagar', 'Workdays'],
    'set.workHours': ['Arbetstider', 'Working hours'],
    'set.noHours': ['Inga fasta arbetstider', 'No fixed working hours'],
    'set.hasHours': ['Fasta tider', 'Fixed hours'],
    'set.from': ['Från', 'From'],
    'set.to': ['Till', 'To'],
    'set.commute': ['Restid kring saker hemifrån', 'Travel time around things away from home'],
    'set.tz': ['Tidszon: {tz}', 'Time zone: {tz}'],
    'set.tzUse': ['Använd enhetens ({tz})', "Use this device's ({tz})"],
    'set.planning': ['Hur Aura planerar', 'How Aura plans'],
    'set.density': ['Hur full ska en dag vara?', 'How full should a day be?'],
    'set.d.light': ['Lätt', 'Light'],
    'set.d.balanced': ['Lagom', 'Balanced'],
    'set.d.full': ['Full', 'Full'],
    'set.dSub.light': ['Högst 2 måsten och 2 bra-om', 'At most 2 musts and 2 good-if-possible'],
    'set.dSub.balanced': ['Högst 3 måsten och 4 bra-om', 'At most 3 musts and 4 good-if-possible'],
    'set.dSub.full': ['Högst 5 måsten och 6 bra-om', 'At most 5 musts and 6 good-if-possible'],
    'set.tone': ['Ton', 'Tone'],
    'set.t.warm': ['Varm', 'Warm'],
    'set.t.direct': ['Rak', 'Direct'],
    'set.areas': ['Områden', 'Areas'],
    'set.areasLead': ['Visa bara det du vill att Aura hjälper till med.', 'Only show what you want Aura to help with.'],
    'set.m.shopping': ['Handla', 'Shopping'],
    'set.m.admin': ['Ärenden', 'Life admin'],
    'set.m.home': ['Hemmet', 'Home'],
    'set.m.projects': ['Projekt', 'Projects'],
    'set.m.routines': ['Rutiner', 'Routines'],
    'set.m.cycle': ['Cykel (valfri, privat logg)', 'Cycle (optional, private log)'],
    'set.m.reflection': ['Reflektion och Mystik', 'Reflection and Mystik'],
    'set.people': ['Personer', 'People'],
    'set.peopleLead': ['Namn du nämner ofta, så att Aura förstår ”jacka till Alva”. Används bara på den här enheten och skickas aldrig till AI.', 'Names you mention often, so Aura understands "jacket for Alva". Used only for recognising names; never sent to AI.'],
    'set.peoplePh': ['Namn', 'Name'],
    'set.ai': ['AI', 'AI'],
    'set.aiOn': ['Använd Aura AI', 'Use Aura AI'],
    'set.aiWhat': ['När AI används skickas bara det som behövs: titlar och tider från dagens plan, eller texten du ber Aura sortera. Aldrig anteckningar, reflektioner, cykeldata eller personlistan. AI körs på ditt eget Claude-konto och kräver ditt godkännande första gången.', 'When AI is used, only what is needed is sent: titles and times from today’s plan, or the text you ask Aura to sort. Never notes, reflections, cycle data or the people list. AI runs on your own Claude account and asks for your permission the first time.'],
    'set.aiStatusOn': ['Ansluten', 'Connected'],
    'set.aiStatusChecking': ['Kontrollerar …', 'Checking …'],
    'set.nudges': ['Påminnelser', 'Nudges'],
    'set.nudgesLead': ['Aura säger bara till när det finns ett beslut att ta. Visas i Aura — telefonnotiser finns inte här än.', 'Aura only speaks up when there is a decision to make. Shown inside Aura — phone notifications are not available here yet.'],
    'set.n.off': ['Av', 'Off'],
    'set.n.minimal': ['Lite', 'Minimal'],
    'set.n.helpful': ['Mer', 'Helpful'],
    'set.data': ['Dina uppgifter', 'Your data'],
    'set.storage': ['Lagring', 'Storage'],
    'set.storageCloud': ['Dina uppgifter ligger i din privata del av sidans lagring. Ingen annan — inte heller den som delade sidan — kan läsa dem.', 'Your data lives in your private part of this page’s storage. Nobody else — not even the person who shared the page — can read it.'],
    'set.storageLocal': ['Dina uppgifter ligger bara i den här webbläsaren på den här enheten.', 'Your data is only in this browser on this device.'],
    'set.storageMemory': ['Webbläsaren blockerar lagring, så inget sparas. Tillåt webbplatsdata för att behålla det du gör.', 'This browser blocks storage, so nothing is saved. Allow site data to keep what you do.'],
    'set.export': ['Kopiera en säkerhetskopia', 'Copy a backup'],
    'set.saveFile': ['Spara som fil', 'Save as a file'],
    'set.exportFallback': ['Markera texten och kopiera den:', 'Select the text and copy it:'],
    'set.import': ['Importera', 'Import'],
    'set.importLead': ['Klistra in en säkerhetskopia från Aura eller en export från Min vardag. Inget befintligt skrivs över — bara nytt läggs till.', 'Paste a backup from Aura or an export from Min vardag. Nothing existing is overwritten — only new things are added.'],
    'set.importCheck': ['Läs in', 'Read it'],
    'set.importPreview': ['{kind}: {items} saker, {events} tider, {routines} rutiner, {projects} projekt.', '{kind}: {items} items, {events} events, {routines} routines, {projects} projects.'],
    'set.importApply': ['Lägg till', 'Add them'],
    'set.importBad': ['Det där gick inte att läsa. Klistra in hela texten från exporten.', "That couldn't be read. Paste the whole text from the export."],
    'set.imported': ['Importerat.', 'Imported.'],
    'set.erase': ['Radera allt', 'Delete everything'],
    'set.eraseQ': ['Radera allt i Aura?', 'Delete everything in Aura?'],
    'set.eraseBody': ['Allt du lagt in tas bort för gott, här och i din lagring. Det går inte att ångra.', 'Everything you have added is removed for good, here and in your storage. This cannot be undone.'],
    'set.erased': ['Allt är raderat.', 'Everything is deleted.'],
    'set.about': ['Om Aura', 'About Aura'],
    'set.aboutText': ['Aura är en personlig vardagsassistent. Den planerar med dina egna uppgifter och hittar aldrig på något åt dig.', 'Aura is a personal everyday assistant. It plans with your own information and never makes things up for you.'],
    'set.restart': ['Gör introduktionen igen', 'Run the introduction again'],
    'set.saved': ['Sparat', 'Saved'],
  });

  const WEEK = [1, 2, 3, 4, 5, 6, 0];

  function section(title, body, lead) {
    return `<section class="section">${UI.sectionHead(title)}${lead ? `<p class="faint">${esc(lead)}</p>` : ''}<div class="stack">${body}</div></section>`;
  }

  const setState = { importText: '', preview: null, exportShown: false, downloads: null, downloadsChecked: false };

  UI.view('settings', {
    tab: 'life',
    enter() {
      if (!setState.downloadsChecked) {
        setState.downloadsChecked = true;
        PF.use('downloads', 4000).then((d) => { setState.downloads = d; if (UI.ui.view === 'settings') UI.render(); });
      }
    },
    render(state) {
      const p = state.prefs;
      const hours = M.hasWorkHours(state) || setState.hoursOpen;
      const ai = A.ai.status(state);
      const deviceTz = U.deviceTimeZone();
      const parts = [];

      parts.push(section(t('set.you'), `
        <div class="field"><label class="label" for="set-name">${esc(t('set.name'))}</label>
          <input id="set-name" class="input" data-model="set.name" data-change="set-name" value="${esc(UI.draft('set.name', p.name))}" placeholder="${esc(t('set.namePh'))}" maxlength="40" autocomplete="given-name"></div>
        <div class="field"><div class="label">${esc(t('set.language'))}</div>${UI.chips([{ v: 'sv', t: 'Svenska' }, { v: 'en', t: 'English' }], I.language(), 'set-lang')}</div>`));

      parts.push(section(t('set.rhythm'), `
        <div class="grid2">
          <div class="field"><label class="label" for="set-wake">${esc(t('set.wake'))}</label><input id="set-wake" class="input" type="time" value="${esc(p.wake)}" data-change="set-time" data-key="wake"></div>
          <div class="field"><label class="label" for="set-sleep">${esc(t('set.sleep'))}</label><input id="set-sleep" class="input" type="time" value="${esc(p.sleep)}" data-change="set-time" data-key="sleep"></div></div>
        <div class="field"><div class="label">${esc(t('set.workDays'))}</div><div class="daypick">${WEEK.map((d) => `<button class="${p.workDays.includes(d) ? 'on' : ''}" data-action="set-workday" data-day="${d}" aria-pressed="${p.workDays.includes(d)}">${esc(I.weekdayShort(d))}</button>`).join('')}</div></div>
        <div class="field"><div class="label">${esc(t('set.workHours'))}</div>${UI.chips([{ v: '0', t: t('set.noHours') }, { v: '1', t: t('set.hasHours') }], hours ? '1' : '0', 'set-hours')}</div>
        ${hours ? `<div class="grid2">
          <div class="field"><label class="label" for="set-ws">${esc(t('set.from'))}</label><input id="set-ws" class="input" type="time" value="${esc(p.workStart || '08:00')}" data-change="set-time" data-key="workStart"></div>
          <div class="field"><label class="label" for="set-we">${esc(t('set.to'))}</label><input id="set-we" class="input" type="time" value="${esc(p.workEnd || '16:00')}" data-change="set-time" data-key="workEnd"></div></div>` : ''}
        <div class="field"><div class="label">${esc(t('set.commute'))}</div>${UI.chips([0, 10, 15, 20, 30, 45].map((m) => ({ v: m, t: I.duration(m) })), p.commuteMin, 'set-commute')}</div>
        <p class="faint">${esc(t('set.tz', { tz: p.timeZone }))}${deviceTz !== p.timeZone ? ` <button class="btn tiny ghost" data-action="set-tz" data-tz="${esc(deviceTz)}">${esc(t('set.tzUse', { tz: deviceTz }))}</button>` : ''}</p>`));

      parts.push(section(t('set.planning'), `
        <div class="field"><div class="label">${esc(t('set.density'))}</div>
          <div class="stack">${['light', 'balanced', 'full'].map((d) => `<button class="choice${p.density === d ? ' on' : ''}" data-action="set-density" data-value="${d}" aria-pressed="${p.density === d}"><span class="grow"><span class="title">${esc(t(`set.d.${d}`))}</span><span class="sub">${esc(t(`set.dSub.${d}`))}</span></span></button>`).join('')}</div></div>
        <div class="field"><div class="label">${esc(t('set.tone'))}</div>${UI.chips([{ v: 'warm', t: t('set.t.warm') }, { v: 'direct', t: t('set.t.direct') }], p.tone, 'set-tone')}</div>`));

      parts.push(section(t('set.areas'), M.MODULES.map((m) => `<button class="toggle${p.modules[m] ? ' on' : ''}" data-action="set-module" data-key="${m}" aria-pressed="${!!p.modules[m]}"><span class="knob"></span>${esc(t(`set.m.${m}`))}</button>`).join(''), t('set.areasLead')));

      parts.push(section(t('set.people'), `
        ${state.people.length ? `<div class="chips">${state.people.map((pe) => `<span class="chip on">${esc(pe.name)}<button class="chip-x" data-action="set-person-remove" data-id="${esc(pe.id)}" aria-label="${esc(t('a.delete'))} ${esc(pe.name)}">${icon('close', 13)}</button></span>`).join('')}</div>` : ''}
        <div class="quickadd"><label class="sr" for="set-person">${esc(t('set.peoplePh'))}</label>
          <input id="set-person" class="input" data-model="set.person" data-enter="set-person" placeholder="${esc(t('set.peoplePh'))}" value="${esc(UI.draft('set.person'))}" maxlength="40">
          <button class="icon-btn solid" data-action="set-person" aria-label="${esc(t('a.add'))}">${icon('plus', 20)}</button></div>`, t('set.peopleLead')));

      parts.push(section(t('set.ai'), `
        <button class="toggle${p.ai.enabled !== false ? ' on' : ''}" data-action="set-ai" aria-pressed="${p.ai.enabled !== false}"><span class="knob"></span>${esc(t('set.aiOn'))}</button>
        <p class="status-line">${icon(ai.available ? 'check' : 'dot', 15)} ${esc(ai.available ? t('set.aiStatusOn') : ai.checked ? t(ai.key || 'ai.err.none') : t('set.aiStatusChecking'))}</p>
        <p class="faint">${esc(t('set.aiWhat'))}</p>`));

      parts.push(section(t('set.nudges'), UI.chips(['off', 'minimal', 'helpful'].map((v) => ({ v, t: t(`set.n.${v}`) })), p.notifications, 'set-nudges'), t('set.nudgesLead')));

      const storageText = S.mode === 'cloud' ? t('set.storageCloud') : S.mode === 'local' ? t('set.storageLocal') : t('set.storageMemory');
      const prev = setState.preview;
      parts.push(section(t('set.data'), `
        <p class="status-line">${icon(S.mode === 'cloud' ? 'check' : 'dot', 15)} <strong>${esc(S.statusText())}</strong></p>
        <p class="faint">${esc(storageText)}</p>
        <div class="btnrow"><button class="btn ghost small" data-action="set-export">${esc(t('set.export'))}</button>
          ${setState.downloads ? `<button class="btn ghost small" data-action="set-save-file">${esc(t('set.saveFile'))}</button>` : ''}</div>
        ${setState.exportShown ? `<p class="faint">${esc(t('set.exportFallback'))}</p><textarea id="set-export-text" class="input mono small-text" rows="6" readonly>${esc(S.exportJson())}</textarea>` : ''}
        <details class="details"><summary>${esc(t('set.import'))}</summary>
          <p class="faint">${esc(t('set.importLead'))}</p>
          <textarea id="set-import" class="input mono small-text" rows="5" data-model="set.import">${esc(UI.draft('set.import'))}</textarea>
          <div class="btnrow"><button class="btn ghost small" data-action="set-import-check">${esc(t('set.importCheck'))}</button>
            ${prev && prev.ok ? `<button class="btn primary small" data-action="set-import-apply">${esc(t('set.importApply'))}</button>` : ''}</div>
          ${prev ? `<p class="${prev.ok ? 'calm-line' : 'warn-line'}">${esc(prev.ok ? t('set.importPreview', Object.assign({ kind: prev.kind === 'min-vardag' ? 'Min vardag' : 'Aura' }, prev.counts)) : t('set.importBad'))}</p>` : ''}
        </details>
        <button class="btn quiet small danger" data-action="set-erase">${icon('trash', 16)}${esc(t('set.erase'))}</button>`));

      parts.push(section(t('set.about'), `<p class="faint">${esc(t('set.aboutText'))}</p>
        <button class="btn quiet small" data-action="set-restart">${esc(t('set.restart'))}</button>`));

      return `${UI.backHeader(t('set.title'))}${parts.join('')}`;
    },
  });

  const prefs = (patch) => UI.commit([{ op: 'prefs.set', patch }], { message: t('set.saved'), undo: true });

  UI.action('set-name', (el) => { UI.clearDraft('set.name'); prefs({ name: el.value.trim().slice(0, 40) }); });
  UI.action('set-lang', (el) => { I.setLanguage(el.dataset.value); prefs({ language: el.dataset.value }); });
  UI.action('set-time', (el) => { if (U.toMinutes(el.value) !== null) prefs({ [el.dataset.key]: el.value }); });
  UI.action('set-workday', (el) => {
    const d = Number(el.dataset.day);
    const cur = S.state.prefs.workDays;
    prefs({ workDays: (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]).sort() });
  });
  UI.action('set-hours', (el) => {
    if (el.dataset.value === '1') { setState.hoursOpen = true; prefs({ workStart: S.state.prefs.workStart || '08:00', workEnd: S.state.prefs.workEnd || '16:00' }); }
    else { setState.hoursOpen = false; prefs({ workStart: '', workEnd: '' }); }
  });
  UI.action('set-commute', (el) => prefs({ commuteMin: Number(el.dataset.value) }));
  UI.action('set-tz', (el) => prefs({ timeZone: el.dataset.tz }));
  UI.action('set-density', (el) => prefs({ density: el.dataset.value }));
  UI.action('set-tone', (el) => prefs({ tone: el.dataset.value }));
  UI.action('set-module', (el) => prefs({ modules: { [el.dataset.key]: !S.state.prefs.modules[el.dataset.key] } }));
  UI.action('set-nudges', (el) => prefs({ notifications: el.dataset.value }));
  UI.action('set-ai', () => prefs({ ai: { enabled: S.state.prefs.ai.enabled === false } }));
  UI.action('set-person', () => {
    const name = UI.draft('set.person').trim();
    if (!name) return true;
    UI.clearDraft('set.person');
    UI.commit([{ op: 'person.add', name }]);
  });
  UI.action('set-person-remove', (el) => { UI.commit([{ op: 'person.remove', id: el.dataset.id }]); });
  UI.action('set-export', () => {
    const text = S.exportJson();
    const done = () => UI.toast(t('toast.copied'));
    try {
      const p = root.navigator.clipboard && root.navigator.clipboard.writeText(text);
      if (p && p.then) { p.then(done, () => { setState.exportShown = true; UI.render(); }); return true; }
    } catch (e) { /* fall through to showing the text */ }
    setState.exportShown = true;
    return false;
  });
  UI.action('set-save-file', async () => {
    if (!setState.downloads) return true;
    try {
      await setState.downloads.save({ filename: `aura-backup-${UI.today()}.json`, data: S.exportJson() });
    } catch (e) {
      if (!(e && e.code === 'cancelled')) { setState.exportShown = true; UI.render(); }
    }
    return true;
  });
  UI.action('set-import-check', () => { setState.preview = S.readImport(UI.draft('set.import')); });
  UI.action('set-import-apply', () => {
    if (!setState.preview || !setState.preview.ok) return true;
    S.applyImport(setState.preview.state);
    setState.preview = null;
    UI.clearDraft('set.import');
    UI.toast(t('set.imported'), { undo: true });
    return false;
  });
  UI.action('set-erase', async () => {
    const ok = await UI.confirm({ title: t('set.eraseQ'), body: t('set.eraseBody'), yes: t('set.erase'), danger: true });
    if (!ok) return true;
    await S.eraseAll();
    UI.toast(t('set.erased'));
    UI.go('onboarding', {}, { replace: true });
    return true;
  });
  UI.action('set-restart', () => { UI.commit([{ op: 'prefs.set', patch: { onboarded: false } }], { silent: true }); UI.go('onboarding'); return true; });
})(typeof globalThis !== 'undefined' ? globalThis : this);
