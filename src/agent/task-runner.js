'use strict';

// Runs one task through a store: timeout, cancel, bounded retry, output check.
// A task succeeds only when the executor resolved and `validate` accepted what
// it returned. Starting a process or getting an answer back is not success.

const { TERMINAL } = require('./task-store');

function coded(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// options: { store, sleep?(ms) }
function createTaskRunner(options) {
  const store = options.store;
  const sleep = options.sleep || defaultSleep;
  const active = new Map(); // task id -> AbortController
  const cancelled = new Set();

  // executor({ signal }) -> result. Throw an error with `code`, and
  // `retryable: true` when another attempt makes sense. Timeouts always retry.
  // opts: { timeoutMs?, maxAttempts?, backoffMs?, validate?(result) -> boolean }
  async function run(id, executor, runOpts) {
    const o = runOpts || {};
    const timeoutMs = o.timeoutMs || 120000;
    const maxAttempts = o.maxAttempts || 1;
    const backoffMs = o.backoffMs == null ? 500 : o.backoffMs;
    const validate = o.validate || (() => true);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const ctrl = new AbortController();
      active.set(id, ctrl);
      store.transition(id, 'running', { attempts: attempt });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        ctrl.abort();
      }, timeoutMs);
      const aborted = new Promise((_, reject) => {
        ctrl.signal.addEventListener('abort', () => reject(coded('aborted')), { once: true });
      });
      try {
        const result = await Promise.race([executor({ signal: ctrl.signal }), aborted]);
        if (!validate(result)) throw coded('invalid_output');
        return store.transition(id, 'succeeded');
      } catch (err) {
        if (cancelled.has(id)) {
          cancelled.delete(id);
          return store.transition(id, 'cancelled');
        }
        const code = timedOut ? 'timeout' : (err && err.code) || 'error';
        const retryable = timedOut || Boolean(err && err.retryable);
        if (retryable && attempt < maxAttempts) {
          store.transition(id, 'pending');
          await sleep(backoffMs * 2 ** (attempt - 1));
          continue;
        }
        return store.transition(id, 'failed', { errorCode: code });
      } finally {
        clearTimeout(timer);
        active.delete(id);
      }
    }
    return store.get(id);
  }

  // true when the task was running or is now cancelled; false when it had already finished.
  function cancel(id) {
    const ctrl = active.get(id);
    if (ctrl) {
      cancelled.add(id);
      ctrl.abort();
      return true;
    }
    const task = store.get(id);
    if (!task || TERMINAL.has(task.status)) return false;
    store.transition(id, 'cancelled');
    return true;
  }

  return { run, cancel };
}

module.exports = { createTaskRunner };
