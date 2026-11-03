'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createTaskStore } = require('../src/agent/task-store');
const { createTaskRunner } = require('../src/agent/task-runner');
const { createAgentBridge, messageKey } = require('../src/agent/agent-bridge');
const { createI18n } = require('../src/i18n');

const SID = '899bd7ff-d492-4139-bc28-c557401c0044';

function setup(adapterRun, enabled) {
  const store = createTaskStore();
  const runner = createTaskRunner({ store });
  const seen = [];
  const adapter = {
    run: (input) => {
      seen.push(input);
      return adapterRun(input);
    },
  };
  const bridge = createAgentBridge({ store, runner, adapter, isEnabled: () => enabled !== false });
  return { store, bridge, seen };
}

test('disabled bridge refuses and never starts a task or a process', async () => {
  const { store, bridge, seen } = setup(async () => ({ sessionId: SID, text: 'x' }), false);
  assert.deepEqual(await bridge.ask('halo'), { ok: false, code: 'disabled' });
  assert.equal(seen.length, 0);
  assert.equal(store.list().length, 0);
});

test('an empty message gets the usage hint', async () => {
  const { bridge } = setup(async () => ({ sessionId: SID, text: 'x' }));
  assert.deepEqual(await bridge.ask('   '), { ok: false, code: 'empty_prompt' });
});

test('the answer comes back and the next message resumes the same session', async () => {
  const { store, bridge, seen } = setup(async () => ({ sessionId: SID, text: 'jawaban' }));
  const first = await bridge.ask('halo');
  assert.deepEqual(first, { ok: true, text: 'jawaban', sessionId: SID });
  assert.equal(bridge.currentSession(), SID);
  await bridge.ask('lagi');
  assert.equal(seen[0].sessionId, null);
  assert.equal(seen[1].sessionId, SID);
  assert.deepEqual(store.list().map((t) => t.status), ['succeeded', 'succeeded']);
  assert.equal(JSON.stringify(store.list()).includes('jawaban'), false);
});

test('newSession drops the remembered session', async () => {
  const { bridge, seen } = setup(async () => ({ sessionId: SID, text: 'ok' }));
  await bridge.ask('a');
  bridge.newSession();
  assert.equal(bridge.currentSession(), null);
  await bridge.ask('b');
  assert.equal(seen[1].sessionId, null);
});

test('an adapter failure keeps its code and records a failed task', async () => {
  const { store, bridge } = setup(async () => {
    const err = new Error('auth');
    err.code = 'auth';
    throw err;
  });
  assert.deepEqual(await bridge.ask('halo'), { ok: false, code: 'auth' });
  assert.equal(store.list()[0].status, 'failed');
  assert.equal(store.list()[0].errorCode, 'auth');
  assert.equal(bridge.currentSession(), null);
});

test('an empty answer is not a success', async () => {
  const { bridge } = setup(async () => ({ sessionId: SID, text: '  ' }));
  const res = await bridge.ask('halo');
  assert.equal(res.ok, false);
  assert.equal(res.code, 'invalid_output');
});

test('a second message while one runs is refused, and stop cancels the first', async () => {
  const { bridge } = setup(() => new Promise(() => {}));
  const first = bridge.ask('panjang');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await bridge.ask('kedua'), { ok: false, code: 'busy' });
  assert.equal(bridge.stop(), true);
  assert.deepEqual(await first, { ok: false, code: 'cancelled' });
  assert.equal(bridge.stop(), false);
});

test('every failure code has a message in both languages', () => {
  const codes = [
    'disabled', 'busy', 'empty_prompt', 'not_installed', 'auth', 'max_turns', 'timeout', 'api',
    'error', 'no_result', 'spawn_failed', 'cancelled', 'invalid_session', 'interrupted', 'invalid_output', 'whatever',
  ];
  for (const locale of ['id-ID', 'en-US']) {
    const t = createI18n({ locale }).t;
    for (const code of codes) {
      const key = messageKey(code);
      assert.notEqual(t(key), key, locale + ' is missing ' + key);
    }
    for (const key of ['stopped', 'nothing_running', 'new_session', 'no_session']) {
      assert.notEqual(t('agent.' + key), 'agent.' + key, locale + ' is missing agent.' + key);
    }
    assert.match(t('agent.session_id', { id: SID }), new RegExp(SID));
    assert.notEqual(t('settings.agent.toggle'), 'settings.agent.toggle');
  }
});
