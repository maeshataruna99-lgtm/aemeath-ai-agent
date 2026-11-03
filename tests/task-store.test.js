'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createTaskStore } = require('../src/agent/task-store');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aem-tasks-'));
}

test('create starts pending and rejects a bad capability', () => {
  const store = createTaskStore();
  const task = store.create({ capability: 'agent.claude.run' });
  assert.equal(task.status, 'pending');
  assert.equal(task.attempts, 0);
  assert.throws(() => store.create({ capability: 'Bad Name!' }), { code: 'invalid_capability' });
  assert.throws(() => store.create({}), { code: 'invalid_capability' });
});

test('a repeated idempotency key returns the same task until it fails or is cancelled', () => {
  const store = createTaskStore();
  const a = store.create({ capability: 'agent.claude.run', idempotencyKey: 'k1' });
  const b = store.create({ capability: 'agent.claude.run', idempotencyKey: 'k1' });
  assert.equal(a.id, b.id);
  assert.equal(store.list().length, 1);

  store.transition(a.id, 'running');
  store.transition(a.id, 'failed', { errorCode: 'timeout' });
  const c = store.create({ capability: 'agent.claude.run', idempotencyKey: 'k1' });
  assert.notEqual(c.id, a.id);
});

test('only valid status transitions are accepted', () => {
  const store = createTaskStore();
  const { id } = store.create({ capability: 'agent.claude.run' });
  store.transition(id, 'planning');
  store.transition(id, 'awaiting_approval');
  store.transition(id, 'running');
  store.transition(id, 'succeeded');
  assert.throws(() => store.transition(id, 'running'), { code: 'invalid_transition' });
  assert.throws(() => store.transition('nope', 'running'), { code: 'not_found' });
});

test('terminal states stamp the end time and keep a safe error code', () => {
  let clock = 1000;
  const store = createTaskStore({ now: () => clock });
  const a = store.create({ capability: 'x' });
  store.transition(a.id, 'running');
  clock = 2000;
  const failed = store.transition(a.id, 'failed', { errorCode: 'sk-secret key here' });
  assert.equal(failed.endedAt, 2000);
  assert.equal(failed.startedAt, 1000);
  assert.equal(failed.errorCode, 'error');

  const b = store.create({ capability: 'x' });
  store.transition(b.id, 'running');
  assert.equal(store.transition(b.id, 'succeeded').errorCode, null);
});

test('records survive a restart and stay metadata only', () => {
  const dir = tmpDir();
  const first = createTaskStore({ dir });
  const t = first.create({ capability: 'agent.claude.run', prompt: 'secret prompt text' });
  first.transition(t.id, 'running', { sessionId: 'abc', attempts: 1 });
  first.transition(t.id, 'succeeded');

  const second = createTaskStore({ dir });
  assert.equal(second.get(t.id).status, 'succeeded');
  assert.equal(second.get(t.id).sessionId, 'abc');
  assert.equal(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf8').includes('secret prompt'), false);
});

test('tasks that were in flight when the app died come back failed as interrupted', () => {
  const dir = tmpDir();
  const first = createTaskStore({ dir });
  const running = first.create({ capability: 'x' });
  first.transition(running.id, 'running');
  const waiting = first.create({ capability: 'x' });
  first.transition(waiting.id, 'planning');
  first.transition(waiting.id, 'awaiting_approval');
  const queued = first.create({ capability: 'x' });

  const second = createTaskStore({ dir });
  assert.equal(second.get(running.id).status, 'failed');
  assert.equal(second.get(running.id).errorCode, 'interrupted');
  assert.equal(second.get(waiting.id).errorCode, 'interrupted');
  assert.equal(second.get(queued.id).status, 'pending');
});

test('a corrupt file is moved aside and the store starts empty', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'tasks.json'), '{not json');
  const store = createTaskStore({ dir, now: () => 42 });
  assert.equal(store.list().length, 0);
  assert.equal(fs.existsSync(path.join(dir, 'tasks.corrupt-42.json')), true);
  store.create({ capability: 'x' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf8')).version, 1);
});

test('pruning drops the oldest finished tasks and never a live one', () => {
  const store = createTaskStore();
  const live = store.create({ capability: 'x' });
  for (let i = 0; i < 210; i++) {
    const t = store.create({ capability: 'x' });
    store.transition(t.id, 'cancelled');
  }
  assert.equal(store.list().length, 200);
  assert.equal(store.get(live.id).status, 'pending');
});
