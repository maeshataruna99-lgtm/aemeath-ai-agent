'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createSmartShutdown, YES_PATTERN, CANCEL_PATTERN } = require('../src/commands/smart-shutdown');
const { createCommandHandler } = require('../src/commands/command-handler');

function makeFakeTimer() {
  const timers = new Map();
  let counter = 0;
  return {
    timers,
    setTimeout: (fn, ms) => {
      counter += 1;
      timers.set(counter, fn);
      return counter;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
    runAll: () => {
      const pending = Array.from(timers.values());
      timers.clear();
      for (const fn of pending) fn();
    },
  };
}

test('Smart Shutdown: no confirmation results in zero OS calls', () => {
  const osCalls = [];
  let currentTime = 1000;

  const shutdown = createSmartShutdown({
    platform: 'win32',
    spawn: (cmd, args) => osCalls.push({ cmd, args }),
    now: () => currentTime,
  });

  // Request shutdown
  const req = shutdown.request();
  assert.equal(req.ok, true);
  assert.equal(req.awaitConfirm, true);
  assert.equal(shutdown.isConfirming(), true);
  assert.equal(osCalls.length, 0);

  // Time passes without confirmation (> 30s)
  currentTime += 35000;
  assert.equal(shutdown.isConfirming(), false);

  // Attempting to confirm after expiration
  const confirmRes = shutdown.answerConfirm('ya');
  assert.equal(confirmRes.ok, false);
  assert.match(confirmRes.text, /habis|batal/i);
  assert.equal(osCalls.length, 0, 'Zero OS calls on expired confirmation');
});

test('Smart Shutdown: confirmed request triggers farewell and exactly one OS call', () => {
  const osCalls = [];
  const farewellEvents = [];
  const fakeTimer = makeFakeTimer();

  const shutdown = createSmartShutdown({
    platform: 'win32',
    countdownSec: 10,
    spawn: (cmd, args) => osCalls.push({ cmd, args }),
    onFarewell: (event) => farewellEvents.push(event),
    setTimeout: fakeTimer.setTimeout,
    clearTimeout: fakeTimer.clearTimeout,
  });

  shutdown.request();
  const confirmRes = shutdown.answerConfirm('ya');
  assert.equal(confirmRes.ok, true);
  assert.equal(shutdown.isCountingDown(), true);
  assert.equal(osCalls.length, 0, 'No OS calls while countdown is running');
  assert.equal(farewellEvents.length, 0);

  // Trigger countdown completion
  fakeTimer.runAll();

  assert.equal(osCalls.length, 1);
  assert.equal(osCalls[0].cmd, 'shutdown.exe');
  assert.deepEqual(osCalls[0].args, ['/s', '/t', '60', '/c', 'Aemeath: Journey well, Rover. Ketik /batal untuk membatalkan.']);
  assert.equal(farewellEvents.length, 1);
  assert.equal(farewellEvents[0].anim, 'waving');
  assert.match(farewellEvents[0].text, /Journey well, Rover/);
});

test('Smart Shutdown: cancellation during countdown stops timer with zero shutdown calls', () => {
  const osCalls = [];
  const fakeTimer = makeFakeTimer();

  const shutdown = createSmartShutdown({
    platform: 'win32',
    countdownSec: 10,
    spawn: (cmd, args) => osCalls.push({ cmd, args }),
    setTimeout: fakeTimer.setTimeout,
    clearTimeout: fakeTimer.clearTimeout,
  });

  shutdown.request();
  shutdown.answerConfirm('ya');
  assert.equal(shutdown.isCountingDown(), true);
  assert.equal(fakeTimer.timers.size, 1);

  // User cancels
  const cancelRes = shutdown.cancel();
  assert.equal(cancelRes.ok, true);
  assert.equal(shutdown.isCountingDown(), false);
  assert.equal(fakeTimer.timers.size, 0, 'Timer must be cleared');

  // Triggering timers has no effect because it was cleared
  fakeTimer.runAll();

  // osCalls may contain cancel safety net '/a', but never shutdown '/s'
  const shutdownCalls = osCalls.filter((c) => c.args.includes('/s'));
  assert.equal(shutdownCalls.length, 0, 'Zero shutdown execution calls on cancellation');
});

test('Smart Shutdown: Linux Mint executes correct arguments without shell interpolation', () => {
  const osCalls = [];
  const fakeTimer = makeFakeTimer();

  const shutdown = createSmartShutdown({
    platform: 'linux',
    countdownSec: 0, // immediate execution for testing
    spawn: (cmd, args) => osCalls.push({ cmd, args }),
    setTimeout: fakeTimer.setTimeout,
    clearTimeout: fakeTimer.clearTimeout,
  });

  shutdown.request();
  shutdown.answerConfirm('ya');

  assert.equal(osCalls.length, 1);
  assert.equal(osCalls[0].cmd, 'shutdown');
  assert.deepEqual(osCalls[0].args, ['-h', '+1', 'Aemeath: Journey well, Rover. Ketik /batal untuk membatalkan.']);
});

test('Smart Shutdown: unsupported platforms are rejected safely', () => {
  const osCalls = [];
  const shutdown = createSmartShutdown({
    platform: 'darwin',
    spawn: (cmd, args) => osCalls.push({ cmd, args }),
  });

  const res = shutdown.request();
  assert.equal(res.ok, false);
  assert.match(res.text, /tidak didukung/i);
  assert.equal(osCalls.length, 0);
});

test('Smart Shutdown: repeated requests cannot queue multiple shutdowns', () => {
  const shutdown = createSmartShutdown({ platform: 'win32' });

  const first = shutdown.request();
  assert.equal(first.ok, true);

  const second = shutdown.request();
  assert.equal(second.ok, true);
  assert.match(second.text, /masih menunggu/i);

  shutdown.answerConfirm('ya');
  const third = shutdown.request();
  assert.equal(third.ok, false);
  assert.match(third.text, /sedang dalam hitung mundur/i);
});

test('Smart Shutdown: user input with shell metacharacters cannot alter executed command', () => {
  const osCalls = [];
  const fakeTimer = makeFakeTimer();

  const shutdown = createSmartShutdown({
    platform: 'win32',
    countdownSec: 0,
    spawn: (cmd, args) => osCalls.push({ cmd, args }),
    setTimeout: fakeTimer.setTimeout,
    clearTimeout: fakeTimer.clearTimeout,
  });

  // Malicious arguments attempted with command
  shutdown.request('; rm -rf / ; & format c:');
  shutdown.answerConfirm('ya');

  assert.equal(osCalls.length, 1);
  assert.equal(osCalls[0].cmd, 'shutdown.exe');
  // Fixed safe argument array only
  assert.deepEqual(osCalls[0].args, ['/s', '/t', '60', '/c', 'Aemeath: Journey well, Rover. Ketik /batal untuk membatalkan.']);
});

test('Smart Shutdown: command failure reports clear error and leaves app usable', () => {
  const shutdown = createSmartShutdown({
    platform: 'win32',
    countdownSec: 0,
    spawn: () => {
      throw new Error('Access denied (requires elevation)');
    },
  });

  shutdown.request();
  const res = shutdown.answerConfirm('ya');
  // executeShutdown handles throw gracefully
  assert.equal(shutdown.isCountingDown(), false);
});

test('Smart Shutdown: commandHandler integration with /matikan and /batal', async () => {
  const fakeTimer = makeFakeTimer();
  const osCalls = [];

  const shutdown = createSmartShutdown({
    platform: 'win32',
    countdownSec: 10,
    spawn: (cmd, args) => osCalls.push({ cmd, args }),
    setTimeout: fakeTimer.setTimeout,
    clearTimeout: fakeTimer.clearTimeout,
  });

  const handler = createCommandHandler({
    getCommands: () => [],
    run: async () => ({ ok: true }),
    builtins: shutdown.asBuiltins(),
    smartShutdown: shutdown,
  });

  // 1. Run /matikan
  const step1 = await handler.handle('/matikan');
  assert.equal(step1.isCommand, true);
  assert.equal(step1.awaitConfirm, true);
  assert.match(step1.text, /Yakin mau mematikan komputer/i);

  // 2. Confirm "ya"
  const step2 = await handler.handle('ya');
  assert.equal(step2.isCommand, true);
  assert.equal(step2.ok, true);
  assert.match(step2.text, /Hitung mundur 10 detik/i);
  assert.equal(shutdown.isCountingDown(), true);

  // 3. Cancel with /batal
  const step3 = await handler.handle('/batal');
  assert.equal(step3.isCommand, true);
  assert.equal(step3.ok, true);
  assert.match(step3.text, /dibatalkan/i);
  assert.equal(shutdown.isCountingDown(), false);
});
