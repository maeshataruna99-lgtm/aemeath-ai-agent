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

const BOUNDS = { minX: 0, maxX: 1000, minY: 0, maxY: 600 };

test('walker stays inside bounds on both axes', () => {
  const walker = createWalker({ x: 500, y: 300, speed: 300, rng: seededRng(7) });
  let now = 0;
  for (let i = 0; i < 5000; i++) {
    now += 100;
    stepWalker(walker, now, 100, BOUNDS);
    assert.ok(walker.x >= BOUNDS.minX && walker.x <= BOUNDS.maxX, 'x=' + walker.x);
    assert.ok(walker.y >= BOUNDS.minY && walker.y <= BOUNDS.maxY, 'y=' + walker.y);
  }
});

test('walker starts flying toward a target with a unit heading', () => {
  const walker = createWalker({ x: 100, y: 500, speed: 100, rng: seededRng(2) });
  const events = stepWalker(walker, 1, 16, BOUNDS);
  assert.deepEqual(events, ['start-fly']);
  assert.equal(walker.mode, 'fly');
  assert.ok(Math.abs(Math.hypot(walker.dirX, walker.dirY) - 1) < 1e-9);
});

test('walker flies vertically and diagonally, not only sideways', () => {
  const walker = createWalker({ x: 500, y: 300, speed: 200, rng: seededRng(5) });
  let now = 0;
  let sawUp = false;
  let sawDown = false;
  let sawDiagonal = false;
  for (let i = 0; i < 3000; i++) {
    now += 50;
    stepWalker(walker, now, 50, BOUNDS);
    if (walker.mode !== 'fly') continue;
    if (walker.dirY < -0.3) sawUp = true;
    if (walker.dirY > 0.3) sawDown = true;
    if (Math.abs(walker.dirX) > 0.3 && Math.abs(walker.dirY) > 0.3) sawDiagonal = true;
  }
  assert.ok(sawUp && sawDown && sawDiagonal);
});

test('walker moves toward its target and rests on arrival', () => {
  const walker = createWalker({ x: 0, y: 0, speed: 100, rng: seededRng(11) });
  walker.mode = 'fly';
  walker.targetX = 300;
  walker.targetY = 400;
  walker.dirX = 0.6;
  walker.dirY = 0.8;
  const events = stepWalker(walker, 1000, 6000, BOUNDS);
  assert.deepEqual(events, ['start-rest']);
  assert.equal(walker.x, 300);
  assert.equal(walker.y, 400);
  assert.equal(walker.mode, 'rest');
  assert.equal(walker.dirX, 0);
  assert.equal(walker.dirY, 0);
});

test('facing follows horizontal heading and survives near-vertical flight', () => {
  const walker = createWalker({ x: 500, y: 500, speed: 100, rng: () => 0 });
  // rng() === 0 makes the target (minX, minY) = (0, 0): up and to the left
  stepWalker(walker, 10, 16, BOUNDS);
  assert.equal(walker.facing, -1);

  // straight up: facing must not change
  walker.x = 0;
  walker.y = 500;
  walker.mode = 'rest';
  walker.modeUntil = 0;
  walker.rng = () => 0; // target = (0, 0) -> purely vertical
  stepWalker(walker, 20, 16, BOUNDS);
  assert.ok(Math.abs(walker.dirX) < 0.01);
  assert.equal(walker.facing, -1);
});
