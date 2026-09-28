/* Aura — language.
 *
 * Every visible string lives in a table of [svenska, English] pairs, so a
 * translation can never be missing on one side. Plurals are written as
 * "one|other" and chosen by the {n} parameter. Core logic returns message
 * keys and parameters; this module turns them into words.
 */
(function (root) {
  const A = root.Aura || (root.Aura = {});
  const U = A.util;

  const LANGS = ['sv', 'en'];
  const TABLE = {};
  let LANG = 'en';

  function add(entries) {
    for (const key of Object.keys(entries)) TABLE[key] = entries[key];
  }

  function setLanguage(lang) {
    LANG = LANGS.includes(lang) ? lang : 'en';
    return LANG;
  }
  function language() { return LANG; }

  /** Best guess from the device, used only before the user has chosen. */
  function guessLanguage(navLang) {
    return /^(sv|nb|no|da)\b/i.test(String(navLang || '')) ? 'sv' : 'en';
  }

  function interpolate(text, params) {
    return text.replace(/\{(\w+)\}/g, (m, k) => (params && params[k] != null ? String(params[k]) : ''));
  }

  /** t('key', {n: 2}) — falls back to the key itself so a slip is visible, never blank. */
  function t(key, params) {
    const entry = TABLE[key];
    if (!entry) return key;
    let text = entry[LANG === 'sv' ? 0 : 1];
    if (text.includes('|')) {
      const [one, other] = text.split('|');
      text = params && Number(params.n) === 1 ? one : other;
    }
    return interpolate(text, params || {});
  }

  function has(key) { return Object.prototype.hasOwnProperty.call(TABLE, key); }

  /** A message descriptor {key, params} or a plain string -> text. */
  function msg(m) {
    if (!m) return '';
    if (typeof m === 'string') return m;
    return t(m.key, m.params);
  }

  const DAYS = {
    sv: ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'],
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  };
  const DAYS_SHORT = {
    sv: ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  };
  const MONTHS = {
    sv: ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  };
  const MONTHS_SHORT = {
    sv: ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  };

  function dayName(key) { return DAYS[LANG][U.weekday(key)]; }
  function weekdayName(wd) { return DAYS[LANG][wd]; }
  function weekdayShort(wd) { return DAYS_SHORT[LANG][wd]; }

  /** "tisdag 28 september" / "Tuesday 28 September" */
  function longDate(key) {
    const [, m, d] = key.split('-').map(Number);
    return LANG === 'sv' ? `${dayName(key)} ${d} ${MONTHS.sv[m - 1]}` : `${dayName(key)} ${d} ${MONTHS.en[m - 1]}`;
  }

  /** "28 sep" / "28 Sep" */
  function shortDate(key) {
    const [, m, d] = key.split('-').map(Number);
    return `${d} ${MONTHS_SHORT[LANG][m - 1]}`;
  }

  /** "i dag", "i morgon", "på torsdag", "3 okt" … relative to today. */
  function relativeDay(key, today) {
    if (!U.isDateKey(key)) return '';
    const diff = U.daysBetween(today, key);
    if (diff === 0) return t('rel.today');
    if (diff === 1) return t('rel.tomorrow');
    if (diff === -1) return t('rel.yesterday');
    if (diff > 1 && diff < 7) return t('rel.onDay', { day: dayName(key) });
    if (diff < 0 && diff > -7) return t('rel.daysAgo', { n: -diff });
    return shortDate(key);
  }

  /** 5 min, 1 h, 1 h 30 min */
  function duration(min) {
    const m = Math.max(0, Math.round(Number(min) || 0));
    if (m < 60) return t('dur.min', { n: m });
    const h = Math.floor(m / 60), rest = m % 60;
    return rest ? t('dur.hmin', { h, m: rest }) : t('dur.h', { n: h });
  }

  /** "a, b och c" / "a, b and c" */
  function list(items) {
    const xs = items.filter(Boolean);
    if (xs.length <= 1) return xs.join('');
    return `${xs.slice(0, -1).join(', ')} ${t('word.and')} ${xs[xs.length - 1]}`;
  }

  function clock(minutes) { return U.toClock(minutes); }

  /* ------------------------------------------------------------------ */
  /* Core strings: produced by domain logic (engine, planner, ops).     */
  /* ------------------------------------------------------------------ */
  add({
    'word.and': ['och', 'and'],
    'rel.today': ['i dag', 'today'],
    'rel.tomorrow': ['i morgon', 'tomorrow'],
    'rel.yesterday': ['i går', 'yesterday'],
    'rel.onDay': ['på {day}', 'on {day}'],
    'rel.daysAgo': ['för {n} dag sedan|för {n} dagar sedan', '{n} day ago|{n} days ago'],
    'dur.min': ['{n} min', '{n} min'],
    'dur.h': ['{n} h', '{n} h'],
    'dur.hmin': ['{h} h {m} min', '{h} h {m} min'],
    'count.things': ['{n} sak|{n} saker', '{n} thing|{n} things'],

    /* kinds */
    'kind.task': ['Uppgift', 'Task'],
    'kind.shopping': ['Handla', 'Shopping'],
    'kind.admin': ['Ärende', 'Admin'],
    'kind.chore': ['Hemmet', 'Home'],
    'kind.reminder': ['Påminnelse', 'Reminder'],
    'kind.event': ['Tid', 'Event'],
    'kind.note': ['Anteckning', 'Note'],
    'kind.idea': ['Idé', 'Idea'],

    /* buckets */
    'bucket.must': ['Måste', 'Must'],
    'bucket.good': ['Bra om det blir av', 'Good if possible'],
    'bucket.later': ['Kan vänta', 'Can wait'],

    /* modes */
    'mode.normal': ['Vanlig dag', 'Normal day'],
    'mode.work': ['Arbetsdag', 'Workday'],
    'mode.free': ['Ledig dag', 'Free day'],
    'mode.low': ['Låg energi', 'Low energy'],
    'mode.chaos': ['Kaos', 'Chaos'],
    'mode.recovery': ['Återhämtning', 'Recovery'],

    /* energy scale 1-5 */
    'energy.1': ['Tomt', 'Empty'],
    'energy.2': ['Låg', 'Low'],
    'energy.3': ['Okej', 'Okay'],
    'energy.4': ['Bra', 'Good'],
    'energy.5': ['Full', 'Full'],
    'mood.1': ['Tungt', 'Heavy'],
    'mood.2': ['Nere', 'Low'],
    'mood.3': ['Neutralt', 'Neutral'],
    'mood.4': ['Bra', 'Good'],
    'mood.5': ['Ljust', 'Bright'],
    'stress.1': ['Lugnt', 'Calm'],
    'stress.2': ['Lite', 'A little'],
    'stress.3': ['En del', 'Some'],
    'stress.4': ['Mycket', 'A lot'],
    'stress.5': ['För mycket', 'Too much'],
    'sleep.1': ['Dåligt', 'Poor'],
    'sleep.2': ['Sådär', 'So-so'],
    'sleep.3': ['Okej', 'Okay'],
    'sleep.4': ['Bra', 'Good'],
    'sleep.5': ['Utvilad', 'Rested'],

    /* reasons: one sentence of context for a recommendation */
    'why.overdue': ['Skulle ha varit klart {when}.', 'It was due {when}.'],
    'why.dueToday': ['Behöver bli klart i dag.', 'It needs doing today.'],
    'why.must': ['Det står bland dagens måsten.', "It's on today's must list."],
    'why.background': ['Tar ungefär {min} och sköter sig sedan själv medan du gör annat.', 'It takes about {min} and then runs by itself while you do something else.'],
    'why.backgroundBefore': ['Tar ungefär {min} och går av sig själv medan du {next}.', 'It takes about {min} and can run while you {next}.'],
    'why.fitsBefore': ['Hinns med innan {what} om {mins}.', 'It fits in the {mins} before {what}.'],
    'why.lowEnergy': ['Lätt nog för hur du mår just nu.', 'Light enough for how you feel right now.'],
    'why.highEnergy': ['Du har energi nu — ett bra läge för något tyngre.', 'You have energy now — a good moment for something heavier.'],
    'why.postponed': ['Flyttad {n} gånger. Tio minuter räcker för att komma igång.', "You've moved it {n} times. Ten minutes is enough to get started."],
    'why.quick': ['Går snabbt, och sedan är det ur huvudet.', "It's quick and gets it out of your head."],
    'why.good': ['Bra att få gjort i dag.', 'Good to get done today.'],
    'why.waiting': ['Har väntat ett tag.', 'It has been waiting a while.'],
    'why.project': ['Nästa steg i {project}.', 'The next step in {project}.'],
    'why.chore': ['Återkommer {every} — dags nu.', 'Comes round {every} — it is due now.'],
    'why.reminder': ['Du bad om en påminnelse.', 'You asked to be reminded.'],
    'why.followup': ['Dags att följa upp.', 'Time to follow up.'],
    'why.shopping': ['{n} sak på inköpslistan.|{n} saker på inköpslistan.', '{n} thing on the shopping list.|{n} things on the shopping list.'],
    'why.tiny': ['En liten början räcker.', 'A small start is enough.'],
    'why.phoneHours': ['Nu har de öppet.', 'They are likely open now.'],

    /* every */
    'every.day': ['varje dag|var {n}:e dag', 'every day|every {n} days'],
    'every.week': ['varje vecka|var {n}:e vecka', 'every week|every {n} weeks'],
    'every.month': ['varje månad|var {n}:e månad', 'every month|every {n} months'],
    'every.weekdays': ['på {days}', 'on {days}'],

    /* now card */
    'now.focus': ['Du håller på med', "You're doing"],
    'now.focusSince': ['Började {at} · ungefär {min}', 'Started {at} · about {min}'],
    'now.eventRunning': ['Pågår till {until}.', 'Until {until}.'],
    'now.leaveIn': ['Gå om {mins}', 'Leave in {mins}'],
    'now.leaveFor': ['för {what} kl. {at}', 'for {what} at {at}'],
    'now.leaveNow': ['Dags att gå nu', 'Time to leave'],
    'now.eventSoon': ['{what} om {mins}', '{what} in {mins}'],
    'now.nothingUrgent': ['Inget brådskar just nu.', 'Nothing urgent right now.'],
    'now.freeUntil': ['Du har {mins} innan {what}.', 'You have {mins} before {what}.'],
    'now.freeUntilLeave': ['Du har {mins} innan du behöver gå.', 'You have {mins} before you need to leave.'],
    'now.freeEvening': ['Resten av kvällen är din.', 'The rest of the evening is yours.'],
    'now.freeDay': ['Tiden är din.', 'The time is yours.'],
    'now.windDown': ['Dags att varva ner', 'Time to wind down'],
    'now.windDownDetail': ['Inget mer behöver göras i dag.', 'Nothing else needs doing today.'],
    'now.quiet': ['Okej. Jag håller tyst en stund.', "Okay. I'll stay quiet for a while."],
    'now.quietDetail': ['Fråga mig när du vill.', 'Ask me whenever you like.'],
    'now.rest': ['Vila räknas också.', 'Rest counts too.'],
    'now.restDetail': ['Det nödvändiga för i dag är hanterat.', "Today's essentials are handled."],
    'now.routine': ['{name}', '{name}'],
    'now.routineDetail': ['{n} steg kvar · ungefär {min}|{n} steg kvar · ungefär {min}', '{n} step left · about {min}|{n} steps left · about {min}'],
    'now.tinyVersion': ['Bara fem minuter: {title}', 'Just five minutes: {title}'],

    /* describe ops (shown before approval and in undo toasts) */
    'op.itemAdd': ['Lägg till: {title}', 'Add: {title}'],
    'op.itemAddKind': ['Lägg till {kind}: {title}', 'Add {kind}: {title}'],
    'op.itemUpdate': ['Ändra: {title}', 'Update: {title}'],
    'op.itemDone': ['Klart: {title}', 'Done: {title}'],
    'op.itemReopen': ['Öppnad igen: {title}', 'Reopened: {title}'],
    'op.itemDrop': ['Släppt: {title}', 'Let go: {title}'],
    'op.itemDelete': ['Borttagen: {title}', 'Deleted: {title}'],
    'op.itemPostpone': ['Flyttad till {when}: {title}', 'Moved to {when}: {title}'],
    'op.itemLater': ['Kan vänta: {title}', 'Can wait: {title}'],
    'op.itemSkip': ['Hoppar över den här gången: {title} (nästa {when})', 'Skipped this time: {title} (next {when})'],
    'op.itemBucket': ['{bucket}: {title}', '{bucket}: {title}'],
    'op.itemSchedule': ['{title} → {when}', '{title} → {when}'],
    'op.itemProcess': ['Sorterad: {title}', 'Sorted: {title}'],
    'op.itemAdmin': ['{title}: {status}', '{title}: {status}'],
    'op.itemSmaller': ['Mindre steg: {title}', 'Smaller step: {title}'],
    'op.itemReorder': ['Ny ordning', 'Reordered'],
    'op.eventAdd': ['Lägg in tid: {title} {when}', 'Add event: {title} {when}'],
    'op.eventUpdate': ['Ändrad tid: {title}', 'Event updated: {title}'],
    'op.eventDelete': ['Borttagen tid: {title}', 'Event removed: {title}'],
    'op.routineAdd': ['Ny rutin: {name}', 'New routine: {name}'],
    'op.routineUpdate': ['Rutin ändrad: {name}', 'Routine updated: {name}'],
    'op.routineDelete': ['Rutin borttagen: {name}', 'Routine removed: {name}'],
    'op.routineCheck': ['Avbockat: {label}', 'Checked: {label}'],
    'op.routineUncheck': ['Ångrat: {label}', 'Unchecked: {label}'],
    'op.routineSkip': ['Hoppar över: {label}', 'Skipped: {label}'],
    'op.projectAdd': ['Nytt projekt: {title}', 'New project: {title}'],
    'op.projectUpdate': ['Projekt ändrat: {title}', 'Project updated: {title}'],
    'op.projectDelete': ['Projekt borttaget: {title}', 'Project removed: {title}'],
    'op.pulse': ['Incheckning sparad', 'Check-in saved'],
    'op.mode': ['Läge: {mode}', 'Mode: {mode}'],
    'op.modeOff': ['Tillbaka till vanlig dag', 'Back to a normal day'],
    'op.focus': ['Börjar: {title}', 'Starting: {title}'],
    'op.focusStop': ['Pausat', 'Paused'],
    'op.decline': ['Inte nu: {title}', 'Not now: {title}'],
    'op.quiet': ['Aura håller tyst en stund', 'Aura will stay quiet for a while'],
    'op.evening': ['Kvällen avslutad', 'Evening wrapped up'],
    'op.review': ['Veckan genomgången', 'Week reviewed'],
    'op.prefs': ['Inställningar sparade', 'Settings saved'],
    'op.personAdd': ['Lägg till person: {name}', 'Add person: {name}'],
    'op.personRemove': ['Tog bort: {name}', 'Removed: {name}'],
    'op.cycleLog': ['Cykeldag sparad', 'Cycle day saved'],
    'op.cycleDelete': ['Cykeldag borttagen', 'Cycle day removed'],
    'op.cycleClear': ['All cykeldata raderad', 'All cycle data deleted'],
    'op.journalAdd': ['Reflektion sparad', 'Reflection saved'],
    'op.journalDelete': ['Reflektion borttagen', 'Reflection removed'],
    'op.patternDismiss': ['Okej, jag slutar föreslå det', "Okay, I'll stop suggesting that"],
    'op.chaos': ['Kaosläge', 'Chaos mode'],
    'op.dayNote': ['Sparat', 'Saved'],
    'op.unknown': ['Okänd ändring (hoppas över)', 'Unknown change (skipped)'],

    /* admin statuses */
    'admin.action': ['Behöver göras', 'Needs action'],
    'admin.waiting': ['Väntar på svar', 'Waiting'],
    'admin.followup': ['Följ upp senare', 'Follow up later'],
    'admin.done': ['Klart', 'Done'],

    /* when */
    'when.today': ['i dag', 'today'],
    'when.tomorrow': ['i morgon', 'tomorrow'],
    'when.later': ['senare', 'later'],
    'when.nextWeek': ['nästa vecka', 'next week'],
    'when.weekend': ['i helgen', 'this weekend'],
  });

  A.i18n = {
    LANGS, add, t, has, msg, setLanguage, language, guessLanguage,
    dayName, weekdayName, weekdayShort, longDate, shortDate, relativeDay, duration, list, clock,
    _table: TABLE,
  };
  A.t = t;
})(typeof globalThis !== 'undefined' ? globalThis : this);
