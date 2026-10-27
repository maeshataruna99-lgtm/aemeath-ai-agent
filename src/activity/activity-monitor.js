'use strict';

// Glue for medium mode: watcher samples go through the classifier into the
// tracker, and remarks go out through onRemark. Starting and stopping the
// monitor starts and stops the watcher, and stopping forgets everything it saw.

const { classify, describe, workContextOf } = require('./classifier');

// options: { createWatcher(onSample) -> { start, stop }, tracker, getIdleSeconds(), onRemark(remark),
//            screenSampler?: { sample(allow): Promise<object|null>, reset(), describe() },
//            shouldCaptureScreen?: () => boolean, getHour?: () => number, now?: () => number }
function createActivityMonitor(options) {
  const now = options.now || Date.now;
  const getHour = options.getHour || ((ms) => new Date(ms).getHours());
  const screenSampler = options.screenSampler || null;
  const shouldCaptureScreen = options.shouldCaptureScreen || (() => false);
  let watcher = null;
  let latest = null;
  let latestContext = { language: '', testing: false };

  function feedTracker(info, ctx, screenInfo) {
    const nowMs = now();
    const { remarks } = options.tracker.feed(info, nowMs, options.getIdleSeconds(), {
      language: ctx.language,
      testing: ctx.testing,
      screen: screenInfo || null,
      hour: getHour(nowMs),
    });
    for (const remark of remarks) options.onRemark(remark);
  }

  function handle(sample) {
    latest = classify(sample);
    latestContext = workContextOf(sample);
    const allowCapture = latest.category !== 'ignored' && shouldCaptureScreen();
    if (screenSampler && allowCapture) {
      Promise.resolve(screenSampler.sample(true)).then((screenInfo) => {
        if (!watcher) return;
        feedTracker(latest, latestContext, screenInfo);
      });
      return;
    }
    if (screenSampler) screenSampler.reset();
    feedTracker(latest, latestContext, null);
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
    latestContext = { language: '', testing: false };
    if (screenSampler) screenSampler.reset();
    options.tracker.reset();
  }

  function describeCurrent() {
    if (!watcher) return null;
    const base = describe(latest);
    if (!base) return null;
    const extra = [];
    if (latest && latest.category === 'coding' && latestContext.language) {
      extra.push(latestContext.language + (latestContext.testing ? ', unit test' : ''));
    }
    const screenDesc = screenSampler && shouldCaptureScreen() ? screenSampler.describe() : null;
    if (screenDesc && latest && latest.category !== 'ignored') {
      extra.push(screenDesc);
    }
    return extra.length > 0 ? base + ' [' + extra.join('; ') + ']' : base;
  }

  return {
    start: start,
    stop: stop,
    handle: handle,
    get running() {
      return watcher !== null;
    },
    // What Aemeath currently sees, as a category, never a window title.
    describe: describeCurrent,
    // Cumulative time per category in the current Medium/Full session (in memory only).
    summary: () => (watcher && typeof options.tracker.summary === 'function' ? options.tracker.summary() : null),
  };
}

module.exports = { createActivityMonitor };
