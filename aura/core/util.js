/* Aura — time, date and small helpers.
 * Pure functions. "Now" is always passed in. All date work happens in the
 * user's own time zone (a preference), never the device's by accident. */
(function (root) {
  const A = root.Aura || (root.Aura = {});

  function deviceTimeZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; }
  }

  function validTimeZone(tz) {
    if (!tz || typeof tz !== 'string') return false;
    try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return true; } catch (e) { return false; }
  }

  let TZ = deviceTimeZone();
  const formatters = {};

  function fmt(tz) {
    if (!formatters[tz]) {
      formatters[tz] = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      });
    }
    return formatters[tz];
  }

  /** Set the zone every date function uses. Invalid zones are ignored. */
  function setTimeZone(tz) {
    if (validTimeZone(tz)) TZ = tz;
    return TZ;
  }
  function timeZone() { return TZ; }

  /** Year/month/day/hour/minute of a Date in the active zone. */
  function parts(date) {
    const out = {};
    for (const p of fmt(TZ).formatToParts(date)) if (p.type !== 'literal') out[p.type] = p.value;
    const hour = out.hour === '24' ? '00' : out.hour;
    return { year: +out.year, month: +out.month, day: +out.day, hour: +hour, minute: +out.minute };
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  /** 'YYYY-MM-DD' for a Date in the active zone. */
  function dateKey(date) {
    const p = parts(date);
    return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  }

  /** Minutes since local midnight. */
  function minutesOfDay(date) {
    const p = parts(date);
    return p.hour * 60 + p.minute;
  }

  /** 'HH:MM' -> minutes; anything else -> null (unknown is a valid value). */
  function toMinutes(hhmm) {
    if (typeof hhmm !== 'string') return null;
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(hhmm.trim());
    if (!m) return null;
    const h = +m[1], min = +m[2];
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  /** minutes -> 'HH:MM', clipped to the day. */
  function toClock(minutes) {
    const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
    return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  }

  function isDateKey(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }

  /** Add days to a date key without time-zone drift. */
  function addDays(key, days) {
    const [y, m, d] = key.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
    return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
  }

  /** 0 = Sunday … 6 = Saturday. */
  function weekday(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }

  /** Whole days from a to b (b - a). */
  function daysBetween(a, b) {
    const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
  }

  /** Monday of the week containing key (weeks start on Monday). */
  function startOfWeek(key) {
    const wd = weekday(key);
    return addDays(key, wd === 0 ? -6 : 1 - wd);
  }

  /** The next date (after `key`, or including it when inclusive) that falls on `wd`. */
  function nextWeekday(key, wd, inclusive) {
    let d = inclusive ? key : addDays(key, 1);
    for (let i = 0; i < 7; i += 1) {
      if (weekday(d) === wd) return d;
      d = addDays(d, 1);
    }
    return d;
  }

  function addMonths(key, months) {
    const [y, m, d] = key.split('-').map(Number);
    const total = (y * 12 + (m - 1)) + months;
    const ny = Math.floor(total / 12), nm = total % 12;
    const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, last))}`;
  }

  /** Stable, sortable ids with no external dependency. */
  let counter = 0;
  function makeId(prefix) {
    counter = (counter + 1) % 100000;
    const rand = Math.random().toString(36).slice(2, 7);
    return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
  }

  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

  /** Lower-case, trimmed, punctuation removed — for comparing text. */
  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[‘’`´]/g, "'")
      .replace(/[“”"]/g, ' ')
      .replace(/[.,!?;:()[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function roundUp5(minutes) { return Math.ceil(minutes / 5) * 5; }
  function round5(minutes) { return Math.max(5, Math.round(minutes / 5) * 5); }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function capitalize(text) {
    const s = String(text || '').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  /** Small deterministic hash, e.g. to pick a daily prompt. */
  function hash(text) {
    let h = 2166136261;
    const s = String(text);
    for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function uniq(list) { return Array.from(new Set(list)); }

  A.util = {
    deviceTimeZone, validTimeZone, setTimeZone, timeZone, parts, pad, dateKey, minutesOfDay,
    toMinutes, toClock, isDateKey, addDays, weekday, daysBetween, startOfWeek, nextWeekday,
    addMonths, makeId, clone, normalize, roundUp5, round5, clamp, capitalize, hash, uniq,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
