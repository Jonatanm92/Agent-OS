/* Aura — storage.
 *
 * Where a person's Aura lives:
 *   cloud   The platform's db, under data/users/<their id>/ — private to that
 *           person, even from the page's owner. One document per slice
 *           (core, items, days, log, cycle, journal) keeps each one small.
 *           A copy is cached in this browser, keyed to that person, so the
 *           app opens instantly and survives a flaky connection.
 *   local   This browser only (no platform, or storage not granted).
 *   memory  Nothing is saved (the browser blocks storage). The app says so.
 *
 * The app never claims a stronger mode than the one actually working.
 * Every change goes through ops, so it can be undone.
 */
(function (root) {
  const A = root.Aura || (root.Aura = {});
  const U = A.util, M = A.model, PF = A.platform;

  A.i18n.add({
    'st.cloud': ['Sparas privat på ditt konto', 'Saved privately to your account'],
    'st.cloudError': ['Sparas i webbläsaren — kontot svarar inte just nu', "Saved in this browser — your account isn't responding right now"],
    'st.local': ['Sparas bara i den här webbläsaren', 'Saved in this browser only'],
    'st.memory': ['Sparas inte — webbläsaren blockerar lagring', 'Not saved — this browser blocks storage'],
  });

  const LOCAL_KEY = 'aura:v1:local';
  const CACHE_PREFIX = 'aura:v1:cache:';
  const SLICES = ['core', 'items', 'days', 'log', 'cycle', 'journal'];
  const SESSION = U.makeId('ses');
  const UNDO_LIMIT = 20;
  const DEBOUNCE_MS = 400;
  const SHARD_TARGET = 170000;   // bytes per document, well under the platform's 256 KiB
  const SHARDED = { items: 'items', log: 'log', journal: 'journal' };   // slices that are one growing list

  const store = {
    state: null, mode: 'memory', ready: false, uid: null, db: null,
    undo: [], redo: [], listeners: [], lastError: null,
    lastSaved: {}, lastRemote: {}, pending: new Set(), timer: null, chains: {}, unsubs: [],
    remoteNote: false, shards: {},
  };

  function slice(state, name) {
    switch (name) {
      // meta.updatedAt ticks on every change; leaving it out keeps core from being rewritten each time.
      case 'core': return { schema: state.schema, app: state.app, prefs: state.prefs, events: state.events, routines: state.routines, projects: state.projects, people: state.people, meta: Object.assign({}, state.meta, { updatedAt: undefined }) };
      case 'items': return { items: state.items.map(M.packItem) };
      case 'days': return { days: state.days };
      case 'log': return { log: state.log };
      case 'cycle': return { cycle: state.cycle };
      case 'journal': return { journal: state.journal };
      default: return {};
    }
  }

  function assemble(parts) {
    return M.migrate(Object.assign({ app: 'aura' }, parts.core || {}, parts.items || {}, parts.days || {},
      parts.log || {}, parts.cycle || {}, parts.journal || {}));
  }

  function emit() {
    for (const fn of store.listeners) {
      try { fn(store.state); } catch (e) { /* a broken listener must not break saving */ }
    }
  }

  function onChange(fn) {
    store.listeners.push(fn);
    return () => { store.listeners = store.listeners.filter((f) => f !== fn); };
  }

  function cacheKey() { return store.uid ? CACHE_PREFIX + U.hash(store.uid).toString(36) : LOCAL_KEY; }

  function docPath(name) { return `data/users/${store.uid}/${name}`; }
  function shardName(name, k) { return k === 1 ? name : `${name}-${k}`; }

  /** A slice's data, with any extra shard documents joined back on. */
  async function withShards(name, body) {
    const data = Object.assign({}, body.data || {});
    const n = Math.max(1, Number(body.shards) || 1);
    store.shards[name] = n;
    const key = SHARDED[name];
    if (n > 1 && key) {
      const extra = await Promise.all(Array.from({ length: n - 1 }, (_, i) => store.db.doc(docPath(shardName(name, i + 2))).get()));
      data[key] = (data[key] || []).concat(...extra.map((snap) => (snap && snap.exists ? ((snap.data() || {}).data || {})[key] || [] : [])));
    }
    return data;
  }

  /** Split a list slice into chunks that each fit a document. */
  function chunk(name, body) {
    const key = SHARDED[name];
    const json = JSON.stringify(body);
    if (!key || json.length <= SHARD_TARGET) return [body];
    const out = [];
    let cur = [], size = 0;
    for (const entry of body[key]) {
      const len = JSON.stringify(entry).length + 1;
      if (cur.length && size + len > SHARD_TARGET) { out.push({ [key]: cur }); cur = []; size = 0; }
      cur.push(entry); size += len;
    }
    out.push({ [key]: cur });
    return out;
  }

  function hasContent(s) {
    return !!(s && (s.prefs.onboarded || s.items.length || s.events.length || s.routines.length));
  }

  /* ---------------- start ---------------- */

  async function init() {
    const user = await PF.use('user');
    let uid = null;
    if (user && typeof user.id === 'function') {
      try { uid = await user.id(); } catch (e) { uid = null; }
    }
    const db = uid ? await PF.use('db') : null;
    store.uid = uid;

    if (db && uid) {
      store.db = db;
      try {
        const parts = {};
        let found = 0;
        const snaps = await Promise.all(SLICES.map((name) => db.doc(docPath(name)).get()));
        for (let i = 0; i < snaps.length; i += 1) {
          const snap = snaps[i];
          if (!snap || !snap.exists) continue;
          const name = SLICES[i];
          const body = snap.data() || {};
          parts[name] = await withShards(name, body);
          store.lastRemote[name] = body.savedAt || '';
          found += 1;
        }
        if (found) {
          store.state = assemble(parts);
          for (const name of SLICES) store.lastSaved[name] = JSON.stringify(slice(store.state, name));
        } else {
          // First visit on this account: bring along anything made in this browser before signing in.
          const local = PF.readLocal(LOCAL_KEY);
          store.state = local && hasContent(M.migrate(local)) ? M.migrate(local) : M.emptyState();
          store.lastSaved = {};
        }
        store.mode = 'cloud';
        store.lastError = null;
        PF.writeLocal(cacheKey(), store.state);
        subscribe();
        if (!found && hasContent(store.state)) schedule(true);
      } catch (error) {
        store.lastError = (error && error.code) || 'unavailable';
        store.db = null;
        loadLocal();
      }
    } else {
      loadLocal();
    }
    store.ready = true;
    emit();
    return store;
  }

  function loadLocal() {
    const raw = PF.readLocal(cacheKey()) || PF.readLocal(LOCAL_KEY);
    store.state = raw ? M.migrate(raw) : M.emptyState();
    store.mode = PF.localStorageWorks() ? 'local' : 'memory';
  }

  /** Tests and previews: start from a given state without any platform. */
  function initWith(state, mode) {
    store.state = M.migrate(state);
    store.mode = mode || 'memory';
    store.ready = true;
    emit();
  }

  /* ---------------- live updates from other devices ---------------- */

  function subscribe() {
    for (const off of store.unsubs) { try { off(); } catch (e) { /* already closed */ } }
    store.unsubs = [];
    for (const name of SLICES) {
      try {
        const off = store.db.doc(docPath(name)).onSnapshot(async (snap) => {
          if (!snap || !snap.exists || snap.metadata && snap.metadata.hasPendingWrites) return;
          const body = snap.data() || {};
          if (body.writer === SESSION) return;
          if (body.savedAt && store.lastRemote[name] && body.savedAt <= store.lastRemote[name]) return;
          store.lastRemote[name] = body.savedAt || '';
          let data;
          try { data = await withShards(name, body); } catch (e) { return; }
          const incoming = JSON.stringify(data);
          if (incoming === JSON.stringify(slice(store.state, name))) { store.lastSaved[name] = incoming; return; }
          const parts = {};
          for (const n of SLICES) parts[n] = slice(store.state, n);
          parts[name] = data;
          store.state = assemble(parts);
          store.lastSaved[name] = JSON.stringify(slice(store.state, name));
          store.undo = []; store.redo = [];   // undo must never jump over another device's change
          store.remoteNote = true;
          PF.writeLocal(cacheKey(), store.state);
          emit();
        }, (error) => {
          store.lastError = (error && error.code) || 'unavailable';
          if (error && error.code === 'revoked') { store.mode = PF.localStorageWorks() ? 'local' : 'memory'; store.db = null; }
          emit();
        });
        store.unsubs.push(off);
      } catch (e) { /* subscriptions are a bonus; saving still works */ }
    }
  }

  /* ---------------- saving ---------------- */

  function schedule(immediate) {
    PF.writeLocal(cacheKey(), store.state);
    if (!store.db) return;
    clearTimeout(store.timer);
    store.timer = setTimeout(flushNow, immediate ? 0 : DEBOUNCE_MS);
  }

  function flushNow() {
    if (!store.db) return Promise.resolve();
    const writes = [];
    for (const name of SLICES) {
      const body = slice(store.state, name);
      const json = JSON.stringify(body);
      if (json === store.lastSaved[name]) continue;
      const parts = chunk(name, body);
      if (parts.some((p) => JSON.stringify(p).length > 250000)) { store.lastError = 'too_large'; continue; }
      store.lastSaved[name] = json;
      writes.push(write(name, parts));
    }
    return Promise.all(writes);
  }

  /** Write a slice: extra shards first, the primary document last (it carries the shard count). */
  function write(name, parts) {
    const savedAt = new Date().toISOString();
    const previous = store.shards[name] || 1;
    store.pending.add(name);
    const run = async () => {
      for (let k = 2; k <= parts.length; k += 1) {
        await store.db.doc(docPath(shardName(name, k))).set({ v: 1, app: 'aura', data: parts[k - 1], savedAt, writer: SESSION, shard: k });
      }
      await store.db.doc(docPath(name)).set({ v: 1, app: 'aura', data: parts[0], savedAt, writer: SESSION, shards: parts.length });
      for (let k = parts.length + 1; k <= previous; k += 1) await store.db.doc(docPath(shardName(name, k))).delete();
      store.shards[name] = parts.length;
    };
    store.chains[name] = (store.chains[name] || Promise.resolve())
      .then(run)
      .catch((error) => {
        if (error && error.code === 'unavailable') {
          return new Promise((r) => setTimeout(r, 400 + Math.random() * 800)).then(run);
        }
        throw error;
      })
      .then(() => {
        store.lastRemote[name] = savedAt;
        if (store.lastError !== 'too_large') store.lastError = null;
      })
      .catch((error) => {
        store.lastError = (error && error.code) || 'unavailable';
        store.lastSaved[name] = '';   // try again with the next change
        if (error && error.code === 'revoked') { store.db = null; store.mode = PF.localStorageWorks() ? 'local' : 'memory'; }
      })
      .then(() => { store.pending.delete(name); emit(); });
    return store.chains[name];
  }

  function flush() {
    clearTimeout(store.timer);
    return flushNow().then(() => Promise.all(Object.values(store.chains)));
  }

  /* ---------------- changing ---------------- */

  function pushUndo(before) {
    store.undo.push(before);
    if (store.undo.length > UNDO_LIMIT) store.undo.shift();
    store.redo = [];
  }

  /**
   * Apply ops, save, make undoable.
   * opts.system: bookkeeping the user did not do (morning plan, retention) — not undoable.
   */
  function commit(ops, opts) {
    const o = opts || {};
    const before = store.state;
    const result = A.apply.applyOps(before, ops, o.now || new Date());
    if (!result.applied.length) return result;
    if (!o.system) pushUndo(before);
    store.state = result.state;
    schedule();
    emit();
    return result;
  }

  /** Bookkeeping replacement (retention): saved, not undoable, never announced. */
  function housekeep(state) {
    store.state = M.migrate(state);
    schedule();
    emit();
  }

  /** Replace the whole state (import, restart onboarding). Undoable. */
  function replace(state) {
    pushUndo(store.state);
    store.state = M.migrate(state);
    schedule();
    emit();
  }

  function canUndo() { return store.undo.length > 0; }
  function canRedo() { return store.redo.length > 0; }

  function undo() {
    if (!store.undo.length) return false;
    store.redo.push(store.state);
    store.state = store.undo.pop();
    schedule();
    emit();
    return true;
  }

  function redo() {
    if (!store.redo.length) return false;
    store.undo.push(store.state);
    store.state = store.redo.pop();
    schedule();
    emit();
    return true;
  }

  /** Delete everything — cloud and this browser. Cannot be undone. */
  async function eraseAll() {
    store.undo = []; store.redo = [];
    clearTimeout(store.timer);
    const fresh = M.emptyState();
    fresh.prefs.language = store.state ? store.state.prefs.language : '';
    store.state = fresh;
    PF.removeLocal(cacheKey());
    PF.removeLocal(LOCAL_KEY);
    if (store.db) {
      await Promise.all(Object.values(store.chains)).catch(() => {});
      const docs = [];
      for (const name of SLICES) for (let k = 1; k <= (store.shards[name] || 1); k += 1) docs.push(shardName(name, k));
      await Promise.all(docs.map((d) => store.db.doc(docPath(d)).delete().catch((e) => { store.lastError = (e && e.code) || 'unavailable'; })));
      store.shards = {};
      store.lastSaved = {};
    }
    emit();
  }

  function exportJson() {
    return JSON.stringify({ app: 'aura', schema: M.SCHEMA, exportedAt: new Date().toISOString(), state: store.state }, null, 2);
  }

  /** Read an Aura or Min vardag export. Returns a preview; nothing changes until applied. */
  function readImport(text) {
    let raw;
    try { raw = JSON.parse(text); } catch (e) { return { ok: false, error: 'json' }; }
    const body = raw && raw.state ? raw.state : raw;
    if (!body || typeof body !== 'object') return { ok: false, error: 'shape' };
    const isMv = raw.app === 'min-vardag' || !!(body.children || body.needs || body.weekTemplate);
    const isAura = body.app === 'aura' || raw.app === 'aura';
    if (!isMv && !isAura) return { ok: false, error: 'shape' };
    const state = isMv ? M.fromMinVardag(body) : M.migrate(body);
    return {
      ok: true, kind: isMv ? 'min-vardag' : 'aura', state,
      counts: { items: state.items.length, events: state.events.length, routines: state.routines.length, projects: state.projects.length },
    };
  }

  /** Merge an import into the current Aura: adds what is new, keeps what exists. */
  function applyImport(imported) {
    const cur = store.state;
    const next = U.clone(cur);
    const ids = (list) => new Set(list.map((x) => x.id));
    for (const key of ['items', 'events', 'routines', 'projects', 'people', 'journal']) {
      const have = ids(next[key]);
      for (const x of imported[key] || []) if (!have.has(x.id)) next[key].push(x);
    }
    if (!hasContent(cur)) {
      next.prefs = Object.assign({}, next.prefs, imported.prefs, { onboarded: cur.prefs.onboarded || imported.prefs.onboarded });
    }
    next.meta.importedFrom = imported.meta.importedFrom || 'aura';
    replace(next);
  }

  function statusText() {
    const t = A.i18n.t;
    if (store.mode === 'cloud') return store.lastError ? t('st.cloudError') : t('st.cloud');
    if (store.mode === 'local') return t('st.local');
    return t('st.memory');
  }

  function takeRemoteNote() { const v = store.remoteNote; store.remoteNote = false; return v; }

  if (root.addEventListener) {
    root.addEventListener('pagehide', () => { flush(); });
    if (root.document) root.document.addEventListener('visibilitychange', () => { if (root.document.hidden) flush(); });
  }

  A.store = {
    init, initWith, onChange, commit, replace, housekeep, undo, redo, canUndo, canRedo, eraseAll, exportJson,
    readImport, applyImport, statusText, flush, takeRemoteNote, slice, assemble, SLICES,
    get state() { return store.state; },
    get mode() { return store.mode; },
    get ready() { return store.ready; },
    get lastError() { return store.lastError; },
    get saving() { return store.pending.size > 0; },
    get hasIdentity() { return !!store.uid; },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
