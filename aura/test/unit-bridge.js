/* Aura — the bridge between the live app's own state and the everyday engine.
 *   node test/unit-bridge.js
 *
 * These guard what matters most when the new engine meets a person's
 * existing Aura: nothing they already have is lost, body state has one
 * source, every change can be undone, and the coach API sees nothing new. */
process.env.TZ = 'Europe/Stockholm';   // the tests' clock is Swedish, like the people using Aura
const fs = require('node:fs');
const path = require('node:path');
const { loadCore, suite, testAsync, test, assert, equal, deepEqual, report, at, ROOT } = require('./harness');

const A = loadCore();

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; },
    dump: () => data,
  };
}

/* A state exactly as the live app (version 8) stores it — invented person. */
function liveV8State() {
  return {
    version: 8,
    profile: { name: 'Robin', onboarded: true, waterTarget: 6, cycleLength: 29, periodLength: 4, birthDate: '1990-05-17' },
    preferences: { audioEnabled: true, audioVolume: 64, activeExperiment: null, experimentHistory: [{ title: 'Dagsljus', outcome: 'helped' }] },
    cycle: { lastPeriod: '2026-09-10', events: [{ id: 'c1', date: '2026-09-10', type: 'period_start' }] },
    forest: { moments: [{ id: 'm1', date: '2026-09-28', title: 'En lugn andningspaus', kind: 'done', characterId: 'klara', route: 'coach', createdAt: '2026-09-28T07:00:00.000Z' }] },
    logs: {
      '2026-09-29': {
        mood: 2, energy: 2, stress: 4, checkIns: [
          { id: 'k2', createdAt: '2026-09-29T08:30:00.000Z', energy: 2, mood: 2, stress: 4, sleepQuality: 'rough', need: 'rest', persona: 'klara' },
          { id: 'k1', createdAt: '2026-09-29T06:10:00.000Z', energy: 6, mood: 3, stress: 2, sleepQuality: 'okay', need: 'food', persona: 'klara' },
        ],
      },
    },
    journal: [{ id: 'j1', createdAt: '2026-09-27T20:00:00.000Z', prompt: '', text: 'En rad bara för mig.' }],
    tarotReadings: [{ id: 't1', createdAt: '2026-09-26T20:00:00.000Z', type: 'daily', title: 'Dagens kort', cards: [] }],
    toolbox: [{ id: 'tb1', title: 'Ta en klunk vatten', body: 'Häll upp lite vatten.', createdAt: '2026-09-20T10:00:00.000Z' }],
    reminders: [],
    createdAt: '2026-08-01T10:00:00.000Z',
  };
}

(async () => {
  const storage = await import(path.join(ROOT, 'storage.js'));
  const life = await import(path.join(ROOT, 'life.js'));
  A.util.setTimeZone('Europe/Stockholm');

  suite('1. Existing live data survives the upgrade', () => {});
  await testAsync('a version 8 state loads with every journal line, check-in, reading and cycle date intact', async () => {
    const mem = memoryStorage({ [storage.STORAGE_KEY]: JSON.stringify(liveV8State()) });
    const s = storage.loadState(mem);
    equal(s.version, 9, 'version');
    equal(s.profile.name, 'Robin');
    equal(s.journal[0].text, 'En rad bara för mig.');
    equal(s.logs['2026-09-29'].checkIns.length, 2);
    equal(s.tarotReadings.length, 1);
    equal(s.cycle.lastPeriod, '2026-09-10');
    equal(s.toolbox[0].title, 'Ta en klunk vatten');
    equal(s.forest.moments.length, 1);
    equal(s.preferences.audioVolume, 64);
    equal(s.life, null, 'no everyday data until the engine creates it');
  });
  await testAsync('the everyday slice is created, saved and read back under the same key', async () => {
    const mem = memoryStorage({ [storage.STORAGE_KEY]: JSON.stringify(liveV8State()) });
    const s = storage.loadState(mem);
    life.ensureLife(s, at('2026-09-29', '09:00'));
    life.commitLife(s, [{ op: 'item.add', item: { kind: 'shopping', title: 'Havregryn', category: 'pantry' } }], { now: at('2026-09-29', '09:00') });
    storage.saveState(s, mem);
    deepEqual(Object.keys(mem.dump()), [storage.STORAGE_KEY], 'still exactly one storage key');
    const back = storage.loadState(mem);
    equal(back.life.items.length, 1);
    equal(back.life.items[0].title, 'Havregryn');
    equal(back.journal[0].text, 'En rad bara för mig.', 'journal still there');
    equal(back.logs['2026-09-29'].checkIns.length, 2, 'check-ins still there');
  });
  await testAsync('a new person starts without anyone else’s name', async () => {
    const s = storage.createInitialState();
    equal(s.profile.name, '');
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert(!/id="onboarding-name"[^>]*value="[^"]/.test(html), 'the page has no pre-filled name');
    const everyday = fs.readFileSync(path.join(ROOT, 'everyday.js'), 'utf8');
    assert(/onboarding = \{ step: 0, data: \{ name: "",/.test(everyday), 'onboarding starts with an empty name');
  });
  await testAsync('this edition starts with Liv and Astrid switched on, and the engine speaks Swedish', async () => {
    const s = storage.createInitialState();
    const l = life.ensureLife(s);
    equal(l.prefs.modules.cycle, true);
    equal(l.prefs.modules.reflection, true);
    equal(A.i18n.language(), 'sv');
    equal(life.moduleOn(s, 'shopping'), true);
  });
  await testAsync('broken everyday data is repaired instead of breaking the app', async () => {
    const raw = liveV8State();
    raw.life = { items: [{ id: 'x1', title: 'Ok' }, { nope: true }, null], days: 'broken', prefs: { wake: '06:30' } };
    const s = storage.loadState(memoryStorage({ [storage.STORAGE_KEY]: JSON.stringify(raw) }));
    equal(s.life.items.length, 1);
    equal(typeof s.life.days, 'object');
    equal(s.life.prefs.wake, '06:30');
  });

  suite('2. One source for how the body feels', () => {});
  test('check-ins become the engine’s pulse: energy 2/10 is 1/5, rough sleep is 1/5, oldest first', () => {
    const pulses = life.pulsesFromLog(liveV8State().logs['2026-09-29']);
    equal(pulses.length, 2);
    deepEqual(pulses.map((p) => p.energy), [3, 1]);
    equal(pulses[1].sleep, 1);
    equal(pulses[1].stress, 4);
  });
  test('the one-tap energy on Idag counts too', () => {
    const pulses = life.pulsesFromLog({ checkIns: [], pulse: { energy: 4, at: '2026-09-29T09:00:00.000Z' } });
    equal(pulses.length, 1);
    equal(pulses[0].energy, 4);
  });
  test('Aura Pulse entries count, several a day, with mood, stress and sleep', () => {
    const pulses = life.pulsesFromLog({ checkIns: [], pulses: [
      { energy: 2, mood: 4, note: 'privat rad', at: '2026-09-29T08:00:00.000Z' },
      { energy: 3, stress: 5, sleep: 1, at: '2026-09-29T12:00:00.000Z' },
      { note: 'bara en rad', at: '2026-09-29T13:00:00.000Z' },
    ] });
    equal(pulses.length, 2, 'a note without any value is not a pulse');
    deepEqual(pulses.map((p) => p.energy), [2, 3]);
    equal(pulses[1].stress, 5);
    equal(pulses[1].sleep, 1);
    assert(!pulses.some((p) => 'note' in p), 'the free-text note stays in the log, not in the engine');
  });
  test('Idag reads today’s pulse as one merged picture', () => {
    const s = liveV8State();
    s.logs['2026-09-29'] = { checkIns: [], pulses: [{ energy: 2, mood: 4, at: '2026-09-29T08:00:00.000Z' }, { energy: 4, stress: 2, at: '2026-09-29T12:00:00.000Z' }] };
    life.ensureLife(s, at('2026-09-29', '13:00'));
    const pulse = life.pulseToday(s, at('2026-09-29', '13:00'));
    equal(pulse.energy, 4, 'the latest energy wins');
    equal(pulse.mood, 4, 'an earlier value is kept when not given again');
    equal(pulse.stress, 2);
    equal(life.pulseToday(s, at('2026-09-30', '09:00')), null, 'a new day starts without a pulse');
  });
  test('the engine sees today’s pulse without it being copied into stored data', () => {
    const s = liveV8State();
    life.ensureLife(s, at('2026-09-29', '09:00'));
    const view = life.engineView(s, at('2026-09-29', '09:00'));
    equal(A.model.pulseFor(view, '2026-09-29').energy, 1);
    equal((s.life.days['2026-09-29'] || { pulses: [] }).pulses.length, 0, 'stored life slice untouched');
    equal(life.energyToday(s, at('2026-09-29', '09:00')), 1);
  });
  test('a low-energy check-in makes Aura offer Low Energy Mode', () => {
    const s = liveV8State();
    life.ensureLife(s, at('2026-09-29', '09:00'));
    life.commitLife(s, [{ op: 'item.add', item: { title: 'Städa hallen', date: '2026-09-29' } }], { now: at('2026-09-29', '09:00') });
    const sug = A.engine.suggestion(life.engineView(s, at('2026-09-29', '09:00')), at('2026-09-29', '09:00'));
    equal(sug && sug.kind, 'mode');
    equal(sug.mode, 'low');
  });

  suite('3. Every change can be undone', () => {});
  test('undo and redo restore the exact previous everyday state', () => {
    const s = storage.createInitialState();
    life.resetHistory();
    life.ensureLife(s, at('2026-09-29', '09:00'));
    const r = life.commitLife(s, [{ op: 'item.add', item: { title: 'Ring banken' } }], { now: at('2026-09-29', '09:00') });
    equal(r.applied.length, 1);
    life.commitLife(s, [{ op: 'item.done', id: r.ids[0] }], { now: at('2026-09-29', '09:05') });
    equal(s.life.items[0].status, 'done');
    assert(life.undoLife(s));
    equal(s.life.items[0].status, 'open');
    assert(life.redoLife(s));
    equal(s.life.items[0].status, 'done');
  });
  test('quiet daily housekeeping is not something the person can undo by accident', () => {
    const s = storage.createInitialState();
    life.resetHistory();
    life.ensureLife(s, at('2026-09-29', '09:00'));
    life.commitLife(s, [{ op: 'day.planned', date: '2026-09-29', picked: [] }], { now: at('2026-09-29', '09:00'), system: true });
    equal(life.canUndo(), false);
  });
  test('ops that cannot apply change nothing and are reported', () => {
    const s = storage.createInitialState();
    life.ensureLife(s);
    const before = JSON.stringify(s.life);
    const r = life.commitLife(s, [{ op: 'item.done', id: 'does-not-exist' }]);
    equal(r.applied.length, 0);
    equal(r.skipped.length, 1);
    equal(JSON.stringify(s.life), before);
  });

  suite('4. The daily rhythm', () => {});
  test('before waking Aura leaves the day alone; after, it plans once and prunes once', () => {
    const s = storage.createInitialState();
    life.ensureLife(s, at('2026-09-29', '05:00'));
    life.commitLife(s, [{ op: 'item.add', item: { title: 'Läsa ut boken', priority: 'later' } }], { now: at('2026-09-29', '05:00') });
    life.housekeepLife(s, at('2026-09-29', '05:00'));
    equal(A.model.getDay(s.life, '2026-09-29').planned, null, 'no plan at 05:00 with wake 07:00');
    assert(life.housekeepLife(s, at('2026-09-29', '07:30')), 'plans after waking');
    assert(A.model.getDay(s.life, '2026-09-29').planned, 'planned');
    equal(s.life.meta.lastCompacted, '2026-09-29');
    equal(life.housekeepLife(s, at('2026-09-29', '12:00')), false, 'nothing more to do the same day');
  });

  suite('5. Privacy', () => {});
  test('the coach request (Gemini, via the Vercel function) carries no plans, lists or journal', () => {
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    const start = app.indexOf('fetch("/api/coach"');
    assert(start > 0, 'coach request found');
    const body = app.slice(start, app.indexOf('})', start));
    for (const word of ['life', 'journal', 'tarot', 'cycle.events', 'toolbox']) assert(!body.includes(word), `request body mentions ${word}`);
  });
  test('the everyday code never talks to the network', () => {
    for (const file of ['life.js', 'everyday.js']) {
      const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
      assert(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(text), `${file} makes network requests`);
    }
  });

  process.exit(report() ? 0 : 1);
})();
