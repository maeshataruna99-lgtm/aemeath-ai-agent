'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createProductivityHub,
  MAX_QUESTS,
  FILE_NAME,
} = require('../src/productivity/productivity-hub');
const { createCommandHandler } = require('../src/commands/command-handler');

const DAY_MS = 24 * 60 * 60 * 1000;

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aemeath-daily-'));
}

test('legacy productivity.json migrates safely without losing todos or notes', () => {
  const dir = tempDir();
  const legacyData = {
    todos: [
      { text: 'Tugas lama 1', done: false },
      { text: 'Tugas lama 2', done: true },
    ],
    notes: [{ text: 'Catatan lama 1' }],
  };
  fs.writeFileSync(path.join(dir, FILE_NAME), JSON.stringify(legacyData, null, 2));

  const hub = createProductivityHub({ dir });
  assert.equal(hub.todos.length, 2);
  assert.equal(hub.todos[0].text, 'Tugas lama 1');
  assert.equal(hub.notes.length, 1);
  assert.equal(hub.notes[0].text, 'Catatan lama 1');

  // Daily quests initialized safely
  assert.deepEqual(hub.quests, []);
});

test('daily quests enforce max 3 items, link to todo, and track completion without penalty scores', async () => {
  const dir = tempDir();
  let clock = new Date('2026-10-28T09:00:00Z').getTime();

  const hub = createProductivityHub({
    dir,
    now: () => clock,
  });

  const handler = createCommandHandler({
    getCommands: () => [],
    run: async () => ({ ok: true }),
    builtins: hub.asBuiltins(),
  });

  // 1. Initial list is empty
  const emptyRes = await handler.handle('/quest');
  assert.match(emptyRes.text, /belum ada daily quest/i);

  // 2. Add quests up to max 3
  const q1 = await handler.handle('/quest tambah Rilis modul focus');
  assert.equal(q1.ok, true);
  assert.equal(hub.quests.length, 1);

  const q2 = await handler.handle('/quest tambah Tulis tes integrasi');
  assert.equal(q2.ok, true);

  // Add a todo item first, then link it as 3rd quest
  await handler.handle('/todo tambah Review git diff');
  const q3 = await handler.handle('/quest todo 1');
  assert.equal(q3.ok, true);
  assert.equal(hub.quests.length, 3);
  assert.equal(hub.quests[2].todoText, 'Review git diff');

  // 3. 4th quest is refused gently to preserve focus
  const q4 = await handler.handle('/quest tambah Tugas berlebih');
  assert.equal(q4.ok, false);
  assert.match(q4.text, /maksimal 3|batas 3/i);
  assert.equal(hub.quests.length, 3);

  // 4. Mark quest completed manually
  const doneRes = await handler.handle('/quest selesai 1');
  assert.equal(doneRes.ok, true);
  assert.equal(hub.quests[0].done, true);
  // No guilt-tripping scores or penalty points
  assert.doesNotMatch(doneRes.text, /poin|skor|hukuman|gagal/i);

  // 5. Marking linked todo completed also completes the quest
  await handler.handle('/todo selesai 1');
  assert.equal(hub.quests[2].done, true);

  // 6. Marking all quests completed at once
  const allDoneRes = await handler.handle('/quest selesai semua');
  assert.equal(allDoneRes.ok, true);
  assert.equal(hub.quests.every((q) => q.done), true);
});

test('day change preserves unclosed quests and archives completed ones into history', () => {
  const dir = tempDir();
  let clock = new Date('2026-10-28T10:00:00Z').getTime();

  const firstHub = createProductivityHub({
    dir,
    now: () => clock,
  });

  firstHub.runQuest('tambah Prioritas yang belum selesai');
  firstHub.runQuest('tambah Prioritas yang sudah selesai');
  firstHub.runQuest('selesai 2');

  assert.equal(firstHub.quests.length, 2);
  assert.equal(firstHub.quests[0].done, false);
  assert.equal(firstHub.quests[1].done, true);

  // Fast forward clock by 1 day (next morning)
  clock += DAY_MS;

  const nextDayHub = createProductivityHub({
    dir,
    now: () => clock,
  });

  // Unfinished quest must NOT be deleted
  assert.equal(nextDayHub.quests.length, 1, 'uncompleted quest rolls over to the new day');
  assert.equal(nextDayHub.quests[0].text, 'Prioritas yang belum selesai');
  assert.equal(nextDayHub.quests[0].done, false);

  // History contains the previous day record
  assert.equal(nextDayHub.questHistory.length, 1);
  assert.equal(nextDayHub.questHistory[0].quests.length, 2);
});
