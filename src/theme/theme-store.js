'use strict';

/**
 * theme-store.js
 * Penyimpanan persisten berkas theme.json (P4.2).
 * Mengikuti pola aman memory.json: penulisan atomik, karantina berkas rusak,
 * dan mode read-only untuk berkas versi lebih baru.
 */

const fs = require('node:fs');
const path = require('node:path');
const { CURRENT_VERSION, normalizeTheme, createDefaultTheme, mergeTheme } = require('./theme-schema');
const { getPreset } = require('./presets');
const { deriveTokens } = require('./derive');

const FILE_NAME = 'theme.json';

function createThemeStore(options) {
  const opts = options || {};
  const file = opts.dir ? path.join(opts.dir, FILE_NAME) : null;
  const now = opts.now || Date.now;

  let state = createDefaultTheme();
  let readOnly = false;
  let notice = null;

  function quarantine(reason) {
    if (!file) return null;
    const stamp = new Date(now()).toISOString().replace(/[:.]/g, '-');
    const target = path.join(path.dirname(file), 'theme.corrupt-' + stamp + '.json');
    try {
      fs.renameSync(file, target);
      notice = reason + ' Berkas lama dipindahkan ke ' + path.basename(target) + ', tidak dihapus.';
      return target;
    } catch {
      notice = reason;
      return null;
    }
  }

  function load() {
    state = createDefaultTheme();
    readOnly = false;
    notice = null;

    if (!file) return state;

    let raw = null;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      // First run or file doesn't exist yet
      return state;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      quarantine('Berkas tema rusak / tidak dapat dibaca.');
      return state;
    }

    if (parsed && typeof parsed === 'object' && typeof parsed.version === 'number' && parsed.version > CURRENT_VERSION) {
      readOnly = true;
      notice = 'Berkas tema dibuat oleh versi Aemeath yang lebih baru, sehingga hanya dibaca.';
      state = normalizeTheme(parsed);
      return state;
    }

    state = normalizeTheme(parsed);
    return state;
  }

  function persist() {
    if (!file || readOnly) return false;
    const tmp = file + '.tmp';
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, file);
      return true;
    } catch {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {
        // ignore
      }
      return false;
    }
  }

  function save(newThemeData) {
    if (readOnly) {
      return { saved: false, reason: 'read_only', notice };
    }
    state = normalizeTheme(newThemeData);
    const persisted = persist();
    return { saved: persisted, theme: state };
  }

  function patch(patchData) {
    if (readOnly) {
      return { saved: false, reason: 'read_only', notice };
    }
    state = mergeTheme(state, patchData);
    const persisted = persist();
    return { saved: persisted, theme: state };
  }

  function setPreset(presetName) {
    if (readOnly) {
      return { saved: false, reason: 'read_only', notice };
    }
    const presetTheme = getPreset(presetName);
    state = presetTheme;
    const persisted = persist();
    return { saved: persisted, theme: state };
  }

  function getTokens(systemMode = 'dark') {
    return deriveTokens(state, systemMode);
  }

  // Load immediately on creation if file path is available
  load();

  return {
    load,
    save,
    patch,
    setPreset,
    getState: () => JSON.parse(JSON.stringify(state)),
    getTokens,
    isReadOnly: () => readOnly,
    getNotice: () => notice,
    getFile: () => file,
  };
}

module.exports = {
  FILE_NAME,
  createThemeStore,
};
