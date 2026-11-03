'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createTaskStore } = require('../src/agent/task-store');
const { createTaskRunner } = require('../src/agent/task-runner');
const { createAgentBridge, ageText } = require('../src/agent/agent-bridge');
const { createI18n } = require('../src/i18n');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function bridgeWith(list, adapterRun) {
  const store = createTaskStore();
  return createAgentBridge({
    store,
    runner: createTaskRunner({ store }),
    adapter: { run: adapterRun || (async (input) => ({ sessionId: input.sessionId || A, text: 'ok', denials: [] })) },
    isEnabled: () => true,
    getDir: () => 'C:/proj',
    listSessions: () => list,
  });
}

test('a session can be chosen by an id taken from the list', () => {
  const bridge = bridgeWith([{ id: A, ageMs: 5 * 60000 }, { id: B, ageMs: 9 * 60000 }]);
  assert.deepEqual(bridge.useSession(B), { ok: true, id: B });
  assert.equal(bridge.currentSession(), B);
});

test('an id that is not in the list is refused, whatever it looks like', () => {
  const bridge = bridgeWith([{ id: A, ageMs: 5 * 60000 }]);
  for (const ref of [B, '--dangerous', '', '33333333-3333-4333-8333-333333333333']) {
    assert.deepEqual(bridge.useSession(ref), { ok: false, code: 'session_not_found' }, String(ref));
  }
  assert.equal(bridge.currentSession(), null);
});

test('choosing by id keeps the guard against a session that was just written', () => {
  const bridge = bridgeWith([{ id: B, ageMs: 20000 }]);
  assert.deepEqual(bridge.useSession(B), { ok: false, code: 'session_active' });
});

test('choosing by number still works', () => {
  const bridge = bridgeWith([{ id: A, ageMs: 5 * 60000 }, { id: B, ageMs: 9 * 60000 }]);
  assert.deepEqual(bridge.useSession(2), { ok: true, id: B });
});

test('no session can be chosen while a request runs', async () => {
  const bridge = bridgeWith([{ id: B, ageMs: 9 * 60000 }], () => new Promise(() => {}));
  const pending = bridge.ask('panjang');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(bridge.useSession(B), { ok: false, code: 'busy' });
  bridge.stop();
  await pending;
});

test('a session age reads naturally in both languages', () => {
  const id = createI18n({ locale: 'id-ID' }).t;
  const en = createI18n({ locale: 'en-US' }).t;
  assert.equal(ageText(id, 20000), 'baru saja');
  assert.equal(ageText(id, 5 * 60000), '5 menit lalu');
  assert.equal(ageText(en, 5 * 60000), '5 min ago');
  assert.equal(ageText(id, 3 * 3600000), '3 jam lalu');
  assert.equal(ageText(en, 2 * 86400000), '2 d ago');
});

test('every Claude mode and session text exists in both languages', () => {
  const keys = [
    'agent.mode_on',
    'chat.claude_mode_badge', 'chat.claude_placeholder', 'chat.claude_mode_off', 'chat.claude_mode_already',
    'chat.claude_mode_not_on', 'chat.claude_mode_ended', 'chat.claude_mode_terminal',
    'chat.session_button_title', 'chat.session_label', 'chat.session_none', 'chat.session_new',
    'chat.session_new_done', 'chat.session_changed',
    'settings.commands.builtin_claude_mode',
  ];
  for (const locale of ['id-ID', 'en-US']) {
    const t = createI18n({ locale }).t;
    for (const key of keys) assert.notEqual(t(key, { name: 'x', id: 'y' }), key, locale + ' is missing ' + key);
    assert.match(t('agent.mode_on', { name: 'proyek' }), /proyek/);
    assert.match(t('chat.session_label', { id: 'abcd1234' }), /abcd1234/);
  }
});
