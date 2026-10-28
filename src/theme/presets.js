'use strict';

/**
 * presets.js
 * Daftar preset bawaan sistem tema Aemeath (P4.2).
 */

const { normalizeTheme } = require('./theme-schema');

const PRESETS = {
  'midnight-glass': {
    name: 'Midnight Glass',
    description: 'Gelap kehijauan, kaca semi-transparan, aksen oranye hangat (kartu acuan).',
    mode: 'dark',
    preset: 'midnight-glass',
    accent: { hue: 28, chroma: 0.14, lightness: 0.68 },
    glass: { opacity: 0.45, blur: 24, radius: 32, border: 0.14 },
    text: { scale: 1.0 },
    effects: { reduce: false },
  },
  'soft-light': {
    name: 'Soft Light',
    description: 'Terang, kaca putih lembut dengan aksen pastel sejuk.',
    mode: 'light',
    preset: 'soft-light',
    accent: { hue: 220, chroma: 0.08, lightness: 0.65 },
    glass: { opacity: 0.60, blur: 20, radius: 24, border: 0.20 },
    text: { scale: 1.0 },
    effects: { reduce: false },
  },
  'mono': {
    name: 'Mono',
    description: 'Abu netral monokromatik, tanpa saturasi warna, efek minimal.',
    mode: 'dark',
    preset: 'mono',
    accent: { hue: 0, chroma: 0.0, lightness: 0.70 },
    glass: { opacity: 0.40, blur: 16, radius: 16, border: 0.15 },
    text: { scale: 1.0 },
    effects: { reduce: false },
  },
  'aemeath': {
    name: 'Aemeath',
    description: 'Palet khas Aemeath: latar gelap kosmik dengan aksen magenta violet.',
    mode: 'dark',
    preset: 'aemeath',
    accent: { hue: 335, chroma: 0.18, lightness: 0.72 },
    glass: { opacity: 0.38, blur: 24, radius: 20, border: 0.22 },
    text: { scale: 1.0 },
    effects: { reduce: false },
  },
  'classic': {
    name: 'Classic Aemeath',
    description: 'Tampilan klasik slate-navy terang bawaan aplikasi tanpa blur kaca.',
    mode: 'light',
    preset: 'classic',
    accent: { hue: 335, chroma: 0.16, lightness: 0.70 },
    glass: { opacity: 0.97, blur: 0, radius: 14, border: 0.30 },
    text: { scale: 1.0 },
    effects: { reduce: false },
  },
};

function getPreset(name) {
  const key = (typeof name === 'string') ? name.toLowerCase() : '';
  if (PRESETS[key]) {
    return normalizeTheme(JSON.parse(JSON.stringify(PRESETS[key])));
  }
  return normalizeTheme(JSON.parse(JSON.stringify(PRESETS['midnight-glass'])));
}

function listPresets() {
  return Object.keys(PRESETS).map((key) => ({
    id: key,
    name: PRESETS[key].name,
    description: PRESETS[key].description,
    mode: PRESETS[key].mode,
  }));
}

module.exports = {
  PRESETS,
  getPreset,
  listPresets,
};
