'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const parser = require('../src/session-parser');
const { createClaudeCodeProvider } = require('../src/claude-code-provider');

function assistantToolUse(id, name, input, extra) {
  return JSON.stringify(
    Object.assign(
      {
        type: 'assistant',
        cwd: 'C:\\work\\demo',
        message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use' },
      },
      extra,
    ),
  );
}

function toolResult(id) {
  return JSON.stringify({
    type: 'user',
    cwd: 'C:\\work\\demo',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
  });
}

function run(lines) {
  const tracker = parser.createTracker('s1', 'C--work-demo');
  const out = [];
  for (const line of lines) {
    const event = parser.parseLine(line);
    if (event) out.push(...parser.feedEvent(tracker, event, 1000));
  }
  return { tracker, out };
}

const ask = (id) => assistantToolUse(id, 'AskUserQuestion', { questions: [{ question: 'Pakai Redis atau Postgres?' }] });

test('unanswered AskUserQuestion requests a decision with the question text', () => {
  const { tracker, out } = run([ask('t1')]);
  assert.deepEqual(
    out.map((e) => e.type),
    ['turn-started', 'decision-requested'],
  );
  assert.equal(out[1].summary, 'Pakai Redis atau Postgres?');
  assert.equal(out[1].projectName, 'demo');
  assert.equal(tracker.pendingDecision.id, 't1');
});

test('ExitPlanMode is treated as a pending decision', () => {
  const { out } = run([assistantToolUse('t2', 'ExitPlanMode', { plan: 'x' })]);
  assert.equal(out[out.length - 1].type, 'decision-requested');
});

test('the matching tool_result resolves the decision, others do not', () => {
  const { tracker, out } = run([ask('t1'), toolResult('other'), toolResult('t1')]);
  assert.deepEqual(
    out.map((e) => e.type),
    ['turn-started', 'decision-requested', 'decision-resolved'],
  );
  assert.equal(tracker.pendingDecision, null);
  assert.equal(tracker.state, 'running');
});

test('finishing the turn clears a pending decision', () => {
  const finish = JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text: 'selesai' }], stop_reason: 'end_turn' },
  });
  const { tracker, out } = run([ask('t1'), finish]);
  assert.deepEqual(
    out.map((e) => e.type),
    ['turn-started', 'decision-requested', 'decision-resolved', 'turn-finished'],
  );
  assert.equal(tracker.pendingDecision, null);
});

test('ordinary tools and subagent lines never request a decision', () => {
  const { out } = run([
    assistantToolUse('t3', 'Bash', { command: 'ls' }),
    assistantToolUse('t4', 'AskUserQuestion', { questions: [] }, { isSidechain: true }),
  ]);
  assert.ok(!out.some((e) => e.type === 'decision-requested'));
});

test('provider counts live pending decisions and ignores history', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aemeath-decision-'));
  const dir = path.join(root, 'C--work-demo');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'session.jsonl');
  fs.writeFileSync(file, ask('old') + '\n'); // history: must stay silent

  const events = [];
  const provider = createClaudeCodeProvider({ projectsDir: root, onEvent: (e) => events.push(e) });
  provider.start();
  try {
    assert.equal(provider.pendingDecisionCount(), 0);
    fs.appendFileSync(file, ask('live') + '\n');
    await waitFor(() => provider.pendingDecisionCount() === 1);
    assert.ok(events.some((e) => e.type === 'decision-requested'));
    fs.appendFileSync(file, toolResult('live') + '\n');
    await waitFor(() => provider.pendingDecisionCount() === 0);
    assert.ok(events.some((e) => e.type === 'decision-resolved'));
  } finally {
    provider.stop();
  }
});

function waitFor(predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('timeout waiting for condition'));
      }
    }, 50);
  });
}
