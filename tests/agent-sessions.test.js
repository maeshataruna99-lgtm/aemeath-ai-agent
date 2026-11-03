'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { listSessions, slugOf } = require('../src/agent/session-list');
const { createTaskStore } = require('../src/agent/task-store');
const { createTaskRunner } = require('../src/agent/task-runner');
const { createAgentBridge, messageKey, sessionsReply } = require('../src/agent/agent-bridge');
const { createI18n } = require('../src/i18n');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

function projects(dir, files) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'aem-sess-'));
  const folder = path.join(base, slugOf(dir));
  fs.mkdirSync(folder, { recursive: true });
  const now = Date.now();
  for (const [name, ageMs] of Object.entries(files)) {
    const file = path.join(folder, name);
    fs.writeFileSync(file, 'transcript text that must never be read');
    fs.utimesSync(file, new Date(now - ageMs), new Date(now - ageMs));
  }
  fs.mkdirSync(path.join(folder, A + '.dir.jsonl'));
  return { base, now };
}

test('a folder maps to the directory name Claude Code uses', () => {
  assert.equal(slugOf('C:/Users/Cinder/IdeaProjects/aemeth-ai-agent'), 'C--Users-Cinder-IdeaProjects-aemeth-ai-agent');
  assert.equal(slugOf(String.raw`C:\Users\Cinder\IdeaProjects\aemeth-ai-agent`), 'C--Users-Cinder-IdeaProjects-aemeth-ai-agent');
});

test('sessions are listed newest first from file names and times only', () => {
  const dir = 'C:/proj/app';
  const { base, now } = projects(dir, {
    [A + '.jsonl']: 2 * 3600 * 1000,
    [B + '.jsonl']: 60 * 1000,
    [C + '.jsonl']: 3 * 86400 * 1000,
    'notes.jsonl': 1000,
    'not-a-uuid.txt': 1000,
  });
  const list = listSessions(dir, { projectsDir: base, now: () => now });
  assert.deepEqual(list.map((s) => s.id), [B, A, C]);
  assert.ok(Math.abs(list[0].ageMs - 60000) < 2000);
  assert.deepEqual(Object.keys(list[0]).sort(), ['ageMs', 'id']);
  assert.equal(listSessions(dir, { projectsDir: base, now: () => now, limit: 2 }).length, 2);
  assert.deepEqual(listSessions('C:/nowhere',{ projectsDir: base }), []);
});

function bridgeWith(list) {
  const store = createTaskStore();
  const seen = [];
  const bridge = createAgentBridge({
    store,
    runner: createTaskRunner({ store }),
    adapter: { run: async (input) => (seen.push(input.sessionId), { sessionId: input.sessionId || A, text: 'ok', denials: [] }) },
    isEnabled: () => true,
    getDir: () => 'C:/proj',
    listSessions: () => list,
  });
  return { bridge, seen };
}

test('continuing a listed session by number makes the next message resume it', async () => {
  const { bridge, seen } = bridgeWith([{ id: B, ageMs: 1 }, { id: A, ageMs: 2 }]);
  assert.deepEqual(bridge.useSession(2), { ok: true, id: A });
  assert.equal(bridge.currentSession(), A);
  await bridge.ask('lanjut');
  assert.deepEqual(seen, [A]);
});

test('a number outside the list is refused and nothing changes', () => {
  const { bridge } = bridgeWith([{ id: B, ageMs: 1 }]);
  for (const n of [0, 2, 99, NaN]) {
    assert.deepEqual(bridge.useSession(n), { ok: false, code: 'session_not_found' });
  }
  assert.equal(bridge.currentSession(), null);
});

test('the session list reads well in both languages', () => {
  const list = [{ id: B, ageMs: 30 * 1000 }, { id: A, ageMs: 5 * 60000 }, { id: C, ageMs: 26 * 3600 * 1000 }];
  for (const locale of ['id-ID', 'en-US']) {
    const t = createI18n({ locale }).t;
    const text = sessionsReply(t, A, list);
    assert.match(text, new RegExp('1\. ' + B));
    assert.match(text, new RegExp('3\. ' + C));
    assert.match(text, /claude (lanjut|continue) 1/);
    assert.match(text, new RegExp('claude --resume ' + A));
    assert.doesNotMatch(text, /\{\w+\}/, 'no unfilled placeholder');
    assert.match(sessionsReply(t, null, []), /agent\.|\w/);
    assert.notEqual(sessionsReply(t, null, []), sessionsReply(t, null, list));
    for (const key of ['agent.session_adopted', 'agent.sessions_none', 'agent.age_now', 'agent.age_days']) {
      assert.notEqual(t(key, { id: A, n: 1 }), key, locale + ' is missing ' + key);
    }
    assert.notEqual(t(messageKey('session_not_found')), 'agent.session_not_found');
  }
});
