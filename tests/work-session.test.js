'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createWorkSessionManager,
  formatSessionSummary,
} = require('../src/productivity/work-session');

test('work session lifecycle: start, track, and finish', () => {
  let clock = 1000;
  const manager = createWorkSessionManager({ now: () => clock });

  assert.equal(manager.active, false);
  assert.equal(manager.current(), null);

  // 1. Start a session with task and timer
  const session = manager.start({
    task: 'Implementasi modul work-session',
    durationMs: 25 * 60 * 1000,
    project: 'aemeath-ai-agent',
  });

  assert.equal(manager.active, true);
  assert.equal(session.task, 'Implementasi modul work-session');
  assert.equal(session.project, 'aemeath-ai-agent');
  assert.equal(session.durationMs, 25 * 60 * 1000);
  assert.equal(session.startedAt, 1000);

  // 2. State reported for presence
  const presence = manager.presenceState();
  assert.equal(presence.active, true);
  assert.equal(presence.task, 'Implementasi modul work-session');
  assert.equal(presence.project, 'aemeath-ai-agent');

  // 3. Record AI session events during work
  manager.recordAiEvent({
    type: 'turn-finished',
    summary: 'Refactor test suite',
    sessionId: 'sess-1',
  });
  assert.equal(manager.current().aiEvents.length, 1);

  // 4. Record local review result
  manager.recordReview({
    summary: '3 berkas berubah, 0 rahasia bocor',
    filesChanged: 3,
  });
  assert.ok(manager.current().review);

  // 5. Advance clock and finish
  clock += 20 * 60 * 1000; // 20 minutes elapsed
  const finished = manager.finish();

  assert.equal(manager.active, false);
  assert.equal(manager.current(), null);
  assert.equal(finished.elapsedMs, 20 * 60 * 1000);
  assert.equal(finished.task, 'Implementasi modul work-session');

  // Summary includes facts that are present
  assert.match(finished.summaryText, /Implementasi modul work-session/);
  assert.match(finished.summaryText, /20 menit/);
  assert.match(finished.summaryText, /Refactor test suite/);
  assert.match(finished.summaryText, /3 berkas berubah/);
});

test('summary never invents unavailable facts and marks missing data honestly', () => {
  let clock = 1000;
  const manager = createWorkSessionManager({ now: () => clock });

  // Start with no task, no timer, no project
  manager.start({});
  clock += 5 * 60 * 1000; // 5 minutes elapsed

  const finished = manager.finish();
  const summary = finished.summaryText;

  // Facts available: duration
  assert.match(summary, /5 menit/);

  // Missing facts are explicitly marked, never hallucinated
  assert.match(summary, /\[Tugas: tidak ditentukan\]/);
  assert.match(summary, /\[Sesi AI: tidak ada aktivitas\]/);
  assert.match(summary, /\[Review git: belum dijalankan\]/);
  assert.match(summary, /\[Hasil tes: tidak ada data tes terverifikasi\]/);
  assert.match(summary, /\[Status commit: tidak ada commit terverifikasi\]/);
});

test('starting a new session while one is active safely closes the previous one', () => {
  let clock = 1000;
  const manager = createWorkSessionManager({ now: () => clock });

  manager.start({ task: 'Tugas pertama' });
  clock += 10 * 60 * 1000;

  // Start second session
  const second = manager.start({ task: 'Tugas kedua' });
  assert.equal(manager.current().id, second.id);
  assert.equal(manager.current().task, 'Tugas kedua');

  // History contains the first closed session
  assert.equal(manager.history.length, 1);
  assert.equal(manager.history[0].task, 'Tugas pertama');
  assert.equal(manager.history[0].elapsedMs, 10 * 60 * 1000);
});

test('cancel aborts the active session without saving to history', () => {
  const manager = createWorkSessionManager();
  manager.start({ task: 'Tugas dibatalkan' });
  assert.equal(manager.active, true);

  const cancelled = manager.cancel();
  assert.equal(cancelled.ok, true);
  assert.equal(manager.active, false);
  assert.equal(manager.current(), null);
  assert.equal(manager.history.length, 0);

  // Cancelling when none active is safe
  assert.equal(manager.cancel().ok, false);
});
