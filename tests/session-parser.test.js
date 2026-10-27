'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const parser = require('../src/session-parser');

function feedFile(tracker, file) {
  const emissions = [];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const event = parser.parseLine(line);
    if (!event) continue;
    emissions.push(...parser.feedEvent(tracker, event, Date.now()));
  }
  return emissions;
}

test('parseLine handles junk and the observed desktop-app lines', () => {
  assert.equal(parser.parseLine(''), null);
  assert.equal(parser.parseLine('not json'), null);
  assert.equal(parser.parseLine('123'), null);

  const open = parser.parseLine(JSON.stringify({ type: 'bridge-session', sessionId: 'abc' }));
  assert.equal(open.kind, 'session-open');

  const enqueue = parser.parseLine(
    JSON.stringify({ type: 'queue-operation', operation: 'enqueue', content: 'halo' }),
  );
  assert.equal(enqueue.kind, 'user-message');
  assert.equal(enqueue.text, 'halo');

  const dequeue = parser.parseLine(
    JSON.stringify({ type: 'queue-operation', operation: 'dequeue' }),
  );
  assert.equal(dequeue, null);
});

test('a finished turn emits turn-finished with the last assistant text', () => {
  const tracker = parser.createTracker('s1', 'some-munged-dir');
  const emissions = feedFile(tracker, path.join(__dirname, 'fixtures', 'session-ok.jsonl'));
  const started = emissions.filter((e) => e.type === 'turn-started');
  assert.equal(started.length, 1);
  const finished = emissions.find((e) => e.type === 'turn-finished');
  assert.ok(finished, 'turn-finished emitted');
  assert.equal(finished.projectName, 'aemeath-ai-agent');
  assert.match(finished.summary, /Semua tes lulus/);
  assert.equal(tracker.state, 'finished');
});

test('an API error marks the turn as failed', () => {
  const tracker = parser.createTracker('s2', 'dir');
  const emissions = feedFile(tracker, path.join(__dirname, 'fixtures', 'session-error.jsonl'));
  const failed = emissions.find((e) => e.type === 'turn-failed');
  assert.ok(failed, 'turn-failed emitted');
  assert.match(failed.summary, /500/);
  assert.equal(tracker.state, 'failed');
});

test('tool results, meta lines and attachments do not start turns', () => {
  const tracker = parser.createTracker('s3', 'dir');
  const emissions = feedFile(tracker, path.join(__dirname, 'fixtures', 'session-noise.jsonl'));
  assert.equal(emissions.filter((e) => e.type === 'turn-started').length, 1);
  assert.equal(emissions.filter((e) => e.type === 'turn-finished').length, 0);
});

test('summarize flattens and caps length', () => {
  assert.equal(parser.summarize('  a\n b  '), 'a b');
  const long = 'x'.repeat(400);
  assert.equal(parser.summarize(long).length, 280);
  assert.equal(parser.summarize(long).endsWith('...'), true);
});

test('Antigravity transcript lines (USER_INPUT and PLANNER_RESPONSE) are parsed and tracked', () => {
  const tracker = parser.createTracker('conv-1', 'antigravity');
  const lines = [
    JSON.stringify({
      step_index: 1,
      type: 'USER_INPUT',
      status: 'DONE',
      cwd: 'C:\\Users\\Cinder\\IdeaProjects\\aemeth-ai-agent',
      content: '<USER_REQUEST>\nbuat fitur baru\n</USER_REQUEST>',
    }),
    JSON.stringify({
      step_index: 2,
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      content: 'Sedang bertanya...',
      tool_calls: [{ id: 'call-1', name: 'default_api:ask_question', args: { questions: [{ question: 'Pilih opsi A atau B?' }] } }],
    }),
    JSON.stringify({
      step_index: 3,
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      content: 'Fitur selesai dibuat.',
      tool_calls: [],
    }),
  ];
  const emissions = [];
  for (const line of lines) {
    const ev = parser.parseLine(line);
    if (ev) emissions.push(...parser.feedEvent(tracker, ev, 1000));
  }
  assert.deepEqual(
    emissions.map((e) => e.type),
    ['turn-started', 'decision-requested', 'decision-resolved', 'turn-finished'],
  );
  assert.equal(emissions[1].summary, 'Pilih opsi A atau B?');
  assert.equal(emissions[3].projectName, 'aemeth-ai-agent');
  assert.equal(emissions[3].cwd, 'C:\\Users\\Cinder\\IdeaProjects\\aemeth-ai-agent');
});
