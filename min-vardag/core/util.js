/* Min vardag — grundläggande tids- och hjälpfunktioner.
 * Allt tidsarbete sker i Europe/Stockholm oavsett enhetens tidszon.
 * Rena funktioner: inga globala sidoeffekter, "nu" skickas alltid in. */
(function (root) {
  const MV = root.MinVardag || (root.MinVardag = {});

  const TZ = 'Europe/Stockholm';

  const partsFmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  /** Plocka ut år/månad/dag/timme/minut i Stockholmstid. */
  function parts(date) {
    const out = {};
    for (const p of partsFmt.formatToParts(date)) {
      if (p.type !== 'literal') out[p.type] = p.value;
    }
    // 24:00 förekommer i vissa runtimes; normalisera till 00.
    const hour = out.hour === '24' ? '00' : out.hour;
    return {
      year: +out.year, month: +out.month, day: +out.day,
      hour: +hour, minute: +out.minute,
    };
  }

  /** 'YYYY-MM-DD' för ett datum, i Stockholmstid. */
  function dateKey(date) {
    const p = parts(date);
    return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  }

  /** Minuter sedan midnatt, i Stockholmstid. */
  function minutesOfDay(date) {
    const p = parts(date);
    return p.hour * 60 + p.minute;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  /** 'HH:MM' -> minuter. Tomt/ogiltigt -> null (okänt är ett tillåtet värde). */
  function toMinutes(hhmm) {
    if (typeof hhmm !== 'string') return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    if (!m) return null;
    const h = +m[1], min = +m[2];
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  /** minuter -> 'HH:MM'. Klipper till dygnet. */
  function toClock(minutes) {
    const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
    return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  }

  /** Lägg till dagar på en 'YYYY-MM-DD'-nyckel utan tidszonsdrift. */
  function addDays(key, days) {
    const [y, m, d] = key.split('-').map(Number);
    const base = Date.UTC(y, m - 1, d);
    const next = new Date(base + days * 86400000);
    return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
  }

  /** 0 = söndag ... 6 = lördag, för en datumnyckel. */
  function weekday(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }

  const DAY_NAMES = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
  const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli',
    'augusti', 'september', 'oktober', 'november', 'december'];

  function dayName(key) { return DAY_NAMES[weekday(key)]; }

  /** "måndag 16 september" */
  function longDate(key) {
    const [, m, d] = key.split('-').map(Number);
    return `${dayName(key)} ${d} ${MONTHS[m - 1]}`;
  }

  /** Antal hela dagar mellan två datumnycklar (b - a). */
  function daysBetween(a, b) {
    const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
  }

  /** Kort, mänsklig beskrivning av ett datum i förhållande till idag. */
  function relativeDay(key, todayKey) {
    const diff = daysBetween(todayKey, key);
    if (diff === 0) return 'i dag';
    if (diff === 1) return 'i morgon';
    if (diff === -1) return 'i går';
    if (diff > 1 && diff < 7) return `på ${dayName(key)}`;
    if (diff < 0) return `${Math.abs(diff)} dagar sedan`;
    return longDate(key);
  }

  /** Stabila, sorterbara id:n utan externa beroenden. */
  let counter = 0;
  function makeId(prefix) {
    counter = (counter + 1) % 100000;
    const rand = Math.random().toString(36).slice(2, 7);
    return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
  }

  /** Djupkopia av JSON-bart innehåll. */
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

  /** Normalisera svensk text för jämförelse: gemener, trimmat, utan skiljetecken. */
  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[‘’“”]/g, "'")
      .replace(/[.,!?;:()"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Runda uppåt till närmaste 5 minuter — planer ska se mänskliga ut. */
  function roundUp5(minutes) { return Math.ceil(minutes / 5) * 5; }

  /** Läsbar längd: 45 min, 1 h, 1 h 30 min */
  function duration(min) {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), rest = min % 60;
    return rest ? `${h} h ${rest} min` : `${h} h`;
  }

  MV.util = {
    TZ, parts, dateKey, minutesOfDay, toMinutes, toClock, addDays, weekday,
    dayName, longDate, daysBetween, relativeDay, makeId, clone, normalize,
    roundUp5, duration, pad, DAY_NAMES,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
