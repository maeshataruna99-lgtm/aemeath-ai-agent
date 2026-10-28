'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createMemoryStore, CONTINUATION_GAP_MS } = require('../src/memory/memory-store');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aemeath-resume-'));
}

test('continuation presents last project, pending task, and next step when available', () => {
  const dir = tempDir();
  let clock = 10000;
  const store = createMemoryStore({ dir, now: () => clock });

  // Store project, task, and next-step
  store.remember({ text: 'Pengembangan Aemeath AI Agent', kind: 'project', project: 'aemeath-ai' });
  clock += 100;
  store.remember({ text: 'Selesaikan implementasi Focus Companion', kind: 'task', project: 'aemeath-ai' });
  clock += 100;
  store.remember({ text: 'Jalankan pengujian integrasi resume work', kind: 'next-step', project: 'aemeath-ai' });

  // Low mode is silent
  assert.equal(store.continuation('low'), null);

  // Medium / Full mode offers continuation
  const offer = store.continuation('medium');
  assert.ok(offer);
  assert.equal(offer.actionable, true);
  assert.equal(offer.offerType, 'continuation');

  // Must mention project, pending task, and next step
  assert.match(offer.text, /aemeath-ai/i);
  assert.match(offer.text, /Pengembangan Aemeath AI Agent|Focus Companion/i);
  assert.match(offer.text, /langkah berikutnya/i);
  assert.match(offer.text, /pengujian integrasi resume work/i);

  // Must offer 3 explicit choices: lanjut, ubah, abaikan
  assert.ok(Array.isArray(offer.actions));
  const actionIds = offer.actions.map((a) => a.id);
  assert.deepEqual(actionIds, ['resume', 'modify', 'dismiss']);
});

test('resume work choices (lanjut, ubah, abaikan) work safely without launching system actions', () => {
  const dir = tempDir();
  let clock = 20000;
  const store = createMemoryStore({ dir, now: () => clock });

  store.remember({ text: 'Refactor modul chat', kind: 'next-step', project: 'aemeath-core' });

  // 1. Choice: "resume" (Lanjut)
  const offer1 = store.continuation('medium');
  assert.ok(offer1);
  const resumeRes = store.answerContinuation(offer1.id, 'resume');
  assert.equal(resumeRes.ok, true);
  assert.equal(resumeRes.choice, 'resume');
  assert.match(resumeRes.text, /lanjut|semangat/i);
  // Ensure no command line or executable execution is embedded in the response
  assert.equal(resumeRes.spawnCommand, undefined);
  assert.equal(resumeRes.openFile, undefined);

  // Advance time past cooldown
  clock += CONTINUATION_GAP_MS + 1000;

  // 2. Choice: "modify" (Ubah)
  const offer2 = store.continuation('full');
  assert.ok(offer2);
  const modifyRes = store.answerContinuation(offer2.id, 'modify');
  assert.equal(modifyRes.ok, true);
  assert.equal(modifyRes.choice, 'modify');
  assert.equal(modifyRes.openChat, true);
  assert.match(modifyRes.text, /ubah|rencana|tugas/i);
  assert.equal(modifyRes.spawnCommand, undefined);

  // Advance time past cooldown
  clock += CONTINUATION_GAP_MS + 1000;

  // 3. Choice: "dismiss" (Abaikan)
  const offer3 = store.continuation('medium');
  assert.ok(offer3);
  const dismissRes = store.answerContinuation(offer3.id, 'dismiss');
  assert.equal(dismissRes.ok, true);
  assert.equal(dismissRes.choice, 'dismiss');
  assert.match(dismissRes.text, /abaikan|fokus|lain/i);
  assert.equal(dismissRes.spawnCommand, undefined);
});
