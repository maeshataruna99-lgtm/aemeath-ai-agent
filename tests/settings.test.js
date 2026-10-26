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
