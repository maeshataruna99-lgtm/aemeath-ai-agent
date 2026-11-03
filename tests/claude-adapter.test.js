'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const path = require('node:path');

const { createClaudeAdapter, resolveClaude, buildArgs } = require('../src/agent/claude-adapter');

const SID = '899bd7ff-d492-4139-bc28-c557401c0044';
const line = (obj) => JSON.stringify(Object.assign({ session_id: SID }, obj));
const OK_LINES = [
  line({ type: 'system', subtype: 'init' }),
  line({ type: 'assistant', message: { model: 'm', content: [{ type: 'text', text: 'halo' }] } }),
  line({ type: 'result', subtype: 'success', result: 'halo' }),
];

// A stand-in for the CLI process: replays `lines` on stdout, then closes.
function fakeSpawn(lines, opts) {
  const o = opts || {};
  const calls = [];
  function spawn(bin, args, options) {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.killed = false;
    child.stdinText = '';
    child.stdin.on('data', (d) => (child.stdinText += d));
    child.stdout.on('end', () => child.emit('close', 0));
    child.kill = () => {
      child.killed = true;
      child.stdout.end();
    };
    calls.push({ bin, args, options, child });
    if (!o.hang) {
      setImmediate(() => {
        for (const chunk of o.chunks || lines.map((l) => l + '\n')) child.stdout.write(chunk);
        child.stdout.end();
      });
    }
    return child;
  }
  spawn.calls = calls;
  return spawn;
}

function adapterFor(spawn, resolve) {
  return createClaudeAdapter({ spawn, cwd: 'C:/home', isDir: () => true, env: {}, resolve: resolve || (() => 'C:/bin/claude.exe') });
}

test('runs a turn: prompt on stdin, argument list, no shell', async () => {
  const spawn = fakeSpawn(OK_LINES);
  const result = await adapterFor(spawn).run({ prompt: '--help ; rm -rf /' });
  assert.deepEqual(result, { sessionId: SID, text: 'halo', denials: [] });
  const { bin, args, options, child } = spawn.calls[0];
  assert.equal(bin, 'C:/bin/claude.exe');
  assert.deepEqual(args, buildArgs(null));
  assert.equal(args.includes('--help ; rm -rf /'), false);
  assert.equal(options.shell, undefined);
  assert.equal(options.cwd, 'C:/home');
  assert.equal(child.stdinText, '--help ; rm -rf /');
  assert.ok(args.includes('--permission-prompts') && args.includes('none'));
});

test('a session id adds --resume', async () => {
  const spawn = fakeSpawn(OK_LINES);
  await adapterFor(spawn).run({ prompt: 'lanjut', sessionId: SID });
  const { args } = spawn.calls[0];
  assert.deepEqual(args.slice(-2), ['--resume', SID]);
});

test('a session id that is not a UUID never reaches the command line', async () => {
  const spawn = fakeSpawn(OK_LINES);
  await assert.rejects(adapterFor(spawn).run({ prompt: 'x', sessionId: '--dangerous' }), { code: 'invalid_session' });
  assert.equal(spawn.calls.length, 0);
});

test('rejects an empty prompt and a missing binary without spawning', async () => {
  const spawn = fakeSpawn(OK_LINES);
  await assert.rejects(adapterFor(spawn).run({ prompt: '   ' }), { code: 'empty_prompt' });
  await assert.rejects(adapterFor(spawn, () => null).run({ prompt: 'x' }), { code: 'not_installed' });
  assert.equal(spawn.calls.length, 0);
});

test('a failed login rejects with auth even though the result says success', async () => {
  const spawn = fakeSpawn([
    line({ type: 'system', subtype: 'init' }),
    line({
      type: 'assistant',
      error: 'authentication_failed',
      message: { model: '<synthetic>', content: [{ type: 'text', text: 'Failed to authenticate' }] },
    }),
    line({ type: 'result', subtype: 'success', result: 'Failed to authenticate' }),
  ]);
  await assert.rejects(adapterFor(spawn).run({ prompt: 'x' }), { code: 'auth' });
});

test('a process that exits without a result is no_result, not a success', async () => {
  const spawn = fakeSpawn([line({ type: 'system', subtype: 'init' })]);
  await assert.rejects(adapterFor(spawn).run({ prompt: 'x' }), { code: 'no_result' });
});

test('output split mid-line and mid-character is still read', async () => {
  const text = line({ type: 'assistant', message: { model: 'm', content: [{ type: 'text', text: 'héllo' }] } });
  const bytes = Buffer.from(text + '\n' + line({ type: 'result', subtype: 'success', result: 'héllo' }) + '\n');
  const cut = bytes.indexOf(Buffer.from('é')) + 1; // inside the two-byte character
  const spawn = fakeSpawn(null, { chunks: [bytes.subarray(0, cut), bytes.subarray(cut)] });
  const result = await adapterFor(spawn).run({ prompt: 'x' });
  assert.equal(result.text, 'héllo');
});

test('aborting kills the process', async () => {
  const spawn = fakeSpawn(null, { hang: true });
  const ctrl = new AbortController();
  const pending = adapterFor(spawn).run({ prompt: 'x', signal: ctrl.signal });
  ctrl.abort();
  await assert.rejects(pending, { code: 'no_result' });
  assert.equal(spawn.calls[0].child.killed, true);
});

test('resolveClaude picks claude.exe on Windows and never the .cmd shim', () => {
  const found = new Set([
    path.join('C:\\Users\\me', '.local', 'bin', 'claude.exe'),
    path.join('C:\\npm', 'claude.cmd'),
  ]);
  const exists = (p) => found.has(p);
  const env = { USERPROFILE: 'C:\\Users\\me', PATH: 'C:\\npm' };
  assert.equal(resolveClaude(env, 'win32', exists), path.join('C:\\Users\\me', '.local', 'bin', 'claude.exe'));
  assert.equal(resolveClaude({ PATH: 'C:\\npm' }, 'win32', exists), null);
});

test('text deltas reach onText while the turn runs and partial messages are requested', async () => {
  const delta = (text) =>
    line({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });
  const spawn = fakeSpawn([
    line({ type: 'system', subtype: 'init' }),
    delta('Sat'),
    delta('u, dua'),
    line({ type: 'assistant', message: { model: 'm', content: [{ type: 'text', text: 'Satu, dua' }] } }),
    line({ type: 'result', subtype: 'success', result: 'Satu, dua' }),
  ]);
  const seen = [];
  const result = await adapterFor(spawn).run({ prompt: 'x', onText: (d) => seen.push(d) });
  assert.deepEqual(seen, ['Sat', 'u, dua']);
  assert.equal(result.text, 'Satu, dua');
  assert.ok(spawn.calls[0].args.includes('--include-partial-messages'));
});

test('denied tool calls come back with the answer, and approveEdits lets edits through', async () => {
  const withDenial = [
    line({ type: 'system', subtype: 'init' }),
    line({
      type: 'result',
      subtype: 'success',
      result: 'belum dibuat',
      permission_denials: [{ tool_name: 'Write', tool_input: { file_path: 'a.txt', content: 'x' } }],
    }),
  ];
  const spawn = fakeSpawn(withDenial);
  const result = await adapterFor(spawn).run({ prompt: 'buat a.txt' });
  assert.deepEqual(result.denials, [{ tool: 'Write', target: 'a.txt' }]);
  assert.equal(spawn.calls[0].args.includes('--allowedTools'), false);

  const spawn2 = fakeSpawn(OK_LINES);
  await adapterFor(spawn2).run({ prompt: 'ya', sessionId: SID, approveEdits: true });
  const args = spawn2.calls[0].args;
  assert.deepEqual(args.slice(args.indexOf('--allowedTools')), ['--allowedTools', 'Edit,Write,MultiEdit,NotebookEdit']);
  assert.equal(args.includes('acceptEdits'), false);
  assert.equal(args.join(' ').includes('Bash'), false);
  assert.ok(args.includes('--permission-prompts') && args.includes('none'));
});
