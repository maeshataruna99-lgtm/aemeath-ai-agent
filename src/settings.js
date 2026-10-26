'use strict';

// Small JSON settings store in the user data directory.

const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  scale: 1,
  speed: 120,
  musicEnabled: true,
  watcherEnabled: true,
  x: null,
  y: null,
};

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

function clampScale(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULTS.scale;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
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
    return data;
  }

  function save(patch) {
    data = Object.assign({}, data, patch || {});
    data.scale = clampScale(data.scale);
    if (typeof data.speed !== 'number' || data.speed <= 0) data.speed = DEFAULTS.speed;
    if (typeof data.musicEnabled !== 'boolean') data.musicEnabled = DEFAULTS.musicEnabled;
    if (typeof data.watcherEnabled !== 'boolean') data.watcherEnabled = DEFAULTS.watcherEnabled;
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

module.exports = { createSettingsStore, DEFAULTS, MIN_SCALE, MAX_SCALE };
