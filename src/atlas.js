// Atlas helpers shared between the main process, the renderer, and unit tests.
// UMD so the same file works with require() and as a browser <script>.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AemeathAtlas = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function validateAtlas(atlas) {
    const ints = ['cellWidth', 'cellHeight', 'columns', 'rows', 'sheetWidth', 'sheetHeight'];
    for (const key of ints) {
      if (!Number.isInteger(atlas[key]) || atlas[key] <= 0) {
        throw new Error('atlas: "' + key + '" must be a positive integer');
      }
    }
    if (atlas.sheetWidth !== atlas.cellWidth * atlas.columns) {
      throw new Error('atlas: sheetWidth does not match cellWidth * columns');
    }
    if (atlas.sheetHeight !== atlas.cellHeight * atlas.rows) {
      throw new Error('atlas: sheetHeight does not match cellHeight * rows');
    }
    const names = Object.keys(atlas.animations || {});
    if (names.length === 0) throw new Error('atlas: no animations defined');
    for (const name of names) {
      const anim = atlas.animations[name];
      if (!Number.isInteger(anim.row) || anim.row < 0 || anim.row >= atlas.rows) {
        throw new Error('atlas: animation "' + name + '" has a row outside the sheet');
      }
      if (!Number.isInteger(anim.frames) || anim.frames < 1 || anim.frames > atlas.columns) {
        throw new Error('atlas: animation "' + name + '" has an invalid frame count');
      }
      if (!Number.isFinite(anim.fps) || anim.fps <= 0) {
        throw new Error('atlas: animation "' + name + '" needs a positive fps');
      }
    }
    return true;
  }

  function frameRect(atlas, animation, frameIndex) {
    const anim = atlas.animations[animation];
    if (!anim) throw new Error('atlas: unknown animation "' + animation + '"');
    const index = ((frameIndex % anim.frames) + anim.frames) % anim.frames;
    return {
      x: index * atlas.cellWidth,
      y: anim.row * atlas.cellHeight,
      width: atlas.cellWidth,
      height: atlas.cellHeight,
    };
  }

  function animationNames(atlas) {
    return Object.keys(atlas.animations);
  }

  const EVENT_ANIMATIONS = {
    'session-finished': 'review',
    'session-failed': 'failed',
    'decision-request': 'waiting',
    'timer-done': 'jumping',
    'activity-remark': 'waving',
    'chatter': 'waving',
    'memory-offer': 'waiting',
    'memory-saved': 'waving',
    'memory-refused': 'idle',
    'continuation': 'waving',
    'resume-work': 'waving',
    'resume-work:resume': 'jumping',
    'resume-work:modify': 'waiting',
    'resume-work:dismiss': 'idle',
    'quest-done': 'jumping',
    'quest-added': 'waving',
  };

  function animationForBehavior(kind) {
    return (kind && EVENT_ANIMATIONS[kind]) || 'idle';
  }

  return {
    validateAtlas: validateAtlas,
    frameRect: frameRect,
    animationNames: animationNames,
    animationForBehavior: animationForBehavior,
    EVENT_ANIMATIONS: EVENT_ANIMATIONS,
  };
});
