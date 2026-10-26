'use strict';

// Defense in depth for the chat. The persona already tells the model to keep
// things all-ages; this catches the obvious cases on both sides of the call.
// It is deliberately small and conservative, not a full moderation system.

const EXPLICIT = new RegExp(
  '\\b(' +
    [
      'sex', 'sexy', 'seks', 'seksi', 'porn', 'porno', 'pornografi', 'bokep', 'nsfw', 'nude', 'nudes',
      'telanjang', 'bugil', 'erotis', 'mesum', 'ngentot', 'kontol', 'memek', 'horny', 'sange',
      'masturbasi', 'hentai', 'bdsm',
    ].join('|') +
    ')\\b',
  'i',
);

const DEFLECTIONS = [
  'Hehe, itu bukan topik buat kita, Rover. Ganti topik, yuk! Mau tanya soal Wuthering Waves?',
  'Eits, yang itu aku lewati ya. Ayo ngobrol hal lain, aku punya banyak cerita soal Solaris-3!',
];

function isUnsafe(text) {
  return EXPLICIT.test(String(text == null ? '' : text));
}

function deflection(seed) {
  return DEFLECTIONS[Math.abs(Number(seed) || 0) % DEFLECTIONS.length];
}

module.exports = { isUnsafe, deflection };
