// Where the chat box goes relative to the pet. Pure, so it can be tested without a
// screen. The box prefers to sit above the pet, then below, then beside her with
// the full screen height; it only shrinks its message list while that stays
// comfortable, and it never ends up smaller than that just to avoid her.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AemeathChatLayout = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  // input: {
  //   anchor: { left, right, top, bottom }      the pet's rectangle
  //   bounds: { width, height }                 the screen
  //   width                                     the box width
  //   chrome                                    box height without the message list
  //   content                                   height the message list would like
  //   logMax, logMin                            limits for the message list
  //   gap, edge                                 space to the pet and to the screen edge
  // }
  // Returns { placement: 'above' | 'below' | 'side' | 'over', left, top, height, logMax, arrowX,
  //            arrow: 'down' | 'up' | 'none' }.
  function placeBox(input) {
    const { anchor, bounds, width, chrome, content, logMax, logMin, gap, edge } = input;
    const centerX = (anchor.left + anchor.right) / 2;
    const centerY = (anchor.top + anchor.bottom) / 2;
    const wanted = chrome + Math.min(content, logMax);
    const needed = chrome + logMin;
    const roomAbove = anchor.top - gap - edge;
    const roomBelow = bounds.height - (anchor.bottom + gap) - edge;
    const roomLeft = anchor.left - gap - edge;
    const roomRight = bounds.width - anchor.right - gap - edge;

    function finish(placement, left, top, logLimit) {
      const height = chrome + Math.min(content, logLimit);
      return {
        placement: placement,
        left: clamp(left, edge, Math.max(edge, bounds.width - width - edge)),
        top: clamp(top, edge, Math.max(edge, bounds.height - height - edge)),
        height: height,
        logMax: logLimit,
        arrowX: 0,
        arrow: 'none',
      };
    }

    function vertical(placement, room) {
      const logLimit = clamp(room - chrome, logMin, logMax);
      const height = chrome + Math.min(content, logLimit);
      const top = placement === 'above' ? anchor.top - gap - height : anchor.bottom + gap;
      const box = finish(placement, centerX - width / 2, top, logLimit);
      box.arrowX = clamp(centerX - box.left, 16, Math.max(16, width - 16));
      // a box above her points down at her, a box below her points up
      box.arrow = placement === 'above' ? 'down' : 'up';
      return box;
    }

    if (wanted <= roomAbove) return vertical('above', roomAbove);
    if (wanted <= roomBelow) return vertical('below', roomBelow);

    // Neither side fits the whole box. Shrink the list a little if that still leaves
    // a comfortable box, otherwise go beside her where the full height is free.
    if (Math.max(roomAbove, roomBelow) >= needed) {
      return roomBelow > roomAbove ? vertical('below', roomBelow) : vertical('above', roomAbove);
    }
    const sideLog = clamp(bounds.height - 2 * edge - chrome, logMin, logMax);
    const sideHeight = chrome + Math.min(content, sideLog);
    if (roomRight >= width || roomLeft >= width) {
      const onRight = roomRight >= width && (roomRight >= roomLeft || roomLeft < width);
      const left = onRight ? anchor.right + gap : anchor.left - gap - width;
      return finish('side', left, centerY - sideHeight / 2, sideLog);
    }

    // A very narrow and short screen: cover her rather than make the box unusable.
    const box = vertical(roomBelow > roomAbove ? 'below' : 'above', Math.max(roomAbove, roomBelow, needed));
    box.placement = 'over';
    box.arrow = 'none';
    return box;
  }

  return { placeBox: placeBox };
});
