'use strict';

// Turns a stream of classified samples into the few remarks Aemeath makes in
// medium mode: a doomscrolling warning that grows firmer the longer it lasts, a
// word when a game starts, and a break reminder after a long game session.
//
// Pure and clock-free: the caller passes the time and the idle seconds, which
// keeps it easy to test. Only categories and counters live here, never titles.

const MAX_STEP_MS = 15000; // one sample never counts for more than this
const GAP_RESET_MS = 120000; // sleep or a long pause ends every session
const IDLE_PAUSE_S = 120; // no input for this long: stop counting time
const IDLE_RESET_S = 300; // no input for this long: forget the sessions
const AWAY_RESET_MS = 5 * 60 * 1000; // this long off a topic ends its session
const REMARK_COOLDOWN_MS = 60 * 1000;
const GAME_FIRST_REMINDER_MS = 90 * 60 * 1000;
const GAME_NEXT_REMINDER_MS = 60 * 60 * 1000;
const DEFAULT_LIMIT_MIN = 20;

const MINUTE = 60 * 1000;

const CATEGORY_LABELS = {
  coding: 'ngoding',
  work: 'kerja',
  browser: 'web',
  video: 'video',
  chat: 'obrolan',
  media: 'musik',
  game: 'game',
  social: 'medsos',
  launcher: 'launcher',
  other: 'lainnya',
};

function pick(list, rng) {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

function minutes(ms) {
  return Math.round(ms / MINUTE);
}

// options: { getLimitMin(): number, rng?: () => number }
function createActivityTracker(options) {
  const getLimitMin = options.getLimitMin || (() => DEFAULT_LIMIT_MIN);
  const rng = options.rng || Math.random;

  let last = null;
  let socialMs = 0;
  let socialAway = 0;
  let warned = 0;
  let gameName = null;
  let gameMs = 0;
  let gameAway = 0;
  let nextGameReminder = GAME_FIRST_REMINDER_MS;
  let lastRemarkAt = -Infinity;
  let categoryMs = Object.create(null);

  function reset() {
    last = null;
    socialMs = 0;
    socialAway = 0;
    warned = 0;
    gameName = null;
    gameMs = 0;
    gameAway = 0;
    nextGameReminder = GAME_FIRST_REMINDER_MS;
    lastRemarkAt = -Infinity;
    categoryMs = Object.create(null);
  }

  function resetSessions() {
    socialMs = 0;
    socialAway = 0;
    warned = 0;
    gameName = null;
    gameMs = 0;
    gameAway = 0;
    nextGameReminder = GAME_FIRST_REMINDER_MS;
  }

  function doomscrollText(level, spent) {
    const n = minutes(spent);
    if (level === 1) {
      return pick(
        [
          'Rover, kamu sudah ' + n + ' menit di media sosial. Scroll tanpa ujung itu jebakan, lho. Berdiri dulu, minum, lihat yang jauh sebentar~',
          n + ' menit di medsos, Rover! Jempolmu belum capek? Istirahat sebentar yuk, aku temani.',
        ],
        rng,
      );
    }
    if (level === 2) {
      return 'Sudah ' + n + ' menit, Rover! Aku mulai khawatir. Dunia ini masih ada di luar layar, dan aku mau kamu melihatnya juga.';
    }
    return 'Rover... sudah lewat ' + n + ' menit. Tutup tabnya dulu, ya? Aku tidak akan ke mana-mana, kita jalan-jalan sebentar.';
  }

  function gameStartText(name) {
    if (name === 'Wuthering Waves') {
      return 'Itu duniaku! Semangat mainnya, Rover. Jangan lupa istirahat ya~';
    }
    return pick(
      [
        'Wah, kamu main ' + name + '! Semangat, Rover. Jangan lupa minum dan istirahat ya~',
        name + ' ya? Seru! Aku ikut menonton dari sini. Jangan sampai lupa waktu, ya.',
      ],
      rng,
    );
  }

  function gameReminderText(name, spent) {
    return 'Sudah ' + minutes(spent) + ' menit main ' + name + ', Rover. Peregangan dulu sebentar, lalu lanjut lagi~';
  }

  // sample: classifier output. Returns { remarks: [{ kind, text }] }, usually empty.
  function feed(info, nowMs, idleSeconds) {
    const gap = last === null ? 0 : nowMs - last;
    last = nowMs;
    if (gap > GAP_RESET_MS || idleSeconds >= IDLE_RESET_S) resetSessions();
    const step = Math.min(Math.max(gap, 0), MAX_STEP_MS);
    const idle = idleSeconds >= IDLE_PAUSE_S;
    const ignored = !info || info.category === 'ignored';

    if (!idle && !ignored) {
      const cat = info.category || 'other';
      categoryMs[cat] = (categoryMs[cat] || 0) + step;
      if (info.social) {
        socialMs += step;
        socialAway = 0;
      } else {
        socialAway += step;
        if (socialAway >= AWAY_RESET_MS) {
          socialMs = 0;
          warned = 0;
        }
      }
      if (info.game) {
        gameMs += step;
        gameAway = 0;
      } else if (gameName) {
        gameAway += step;
        if (gameAway >= AWAY_RESET_MS) {
          gameName = null;
          gameMs = 0;
          gameAway = 0;
          nextGameReminder = GAME_FIRST_REMINDER_MS;
        }
      }
    }

    const remarks = [];
    if (idle || ignored || nowMs - lastRemarkAt < REMARK_COOLDOWN_MS) return { remarks };

    const emit = (kind, text) => {
      remarks.push({ kind: kind, text: text });
      lastRemarkAt = nowMs;
    };

    // Counters only advance when a remark is actually made, so one that is held
    // back by the cooldown is simply made on a later sample.
    const limitMs = Math.max(1, getLimitMin()) * MINUTE;
    const level = Math.floor(socialMs / limitMs);
    if (info.social && level > warned) {
      warned = level;
      emit('doomscroll', doomscrollText(Math.min(level, 3), socialMs));
    } else if (info.game && gameName !== info.game) {
      gameName = info.game;
      gameMs = 0;
      nextGameReminder = GAME_FIRST_REMINDER_MS;
      emit('game-start', gameStartText(info.game));
    } else if (info.game && gameName === info.game && gameMs >= nextGameReminder) {
      nextGameReminder += GAME_NEXT_REMINDER_MS;
      emit('game-long', gameReminderText(info.game, gameMs));
    }
    return { remarks };
  }

  function summary() {
    const entries = Object.entries(categoryMs)
      .filter(([, ms]) => ms >= 3000)
      .sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return null;
    return entries
      .map(([cat, ms]) => {
        const label = CATEGORY_LABELS[cat] || 'lainnya';
        const mins = Math.floor(ms / MINUTE);
        return label + ' ' + (mins >= 1 ? mins + ' menit' : '<1 menit');
      })
      .join(', ');
  }

  return {
    feed: feed,
    reset: reset,
    summary: summary,
    get socialMinutes() {
      return minutes(socialMs);
    },
  };
}

module.exports = { createActivityTracker, DEFAULT_LIMIT_MIN };
