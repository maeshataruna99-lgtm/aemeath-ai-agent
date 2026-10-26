'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDialogue, LINES } = require('../src/dialogue');

function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

test('every category has lines and every line is short enough for a bubble', () => {
  for (const [name, pool] of Object.entries(LINES)) {
    assert.ok(pool.length >= 2, name + ' needs at least two lines');
    for (const line of pool) {
      assert.ok(line.length > 0 && line.length <= 200, name + ': ' + line);
    }
  }
});

test('a pending decision always gets a decision line', () => {
  const dialogue = createDialogue({ rng: seededRng(1) });
  for (let i = 0; i < 20; i++) {
    const line = dialogue.next({ decisionPending: true, sessionRunning: true, hour: 2 });
    assert.ok(LINES.decision.includes(line));
  }
});

test('context-specific lines show up, and idle context stays general', () => {
  const dialogue = createDialogue({ rng: seededRng(5) });
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    seen.add(dialogue.next({ sessionRunning: true, musicPlaying: true, flying: true, hour: 3 }));
  }
  for (const category of ['general', 'working', 'music', 'flying', 'lateNight']) {
    assert.ok(LINES[category].some((l) => seen.has(l)), category + ' never picked');
  }
  assert.ok(!LINES.morning.some((l) => seen.has(l)), 'morning lines must not appear at 3am');

  const idle = createDialogue({ rng: seededRng(9) });
  for (let i = 0; i < 100; i++) {
    assert.ok(LINES.general.includes(idle.next({ hour: 14 })));
  }
});

test('the same line is not repeated back to back', () => {
  const dialogue = createDialogue({ rng: seededRng(3) });
  let previous = null;
  for (let i = 0; i < 200; i++) {
    const line = dialogue.next({ hour: 14 });
    assert.notEqual(line, previous);
    previous = line;
  }
});

test('chatIntervalRange spreads 60%-140% around the average', () => {
  const { chatIntervalRange } = require('../src/dialogue');
  const range = chatIntervalRange(5);
  assert.equal(range.minMs, 5 * 60000 * 0.6);
  assert.equal(range.maxMs, 5 * 60000 * 1.4);
  const fast = chatIntervalRange(1);
  assert.ok(fast.minMs < fast.maxMs && fast.minMs >= 30000);
});
