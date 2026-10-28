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
  // Streaming mode: stream AI responses token by token into the chatbox.
  chatStreaming: true,
  // Companion mode (/change-mode-search): any topic, not just the game wiki. Needs an API key.
  chatCompanionMode: false,
  terminalEnabled: true,
  startAtLogin: true,
  stayStill: false,
  transparentMode: false,
  opacity: 0.6,
  chatShortcut: 'Alt+Space',
  interactiveMode: 'low',
  fullConsent: false,
  // Behavior director: the pause switch, the hourly cap on event-driven remarks,
  // and how long one remark category stays quiet.
  proactivePaused: false,
  proactiveMaxPerHour: 6,
  proactiveCooldownMin: 10,
  doomscrollLimitMin: 20,
  dailyChronicleEnabled: false,
  quietHoursEnabled: false,
  quietHoursStart: '23:00',
  quietHoursEnd: '07:00',
  notificationPriorities: {
    decision: 1,
    failure: 2,
    direct: 3,
    productivity: 4,
    activity: 5,
    chatter: 6,
  },
  theme: 'default',
  glassPreset: 'violet',
  glassHue: 280,
  glassBlur: 20,
  glassOpacity: 0.18,
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
// Event-driven remarks Aemeath may make per hour in Medium or Full.
const MIN_PROACTIVE_PER_HOUR = 1;
const MAX_PROACTIVE_PER_HOUR = 30;
// Minutes one remark category stays quiet after it spoke (0 turns the cooldown off).
const MIN_PROACTIVE_COOLDOWN = 0;
const MAX_PROACTIVE_COOLDOWN = 60;
// Glassmorphism theme options and limits
const THEMES = ['default', 'glass'];
const GLASS_PRESETS = ['blossom', 'violet', 'azure', 'emerald', 'obsidian', 'custom'];
const MIN_GLASS_HUE = 0;
const MAX_GLASS_HUE = 360;
const MIN_GLASS_BLUR = 6;
const MAX_GLASS_BLUR = 32;
const MIN_GLASS_OPACITY = 0.1;
const MAX_GLASS_OPACITY = 0.45;

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
    'chatStreaming',
    'chatCompanionMode',
    'terminalEnabled',
    'startAtLogin',
    'stayStill',
    'transparentMode',
    'fullConsent',
    'proactivePaused',
    'dailyChronicleEnabled',
    'quietHoursEnabled',
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

function clampWhole(value, fallback, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

const NOTIFICATION_CATEGORIES = ['decision', 'failure', 'direct', 'productivity', 'activity', 'chatter'];

function keepPriorities(data) {
  const current = Object.assign({}, DEFAULTS.notificationPriorities);
  if (data.notificationPriorities && typeof data.notificationPriorities === 'object') {
    for (const cat of NOTIFICATION_CATEGORIES) {
      const val = data.notificationPriorities[cat];
      if (typeof val === 'number' && Number.isFinite(val) && val >= 1 && val <= 6) {
        current[cat] = Math.round(val);
      }
    }
  }
  data.notificationPriorities = current;
}

function keepQuietHours(data) {
  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (typeof data.quietHoursStart !== 'string' || !timeRegex.test(data.quietHoursStart)) {
    data.quietHoursStart = DEFAULTS.quietHoursStart;
  }
  if (typeof data.quietHoursEnd !== 'string' || !timeRegex.test(data.quietHoursEnd)) {
    data.quietHoursEnd = DEFAULTS.quietHoursEnd;
  }
}

// The behavior director's limits: how often she may interrupt, and how long a
// category stays quiet after it spoke.
function keepProactive(data) {
  data.proactiveMaxPerHour = clampWhole(
    data.proactiveMaxPerHour,
    DEFAULTS.proactiveMaxPerHour,
    MIN_PROACTIVE_PER_HOUR,
    MAX_PROACTIVE_PER_HOUR,
  );
  data.proactiveCooldownMin = clampWhole(
    data.proactiveCooldownMin,
    DEFAULTS.proactiveCooldownMin,
    MIN_PROACTIVE_COOLDOWN,
    MAX_PROACTIVE_COOLDOWN,
  );
  keepPriorities(data);
  keepQuietHours(data);
}

function keepTheme(data) {
  if (!THEMES.includes(data.theme)) data.theme = DEFAULTS.theme;
  if (!GLASS_PRESETS.includes(data.glassPreset)) data.glassPreset = DEFAULTS.glassPreset;
  data.glassHue = clampWhole(data.glassHue, DEFAULTS.glassHue, MIN_GLASS_HUE, MAX_GLASS_HUE);
  data.glassBlur = clampWhole(data.glassBlur, DEFAULTS.glassBlur, MIN_GLASS_BLUR, MAX_GLASS_BLUR);
  if (typeof data.glassOpacity !== 'number' || !Number.isFinite(data.glassOpacity)) {
    data.glassOpacity = DEFAULTS.glassOpacity;
  } else {
    data.glassOpacity = Math.round(Math.min(MAX_GLASS_OPACITY, Math.max(MIN_GLASS_OPACITY, data.glassOpacity)) * 100) / 100;
  }
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
    keepProactive(data);
    keepActivity(data);
    keepTheme(data);
    return data;
  }

  function save(patch) {
    data = Object.assign({}, data, patch || {});
    data.scale = clampScale(data.scale);
    data.opacity = clampOpacity(data.opacity);
    data.chatterIntervalMin = clampInterval(data.chatterIntervalMin);
    keepStrings(data);
    keepFlags(data);
    keepProactive(data);
    keepActivity(data);
    keepTheme(data);
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
  MIN_PROACTIVE_PER_HOUR,
  MAX_PROACTIVE_PER_HOUR,
  MIN_PROACTIVE_COOLDOWN,
  MAX_PROACTIVE_COOLDOWN,
  INTERACTIVE_MODES,
  CHAT_SHORTCUTS,
  NOTIFICATION_CATEGORIES,
  THEMES,
  GLASS_PRESETS,
  MIN_GLASS_HUE,
  MAX_GLASS_HUE,
  MIN_GLASS_BLUR,
  MAX_GLASS_BLUR,
  MIN_GLASS_OPACITY,
  MAX_GLASS_OPACITY,
};
