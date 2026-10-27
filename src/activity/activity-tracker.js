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
const CODING_REMINDER_MS = 45 * 60 * 1000;
const VIDEO_REMINDER_MS = 45 * 60 * 1000;
const SCREEN_STUCK_MS = 10 * 60 * 1000;
const SWITCH_WINDOW_MS = 3 * 60 * 1000;
const SWITCH_THRESHOLD = 6;
const SWITCH_COOLDOWN_MS = 15 * 60 * 1000;
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

// options: { getLimitMin(): number, getMode?(): 'low'|'medium'|'full', rng?: () => number }
function createActivityTracker(options) {
  const getLimitMin = options.getLimitMin || (() => DEFAULT_LIMIT_MIN);
  const getMode = options.getMode || (() => 'medium');
  const rng = options.rng || Math.random;

  let last = null;
  let socialMs = 0;
  let socialAway = 0;
  let warned = 0;
  let gameName = null;
  let gameMs = 0;
  let gameAway = 0;
  let nextGameReminder = GAME_FIRST_REMINDER_MS;
  let codingApp = null;
  let codingMs = 0;
  let codingAway = 0;
  let nextCodingReminder = CODING_REMINDER_MS;
  let codingTested = false;
  let workApp = null;
  let workAway = 0;
  let videoMs = 0;
  let videoAway = 0;
  let nextVideoReminder = VIDEO_REMINDER_MS;
  let staticScreenMs = 0;
  let nextStuckReminder = SCREEN_STUCK_MS;
  let brightWarned = false;
  let lastCategory = null;
  let switchTimes = [];
  let lastSwitchWarnAt = -Infinity;
  let lastRemarkAt = -Infinity;
  let categoryMs = Object.create(null);

  function reset() {
    last = null;
    resetSessions();
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
    codingApp = null;
    codingMs = 0;
    codingAway = 0;
    nextCodingReminder = CODING_REMINDER_MS;
    codingTested = false;
    workApp = null;
    workAway = 0;
    videoMs = 0;
    videoAway = 0;
    nextVideoReminder = VIDEO_REMINDER_MS;
    staticScreenMs = 0;
    nextStuckReminder = SCREEN_STUCK_MS;
    brightWarned = false;
    lastCategory = null;
    switchTimes = [];
    lastSwitchWarnAt = -Infinity;
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

  function codingStartText(app, ctx) {
    if (ctx && ctx.testing) {
      return 'Lagi nulis atau menjalankan unit test di ' + app + ' ya, Rover? Mantap, biar kodenya makin tahan banting!~';
    }
    if (ctx && ctx.language) {
      return 'Mulai ngoding ' + ctx.language + ' di ' + app + ' ya, Rover? Fokus terus, aku ikut memperhatikan dari sini~';
    }
    return 'Mulai sesi ngoding di ' + app + ' ya, Rover? Semangat, semoga lancar tanpa bug aneh!~';
  }

  // sample: classifier output. context: optional { language, testing, screen, hour } for Full mode.
  // Returns { remarks: [{ kind, text }] }, usually empty.
  function feed(info, nowMs, idleSeconds, context) {
    const gap = last === null ? 0 : nowMs - last;
    last = nowMs;
    if (gap > GAP_RESET_MS || idleSeconds >= IDLE_RESET_S) resetSessions();
    const step = Math.min(Math.max(gap, 0), MAX_STEP_MS);
    const idle = idleSeconds >= IDLE_PAUSE_S;
    const ignored = !info || info.category === 'ignored';
    const isFull = getMode() === 'full';
    const ctx = context || {};

    if (!idle && !ignored) {
      const cat = info.category || 'other';
      categoryMs[cat] = (categoryMs[cat] || 0) + step;

      if (lastCategory && lastCategory !== cat) {
        switchTimes.push(nowMs);
        switchTimes = switchTimes.filter((t) => nowMs - t <= SWITCH_WINDOW_MS);
      }
      lastCategory = cat;

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

      if (cat === 'coding') {
        codingMs += step;
        codingAway = 0;
      } else if (codingApp) {
        codingAway += step;
        if (codingAway >= AWAY_RESET_MS) {
          codingApp = null;
          codingMs = 0;
          codingAway = 0;
          nextCodingReminder = CODING_REMINDER_MS;
          codingTested = false;
        }
      }

      if (cat === 'work') {
        workAway = 0;
      } else if (workApp) {
        workAway += step;
        if (workAway >= AWAY_RESET_MS) {
          workApp = null;
          workAway = 0;
        }
      }

      if (cat === 'video') {
        videoMs += step;
        videoAway = 0;
      } else if (videoMs > 0) {
        videoAway += step;
        if (videoAway >= AWAY_RESET_MS) {
          videoMs = 0;
          videoAway = 0;
          nextVideoReminder = VIDEO_REMINDER_MS;
        }
      }

      if ((cat === 'coding' || cat === 'work') && ctx.screen && ctx.screen.motion === 'static') {
        staticScreenMs += step;
      } else if (ctx.screen && ctx.screen.motion !== 'static') {
        staticScreenMs = 0;
        nextStuckReminder = SCREEN_STUCK_MS;
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
    } else if (isFull) {
      if (
        switchTimes.length >= SWITCH_THRESHOLD &&
        nowMs - lastSwitchWarnAt >= SWITCH_COOLDOWN_MS
      ) {
        lastSwitchWarnAt = nowMs;
        switchTimes = [];
        emit(
          'context-switch',
          'Loh, pindah-pindah jendela terus dari tadi, Rover? Lagi nyari referensi atau lagi terdistraksi nih? Tarik napas dulu yuk~',
        );
      } else if (info.category === 'coding' && codingApp !== info.app) {
        codingApp = info.app;
        codingMs = 0;
        nextCodingReminder = CODING_REMINDER_MS;
        codingTested = Boolean(ctx.testing);
        emit('coding-start', codingStartText(info.app, ctx));
      } else if (info.category === 'coding' && ctx.testing && !codingTested) {
        codingTested = true;
        emit('coding-test', 'Waktunya menguji kode dengan unit test! Semoga langsung hijau semua ya, Rover~');
      } else if (info.category === 'coding' && codingMs >= nextCodingReminder) {
        nextCodingReminder += CODING_REMINDER_MS;
        emit(
          'coding-focus',
          'Sudah ' +
            minutes(codingMs) +
            ' menit fokus ngoding, Rover! Keren banget, tapi istirahatkan mata 20 detik dan minum air dulu yuk~',
        );
      } else if (
        (info.category === 'coding' || info.category === 'work') &&
        staticScreenMs >= nextStuckReminder
      ) {
        nextStuckReminder += SCREEN_STUCK_MS;
        emit(
          'screen-stuck',
          'Tampilan layarmu diam di bagian yang sama selama ' +
            minutes(staticScreenMs) +
            ' menit, Rover. Lagi mentok mikirin logika atau bug yang licin ya? Kalau mau diskusi, panggil aku di chat!~',
        );
      } else if (
        ctx.screen &&
        ctx.screen.tone === 'bright' &&
        typeof ctx.hour === 'number' &&
        (ctx.hour >= 23 || ctx.hour <= 4) &&
        !brightWarned
      ) {
        brightWarned = true;
        emit(
          'screen-bright',
          'Rover, tampilan layarmu terang banget di jam malam begini! Turunkan kecerahan atau nyalakan dark mode yuk biar matamu nggak cepat lelah~',
        );
      } else if (info.category === 'work' && workApp !== info.app) {
        workApp = info.app;
        emit('work-start', 'Lagi fokus kerja di ' + info.app + ' ya, Rover? Semangat merapikannya!~');
      } else if (info.category === 'video' && videoMs >= nextVideoReminder) {
        nextVideoReminder += VIDEO_REMINDER_MS;
        emit(
          'video-long',
          'Sudah ' +
            minutes(videoMs) +
            ' menit nonton video nih, Rover. Jangan sampai lupa tugas utamamu hari ini ya~',
        );
      }
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
