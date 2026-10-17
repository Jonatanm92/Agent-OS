// One timer at a time: a focus session (counts down) or presence mode with the
// kids (counts up). The timer lives in state, so it survives reloads.

import * as C from './core.js';

export function startTimer(store, { kind, label = '', durationMin = 0, kidIds = [] }) {
  store.update((s) => {
    s.timer = { kind, label: String(label).slice(0, 120), durationMin, kidIds, startedAt: Date.now(), pausedAt: null, pausedMs: 0 };
  });
}

export function pauseTimer(store) {
  store.update((s) => {
    if (s.timer && !s.timer.pausedAt) s.timer.pausedAt = Date.now();
  });
}

export function resumeTimer(store) {
  store.update((s) => {
    if (s.timer && s.timer.pausedAt) {
      s.timer.pausedMs += Date.now() - s.timer.pausedAt;
      s.timer.pausedAt = null;
    }
  });
}

// Ends the timer and records it. Returns what was logged.
export function finishTimer(store, { complete = false } = {}) {
  const state = store.get();
  const t = state.timer;
  if (!t) return null;
  const elapsedMin = complete && t.durationMin ? t.durationMin : Math.round(C.timerElapsedMs(t, Date.now()) / 60_000);
  const date = C.toKey(new Date(t.startedAt));
  const result = { kind: t.kind, minutes: elapsedMin, kidIds: t.kidIds, label: t.label, date };
  store.update((s) => {
    if (t.kind === 'focus' && elapsedMin >= 5) {
      s.focus.push({ id: C.uid('f'), date, minutes: elapsedMin, label: t.label, at: new Date().toISOString() });
    }
    if (t.kind === 'presence' && elapsedMin >= 1) {
      const day = C.ensureDay(s, date);
      const ids = t.kidIds.length ? t.kidIds : ['family'];
      for (const id of ids) day.dadMinutes[id] = (Number(day.dadMinutes[id]) || 0) + elapsedMin;
    }
    s.timer = null;
  });
  return result;
}

export function cancelTimer(store) {
  store.update((s) => {
    s.timer = null;
  });
}

export function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 1);
    });
    setTimeout(() => ctx.close(), 2000);
  } catch { /* audio unavailable */ }
}

export async function notify(title, body) {
  try {
    if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    if (reg && reg.showNotification) await reg.showNotification(title, { body, icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: 'life-os-timer' });
    else new Notification(title, { body });
  } catch { /* notifications unavailable */ }
}

export async function askNotificationPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  } catch { /* ignore */ }
}
