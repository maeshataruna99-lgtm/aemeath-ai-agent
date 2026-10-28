'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { applyTheme } = require('../renderer/theme-apply');
const { mergeTheme, normalizeTheme, createDefaultTheme } = require('../src/theme/theme-schema');
const { createThemeStore } = require('../src/theme/theme-store');
const { deriveTokens } = require('../src/theme/derive');

test('theme-apply: applies --glass-* tokens to document root and manages mode classes', () => {
  const setProps = {};
  const classListSet = new Set();

  const mockDoc = {
    documentElement: {
      style: {
        setProperty: (key, val) => {
          setProps[key] = val;
        },
      },
    },
    body: {
      classList: {
        add: (cls) => classListSet.add(cls),
        remove: (cls) => classListSet.delete(cls),
        toggle: (cls, force) => {
          if (force) classListSet.add(cls);
          else classListSet.delete(cls);
        },
      },
    },
  };

  const payload = {
    effectiveMode: 'light',
    theme: {
      mode: 'light',
      effects: { reduce: true },
    },
    tokens: {
      '--glass-bg': 'rgba(255, 255, 255, 0.95)',
      '--glass-border': '#f472b6',
      '--glass-blur': '0px',
      'invalid-key': 'malicious-content',
    },
  };

  const result = applyTheme(payload, mockDoc);
  assert.equal(result, true);
  assert.equal(setProps['--glass-bg'], 'rgba(255, 255, 255, 0.95)');
  assert.equal(setProps['--glass-border'], '#f472b6');
  assert.equal(setProps['--glass-blur'], '0px');
  // Non --glass- properties must NOT be set
  assert.equal(setProps['invalid-key'], undefined);

  // Body classes
  assert.ok(classListSet.has('mode-light'));
  assert.ok(!classListSet.has('mode-dark'));
  assert.ok(classListSet.has('reduce-effects'));
});

test('theme-apply: safely rejects null, undefined, or empty payloads', () => {
  assert.equal(applyTheme(null), false);
  assert.equal(applyTheme({}), false);
  assert.equal(applyTheme({ tokens: 'not-an-object' }), false);
});

test('theme-schema: mergeTheme merges partial patches without losing existing properties', () => {
  const base = createDefaultTheme();
  base.accent.hue = 200;
  base.glass.blur = 30;

  const patch = {
    accent: { chroma: 0.2 },
    effects: { reduce: true },
  };

  const merged = mergeTheme(base, patch);
  assert.equal(merged.accent.hue, 200, 'Original hue must be preserved');
  assert.equal(merged.accent.chroma, 0.2, 'Patched chroma must be updated');
  assert.equal(merged.glass.blur, 30, 'Original glass blur must be preserved');
  assert.equal(merged.effects.reduce, true, 'Patched reduce must be true');
});

test('theme-schema: mergeTheme clamps extreme patch values safely', () => {
  const base = createDefaultTheme();
  const extremePatch = {
    accent: { hue: 9999, chroma: 5.0, lightness: -10 },
    glass: { opacity: 50, blur: 500, radius: -10 },
  };

  const merged = mergeTheme(base, extremePatch);
  assert.equal(merged.accent.hue, 360);
  assert.equal(merged.accent.chroma, 0.25);
  assert.equal(merged.accent.lightness, 0.3);
  assert.equal(merged.glass.opacity, 0.90);
  assert.equal(merged.glass.blur, 40);
  assert.equal(merged.glass.radius, 8);
});

test('theme-store: patch method updates and persists partial changes atomically', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aemeath-theme-ipc-test-'));
  try {
    const store = createThemeStore({ dir: tmpDir });
    const patchResult = store.patch({
      accent: { hue: 150 },
      preset: 'custom',
    });

    assert.equal(patchResult.saved, true);
    assert.equal(patchResult.theme.accent.hue, 150);
    assert.equal(patchResult.theme.preset, 'custom');

    // Reload store to verify persistence
    const reloaded = createThemeStore({ dir: tmpDir });
    assert.equal(reloaded.getState().accent.hue, 150);
    assert.equal(reloaded.getState().preset, 'custom');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('theme IPC payload: tokens contain only valid CSS variable definitions', () => {
  const defaultTheme = createDefaultTheme();
  const tokens = deriveTokens(defaultTheme, 'dark');

  for (const [key, val] of Object.entries(tokens)) {
    assert.ok(key.startsWith('--glass-'), `Token key must start with --glass-: ${key}`);
    assert.equal(typeof val, 'string', `Token value must be string: ${key}`);
    assert.ok(!val.includes('<script>'), `Token value must not contain executable code: ${val}`);
  }
});
