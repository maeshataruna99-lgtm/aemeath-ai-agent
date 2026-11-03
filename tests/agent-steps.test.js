'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const { createStreamParser } = require('../src/agent/claude-stream');
const { createClaudeAdapter } = require('../src/agent/claude-adapter');
const { createTaskStore } = require('../src/agent/task-store');
const { createTaskRunner } = require('../src/agent/task-runner');
const { createAgentBridge, agentReply, stepText, stepsSummary, stepClass } = require('../src/agent/agent-bridge');
const { createI18n } = require('../src/i18n');

const SID = '899bd7ff-d492-4139-bc28-c557401c0044';
const line = (obj) => JSON.stringify(Object.assign({ session_id: SID }, obj));
const toolLine = (name, input) =>
  line({ type: 'assistant', message: { model: 'm', content: [{ type: 'tool_use', id: 't', name, input }] } });
const feed = (lines) => {
  const f = createStreamParser();
  return lines.map(f).filter(Boolean);
};
const tId = createI18n({ locale: 'id-ID' }).t;
const tEn = createI18n({ locale: 'en-US' }).t;

test('a tool call carries what it is about, as one short line', () => {
  const [read, grep, bash, web, none] = feed([
    toolLine('Read', { file_path: 'C:/proj/README.md' }),
    toolLine('Grep', { pattern: 'workflow', path: 'src' }),
    toolLine('Bash', { command: 'git status' }),
    toolLine('WebFetch', { url: 'https://example.com/a' }),
    toolLine('Skill', {}),
  ]);
  assert.deepEqual(read.uses, [{ name: 'Read', target: 'C:/proj/README.md' }]);
  assert.deepEqual(grep.uses, [{ name: 'Grep', target: 'workflow' }]);
  assert.deepEqual(bash.uses, [{ name: 'Bash', target: 'git status' }]);
  assert.deepEqual(web.uses, [{ name: 'WebFetch', target: 'https://example.com/a' }]);
  assert.deepEqual(none.uses, [{ name: 'Skill', target: '' }]);
});

test('a target is cleaned: no control characters, a long one keeps its tail, secrets are hidden', () => {
  const [messy, long, secret] = feed([
    toolLine('Bash', { command: 'echo a\u0007\nb\tc' }),
    toolLine('Read', { file_path: 'C:/' + 'd/'.repeat(80) + 'file.js' }),
    toolLine('Bash', { command: 'curl -H sk-abcdefghijklmnopqrstuvwxyz123456 x' }),
  ]);
  assert.equal(messy.uses[0].target, 'echo a b c');
  const t = long.uses[0].target;
  assert.equal(t.length, 80);
  assert.ok(t.startsWith('\u2026') && t.endsWith('file.js'));
  assert.equal(secret.uses[0].target.includes('sk-abcdef'), false);
});

test('a thinking block start is a thinking event, while its deltas stay quiet', () => {
  const events = feed([
    line({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'thinking' } } }),
    line({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'x' } } }),
    line({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'text' } } }),
  ]);
  assert.deepEqual(events.map((e) => e.kind), ['thinking']);
});

function fakeSpawn(lines) {
  return (bin, args) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => child.stdout.end();
    child.stdout.on('end', () => child.emit('close', 0));
    setImmediate(() => {
      for (const l of lines) child.stdout.write(l + '\n');
      child.stdout.end();
    });
    return child;
  };
}

test('the adapter reports each step as it happens, in order', async () => {
  const spawn = fakeSpawn([
    line({ type: 'system', subtype: 'init' }),
    line({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'thinking' } } }),
    toolLine('Read', { file_path: 'a.js' }),
    toolLine('Grep', { pattern: 'x' }),
    line({ type: 'result', subtype: 'success', result: 'ok' }),
  ]);
  const adapter = createClaudeAdapter({ spawn, cwd: 'C:/p', isDir: () => true, env: {}, resolve: () => 'C:/bin/claude.exe' });
  const steps = [];
  await adapter.run({ prompt: 'x', onStep: (s) => steps.push(s) });
  assert.deepEqual(steps, [
    { kind: 'start' },
    { kind: 'thinking' },
    { kind: 'tool', name: 'Read', target: 'a.js' },
    { kind: 'tool', name: 'Grep', target: 'x' },
  ]);
});

function bridgeWith(adapterRun) {
  const store = createTaskStore();
  return createAgentBridge({ store, runner: createTaskRunner({ store }), adapter: { run: adapterRun }, isEnabled: () => true });
}

test('the bridge counts the tools used, passes steps on, and skips a repeated thinking step', async () => {
  const bridge = bridgeWith(async (input) => {
    for (const s of [{ kind: 'start' }, { kind: 'thinking' }, { kind: 'thinking' }, { kind: 'tool', name: 'Read', target: 'a' }, { kind: 'tool', name: 'Read', target: 'b' }, { kind: 'tool', name: 'Grep', target: 'c' }, { kind: 'tool', name: 'Skill', target: '' }]) {
      input.onStep(s);
    }
    return { sessionId: SID, text: 'ok', denials: [] };
  });
  const seen = [];
  const res = await bridge.ask('halo', { onStep: (s) => seen.push(s.kind + (s.name ? ':' + s.name : '')) });
  assert.deepEqual(res.steps, { read: 2, search: 1, other: 1 });
  assert.deepEqual(seen, ['start', 'thinking', 'tool:Read', 'tool:Read', 'tool:Grep', 'tool:Skill']);
});

test('steps are also reported when an edit is approved', async () => {
  let calls = 0;
  const bridge = bridgeWith(async (input) => {
    calls++;
    input.onStep({ kind: 'tool', name: 'Write', target: 'a.txt' });
    return { sessionId: SID, text: 'ok', denials: calls === 1 ? [{ tool: 'Write', target: 'a.txt' }] : [] };
  });
  await bridge.ask('buat');
  const seen = [];
  const res = await bridge.approve({ onStep: (s) => seen.push(s.name) });
  assert.deepEqual(seen, ['Write']);
  assert.deepEqual(res.steps, { write: 1 });
});

test('tool names are grouped the way Aemeath talks about them', () => {
  const groups = { Read: 'read', Grep: 'search', Glob: 'search', Edit: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit', Write: 'write', Bash: 'bash', WebFetch: 'web', WebSearch: 'web', Skill: 'other', constructor: 'other' };
  for (const [name, group] of Object.entries(groups)) assert.equal(stepClass(name), group, name);
});

test('a status line is in Aemeath\'s voice and the active language', () => {
  assert.equal(stepText(tId, { kind: 'start' }), 'Aemeath meneruskan pesanmu ke Claude\u2026');
  assert.equal(stepText(tEn, { kind: 'start' }), 'Aemeath is passing your message to Claude\u2026');
  assert.equal(stepText(tId, { kind: 'tool', name: 'Read', target: 'src/a.js' }), 'Membaca: src/a.js');
  assert.equal(stepText(tEn, { kind: 'tool', name: 'Grep', target: 'workflow' }), 'Searching: workflow');
  assert.equal(stepText(tId, { kind: 'tool', name: 'Bash', target: 'ls' }), 'Mencoba menjalankan perintah: ls');
  assert.equal(stepText(tId, { kind: 'tool', name: 'Skill', target: '' }), 'Memakai alat Skill');
  assert.equal(stepText(tEn, { kind: 'thinking' }), 'Claude is thinking it over\u2026');
  for (const t of [tId, tEn]) {
    for (const name of ['Read', 'Grep', 'Edit', 'Write', 'Bash', 'WebFetch', 'Other']) {
      assert.doesNotMatch(stepText(t, { kind: 'tool', name, target: 'x' }), /agent\.|\{\w+\}/, name);
    }
  }
});

test('the reply ends with what Claude did, and keeps the denial note after it', () => {
  const steps = { read: 3, search: 1, write: 1 };
  assert.equal(stepsSummary(tId, steps), 'Langkah Claude: membaca 3x, mencari 1x, mencoba menulis 1x.');
  assert.equal(stepsSummary(tEn, steps), "Claude's steps: read 3x, searched 1x, tried to write 1x.");
  assert.equal(stepsSummary(tId, {}), '');
  assert.equal(stepsSummary(tId, undefined), '');

  const plain = agentReply(tId, { text: 'jawab', steps, denials: [] });
  assert.equal(plain, 'jawab\n\nLangkah Claude: membaca 3x, mencari 1x, mencoba menulis 1x.');
  const denied = agentReply(tId, { text: 'jawab', steps: { write: 1 }, denials: [{ tool: 'Write', target: 'a.txt' }], approvable: true });
  assert.ok(denied.indexOf('Langkah Claude') < denied.indexOf('Claude ingin melakukan'));
  assert.equal(agentReply(tId, { text: 'jawab', denials: [] }), 'jawab');
});

test('every new text exists in both languages', () => {
  const keys = [
    'agent.step_start', 'agent.step_thinking', 'agent.step_read', 'agent.step_search', 'agent.step_edit',
    'agent.step_write', 'agent.step_bash', 'agent.step_web', 'agent.step_other', 'agent.sum_header',
    'agent.sum_read', 'agent.sum_search', 'agent.sum_edit', 'agent.sum_write', 'agent.sum_bash',
    'agent.sum_web', 'agent.sum_other', 'chat.agent_pending',
  ];
  for (const t of [tId, tEn]) for (const key of keys) assert.notEqual(t(key, { n: 1, name: 'x' }), key, key);
  assert.doesNotMatch(tId('chat.agent_pending'), /^Claude sedang bekerja/);
});
