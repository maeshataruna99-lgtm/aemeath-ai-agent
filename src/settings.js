'use strict';

// Small JSON settings store in the user data directory.

const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  scale: 1,
  speed: 120,
  musicEnabled: true,
  watcherEnabled: true,
  chatterEnabled: true,
  chatterIntervalMin: 3.5,
  chatProvider: 'deepseek',
  chatModel: 'deepseek-flash',
  chatWebSearch: false,
  chatOfflineFallback: true,
  terminalEnabled: true,
  startAtLogin: true,
  stayStill: false,
  transparentMode: false,
  opacity: 0.6,
  chatShortcut: 'Alt+Space',
  interactiveMode: 'low',
  fullConsent: false,
  doomscrollLimitMin: 20,
  x: null,
  y: null,
};

const CHAT_SHORTCUTS = ['', 'Alt+Space', 'CommandOrControl+Shift+A', 'CommandOrControl+Shift+Space', 'Alt+A'];

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const MIN_OPACITY = 0.15;
const MAX_OPACITY = 1;
// Average gap between Aemeath's remarks, in minutes.
const MIN_CHAT_INTERVAL = 1;
const MAX_CHAT_INTERVAL = 15;
// Minutes of continuous social media before Aemeath says something (medium mode).
const MIN_DOOMSCROLL_LIMIT = 5;
const MAX_DOOMSCROLL_LIMIT = 120;
// Interactive modes. `full` requires explicit `fullConsent: true` or it falls back to `low`.
const INTERACTIVE_MODES = ['low', 'medium', 'full'];

function clampInterval(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULTS.chatterIntervalMin;
  return Math.min(MAX_CHAT_INTERVAL, Math.max(MIN_CHAT_INTERVAL, value));
}

function keepActivity(data) {
  if (!INTERACTIVE_MODES.includes(data.interactiveMode)) data.interactiveMode = DEFAULTS.interactiveMode;
  if (data.interactiveMode === 'full' && data.fullConsent !== true) {
    data.interactiveMode = DEFAULTS.interactiveMode;
  }
  if (data.interactiveMode !== 'full') {
    data.fullConsent = false;
  }
  const limit = data.doomscrollLimitMin;
  data.doomscrollLimitMin =
    typeof limit === 'number' && Number.isFinite(limit)
      ? Math.min(MAX_DOOMSCROLL_LIMIT, Math.max(MIN_DOOMSCROLL_LIMIT, Math.round(limit)))
      : DEFAULTS.doomscrollLimitMin;
}

function keepFlags(data) {
  for (const key of [
    'chatWebSearch',
    'chatOfflineFallback',
    'terminalEnabled',
    'startAtLogin',
    'stayStill',
    'transparentMode',
    'fullConsent',
  ]) {
    if (typeof data[key] !== 'boolean') data[key] = DEFAULTS[key];
  }
}

// Provider and model are plain identifiers; anything else falls back to defaults.
function keepStrings(data) {
  for (const key of ['chatProvider', 'chatModel']) {
    if (typeof data[key] !== 'string' || data[key] === '') data[key] = DEFAULTS[key];
  }
  if (!CHAT_SHORTCUTS.includes(data.chatShortcut)) data.chatShortcut = DEFAULTS.chatShortcut;
}

function clampScale(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULTS.scale;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function clampOpacity(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULTS.opacity;
  return Math.round(Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, value)) * 100) / 100;
}

// The app was renamed Aemeth -> Aemeath, which moved its userData directory.
// Carries the old settings file over once so position and scale survive.
function migrateLegacySettings(userDataPath, legacyPath) {
  const target = path.join(userDataPath, 'settings.json');
  const source = path.join(legacyPath, 'settings.json');
  try {
    if (fs.existsSync(target) || !fs.existsSync(source)) return false;
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.copyFileSync(source, target);
    return true;
  } catch {
    return false;
  }
}

function createSettingsStore(userDataPath) {
  const file = path.join(userDataPath, 'settings.json');
  let data = Object.assign({}, DEFAULTS);

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      data = Object.assign({}, DEFAULTS, parsed);
    } catch {
      data = Object.assign({}, DEFAULTS);
    }
    data.scale = clampScale(data.scale);
    data.opacity = clampOpacity(data.opacity);
    data.chatterIntervalMin = clampInterval(data.chatterIntervalMin);
    keepStrings(data);
    keepFlags(data);
    keepActivity(data);
    return data;
  }

  function save(patch) {
    data = Object.assign({}, data, patch || {});
    data.scale = clampScale(data.scale);
    data.opacity = clampOpacity(data.opacity);
    data.chatterIntervalMin = clampInterval(data.chatterIntervalMin);
    keepStrings(data);
    keepFlags(data);
    keepActivity(data);
    if (typeof data.speed !== 'number' || data.speed <= 0) data.speed = DEFAULTS.speed;
    if (typeof data.musicEnabled !== 'boolean') data.musicEnabled = DEFAULTS.musicEnabled;
    if (typeof data.watcherEnabled !== 'boolean') data.watcherEnabled = DEFAULTS.watcherEnabled;
    if (typeof data.chatterEnabled !== 'boolean') data.chatterEnabled = DEFAULTS.chatterEnabled;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch {
      // best effort: settings stay in memory for this run
    }
    return data;
  }

  return {
    load: load,
    save: save,
    get data() {
      return data;
    },
  };
}

module.exports = {
  createSettingsStore,
  migrateLegacySettings,
  DEFAULTS,
  MIN_SCALE,
  MAX_SCALE,
  MIN_OPACITY,
  MAX_OPACITY,
  MIN_CHAT_INTERVAL,
  MAX_CHAT_INTERVAL,
  MIN_DOOMSCROLL_LIMIT,
  MAX_DOOMSCROLL_LIMIT,
  INTERACTIVE_MODES,
  CHAT_SHORTCUTS,
};
