'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createSettingsStore } = require('../src/settings');
const { createTaskStore } = require('../src/agent/task-store');
const { createTaskRunner } = require('../src/agent/task-runner');
const { createAgentBridge } = require('../src/agent/agent-bridge');
const { createI18n } = require('../src/i18n');

function store() {
  return createSettingsStore(fs.mkdtempSync(path.join(os.tmpdir(), 'aem-fold-')));
}

test('the recent folders start empty and keep only a few clean absolute paths', () => {
  const s = store();
  assert.deepEqual(s.load().agentRecentDirs, []);
  const a = path.resolve(os.tmpdir(), 'a');
  const b = path.resolve(os.tmpdir(), 'b');
  assert.deepEqual(s.save({ agentRecentDirs: [a, b, a] }).agentRecentDirs, [a, b]);
  const messy = [a, 'relative/dir', 42, null, '', 'x'.repeat(600), b];
  assert.deepEqual(s.save({ agentRecentDirs: messy }).agentRecentDirs, [a, b]);
  const many = Array.from({ length: 9 }, (_, i) => path.resolve(os.tmpdir(), 'd' + i));
  assert.equal(s.save({ agentRecentDirs: many }).agentRecentDirs.length, 5);
  assert.deepEqual(s.save({ agentRecentDirs: 'not a list' }).agentRecentDirs, []);
});

test('the bridge reports busy only while a request runs', async () => {
  const taskStore = createTaskStore();
  let finish = null;
  const bridge = createAgentBridge({
    store: taskStore,
    runner: createTaskRunner({ store: taskStore }),
    adapter: {
      run: () =>
        new Promise((resolve) => {
          finish = () => resolve({ sessionId: '11111111-1111-4111-8111-111111111111', text: 'ok', denials: [] });
        }),
    },
    isEnabled: () => true,
  });
  assert.equal(bridge.busy(), false);
  const pending = bridge.ask('halo');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(bridge.busy(), true);
  finish();
  await pending;
  assert.equal(bridge.busy(), false);
});

test('the folder menu texts exist in both languages', () => {
  for (const locale of ['id-ID', 'en-US']) {
    const t = createI18n({ locale }).t;
    for (const key of ['folder_button_title', 'folder_home', 'folder_pick', 'folder_busy', 'folder_changed', 'folder_error']) {
      assert.notEqual(t('chat.' + key, { name: 'x' }), 'chat.' + key, locale + ' is missing chat.' + key);
    }
    assert.match(t('chat.folder_changed', { name: 'proyek' }), /proyek/);
  }
});
