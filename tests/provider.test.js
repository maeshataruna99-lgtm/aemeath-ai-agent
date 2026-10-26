'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createClaudeCodeProvider } = require('../src/claude-code-provider');

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

test('provider reports live turns and stays silent about history', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aemeth-provider-'));
  const projectDir = path.join(root, 'C--work-demo');
  fs.mkdirSync(projectDir, { recursive: true });
  const file = path.join(projectDir, 'session.jsonl');

  // History: one completed turn that must not produce events at startup.
  fs.writeFileSync(
    file,
    [
      JSON.stringify({ type: 'user', cwd: 'C:\\work\\demo', message: { role: 'user', content: 'lama' } }),
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'selesai lama' }],
          stop_reason: 'end_turn',
        },
      }),
    ].join('\n') + '\n',
  );

  const events = [];
  const provider = createClaudeCodeProvider({
    projectsDir: root,
    onEvent: (event) => events.push(event),
  });
  provider.start();

  try {
    assert.equal(provider.activeSessionCount(), 0, 'history produces no running session');

    const append = (obj) => fs.appendFileSync(file, JSON.stringify(obj) + '\n');

    append({ type: 'user', cwd: 'C:\\work\\demo', message: { role: 'user', content: 'buat fitur baru' } });
    await waitFor(() => events.some((e) => e.type === 'turn-started'));
    assert.equal(provider.activeSessionCount(), 1);

    append({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Fitur selesai dibuat.' }],
        stop_reason: 'end_turn',
      },
    });
    await waitFor(() => events.some((e) => e.type === 'turn-finished'));

    const finished = events.find((e) => e.type === 'turn-finished');
    assert.equal(finished.projectName, 'demo');
    assert.match(finished.summary, /Fitur selesai dibuat/);
    assert.equal(provider.activeSessionCount(), 0);
  } finally {
    provider.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
