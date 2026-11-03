'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseLine, createStreamParser } = require('../src/agent/claude-stream');

const SID = '899bd7ff-d492-4139-bc28-c557401c0044';
const line = (obj) => JSON.stringify(Object.assign({ session_id: SID }, obj));

function run(lines) {
  const feed = createStreamParser();
  return lines.map(feed).filter(Boolean);
}

test('parseLine ignores junk and non-objects', () => {
  assert.equal(parseLine(''), null);
  assert.equal(parseLine('not json'), null);
  assert.equal(parseLine('123'), null);
  assert.equal(parseLine('{"no":"type"}'), null);
  assert.equal(parseLine(undefined), null);
  assert.equal(parseLine('{"type":"system"}').type, 'system');
});

test('a normal turn yields session, text, done and skips noise', () => {
  const events = run([
    line({ type: 'system', subtype: 'hook_started' }),
    line({ type: 'system', subtype: 'init' }),
    line({ type: 'assistant', message: { model: 'm', content: [{ type: 'thinking', thinking: '' }] } }),
    line({ type: 'assistant', message: { model: 'm', content: [{ type: 'text', text: 'ok' }] } }),
    line({ type: 'rate_limit_event' }),
    line({ type: 'user', message: { content: [{ type: 'tool_result' }] } }),
    line({ type: 'result', subtype: 'success', result: 'ok' }),
  ]);
  assert.deepEqual(
    events.map((e) => e.kind),
    ['session', 'text', 'done']
  );
  assert.equal(events[1].text, 'ok');
  assert.equal(events[2].text, 'ok');
  assert.equal(events[2].sessionId, SID);
});

test('tool use is reported by tool name', () => {
  const [event] = run([
    line({ type: 'assistant', message: { model: 'm', content: [{ type: 'tool_use', id: 't1', name: 'Skill' }] } }),
  ]);
  assert.deepEqual(event, { kind: 'tool', sessionId: SID, names: ['Skill'] });
});

test('a failed login is one failure, not a success', () => {
  const events = run([
    line({ type: 'system', subtype: 'init' }),
    line({
      type: 'assistant',
      error: 'authentication_failed',
      message: { model: '<synthetic>', content: [{ type: 'text', text: 'Failed to authenticate: OAuth session expired' }] },
    }),
    line({ type: 'result', subtype: 'success', result: 'Failed to authenticate: OAuth session expired' }),
  ]);
  assert.deepEqual(
    events.map((e) => e.kind),
    ['session', 'failed']
  );
  assert.equal(events[1].reason, 'auth');
});

test('a synthetic assistant message without an error field still fails', () => {
  const [event] = run([
    line({ type: 'assistant', message: { model: '<synthetic>', content: [{ type: 'text', text: 'boom' }] } }),
  ]);
  assert.equal(event.kind, 'failed');
  assert.equal(event.reason, 'api');
});

test('max turns is a failure with its own reason', () => {
  const [event] = run([line({ type: 'result', subtype: 'error_max_turns' })]);
  assert.equal(event.kind, 'failed');
  assert.equal(event.reason, 'max_turns');
});

test('is_error on a success result is a failure', () => {
  const [event] = run([line({ type: 'result', subtype: 'success', is_error: true, result: 'x' })]);
  assert.equal(event.kind, 'failed');
});

test('a failure does not leak into the next turn of the same process', () => {
  const events = run([
    line({ type: 'assistant', error: 'authentication_failed', message: { model: '<synthetic>', content: 'nope' } }),
    line({ type: 'result', subtype: 'success', result: 'nope' }),
    line({ type: 'assistant', message: { model: 'm', content: [{ type: 'text', text: 'hi' }] } }),
    line({ type: 'result', subtype: 'success', result: 'hi' }),
  ]);
  assert.deepEqual(
    events.map((e) => e.kind),
    ['failed', 'text', 'done']
  );
});
