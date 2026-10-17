// Local-first persistence. The whole state is one JSON document in
// localStorage on this device; nothing leaves the device unless you export it,
// push a backup to your own Life OS server, or ask the Agent OS coach.

import { normalizeState } from './core.js';

export const STORAGE_KEY = 'life-os:v1';
export const THEME_KEY = 'life-os:theme';

let state = null;
let lastSaveOk = true;
const listeners = new Set();

function readRaw() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function load() {
  const raw = readRaw();
  let parsed = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Keep the unreadable copy instead of silently discarding it.
      try { localStorage.setItem(`${STORAGE_KEY}:corrupt:${Date.now()}`, raw); } catch { /* storage full */ }
    }
  }
  state = normalizeState(parsed);
  return state;
}

export function get() {
  return state;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(THEME_KEY, state.settings.theme);
    lastSaveOk = true;
  } catch {
    lastSaveOk = false;
  }
  return lastSaveOk;
}

export function saveOk() {
  return lastSaveOk;
}

function emit() {
  for (const fn of listeners) fn(state);
}

export function update(mutator, { silent = false } = {}) {
  mutator(state);
  state.updatedAt = new Date().toISOString();
  save();
  if (!silent) emit();
}

export function replace(next) {
  state = normalizeState(next);
  save();
  emit();
}

export function snapshot() {
  return JSON.stringify(state);
}

export function restore(snap) {
  replace(JSON.parse(snap));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Another tab changed the data: reload and re-render here too.
export function watchOtherTabs() {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        state = normalizeState(JSON.parse(e.newValue));
        emit();
      } catch { /* ignore partial writes */ }
    }
  });
}

export function exportJson() {
  return JSON.stringify({ app: 'life-os', version: 1, exportedAt: new Date().toISOString(), state }, null, 2);
}

export function parseImport(text) {
  const data = JSON.parse(text);
  const candidate = data && data.app === 'life-os' && data.state ? data.state : data;
  if (!candidate || typeof candidate !== 'object' || !('days' in candidate) || !('settings' in candidate)) {
    throw new Error('Filen ser inte ut som en Life OS-backup.');
  }
  return normalizeState(candidate);
}

export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch { /* not supported */ }
  return false;
}
