'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  CURRENT_VERSION,
  LIMITS,
  createDefaultTheme,
  normalizeTheme,
} = require('../src/theme/theme-schema');
const { PRESETS, getPreset, listPresets } = require('../src/theme/presets');
const { oklchToRgb, deriveTokens, tokensToCssString } = require('../src/theme/derive');
const {
  parseHex,
  parseRgba,
  getLuminance,
  calculateContrastRatio,
  evaluateContrast,
} = require('../src/theme/contrast');
const { createThemeStore } = require('../src/theme/theme-store');

test('theme-schema: creates default theme with expected structure and boundaries', () => {
  const def = createDefaultTheme();
  assert.equal(def.version, CURRENT_VERSION);
  assert.equal(def.mode, 'dark');
  assert.equal(def.preset, 'midnight-glass');
  assert.equal(def.accent.hue, 28);
  assert.equal(def.accent.chroma, 0.14);
  assert.equal(def.accent.lightness, 0.68);
  assert.equal(def.glass.opacity, 0.45);
  assert.equal(def.glass.blur, 24);
  assert.equal(def.glass.radius, 32);
  assert.equal(def.glass.border, 0.14);
  assert.equal(def.text.scale, 1.0);
  assert.equal(def.effects.reduce, false);
});

test('theme-schema: clamps extreme and out-of-range numeric values', () => {
  const raw = {
    mode: 'DARK',
    preset: 'MIDNIGHT-GLASS',
    accent: {
      hue: 9999,
      chroma: 1.5,
      lightness: 2.0,
    },
    glass: {
      opacity: 5.0,
      blur: 200,
      radius: 999,
      border: 1.0,
    },
    text: {
      scale: 3.0,
    },
    effects: {
      reduce: 1,
    },
  };

  const normalized = normalizeTheme(raw);
  assert.equal(normalized.mode, 'dark');
  assert.equal(normalized.preset, 'midnight-glass');
  assert.equal(normalized.accent.hue, LIMITS.hue.max); // 360
  assert.equal(normalized.accent.chroma, LIMITS.chroma.max); // 0.25
  assert.equal(normalized.accent.lightness, LIMITS.lightness.max); // 0.9
  assert.equal(normalized.glass.opacity, LIMITS.opacity.max); // 0.90
  assert.equal(normalized.glass.blur, LIMITS.blur.max); // 40
  assert.equal(normalized.glass.radius, LIMITS.radius.max); // 40
  assert.equal(normalized.glass.border, LIMITS.border.max); // 0.40
  assert.equal(normalized.text.scale, LIMITS.scale.max); // 1.20
  assert.equal(normalized.effects.reduce, true);

  // Negative extremes
  const minRaw = {
    accent: { hue: -50, chroma: -1, lightness: -0.5 },
    glass: { opacity: -2, blur: -10, radius: 2, border: -1 },
    text: { scale: 0.2 },
  };
  const minNorm = normalizeTheme(minRaw);
  assert.equal(minNorm.accent.hue, LIMITS.hue.min); // 0
  assert.equal(minNorm.accent.chroma, LIMITS.chroma.min); // 0
  assert.equal(minNorm.accent.lightness, LIMITS.lightness.min); // 0.3
  assert.equal(minNorm.glass.opacity, LIMITS.opacity.min); // 0.10
  assert.equal(minNorm.glass.blur, LIMITS.blur.min); // 0
  assert.equal(minNorm.glass.radius, LIMITS.radius.min); // 8
  assert.equal(minNorm.glass.border, LIMITS.border.min); // 0
  assert.equal(minNorm.text.scale, LIMITS.scale.min); // 0.90
});

test('theme-schema: handles null, undefined, invalid types, and discards unknown keys', () => {
  assert.deepEqual(normalizeTheme(null), createDefaultTheme());
  assert.deepEqual(normalizeTheme(undefined), createDefaultTheme());
  assert.deepEqual(normalizeTheme('string-not-object'), createDefaultTheme());
  assert.deepEqual(normalizeTheme([]), createDefaultTheme());

  const injectionPayload = {
    mode: 'evil-mode',
    preset: 'inject-preset',
    evilProperty: '<script>alert(1)</script>',
    maliciousCss: 'background: red !important;',
    accent: { hue: 'not-a-number' },
  };
  const clean = normalizeTheme(injectionPayload);
  assert.equal(clean.mode, 'dark'); // fallback
  assert.equal(clean.preset, 'custom');
  assert.equal(clean.accent.hue, LIMITS.hue.default);
  assert.equal(clean.evilProperty, undefined);
  assert.equal(clean.maliciousCss, undefined);
});

test('derive: OKLCH color math matches reference values', () => {
  // Pure white (L=1, C=0, H=0)
  const white = oklchToRgb(1.0, 0, 0);
  assert.equal(white.r, 255);
  assert.equal(white.g, 255);
  assert.equal(white.b, 255);
  assert.equal(white.hex.toLowerCase(), '#ffffff');

  // Pure black (L=0, C=0, H=0)
  const black = oklchToRgb(0, 0, 0);
  assert.equal(black.r, 0);
  assert.equal(black.g, 0);
  assert.equal(black.b, 0);
  assert.equal(black.hex.toLowerCase(), '#000000');

  // Mid-gray (L=0.5, C=0, H=0) -> in OKLab L=0.5 corresponds to linear Y ≈ 0.125, sRGB ≈ 99 (#636363)
  const gray = oklchToRgb(0.5, 0, 0);
  assert.equal(gray.r, 99);
  assert.equal(gray.g, 99);
  assert.equal(gray.b, 99);
  assert.equal(gray.hex.toLowerCase(), '#636363');

  // Chromatic test: Amber hue 28 (Midnight glass reference)
  const amber = oklchToRgb(0.68, 0.14, 28);
  assert.ok(amber.r > amber.g && amber.g > amber.b);
  assert.match(amber.hex, /^#[0-9a-f]{6}$/i);
});

test('derive: deriveTokens produces complete semantic tokens for dark and light modes', () => {
  const darkTheme = normalizeTheme({ mode: 'dark', glass: { blur: 24, radius: 32 } });
  const darkTokens = deriveTokens(darkTheme);

  assert.equal(darkTokens['--glass-mode'], 'dark');
  assert.equal(darkTokens['--glass-text'], '#ffffff');
  assert.equal(darkTokens['--glass-blur'], '24px');
  assert.equal(darkTokens['--glass-radius'], '32px');
  assert.ok(darkTokens['--glass-bg'].startsWith('rgba(28, 26, 24,'));
  assert.match(darkTokens['--glass-accent'], /^#[0-9a-f]{6}$/i);

  const lightTheme = normalizeTheme({ mode: 'light', glass: { blur: 16, radius: 20 } });
  const lightTokens = deriveTokens(lightTheme);
  assert.equal(lightTokens['--glass-mode'], 'light');
  assert.equal(lightTokens['--glass-text'], '#1f2430');
  assert.ok(lightTokens['--glass-bg'].startsWith('rgba(255, 255, 255,'));

  // Test effects.reduce
  const reducedTheme = normalizeTheme({ effects: { reduce: true }, glass: { blur: 24, opacity: 0.3 } });
  const reducedTokens = deriveTokens(reducedTheme);
  assert.equal(reducedTokens['--glass-blur'], '0px');
  assert.ok(parseFloat(reducedTokens['--glass-bg'].split(',')[3]) >= 0.88);

  // Test tokensToCssString
  const css = tokensToCssString(darkTokens);
  assert.ok(css.startsWith(':root {'));
  assert.ok(css.includes('--glass-bg:'));
  assert.ok(css.includes('--glass-accent:'));
  assert.ok(css.endsWith('}\n'));
});

test('contrast: luminance, ratio and evaluation adhere to WCAG standards', () => {
  const white = { r: 255, g: 255, b: 255, a: 1.0 };
  const black = { r: 0, g: 0, b: 0, a: 1.0 };

  assert.equal(getLuminance(black), 0);
  assert.equal(getLuminance(white), 1);

  const maxRatio = calculateContrastRatio(white, black);
  assert.ok(Math.abs(maxRatio - 21.0) < 0.05);

  const sameRatio = calculateContrastRatio(white, white);
  assert.equal(sameRatio, 1.0);

  // evaluateContrast for Midnight Glass preset
  const midnightTheme = getPreset('midnight-glass');
  const evaluation = evaluateContrast(midnightTheme);
  assert.ok(evaluation.mainRatio >= 4.5);
  assert.ok(evaluation.passesMain);
  assert.equal(evaluation.warnings.length, 0);

  // evaluateContrast for extreme transparent surface on conflicting background
  const lowContrastTheme = normalizeTheme({
    mode: 'dark',
    glass: { opacity: 0.10 },
  });
  const lowEval = evaluateContrast(lowContrastTheme, { r: 220, g: 220, b: 220, a: 1.0 });
  if (!lowEval.passesMain) {
    assert.ok(lowEval.autoFix.needed);
    assert.ok(lowEval.autoFix.recommendedOpacity > lowContrastTheme.glass.opacity);
  }
});

test('presets: all presets load valid normalized themes', () => {
  const list = listPresets();
  assert.ok(list.length >= 5);
  const ids = list.map((p) => p.id);
  assert.ok(ids.includes('midnight-glass'));
  assert.ok(ids.includes('soft-light'));
  assert.ok(ids.includes('mono'));
  assert.ok(ids.includes('aemeath'));
  assert.ok(ids.includes('classic'));

  for (const item of list) {
    const preset = getPreset(item.id);
    assert.equal(preset.preset, item.id);
    assert.ok(preset.accent.hue >= 0 && preset.accent.hue <= 360);
  }

  // Unknown preset returns midnight-glass
  const unknown = getPreset('non-existent-preset');
  assert.equal(unknown.preset, 'midnight-glass');
});

test('theme-store: manages persistence, corrupt files, and versioning safely', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aemeath-theme-test-'));

  try {
    const store = createThemeStore({ dir: tempDir });
    const initial = store.getState();
    assert.equal(initial.preset, 'midnight-glass');
    assert.equal(store.isReadOnly(), false);
    assert.equal(store.getNotice(), null);

    // Save customized theme
    const customResult = store.save({
      mode: 'dark',
      preset: 'custom',
      accent: { hue: 180, chroma: 0.18, lightness: 0.70 },
      glass: { opacity: 0.50, blur: 20, radius: 28, border: 0.18 },
    });
    assert.equal(customResult.saved, true);
    assert.equal(store.getState().accent.hue, 180);

    // Reload from disk in a fresh store instance
    const store2 = createThemeStore({ dir: tempDir });
    assert.equal(store2.getState().accent.hue, 180);
    assert.equal(store2.getState().glass.radius, 28);

    // Switch preset
    const presetResult = store2.setPreset('aemeath');
    assert.equal(presetResult.saved, true);
    assert.equal(store2.getState().preset, 'aemeath');
    assert.equal(store2.getState().accent.hue, 335);

    // Corrupt file handling
    const filePath = store2.getFile();
    fs.writeFileSync(filePath, '{ corrupted json :::: ');
    const storeCorrupt = createThemeStore({ dir: tempDir });
    // Should fallback to default theme
    assert.equal(storeCorrupt.getState().preset, 'midnight-glass');
    assert.ok(storeCorrupt.getNotice().includes('Berkas tema rusak'));

    // Check that corrupt file was quarantined
    const files = fs.readdirSync(tempDir);
    const corruptFile = files.find((f) => f.startsWith('theme.corrupt-'));
    assert.ok(corruptFile, 'Corrupted file should be quarantined, not deleted');

    // Future version handling (read-only mode)
    const futureData = {
      version: CURRENT_VERSION + 1,
      mode: 'dark',
      preset: 'future-preset',
      accent: { hue: 90, chroma: 0.12, lightness: 0.75 },
    };
    fs.writeFileSync(filePath, JSON.stringify(futureData, null, 2));
    const storeFuture = createThemeStore({ dir: tempDir });
    assert.equal(storeFuture.isReadOnly(), true);
    assert.ok(storeFuture.getNotice().includes('lebih baru'));

    // Saving in read-only mode is rejected
    const blockedSave = storeFuture.save({ mode: 'light' });
    assert.equal(blockedSave.saved, false);
    assert.equal(blockedSave.reason, 'read_only');

  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
