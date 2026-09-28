/* Unit tests: storage (per-user db slices, fallback, undo, sync) and AI validation, with a simulated platform. */
const H = require('./harness');
const { suite, testAsync, test, assert, equal, deepEqual, at, TODAY } = H;
const A = H.loadCore();

/* ---- a simulated claude.ai runtime ---- */
function fakeLocalStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
function fakeDb(shared) {
  const docs = shared || new Map();
  const listeners = new Map();
  const notify = (path) => {
    for (const fn of listeners.get(path) || []) {
      const v = docs.get(path);
      fn({ exists: !!v, data: () => v, metadata: { hasPendingWrites: false, fromCache: false } });
    }
  };
  return {
    docs, writes: [],
    doc(path) {
      const self = this;
      if (path.split('/').length % 2 !== 0) throw new TypeError('odd path');
      return {
        get: async () => ({ exists: docs.has(path), data: () => docs.get(path), metadata: {} }),
        set: async (body) => { self.writes.push(path); docs.set(path, JSON.parse(JSON.stringify(body))); notify(path); },
        delete: async () => { docs.delete(path); },
        onSnapshot: (fn) => { const l = listeners.get(path) || []; l.push(fn); listeners.set(path, l); return () => {}; },
      };
    },
  };
}
function installRuntime({ uid, db, sample }) {
  globalThis.claude = {
    use: async (name) => {
      if (name === 'user') return uid === undefined ? null : { id: async () => uid };
      if (name === 'db') return db || null;
      if (name === 'sample') return sample || null;
      return null;
    },
  };
}
globalThis.localStorage = fakeLocalStorage();
H.loadApp(['app/platform.js', 'app/storage.js', 'app/ai.js']);
const S = A.store;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  suite('20. Storage', () => {});
  await testAsync('with a viewer id and db, data goes to that viewer’s private subtree, one doc per slice', async () => {
    const db = fakeDb();
    installRuntime({ uid: 'u_alice', db });
    await S.init();
    equal(S.mode, 'cloud');
    S.commit([{ op: 'item.add', item: { title: 'Water plants' } }, { op: 'prefs.set', patch: { name: 'Sam', onboarded: true } }]);
    await S.flush();
    const paths = Array.from(db.docs.keys()).sort();
    assert(paths.every((p) => p.startsWith('data/users/u_alice/')), paths.join(', '));
    assert(paths.includes('data/users/u_alice/items') && paths.includes('data/users/u_alice/core'));
    equal(db.docs.get('data/users/u_alice/items').data.items[0].title, 'Water plants');
  });
  await testAsync('only changed slices are written', async () => {
    const db = fakeDb();
    installRuntime({ uid: 'u_bob', db });
    await S.init();
    S.commit([{ op: 'item.add', item: { title: 'A' } }]);
    await S.flush();
    db.writes.length = 0;
    S.commit([{ op: 'day.pulse', date: TODAY, energy: 3 }]);
    await S.flush();
    deepEqual(db.writes.sort(), ['data/users/u_bob/days', 'data/users/u_bob/log'].sort());
  });
  await testAsync('a reload restores everything from the cloud', async () => {
    const shared = new Map();
    installRuntime({ uid: 'u_cara', db: fakeDb(shared) });
    await S.init();
    S.commit([{ op: 'item.add', item: { title: 'Survives reload' } }, { op: 'routine.add', routine: { name: 'Evening', steps: ['Tidy'] } }]);
    await S.flush();
    globalThis.localStorage = fakeLocalStorage();   // a different browser, same account
    installRuntime({ uid: 'u_cara', db: fakeDb(shared) });
    await S.init();
    equal(S.state.items[0].title, 'Survives reload');
    equal(S.state.routines[0].name, 'Evening');
  });
  await testAsync('two people never see each other’s data', async () => {
    const shared = new Map();
    installRuntime({ uid: 'u_one', db: fakeDb(shared) });
    await S.init();
    S.commit([{ op: 'item.add', item: { title: 'Private to one' } }]);
    await S.flush();
    installRuntime({ uid: 'u_two', db: fakeDb(shared) });
    await S.init();
    equal(S.state.items.length, 0);
  });
  await testAsync('no platform: saved in this browser, and it says so', async () => {
    delete globalThis.claude;
    globalThis.localStorage = fakeLocalStorage();
    await S.init();
    equal(S.mode, 'local');
    S.commit([{ op: 'item.add', item: { title: 'Local thing' } }]);
    await S.init();
    equal(S.state.items[0].title, 'Local thing');
    A.i18n.setLanguage('en');
    equal(S.statusText(), 'Saved in this browser only');
  });
  await testAsync('storage blocked: memory mode, honestly labelled', async () => {
    delete globalThis.claude;
    globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
    await S.init();
    equal(S.mode, 'memory');
    equal(S.statusText(), 'Not saved — this browser blocks storage');
    globalThis.localStorage = fakeLocalStorage();
  });
  await testAsync('a db failure on load falls back to this browser instead of breaking', async () => {
    const broken = { doc() { return { get: async () => { throw { code: 'unavailable' }; } }; } };
    installRuntime({ uid: 'u_x', db: broken });
    await S.init();
    equal(S.mode, 'local');
    equal(S.lastError, 'unavailable');
  });
  await testAsync('undo and redo', async () => {
    delete globalThis.claude;
    await S.init();
    const before = S.state.items.length;
    S.commit([{ op: 'item.add', item: { title: 'Undo me' } }]);
    assert(S.canUndo());
    S.undo();
    equal(S.state.items.length, before);
    S.redo();
    equal(S.state.items.length, before + 1);
  });
  await testAsync('system bookkeeping is not undoable', async () => {
    delete globalThis.claude;
    await S.init();
    while (S.canUndo()) S.undo();
    S.commit([{ op: 'day.planned', date: TODAY, picked: [] }], { system: true });
    equal(S.canUndo(), false);
  });
  await testAsync('another device’s change arrives live and clears undo', async () => {
    const shared = new Map();
    const db1 = fakeDb(shared);
    installRuntime({ uid: 'u_sync', db: db1 });
    await S.init();
    S.commit([{ op: 'item.add', item: { title: 'Mine' } }]);
    await S.flush();
    const body = shared.get('data/users/u_sync/items');
    const other = JSON.parse(JSON.stringify(body));
    other.data.items.push(A.model.newItem({ title: 'From phone' }));
    other.writer = 'ses_other';
    other.savedAt = new Date(Date.now() + 1000).toISOString();
    await db1.doc('data/users/u_sync/items').set(other);
    await sleep(5);
    assert(S.state.items.some((i) => i.title === 'From phone'));
    equal(S.canUndo(), false);
  });
  await testAsync('erase all deletes the cloud documents and this browser’s copy', async () => {
    const db = fakeDb();
    installRuntime({ uid: 'u_erase', db });
    await S.init();
    S.commit([{ op: 'item.add', item: { title: 'Gone soon' } }]);
    await S.flush();
    await S.eraseAll();
    equal(Array.from(db.docs.keys()).filter((k) => k.includes('u_erase')).length, 0);
    equal(S.state.items.length, 0);
  });
  await testAsync('import: a Min vardag export is read, previewed and merged', async () => {
    delete globalThis.claude;
    await S.init();
    const preview = S.readImport(JSON.stringify({ app: 'min-vardag', state: { children: [], tasks: [{ title: 'Boka tid', kind: 'uppgift', status: 'oppen' }] } }));
    assert(preview.ok);
    equal(preview.kind, 'min-vardag');
    equal(preview.counts.items, 1);
    S.applyImport(preview.state);
    assert(S.state.items.some((i) => i.title === 'Boka tid'));
    equal(S.readImport('not json').ok, false);
  });

  suite('21. AI validation (answers are untrusted)', () => {});
  await testAsync('AI parse: junk is dropped, fields are sanitised, people are never invented', async () => {
    const sample = Object.assign(async () => ({ text: '' }), {
      json: async () => ({ items: [
        { kind: 'shopping', title: 'Oat milk', category: 'weird', minutes: 9999 },
        { kind: 'hack', title: 'Something' },
        { kind: 'event', title: 'No time given' },
        { title: '' },
        { kind: 'task', title: 'Call Robin', forPerson: 'Robin', date: '1999-01-01' },
      ] }),
    });
    installRuntime({ uid: 'u_ai', db: null, sample });
    A.ai._reset();
    const s = H.freshState(A);
    const r = await A.ai.parseDump(s, 'oat milk, something, call Robin', at(TODAY, '10:00'));
    equal(r.mode, 'ai');
    equal(r.candidates.length, 4);
    equal(r.candidates[0].category, 'dairy');
    equal(r.candidates[0].minutes, 480);
    equal(r.candidates[1].kind, 'task', 'unknown kind becomes a task');
    equal(r.candidates[2].kind, 'task', 'an event without a time is not an event');
    equal(r.candidates[3].forPerson, '', 'Robin is not a known person');
    equal(r.candidates[3].date, '', 'far-past dates are dropped');
  });
  await testAsync('AI failure falls back to the rules and says why', async () => {
    const sample = Object.assign(async () => ({ text: '' }), { json: async () => { throw { code: 'rate_limited', message: 'x' }; } });
    installRuntime({ uid: 'u_ai', sample });
    A.ai._reset();
    const s = H.freshState(A);
    const r = await A.ai.parseDump(s, 'buy milk', at(TODAY, '10:00'));
    equal(r.mode, 'rules');
    equal(r.note, 'ai.err.rate');
    equal(r.candidates[0].title, 'Milk');
  });
  await testAsync('AI turned off in settings: never called', async () => {
    let called = false;
    const sample = Object.assign(async () => { called = true; return { text: '' }; }, { json: async () => { called = true; return {}; } });
    installRuntime({ uid: 'u_ai', sample });
    A.ai._reset();
    const s = H.freshState(A);
    s.prefs.ai.enabled = false;
    const r = await A.ai.parseDump(s, 'buy milk', at(TODAY, '10:00'));
    equal(r.mode, 'rules');
    equal(called, false);
  });
  await testAsync('coach: proposed actions must reference real ids and known shapes', async () => {
    const s0 = H.freshState(A);
    const s = H.addItems(A, s0, [{ title: 'Clean oven', date: TODAY }]);
    const id = s.items[0].id;
    const sample = async (input, opts) => {
      const text = `Start small with the oven.\n<actions>[{"op":"smaller","id":"${id}","first":"Soak the racks","minutes":5},{"op":"done","id":"fake"},{"op":"delete_everything"},{"op":"move","id":"${id}","to":"2099-01-01"}]</actions>`;
      if (opts.onText) opts.onText({ text, delta: text });
      return { text, truncated: false };
    };
    installRuntime({ uid: 'u_ai', sample });
    A.ai._reset();
    let streamed = '';
    const r = await A.ai.coach(s, [{ role: 'user', content: 'Help me get started' }], at(TODAY, '10:00'), { onText: (t) => { streamed = t; } });
    assert(r.ok);
    equal(r.reply, 'Start small with the oven.');
    equal(streamed, 'Start small with the oven.', 'the actions line never shows while streaming');
    equal(r.actions.length, 1);
    equal(r.actions[0].op, 'item.split');
  });
  test('the AI context carries no notes, reflections, cycle data or people list', () => {
    let s = H.freshState(A);
    s = H.addItems(A, s, [{ title: 'Visible title', note: 'SECRET NOTE', date: TODAY }]);
    s.journal.push({ id: 'j', date: TODAY, text: 'SECRET JOURNAL' });
    s.cycle.entries.push({ date: TODAY, period: true, note: 'SECRET CYCLE' });
    s.people.push({ id: 'p', name: 'SECRETPERSON' });
    const json = JSON.stringify(A.ai.contextFor(s, at(TODAY, '10:00')));
    assert(json.includes('Visible title'));
    assert(!/SECRET/.test(json), json);
  });

  process.exit(H.report() ? 0 : 1);
})();
