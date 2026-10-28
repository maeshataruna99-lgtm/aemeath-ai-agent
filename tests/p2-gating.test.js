'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createSettingsStore } = require('../src/settings');
const { createMemoryStore, CONTINUATION_GAP_MS } = require('../src/memory/memory-store');
const { createProductivityHub } = require('../src/productivity/productivity-hub');
const { createWorkSessionManager } = require('../src/productivity/work-session');
const { createBehaviorDirector, PRIORITY } = require('../src/behavior/behavior-director');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aemeath-gating-'));
}

test('P2 Gating - Low Mode keeps tools manual without proactive sessions or memory prompts', () => {
  const dir = tempDir();
  const settingsStore = createSettingsStore(dir);
  const settings = settingsStore.save({ interactiveMode: 'low' });
  assert.equal(settings.interactiveMode, 'low');

  const memoryStore = createMemoryStore({ dir, now: () => 1000 });
  memoryStore.remember({ text: 'Tugas tertunda di modul auth', kind: 'task', project: 'my-project' });

  // 1. Proactive continuation is completely blocked in Low mode
  assert.equal(memoryStore.continuation('low'), null);

  // 2. Productivity tools are strictly manual and functional
  const hub = createProductivityHub({
    dir,
    getActivitySummary: () => null, // Low mode produces no activity summary
  });
  const todoRes = hub.runTodo('tambah Buat endpoint baru');
  assert.equal(todoRes.ok, true);
  assert.equal(hub.todos.length, 1);

  const questRes = hub.runQuest('tambah Selesaikan schema DB');
  assert.equal(questRes.ok, true);
  assert.equal(hub.quests.length, 1);

  const statsRes = hub.runStats();
  assert.match(statsRes.output, /nyalakan mode interaktif Medium/i);

  // 3. Behavior director drops desktop activity remarks in Low mode
  const director = createBehaviorDirector({ mode: 'low', now: () => 1000 });
  const decision = director.submit({ kind: 'activity-remark', category: 'coding', text: 'Rover sedang ngoding' }, 1000);
  assert.equal(decision.action, 'drop');
  assert.equal(decision.reason, 'mode');
});

test('P2 Gating - Medium Mode enables activity tracking, work reminders, and respects cooldowns', () => {
  const dir = tempDir();
  let clock = 10000;
  const memoryStore = createMemoryStore({ dir, now: () => clock });
  memoryStore.remember({ text: 'Implementasi caching Redis', kind: 'next-step', project: 'backend-api' });

  // 1. Continuation and resume work is offered in Medium mode
  const offer = memoryStore.continuation('medium');
  assert.ok(offer);
  assert.equal(offer.actionable, true);
  assert.match(offer.text, /langkah berikutnya/i);
  assert.match(offer.text, /caching Redis/i);

  // 2. Respects frequency cooldown
  assert.equal(memoryStore.continuation('medium'), null, 'blocked by cooldown');

  // 3. Activity summary is surfaced in /stats
  const hub = createProductivityHub({
    dir,
    getActivitySummary: () => '45m coding (VS Code), 10m browsing',
  });
  const statsRes = hub.runStats();
  assert.match(statsRes.output, /Aktivitas sesi ini \(Medium\): 45m coding/i);

  // 4. Behavior director allows desktop activity remarks
  const director = createBehaviorDirector({ mode: 'medium', now: () => clock });
  const decision = director.submit({ kind: 'activity-remark', category: 'coding', text: 'Rover sedang ngoding' }, clock);
  assert.equal(decision.action, 'show');
});

test('P2 Gating - Full Mode connects work session, git review, AI events, and requires explicit user consent before storing session memories', () => {
  const dir = tempDir();
  let clock = 20000;
  const settingsStore = createSettingsStore(dir);

  // 1. Full mode requires explicit fullConsent
  const deniedSettings = settingsStore.save({ interactiveMode: 'full', fullConsent: false });
  assert.equal(deniedSettings.interactiveMode, 'low');

  const grantedSettings = settingsStore.save({ interactiveMode: 'full', fullConsent: true });
  assert.equal(grantedSettings.interactiveMode, 'full');

  // 2. Orchestrated work session collects facts without fabrication
  const workSession = createWorkSessionManager({ now: () => clock });
  workSession.start({ task: 'Optimasi performa query database', durationMs: 25 * 60 * 1000 });
  workSession.recordAiEvent({ type: 'turn-finished', summary: 'Menambahkan index btree' });
  workSession.recordReview({ filesCount: 2, summaryText: '2 berkas diubah' });

  clock += 25 * 60 * 1000;
  const finished = workSession.finish();
  assert.ok(finished);
  assert.match(finished.summaryText, /Optimasi performa query database/);
  assert.match(finished.summaryText, /Menambahkan index btree/);
  assert.match(finished.summaryText, /2 berkas diubah/);

  // 3. Proposing session memory does NOT write to disk without user consent
  const memoryStore = createMemoryStore({ dir, now: () => clock });
  const sessionOffer = memoryStore.proposeSession({
    project: 'db-optimizer',
    summary: finished.summaryText,
    nextStep: 'Jalankan explain analyze pada query reporting',
  });
  assert.ok(sessionOffer);
  assert.equal(sessionOffer.actionable, true);

  // Verify memory store is still empty before acceptance
  assert.equal(memoryStore.list().length, 0);

  // 4. Only after explicit acceptance is the session committed to memory
  const acceptRes = memoryStore.acceptOffer(sessionOffer.id);
  assert.equal(acceptRes.ok, true);
  assert.equal(memoryStore.list().length, 2); // summary context + next-step
  assert.ok(memoryStore.list().some((m) => /explain analyze/i.test(m.text)));
  assert.ok(memoryStore.list().some((m) => /Optimasi performa query database/i.test(m.text)));
});
