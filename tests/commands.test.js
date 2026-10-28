'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');

const { createCommandStore, normalizeCommands, MAX_COMMANDS, FILE_NAME } = require('../src/commands/command-store');
const { createCommandRunner, expandEnv, parseArgs } = require('../src/commands/command-runner');
const { createCommandHandler } = require('../src/commands/command-handler');

const FOLDER = os.tmpdir();
const URL_TARGET = 'https://example.com/start';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aemeath-commands-'));
}

test('valid commands are normalised: lowercase names, no leading slash, trimmed', () => {
  const { commands, errors } = normalizeCommands([
    { name: ' /Invoice ', target: ' ' + FOLDER + ' ', description: '  Folder invoice ' },
    { name: 'wuwa', target: URL_TARGET, args: 'ignored for links' },
    { name: 'tools', target: '%ProgramFiles%\\Tool\\tool.exe', args: ' --fast ' },
  ]);
  assert.deepEqual(errors, []);
  assert.deepEqual(commands.map((c) => c.name), ['invoice', 'wuwa', 'tools']);
  assert.equal(commands[0].target, FOLDER);
  assert.equal(commands[0].description, 'Folder invoice');
  assert.equal(commands[1].args, '', 'links take no arguments');
  assert.equal(commands[2].args, '--fast');
});

test('unsafe or malformed entries are rejected with a reason', () => {
  const cases = [
    [{ name: 'Bad Name', target: FOLDER }, /Nama hanya boleh/],
    [{ name: 'a;calc', target: FOLDER }, /Nama hanya boleh/],
    [{ name: '../x', target: FOLDER }, /Nama hanya boleh/],
    [{ name: '', target: FOLDER }, /Nama hanya boleh/],
    [{ name: 'help', target: FOLDER }, /sudah dipakai/],
    [{ name: 'bantuan', target: FOLDER }, /sudah dipakai/],
    [{ name: 'empty', target: '   ' }, /Isi program/],
    [{ name: 'rel', target: 'notepad.exe' }, /jalur lengkap/],
    [{ name: 'rel2', target: '..\\secret.exe' }, /jalur lengkap/],
    [{ name: 'js', target: 'javascript:alert(1)' }, /jalur lengkap/],
    [{ name: 'file', target: 'file:///C:/Windows/System32/calc.exe' }, /jalur lengkap/],
    [{ name: 'ftp', target: 'ftp://example.com/x' }, /jalur lengkap/],
    [{ name: 'ctrl', target: FOLDER + '\u0000x' }, /tidak diizinkan/],
    [{ name: 'long', target: FOLDER + 'x'.repeat(600) }, /terlalu panjang/],
    [null, /Nama hanya boleh/],
  ];
  for (const [entry, message] of cases) {
    const { commands, errors } = normalizeCommands([entry]);
    assert.equal(commands.length, 0, JSON.stringify(entry));
    assert.match(errors[0].message, message, JSON.stringify(entry));
  }
});

test('duplicates and the size limit are enforced', () => {
  const dup = normalizeCommands([
    { name: 'a', target: FOLDER },
    { name: 'A', target: FOLDER },
  ]);
  assert.equal(dup.commands.length, 1);
  assert.match(dup.errors[0].message, /dua kali/);
  assert.equal(dup.errors[0].index, 1);

  const many = Array.from({ length: MAX_COMMANDS + 10 }, (_, i) => ({ name: 'c' + i, target: FOLDER }));
  assert.equal(normalizeCommands(many).commands.length, MAX_COMMANDS);
});

test('the store persists valid commands, reports rejected ones and survives a corrupt file', () => {
  const dir = tempDir();
  const store = createCommandStore({ dir });
  assert.deepEqual(store.list(), []);

  const result = store.save([
    { name: 'invoice', target: FOLDER, description: 'Folder invoice' },
    { name: 'bad name', target: FOLDER },
  ]);
  assert.equal(result.saved.length, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].index, 1);
  assert.deepEqual(createCommandStore({ dir }).list().map((c) => c.name), ['invoice']);

  fs.writeFileSync(path.join(dir, FILE_NAME), '{not json');
  assert.deepEqual(createCommandStore({ dir }).list(), []);

  // a hand-edited file cannot sneak in something the settings window would refuse
  fs.writeFileSync(path.join(dir, FILE_NAME), JSON.stringify([{ name: 'evil', target: 'cmd /c calc' }]));
  assert.deepEqual(createCommandStore({ dir }).list(), []);
});

test('environment variables expand only when defined', () => {
  assert.equal(expandEnv('%HOME_X%\\a', { HOME_X: 'C:\\Users\\dev' }), 'C:\\Users\\dev\\a');
  assert.equal(expandEnv('%NOPE%\\a', {}), '%NOPE%\\a');
  assert.equal(expandEnv('%toString%', {}), '%toString%');
});

test('arguments split on spaces and keep quoted parts together', () => {
  assert.deepEqual(parseArgs('--fast "C:\\My Folder" -x'), ['--fast', 'C:\\My Folder', '-x']);
  assert.deepEqual(parseArgs(''), []);
});

function fakeSpawnFactory(outcome) {
  const calls = [];
  const spawn = (file, args, options) => {
    calls.push({ file, args, options });
    const child = new EventEmitter();
    child.unref = () => {};
    process.nextTick(() => (outcome === 'error' ? child.emit('error', new Error('boom')) : child.emit('spawn')));
    return child;
  };
  spawn.calls = calls;
  return spawn;
}

function runner(overrides) {
  const opened = [];
  const external = [];
  const deps = Object.assign(
    {
      shell: {
        openPath: async (target) => (opened.push(target), ''),
        openExternal: async (url) => void external.push(url),
      },
      spawn: fakeSpawnFactory('spawn'),
      exists: () => true,
      env: {},
    },
    overrides,
  );
  return { run: createCommandRunner(deps).run, opened, external, deps };
}

test('folders and files go to the OS open verb, links to the browser', async () => {
  const r = runner();
  assert.deepEqual(await r.run({ name: 'a', target: FOLDER, args: '' }), { ok: true });
  assert.deepEqual(r.opened, [FOLDER]);
  assert.deepEqual(await r.run({ name: 'b', target: URL_TARGET, args: '' }), { ok: true });
  assert.deepEqual(r.external, [URL_TARGET]);
  assert.equal(r.deps.spawn.calls.length, 0);
});

test('a program with arguments is started directly, with no shell', async () => {
  const r = runner();
  const target = 'C:\\Tools\\tool.exe';
  assert.deepEqual(await r.run({ name: 't', target, args: '--open "C:\\My Files" ; calc' }), { ok: true });
  const call = r.deps.spawn.calls[0];
  assert.equal(call.file, target);
  assert.deepEqual(call.args, ['--open', 'C:\\My Files', ';', 'calc'], 'metacharacters stay plain arguments');
  assert.equal(call.options.shell, false);
  assert.equal(call.options.detached, true);
  assert.equal(r.opened.length, 0);
});

test('a missing target is reported and nothing is launched', async () => {
  const r = runner({ exists: () => false });
  assert.deepEqual(await r.run({ name: 'a', target: FOLDER, args: '' }), { ok: false, code: 'missing' });
  assert.equal(r.opened.length, 0);
  assert.equal(r.deps.spawn.calls.length, 0);
});

test('failures from the OS or from spawning are reported, not thrown', async () => {
  const noHandler = runner({ shell: { openPath: async () => 'No application is associated', openExternal: async () => {} } });
  assert.deepEqual(await noHandler.run({ name: 'a', target: FOLDER, args: '' }), {
    ok: false,
    code: 'failed',
    error: 'No application is associated',
  });

  const bad = runner({ spawn: fakeSpawnFactory('error') });
  const result = await bad.run({ name: 't', target: 'C:\\Tools\\tool.exe', args: '-x' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'boom');

  const browser = runner({ shell: { openPath: async () => '', openExternal: async () => { throw new Error('no browser'); } } });
  assert.equal((await browser.run({ name: 'b', target: URL_TARGET, args: '' })).error, 'no browser');
});

test('the real spawn path starts a program with arguments and no shell', async () => {
  const marker = path.join(tempDir(), 'ran.txt');
  const real = createCommandRunner({
    shell: { openPath: async () => assert.fail('must not use openPath'), openExternal: async () => {} },
    spawn: childProcess.spawn,
    exists: fs.existsSync,
    env: process.env,
  });
  // node.exe is an .exe on Windows; elsewhere the runner would use openPath, which this test forbids
  if (!/\.exe$/i.test(process.execPath)) return;

  const script = "require('fs').writeFileSync(process.argv[1], process.argv.slice(2).join('|'))";
  const result = await real.run({
    name: 'node',
    target: process.execPath,
    args: '-e "' + script + '" "' + marker + '" "two words" ; calc',
  });
  assert.equal(result.ok, true);

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (fs.existsSync(marker)) {
      try {
        const content = fs.readFileSync(marker, 'utf8');
        if (content.length > 0) break;
      } catch {
        // file lock transient
      }
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(fs.readFileSync(marker, 'utf8'), 'two words|;|calc', 'arguments arrive intact, no shell involved');
});

function handler(commands, overrides) {
  const ran = [];
  const h = createCommandHandler({
    getCommands: () => commands,
    run: async (command) => {
      ran.push(command.name);
      return overrides && overrides.result ? overrides.result : { ok: true };
    },
  });
  return { handle: h.handle, ran };
}

const COMMANDS = [
  { name: 'invoice', target: FOLDER, args: '', description: 'folder invoice' },
  { name: 'wuwa', target: URL_TARGET, args: '', description: '' },
];

test('ordinary chat is left alone', async () => {
  const h = handler(COMMANDS);
  for (const text of ['halo', 'apa itu /invoice', 'a / b', '']) {
    assert.deepEqual(await h.handle(text), { isCommand: false }, text);
  }
  assert.deepEqual(h.ran, []);
});

test('a known command runs and Aemeath answers in character', async () => {
  const h = handler(COMMANDS);
  const answer = await h.handle('/invoice');
  assert.deepEqual(h.ran, ['invoice']);
  assert.equal(answer.ok, true);
  assert.match(answer.text, /^Siap, Rover! Membuka folder invoice/);
  assert.match((await h.handle('/WUWA extra words ignored')).text, /Membuka \/wuwa/);
  assert.deepEqual(h.ran, ['invoice', 'wuwa']);
});

test('slash alone and /help list the commands, even when there are none', async () => {
  const h = handler(COMMANDS);
  for (const text of ['/', '/help', '/bantuan']) {
    const answer = await h.handle(text);
    assert.match(answer.text, /\/invoice, \/wuwa/, text);
  }
  assert.deepEqual(h.ran, []);
  assert.match((await handler([]).handle('/')).text, /Belum ada perintah/);
});

test('unknown commands and injection attempts run nothing', async () => {
  const h = handler(COMMANDS);
  for (const text of ['/nope', '/invoice;calc', '/invoice&&calc', '/../invoice', '/%windir%', '/etc/passwd']) {
    const answer = await h.handle(text);
    assert.equal(answer.isCommand, true, text);
    assert.equal(answer.ok, false, text);
    assert.match(answer.text, /belum ada/, text);
  }
  assert.deepEqual(h.ran, []);
});

test('missing targets and OS failures get a friendly message', async () => {
  const missing = handler(COMMANDS, { result: { ok: false, code: 'missing' } });
  assert.match((await missing.handle('/invoice')).text, /tidak menemukan tujuan untuk \/invoice/);
  const failed = handler(COMMANDS, { result: { ok: false, code: 'failed', error: 'Access is denied' } });
  assert.match((await failed.handle('/invoice')).text, /gagal dibuka: Access is denied/);
});

test('workflow commands validate multiple targets and open all of them without a shell', async () => {
  const valid = normalizeCommands([
    { name: 'kerja', type: 'workflow', targets: [FOLDER, URL_TARGET], description: 'paket kerja' },
  ]);
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.commands.length, 1);
  assert.equal(valid.commands[0].type, 'workflow');
  assert.deepEqual(valid.commands[0].targets, [FOLDER, URL_TARGET]);

  // Rejects fewer than 2 targets or relative/unsafe targets inside a workflow
  assert.equal(normalizeCommands([{ name: 'satu', type: 'workflow', targets: [FOLDER] }]).commands.length, 0);
  assert.equal(normalizeCommands([{ name: 'rel', type: 'workflow', targets: [FOLDER, 'notepad.exe'] }]).commands.length, 0);

  const r = runner();
  assert.deepEqual(await r.run(valid.commands[0]), { ok: true });
  assert.deepEqual(r.opened, [FOLDER]);
  assert.deepEqual(r.external, [URL_TARGET]);

  // If any local target is missing, nothing is opened
  const rMissing = runner({ exists: () => false });
  assert.deepEqual(await rMissing.run(valid.commands[0]), { ok: false, code: 'missing' });
  assert.deepEqual(rMissing.opened, []);
  assert.deepEqual(rMissing.external, []);
});

test('/memory is reserved and routes to the builtin memory handler', async () => {
  // 1. A custom command cannot shadow /memory
  const dup = normalizeCommands([{ name: 'memory', target: FOLDER }]);
  assert.equal(dup.commands.length, 0);
  assert.match(dup.errors[0].message, /sudah dipakai/);

  // 2. Command handler dispatches /memory and subcommands to builtin
  let memoryCalled = false;
  let receivedArg = null;
  const h = createCommandHandler({
    getCommands: () => [],
    run: async () => ({ ok: true }),
    builtins: {
      memory: {
        description: 'Kelola memori companion',
        run: async (arg) => {
          memoryCalled = true;
          receivedArg = arg;
          return { ok: true, text: 'daftar memori dipanggil' };
        },
      },
    },
  });

  const res = await h.handle('/memory hapus 1');
  assert.equal(res.isCommand, true);
  assert.equal(res.ok, true);
  assert.equal(memoryCalled, true);
  assert.equal(receivedArg, 'hapus 1');
});

test('/feature is reserved and routes to the builtin feature guidebook handler', async () => {
  // 1. A custom command cannot shadow /feature
  const dup = normalizeCommands([{ name: 'feature', target: FOLDER }]);
  assert.equal(dup.commands.length, 0);
  assert.match(dup.errors[0].message, /sudah dipakai/);

  // 2. Command handler dispatches /feature to builtin
  let featureCalled = false;
  const h = createCommandHandler({
    getCommands: () => [],
    run: async () => ({ ok: true }),
    builtins: {
      feature: {
        description: 'Buka Aemeath Guidebook (buku panduan fitur)',
        run: async () => {
          featureCalled = true;
          return { ok: true, text: 'Membuka Aemeath Guidebook~' };
        },
      },
    },
  });

  const res = await h.handle('/feature');
  assert.equal(res.isCommand, true);
  assert.equal(res.ok, true);
  assert.equal(featureCalled, true);
  assert.match(res.text, /Guidebook/);
});
