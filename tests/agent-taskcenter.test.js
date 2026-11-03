'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createTaskStore } = require('../src/agent/task-store');
const { createTaskRunner } = require('../src/agent/task-runner');
const { createAgentBridge, messageKey, taskRows } = require('../src/agent/agent-bridge');
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

test('a session used in the last minute is refused, so two windows never write to it', () => {
  const bridge = bridgeWith([{ id: B, ageMs: 30 * 1000 }]);
  assert.deepEqual(bridge.useSession(1), { ok: false, code: 'session_active' });
  assert.equal(bridge.currentSession(), null);
});

test('a session exactly a minute old is allowed', () => {
  const bridge = bridgeWith([{ id: B, ageMs: 60 * 1000 }]);
  assert.deepEqual(bridge.useSession(1), { ok: true, id: B });
});

test('the session this bridge is already using is never refused for being fresh', async () => {
  const bridge = bridgeWith([{ id: A, ageMs: 1000 }]);
  await bridge.ask('halo'); // the adapter hands back session A
  assert.equal(bridge.currentSession(), A);
  assert.deepEqual(bridge.useSession(1), { ok: true, id: A });
});

test('task rows carry status, times and a catalog key, and no text', () => {
  const tasks = [
    { status: 'failed', createdAt: 1000, startedAt: 1500, endedAt: 4500, attempts: 2, errorCode: 'auth', capability: 'agent.claude.run', sessionId: A },
    { status: 'running', createdAt: 900, startedAt: 950, endedAt: null, attempts: 1, errorCode: null },
    { status: 'failed', createdAt: 800, startedAt: null, endedAt: 810, attempts: 0, errorCode: 'interrupted' },
    { status: 'failed', createdAt: 700, startedAt: 710, endedAt: 720, attempts: 1, errorCode: 'whatever' },
    { status: 'succeeded', createdAt: 600, startedAt: 610, endedAt: 700, attempts: 1, errorCode: null },
  ];
  const rows = taskRows(tasks);
  assert.deepEqual(rows[0], { status: 'failed', createdAt: 1000, durationMs: 3000, attempts: 2, errorKey: 'agent.auth' });
  assert.deepEqual(rows[1], { status: 'running', createdAt: 900, durationMs: null, attempts: 1, errorKey: null });
  assert.equal(rows[2].errorKey, 'agent.interrupted');
  assert.equal(rows[3].errorKey, 'agent.error');
  assert.equal(rows[4].errorKey, null);
  assert.equal(JSON.stringify(rows).includes(A), false, 'no session id leaves the main process');
  assert.equal(taskRows(tasks, 2).length, 2);
  assert.equal(taskRows(Array.from({ length: 30 }, () => tasks[1])).length, 10);
});

test('rows come out of a real store, newest first', async () => {
  const store = createTaskStore();
  const runner = createTaskRunner({ store });
  const bridge = createAgentBridge({
    store,
    runner,
    adapter: { run: async () => ({ sessionId: A, text: 'ok', denials: [] }) },
    isEnabled: () => true,
  });
  await bridge.ask('satu');
  await bridge.ask('dua');
  const rows = taskRows(store.list());
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.status), ['succeeded', 'succeeded']);
  assert.ok(rows[0].createdAt >= rows[1].createdAt);
});

test('every new text exists in both languages', () => {
  const keys = [
    'agent.session_active', 'agent.interrupted',
    'settings.agent.tasks_title', 'settings.agent.tasks_refresh', 'settings.agent.tasks_stop',
    'settings.agent.tasks_none', 'settings.agent.tasks_seconds', 'settings.agent.tasks_attempt',
    'settings.agent.status_pending', 'settings.agent.status_planning', 'settings.agent.status_awaiting_approval',
    'settings.agent.status_running', 'settings.agent.status_succeeded', 'settings.agent.status_failed',
    'settings.agent.status_cancelled',
    'settings.commands.builtin_focus', 'settings.commands.builtin_quest', 'settings.commands.builtin_chronicle',
    'settings.commands.builtin_memory', 'settings.commands.builtin_feature', 'settings.commands.builtin_claude',
    'settings.commands.builtin_jadwal',
  ];
  for (const locale of ['id-ID', 'en-US']) {
    const t = createI18n({ locale }).t;
    for (const key of keys) assert.notEqual(t(key, { n: 1 }), key, locale + ' is missing ' + key);
  }
  assert.equal(messageKey('session_active'), 'agent.session_active');
  assert.equal(messageKey('interrupted'), 'agent.interrupted');
});
