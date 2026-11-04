'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const { MODELS, EFFORTS, PERMISSIONS, EDIT_TOOLS, cleanOptions, optionArgs } = require('../src/agent/agent-options');
const { createClaudeAdapter, buildArgs } = require('../src/agent/claude-adapter');
const { createStreamParser } = require('../src/agent/claude-stream');
const { createSettingsStore } = require('../src/settings');
const { createTaskStore } = require('../src/agent/task-store');
const { createTaskRunner } = require('../src/agent/task-runner');
const { createAgentBridge } = require('../src/agent/agent-bridge');
const { createI18n } = require('../src/i18n');

const SID = '899bd7ff-d492-4139-bc28-c557401c0044';
const line = (obj) => JSON.stringify(Object.assign({ session_id: SID }, obj));
const EDITS = EDIT_TOOLS.join(',');

test('the choices come from fixed lists', () => {
  assert.deepEqual(MODELS, ['fable', 'opus', 'sonnet', 'haiku']);
  assert.deepEqual(EFFORTS, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(PERMISSIONS, ['ask', 'plan', 'edit']);
});

test('unknown values are dropped, and the permission falls back to ask first', () => {
  assert.deepEqual(cleanOptions(undefined), { model: '', effort: '', permission: 'ask' });
  assert.deepEqual(cleanOptions('opus'), { model: '', effort: '', permission: 'ask' });
  assert.deepEqual(cleanOptions({ model: 'opus', effort: 'high', permission: 'plan' }), { model: 'opus', effort: 'high', permission: 'plan' });
  assert.deepEqual(cleanOptions({ model: 'gpt-9', effort: 'extreme', permission: 'bypassPermissions' }), { model: '', effort: '', permission: 'ask' });
});

test('each choice becomes its own arguments', () => {
  assert.deepEqual(optionArgs({ model: 'opus' }), ['--model', 'opus']);
  assert.deepEqual(optionArgs({ effort: 'xhigh' }), ['--effort', 'xhigh']);
  assert.deepEqual(optionArgs({ permission: 'plan' }), ['--permission-mode', 'plan']);
  assert.deepEqual(optionArgs({ permission: 'edit' }), ['--allowedTools', EDITS]);
  assert.deepEqual(optionArgs({ permission: 'ask' }), []);
  assert.deepEqual(optionArgs({ model: 'haiku', effort: 'low', permission: 'edit' }), ['--model', 'haiku', '--effort', 'low', '--allowedTools', EDITS]);
});

test('a typed "ya" lets edits through once, never in plan mode, and never twice', () => {
  assert.deepEqual(optionArgs({ permission: 'ask' }, true), ['--allowedTools', EDITS]);
  assert.deepEqual(optionArgs({ permission: 'plan' }, true), ['--permission-mode', 'plan']);
  assert.equal(optionArgs({ permission: 'edit' }, true).filter((a) => a === '--allowedTools').length, 1);
});

test('no input can produce a flag that lets a shell command run', () => {
  const hostile = ['acceptEdits', 'auto', 'dontAsk', 'manual', 'bypassPermissions', '--dangerously-skip-permissions', 'edit; rm -rf /', '', null, 42, {}, []];
  for (const permission of hostile) {
    for (const model of hostile.concat(MODELS)) {
      const joined = optionArgs({ model, effort: permission, permission }, false).join(' ');
      assert.doesNotMatch(joined, /acceptEdits|bypassPermissions|dontAsk|dangerously|Bash|;|rm -rf/, JSON.stringify([permission, model]));
    }
  }
  assert.equal(optionArgs({ permission: 'bypassPermissions' }).length, 0);
});

test('the argument builder adds the choices after the base arguments', () => {
  assert.deepEqual(buildArgs(null), buildArgs(null, false, null, undefined));
  const args = buildArgs(SID, false, null, { model: 'sonnet', effort: 'medium', permission: 'plan' });
  assert.deepEqual(args.slice(-6), ['--model', 'sonnet', '--effort', 'medium', '--permission-mode', 'plan']);
  assert.ok(args.includes('--resume'));
});

function fakeSpawn(lines) {
  const calls = [];
  const spawn = (bin, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => child.stdout.end();
    child.stdout.on('end', () => child.emit('close', 0));
    calls.push({ bin, args, options });
    setImmediate(() => {
      for (const l of lines) child.stdout.write(l + '\n');
      child.stdout.end();
    });
    return child;
  };
  spawn.calls = calls;
  return spawn;
}

const adapterFor = (spawn) => createClaudeAdapter({ spawn, cwd: 'C:/p', isDir: () => true, env: {}, resolve: () => 'C:/bin/claude.exe' });
const initLine = (model) => line({ type: 'system', subtype: 'init', model, permissionMode: 'default' });
const resultLine = line({ type: 'result', subtype: 'success', result: 'ok' });

test('the adapter passes the owner\'s choices and refuses anything outside the lists', async () => {
  const spawn = fakeSpawn([resultLine]);
  await adapterFor(spawn).run({ prompt: 'x', options: { model: 'opus', effort: 'high', permission: 'edit' } });
  const a = spawn.calls[0].args;
  assert.deepEqual(a.slice(a.indexOf('--model')), ['--model', 'opus', '--effort', 'high', '--allowedTools', EDITS]);

  const spawn2 = fakeSpawn([resultLine]);
  await adapterFor(spawn2).run({ prompt: 'x', options: { model: 'opus; rm -rf /', effort: '--max', permission: 'bypassPermissions' } });
  const b = spawn2.calls[0].args.join(' ');
  assert.doesNotMatch(b, /--model|--effort|--permission-mode|--allowedTools|rm -rf/);
});

test('the model the CLI really runs is read from its start and reported', async () => {
  const steps = [];
  const spawn = fakeSpawn([initLine('claude-opus-5-5'), resultLine]);
  const res = await adapterFor(spawn).run({ prompt: 'x', onStep: (s) => steps.push(s) });
  assert.equal(res.model, 'claude-opus-5-5');
  assert.deepEqual(steps[0], { kind: 'start', model: 'claude-opus-5-5' });

  const feed = createStreamParser();
  assert.equal(feed(initLine('x'.repeat(200))).model.length, 60);
  assert.equal(feed(line({ type: 'system', subtype: 'init' })).model, '');
});

function bridgeWith(getOptions, adapterRun) {
  const store = createTaskStore();
  const seen = [];
  const bridge = createAgentBridge({
    store,
    runner: createTaskRunner({ store }),
    adapter: {
      run: async (input) => {
        seen.push(input.options);
        input.onStep({ kind: 'start', model: 'claude-sonnet-5-5' });
        return adapterRun ? adapterRun(input, seen) : { sessionId: SID, text: 'ok', denials: [] };
      },
    },
    isEnabled: () => true,
    getOptions,
  });
  return { bridge, seen };
}

test('the bridge reads the choices on every turn, cleaned, so a change applies at once', async () => {
  let choice = { model: 'opus', effort: 'low', permission: 'ask' };
  const { bridge, seen } = bridgeWith(() => choice);
  await bridge.ask('satu');
  choice = { model: 'gpt-9', effort: 'high', permission: 'plan' };
  await bridge.ask('dua');
  assert.deepEqual(seen[0], { model: 'opus', effort: 'low', permission: 'ask' });
  assert.deepEqual(seen[1], { model: '', effort: 'high', permission: 'plan' });
});

test('the bridge remembers the model the CLI reported', async () => {
  const { bridge } = bridgeWith(() => ({}));
  assert.equal(bridge.modelInUse(), '');
  await bridge.ask('halo');
  assert.equal(bridge.modelInUse(), 'claude-sonnet-5-5');
});

const DENIED = (input, seen) => ({ sessionId: SID, text: 'ok', denials: seen.length === 1 ? [{ tool: 'Write', target: 'a.txt' }] : [] });

test('a denied edit can be approved only in the ask-first kind', async () => {
  const ask = bridgeWith(() => ({ permission: 'ask' }), DENIED);
  assert.equal((await ask.bridge.ask('buat')).approvable, true);
  assert.equal((await ask.bridge.approve()).ok, true);

  for (const permission of ['plan', 'edit']) {
    const other = bridgeWith(() => ({ permission }), DENIED);
    const res = await other.bridge.ask('buat');
    assert.equal(res.approvable, false, permission);
    assert.deepEqual(await other.bridge.approve(), { ok: false, code: 'nothing_to_approve' }, permission);
  }
});

test('the settings keep the model and effort, refuse anything else, and never store the permission', () => {
  const s = createSettingsStore(fs.mkdtempSync(path.join(os.tmpdir(), 'aem-opt-')));
  const first = s.load();
  assert.equal(first.agentModel, '');
  assert.equal(first.agentEffort, '');
  assert.equal(s.save({ agentModel: 'opus', agentEffort: 'xhigh' }).agentModel, 'opus');
  assert.equal(s.save({}).agentEffort, 'xhigh');
  for (const bad of ['gpt-9', '--model x', 42, null, {}]) {
    assert.equal(s.save({ agentModel: bad }).agentModel, '', String(bad));
    assert.equal(s.save({ agentEffort: bad }).agentEffort, '', String(bad));
  }
  assert.equal('agentPermission' in first, false, 'the permission kind is not a saved setting');
});

test('every new chip text exists in both languages', () => {
  const keys = [
    'model_title', 'model_default', 'effort_title', 'effort_default', 'effort_short', 'effort_low', 'effort_medium',
    'effort_high', 'effort_xhigh', 'effort_max', 'perm_title', 'perm_short', 'perm_ask', 'perm_plan', 'perm_edit',
    'perm_ask_desc', 'perm_plan_desc', 'perm_edit_desc', 'perm_edit_warning', 'option_changed',
  ];
  for (const locale of ['id-ID', 'en-US']) {
    const t = createI18n({ locale }).t;
    for (const key of keys) assert.notEqual(t('chat.' + key, { level: 'x', kind: 'y', what: 'z', value: 'v' }), 'chat.' + key, locale + ' ' + key);
    assert.match(t('chat.option_changed', { what: 'Izin', value: 'Edit otomatis' }), /Izin.*Edit otomatis/);
  }
});
