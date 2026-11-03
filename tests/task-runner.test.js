'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createTaskStore } = require('../src/agent/task-store');
const { createTaskRunner } = require('../src/agent/task-runner');

function setup() {
  const store = createTaskStore();
  const sleeps = [];
  const runner = createTaskRunner({ store, sleep: async (ms) => sleeps.push(ms) });
  const task = store.create({ capability: 'agent.claude.run' });
  return { store, runner, task, sleeps };
}

function fail(code, retryable) {
  const err = new Error(code);
  err.code = code;
  err.retryable = retryable;
  return err;
}

test('a validated result succeeds', async () => {
  const { store, runner, task } = setup();
  const done = await runner.run(task.id, async () => ({ text: 'ok' }), { validate: (r) => r.text === 'ok' });
  assert.equal(done.status, 'succeeded');
  assert.equal(store.get(task.id).attempts, 1);
});

test('an output that fails validation is a failure, not a success', async () => {
  const { runner, task } = setup();
  const done = await runner.run(task.id, async () => ({ text: '' }), { validate: (r) => r.text !== '' });
  assert.equal(done.status, 'failed');
  assert.equal(done.errorCode, 'invalid_output');
});

test('an executor error fails with its code and is not retried by default', async () => {
  const { runner, task } = setup();
  let calls = 0;
  const done = await runner.run(
    task.id,
    async () => {
      calls++;
      throw fail('auth', false);
    },
    { maxAttempts: 3 }
  );
  assert.equal(done.status, 'failed');
  assert.equal(done.errorCode, 'auth');
  assert.equal(calls, 1);
});

test('a hung executor times out even if it ignores the signal', async () => {
  const { runner, task } = setup();
  const done = await runner.run(task.id, () => new Promise(() => {}), { timeoutMs: 20 });
  assert.equal(done.status, 'failed');
  assert.equal(done.errorCode, 'timeout');
});

test('retryable failures retry with growing backoff and then succeed', async () => {
  const { store, runner, task, sleeps } = setup();
  let calls = 0;
  const done = await runner.run(
    task.id,
    async () => {
      calls++;
      if (calls < 3) throw fail('api', true);
      return { ok: true };
    },
    { maxAttempts: 3, backoffMs: 10 }
  );
  assert.equal(done.status, 'succeeded');
  assert.equal(store.get(task.id).attempts, 3);
  assert.deepEqual(sleeps, [10, 20]);
});

test('retries are bounded', async () => {
  const { runner, task } = setup();
  let calls = 0;
  const done = await runner.run(
    task.id,
    async () => {
      calls++;
      throw fail('api', true);
    },
    { maxAttempts: 2, backoffMs: 1 }
  );
  assert.equal(done.status, 'failed');
  assert.equal(done.errorCode, 'api');
  assert.equal(calls, 2);
});

test('cancel stops a running task', async () => {
  const { runner, task } = setup();
  const finished = runner.run(task.id, () => new Promise(() => {}), { timeoutMs: 5000 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(runner.cancel(task.id), true);
  assert.equal((await finished).status, 'cancelled');
});

test('cancel works on a queued task and is false once finished', async () => {
  const { store, runner, task } = setup();
  assert.equal(runner.cancel(task.id), true);
  assert.equal(store.get(task.id).status, 'cancelled');
  assert.equal(runner.cancel(task.id), false);
  assert.equal(runner.cancel('missing'), false);
});

test('a task that never returns is never reported as succeeded', async () => {
  const { store, runner, task } = setup();
  runner.run(task.id, () => new Promise(() => {}), { timeoutMs: 5000 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.get(task.id).status, 'running');
  runner.cancel(task.id);
});
