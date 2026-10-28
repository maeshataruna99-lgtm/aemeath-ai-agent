'use strict';

/**
 * derive.js
 * Derivasi token semantik dari primitif tema (P4.2).
 * Mengonversi ruang warna OKLCH ke sRGB / hex / rgba dan menurunkan variabel CSS (--glass-*).
 */

const { normalizeTheme } = require('./theme-schema');

/**
 * Konversi OKLCH ke sRGB standar [0, 255].
 * @param {number} L - Lightness [0, 1]
 * @param {number} C - Chroma [0, ~0.4]
 * @param {number} H - Hue [0, 360] derajat
 * @returns {{r: number, g: number, b: number, hex: string, css: string}}
 */
function oklchToRgb(L, C, H) {
  const clampL = Math.min(Math.max(Number(L) || 0, 0), 1);
  const clampC = Math.max(Number(C) || 0, 0);
  const clampH = ((Number(H) || 0) % 360 + 360) % 360;

  // 1. OKLCH -> OKLab
  const rad = (clampH * Math.PI) / 180;
  const a = clampC * Math.cos(rad);
  const b = clampC * Math.sin(rad);

  // 2. OKLab -> LMS nonlinear
  const l_ = clampL + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = clampL - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = clampL - 0.0894841775 * a - 1.2914855480 * b;

  // 3. LMS nonlinear -> LMS linear
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // 4. LMS linear -> sRGB linear
  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  // 5. sRGB linear -> sRGB non-linear (gamma companding)
  function gamma(channel) {
    const c = Math.min(Math.max(channel, 0), 1);
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  }

  const r = Math.round(Math.min(Math.max(gamma(rLin) * 255, 0), 255));
  const g = Math.round(Math.min(Math.max(gamma(gLin) * 255, 0), 255));
  const bVal = Math.round(Math.min(Math.max(gamma(bLin) * 255, 0), 255));

  const hex = `#${((1 << 24) + (r << 16) + (g << 8) + bVal).toString(16).slice(1)}`;
  const css = `oklch(${clampL.toFixed(3)} ${clampC.toFixed(3)} ${clampH.toFixed(1)})`;

  return { r, g, b: bVal, hex, css };
}

function toRgba(rgb, alpha) {
  const a = Math.min(Math.max(Number(alpha) || 0, 0), 1);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a.toFixed(2)})`;
}

/**
 * Menurunkan seluruh token semantik --glass-* dari data tema.
 * @param {object} inputTheme - Data tema primitif
 * @param {string} [systemMode='dark'] - Mode OS jika theme.mode === 'system'
 * @returns {Record<string, string>} Kamus variabel CSS
 */
function deriveTokens(inputTheme, systemMode = 'dark') {
  const theme = normalizeTheme(inputTheme);
  const resolvedMode = theme.mode === 'system' ? systemMode : theme.mode;
  const isDark = resolvedMode === 'dark';

  // Derivasi warna aksen dalam ruang OKLCH
  const baseAccent = oklchToRgb(theme.accent.lightness, theme.accent.chroma, theme.accent.hue);
  const deepAccent = oklchToRgb(
    Math.max(0.25, theme.accent.lightness - 0.22),
    theme.accent.chroma * 1.15,
    theme.accent.hue
  );
  const lightAccent = oklchToRgb(
    Math.min(0.96, theme.accent.lightness + 0.22),
    Math.max(0.02, theme.accent.chroma * 0.35),
    theme.accent.hue
  );
  const hoverAccent = oklchToRgb(
    Math.min(0.92, theme.accent.lightness + 0.16),
    Math.max(0.04, theme.accent.chroma * 0.55),
    theme.accent.hue
  );

  // Penyesuaian opasitas dan blur jika efek dikurangi
  const effectiveBlur = theme.effects.reduce ? 0 : theme.glass.blur;
  const effectiveOpacity = theme.effects.reduce
    ? Math.max(theme.glass.opacity, isDark ? 0.88 : 0.94)
    : theme.glass.opacity;

  // Permukaan dan teks tergantung mode (gelap / terang)
  let surfaceBg;
  let surfaceBgFallback;
  let chatBg;
  let settingsBg;
  let textMain;
  let textMuted;
  let textDim;
  let borderMain;
  let borderSubtle;
  let divider;
  let chipBg;
  let chipBorder;
  let btnBg;
  let shadow;

  if (isDark) {
    surfaceBg = `rgba(28, 26, 24, ${effectiveOpacity.toFixed(2)})`;
    surfaceBgFallback = 'rgba(28, 26, 24, 0.92)';
    chatBg = `rgba(24, 22, 26, ${Math.min(1.0, effectiveOpacity + 0.06).toFixed(2)})`;
    settingsBg = '#0c071e';
    textMain = '#ffffff';
    textMuted = 'rgba(255, 255, 255, 0.65)';
    textDim = 'rgba(255, 255, 255, 0.45)';
    borderMain = `rgba(255, 255, 255, ${theme.glass.border.toFixed(2)})`;
    borderSubtle = `rgba(255, 255, 255, ${(theme.glass.border * 0.7).toFixed(2)})`;
    divider = 'rgba(255, 255, 255, 0.18)';
    chipBg = 'rgba(255, 255, 255, 0.08)';
    chipBorder = 'rgba(255, 255, 255, 0.18)';
    btnBg = 'rgba(255, 255, 255, 0.12)';
    shadow = '0 20px 60px rgba(0, 0, 0, 0.45)';
  } else {
    surfaceBg = `rgba(255, 255, 255, ${effectiveOpacity.toFixed(2)})`;
    surfaceBgFallback = 'rgba(255, 255, 255, 0.98)';
    chatBg = `rgba(255, 255, 255, ${Math.min(1.0, effectiveOpacity + 0.02).toFixed(2)})`;
    settingsBg = '#fff7fb';
    textMain = '#1f2430';
    textMuted = '#6b7280';
    textDim = '#4b5563';
    borderMain = baseAccent.hex;
    borderSubtle = hoverAccent.hex;
    divider = '#f9c9de';
    chipBg = baseAccent.hex;
    chipBorder = baseAccent.hex;
    btnBg = '#ffffff';
    shadow = '0 6px 18px rgba(0, 0, 0, 0.18)';
  }

  const radius = theme.glass.radius;
  const scale = theme.text.scale;

  return {
    '--glass-mode': resolvedMode,
    '--glass-bg': surfaceBg,
    '--glass-bg-fallback': surfaceBgFallback,
    '--glass-chat-bg': chatBg,
    '--glass-settings-bg': settingsBg,
    '--glass-blur': `${effectiveBlur}px`,
    '--glass-saturate': '1.15',
    '--glass-radius': `${radius}px`,
    '--glass-radius-msg': `${Math.round(radius * 0.75)}px`,
    '--glass-radius-input': `${Math.max(8, Math.round(radius * 0.4))}px`,
    '--glass-radius-sm': `${Math.max(6, Math.round(radius * 0.35))}px`,
    '--glass-radius-pill': '999px',
    '--glass-shadow': shadow,
    '--glass-shadow-chat': shadow,

    '--glass-border': borderMain,
    '--glass-border-subtle': borderSubtle,
    '--glass-border-light': isDark ? 'rgba(255, 255, 255, 0.12)' : '#f9c9de',
    '--glass-border-dim': isDark ? 'rgba(255, 255, 255, 0.20)' : '#cbd5e1',
    '--glass-border-code': isDark ? 'rgba(255, 255, 255, 0.15)' : '#334155',

    '--glass-text': textMain,
    '--glass-text-muted': textMuted,
    '--glass-text-dim': textDim,
    '--glass-text-field': isDark ? '#e2e8f0' : '#374151',
    '--glass-text-white': '#ffffff',
    '--glass-font-size-base': `${Math.round(13 * scale)}px`,
    '--glass-font-size-sm': `${Math.round(12 * scale)}px`,
    '--glass-font-size-xs': `${Math.round(11 * scale)}px`,
    '--glass-line-height': '1.45',

    '--glass-accent': baseAccent.hex,
    '--glass-accent-deep': deepAccent.hex,
    '--glass-accent-active': deepAccent.hex,
    '--glass-accent-link': deepAccent.hex,
    '--glass-accent-light': lightAccent.hex,
    '--glass-accent-hover': hoverAccent.hex,
    '--glass-accent-checked': lightAccent.hex,
    '--glass-accent-range': baseAccent.hex,
    '--glass-status-ok': '#15803d',
    '--glass-status-warn': '#92400e',

    '--glass-chip-bg': chipBg,
    '--glass-chip-border': chipBorder,
    '--glass-chip-radius': isDark ? '16px' : '999px',
    '--glass-btn-bg': btnBg,
    '--glass-btn-border': borderSubtle,
    '--glass-btn-text': isDark ? '#ffffff' : deepAccent.hex,
    '--glass-btn-hover': hoverAccent.hex,
    '--glass-btn-radius': `${Math.max(8, Math.round(radius * 0.4))}px`,
    '--glass-divider': divider,
    '--glass-divider-dashed': borderSubtle,

    '--glass-chat-notice-bg': isDark ? 'rgba(254, 243, 199, 0.15)' : '#fff1d6',
    '--glass-suggest-bg': isDark ? 'rgba(30, 27, 46, 0.95)' : '#fff7fb',
    '--glass-quote-bg': isDark ? 'rgba(255, 255, 255, 0.06)' : lightAccent.hex,
    '--glass-quote-border': baseAccent.hex,
    '--glass-music-bg': isDark ? 'rgba(15, 12, 25, 0.85)' : 'rgba(31, 36, 48, 0.85)',
    '--glass-music-text': '#ffe4f2',
    '--glass-error-bg': isDark ? 'rgba(153, 27, 27, 0.35)' : '#fee2e2',
    '--glass-error-text': isDark ? '#fca5a5' : '#991b1b',
    '--glass-consent-bg': isDark ? 'rgba(217, 119, 6, 0.18)' : '#fff7e0',
    '--glass-consent-border': isDark ? 'rgba(217, 119, 6, 0.35)' : '#f5d27a',
    '--glass-badge-soon-bg': isDark ? 'rgba(99, 102, 241, 0.25)' : '#e0e7ff',
    '--glass-badge-soon-text': isDark ? '#c7d2fe' : '#3730a3',

    '--glass-code-bg': '#0f172a',
    '--glass-code-text': '#f8fafc',
    '--glass-code-header-bg': '#1e293b',
    '--glass-code-header-border': '#334155',
    '--glass-code-header-text': '#94a3b8',
    '--glass-code-copy-bg': '#334155',
    '--glass-code-copy-border': '#475569',
    '--glass-code-copy-text': '#e2e8f0',
    '--glass-inline-code-bg': isDark ? 'rgba(255, 255, 255, 0.10)' : '#f1f5f9',
    '--glass-inline-code-text': isDark ? '#f472b6' : '#d946ef',
    '--glass-inline-code-border': isDark ? 'rgba(255, 255, 255, 0.18)' : '#e2e8f0',
    '--glass-terminal-text': '#7dd3fc',
    '--glass-terminal-dim': '#e2e8f0',
  };
}

function tokensToCssString(tokens) {
  const lines = Object.entries(tokens).map(([key, val]) => `  ${key}: ${val};`);
  return `:root {\n${lines.join('\n')}\n}\n`;
}

module.exports = {
  oklchToRgb,
  toRgba,
  deriveTokens,
  tokensToCssString,
};
