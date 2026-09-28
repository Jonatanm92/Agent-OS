/* Aura — platform bridge.
 *
 * Aura runs as a claude.ai Artifact page. The platform may offer:
 *   user   — an opaque id for the person viewing (for their private storage)
 *   db     — a document store; data/users/<id>/ is private to that person,
 *            even from the page's owner
 *   sample — Claude, on the viewer's own account, with their consent
 * Any of them can be missing (opened as a plain file, in a test, in a view
 * that did not grant it). Every caller handles `null`.
 */
(function (root) {
  const A = root.Aura || (root.Aura = {});

  function hasRuntime() {
    return !!(root.claude && typeof root.claude.use === 'function');
  }

  /** claude.use(name) with a ceiling on waiting; resolves null when unavailable. */
  function use(name, timeoutMs) {
    if (!hasRuntime()) return Promise.resolve(null);
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, timeoutMs || 9000);
      Promise.resolve()
        .then(() => root.claude.use(name))
        .then((ns) => { if (!settled) { settled = true; clearTimeout(timer); resolve(ns || null); } })
        .catch(() => { if (!settled) { settled = true; clearTimeout(timer); resolve(null); } });
    });
  }

  function localStorageWorks() {
    try {
      root.localStorage.setItem('__aura', '1');
      root.localStorage.removeItem('__aura');
      return true;
    } catch (e) { return false; }
  }

  function readLocal(key) {
    try {
      const raw = root.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeLocal(key, value) {
    try { root.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  function removeLocal(key) {
    try { root.localStorage.removeItem(key); } catch (e) { /* storage blocked: nothing to remove */ }
  }

  A.platform = { hasRuntime, use, localStorageWorks, readLocal, writeLocal, removeLocal };
})(typeof globalThis !== 'undefined' ? globalThis : this);
