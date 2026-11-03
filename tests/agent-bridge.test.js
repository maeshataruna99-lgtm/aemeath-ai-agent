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
  assert.deepEqual(first, { ok: true, text: 'jawaban', sessionId: SID, denials: [], approvable: false });
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

test('onText is handed through to the adapter', async () => {
  const { bridge } = setup(async (input) => {
    input.onText('ha');
    input.onText('lo');
    return { sessionId: SID, text: 'halo' };
  });
  const seen = [];
  const res = await bridge.ask('x', { onText: (d) => seen.push(d) });
  assert.equal(res.ok, true);
  assert.deepEqual(seen, ['ha', 'lo']);
});

const { agentReply } = require('../src/agent/agent-bridge');

function approvalSetup(denials, startAt) {
  const store = createTaskStore();
  const runner = createTaskRunner({ store });
  const calls = [];
  let clock = startAt || 1000;
  const adapter = {
    run: async (input) => {
      calls.push(input);
      return { sessionId: SID, text: 'selesai', denials: calls.length === 1 ? denials : [] };
    },
  };
  const bridge = createAgentBridge({ store, runner, adapter, isEnabled: () => true, now: () => clock });
  return { bridge, calls, tick: (ms) => (clock += ms) };
}

const WRITE = [{ tool: 'Write', target: 'a.txt' }];

test('"ya" after an edit was denied resumes the same session once with edits allowed', async () => {
  const { bridge, calls } = approvalSetup(WRITE);
  const first = await bridge.ask('buat a.txt');
  assert.equal(first.approvable, true);
  const approved = await bridge.approve();
  assert.equal(approved.ok, true);
  assert.equal(calls[1].approveEdits, true);
  assert.equal(calls[1].sessionId, SID);
  assert.equal(calls[0].approveEdits, undefined);
  assert.deepEqual(await bridge.approve(), { ok: false, code: 'nothing_to_approve' });
});

test('approval is refused when nothing is waiting, when it expired, or after a new message', async () => {
  const none = approvalSetup([]);
  assert.deepEqual(await none.bridge.approve(), { ok: false, code: 'nothing_to_approve' });

  const old = approvalSetup(WRITE);
  await old.bridge.ask('buat a.txt');
  old.tick(5 * 60 * 1000 + 1);
  assert.deepEqual(await old.bridge.approve(), { ok: false, code: 'nothing_to_approve' });
  assert.equal(old.calls.length, 1);

  const moved = approvalSetup(WRITE);
  await moved.bridge.ask('buat a.txt');
  await moved.bridge.ask('lupakan itu');
  assert.deepEqual(await moved.bridge.approve(), { ok: false, code: 'nothing_to_approve' });

  const reset = approvalSetup(WRITE);
  await reset.bridge.ask('buat a.txt');
  reset.bridge.newSession();
  assert.deepEqual(await reset.bridge.approve(), { ok: false, code: 'nothing_to_approve' });
});

test('a denied shell command cannot be approved', async () => {
  const { bridge, calls } = approvalSetup([{ tool: 'Bash', target: 'rm -rf x' }]);
  const res = await bridge.ask('hapus x');
  assert.equal(res.approvable, false);
  assert.deepEqual(await bridge.approve(), { ok: false, code: 'nothing_to_approve' });
  assert.equal(calls.length, 1);
});

test('an edit mixed with a command is not approvable either', async () => {
  const { bridge } = approvalSetup([WRITE[0], { tool: 'Bash', target: 'x' }]);
  assert.equal((await bridge.ask('x')).approvable, false);
});

test('a disabled bridge cannot approve', async () => {
  const store = createTaskStore();
  const bridge = createAgentBridge({
    store,
    runner: createTaskRunner({ store }),
    adapter: { run: async () => ({ sessionId: SID, text: 'x', denials: [] }) },
    isEnabled: () => false,
  });
  assert.deepEqual(await bridge.approve(), { ok: false, code: 'disabled' });
});

test('the reply says what Claude wanted and how to allow it, in both languages', () => {
  for (const locale of ['id-ID', 'en-US']) {
    const t = createI18n({ locale }).t;
    const editable = agentReply(t, { text: 'jawab', denials: WRITE, approvable: true });
    assert.match(editable, /Write a\.txt/);
    assert.match(editable, /\/claude ya/);
    const blocked = agentReply(t, { text: 'jawab', denials: [{ tool: 'Bash', target: 'ls' }], approvable: false });
    assert.match(blocked, /Bash ls/);
    assert.doesNotMatch(blocked, /\/claude ya untuk|Type \/claude ya/);
    assert.equal(agentReply(t, { text: 'jawab', denials: [], approvable: false }), 'jawab');
    for (const key of ['agent.denied', 'agent.approve_hint', 'agent.denied_blocked', 'agent.nothing_to_approve']) {
      assert.notEqual(t(key), key, locale + ' is missing ' + key);
    }
  }
});
