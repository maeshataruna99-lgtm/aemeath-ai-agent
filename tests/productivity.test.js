'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createProductivityHub, parseDurationMs, formatDuration, MAX_ITEMS } = require('../src/productivity/productivity-hub');
const { createWorkSessionManager } = require('../src/productivity/work-session');
const { createCommandHandler } = require('../src/commands/command-handler');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aemeath-prod-'));
}

test('parseDurationMs and formatDuration handle minutes, seconds, hours and labels', () => {
  assert.deepEqual(parseDurationMs('25'), { ms: 25 * 60 * 1000, label: '' });
  assert.deepEqual(parseDurationMs('25m Fokus ngoding'), { ms: 25 * 60 * 1000, label: 'Fokus ngoding' });
  assert.deepEqual(parseDurationMs('90s Istirahat'), { ms: 90 * 1000, label: 'Istirahat' });
  assert.deepEqual(parseDurationMs('1h 30m Sprint'), { ms: 90 * 60 * 1000, label: 'Sprint' });
  assert.equal(parseDurationMs(''), null);
  assert.equal(parseDurationMs('abc'), null);

  assert.equal(formatDuration(25 * 60 * 1000), '25 menit');
  assert.equal(formatDuration(90 * 1000), '1 menit 30 detik');
});

test('/timer starts, reports status, cancels, and notifies when done', () => {
  let nowMs = 1000000;
  let scheduled = null;
  const doneEvents = [];
  const hub = createProductivityHub({
    dir: tempDir(),
    now: () => nowMs,
    setTimer: (fn, ms) => {
      scheduled = { fn, ms, cleared: false };
      return scheduled;
    },
    clearTimer: (handle) => {
      if (handle) handle.cleared = true;
    },
    onTimerDone: (ev) => doneEvents.push(ev),
  });

  assert.match(hub.runTimer('').text, /Belum ada timer/);
  assert.equal(hub.runTimer('5s').ok, false, 'too short');
  assert.equal(hub.runTimer('500m').ok, false, 'too long');

  const started = hub.runTimer('25m Fokus fitur A');
  assert.equal(started.ok, true);
  assert.equal(hub.timerActive, true);
  assert.equal(scheduled.ms, 25 * 60 * 1000);

  nowMs += 5 * 60 * 1000;
  const status = hub.runTimer('status');
  assert.match(status.text, /sisa 20 menit/);
  assert.match(status.text, /Fokus fitur A/);

  // Firing the timer notifies Aemeath and clears active state
  scheduled.fn();
  assert.equal(hub.timerActive, false);
  assert.equal(doneEvents.length, 1);
  assert.match(doneEvents[0].text, /25 menit \(Fokus fitur A\) sudah selesai/);

  // Pomodoro preset and cancellation
  assert.equal(hub.runTimer('pomodoro').ok, true);
  assert.equal(hub.timerActive, true);
  const cancelled = hub.runTimer('batal');
  assert.equal(cancelled.ok, true);
  assert.equal(hub.timerActive, false);
  assert.equal(scheduled.cleared, true);
});

test('/todo adds, marks done, deletes, cleans up, and persists to disk', () => {
  const dir = tempDir();
  const hub = createProductivityHub({ dir });

  assert.match(hub.runTodo('').text, /masih kosong/);
  const r1 = hub.runTodo('tambah Rapikan modul chat');
  assert.equal(r1.ok, true);
  assert.match(r1.output, /1\. \[ \] Rapikan modul chat/);

  const r2 = hub.runTodo('Tulis unit test baru');
  assert.equal(r2.ok, true);
  assert.equal(hub.todos.length, 2);

  const done = hub.runTodo('selesai 1');
  assert.equal(done.ok, true);
  assert.match(done.output, /1\. \[\u2713\] Rapikan modul chat/);

  // Reload from disk preserves state
  const reloaded = createProductivityHub({ dir });
  assert.equal(reloaded.todos.length, 2);
  assert.equal(reloaded.todos[0].done, true);

  // Complete all todos at once
  reloaded.runTodo('tambah Tugas ketiga');
  const allDone = reloaded.runTodo('selesai semua');
  assert.equal(allDone.ok, true);
  assert.equal(reloaded.todos.every((t) => t.done), true);

  // Clean removes completed items first
  reloaded.runTodo('bersih');
  assert.equal(reloaded.todos.length, 0);
});

test('/note saves, lists, deletes, and enforces the item limit', () => {
  const dir = tempDir();
  const hub = createProductivityHub({ dir });

  assert.match(hub.runNote('').text, /Belum ada catatan/);
  assert.equal(hub.runNote('Cek performa animasi').ok, true);
  assert.equal(hub.runNote('tambah Ide fitur baru').ok, true);
  assert.equal(hub.notes.length, 2);
  assert.match(hub.runNote('lihat').output, /1\. Cek performa animasi\n2\. Ide fitur baru/);

  assert.equal(hub.runNote('hapus 1').ok, true);
  assert.equal(hub.notes.length, 1);

  for (let i = hub.notes.length; i < MAX_ITEMS; i++) {
    assert.equal(hub.runNote('catatan ' + i).ok, true);
  }
  assert.equal(hub.runNote('kelebihan').ok, false);
  assert.equal(hub.runNote('bersih').ok, true);
  assert.equal(hub.notes.length, 0);

  // Sensitive keys (e.g. DeepSeek API keys) are rejected from plaintext /note and /todo
  const secretNote = hub.runNote('sk-deepseeksecretkey123456');
  assert.equal(secretNote.ok, false);
  assert.match(secretNote.text, /Pengaturan/);
  const secretTodo = hub.runTodo('tambah DEEPSEEK_API_KEY=sk-1234567890abcdef');
  assert.equal(secretTodo.ok, false);
  assert.equal(hub.notes.length, 0);
  assert.equal(hub.todos.length, 0);
});

test('/stats and commandHandler integration work end-to-end', async () => {
  const dir = tempDir();
  const hub = createProductivityHub({
    dir,
    getActivitySummary: () => 'ngoding 42 menit, web 10 menit',
  });
  const handler = createCommandHandler({
    getCommands: () => [],
    run: async () => ({ ok: true }),
    builtins: hub.asBuiltins(),
  });

  await handler.handle('/todo tambah Selesaikan semua fitur');
  await handler.handle('/note Simpan ide shortcut');
  await handler.handle('/timer 15m Review kode');

  const stats = await handler.handle('/stats');
  assert.equal(stats.isCommand, true);
  assert.equal(stats.ok, true);
  assert.match(stats.output, /Timer aktif: sisa 15 menit \(Review kode\)/);
  assert.match(stats.output, /Tugas \(\/todo\): 1 belum selesai, 0 selesai/);
  assert.match(stats.output, /Catatan \(\/note\): 1 tersimpan/);
  assert.match(stats.output, /ngoding 42 menit, web 10 menit/);
  hub.stop();
});

test('orchestrated work session integration: /todo fokus, /focus status, and /focus selesai', async () => {
  const dir = tempDir();
  let nowMs = 1000000;
  let finishedSummary = null;
  const workSession = createWorkSessionManager({
    now: () => nowMs,
    onSessionFinished: (f) => {
      finishedSummary = f;
    },
  });

  const hub = createProductivityHub({
    dir,
    now: () => nowMs,
    workSession: workSession,
  });

  const handler = createCommandHandler({
    getCommands: () => [],
    run: async () => ({ ok: true }),
    builtins: hub.asBuiltins(),
  });

  // 1. Add todo and start focus on it
  await handler.handle('/todo tambah Rapikan dokumentasi');
  const fokusRes = await handler.handle('/todo fokus 1');
  assert.equal(fokusRes.ok, true);
  assert.match(fokusRes.text, /Rapikan dokumentasi/);
  assert.equal(hub.timerActive, true);
  assert.equal(workSession.active, true);
  assert.equal(workSession.current().task, 'Rapikan dokumentasi');

  // 2. /focus status reports current task and remaining time
  nowMs += 10 * 60 * 1000; // 10 minutes pass
  const statusRes = await handler.handle('/focus status');
  assert.equal(statusRes.ok, true);
  assert.match(statusRes.text, /Rapikan dokumentasi/);
  assert.match(statusRes.text, /15 menit/);

  // 3. /focus selesai finishes session and produces summary
  const finishRes = await handler.handle('/focus selesai');
  assert.equal(finishRes.ok, true);
  assert.equal(hub.timerActive, false);
  assert.equal(workSession.active, false);
  assert.ok(finishedSummary);
  assert.equal(finishedSummary.task, 'Rapikan dokumentasi');
  assert.match(finishRes.text, /Ringkasan Sesi Kerja/);
  assert.match(finishRes.text, /10 menit/);
});

