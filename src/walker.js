// Two-dimensional flight behaviour for the pet, kept pure so it can be unit
// tested. The renderer owns the clock and calls stepWalker() every frame.
// The pet picks a random point inside the bounds and flies straight to it, so
// headings can be horizontal, vertical or diagonal.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AemethWalker = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REST_MIN_MS = 1500;
  const REST_MAX_MS = 6000;
  const MIN_TRIP = 160;
  const TARGET_TRIES = 6;
  // Below this horizontal share of the heading the pet keeps its last facing.
  const FACING_DEADZONE = 0.2;

  function createWalker(options) {
    const opts = options || {};
    return {
      x: typeof opts.x === 'number' ? opts.x : 0,
      y: typeof opts.y === 'number' ? opts.y : 0,
      speed: typeof opts.speed === 'number' ? opts.speed : 120,
      rng: opts.rng || Math.random,
      mode: 'rest',
      dirX: 0,
      dirY: 0,
      facing: 1,
      targetX: 0,
      targetY: 0,
      modeUntil: 0,
    };
  }

  function randomBetween(rng, min, max) {
    return min + rng() * (max - min);
  }

  function pickTarget(walker, bounds) {
    let tx = walker.x;
    let ty = walker.y;
    for (let i = 0; i < TARGET_TRIES; i++) {
      tx = randomBetween(walker.rng, bounds.minX, bounds.maxX);
      ty = randomBetween(walker.rng, bounds.minY, bounds.maxY);
      if (Math.hypot(tx - walker.x, ty - walker.y) >= MIN_TRIP) break;
    }
    return { x: tx, y: ty };
  }

  function setHeading(walker) {
    const dx = walker.targetX - walker.x;
    const dy = walker.targetY - walker.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) {
      walker.dirX = 0;
      walker.dirY = 0;
      return;
    }
    walker.dirX = dx / dist;
    walker.dirY = dy / dist;
    if (Math.abs(walker.dirX) >= FACING_DEADZONE) walker.facing = walker.dirX > 0 ? 1 : -1;
  }

  function startRest(walker, now) {
    walker.mode = 'rest';
    walker.dirX = 0;
    walker.dirY = 0;
    walker.modeUntil = now + randomBetween(walker.rng, REST_MIN_MS, REST_MAX_MS);
  }

  // Advances the walker by dtMs of wall-clock time. `now` is epoch
  // milliseconds, `bounds` is { minX, maxX, minY, maxY }. Mutates the walker
  // and returns the events fired this step: 'start-fly' | 'start-rest'.
  function stepWalker(walker, now, dtMs, bounds) {
    const events = [];
    if (walker.mode === 'rest') {
      if (now >= walker.modeUntil) {
        const target = pickTarget(walker, bounds);
        walker.targetX = target.x;
        walker.targetY = target.y;
        walker.mode = 'fly';
        setHeading(walker);
        events.push('start-fly');
      }
      return events;
    }

    const remaining = Math.hypot(walker.targetX - walker.x, walker.targetY - walker.y);
    const step = walker.speed * (dtMs / 1000);
    if (remaining <= step) {
      walker.x = walker.targetX;
      walker.y = walker.targetY;
      startRest(walker, now);
      events.push('start-rest');
    } else {
      walker.x += walker.dirX * step;
      walker.y += walker.dirY * step;
    }
    walker.x = Math.min(bounds.maxX, Math.max(bounds.minX, walker.x));
    walker.y = Math.min(bounds.maxY, Math.max(bounds.minY, walker.y));
    return events;
  }

  return {
    createWalker: createWalker,
    stepWalker: stepWalker,
    REST_MIN_MS: REST_MIN_MS,
    REST_MAX_MS: REST_MAX_MS,
  };
});
