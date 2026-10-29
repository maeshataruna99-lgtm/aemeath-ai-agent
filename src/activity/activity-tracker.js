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
const SWITCH_WINDOW_MS = 3 * 60 * 1000;
const SWITCH_THRESHOLD = 6;
const SWITCH_COOLDOWN_MS = 15 * 60 * 1000;
const DEFAULT_LIMIT_MIN = 20;

const MINUTE = 60 * 1000;

const CATEGORY_LABELS_ID = {
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

const CATEGORY_LABELS_EN = {
  coding: 'coding',
  work: 'work',
  browser: 'web',
  video: 'video',
  chat: 'chat',
  media: 'music',
  game: 'game',
  social: 'medsos',
  launcher: 'launcher',
  other: 'other',
};

const CATEGORY_LABELS = CATEGORY_LABELS_ID;

function pick(list, rng) {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

function minutes(ms) {
  return Math.round(ms / MINUTE);
}

// options: { getLimitMin(): number, getMode?(): 'low'|'medium'|'full', getLocale?(): string, rng?: () => number }
function createActivityTracker(options) {
  const opts = options || {};
  const getLimitMin = opts.getLimitMin || (() => DEFAULT_LIMIT_MIN);
  const getMode = opts.getMode || (() => 'medium');
  const rng = opts.rng || Math.random;
  let manualLocale = null;
  const getLocale = () => manualLocale || (typeof opts.getLocale === 'function' ? opts.getLocale() : (opts.locale || 'id-ID'));

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
    lastCategory = null;
    switchTimes = [];
    lastSwitchWarnAt = -Infinity;
  }

  function doomscrollText(level, spent) {
    const isEn = getLocale() === 'en-US';
    const n = minutes(spent);
    if (level === 1) {
      return pick(
        isEn
          ? [
              'Rover, you have been on social media for ' + n + ' minutes. Endless scrolling is a trap, you know! Stand up, drink some water, and look away for a moment~',
              n + " minutes on social media, Rover! Aren't your thumbs tired? Let's take a short break together, I will keep you company.",
            ]
          : [
              'Rover, kamu sudah ' + n + ' menit di media sosial. Scroll tanpa ujung itu jebakan, lho. Berdiri dulu, minum, lihat yang jauh sebentar~',
              n + ' menit di medsos, Rover! Jempolmu belum capek? Istirahat sebentar yuk, aku temani.',
            ],
        rng,
      );
    }
    if (level === 2) {
      return isEn
        ? 'It has been ' + n + ' minutes, Rover! I am starting to worry. There is a whole world beyond the screen, and I want you to see it too.'
        : 'Sudah ' + n + ' menit, Rover! Aku mulai khawatir. Dunia ini masih ada di luar layar, dan aku mau kamu melihatnya juga.';
    }
    return isEn
      ? 'Rover... it has been over ' + n + ' minutes. Close the tab for a bit, okay? I will not go anywhere, let us take a short walk.'
      : 'Rover... sudah lewat ' + n + ' menit. Tutup tabnya dulu, ya? Aku tidak akan ke mana-mana, kita jalan-jalan sebentar.';
  }

  function gameStartText(name) {
    const isEn = getLocale() === 'en-US';
    if (name === 'Wuthering Waves') {
      return isEn
        ? "That's my world! Have fun playing, Rover. Don't forget to take breaks~"
        : 'Itu duniaku! Semangat mainnya, Rover. Jangan lupa istirahat ya~';
    }
    return pick(
      isEn
        ? [
            'Ooh, you are playing ' + name + '! Have fun, Rover. Remember to stay hydrated and rest up~',
            name + ', huh? Exciting! I will watch from right here. Do not lose track of time~',
          ]
        : [
            'Wah, kamu main ' + name + '! Semangat, Rover. Jangan lupa minum dan istirahat ya~',
            name + ' ya? Seru! Aku ikut menonton dari sini. Jangan sampai lupa waktu, ya.',
          ],
      rng,
    );
  }

  function gameReminderText(name, spent) {
    const isEn = getLocale() === 'en-US';
    return isEn
      ? "You've been playing " + name + ' for ' + minutes(spent) + ' minutes, Rover. Do a quick stretch, then back to it~'
      : 'Sudah ' + minutes(spent) + ' menit main ' + name + ', Rover. Peregangan dulu sebentar, lalu lanjut lagi~';
  }

  function codingStartText(app, ctx) {
    const isEn = getLocale() === 'en-US';
    if (ctx && ctx.testing) {
      return isEn
        ? 'Writing or running unit tests in ' + app + ', Rover? Awesome, keeping the code rock solid!~'
        : 'Lagi nulis atau menjalankan unit test di ' + app + ' ya, Rover? Mantap, biar kodenya makin tahan banting!~';
    }
    if (ctx && ctx.language) {
      return isEn
        ? 'Starting to code ' + ctx.language + ' in ' + app + ', Rover? Stay focused, I will be watching from here~'
        : 'Mulai ngoding ' + ctx.language + ' di ' + app + ' ya, Rover? Fokus terus, aku ikut memperhatikan dari sini~';
    }
    return isEn
      ? 'Starting a coding session in ' + app + ', Rover? Best of luck, hope it goes smoothly without weird bugs!~'
      : 'Mulai sesi ngoding di ' + app + ' ya, Rover? Semangat, semoga lancar tanpa bug aneh!~';
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
      const isEn = getLocale() === 'en-US';
      if (
        switchTimes.length >= SWITCH_THRESHOLD &&
        nowMs - lastSwitchWarnAt >= SWITCH_COOLDOWN_MS
      ) {
        lastSwitchWarnAt = nowMs;
        switchTimes = [];
        emit(
          'context-switch',
          isEn
            ? 'Whoa, hopping between windows a lot, Rover? Looking up references or getting distracted? Take a deep breath first~'
            : 'Loh, pindah-pindah jendela terus dari tadi, Rover? Lagi nyari referensi atau lagi terdistraksi nih? Tarik napas dulu yuk~',
        );
      } else if (info.category === 'coding' && codingApp !== info.app) {
        codingApp = info.app;
        codingMs = 0;
        nextCodingReminder = CODING_REMINDER_MS;
        codingTested = Boolean(ctx.testing);
        emit('coding-start', codingStartText(info.app, ctx));
      } else if (info.category === 'coding' && ctx.testing && !codingTested) {
        codingTested = true;
        emit(
          'coding-test',
          isEn
            ? 'Time to test the code with unit tests! May they all turn green right away, Rover~'
            : 'Waktunya menguji kode dengan unit test! Semoga langsung hijau semua ya, Rover~',
        );
      } else if (info.category === 'coding' && codingMs >= nextCodingReminder) {
        nextCodingReminder += CODING_REMINDER_MS;
        emit(
          'coding-focus',
          isEn
            ? 'You have been coding intensely for ' +
              minutes(codingMs) +
              ' minutes, Rover! Super cool, but rest your eyes for 20 seconds and drink some water~'
            : 'Sudah ' +
              minutes(codingMs) +
              ' menit fokus ngoding, Rover! Keren banget, tapi istirahatkan mata 20 detik dan minum air dulu yuk~',
        );
      } else if (info.category === 'work' && workApp !== info.app) {
        workApp = info.app;
        emit(
          'work-start',
          isEn
            ? 'Focusing on work in ' + info.app + ', Rover? You got this, let us get it sorted out!~'
            : 'Lagi fokus kerja di ' + info.app + ' ya, Rover? Semangat merapikannya!~',
        );
      } else if (info.category === 'video' && videoMs >= nextVideoReminder) {
        nextVideoReminder += VIDEO_REMINDER_MS;
        emit(
          'video-long',
          isEn
            ? 'You have been watching videos for ' +
              minutes(videoMs) +
              ' minutes now, Rover. Do not forget your main goals for today~'
            : 'Sudah ' +
              minutes(videoMs) +
              ' menit nonton video nih, Rover. Jangan sampai lupa tugas utamamu hari ini ya~',
        );
      }
    }
    return { remarks };
  }

  function summary() {
    const isEn = getLocale() === 'en-US';
    const labels = isEn ? CATEGORY_LABELS_EN : CATEGORY_LABELS_ID;
    const entries = Object.entries(categoryMs)
      .filter(([, ms]) => ms >= 3000)
      .sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return null;
    return entries
      .map(([cat, ms]) => {
        const label = labels[cat] || (isEn ? 'other' : 'lainnya');
        const mins = Math.floor(ms / MINUTE);
        if (isEn) {
          return label + ' ' + (mins >= 1 ? mins + ' min' + (mins > 1 ? 's' : '') : '<1 min');
        }
        return label + ' ' + (mins >= 1 ? mins + ' menit' : '<1 menit');
      })
      .join(', ');
  }

  function setLocale(loc) {
    if (typeof loc === 'string') manualLocale = loc;
  }

  return {
    feed: feed,
    reset: reset,
    summary: summary,
    setLocale: setLocale,
    getLocale: getLocale,
    get socialMinutes() {
      return minutes(socialMs);
    },
  };
}

module.exports = { createActivityTracker, DEFAULT_LIMIT_MIN };
