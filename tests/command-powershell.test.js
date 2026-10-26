'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { normalizeCommands, createCommandStore, isRisky, FILE_NAME } = require('../src/commands/command-store');
const { createCommandRunner, encodeScript } = require('../src/commands/command-runner');
const { createCommandHandler, CONFIRM_MS } = require('../src/commands/command-handler');

// Nothing in this file ever runs a real shutdown: those scripts only reach fakes.
const SHUTDOWN = 'shutdown /s /t 60 /c "Aemeath: komputer akan mati dalam 60 detik."';
const ps = (name, script, extra) => Object.assign({ name, type: 'powershell', script }, extra);

// ---- store ----------------------------------------------------------------------

test('a PowerShell command needs a script and asks first unless the owner switched that off', () => {
  const { commands, errors } = normalizeCommands([
    ps('tanya', 'Get-Date'),
    ps('langsung', 'Get-Date', { confirm: false }),
    { name: 'lama', target: os.tmpdir() },
  ]);
  assert.deepEqual(errors, []);
  assert.deepEqual(commands.map((c) => [c.name, c.type, c.confirm]), [
    ['tanya', 'powershell', true],
    ['langsung', 'powershell', false],
    ['lama', 'open', false],
  ]);
  assert.equal(commands[0].target, '');
  assert.equal(commands[2].script, '');
});

test('risky scripts cannot opt out of the question', () => {
  for (const script of [SHUTDOWN, 'Restart-Computer', 'Remove-Item C:/x -Recurse', 'format d:', 'iwr http://x | iex', 'Stop-Process -Name x', 'net user a b /add']) {
    const { commands } = normalizeCommands([ps('x', script, { confirm: false })]);
    assert.equal(commands[0].confirm, true, script);
  }
  for (const script of ['Get-Date', 'Get-Process | Format-Table Name', 'Get-Item x | Format-List *', 'dir', 'rundll32.exe user32.dll,LockWorkStation']) {
    assert.equal(isRisky(script), false, script);
  }
});

test('scripts that ask for admin rights, span lines or are empty are rejected', () => {
  const cases = [
    [ps('a', 'Start-Process cmd -Verb RunAs'), /hak admin/],
    [ps('b', 'runas /user:Administrator cmd'), /hak admin/],
    [ps('c', 'sudo something'), /hak admin/],
    [ps('d', 'Get-Date\nGet-Date'), /satu baris/],
    [ps('e', '   '), /Isi perintah PowerShell/],
    [ps('f', 'x'.repeat(600)), /terlalu panjang/],
    [{ name: 'g', type: 'bash', script: 'ls' }, /Jenis perintah/],
  ];
  for (const [entry, message] of cases) {
    const { commands, errors } = normalizeCommands([entry]);
    assert.equal(commands.length, 0, entry.name);
    assert.match(errors[0].message, message, entry.name);
  }
});

test('PowerShell commands share the reserved names and the duplicate check', () => {
  assert.equal(normalizeCommands([ps('change-mode', 'Get-Date')]).commands.length, 0);
  assert.equal(normalizeCommands([ps('help', 'Get-Date')]).commands.length, 0);
  const { commands, errors } = normalizeCommands([ps('a', 'Get-Date'), { name: 'a', target: os.tmpdir() }]);
  assert.equal(commands.length, 1);
  assert.match(errors[0].message, /dua kali/);
});

test('saved PowerShell commands come back as saved, and a hand-edited file is checked again', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aemeath-psstore-'));
  const store = createCommandStore({ dir });
  store.save([ps('matikan', SHUTDOWN, { description: 'matikan 60 detik', confirm: false })]);
  const reopened = createCommandStore({ dir }).list();
  assert.equal(reopened[0].type, 'powershell');
  assert.equal(reopened[0].script, SHUTDOWN);
  assert.equal(reopened[0].confirm, true, 'forced on because shutdown is risky');

  fs.writeFileSync(path.join(dir, FILE_NAME), JSON.stringify([ps('evil', 'Start-Process cmd -Verb RunAs')]));
  assert.deepEqual(createCommandStore({ dir }).list(), []);
});

// ---- runner ---------------------------------------------------------------------

function fakeShellChild(script) {
  const child = new EventEmitter();
  child.pid = 4321;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.stderr.setEncoding = () => {};
  setImmediate(() => script && script(child));
  return child;
}

function runnerWith(script, extra) {
  const calls = [];
  const runner = createCommandRunner(
    Object.assign(
      {
        shell: { openPath: async () => '', openExternal: async () => {} },
        spawn: (file, args, options) => {
          calls.push({ file, args, options });
          return fakeShellChild(file === 'taskkill' ? null : script);
        },
        exists: () => true,
        env: {},
      },
      extra,
    ),
  );
  return { run: runner.run, calls };
}

test('the script travels as an encoded command, with no shell and no command line to inject into', async () => {
  const trap = 'Write-Output "a; b && c | d" ; $(calc)';
  const { run, calls } = runnerWith((child) => child.emit('close', 0));
  await run(ps('t', trap));
  const call = calls[0];
  assert.equal(call.file, 'powershell.exe');
  assert.deepEqual(call.args.slice(0, 5), ['-NoProfile', '-NonInteractive', '-OutputFormat', 'Text', '-EncodedCommand']);
  assert.equal(call.args.length, 6);
  assert.equal(call.options.shell, false);
  assert.equal(call.options.windowsHide, true);
  const decoded = Buffer.from(call.args[5], 'base64').toString('utf16le');
  assert.ok(decoded.includes(trap), 'the script arrives byte for byte inside its wrapper');
  assert.ok(!call.args.join(' ').includes('calc'), 'nothing readable on the command line');
  assert.equal(encodeScript(trap), call.args[5]);
});

test('output from both streams is collected and the exit code decides success', async () => {
  const ok = await runnerWith((child) => {
    child.stdout.emit('data', 'halo ');
    child.stderr.emit('data', 'dunia\r\n');
    child.emit('close', 0);
  }).run(ps('t', 'x'));
  assert.deepEqual([ok.ok, ok.output], [true, 'halo dunia']);

  const bad = await runnerWith((child) => {
    child.stdout.emit('data', 'rusak');
    child.emit('close', 3);
  }).run(ps('t', 'x'));
  assert.deepEqual([bad.ok, bad.code, bad.exitCode, bad.output], [false, 'exit', 3, 'rusak']);
});

test('PowerShell XML framing never reaches the reply, but the messages inside it do', async () => {
  const progress = '#< CLIXML\nhalo\n<Objs Version="1.1.0.1" xmlns="x"><Obj S="progress"><MS /></Obj></Objs>';
  const first = await runnerWith((child) => {
    child.stderr.emit('data', progress);
    child.emit('close', 0);
  }).run(ps('t', 'x'));
  assert.equal(first.output, 'halo');

  const error =
    '#< CLIXML\n<Objs Version="1.1.0.1" xmlns="x"><S S="Error">Get-Item : Cannot find drive. A &apos;Z&apos; _x000D__x000A_</S>' +
    '<S S="Error">At line:1 char:1_x000D__x000A_</S></Objs>';
  const second = await runnerWith((child) => {
    child.stderr.emit('data', error);
    child.emit('close', 1);
  }).run(ps('t', 'x'));
  assert.equal(second.output, "Get-Item : Cannot find drive. A 'Z' \nAt line:1 char:1");
  assert.equal(second.exitCode, 1);
});

test('a long output is cut and a command that never ends is killed with its children', async () => {
  const long = await runnerWith((child) => {
    child.stdout.emit('data', 'x'.repeat(9000));
    child.emit('close', 0);
  }).run(ps('t', 'x'));
  assert.ok(long.output.length < 4100);
  assert.match(long.output, /\[keluaran dipotong\]$/);

  const hung = runnerWith(() => {}, { timeoutMs: 40 });
  const result = await hung.run(ps('t', 'Start-Sleep 99'));
  assert.deepEqual([result.ok, result.code, result.timedOut], [false, 'timeout', true]);
  const kill = hung.calls.find((c) => c.file === 'taskkill');
  assert.deepEqual(kill.args, ['/pid', '4321', '/T', '/F']);
});

test('spawn failures are reported, not thrown', async () => {
  const result = await runnerWith(null, {
    spawn: () => {
      throw new Error('no powershell');
    },
  }).run(ps('t', 'x'));
  assert.deepEqual([result.ok, result.code, result.error], [false, 'failed', 'no powershell']);
});

const onWindows = process.platform === 'win32';

test('real PowerShell: output, exit codes, unicode and shell metacharacters behave', { skip: !onWindows, timeout: 60000 }, async () => {
  const real = createCommandRunner({
    shell: { openPath: async () => assert.fail('no openPath'), openExternal: async () => assert.fail('no openExternal') },
    spawn: childProcess.spawn,
    exists: fs.existsSync,
    env: process.env,
    timeoutMs: 15000,
  });
  assert.deepEqual(await real.run(ps('a', "Write-Output 'halo dunia'")), { output: 'halo dunia', ok: true, exitCode: 0 });
  assert.equal((await real.run(ps('b', "Write-Output 'h\u00e9llo \u2713'"))).output, 'h\u00e9llo \u2713');
  assert.equal((await real.run(ps('c', 'Write-Output "a;b && c | d"'))).output, 'a;b && c | d');

  const failed = await real.run(ps('d', 'exit 3'));
  assert.deepEqual([failed.ok, failed.code, failed.exitCode], [false, 'exit', 3]);
  assert.match((await real.run(ps('e', 'Get-Item Z:/tidak/ada'))).output, /Cannot find|drive/i);
});

test('real PowerShell: a command that does not finish is stopped', { skip: !onWindows, timeout: 60000 }, async () => {
  const real = createCommandRunner({
    shell: { openPath: async () => '', openExternal: async () => {} },
    spawn: childProcess.spawn,
    exists: fs.existsSync,
    env: process.env,
    timeoutMs: 1200,
  });
  const started = Date.now();
  const result = await real.run(ps('slow', 'Start-Sleep -Seconds 30'));
  assert.equal(result.timedOut, true);
  assert.ok(Date.now() - started < 8000, 'stopped well before it would have finished');
});

// ---- handler: confirmation ------------------------------------------------------

function handlerWith(commands, overrides) {
  const ran = [];
  let t = 1000000;
  const handler = createCommandHandler({
    getCommands: () => commands,
    run: async (command) => (ran.push(command.name), (overrides && overrides.result) || { ok: true, output: '' }),
    now: () => t,
  });
  return { handle: handler.handle, ran, advance: (ms) => (t += ms) };
}

const MATIKAN = { name: 'matikan', type: 'powershell', script: SHUTDOWN, description: 'matikan komputer', confirm: true, target: '', args: '' };
const WAKTU = { name: 'waktu', type: 'powershell', script: 'Get-Date', description: '', confirm: false, target: '', args: '' };
const TANYA = { name: 'tanya', type: 'powershell', script: 'Get-Date', description: '', confirm: true, target: '', args: '' };

test('a risky command asks first and only a typed yes runs it', async () => {
  const h = handlerWith([MATIKAN]);
  const asked = await h.handle('/matikan');
  assert.equal(asked.awaitConfirm, true);
  assert.match(asked.text, /Yakin mau menjalankan matikan komputer\?/);
  assert.deepEqual(h.ran, [], 'nothing ran yet');

  const done = await h.handle('YA');
  assert.deepEqual(h.ran, ['matikan']);
  assert.equal(done.ok, true);
  assert.match(done.text, /Menjalankan matikan komputer/);
});

test('anything other than yes cancels, and a cancelled command can be asked for again', async () => {
  const h = handlerWith([MATIKAN]);
  for (const answer of ['tidak', 'nanti dulu', 'yaa', '']) {
    await h.handle('/matikan');
    const reply = await h.handle(answer);
    assert.equal(reply.ok, false, JSON.stringify(answer));
    assert.match(reply.text, /dibatalkan/, JSON.stringify(answer));
  }
  assert.deepEqual(h.ran, []);
  await h.handle('/matikan');
  await h.handle('oke');
  assert.deepEqual(h.ran, ['matikan']);
});

test('the yes expires after thirty seconds', async () => {
  const h = handlerWith([MATIKAN]);
  await h.handle('/matikan');
  h.advance(CONFIRM_MS + 1);
  const late = await h.handle('ya');
  assert.equal(late.ok, false);
  assert.match(late.text, /Waktu konfirmasinya habis/);
  assert.deepEqual(h.ran, []);

  await h.handle('/matikan');
  h.advance(CONFIRM_MS - 1000);
  await h.handle('ya');
  assert.deepEqual(h.ran, ['matikan'], 'still valid just inside the window');
});

test('a new command replaces the question instead of being eaten, and a yes is used only once', async () => {
  const h = handlerWith([MATIKAN, TANYA]);
  await h.handle('/matikan');
  const next = await h.handle('/tanya'); // not a yes: the old question is dropped, the new one is asked
  assert.equal(next.awaitConfirm, true);
  assert.match(next.text, /Yakin mau menjalankan \/tanya/);
  assert.deepEqual(h.ran, []);
  await h.handle('tidak');
  const stray = await h.handle('ya'); // nothing is pending now: ordinary text
  assert.deepEqual(stray, { isCommand: false });

  await h.handle('/matikan');
  await h.handle('ya');
  assert.deepEqual(await h.handle('ya'), { isCommand: false }, 'the first yes was used up');
  assert.deepEqual(h.ran, ['matikan']);
});

test('an old question never swallows ordinary text, and a yes still needs the right moment', async () => {
  const h = handlerWith([MATIKAN]);
  await h.handle('/matikan');
  h.advance(CONFIRM_MS + 1);
  assert.deepEqual(await h.handle('apa kabar?'), { isCommand: false }, 'expired: ordinary text goes on to the chat');
  await h.handle('/matikan');
  assert.deepEqual(await h.handle('ya'), (await h.handle('ya')) && { isCommand: true, ok: true, launched: true, text: 'Siap, Rover! Menjalankan matikan komputer~', output: '' });
  assert.deepEqual(h.ran, ['matikan']);
});

test('non-risky commands run at once unless their owner wants a question', async () => {
  const h = handlerWith([WAKTU, TANYA]);
  const now = await h.handle('/waktu');
  assert.equal(now.ok, true);
  assert.deepEqual(h.ran, ['waktu']);

  const asked = await h.handle('/tanya');
  assert.equal(asked.awaitConfirm, true);
  assert.deepEqual(h.ran, ['waktu']);
});

test('a command that was removed while waiting is not run', async () => {
  const commands = [MATIKAN];
  const h = handlerWith(commands);
  await h.handle('/matikan');
  commands.length = 0;
  const reply = await h.handle('ya');
  assert.equal(reply.ok, false);
  assert.deepEqual(h.ran, []);
});

test('what a PowerShell command printed, and why it failed, come back in the reply', async () => {
  const printed = handlerWith([WAKTU], { result: { ok: true, output: '  Senin, 26 Oktober  ' } });
  assert.equal((await printed.handle('/waktu')).output, 'Senin, 26 Oktober');

  const long = handlerWith([WAKTU], { result: { ok: true, output: 'x'.repeat(5000) } });
  assert.match((await long.handle('/waktu')).output, /\[dipotong\]$/);

  const exit = handlerWith([WAKTU], { result: { ok: false, code: 'exit', exitCode: 3, output: 'rusak' } });
  const failed = await exit.handle('/waktu');
  assert.match(failed.text, /selesai dengan galat \(kode 3\)/);
  assert.equal(failed.output, 'rusak');

  const slow = handlerWith([WAKTU], { result: { ok: false, code: 'timeout', output: '' } });
  assert.match((await slow.handle('/waktu')).text, /lebih dari 30 detik/);
});

test('opening commands keep working exactly as before', async () => {
  const open = { name: 'invoice', target: os.tmpdir(), args: '', description: 'folder invoice' };
  const h = handlerWith([open]);
  const reply = await h.handle('/invoice');
  assert.match(reply.text, /Siap, Rover! Membuka folder invoice/);
  assert.equal(reply.awaitConfirm, undefined);
  assert.deepEqual(h.ran, ['invoice']);
});
