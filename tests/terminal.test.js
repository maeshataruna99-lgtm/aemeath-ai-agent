'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const os = require('node:os');
const childProcess = require('node:child_process');

const { createUacGate, SCRIPT } = require('../src/terminal/uac-gate');
const { createTerminalController } = require('../src/terminal/terminal-controller');
const { createTerminalSession, MAX_OUTPUT } = require('../src/terminal/terminal-session');
const { normalizeCommands, BUILTIN_NAMES } = require('../src/commands/command-store');
const { createCommandHandler } = require('../src/commands/command-handler');

// ---- consent gate -------------------------------------------------------------

function fakeChild(exitCode, delay) {
  const child = new EventEmitter();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
  if (exitCode !== null) setTimeout(() => child.emit('exit', exitCode), delay || 0);
  return child;
}

test('the gate starts a fixed elevated PowerShell and reads the result from its exit code', async () => {
  const calls = [];
  const gate = (code) =>
    createUacGate({
      platform: 'win32',
      spawn: (file, args, options) => (calls.push({ file, args, options }), fakeChild(code)),
    });

  assert.deepEqual(await gate(0).request(), { granted: true });
  assert.deepEqual(await gate(1).request(), { granted: false, reason: 'declined' });
  assert.deepEqual(await gate(7).request(), { granted: false, reason: 'error' });

  const call = calls[0];
  assert.equal(call.file, 'powershell.exe');
  assert.equal(call.options.shell, false);
  assert.equal(call.args[call.args.length - 1], SCRIPT);
  assert.match(SCRIPT, /-Verb RunAs/);
  assert.ok(!/\$|`|\{0\}/.test(SCRIPT.replace(/catch \{ exit 1 \}|try \{/g, '')), 'no interpolation points in the script');
});

test('the gate reports spawn failures, timeouts and other platforms without throwing', async () => {
  const broken = createUacGate({
    platform: 'win32',
    spawn: () => {
      throw new Error('no powershell');
    },
  });
  assert.deepEqual(await broken.request(), { granted: false, reason: 'error' });

  const errored = createUacGate({
    platform: 'win32',
    spawn: () => {
      const child = fakeChild(null);
      setTimeout(() => child.emit('error', new Error('x')), 0);
      return child;
    },
  });
  assert.deepEqual(await errored.request(), { granted: false, reason: 'error' });

  let hung;
  const slow = createUacGate({ platform: 'win32', timeoutMs: 30, spawn: () => (hung = fakeChild(null)) });
  assert.deepEqual(await slow.request(), { granted: false, reason: 'timeout' });
  assert.equal(hung.killed, true, 'a prompt nobody answers is cancelled');

  assert.deepEqual(await createUacGate({ platform: 'linux', spawn: () => assert.fail('no spawn') }).request(), {
    granted: false,
    reason: 'unsupported',
  });
});

// ---- controller ---------------------------------------------------------------

function fakeSession(script) {
  const session = {
    started: false,
    stopped: false,
    ran: [],
    cwd: 'C:\\Users\\dev',
    start() {
      session.started = true;
    },
    stop() {
      session.stopped = true;
    },
    async run(line) {
      session.ran.push(line);
      return script ? script(line) : { output: 'ok: ' + line, cwd: 'C:\\Users\\dev', timedOut: false, ended: false };
    },
  };
  return session;
}

function controllerWith(options) {
  const opts = options || {};
  const sessions = [];
  const timers = [];
  let enabled = opts.enabled !== false;
  const controller = createTerminalController({
    gate: { request: opts.request || (async () => ({ granted: true })) },
    createSession: () => {
      const session = fakeSession(opts.script);
      sessions.push(session);
      return session;
    },
    isEnabled: () => enabled,
    setTimer: (fn, ms) => (timers.push({ fn, ms }), { unref() {} }),
    clearTimer: () => {},
  });
  return { controller, sessions, timers, setEnabled: (value) => (enabled = value) };
}

test('terminal mode opens only after consent and starts a fresh shell', async () => {
  const { controller, sessions } = controllerWith();
  const entered = await controller.changeMode();
  assert.equal(entered.ok, true);
  assert.equal(entered.mode, 'terminal');
  assert.match(entered.text, /bukan admin/);
  assert.equal(controller.active, true);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].started, true);
});

test('declined, timed out or failed consent keeps chat mode and never starts a shell', async () => {
  for (const reason of ['declined', 'timeout', 'error', 'unsupported']) {
    const { controller, sessions } = controllerWith({ request: async () => ({ granted: false, reason }) });
    const result = await controller.changeMode();
    assert.equal(result.ok, false, reason);
    assert.equal(result.mode, 'chat', reason);
    assert.equal(sessions.length, 0, reason);
    assert.equal(controller.active, false, reason);
  }
});

test('no line reaches a shell before the mode is on', async () => {
  const { controller, sessions } = controllerWith();
  const result = await controller.run('Get-ChildItem');
  assert.equal(result.ok, false);
  assert.equal(result.mode, 'chat');
  assert.equal(sessions.length, 0);
});

test('lines run in the session and exit or /change-mode leave it', async () => {
  const { controller, sessions } = controllerWith();
  await controller.changeMode();
  assert.deepEqual(await controller.run('  Get-Date  '), { ok: true, mode: 'terminal', output: 'ok: Get-Date', cwd: 'C:\\Users\\dev', timedOut: false });
  assert.deepEqual(sessions[0].ran, ['Get-Date']);

  const left = await controller.run('exit');
  assert.equal(left.mode, 'chat');
  assert.equal(sessions[0].stopped, true);
  assert.equal(controller.active, false);

  await controller.changeMode();
  assert.equal((await controller.changeMode()).mode, 'chat', 'the same command toggles back, without asking again');
  assert.equal(sessions[1].stopped, true);
});

test('the setting can switch terminal mode off, before or during a session', async () => {
  const off = controllerWith({ enabled: false, request: async () => assert.fail('must not ask for consent') });
  const refused = await off.controller.changeMode();
  assert.equal(refused.ok, false);
  assert.match(refused.text, /dimatikan di Pengaturan/);

  const live = controllerWith();
  await live.controller.changeMode();
  live.setEnabled(false);
  const result = await live.controller.run('whoami');
  assert.equal(result.mode, 'chat');
  assert.equal(live.sessions[0].stopped, true);
  assert.equal(live.sessions[0].ran.length, 0);
});

test('a second request while the prompt is open does not open a second prompt', async () => {
  let release;
  const gateCalls = [];
  const { controller } = controllerWith({
    request: () => (gateCalls.push(1), new Promise((resolve) => (release = () => resolve({ granted: true })))),
  });
  const first = controller.changeMode();
  const second = await controller.changeMode();
  assert.equal(second.ok, false);
  assert.match(second.text, /menunggu persetujuan/);
  release();
  assert.equal((await first).mode, 'terminal');
  assert.equal(gateCalls.length, 1);
});

test('an idle session is closed by itself, and a dead shell returns to chat mode', async () => {
  const idle = controllerWith();
  await idle.controller.changeMode();
  const timer = idle.timers[idle.timers.length - 1];
  assert.equal(timer.ms, 15 * 60 * 1000);
  timer.fn();
  assert.equal(idle.controller.active, false);
  assert.equal(idle.sessions[0].stopped, true);

  const dead = controllerWith({ script: () => ({ output: '', cwd: 'C:\\', timedOut: false, ended: true }) });
  await dead.controller.changeMode();
  const result = await dead.controller.run('exit-ish');
  assert.equal(result.mode, 'chat');
  assert.equal(dead.controller.active, false);
});

test('problems with a line are explained, not thrown', async () => {
  const { controller } = controllerWith({
    script: (line) => {
      throw new Error(line === 'a' ? 'multiline' : 'busy');
    },
  });
  await controller.changeMode();
  assert.match((await controller.run('a')).error, /Satu baris/);
  assert.match((await controller.run('b')).error, /belum selesai/);
});

// ---- built-in /change-mode ----------------------------------------------------

test('change-mode is reserved so a custom command can never shadow it', () => {
  assert.deepEqual(BUILTIN_NAMES, ['change-mode', 'timer', 'todo', 'note', 'stats', 'review']);
  for (const name of ['change-mode', '/Change-Mode', 'timer', 'todo', 'note', 'stats', 'review', 'HELP', 'bantuan']) {
    const { commands, errors } = normalizeCommands([{ name, target: os.tmpdir() }]);
    assert.equal(commands.length, 0, name);
    assert.match(errors[0].message, /sudah dipakai/, name);
  }
  // a hand-edited commands.json cannot sneak it in either, because loading validates again
  const { commands } = normalizeCommands([
    { name: 'ok', target: os.tmpdir() },
    { name: 'change-mode', target: os.tmpdir() },
  ]);
  assert.deepEqual(commands.map((c) => c.name), ['ok']);
});

test('the handler runs the built-in and lists it in help, ahead of any custom lookup', async () => {
  const ran = [];
  const handler = createCommandHandler({
    getCommands: () => [{ name: 'invoice', target: os.tmpdir(), args: '', description: '' }],
    run: async (command) => (ran.push(command.name), { ok: true }),
    builtins: {
      'change-mode': { description: 'mode', run: async () => ({ ok: true, text: 'beralih', mode: 'terminal' }) },
    },
  });
  const answer = await handler.handle('/change-mode');
  assert.deepEqual([answer.ok, answer.text, answer.mode], [true, 'beralih', 'terminal']);
  assert.deepEqual(ran, []);
  assert.match((await handler.handle('/help')).text, /Bawaan: \/change-mode/);
  assert.equal((await handler.handle('/CHANGE-MODE extra words')).mode, 'terminal');
});

// ---- the real shell (Windows only) --------------------------------------------

const onWindows = process.platform === 'win32';

test('a real PowerShell session keeps its directory and variables between commands', { skip: !onWindows, timeout: 60000 }, async () => {
  const session = createTerminalSession({ spawn: childProcess.spawn, cwd: os.homedir(), timeoutMs: 15000 });
  try {
    session.start();
    assert.equal((await session.run('Write-Output "halo dari terminal"')).output, 'halo dari terminal');

    const moved = await session.run('Set-Location $env:TEMP');
    assert.equal(moved.cwd.toLowerCase(), os.tmpdir().toLowerCase().replace(/\\$/, ''));
    assert.equal((await session.run('(Get-Location).Path')).output.toLowerCase(), moved.cwd.toLowerCase());

    await session.run('$answer = 41');
    assert.equal((await session.run('$answer + 1')).output, '42');

    assert.equal((await session.run("Write-Output 'h\u00e9llo \u2713'")).output, 'h\u00e9llo \u2713');
  } finally {
    session.stop();
  }
});

test('errors come back as text, multi-statement lines work and shell metacharacters are just text', { skip: !onWindows, timeout: 60000 }, async () => {
  const session = createTerminalSession({ spawn: childProcess.spawn, cwd: os.homedir(), timeoutMs: 15000 });
  try {
    const failed = await session.run('Get-Item Z:/this/does/not/exist');
    assert.match(failed.output, /Cannot find|does not exist|tidak ditemukan|ItemNotFound/i);
    assert.equal(failed.timedOut, false);

    assert.equal((await session.run('$a = 2; $b = 3; $a * $b')).output, '6');
    assert.equal((await session.run('Write-Output "a;b && c | d"')).output, 'a;b && c | d');
    // unbalanced quotes and braces fail on their own and cannot hang the session
    const broken = await session.run('Write-Output "oops');
    assert.equal(broken.timedOut, false);
    assert.match(broken.output, /string|terminator|Missing|ParserError/i);
    assert.equal((await session.run('if ($true) {')).timedOut, false);
    // the session is still healthy after an error
    assert.equal((await session.run('Write-Output "masih hidup"')).output, 'masih hidup');
  } finally {
    session.stop();
  }
});

test('a command that never ends is killed, and the next one starts a fresh shell where it left off', { skip: !onWindows, timeout: 60000 }, async () => {
  const session = createTerminalSession({ spawn: childProcess.spawn, cwd: os.homedir(), timeoutMs: 1500 });
  try {
    await session.run('Set-Location $env:TEMP');
    const slow = await session.run('Start-Sleep -Seconds 30');
    assert.equal(slow.timedOut, true);
    assert.equal(slow.ended, true);

    const after = await session.run('Write-Output "hidup lagi"');
    assert.equal(after.output, 'hidup lagi');
    assert.equal(after.cwd.toLowerCase(), os.tmpdir().toLowerCase().replace(/\\$/, ''), 'directory survives the restart');
  } finally {
    session.stop();
  }
});

test('input is validated and huge output is cut', { skip: !onWindows, timeout: 60000 }, async () => {
  const session = createTerminalSession({ spawn: childProcess.spawn, cwd: os.homedir(), timeoutMs: 15000 });
  try {
    await assert.rejects(session.run('   '), /empty/);
    await assert.rejects(session.run('a\nb'), /multiline/);
    await assert.rejects(session.run('x'.repeat(3000)), /too-long/);
    await assert.rejects(session.run('a\u0007b'), /control/);

    const big = await session.run('"x" * ' + (MAX_OUTPUT + 5000));
    assert.ok(big.output.length <= MAX_OUTPUT + 40, 'length ' + big.output.length);
    assert.match(big.output, /\[keluaran dipotong\]$/);
  } finally {
    session.stop();
  }
});

test('stopping the session leaves no PowerShell behind', { skip: !onWindows, timeout: 60000 }, async () => {
  const session = createTerminalSession({ spawn: childProcess.spawn, cwd: os.homedir(), timeoutMs: 15000 });
  session.start();
  const pidText = (await session.run('$PID')).output;
  const pid = Number(pidText);
  assert.ok(pid > 0, pidText);
  session.stop();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  let alive = true;
  try {
    process.kill(pid, 0);
  } catch {
    alive = false;
  }
  assert.equal(alive, false, 'shell ' + pid + ' is still running');
});
