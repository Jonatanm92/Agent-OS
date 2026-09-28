export const AUDIO_VERSION = "aura-v33-user-volume-1";

const AUDIO_LIBRARY = {
  forest: {
    id: "forest",
    label: "Lugn skog",
    src: "/assets/audio/forest-birds-deploy.ogg",
    durationSec: 56,
    crossfadeSec: 7,
    channels: 2,
    sampleRate: 48000,
    gain: 0.026,
    startAt: 7,
    license: "CC0 1.0"
  },
  rain: {
    id: "rain",
    label: "Mjukt nattregn",
    src: "/assets/audio/gentle-rain-deploy.ogg",
    durationSec: 56,
    crossfadeSec: 7,
    channels: 2,
    sampleRate: 48000,
    gain: 0.72,
    startAt: 7,
    license: "CC0 1.0"
  }
};

export const AMBIENT_SCENES = {
  today: AUDIO_LIBRARY.forest,
  coach: AUDIO_LIBRARY.forest,
  cycle: AUDIO_LIBRARY.forest,
  ritual: AUDIO_LIBRARY.rain,
  insights: AUDIO_LIBRARY.forest
};

const ROUTE_FADE_MS = 1000;
const pools = new Map();
const fades = new Map();
let enabled = false;
let activeRoute = "today";
let activeSceneId = null;
let volumePercent = 78;

function sceneFor(route) {
  return AMBIENT_SCENES[route] || AMBIENT_SCENES.today;
}

function targetVolume(scene) {
  return Math.max(0, Math.min(1, scene.gain * (volumePercent / 100)));
}

function resetToLoopStart(audio, scene) {
  audio.loop = false;
  try { audio.currentTime = scene.startAt; } catch { /* metadata kan fortfarande laddas */ }
}

function fade(audio, target, duration = ROUTE_FADE_MS, pauseAfter = false) {
  if (!audio) return;
  const existing = fades.get(audio);
  if (existing) clearInterval(existing);
  const start = Number(audio.volume) || 0;
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const progress = Math.min(1, (Date.now() - startedAt) / duration);
    audio.volume = Math.max(0, Math.min(1, start + (target - start) * progress));
    if (progress >= 1) {
      clearInterval(timer);
      fades.delete(audio);
      if (pauseAfter) audio.pause();
    }
  }, 50);
  fades.set(audio, timer);
}

async function wrapWithCrossfade(pool, index, force = false) {
  if (!enabled || activeSceneId !== pool.scene.id || pool.activeIndex !== index || pool.pending) return;
  const current = pool.audios[index];
  const duration = Number.isFinite(current.duration) && current.duration > 0 ? current.duration : pool.scene.durationSec;
  if (!force && current.currentTime < duration - pool.scene.crossfadeSec) return;

  pool.pending = true;
  const nextIndex = index === 0 ? 1 : 0;
  const next = pool.audios[nextIndex];
  resetToLoopStart(next, pool.scene);
  next.volume = 0;
  try {
    await next.play();
    if (!enabled || activeSceneId !== pool.scene.id) {
      next.pause();
      return;
    }
    pool.activeIndex = nextIndex;
    const crossfadeMs = pool.scene.crossfadeSec * 1000;
    fade(current, 0, crossfadeMs, true);
    fade(next, targetVolume(pool.scene), crossfadeMs);
  } catch {
    current.loop = true;
  } finally {
    pool.pending = false;
  }
}

function createAudio(pool, index) {
  const audio = new Audio(pool.scene.src);
  audio.loop = false;
  audio.preload = "metadata";
  audio.volume = 0;
  audio.dataset.audioVersion = AUDIO_VERSION;
  audio.setAttribute("aria-hidden", "true");
  audio.addEventListener("timeupdate", () => { void wrapWithCrossfade(pool, index); });
  audio.addEventListener("ended", () => { void wrapWithCrossfade(pool, index, true); });
  return audio;
}

function poolFor(scene) {
  if (pools.has(scene.id)) return pools.get(scene.id);
  if (typeof Audio === "undefined") return null;
  const pool = { scene, audios: [], activeIndex: 0, pending: false };
  pool.audios = [createAudio(pool, 0), createAudio(pool, 1)];
  pools.set(scene.id, pool);
  return pool;
}

async function transitionTo(route) {
  const scene = sceneFor(route);
  if (scene.id === activeSceneId) return true;
  const nextPool = poolFor(scene);
  if (!nextPool) return false;
  const next = nextPool.audios[nextPool.activeIndex];
  resetToLoopStart(next, scene);
  next.volume = 0;
  try {
    await next.play();
  } catch {
    return false;
  }
  for (const pool of pools.values()) {
    pool.audios.forEach((audio) => {
      const isNext = pool === nextPool && audio === next;
      fade(audio, isNext ? targetVolume(scene) : 0, ROUTE_FADE_MS, !isNext);
    });
  }
  activeSceneId = scene.id;
  return true;
}

export async function setAmbientEnabled(next, route = activeRoute) {
  activeRoute = AMBIENT_SCENES[route] ? route : "today";
  enabled = Boolean(next);
  if (!enabled) {
    pools.forEach((pool) => pool.audios.forEach((audio) => fade(audio, 0, 600, true)));
    activeSceneId = null;
    return false;
  }
  const playing = await transitionTo(activeRoute);
  enabled = Boolean(playing);
  return enabled;
}

export function setAmbientRoute(route) {
  activeRoute = AMBIENT_SCENES[route] ? route : "today";
  if (enabled) void transitionTo(activeRoute);
}

export function setAmbientVolume(next) {
  const parsed = Number(next);
  volumePercent = Number.isFinite(parsed) ? Math.round(Math.min(100, Math.max(20, parsed))) : 78;
  if (enabled && activeSceneId) {
    const pool = pools.get(activeSceneId);
    if (pool) {
      pool.audios.forEach((audio, index) => {
        const isActive = index === pool.activeIndex;
        fade(audio, isActive ? targetVolume(pool.scene) : 0, 260, !isActive);
      });
    }
  }
  return volumePercent;
}

export function getAmbientVolume() {
  return volumePercent;
}

export function getAmbientLabel(route = activeRoute) {
  return sceneFor(route).label;
}

export function isAmbientEnabled() {
  return enabled;
}

export function stopAmbient() {
  enabled = false;
  activeSceneId = null;
  pools.forEach((pool) => {
    pool.pending = false;
    pool.audios.forEach((audio) => {
      const timer = fades.get(audio);
      if (timer) clearInterval(timer);
      fades.delete(audio);
      audio.pause();
      audio.volume = 0;
      resetToLoopStart(audio, pool.scene);
    });
  });
}
