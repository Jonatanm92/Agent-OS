// Inställningar: profile, kids, habits, money, daily rhythm & reminders,
// coach connection, data (backup/import/export) and installation.

import * as C from '../core.js';
import { html, icon, attr, download, readFile, toast, openSheet, closeSheet, sheetHead } from '../ui.js';
import { kidDot, kidColor } from '../sheets.js';
import { exportJson, parseImport } from '../store.js';

const AGENTS = [
  ['free-claude-code', 'Free Claude Code (FCC)'],
  ['local', 'Lokal (Ollama)'],
  ['kimi-code', 'Kimi Code'],
  ['glm', 'GLM'],
  ['hermes', 'Hermes'],
  ['reality-checker', 'Reality Checker'],
  ['growth-hacker', 'Growth Hacker'],
];

const str = (fd, k) => String(fd.get(k) ?? '').trim();

function section(id, title, body, open) {
  return html`<details class="card settings-section" id="s-${id}"${attr(open, 'open')}>
    <summary><h2>${title}</h2>${icon('right', 18)}</summary>
    <div class="stack">${body}</div>
  </details>`;
}

function profileSection(ctx) {
  const s = ctx.state.settings;
  return html`<form class="stack" data-form="settings.profile">
    <label class="field"><span>Ditt namn</span><input name="name" maxlength="40" value="${ctx.state.profile.name}" autocomplete="given-name"></label>
    <label class="field"><span>Tema</span><select name="theme">
      ${[['system', 'Följ telefonen'], ['light', 'Ljust'], ['dark', 'Mörkt']].map(([v, n]) => html`<option value="${v}"${attr(s.theme === v, 'selected')}>${n}</option>`)}
    </select></label>
    <label class="switch"><input type="checkbox" name="includePartner"${attr(s.includePartner, 'checked')}><span>Ta med partner-uppdrag (t.ex. ”ta kvällsrutinen så din partner får vila”)</span></label>
    <button class="btn btn-primary">Spara</button>
  </form>`;
}

function kidsSection(ctx) {
  return html`
    ${ctx.state.kids.length
      ? html`<ul class="settings-list">${ctx.state.kids.map((k) => html`<li>
          <span class="grow">${kidDot(k)}<strong>${k.name}</strong> <span class="small muted">${k.birthdate ? `${C.formatAge(C.ageParts(k.birthdate, ctx.key))} · ${k.birthdate}` : ''}</span></span>
          <button class="btn-icon" data-action="settings.kidEdit" data-id="${k.id}" aria-label="Redigera ${k.name}">${icon('edit', 18)}</button>
        </li>`)}</ul>`
      : html`<p class="muted">Inga barn tillagda.</p>`}
    <form class="stack" data-form="settings.kidAdd">
      <div class="grid-2">
        <label class="field"><span>Namn</span><input name="name" required maxlength="30" autocomplete="off"></label>
        <label class="field"><span>Födelsedag</span><input type="date" name="birthdate" required max="${ctx.key}"></label>
      </div>
      <button class="btn btn-ghost">${icon('plus', 18)} Lägg till barn</button>
    </form>
    <form class="stack" data-form="settings.dadGoal">
      <label class="field"><span>Mål: närvarande tid per barn och vecka (minuter)</span><input name="goal" inputmode="numeric" value="${ctx.state.settings.dadGoalPerKid}"></label>
      <button class="btn btn-ghost">Spara mål</button>
    </form>`;
}

function habitsSection(ctx) {
  const active = C.activeHabits(ctx.state);
  const names = new Set(ctx.state.habits.map((h) => h.name));
  const suggestions = C.SUGGESTED_HABITS.filter((h) => !names.has(h.name));
  const archived = ctx.state.habits.filter((h) => h.archived);
  return html`
    ${active.length
      ? html`<ul class="settings-list">${active.map((h) => html`<li>
          <span class="grow">${h.icon} ${h.name}</span>
          <button class="btn-icon" data-action="settings.habitArchive" data-id="${h.id}" aria-label="Arkivera ${h.name}">${icon('trash', 18)}</button>
        </li>`)}</ul>`
      : html`<p class="muted">Inga aktiva vanor.</p>`}
    ${suggestions.length ? html`<p class="small muted">Förslag – tryck för att lägga till:</p>
      <div class="chips">${suggestions.map((h) => html`<button class="chip" data-action="settings.habitSuggest" data-id="${h.id}">${h.icon} ${h.name}</button>`)}</div>` : ''}
    <form class="row" data-form="settings.habitAdd">
      <label class="field emoji-field"><span>Ikon</span><input name="icon" maxlength="4" value="⭐" aria-label="Ikon"></label>
      <label class="field grow"><span>Egen vana</span><input name="name" required maxlength="40" placeholder="T.ex. Stretcha 5 min" autocomplete="off"></label>
      <button class="btn btn-ghost align-end">Lägg till</button>
    </form>
    ${archived.length ? html`<p class="small muted">Arkiverade (historiken finns kvar): ${archived.map((h, i) => html`${i ? ', ' : ''}<button class="btn-link" data-action="settings.habitRestore" data-id="${h.id}">${h.icon} ${h.name}</button>`)}</p>` : ''}`;
}

function moneySection(ctx) {
  const s = ctx.state.settings;
  return html`<form class="stack" data-form="settings.money">
      <div class="grid-2">
        <label class="field"><span>Inkomstmål per månad (kr)</span><input name="goal" inputmode="decimal" value="${s.monthlyIncomeGoal || ''}" placeholder="30 000"></label>
        <label class="field"><span>Fasta kostnader per månad (kr)</span><input name="costs" inputmode="decimal" value="${s.monthlyCosts || ''}" placeholder="För buffertberäkning"></label>
      </div>
      <button class="btn btn-primary">Spara</button>
    </form>
    <p class="small muted">Inkomstströmmar – byt namn direkt i fältet:</p>
    <ul class="settings-list">${s.streams.map((st) => html`<li>
      <input class="grow inline-input" data-bind="settings.stream" data-id="${st.id}" value="${st.name}" maxlength="40" aria-label="Namn på ström">
      <button class="btn-icon" data-action="settings.streamDelete" data-id="${st.id}" aria-label="Ta bort ${st.name}"${attr(s.streams.length <= 1, 'disabled')}>${icon('trash', 18)}</button>
    </li>`)}</ul>
    <form class="row" data-form="settings.streamAdd">
      <label class="field grow"><span>Ny ström</span><input name="name" required maxlength="40" placeholder="T.ex. Gitarrlektioner" autocomplete="off"></label>
      <button class="btn btn-ghost align-end">Lägg till</button>
    </form>`;
}

function rhythmSection(ctx) {
  const s = ctx.state.settings;
  return html`<form class="stack" data-form="settings.rhythm">
      <label class="field"><span>Bästa tid för fokusblock</span><select name="focusWindow">
        ${Object.entries(C.FOCUS_WINDOWS).map(([id, w]) => html`<option value="${id}"${attr(s.focusWindow === id, 'selected')}>${w.name} (${w.start}–${w.end})</option>`)}
      </select></label>
      <div class="grid-2">
        <label class="field"><span>Familjetid från</span><input type="time" name="familyStart" value="${s.familyStart}"></label>
        <label class="field"><span>Familjetid till</span><input type="time" name="familyEnd" value="${s.familyEnd}"></label>
      </div>
      <div class="grid-3">
        <label class="field"><span>Check-in</span><input type="time" name="morning" value="${s.reminders.morning}"></label>
        <label class="field"><span>Reflektion</span><input type="time" name="evening" value="${s.reminders.evening}"></label>
        <label class="field"><span>Vecka (sön)</span><input type="time" name="weekly" value="${s.reminders.weekly}"></label>
      </div>
      <button class="btn btn-primary">Spara</button>
    </form>
    <div class="note note-tip">
      <p><strong>Påminnelser i telefonens kalender.</strong> Ladda ner kalenderfilen och öppna den – då får du check-in, kvällsreflektion och veckogenomgång som återkommande påminnelser. Fungerar på iPhone, Android och datorn.</p>
      <button class="btn btn-ghost" data-action="settings.ics">${icon('download', 18)} Ladda ner påminnelser (.ics)</button>
    </div>`;
}

function coachSection(ctx) {
  const c = ctx.state.settings.coach;
  return html`<form class="stack" data-form="settings.coach">
      <fieldset class="field"><legend>Läge</legend>
        <label class="switch"><input type="radio" name="mode" value="offline"${attr(c.mode !== 'agentos', 'checked')}><span><strong>Offline</strong> – inbyggd coach, inget lämnar telefonen</span></label>
        <label class="switch"><input type="radio" name="mode" value="agentos"${attr(c.mode === 'agentos', 'checked')}><span><strong>Agent OS</strong> – fria frågor till din egen AI-stack (FCC/OpenRouter/Ollama)</span></label>
      </fieldset>
      <label class="field"><span>Agent OS-adress (tom = via Life OS-servern${ctx.server.coach ? ', konfigurerad ✓' : ''})</span>
        <input name="agentOsUrl" value="${c.agentOsUrl}" placeholder="http://127.0.0.1:3001" inputmode="url" autocomplete="off"></label>
      <label class="field"><span>Agent OS-lösenord (om satt)</span><input name="agentOsToken" type="password" value="${c.agentOsToken}" autocomplete="off"></label>
      <label class="field"><span>Agent</span><select name="agentId">
        ${AGENTS.map(([id, n]) => html`<option value="${id}"${attr(c.agentId === id, 'selected')}>${n}</option>`)}
      </select></label>
      <label class="switch"><input type="checkbox" name="shareNames"${attr(c.shareNames, 'checked')}><span>Dela barnens förnamn med AI:n (annars bara åldrar)</span></label>
      <div class="row wrap"><button class="btn btn-primary">Spara</button><button type="button" class="btn btn-ghost" data-action="settings.coachTest">Testa anslutning</button></div>
    </form>
    <p class="small muted">Coachen skickar en kort sammanfattning (åldrar, mål, dagens check-in, öppna affärer) tillsammans med frågan. Snabbvalen körs alltid offline.</p>`;
}

function dataSection(ctx) {
  const s = ctx.state.settings;
  return html`
    <div class="row wrap">
      <button class="btn btn-ghost" data-action="settings.export">${icon('download', 18)} Exportera backup (.json)</button>
      <label class="btn btn-ghost file-btn">${icon('upload', 18)} Importera backup<input type="file" accept="application/json,.json" data-change="settings.import" hidden></label>
      <button class="btn btn-ghost" data-action="dad.exportMemories">${icon('download', 18)} Minnesbank (.md)</button>
    </div>
    <p class="small muted">Senaste backup: ${s.lastBackupAt ? new Date(s.lastBackupAt).toLocaleString(C.LOCALE) : 'aldrig'}. All data ligger lokalt i den här webbläsaren – exportera ibland.</p>
    ${ctx.server.available
      ? html`<div class="note note-tip">
          <p><strong>Life OS-servern</strong> är nåbar. Spara en kopia på datorn och hämta den på en annan enhet.</p>
          ${ctx.server.tokenRequired ? html`<form class="row" data-form="settings.serverToken"><label class="field grow"><span>Servertoken</span><input name="token" type="password" value="${s.serverToken}" autocomplete="off"></label><button class="btn btn-ghost align-end">Spara</button></form>` : ''}
          <div class="row wrap">
            <button class="btn btn-ghost" data-action="settings.backupPush">${icon('upload', 18)} Spara till servern</button>
            <button class="btn btn-ghost" data-action="settings.backupPull">${icon('download', 18)} Hämta från servern</button>
          </div>
        </div>`
      : ''}
    <form class="stack danger-zone" data-form="settings.reset">
      <label class="field"><span>Radera allt på den här enheten – skriv RADERA</span><input name="confirm" autocomplete="off" placeholder="RADERA"></label>
      <button class="btn btn-ghost danger">Radera all data</button>
    </form>`;
}

function installSection(ctx) {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return html`
    ${standalone ? html`<p class="note note-good">Life OS körs som installerad app ✓</p>` : ''}
    ${ctx.install.available ? html`<button class="btn btn-primary" data-action="settings.install">${icon('download', 18)} Installera Life OS</button>` : ''}
    <p><strong>iPhone:</strong> öppna i Safari → Dela-knappen → <em>Lägg till på hemskärmen</em>.</p>
    <p><strong>Android:</strong> Chrome-menyn (⋮) → <em>Installera app</em>.</p>
    <p class="small muted">Som installerad app startar Life OS direkt från hemskärmen och fungerar offline.</p>`;
}

export function render(ctx) {
  const open = ctx.params.get('s') || '';
  return html`
    <section class="page-head"><h1>Inställningar</h1><p class="hero-sub">Gör appen till din.</p></section>
    ${section('profil', '👤 Profil & tema', profileSection(ctx), open === 'profil')}
    ${section('barn', '👧 Barn', kidsSection(ctx), open === 'barn')}
    ${section('vanor', '🌱 Vanor', habitsSection(ctx), open === 'vanor')}
    ${section('pengar', '💰 Pengar', moneySection(ctx), open === 'pengar')}
    ${section('rytm', '⏰ Rytm & påminnelser', rhythmSection(ctx), open === 'rytm')}
    ${section('coach', '✦ Coach', coachSection(ctx), open === 'coach')}
    ${section('data', '💾 Data & backup', dataSection(ctx), open === 'data')}
    ${section('installera', '📱 Installera på telefonen', installSection(ctx), open === 'installera')}
    <section class="card card-quiet about">
      <p><strong>Life OS</strong> · version ${ctx.version}</p>
      <p class="small muted">Lokal-först: din data stannar i webbläsaren på din enhet. Ingen spårning, inga konton. Del av Agent OS.</p>
    </section>
  `;
}

function kidSheet(kid) {
  return html`<form class="stack" data-form="settings.kidSave">
    ${sheetHead(`Redigera ${kid.name}`)}
    <input type="hidden" name="id" value="${kid.id}">
    <label class="field"><span>Namn</span><input name="name" required maxlength="30" value="${kid.name}"></label>
    <label class="field"><span>Födelsedag</span><input type="date" name="birthdate" value="${kid.birthdate}" required max="${C.todayKey()}"></label>
    <div class="row">
      <button class="btn btn-primary grow">Spara</button>
      <button type="button" class="btn btn-ghost danger" data-action="settings.kidDelete" data-id="${kid.id}">${icon('trash', 18)} Ta bort</button>
    </div>
  </form>`;
}

function nextKidColor(kids) {
  const used = new Set(kids.map(kidColor));
  for (let i = 0; i < 8; i += 1) if (!used.has(i)) return i;
  return kids.length % 8;
}

export const actions = {
  'settings.kidEdit': (ctx, el) => {
    const kid = ctx.state.kids.find((k) => k.id === el.dataset.id);
    if (kid) openSheet(kidSheet(kid));
  },
  'settings.kidDelete': (ctx, el) => {
    const snap = ctx.store.snapshot();
    ctx.update((s) => {
      s.kids = s.kids.filter((k) => k.id !== el.dataset.id);
    });
    closeSheet();
    toast('Barnet togs bort (minnen och tid finns kvar i backupen)', { action: () => ctx.store.restore(snap) });
  },
  'settings.habitArchive': (ctx, el) => ctx.update((s) => {
    const h = s.habits.find((x) => x.id === el.dataset.id);
    if (h) h.archived = true;
  }),
  'settings.habitRestore': (ctx, el) => ctx.update((s) => {
    const h = s.habits.find((x) => x.id === el.dataset.id);
    if (h) h.archived = false;
  }),
  'settings.habitSuggest': (ctx, el) => {
    const sug = C.SUGGESTED_HABITS.find((h) => h.id === el.dataset.id);
    if (!sug) return;
    ctx.update((s) => {
      s.habits.push({ id: C.uid('hb'), name: sug.name, icon: sug.icon, archived: false, createdAt: new Date().toISOString() });
    });
  },
  'settings.streamDelete': (ctx, el) => {
    if (ctx.state.settings.streams.length <= 1) return;
    const snap = ctx.store.snapshot();
    ctx.update((s) => {
      s.settings.streams = s.settings.streams.filter((x) => x.id !== el.dataset.id);
    });
    toast('Strömmen togs bort', { action: () => ctx.store.restore(snap) });
  },
  'settings.ics': (ctx) => {
    const url = `${location.origin}${location.pathname}`;
    download('life-os-paminnelser.ics', C.buildReminderIcs({ reminders: ctx.state.settings.reminders, appUrl: url.startsWith('http') ? url : '' }), 'text/calendar');
    toast('Öppna filen för att lägga till påminnelserna i kalendern');
  },
  'settings.coachTest': async (ctx) => {
    const c = ctx.state.settings.coach;
    const direct = String(c.agentOsUrl || '').trim().replace(/\/+$/, '');
    try {
      if (direct) {
        const res = await fetch(`${direct}/api/health`, { headers: c.agentOsToken ? { 'x-agentos-token': c.agentOsToken } : {} });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        if (!ctx.server.available) throw new Error('Life OS-servern nås inte – ange Agent OS-adressen');
        const r = await ctx.api('/api/coach/status');
        if (!r.ok) throw new Error(r.error || 'Agent OS svarar inte');
      }
      toast('Agent OS svarar ✓');
    } catch (e) {
      toast(`Ingen anslutning: ${e.message}`);
    }
  },
  'settings.export': (ctx) => {
    download(`life-os-backup-${ctx.key}.json`, exportJson(), 'application/json');
    ctx.update((s) => {
      s.settings.lastBackupAt = new Date().toISOString();
    });
  },
  'settings.backupPush': async (ctx) => {
    try {
      const r = await ctx.api('/api/backup', { method: 'PUT', body: { state: ctx.state } });
      ctx.update((s) => {
        s.settings.lastBackupAt = r.savedAt || new Date().toISOString();
      });
      toast('Backup sparad på servern ✓');
    } catch (e) {
      toast(`Kunde inte spara: ${e.message}`);
    }
  },
  'settings.backupPull': async (ctx) => {
    try {
      const r = await ctx.api('/api/backup');
      const when = new Date(r.savedAt).toLocaleString(C.LOCALE);
      if (!window.confirm(`Ersätta datan på den här enheten med serverns backup från ${when}?`)) return;
      const snap = ctx.store.snapshot();
      ctx.store.replace(parseImport(JSON.stringify(r.state)));
      toast('Backupen är återställd', { action: () => ctx.store.restore(snap) });
    } catch (e) {
      toast(e.status === 404 ? 'Ingen backup på servern ännu' : `Kunde inte hämta: ${e.message}`);
    }
  },
  'settings.install': async (ctx) => {
    const prompt = ctx.install.prompt;
    if (!prompt) return;
    prompt.prompt();
    try { await prompt.userChoice; } catch { /* dismissed */ }
    ctx.install.prompt = null;
    ctx.install.available = false;
    ctx.render();
  },
};

export const changes = {
  'settings.import': async (ctx, el) => {
    const file = el.files && el.files[0];
    if (!file) return;
    try {
      const next = parseImport(await readFile(file));
      if (!window.confirm('Ersätta all data på den här enheten med backupen?')) return;
      const snap = ctx.store.snapshot();
      ctx.store.replace(next);
      toast('Backupen är importerad', { action: () => ctx.store.restore(snap) });
    } catch (e) {
      toast(`Importen misslyckades: ${e.message}`);
    } finally {
      el.value = '';
    }
  },
};

export const binds = {
  'settings.stream': (ctx, el) => ctx.update((s) => {
    const st = s.settings.streams.find((x) => x.id === el.dataset.id);
    if (st && el.value.trim()) st.name = el.value.trim().slice(0, 40);
  }, { silent: true }),
};

export const forms = {
  'settings.profile': (ctx, fd) => {
    ctx.update((s) => {
      s.profile.name = str(fd, 'name').slice(0, 40);
      s.settings.theme = ['light', 'dark'].includes(str(fd, 'theme')) ? str(fd, 'theme') : 'system';
      s.settings.includePartner = fd.get('includePartner') === 'on';
    });
    ctx.applyTheme();
    toast('Sparat');
  },
  'settings.kidAdd': (ctx, fd, form) => {
    const name = str(fd, 'name');
    const birthdate = str(fd, 'birthdate');
    if (!name || !C.parseKey(birthdate)) return toast('Ange namn och födelsedag');
    ctx.update((s) => {
      s.kids.push({ id: C.uid('k'), name, birthdate, color: nextKidColor(s.kids) });
    });
    form.reset();
    toast(`${name} är tillagd 💛`);
  },
  'settings.kidSave': (ctx, fd) => {
    ctx.update((s) => {
      const k = s.kids.find((x) => x.id === str(fd, 'id'));
      if (k) {
        k.name = str(fd, 'name') || k.name;
        if (C.parseKey(str(fd, 'birthdate'))) k.birthdate = str(fd, 'birthdate');
      }
    });
    closeSheet();
  },
  'settings.dadGoal': (ctx, fd) => {
    ctx.update((s) => {
      s.settings.dadGoalPerKid = C.clamp(Math.round(C.num(fd.get('goal'), 180)), 0, 3000);
    });
    toast('Målet är sparat');
  },
  'settings.habitAdd': (ctx, fd, form) => {
    const name = str(fd, 'name');
    if (!name) return;
    ctx.update((s) => {
      s.habits.push({ id: C.uid('hb'), name, icon: str(fd, 'icon') || '⭐', archived: false, createdAt: new Date().toISOString() });
    });
    form.reset();
  },
  'settings.money': (ctx, fd) => {
    ctx.update((s) => {
      s.settings.monthlyIncomeGoal = Math.max(0, C.num(fd.get('goal')));
      s.settings.monthlyCosts = Math.max(0, C.num(fd.get('costs')));
    });
    toast('Sparat');
  },
  'settings.streamAdd': (ctx, fd, form) => {
    const name = str(fd, 'name');
    if (!name) return;
    ctx.update((s) => {
      s.settings.streams.push({ id: C.uid('st'), name });
    });
    form.reset();
  },
  'settings.rhythm': (ctx, fd) => {
    const time = (k, fallback) => (C.minutesOfDay(str(fd, k)) != null ? str(fd, k) : fallback);
    ctx.update((s) => {
      const st = s.settings;
      st.focusWindow = C.FOCUS_WINDOWS[str(fd, 'focusWindow')] ? str(fd, 'focusWindow') : 'morning';
      st.familyStart = time('familyStart', st.familyStart);
      st.familyEnd = time('familyEnd', st.familyEnd);
      st.reminders = { morning: time('morning', st.reminders.morning), evening: time('evening', st.reminders.evening), weekly: time('weekly', st.reminders.weekly) };
    });
    toast('Sparat – ladda ner påminnelserna igen om du ändrat tider');
  },
  'settings.coach': (ctx, fd) => {
    ctx.update((s) => {
      s.settings.coach = {
        mode: str(fd, 'mode') === 'agentos' ? 'agentos' : 'offline',
        agentOsUrl: str(fd, 'agentOsUrl'),
        agentOsToken: str(fd, 'agentOsToken'),
        agentId: AGENTS.some(([id]) => id === str(fd, 'agentId')) ? str(fd, 'agentId') : 'free-claude-code',
        shareNames: fd.get('shareNames') === 'on',
      };
    });
    toast('Coach-inställningar sparade');
  },
  'settings.serverToken': (ctx, fd) => {
    ctx.update((s) => {
      s.settings.serverToken = str(fd, 'token');
    });
    toast('Token sparad');
  },
  'settings.reset': (ctx, fd) => {
    if (str(fd, 'confirm') !== 'RADERA') return toast('Skriv RADERA för att bekräfta');
    const snap = ctx.store.snapshot();
    ctx.store.replace(C.createDefaultState());
    location.hash = '#/';
    toast('All data raderades', { action: () => ctx.store.restore(snap), ms: 10000 });
  },
};
