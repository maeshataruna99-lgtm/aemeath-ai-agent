'use strict';

/**
 * contrast.js
 * Modul penghitungan rasio kontras warna dan penjaga aksesibilitas WCAG (P4.2).
 */

const { normalizeTheme } = require('./theme-schema');
const { deriveTokens } = require('./derive');

function parseHex(hex) {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return { r, g, b, a: 1.0 };
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return { r, g, b, a: 1.0 };
  }
  return { r: 255, g: 255, b: 255, a: 1.0 };
}

function parseRgba(str) {
  if (typeof str !== 'string') return { r: 0, g: 0, b: 0, a: 1.0 };
  const s = str.trim();
  if (s.startsWith('#')) return parseHex(s);

  const match = s.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (match) {
    return {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10),
      a: match[4] !== undefined ? parseFloat(match[4]) : 1.0,
    };
  }
  return { r: 0, g: 0, b: 0, a: 1.0 };
}

function channelLuminance(val255) {
  const c = val255 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function getLuminance(rgb) {
  const r = channelLuminance(rgb.r);
  const g = channelLuminance(rgb.g);
  const b = channelLuminance(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function calculateContrastRatio(color1, color2) {
  const c1 = typeof color1 === 'string' ? parseRgba(color1) : color1;
  const c2 = typeof color2 === 'string' ? parseRgba(color2) : color2;

  const lum1 = getLuminance(c1);
  const lum2 = getLuminance(c2);

  const lMax = Math.max(lum1, lum2);
  const lMin = Math.min(lum1, lum2);

  return (lMax + 0.05) / (lMin + 0.05);
}

function blendColor(fg, bg) {
  const a = Math.min(Math.max(fg.a !== undefined ? fg.a : 1.0, 0), 1);
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1.0,
  };
}

/**
 * Memeriksa keterbacaan kontras token terhadap latar efektif.
 * @param {object} rawTheme - Data tema
 * @param {object} [customBackdrop] - RGB latar di belakang kaca
 * @returns {object} Status evaluasi kontras dan saran perbaikan
 */
function evaluateContrast(rawTheme, customBackdrop, systemMode = 'dark') {
  const theme = normalizeTheme(rawTheme);
  const isDark = theme.mode === 'system' ? systemMode === 'dark' : theme.mode === 'dark';
  const tokens = deriveTokens(theme, isDark ? 'dark' : 'light');

  const defaultBackdrop = isDark ? { r: 10, g: 13, b: 11, a: 1.0 } : { r: 245, g: 245, b: 245, a: 1.0 };
  const backdrop = customBackdrop || defaultBackdrop;

  const rawSurface = parseRgba(tokens['--glass-bg']);
  const effectiveSurface = blendColor(rawSurface, backdrop);

  const textMain = parseRgba(tokens['--glass-text']);
  const textMuted = parseRgba(tokens['--glass-text-muted']);

  // Blend semi-transparent text over effective surface
  const effectiveTextMain = blendColor(textMain, effectiveSurface);
  const effectiveTextMuted = blendColor(textMuted, effectiveSurface);

  const mainRatio = calculateContrastRatio(effectiveTextMain, effectiveSurface);
  const mutedRatio = calculateContrastRatio(effectiveTextMuted, effectiveSurface);

  const passesMain = mainRatio >= 4.5;
  const passesMuted = mutedRatio >= 3.0;

  const warnings = [];
  if (!passesMain) {
    warnings.push(
      `Kontras teks utama (${mainRatio.toFixed(2)}:1) di bawah standar minimum WCAG AA (4,5:1).`
    );
  }
  if (!passesMuted) {
    warnings.push(
      `Kontras teks sekunder (${mutedRatio.toFixed(2)}:1) di bawah rekomendasi (3,0:1).`
    );
  }

  // Hitung rekomendasi auto-fix (naikkan opasitas bila tembus pandang)
  let recommendedOpacity = theme.glass.opacity;
  if (!passesMain) {
    for (let op = Math.max(0.20, theme.glass.opacity); op <= 0.95; op += 0.05) {
      const testSurface = blendColor({ ...rawSurface, a: op }, backdrop);
      const testText = blendColor(textMain, testSurface);
      const ratio = calculateContrastRatio(testText, testSurface);
      if (ratio >= 4.5) {
        recommendedOpacity = Math.round(op * 100) / 100;
        break;
      }
    }
  }

  return {
    mainRatio: Math.round(mainRatio * 100) / 100,
    mutedRatio: Math.round(mutedRatio * 100) / 100,
    passesMain,
    passesMuted,
    warnings,
    autoFix: {
      needed: !passesMain || !passesMuted,
      recommendedOpacity,
    },
  };
}

module.exports = {
  parseHex,
  parseRgba,
  getLuminance,
  calculateContrastRatio,
  blendColor,
  evaluateContrast,
};
