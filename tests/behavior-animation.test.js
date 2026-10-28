'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { validateAtlas, animationNames, animationForBehavior } = require('../src/atlas');

const atlas = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'assets', 'pet', 'atlas.json'), 'utf8'),
);

test('all behavior event animations map directly to valid atlas animations', () => {
  assert.equal(validateAtlas(atlas), true);
  const validNames = new Set(animationNames(atlas));

  const eventsToTest = [
    'session-finished',
    'session-failed',
    'decision-request',
    'timer-done',
    'activity-remark',
    'chatter',
    'memory-offer',
    'memory-saved',
    'memory-refused',
    'continuation',
    'resume-work',
    'resume-work:resume',
    'resume-work:modify',
    'resume-work:dismiss',
    'quest-done',
    'quest-added',
  ];

  for (const eventKind of eventsToTest) {
    const anim = animationForBehavior(eventKind);
    assert.ok(anim, `Event ${eventKind} must produce an animation`);
    assert.ok(validNames.has(anim), `Animation "${anim}" for event "${eventKind}" must exist in atlas`);
  }

  // Exact mappings
  assert.equal(animationForBehavior('session-finished'), 'review');
  assert.equal(animationForBehavior('session-failed'), 'failed');
  assert.equal(animationForBehavior('decision-request'), 'waiting');
  assert.equal(animationForBehavior('timer-done'), 'jumping');
  assert.equal(animationForBehavior('activity-remark'), 'waving');
  assert.equal(animationForBehavior('memory-offer'), 'waiting');
  assert.equal(animationForBehavior('resume-work:resume'), 'jumping');
  assert.equal(animationForBehavior('resume-work:modify'), 'waiting');
  assert.equal(animationForBehavior('resume-work:dismiss'), 'idle');
  assert.equal(animationForBehavior('quest-done'), 'jumping');
});
