/* Min vardag — lagring.
 *
 * Primärt: artefaktens db-kapacitet (åtkomstskyddad, endast ägaren).
 * Reserv: webbläsarens localStorage, så att appen fungerar även utan db.
 *
 * Ångra bygger på ögonblicksbilder: varje ändring sparar föregående
 * tillstånd, så att den kan tas tillbaka.
 */
(function (root) {
  const MV = root.MinVardag || (root.MinVardag = {});
  const U = MV.util, M = MV.model;

  const DOC_PATH = 'vardag/tillstand';
  const LOCAL_KEY = 'min-vardag:tillstand:v1';
  const UNDO_LIMIT = 15;

  const store = {
    db: null,
    ready: false,
    mode: 'lokalt',     // 'moln' | 'lokalt' | 'minne'
    state: null,
    undoStack: [],
    redoStack: [],
    listeners: [],
    lastError: null,
    writing: Promise.resolve(),
  };

  function emit() {
    for (const fn of store.listeners) {
      try { fn(store.state); } catch (e) { console.error(e); }
    }
  }

  function onChange(fn) { store.listeners.push(fn); return () => {
    store.listeners = store.listeners.filter((f) => f !== fn);
  }; }

  function readLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? M.migrate(JSON.parse(raw)) : null;
    } catch (e) { return null; }
  }

  function writeLocal(state) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(state)); return true; }
    catch (e) { return false; }
  }

  /** Startar lagringen. Appen ritas redan innan detta är klart. */
  async function init() {
    // Lokalt först, så att något visas direkt även om db dröjer.
    store.state = readLocal() || M.emptyState();
    store.mode = 'lokalt';
    store.ready = true;
    emit();

    let db = null;
    try { db = await root.claude?.use?.('db'); } catch (e) { db = null; }
    if (!db) {
      // Ingen säker molnlagring: appen fortsätter lokalt, och säger det.
      store.mode = localStorageWorks() ? 'lokalt' : 'minne';
      emit();
      return store;
    }

    store.db = db;
    try {
      const snap = await db.doc(DOC_PATH).get();
      if (snap.exists) {
        const remote = M.migrate(snap.data().state || snap.data());
        // Molnet vinner: det är den skyddade, delade sanningen.
        store.state = remote;
        writeLocal(remote);
      } else if (store.state && (store.state.children.length || store.state.needs.length || store.state.tasks.length)) {
        await db.doc(DOC_PATH).set({ state: store.state, savedAt: new Date().toISOString() });
      }
      store.mode = 'moln';
      store.lastError = null;
    } catch (error) {
      store.lastError = error && error.code ? error.code : 'okant';
      store.mode = localStorageWorks() ? 'lokalt' : 'minne';
    }
    emit();
    return store;
  }

  function localStorageWorks() {
    try { localStorage.setItem('__mv', '1'); localStorage.removeItem('__mv'); return true; }
    catch (e) { return false; }
  }

  /** Sparar. Skrivningar köas så att bara en pågår i taget per dokument. */
  function persist(state) {
    writeLocal(state);
    if (!store.db) return Promise.resolve();
    store.writing = store.writing
      .then(() => store.db.doc(DOC_PATH).set({ state, savedAt: new Date().toISOString() }))
      .then(() => { store.lastError = null; })
      .catch((error) => {
        store.lastError = error && error.code ? error.code : 'okant';
        if (store.mode === 'moln') { store.mode = 'lokalt'; emit(); }
      });
    return store.writing;
  }

  /**
   * Tillämpar ändringar, sparar och gör dem ångerbara.
   * @returns {{applied:string[], skipped:string[]}}
   */
  function commit(ops, now) {
    const before = store.state;
    const result = MV.apply.applyOps(before, ops, now || new Date());
    if (!result.applied.length) return result;

    store.undoStack.push(before);
    if (store.undoStack.length > UNDO_LIMIT) store.undoStack.shift();
    store.redoStack = [];
    store.state = result.state;
    persist(store.state);
    emit();
    return result;
  }

  /** Ändrar tillståndet direkt (inställningar, barn). Också ångerbart. */
  function update(fn, label) {
    const before = store.state;
    const next = U.clone(before);
    fn(next);
    next.updatedAt = new Date().toISOString();
    store.undoStack.push(before);
    if (store.undoStack.length > UNDO_LIMIT) store.undoStack.shift();
    store.redoStack = [];
    store.state = next;
    persist(next);
    emit();
    return label || 'Ändrat';
  }

  function canUndo() { return store.undoStack.length > 0; }

  function undo() {
    if (!store.undoStack.length) return false;
    store.redoStack.push(store.state);
    store.state = store.undoStack.pop();
    persist(store.state);
    emit();
    return true;
  }

  function redo() {
    if (!store.redoStack.length) return false;
    store.undoStack.push(store.state);
    store.state = store.redoStack.pop();
    persist(store.state);
    emit();
    return true;
  }

  /** Raderar allt, både i molnet och lokalt. Går inte att ångra. */
  async function eraseAll() {
    store.undoStack = []; store.redoStack = [];
    store.state = M.emptyState();
    try { localStorage.removeItem(LOCAL_KEY); } catch (e) { /* strunt samma */ }
    if (store.db) {
      try { await store.db.doc(DOC_PATH).delete(); } catch (e) { store.lastError = e.code || 'okant'; }
    }
    emit();
  }

  function exportJson() {
    return JSON.stringify({ app: 'min-vardag', exportedAt: new Date().toISOString(), state: store.state }, null, 2);
  }

  function statusText() {
    if (store.mode === 'moln') return 'Sparas skyddat';
    if (store.mode === 'lokalt') return 'Sparas i webbläsaren';
    return 'Sparas inte';
  }

  MV.store = {
    init, onChange, commit, update, undo, redo, canUndo, eraseAll, exportJson,
    statusText, persist,
    get state() { return store.state; },
    get mode() { return store.mode; },
    get ready() { return store.ready; },
    get lastError() { return store.lastError; },
    get undoDepth() { return store.undoStack.length; },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
