'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { validateAtlas, frameRect, animationNames } = require('../src/atlas');

const atlas = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'assets', 'pet', 'atlas.json'), 'utf8'),
);

test('atlas matches the published Aemeath Mini sheet', () => {
  assert.equal(validateAtlas(atlas), true);
  assert.equal(atlas.sheetWidth, 1536);
  assert.equal(atlas.sheetHeight, 1872);
  assert.equal(atlas.columns, 8);
  assert.equal(atlas.rows, 9);
  assert.deepEqual(animationNames(atlas).sort(), [
    'failed',
    'idle',
    'jumping',
    'review',
    'running',
    'running-left',
    'running-right',
    'waiting',
    'waving',
  ]);
});

test('frameRect stays inside the sheet and wraps per animation', () => {
  for (const name of animationNames(atlas)) {
    const anim = atlas.animations[name];
    for (let i = 0; i < anim.frames; i++) {
      const rect = frameRect(atlas, name, i);
      assert.equal(rect.x, i * atlas.cellWidth);
      assert.equal(rect.y, anim.row * atlas.cellHeight);
      assert.ok(rect.x + rect.width <= atlas.sheetWidth, name + ' col ' + i);
      assert.ok(rect.y + rect.height <= atlas.sheetHeight, name + ' row');
    }
    const wrapped = frameRect(atlas, name, anim.frames);
    assert.equal(wrapped.x, 0, name + ' wraps to column 0');
  }
});

test('frameRect rejects unknown animations', () => {
  assert.throws(() => frameRect(atlas, 'dance', 0), /unknown animation/);
});

test('validateAtlas rejects inconsistent geometry', () => {
  assert.throws(() => validateAtlas({ ...atlas, sheetWidth: 1000 }), /sheetWidth/);
  assert.throws(
    () => validateAtlas({ ...atlas, animations: { idle: { row: 99, frames: 2, fps: 5 } } }),
    /outside the sheet/,
  );
});
