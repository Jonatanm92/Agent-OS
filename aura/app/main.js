/* Aura — start-up and the daily rhythm of the app itself. */
(function (root) {
  const A = root.Aura;
  const U = A.util, I = A.i18n, M = A.model, P = A.planner, S = A.store;
  const UI = A.ui;
  const doc = root.document;

  /**
   * Once per day, quietly: prune old details, then let Aura pick a few
   * things into today when there is room. Neither is an undoable user
   * action; both are visible (the home screen says what Aura added).
   */
  function housekeeping() {
    const state = S.state;
    if (!state || !state.prefs.onboarded) return;
    const now = new Date();
    U.setTimeZone(state.prefs.timeZone);
    const key = U.dateKey(now);
    if (state.meta.lastCompacted !== key) {
      const r = A.compact.compact(state, now);
      S.housekeep(r.state);
    }
    const day = M.getDay(S.state, key);
    const wake = U.toMinutes(S.state.prefs.wake) ?? 420;
    if (!day.planned && U.minutesOfDay(now) >= wake - 60) {
      const plan = P.autoPlan(S.state, now);
      S.commit(plan.ops.length ? plan.ops : [{ op: 'day.planned', date: key, picked: [] }], { now, system: true });
    }
  }

  let frame = 0;
  function scheduleRender() {
    if (frame) return;
    frame = (root.requestAnimationFrame || ((fn) => setTimeout(fn, 16)))(() => { frame = 0; UI.render(); });
  }

  function typing() {
    const a = doc.activeElement;
    return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  }

  async function boot() {
    await S.init();
    const state = S.state;
    I.setLanguage(state.prefs.language || I.guessLanguage(root.navigator && root.navigator.language));
    U.setTimeZone(state.prefs.timeZone);
    housekeeping();

    const fromHash = (root.location.hash || '').replace('#', '');
    const start = !S.state.prefs.onboarded ? 'onboarding' : (UI.views[fromHash] && fromHash !== 'onboarding' ? fromHash : 'home');
    UI.ui.view = start;
    try { root.history.replaceState(null, '', `#${start}`); } catch (e) { /* framed pages may refuse; in-page navigation still works */ }
    UI.render({ scrollTop: true });
    S.onChange(scheduleRender);

    A.ai.probe().then(() => { if (!typing()) UI.render(); });

    setInterval(() => {
      housekeeping();
      if (!typing() && !UI.ui.sheet) UI.render();
    }, 30000);
    doc.addEventListener('visibilitychange', () => {
      if (!doc.hidden) { housekeeping(); if (!typing()) UI.render(); }
    });
  }

  boot().catch(() => {
    // Last resort: never leave a blank screen.
    const app = doc.getElementById('app');
    if (app) app.innerHTML = `<div class="splash"><p>${I.t('toast.error')}</p></div>`;
  });

  A.main = { housekeeping, boot };
})(typeof globalThis !== 'undefined' ? globalThis : this);
