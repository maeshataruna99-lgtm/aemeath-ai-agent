'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { LINES, createDialogue } = require('../src/dialogue');
const { createLocalResponder } = require('../src/chat/local-responder');
const { createMemoryStore } = require('../src/memory/memory-store');
const { createActivityTracker } = require('../src/activity/activity-tracker');
const { buildSystemPrompt } = require('../src/chat/persona');

const FORBIDDEN_WORDS = [/\bsistem\b/i, /\bdatabase\b/i, /\bmemori\b/i];

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aemeath-persona-'));
}

test('dialogue lines in all categories never mention forbidden words', () => {
  for (const [category, lines] of Object.entries(LINES)) {
    for (const line of lines) {
      for (const re of FORBIDDEN_WORDS) {
        assert.equal(
          re.test(line),
          false,
          `Dialogue category "${category}" line mentions forbidden word (${re}): "${line}"`,
        );
      }
    }
  }
});

test('local responder small talk replies never mention forbidden words', () => {
  const responder = createLocalResponder({ getEntries: () => [] });
  const queries = ['halo', 'hai', 'apa kabar', 'makasih', 'siapa kamu'];
  for (const q of queries) {
    const res = responder.respond(q);
    for (const re of FORBIDDEN_WORDS) {
      assert.equal(
        re.test(res.text),
        false,
        `Local responder reply for "${q}" mentions forbidden word (${re}): "${res.text}"`,
      );
    }
  }
});

test('activity tracker proactive remarks never mention forbidden words', () => {
  const tracker = createActivityTracker({
    getLimitMin: () => 1,
    getMode: () => 'full',
  });

  // 1. Doomscroll
  const doom1 = tracker.feed({ category: 'social', social: true }, 60000, 0);
  if (doom1.remarks.length > 0) {
    for (const re of FORBIDDEN_WORDS) {
      assert.equal(re.test(doom1.remarks[0].text), false);
    }
  }

  // 2. Game
  const game = tracker.feed({ category: 'game', game: 'Wuthering Waves' }, 70000, 0);
  if (game.remarks.length > 0) {
    for (const re of FORBIDDEN_WORDS) {
      assert.equal(re.test(game.remarks[0].text), false);
    }
  }

  // 3. Coding start and test
  const coding = tracker.feed({ category: 'coding', app: 'VSCode' }, 80000, 0, { language: 'JavaScript' });
  if (coding.remarks.length > 0) {
    for (const re of FORBIDDEN_WORDS) {
      assert.equal(re.test(coding.remarks[0].text), false);
    }
  }
  const testRun = tracker.feed({ category: 'coding', app: 'VSCode' }, 90000, 0, { testing: true });
  if (testRun.remarks.length > 0) {
    for (const re of FORBIDDEN_WORDS) {
      assert.equal(re.test(testRun.remarks[0].text), false);
    }
  }
});

test('memory store proactive offers and confirmations never mention forbidden words to the user', () => {
  const dir = tempDir();
  const file = path.join(dir, 'companion-memory.json');
  let clock = 1000000;
  const store = createMemoryStore({
    file: file,
    now: () => clock,
  });

  // 1. Propose session offer (bubble text)
  const sessionOffer = store.proposeSession({
    project: 'aemeath-ai-agent',
    summary: 'Implementasi persona pass; Langkah berikutnya: verifikasi tes.',
  });
  assert.ok(sessionOffer);
  for (const re of FORBIDDEN_WORDS) {
    assert.equal(
      re.test(sessionOffer.text),
      false,
      `Session offer text mentions forbidden word (${re}): "${sessionOffer.text}"`,
    );
  }

  // 2. Accept session offer (confirmation bubble text)
  const accepted = store.acceptOffer(sessionOffer.id);
  assert.ok(accepted.ok);
  for (const re of FORBIDDEN_WORDS) {
    assert.equal(
      re.test(accepted.text),
      false,
      `Accepted offer text mentions forbidden word (${re}): "${accepted.text}"`,
    );
  }

  // 3. Continuation offer (Resume Work)
  clock += 1000;
  const contOffer = store.continuation('full');
  assert.ok(contOffer);
  for (const re of FORBIDDEN_WORDS) {
    assert.equal(
      re.test(contOffer.text),
      false,
      `Continuation offer text mentions forbidden word (${re}): "${contOffer.text}"`,
    );
  }
  for (const action of contOffer.actions) {
    const answered = store.answerContinuation(contOffer.id, action.action);
    assert.ok(answered);
    for (const re of FORBIDDEN_WORDS) {
      assert.equal(
        re.test(answered.text),
        false,
        `Continuation answer for ${action.action} mentions forbidden word (${re}): "${answered.text}"`,
      );
    }
  }

  // 4. Preference offer
  clock += 1000;
  store.remember({
    text: 'tolong sapa lebih jarang kalau lagi fokus',
    kind: 'preference',
    source: 'user',
  });
  const prefOffer = store.preferenceOffer('full', 3.5);
  assert.ok(prefOffer);
  for (const re of FORBIDDEN_WORDS) {
    assert.equal(
      re.test(prefOffer.text),
      false,
      `Preference offer text mentions forbidden word (${re}): "${prefOffer.text}"`,
    );
  }
  const prefAccepted = store.acceptOffer(prefOffer.id);
  assert.ok(prefAccepted.ok);
  for (const re of FORBIDDEN_WORDS) {
    assert.equal(
      re.test(prefAccepted.text),
      false,
      `Accepted preference offer text mentions forbidden word (${re}): "${prefAccepted.text}"`,
    );
  }
});

test('system prompt persona strictly forbids claiming unstored memories or using forbidden words', () => {
  const prompt = buildSystemPrompt([], { memory: 'Rover sedang belajar TypeScript.' });
  assert.match(prompt, /Jangan pernah mengaku mengingat hal yang tidak ada di catatan itu/);
  assert.match(prompt, /jangan menyebut kata "memori", "database", atau "sistem" kepada Rover/);
});
