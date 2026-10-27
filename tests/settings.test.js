'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createSettingsStore, migrateLegacySettings } = require('../src/settings');

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aemeath-' + name + '-'));
}

test('legacy settings are copied once into an empty userData directory', () => {
  const legacy = tempDir('legacy');
  const current = path.join(tempDir('current'), 'Aemeath');
  fs.writeFileSync(path.join(legacy, 'settings.json'), JSON.stringify({ scale: 0.7, x: 42 }));

  assert.equal(migrateLegacySettings(current, legacy), true);
  const store = createSettingsStore(current);
  const data = store.load();
  assert.equal(data.scale, 0.7);
  assert.equal(data.x, 42);
  assert.equal(data.chatterEnabled, true, 'new settings fall back to defaults');

  fs.writeFileSync(path.join(legacy, 'settings.json'), JSON.stringify({ scale: 2 }));
  assert.equal(migrateLegacySettings(current, legacy), false, 'never overwrites existing settings');
  assert.equal(createSettingsStore(current).load().scale, 0.7);
});

test('migration is a no-op when there is no legacy settings file', () => {
  const current = path.join(tempDir('none'), 'Aemeath');
  assert.equal(migrateLegacySettings(current, path.join(tempDir('empty'), 'missing')), false);
});

test('chatterEnabled stays boolean', () => {
  const store = createSettingsStore(tempDir('bool'));
  store.load();
  assert.equal(store.save({ chatterEnabled: 'x' }).chatterEnabled, true);
  assert.equal(store.save({ chatterEnabled: false }).chatterEnabled, false);
});

test('chatStreaming defaults to true and stays boolean', () => {
  const store = createSettingsStore(tempDir('stream'));
  assert.equal(store.load().chatStreaming, true);
  assert.equal(store.save({ chatStreaming: false }).chatStreaming, false);
  assert.equal(store.save({ chatStreaming: 'not-bool' }).chatStreaming, true);
});

test('chat interval is clamped to 1-15 minutes and survives a reload', () => {
  const dir = tempDir('interval');
  const store = createSettingsStore(dir);
  assert.equal(store.load().chatterIntervalMin, 3.5);
  assert.equal(store.save({ chatterIntervalMin: 0 }).chatterIntervalMin, 1);
  assert.equal(store.save({ chatterIntervalMin: 99 }).chatterIntervalMin, 15);
  assert.equal(store.save({ chatterIntervalMin: 'x' }).chatterIntervalMin, 3.5);
  store.save({ chatterIntervalMin: 7.5 });
  assert.equal(createSettingsStore(dir).load().chatterIntervalMin, 7.5);
});

test('interactive mode defaults to low and only low or medium are accepted', () => {
  const dir = tempDir('mode');
  const store = createSettingsStore(dir);
  assert.equal(store.load().interactiveMode, 'low');
  assert.equal(store.save({ interactiveMode: 'medium' }).interactiveMode, 'medium');
  assert.equal(createSettingsStore(dir).load().interactiveMode, 'medium');

  // full is announced but not built, so it can never be switched on
  for (const bad of ['full', 'FULL', 'extreme', '', null, 3, undefined]) {
    assert.equal(store.save({ interactiveMode: bad }).interactiveMode, 'low', String(bad));
  }
});

test('a saved full mode from a hand-edited settings file falls back to low', () => {
  const dir = tempDir('fullfile');
  require('node:fs').writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ interactiveMode: 'full' }));
  assert.equal(createSettingsStore(dir).load().interactiveMode, 'low');
});

test('full mode is accepted only when fullConsent is explicitly true, and resets consent when leaving full', () => {
  const dir = tempDir('fullconsent');
  const store = createSettingsStore(dir);
  assert.equal(store.save({ interactiveMode: 'full', fullConsent: true }).interactiveMode, 'full');
  assert.equal(createSettingsStore(dir).load().interactiveMode, 'full');

  // Leaving full mode clears fullConsent so re-entering requires fresh consent
  store.save({ interactiveMode: 'medium' });
  assert.equal(store.data.interactiveMode, 'medium');
  assert.equal(store.data.fullConsent, false);
  assert.equal(store.save({ interactiveMode: 'full' }).interactiveMode, 'low');
});

test('the doomscroll limit is a whole number of minutes between 5 and 120', () => {
  const store = createSettingsStore(tempDir('limit'));
  assert.equal(store.load().doomscrollLimitMin, 20);
  assert.equal(store.save({ doomscrollLimitMin: 1 }).doomscrollLimitMin, 5);
  assert.equal(store.save({ doomscrollLimitMin: 999 }).doomscrollLimitMin, 120);
  assert.equal(store.save({ doomscrollLimitMin: 33.6 }).doomscrollLimitMin, 34);
  assert.equal(store.save({ doomscrollLimitMin: 'x' }).doomscrollLimitMin, 20);
  assert.equal(store.save({ doomscrollLimitMin: NaN }).doomscrollLimitMin, 20);
});

test('the proactive pause switch defaults to off and stays boolean', () => {
  const dir = tempDir('proactive-pause');
  const store = createSettingsStore(dir);
  assert.equal(store.load().proactivePaused, false);
  assert.equal(store.save({ proactivePaused: true }).proactivePaused, true);
  assert.equal(createSettingsStore(dir).load().proactivePaused, true);
  assert.equal(store.save({ proactivePaused: 'yes' }).proactivePaused, false);
});

test('the hourly remark cap is a whole number between 1 and 30', () => {
  const store = createSettingsStore(tempDir('proactive-cap'));
  assert.equal(store.load().proactiveMaxPerHour, 6);
  assert.equal(store.save({ proactiveMaxPerHour: 0 }).proactiveMaxPerHour, 1);
  assert.equal(store.save({ proactiveMaxPerHour: 99 }).proactiveMaxPerHour, 30);
  assert.equal(store.save({ proactiveMaxPerHour: 4.6 }).proactiveMaxPerHour, 5);
  assert.equal(store.save({ proactiveMaxPerHour: 'x' }).proactiveMaxPerHour, 6);
  assert.equal(store.save({ proactiveMaxPerHour: NaN }).proactiveMaxPerHour, 6);
});

test('the remark cooldown is a whole number of minutes between 0 and 60', () => {
  const store = createSettingsStore(tempDir('proactive-cooldown'));
  assert.equal(store.load().proactiveCooldownMin, 10);
  assert.equal(store.save({ proactiveCooldownMin: 0 }).proactiveCooldownMin, 0, 'zero turns the cooldown off');
  assert.equal(store.save({ proactiveCooldownMin: -5 }).proactiveCooldownMin, 0);
  assert.equal(store.save({ proactiveCooldownMin: 120 }).proactiveCooldownMin, 60);
  assert.equal(store.save({ proactiveCooldownMin: 'x' }).proactiveCooldownMin, 10);
});

test('staying still is off by default and only accepts a boolean', () => {
  const store = createSettingsStore(tempDir('still'));
  assert.equal(store.load().stayStill, false);
  assert.equal(store.save({ stayStill: true }).stayStill, true);
  assert.equal(store.save({ stayStill: 'yes' }).stayStill, false);
});

test('chatShortcut defaults to Alt+Space, accepts valid presets or empty string, and rejects arbitrary strings', () => {
  const dir = tempDir('shortcut');
  const store = createSettingsStore(dir);
  assert.equal(store.load().chatShortcut, 'Alt+Space');
  assert.equal(store.save({ chatShortcut: 'CommandOrControl+Shift+A' }).chatShortcut, 'CommandOrControl+Shift+A');
  assert.equal(store.save({ chatShortcut: '' }).chatShortcut, '', 'empty string disables the shortcut');
  assert.equal(createSettingsStore(dir).load().chatShortcut, '');
  assert.equal(store.save({ chatShortcut: 'Ctrl+Alt+Delete' }).chatShortcut, 'Alt+Space', 'unknown shortcut falls back to default');
});

test('transparentMode defaults to false and opacity is clamped between 0.15 and 1.0', () => {
  const dir = tempDir('transparent');
  const store = createSettingsStore(dir);
  assert.equal(store.load().transparentMode, false);
  assert.equal(store.load().opacity, 0.6);

  assert.equal(store.save({ transparentMode: true, opacity: 0.45 }).transparentMode, true);
  assert.equal(store.data.opacity, 0.45);
  assert.equal(createSettingsStore(dir).load().transparentMode, true);
  assert.equal(createSettingsStore(dir).load().opacity, 0.45);

  assert.equal(store.save({ opacity: 0.01 }).opacity, 0.15);
  assert.equal(store.save({ opacity: 5 }).opacity, 1);
  assert.equal(store.save({ transparentMode: 'yes', opacity: 'x' }).transparentMode, false);
  assert.equal(store.data.opacity, 0.6);
});
