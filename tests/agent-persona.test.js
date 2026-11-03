'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const { agentPersona } = require('../src/agent/agent-persona');
const { createClaudeAdapter, buildArgs } = require('../src/agent/claude-adapter');
const { createTaskStore } = require('../src/agent/task-store');
const { createTaskRunner } = require('../src/agent/task-runner');
const { createAgentBridge } = require('../src/agent/agent-bridge');
const { containsSecret } = require('../src/chat/chat-error');

const SID = '899bd7ff-d492-4139-bc28-c557401c0044';
const line = (obj) => JSON.stringify(Object.assign({ session_id: SID }, obj));
const OK = [line({ type: 'result', subtype: 'success', result: 'ok' })];

test('Aemeath speaks to Rover in the active language, Indonesian by default', () => {
  const id = agentPersona('id-ID');
  const en = agentPersona('en-US');
  assert.notEqual(id, en);
  for (const text of [id, en]) {
    assert.match(text, /Aemeath/);
    assert.match(text, /Rover/);
    assert.match(text, /Wuthering Waves/);
    assert.ok(text.length > 400 && text.length < 4000);
    assert.equal(containsSecret(text), false);
  }
  assert.match(id, /Bahasa Indonesia/);
  assert.match(en, /English/);
  assert.equal(agentPersona(undefined), id);
  assert.equal(agentPersona('fr-FR'), id);
});

test('the voice never outranks accuracy and honesty', () => {
  const id = agentPersona('id-ID');
  assert.match(id, /Aturan kerja \(mengalahkan aturan gaya\)/);
  assert.match(id, /Ketepatan nomor satu/);
  assert.match(id, /persis/);
  assert.match(id, /Jangan mengarang hasil/);
  assert.match(id, /Blok kode ditulis apa adanya/);
  const en = agentPersona('en-US');
  assert.match(en, /Working rules \(they beat the style rules\)/);
  assert.match(en, /Accuracy comes first/);
  assert.match(en, /Never invent results/);
  assert.match(en, /Code blocks are written as they are/);
});

test('the persona stays child-safe and honest about what Aemeath is', () => {
  assert.match(agentPersona('id-ID'), /segala usia/);
  assert.match(agentPersona('id-ID'), /pet buatan penggemar/);
  assert.match(agentPersona('en-US'), /all ages/);
  assert.match(agentPersona('en-US'), /fan-made pet/);
});

function fakeSpawn() {
  const calls = [];
  const spawn = (bin, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.stdinText = '';
    child.stdin.on('data', (d) => (child.stdinText += d));
    child.kill = () => child.stdout.end();
    child.stdout.on('end', () => child.emit('close', 0));
    calls.push({ bin, args, options, child });
    setImmediate(() => {
      for (const l of OK) child.stdout.write(l + '\n');
      child.stdout.end();
    });
    return child;
  };
  spawn.calls = calls;
  return spawn;
}

function adapterFor(spawn) {
  return createClaudeAdapter({ spawn, cwd: 'C:/p', isDir: () => true, env: {}, resolve: () => 'C:/bin/claude.exe' });
}

test('the persona goes in as one extra system prompt argument, never in the message', async () => {
  const spawn = fakeSpawn();
  const persona = agentPersona('id-ID');
  await adapterFor(spawn).run({ prompt: 'halo', persona });
  const { args, options, child } = spawn.calls[0];
  const at = args.indexOf('--append-system-prompt');
  assert.ok(at >= 0);
  assert.equal(args[at + 1], persona, 'the whole persona is a single argument');
  assert.equal(args.filter((a) => a === persona).length, 1);
  assert.equal(options.shell, undefined);
  assert.equal(child.stdinText, 'halo', 'the owner message is unchanged');
});

test('there is no system prompt argument without a persona, and a bad persona is ignored', async () => {
  for (const persona of [undefined, null, '', 42, {}]) {
    const spawn = fakeSpawn();
    await adapterFor(spawn).run({ prompt: 'halo', persona });
    assert.equal(spawn.calls[0].args.includes('--append-system-prompt'), false, String(persona));
  }
  assert.deepEqual(buildArgs(null), buildArgs(null, false, null));
});

test('an over-long persona is cut, and it works together with resume and approval', async () => {
  const spawn = fakeSpawn();
  await adapterFor(spawn).run({ prompt: 'ya', persona: 'x'.repeat(9000), sessionId: SID, approveEdits: true });
  const args = spawn.calls[0].args;
  assert.equal(args[args.indexOf('--append-system-prompt') + 1].length, 4000);
  assert.ok(args.includes('--resume') && args.includes('--allowedTools'));
});

test('the bridge asks for the persona on every turn, so a language change applies at once', async () => {
  const seen = [];
  const store = createTaskStore();
  let locale = 'id-ID';
  const bridge = createAgentBridge({
    store,
    runner: createTaskRunner({ store }),
    adapter: {
      run: async (input) => {
        seen.push(input.persona);
        return { sessionId: SID, text: 'ok', denials: calls(seen) };
      },
    },
    isEnabled: () => true,
    getPersona: () => agentPersona(locale),
  });
  await bridge.ask('satu');
  locale = 'en-US';
  await bridge.ask('dua');
  assert.equal(seen[0], agentPersona('id-ID'));
  assert.equal(seen[1], agentPersona('en-US'));
});

function calls(seen) {
  // the first turn is denied an edit, so the next step is an approval
  return seen.length === 1 ? [{ tool: 'Write', target: 'a.txt' }] : [];
}

test('an approved turn carries the persona too', async () => {
  const seen = [];
  const store = createTaskStore();
  const bridge = createAgentBridge({
    store,
    runner: createTaskRunner({ store }),
    adapter: {
      run: async (input) => {
        seen.push({ persona: input.persona, approve: input.approveEdits === true });
        return { sessionId: SID, text: 'ok', denials: calls(seen) };
      },
    },
    isEnabled: () => true,
    getPersona: () => agentPersona('id-ID'),
  });
  await bridge.ask('buat a.txt');
  await bridge.approve();
  assert.deepEqual(seen.map((s) => s.approve), [false, true]);
  assert.ok(seen.every((s) => s.persona === agentPersona('id-ID')));
});

test('a bridge without a persona sends none', async () => {
  const seen = [];
  const store = createTaskStore();
  const bridge = createAgentBridge({
    store,
    runner: createTaskRunner({ store }),
    adapter: { run: async (input) => (seen.push(input.persona), { sessionId: SID, text: 'ok', denials: [] }) },
    isEnabled: () => true,
  });
  await bridge.ask('halo');
  assert.equal(seen[0], null);
});
