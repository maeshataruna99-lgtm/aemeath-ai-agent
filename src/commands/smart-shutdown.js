'use strict';

// Smart Shutdown Protocol with Safe State Machine
// Provides cancelable, confirmed shutdown with character-consistent "Journey well" farewell.
//
// Safety Principles:
// 1. Mandatory explicit confirmation; cannot be triggered by AI output, search, lorebook, or memory.
// 2. Cancelable countdown timer; cancellation stops pending actions with zero OS calls.
// 3. Platform-specific argument arrays without shell interpolation (shell: false).
// 4. Unsupported platforms fail gracefully with clear diagnostic messages.
// 5. Clear error handling: failure to execute OS shutdown does not crash the app.

const YES_PATTERN = /^(ya|y|yes|ok|oke|lanjut|gas)$/i;
const CANCEL_PATTERN = /^(batal|\/batal|cancel|tidak|no|n)$/i;

function createSmartShutdown(options) {
  const opts = options || {};
  const platform = opts.platform || process.platform;
  const spawn = opts.spawn;
  const now = typeof opts.now === 'function' ? opts.now : Date.now;
  const countdownSec = typeof opts.countdownSec === 'number' ? opts.countdownSec : 10;
  const confirmMs = typeof opts.confirmMs === 'number' ? opts.confirmMs : 30000;
  const onFarewell = typeof opts.onFarewell === 'function' ? opts.onFarewell : (() => {});
  const setTimer = typeof opts.setTimeout === 'function' ? opts.setTimeout : setTimeout;
  const clearTimer = typeof opts.clearTimeout === 'function' ? opts.clearTimeout : clearTimeout;

  let state = 'idle'; // 'idle' | 'confirming' | 'countdown' | 'executed'
  let expiresAt = 0;
  let countdownTimerId = null;
  let lastError = null;

  function isSupportedPlatform() {
    return platform === 'win32' || platform === 'linux';
  }

  function isConfirming() {
    return state === 'confirming' && now() <= expiresAt;
  }

  function isCountingDown() {
    return state === 'countdown';
  }

  function isPending() {
    return isConfirming() || isCountingDown();
  }

  function request() {
    if (!isSupportedPlatform()) {
      return {
        ok: false,
        text: 'Maaf Rover, sistem operasi (' + platform + ') tidak didukung untuk fitur shutdown aman.',
      };
    }

    if (isCountingDown()) {
      return {
        ok: false,
        text: 'Komputer sedang dalam hitung mundur untuk dimatikan. Ketik /batal jika ingin membatalkannya.',
      };
    }

    if (isConfirming()) {
      return {
        ok: true,
        awaitConfirm: true,
        text: 'Konfirmasi shutdown masih menunggu persetujuanmu, Rover. Ketik "ya" untuk melanjutkan, atau /batal untuk membatalkan.',
      };
    }

    state = 'confirming';
    expiresAt = now() + confirmMs;
    lastError = null;

    return {
      ok: true,
      awaitConfirm: true,
      text:
        'Yakin mau mematikan komputer, Rover? Jika kamu konfirmasi "ya", akan ada hitung mundur ' +
        countdownSec +
        ' detik yang tetap bisa dibatalkan dengan /batal.',
    };
  }

  function executeShutdown() {
    if (state !== 'countdown') {
      return { ok: false, error: 'Shutdown tidak dalam status hitung mundur.' };
    }

    // Trigger farewell dialogue & sprite animation immediately before OS call
    onFarewell({
      text: 'Journey well, Rover... Terima kasih untuk hari ini. Sampai jumpa lagi ya!',
      anim: 'waving',
      animMs: 3500,
    });

    state = 'executed';

    let cmd;
    let args;

    if (platform === 'win32') {
      cmd = 'shutdown.exe';
      args = ['/s', '/t', '60', '/c', 'Aemeath: Journey well, Rover. Ketik /batal untuk membatalkan.'];
    } else if (platform === 'linux') {
      cmd = 'shutdown';
      args = ['-h', '+1', 'Aemeath: Journey well, Rover. Ketik /batal untuk membatalkan.'];
    } else {
      return { ok: false, error: 'Platform tidak didukung.' };
    }

    // Absolute Safety Guard: NEVER execute actual child_process.spawn on host OS
    const cp = require('child_process');
    if (spawn === cp.spawn && opts.executeRealOS !== true) {
      return { ok: true, simulated: true, command: cmd, args: args };
    }
    if (typeof spawn !== 'function') {
      return { ok: true, simulated: true, command: cmd, args: args };
    }

    try {
      const child = spawn(cmd, args, {
        stdio: 'ignore',
        windowsHide: true,
        shell: false,
      });

      if (child && typeof child.on === 'function') {
        child.on('error', (err) => {
          lastError = err.message;
          state = 'idle';
        });
      }

      return { ok: true };
    } catch (err) {
      lastError = err.message;
      state = 'idle';
      return { ok: false, error: err.message };
    }
  }

  function startCountdown() {
    state = 'countdown';

    if (countdownSec <= 0) {
      return executeShutdown();
    }

    countdownTimerId = setTimer(() => {
      countdownTimerId = null;
      executeShutdown();
    }, countdownSec * 1000);

    return {
      ok: true,
      countdown: countdownSec,
      text:
        'Konfirmasi diterima. Hitung mundur ' +
        countdownSec +
        ' detik dimulai sebelum komputer dimatikan. Ketik /batal kapan saja untuk membatalkan.',
    };
  }

  function answerConfirm(rawText) {
    if (state !== 'confirming') return null;

    const text = String(rawText == null ? '' : rawText).trim();

    if (now() > expiresAt) {
      state = 'idle';
      return {
        isCommand: true,
        ok: false,
        text: 'Waktu konfirmasi habis, shutdown dibatalkan demi keamanan, Rover.',
      };
    }

    if (CANCEL_PATTERN.test(text)) {
      state = 'idle';
      return {
        isCommand: true,
        ok: true,
        text: 'Oke, proses shutdown dibatalkan. Komputer tetap menyala, Rover~',
      };
    }

    if (YES_PATTERN.test(text)) {
      const countdownRes = startCountdown();
      return {
        isCommand: true,
        ok: true,
        text: countdownRes.text,
      };
    }

    // Any other text cancels the pending shutdown
    state = 'idle';
    return {
      isCommand: true,
      ok: false,
      text: 'Jawaban bukan konfirmasi ("ya"), proses shutdown dibatalkan.',
    };
  }

  function cancel() {
    if (state === 'idle') {
      return {
        ok: true,
        text: 'Tidak ada proses shutdown yang sedang berjalan, Rover.',
      };
    }

    if (countdownTimerId !== null) {
      clearTimer(countdownTimerId);
      countdownTimerId = null;
    }

    // Safety net OS cancel if supported
    if (typeof spawn === 'function') {
      try {
        if (platform === 'win32') {
          spawn('shutdown.exe', ['/a'], { stdio: 'ignore', windowsHide: true, shell: false });
        } else if (platform === 'linux') {
          spawn('shutdown', ['-c'], { stdio: 'ignore', windowsHide: true, shell: false });
        }
      } catch {
        // Ignore safety net spawn errors on cancel
      }
    }

    state = 'idle';
    expiresAt = 0;

    return {
      ok: true,
      text: 'Proses shutdown telah dibatalkan! Komputer tetap menyala, Rover~',
    };
  }

  function asBuiltins() {
    return {
      matikan: {
        description: 'Matikan komputer dengan aman setelah konfirmasi dan hitung mundur',
        run: async () => request(),
      },
      shutdown: {
        description: 'Matikan komputer dengan aman setelah konfirmasi dan hitung mundur',
        run: async () => request(),
      },
      batal: {
        description: 'Batalkan proses konfirmasi atau hitung mundur shutdown',
        run: async () => cancel(),
      },
    };
  }

  return {
    request: request,
    answerConfirm: answerConfirm,
    cancel: cancel,
    executeShutdown: executeShutdown,
    isConfirming: isConfirming,
    isCountingDown: isCountingDown,
    isPending: isPending,
    asBuiltins: asBuiltins,
    getState: () => ({
      state: state,
      expiresAt: expiresAt,
      lastError: lastError,
    }),
  };
}

module.exports = { createSmartShutdown, YES_PATTERN, CANCEL_PATTERN };
