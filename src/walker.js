// One-dimensional walking behaviour for the pet, kept pure so it can be unit
// tested. The renderer owns the clock and calls stepWalker() every frame.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AemethWalker = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REST_MIN_MS = 1500;
  const REST_MAX_MS = 6000;
  const WALK_MIN_MS = 3000;
  const WALK_MAX_MS = 10000;

  function createWalker(options) {
    const opts = options || {};
    return {
      x: typeof opts.x === 'number' ? opts.x : 0,
      speed: typeof opts.speed === 'number' ? opts.speed : 120,
      rng: opts.rng || Math.random,
      mode: 'rest',
      direction: 0,
      modeUntil: 0,
    };
  }

  function randomBetween(rng, min, max) {
    return min + rng() * (max - min);
  }

  // Advances the walker by dtMs of wall-clock time. `now` is epoch
  // milliseconds, `bounds` is { minX, maxX }. Mutates the walker and returns
  // the events fired this step: 'start-walk' | 'turn' | 'start-rest'.
  function stepWalker(walker, now, dtMs, bounds) {
    const events = [];
    if (walker.mode === 'rest') {
      if (now >= walker.modeUntil) {
        walker.direction = walker.rng() < 0.5 ? -1 : 1;
        walker.mode = 'walk';
        walker.modeUntil = now + randomBetween(walker.rng, WALK_MIN_MS, WALK_MAX_MS);
        events.push('start-walk');
      }
      return events;
    }

    const nextX = walker.x + walker.direction * walker.speed * (dtMs / 1000);
    walker.x = Math.min(bounds.maxX, Math.max(bounds.minX, nextX));
    const hitEdge = walker.x === bounds.minX || walker.x === bounds.maxX;

    if (hitEdge && now < walker.modeUntil) {
      walker.direction = walker.x === bounds.minX ? 1 : -1;
      events.push('turn');
      return events;
    }
    if (now >= walker.modeUntil || hitEdge) {
      walker.mode = 'rest';
      walker.direction = 0;
      walker.modeUntil = now + randomBetween(walker.rng, REST_MIN_MS, REST_MAX_MS);
      events.push('start-rest');
    }
    return events;
  }

  return {
    createWalker: createWalker,
    stepWalker: stepWalker,
    REST_MIN_MS: REST_MIN_MS,
    REST_MAX_MS: REST_MAX_MS,
    WALK_MIN_MS: WALK_MIN_MS,
    WALK_MAX_MS: WALK_MAX_MS,
  };
});
