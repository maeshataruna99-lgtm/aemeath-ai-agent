'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createTaskStore } = require('../src/agent/task-store');
const { createTaskRunner } = require('../src/agent/task-runner');
const { createAgentBridge } = require('../src/agent/agent-bridge');
const { createI18n } = require('../src/i18n');

const SID = '899bd7ff-d492-4139-bc28-c557401c0044';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aem-life-'));
}

function bridgeOn(store, adapterRun, enabled) {
  return createAgentBridge({
    store,
    runner: createTaskRunner({ store }),
    adapter: { run: adapterRun },
    isEnabled: () => enabled !== false,
  });
}

test('purging the store removes its files and nothing else in the folder', () => {
  const dir = tmpDir();
  const store = createTaskStore({ dir });
  store.create({ capability: 'agent.claude.run' });
  fs.writeFileSync(path.join(dir, 'tasks.corrupt-123.json'), '{}');
  fs.writeFileSync(path.join(dir, 'tasks.json.tmp'), '{}');
  for (const keep of ['memory.json', 'settings.json', 'chat-history.json', 'tasks-backup.json']) {
    fs.writeFileSync(path.join(dir, keep), 'keep me');
  }
  store.purge();
  assert.deepEqual(store.list(), []);
  assert.deepEqual(
    fs.readdirSync(dir).sort(),
    ['chat-history.json', 'memory.json', 'settings.json', 'tasks-backup.json']
  );
  // the store still works afterwards
  store.create({ capability: 'agent.claude.run' });
  assert.equal(store.list().length, 1);
});

test('an in-memory store can be purged too', () => {
  const store = createTaskStore();
  store.create({ capability: 'x' });
  store.purge();
  assert.deepEqual(store.list(), []);
});

test('shutdown ends a running request and waits until it is finished', async () => {
  const store = createTaskStore();
  const bridge = bridgeOn(store, () => new Promise(() => {}));
  const pending = bridge.ask('panjang');
  await new Promise((resolve) => setImmediate(resolve));
  await bridge.shutdown();
  assert.deepEqual(await pending, { ok: false, code: 'cancelled' });
  assert.equal(store.list()[0].status, 'cancelled');
  assert.equal(bridge.currentSession(), null);
});

test('shutdown with nothing running is harmless and forgets the session', async () => {
  const store = createTaskStore();
  const bridge = bridgeOn(store, async () => ({ sessionId: SID, text: 'ok', denials: [] }));
  await bridge.ask('a');
  assert.equal(bridge.currentSession(), SID);
  await bridge.shutdown();
  assert.equal(bridge.currentSession(), null);
});

test('purge stops the running request, then deletes the records without errors', async () => {
  const dir = tmpDir();
  const store = createTaskStore({ dir });
  let calls = 0;
  const bridge = bridgeOn(store, () => (++calls === 1 ? Promise.resolve({ sessionId: SID, text: 'ok', denials: [] }) : new Promise(() => {})));
  await bridge.ask('selesai');
  const pending = bridge.ask('berjalan');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.list().length, 2);
  await bridge.purge();
  assert.equal((await pending).code, 'cancelled');
  assert.deepEqual(store.list(), []);
  assert.equal(fs.existsSync(path.join(dir, 'tasks.json')), false);
});

test('the module can be used again after a purge and stays off when disabled', async () => {
  const store = createTaskStore();
  const bridge = bridgeOn(store, async () => ({ sessionId: SID, text: 'ok', denials: [] }));
  await bridge.purge();
  assert.equal((await bridge.ask('lagi')).ok, true);

  const off = bridgeOn(createTaskStore(), async () => assert.fail('must not run'), false);
  assert.deepEqual(await off.ask('x'), { ok: false, code: 'disabled' });
  await off.purge();
});

test('the purge texts exist in both languages and say what is kept', () => {
  for (const locale of ['id-ID', 'en-US']) {
    const t = createI18n({ locale }).t;
    for (const key of ['purge_button', 'purge_hint', 'purge_confirm', 'purge_done']) {
      assert.notEqual(t('settings.agent.' + key), 'settings.agent.' + key, locale + ' is missing ' + key);
    }
    assert.match(t('settings.agent.purge_confirm'), locale === 'id-ID' ? /Riwayat obrolan/ : /Chat history/);
  }
});
