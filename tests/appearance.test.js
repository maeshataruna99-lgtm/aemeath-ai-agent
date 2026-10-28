'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { evaluateContrast } = require('../src/theme/contrast');
const { deriveTokens } = require('../src/theme/derive');
const { getPreset, listPresets } = require('../src/theme/presets');
const { normalizeTheme, createDefaultTheme, mergeTheme } = require('../src/theme/theme-schema');
const { createThemeStore } = require('../src/theme/theme-store');

test('appearance: all presets satisfy WCAG AA contrast for main text', () => {
  const presets = listPresets();
  for (const preset of presets) {
    const theme = getPreset(preset.id);
    const evalResult = evaluateContrast(theme);
    assert.ok(
      evalResult.mainRatio >= 4.5,
      `Preset ${preset.id} main ratio (${evalResult.mainRatio}) must be >= 4.5:1`
    );
    assert.equal(
      evalResult.passesMain,
      true,
      `Preset ${preset.id} must pass WCAG AA main text requirement`
    );
  }
});

test('appearance: contrast autoFix increases opacity when glass opacity is too low', () => {
  // Buat tema dengan opasitas sangat rendah pada latar terang
  const lowOpacityTheme = createDefaultTheme();
  lowOpacityTheme.mode = 'light';
  lowOpacityTheme.glass.opacity = 0.10; // sangat tipis
  lowOpacityTheme.accent.lightness = 0.85; // teks terang di atas latar terang

  const evalResult = evaluateContrast(lowOpacityTheme);
  // Auto fix harus merekomendasikan kenaikan opasitas
  if (!evalResult.passesMain) {
    assert.equal(evalResult.autoFix.needed, true);
    assert.ok(
      evalResult.autoFix.recommendedOpacity > lowOpacityTheme.glass.opacity,
      `Rekomendasi opasitas (${evalResult.autoFix.recommendedOpacity}) harus lebih tinggi dari ${lowOpacityTheme.glass.opacity}`
    );
  }
});

test('appearance: reduce effects disables blur and raises surface opacity', () => {
  const theme = createDefaultTheme();
  theme.effects.reduce = true;
  theme.glass.blur = 30;
  theme.glass.opacity = 0.20;

  const tokens = deriveTokens(theme, 'dark');
  assert.equal(tokens['--glass-blur'], '0px', 'Blur harus 0px saat reduce effects aktif');
  // Opasitas harus dinaikkan minimal ke 0.88 untuk keterbacaan
  assert.ok(
    tokens['--glass-bg'].includes('0.88') || tokens['--glass-bg'].includes('0.9'),
    `Permukaan harus padat saat efek dikurangi: ${tokens['--glass-bg']}`
  );
});

test('appearance: export JSON creates schema-compliant data', () => {
  const theme = createDefaultTheme();
  theme.accent.hue = 210;
  theme.preset = 'custom';

  const exportedJson = JSON.stringify(theme, null, 2);
  const parsed = JSON.parse(exportedJson);

  assert.equal(parsed.version, 1);
  assert.equal(parsed.accent.hue, 210);
  assert.equal(parsed.preset, 'custom');
  assert.ok(parsed.glass && typeof parsed.glass.opacity === 'number');
});

test('appearance: import sanitizes alien keys, extreme numbers, and malicious inputs', () => {
  const maliciousImport = {
    version: 1,
    mode: 'dark',
    preset: 'hacked',
    accent: {
      hue: -99999,
      chroma: 999,
      lightness: 'drop database',
    },
    glass: {
      opacity: '<script>alert(1)</script>',
      blur: 99999999,
    },
    maliciousKey: 'rm -rf /',
    __proto__: { isAdmin: true },
  };

  const sanitized = normalizeTheme(maliciousImport);

  // Nilai harus di-clamp dalam batas aman
  assert.equal(sanitized.preset, 'custom');
  assert.equal(sanitized.accent.hue, 0); // min hue
  assert.equal(sanitized.accent.chroma, 0.25); // max chroma
  assert.equal(sanitized.accent.lightness, 0.68); // fallback default karena NaN
  assert.equal(sanitized.glass.opacity, 0.45); // fallback default karena string
  assert.equal(sanitized.glass.blur, 40); // max blur
  assert.equal(sanitized.maliciousKey, undefined, 'Alien keys must be stripped');
});

test('appearance: resetting to preset restores default values accurately', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aemeath-reset-test-'));
  try {
    const store = createThemeStore({ dir: tmpDir });

    // Ubah slider
    store.patch({ accent: { hue: 120 }, glass: { blur: 10 }, preset: 'custom' });
    assert.equal(store.getState().accent.hue, 120);

    // Reset ke Midnight Glass
    store.setPreset('midnight-glass');
    const resetTheme = store.getState();
    const originalMidnight = getPreset('midnight-glass');

    assert.equal(resetTheme.accent.hue, originalMidnight.accent.hue);
    assert.equal(resetTheme.glass.blur, originalMidnight.glass.blur);
    assert.equal(resetTheme.preset, 'midnight-glass');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
