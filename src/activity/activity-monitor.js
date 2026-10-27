'use strict';

// Glue for medium mode: watcher samples go through the classifier into the
// tracker, and remarks go out through onRemark. Starting and stopping the
// monitor starts and stops the watcher, and stopping forgets everything it saw.

const { classify, describe } = require('./classifier');

// options: { createWatcher(onSample) -> { start, stop }, tracker, getIdleSeconds(), onRemark(remark),
//            now?: () => number }
function createActivityMonitor(options) {
  const now = options.now || Date.now;
  let watcher = null;
  let latest = null;

  function handle(sample) {
    latest = classify(sample);
    const { remarks } = options.tracker.feed(latest, now(), options.getIdleSeconds());
    for (const remark of remarks) options.onRemark(remark);
  }

  function start() {
    if (watcher) return;
    watcher = options.createWatcher(handle);
    watcher.start();
  }

  function stop() {
    if (watcher) watcher.stop();
    watcher = null;
    latest = null;
    options.tracker.reset();
  }

  return {
    start: start,
    stop: stop,
    handle: handle,
    get running() {
      return watcher !== null;
    },
    // What Aemeath currently sees, as a category, never a window title.
    describe: () => (watcher ? describe(latest) : null),
    // Cumulative time per category in the current Medium session (in memory only).
    summary: () => (watcher && typeof options.tracker.summary === 'function' ? options.tracker.summary() : null),
  };
}

module.exports = { createActivityMonitor };
