'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { formatDailyChronicle } = require('../src/productivity/daily-chronicle');
const { createProductivityHub } = require('../src/productivity/productivity-hub');
const { createWorkSessionManager } = require('../src/productivity/work-session');
const { createCommandHandler } = require('../src/commands/command-handler');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aemeath-chronicle-'));
}

test('daily chronicle when disabled reports inactive without fabricated numbers', () => {
  const result = formatDailyChronicle({
    enabled: false,
    activitySummary: '50m coding',
    sessions: [{ task: 'Ngoding', elapsedMs: 1500000 }],
  });

  assert.equal(result.enabled, false);
  assert.match(result.text, /nonaktif/i);
  // Must NOT output statistics when disabled
  assert.doesNotMatch(result.text, /=== Daily Chronicle ===/);
});

test('daily chronicle strictly reports verified local facts: focus time, activity, and remaining quests/todos', () => {
  const chronicle = formatDailyChronicle({
    enabled: true,
    date: '2026-10-28',
    activitySummary: '45m coding (VS Code), 15m browsing',
    sessions: [
      { task: 'Implementasi modul Daily Chronicle', elapsedMs: 25 * 60 * 1000 },
      { task: 'Refactor lorebook metadata', elapsedMs: 15 * 60 * 1000 },
    ],
    quests: [
      { text: 'Selesaikan P3.3 Daily Chronicle', done: false },
      { text: 'Review PR migrasi lorebook', done: true },
    ],
    todos: [
      { text: 'Update dokumentasi README', done: false },
      { text: 'Deploy staging', done: true },
    ],
  });

  assert.equal(chronicle.enabled, true);
  assert.match(chronicle.text, /=== Daily Chronicle ===/);
  assert.match(chronicle.text, /Tanggal: 2026-10-28/);

  // Focus sessions and duration
  assert.match(chronicle.text, /Total sesi fokus \(2 sesi\): 40 menit/);
  assert.match(chronicle.text, /Implementasi modul Daily Chronicle/);

  // Activity summary
  assert.match(chronicle.text, /45m coding \(VS Code\), 15m browsing/);

  // Remaining tasks & quests
  assert.match(chronicle.text, /Daily Quest: 1 selesai, 1 tersisa/);
  assert.match(chronicle.text, /Selesaikan P3.3 Daily Chronicle/);
  assert.match(chronicle.text, /Tugas tertunda \(\/todo\): 1 item/);
  assert.match(chronicle.text, /Update dokumentasi README/);

  // Must NOT invent ungrounded scores, ratings, or punishment metrics
  assert.doesNotMatch(chronicle.text, /skor|score|poin|rating|level|hukuman|produktivitas: \d+%/i);
});

test('/chronicle command in productivity hub integrates with settings and can be toggled', async () => {
  const dir = tempDir();
  let chronicleEnabled = true;

  const workSession = createWorkSessionManager({ now: () => 10000 });
  workSession.start({ task: 'Sesi TDD Chronicle', durationMs: 25 * 60 * 1000 });
  workSession.finish();

  const hub = createProductivityHub({
    dir,
    workSession: workSession,
    getActivitySummary: () => '30m coding',
    getChronicleEnabled: () => chronicleEnabled,
    setChronicleEnabled: (val) => {
      chronicleEnabled = val;
    },
  });

  const handler = createCommandHandler({
    getCommands: () => [],
    run: async () => ({ ok: true }),
    builtins: hub.asBuiltins(),
  });

  // 1. Run chronicle command when active
  const resActive = await handler.handle('/chronicle');
  assert.equal(resActive.ok, true);
  assert.match(resActive.output, /=== Daily Chronicle ===/);
  assert.match(resActive.output, /Sesi TDD Chronicle/);

  // 2. Toggle off
  const resOff = await handler.handle('/chronicle nonaktif');
  assert.equal(resOff.ok, true);
  assert.equal(chronicleEnabled, false);
  assert.match(resOff.text, /dinonaktifkan/i);

  // 3. Running while off informs user gently
  const resWhileOff = await handler.handle('/chronicle');
  assert.equal(resWhileOff.ok, true);
  assert.match(resWhileOff.text, /nonaktif/i);

  // 4. Toggle on
  const resOn = await handler.handle('/chronicle aktif');
  assert.equal(resOn.ok, true);
  assert.equal(chronicleEnabled, true);
});
