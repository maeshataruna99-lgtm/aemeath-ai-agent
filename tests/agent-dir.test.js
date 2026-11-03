'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const { createSettingsStore } = require('../src/settings');
const { createClaudeAdapter } = require('../src/agent/claude-adapter');
const { createTaskStore } = require('../src/agent/task-store');
const { createTaskRunner } = require('../src/agent/task-runner');
const { createAgentBridge, messageKey } = require('../src/agent/agent-bridge');
const { createI18n } = require('../src/i18n');

const SID = '899bd7ff-d492-4139-bc28-c557401c0044';

function store() {
  return createSettingsStore(fs.mkdtempSync(path.join(os.tmpdir(), 'aem-dir-')));
}

test('the working folder defaults to empty and only an absolute path is kept', () => {
  const s = store();
  assert.equal(s.load().agentBridgeDir, '');
  const abs = path.resolve(os.tmpdir());
  assert.equal(s.save({ agentBridgeDir: abs }).agentBridgeDir, abs);
  for (const bad of ['relative/dir', '../up','\u0000x', 'x'.repeat(600), 42, null]) {
    assert.equal(s.save({ agentBridgeDir: bad }).agentBridgeDir, '', String(bad).slice(0, 20));
  }
});

function okSpawn() {
  const calls = [];
  const spawn = (bin, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => {};
    child.stdout.on('end', () => child.emit('close', 0));
    calls.push(options);
    setImmediate(() => {
      const line = (o) => JSON.stringify(Object.assign({ session_id: SID }, o)) + '\n';
      child.stdout.write(line({ type: 'result', subtype: 'success', result: 'ok' }));
      child.stdout.end();
    });
    return child;
  };
  spawn.calls = calls;
  return spawn;
}

test('the adapter runs in the folder it is given and refuses a folder that is gone', async () => {
  const spawn = okSpawn();
  let dir = 'C:/proj';
  let exists = true;
  const adapter = createClaudeAdapter({ spawn, cwd: () => dir, isDir: () => exists, env: {}, resolve: () => 'C:/bin/claude.exe' });
  await adapter.run({ prompt: 'x' });
  assert.equal(spawn.calls[0].cwd, 'C:/proj');
  dir = 'C:/other';
  await adapter.run({ prompt: 'x' });
  assert.equal(spawn.calls[1].cwd, 'C:/other');
  exists = false;
  await assert.rejects(adapter.run({ prompt: 'x' }), { code: 'bad_dir' });
  assert.equal(spawn.calls.length, 2);
});

test('a session is dropped when the working folder changes', async () => {
  const taskStore = createTaskStore();
  const seen = [];
  const adapter = { run: async (input) => (seen.push(input.sessionId), { sessionId: SID, text: 'ok' }) };
  let dir = 'C:/a';
  const bridge = createAgentBridge({
    store: taskStore,
    runner: createTaskRunner({ store: taskStore }),
    adapter,
    isEnabled: () => true,
    getDir: () => dir,
  });
  await bridge.ask('1');
  await bridge.ask('2');
  assert.deepEqual(seen, [null, SID]);
  assert.equal(bridge.currentSession(), SID);
  dir = 'C:/b';
  assert.equal(bridge.currentSession(), null);
  await bridge.ask('3');
  assert.deepEqual(seen, [null, SID, null]);
});

test('bad_dir and the folder settings have text in both languages', () => {
  assert.equal(messageKey('bad_dir'), 'agent.bad_dir');
  for (const locale of ['id-ID', 'en-US']) {
    const t = createI18n({ locale }).t;
    for (const key of [
      'agent.bad_dir',
      'settings.agent.dir_label',
      'settings.agent.dir_none',
      'settings.agent.dir_pick',
      'settings.agent.dir_clear',
    ]) {
      assert.notEqual(t(key), key, locale + ' is missing ' + key);
    }
  }
});
