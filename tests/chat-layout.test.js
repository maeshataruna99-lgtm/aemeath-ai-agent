'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { placeBox } = require('../src/chat-layout');

const BASE = { width: 400, chrome: 130, content: 600, logMax: 340, logMin: 140, gap: 16, edge: 8 };
const SCREEN = { width: 1920, height: 1080 };

function pet(x, y, w = 135, h = 146) {
  return { left: x, right: x + w, top: y, bottom: y + h };
}

function box(anchor, overrides, bounds) {
  return placeBox({ ...BASE, ...overrides, anchor, bounds: bounds || SCREEN });
}

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function rect(result, width) {
  return { left: result.left, right: result.left + (width || BASE.width), top: result.top, bottom: result.top + result.height };
}

test('with room above, the box sits above the pet at full size', () => {
  const result = box(pet(800, 700));
  assert.equal(result.placement, 'above');
  assert.equal(result.logMax, 340);
  assert.equal(result.height, 130 + 340);
  assert.equal(result.top + result.height, 700 - 16);
  assert.ok(result.arrowX >= 16 && result.arrowX <= 384);
  assert.equal(result.arrow, 'down');
});

test('with room only below, it goes below', () => {
  const result = box(pet(800, 100));
  assert.equal(result.placement, 'below');
  assert.equal(result.top, 100 + 146 + 16);
  assert.equal(result.arrow, 'up');
  assert.equal(result.logMax, 340);
});

test('when neither side fits it all, it shrinks only while the box stays comfortable', () => {
  // 672 px tall, pet at y 220..366: room above 196, below 282 -> below, list shrunk to 152 (still above 140)
  const result = box(pet(900, 220), {}, { width: 1280, height: 672 });
  assert.equal(result.placement, 'below');
  assert.equal(result.logMax, 672 - (220 + 146 + 16) - 8 - 130);
  assert.ok(result.logMax >= 140);
});

test('when neither side can give a comfortable list, it goes beside her at full height', () => {
  // a short screen, pet in the middle: about 130 px above and below, the old code shrank to 70
  const result = box(pet(900, 270), {}, { width: 1280, height: 500 });
  assert.equal(result.placement, 'side');
  assert.equal(result.logMax, 340 > 500 - 16 - 130 ? 500 - 16 - 130 : 340);
  assert.ok(result.logMax >= 140);
  assert.ok(!overlaps(rect(result), pet(900, 270)), 'the box must not cover her');
  assert.equal(result.arrow, 'none');
  assert.ok(result.top >= 8 && result.top + result.height <= 500 - 8);
});

test('beside her it picks the roomier side', () => {
  const nearRight = box(pet(1700, 270), {}, { width: 1920, height: 500 });
  assert.equal(nearRight.placement, 'side');
  assert.ok(nearRight.left + 400 <= 1700 - 16 + 0.001, 'placed to her left');

  const nearLeft = box(pet(40, 270), {}, { width: 1920, height: 500 });
  assert.equal(nearLeft.placement, 'side');
  assert.ok(nearLeft.left >= 40 + 135 + 16 - 0.001, 'placed to her right');
});

test('on a screen too small for any of that it covers her instead of becoming unusable', () => {
  const result = box(pet(100, 100), {}, { width: 500, height: 400 });
  assert.equal(result.placement, 'over');
  assert.equal(result.arrow, 'none');
  assert.ok(result.height >= 130 + 140 || result.height <= 400 - 16);
  assert.ok(result.left >= 8 && result.left + 400 <= 500 - 8);
});

test('the message list never exceeds what is in it', () => {
  const result = box(pet(800, 700), { content: 60 });
  assert.equal(result.height, 130 + 60);
});

test('the large size gives a wider and taller box', () => {
  const normal = box(pet(800, 800));
  const large = box(pet(800, 800), { width: 560, logMax: 520 });
  assert.ok(large.height > normal.height);
  assert.equal(large.logMax, 520);
});

test('wherever the pet is, the box stays on screen and clear of her unless it had to cover her', () => {
  let seed = 7;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const screens = [{ width: 1920, height: 1080 }, { width: 1280, height: 672 }, { width: 1366, height: 600 }, { width: 800, height: 450 }];
  for (const bounds of screens) {
    for (let i = 0; i < 400; i++) {
      const anchor = pet(random() * (bounds.width - 135), random() * (bounds.height - 146));
      const result = box(anchor, { content: random() * 800 }, bounds);
      const r = rect(result);
      assert.ok(r.left >= 8 - 0.001 && r.right <= bounds.width - 8 + 0.001, JSON.stringify({ bounds, anchor, result }));
      assert.ok(r.top >= 8 - 0.001, JSON.stringify({ bounds, anchor, result }));
      if (result.placement !== 'over' && bounds.height >= 500) {
        assert.ok(r.bottom <= bounds.height - 8 + 0.001, JSON.stringify({ bounds, anchor, result }));
        assert.ok(!overlaps(r, anchor), 'covers her: ' + JSON.stringify({ bounds, anchor, result }));
      }
    }
  }
});
