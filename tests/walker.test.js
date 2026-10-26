'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createWalker, stepWalker } = require('../src/walker');

function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

test('walker stays inside bounds across modes', () => {
  const walker = createWalker({ x: 500, speed: 200, rng: seededRng(7) });
  const bounds = { minX: 0, maxX: 1000 };
  let now = 0;
  for (let i = 0; i < 5000; i++) {
    now += 100;
    stepWalker(walker, now, 100, bounds);
    assert.ok(walker.x >= bounds.minX && walker.x <= bounds.maxX, 'x=' + walker.x);
  }
});

test('walker turns at the edges instead of resting mid-run', () => {
  const walker = createWalker({ x: 0, speed: 500, rng: seededRng(3) });
  walker.mode = 'walk';
  walker.direction = -1;
  walker.modeUntil = 60000;
  const events = stepWalker(walker, 1000, 100, { minX: 0, maxX: 2000 });
  assert.deepEqual(events, ['turn']);
  assert.equal(walker.direction, 1);
  assert.equal(walker.mode, 'walk');
});

test('walker rests after the walk window expires', () => {
  const walker = createWalker({ x: 100, speed: 50, rng: seededRng(11) });
  walker.mode = 'walk';
  walker.direction = 1;
  walker.modeUntil = 1000;
  const events = stepWalker(walker, 1500, 100, { minX: 0, maxX: 2000 });
  assert.deepEqual(events, ['start-rest']);
  assert.equal(walker.mode, 'rest');
  assert.equal(walker.direction, 0);
});

test('walker walks left when seeded so and advances', () => {
  const walker = createWalker({ x: 900, speed: 100, rng: seededRng(2) });
  // force the rest -> walk transition deterministically
  walker.modeUntil = 0;
  const events = stepWalker(walker, 1000, 16, { minX: 0, maxX: 1000 });
  assert.deepEqual(events, ['start-walk']);
  assert.equal(walker.mode, 'walk');
  const before = walker.x;
  stepWalker(walker, 1100, 100, { minX: 0, maxX: 1000 });
  assert.notEqual(walker.x, before);
});
