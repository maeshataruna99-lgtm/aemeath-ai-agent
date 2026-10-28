'use strict';

/**
 * theme-schema.js
 * Validasi dan clamp skema tema Aemeath (P4.2).
 * Merupakan satu-satunya pintu masuk data tema di proses utama.
 */

const CURRENT_VERSION = 1;
const VALID_MODES = ['dark', 'light', 'system'];
const VALID_PRESETS = ['midnight-glass', 'soft-light', 'mono', 'aemeath', 'classic', 'custom'];

const LIMITS = {
  hue: { min: 0, max: 360, default: 28 },
  chroma: { min: 0, max: 0.25, default: 0.14 },
  lightness: { min: 0.3, max: 0.9, default: 0.68 },
  opacity: { min: 0.10, max: 0.90, default: 0.45 },
  blur: { min: 0, max: 40, default: 24 },
  radius: { min: 8, max: 40, default: 32 },
  border: { min: 0, max: 0.40, default: 0.14 },
  scale: { min: 0.90, max: 1.20, default: 1.0 },
};

function clampNumber(value, min, max, fallback) {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(value, min), max);
}

function roundTo(num, decimals = 3) {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

function createDefaultTheme() {
  return {
    version: CURRENT_VERSION,
    mode: 'dark',
    preset: 'midnight-glass',
    accent: {
      hue: LIMITS.hue.default,
      chroma: LIMITS.chroma.default,
      lightness: LIMITS.lightness.default,
    },
    glass: {
      opacity: LIMITS.opacity.default,
      blur: LIMITS.blur.default,
      radius: LIMITS.radius.default,
      border: LIMITS.border.default,
    },
    text: {
      scale: LIMITS.scale.default,
    },
    effects: {
      reduce: false,
    },
  };
}

function normalizeTheme(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createDefaultTheme();
  }

  const mode = (typeof raw.mode === 'string' && VALID_MODES.includes(raw.mode.toLowerCase()))
    ? raw.mode.toLowerCase()
    : 'dark';

  const preset = (typeof raw.preset === 'string' && VALID_PRESETS.includes(raw.preset.toLowerCase()))
    ? raw.preset.toLowerCase()
    : 'custom';

  const rawAccent = (raw.accent && typeof raw.accent === 'object') ? raw.accent : {};
  const hue = roundTo(clampNumber(rawAccent.hue, LIMITS.hue.min, LIMITS.hue.max, LIMITS.hue.default), 1);
  const chroma = roundTo(clampNumber(rawAccent.chroma, LIMITS.chroma.min, LIMITS.chroma.max, LIMITS.chroma.default), 3);
  const lightness = roundTo(clampNumber(rawAccent.lightness, LIMITS.lightness.min, LIMITS.lightness.max, LIMITS.lightness.default), 3);

  const rawGlass = (raw.glass && typeof raw.glass === 'object') ? raw.glass : {};
  const opacity = roundTo(clampNumber(rawGlass.opacity, LIMITS.opacity.min, LIMITS.opacity.max, LIMITS.opacity.default), 3);
  const blur = Math.round(clampNumber(rawGlass.blur, LIMITS.blur.min, LIMITS.blur.max, LIMITS.blur.default));
  const radius = Math.round(clampNumber(rawGlass.radius, LIMITS.radius.min, LIMITS.radius.max, LIMITS.radius.default));
  const border = roundTo(clampNumber(rawGlass.border, LIMITS.border.min, LIMITS.border.max, LIMITS.border.default), 3);

  const rawText = (raw.text && typeof raw.text === 'object') ? raw.text : {};
  const scale = roundTo(clampNumber(rawText.scale, LIMITS.scale.min, LIMITS.scale.max, LIMITS.scale.default), 2);

  const rawEffects = (raw.effects && typeof raw.effects === 'object') ? raw.effects : {};
  const reduce = Boolean(rawEffects.reduce);

  return {
    version: CURRENT_VERSION,
    mode,
    preset,
    accent: { hue, chroma, lightness },
    glass: { opacity, blur, radius, border },
    text: { scale },
    effects: { reduce },
  };
}

function mergeTheme(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return normalizeTheme(base);
  }
  const baseTheme = normalizeTheme(base);
  return normalizeTheme({
    version: patch.version !== undefined ? patch.version : baseTheme.version,
    mode: patch.mode !== undefined ? patch.mode : baseTheme.mode,
    preset: patch.preset !== undefined ? patch.preset : baseTheme.preset,
    accent: {
      ...baseTheme.accent,
      ...(patch.accent && typeof patch.accent === 'object' ? patch.accent : {}),
    },
    glass: {
      ...baseTheme.glass,
      ...(patch.glass && typeof patch.glass === 'object' ? patch.glass : {}),
    },
    text: {
      ...baseTheme.text,
      ...(patch.text && typeof patch.text === 'object' ? patch.text : {}),
    },
    effects: {
      ...baseTheme.effects,
      ...(patch.effects && typeof patch.effects === 'object' ? patch.effects : {}),
    },
  });
}

module.exports = {
  CURRENT_VERSION,
  VALID_MODES,
  VALID_PRESETS,
  LIMITS,
  createDefaultTheme,
  normalizeTheme,
  mergeTheme,
};
