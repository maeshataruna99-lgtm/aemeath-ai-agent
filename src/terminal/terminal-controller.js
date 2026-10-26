'use strict';

// Owns terminal mode: entering it behind the consent gate, running typed lines
// in the shell, and leaving it. All state lives in the main process, so the
// overlay can only ask for a switch (which needs the OS prompt) or send lines
// while the mode is active.

const IDLE_MS = 15 * 60 * 1000;
const LEAVE_WORDS = /^(exit|quit|keluar)$/i;

// options: { gate, createSession, isEnabled(), idleMs?, setTimer?, clearTimer? }
function createTerminalController(options) {
  const gate = options.gate;
  const createSession = options.createSession;
  const isEnabled = options.isEnabled;
  const idleMs = options.idleMs || IDLE_MS;
  const setTimer = options.setTimer || setTimeout;
  const clearTimer = options.clearTimer || clearTimeout;

  let session = null;
  let active = false;
  let entering = false;
  let idleTimer = null;

  function armIdle() {
    clearTimer(idleTimer);
    idleTimer = setTimer(stop, idleMs);
    if (idleTimer && typeof idleTimer.unref === 'function') idleTimer.unref();
  }

  function stop() {
    clearTimer(idleTimer);
    idleTimer = null;
    if (session) session.stop();
    session = null;
    active = false;
  }

  // Toggles between chat and terminal. Entering asks for consent first.
  async function changeMode() {
    if (active) {
      stop();
      return { ok: true, mode: 'chat', text: 'Kembali ke mode obrolan, Rover~' };
    }
    if (!isEnabled()) {
      return { ok: false, mode: 'chat', text: 'Mode terminal dimatikan di Pengaturan, jadi aku tetap di mode obrolan.' };
    }
    if (entering) {
      return { ok: false, mode: 'chat', text: 'Aku masih menunggu persetujuan Windows. Lihat jendela izin admin ya.' };
    }

    entering = true;
    let consent;
    try {
      consent = await gate.request();
    } finally {
      entering = false;
    }
    if (!consent.granted) {
      const reasons = {
        declined: 'Izin admin ditolak, jadi aku tetap di mode obrolan.',
        timeout: 'Persetujuan Windows tidak dijawab tepat waktu, jadi aku tetap di mode obrolan.',
        unsupported: 'Mode terminal hanya tersedia di Windows.',
      };
      return { ok: false, mode: 'chat', text: reasons[consent.reason] || 'Izin admin tidak bisa diminta, jadi aku tetap di mode obrolan.' };
    }

    session = createSession();
    session.start();
    active = true;
    armIdle();
    return {
      ok: true,
      mode: 'terminal',
      cwd: session.cwd,
      text:
        'Mode terminal aktif. Ketik perintah PowerShell dan aku jalankan sebagai kamu (bukan admin). ' +
        'Ketik exit atau /change-mode untuk kembali mengobrol.',
    };
  }

  const MESSAGES = {
    empty: 'Ketik perintahnya dulu, Rover.',
    multiline: 'Satu baris saja per perintah, ya.',
    'too-long': 'Perintahnya terlalu panjang.',
    control: 'Ada karakter yang tidak bisa dikirim ke terminal.',
    busy: 'Perintah sebelumnya belum selesai.',
  };

  // Resolves to { ok, mode, output?, cwd?, timedOut?, error? }.
  async function run(text) {
    if (!active) return { ok: false, mode: 'chat', error: 'Mode terminal belum aktif.' };
    if (!isEnabled()) {
      stop();
      return { ok: false, mode: 'chat', error: 'Mode terminal dimatikan di Pengaturan.' };
    }
    const line = String(text == null ? '' : text).trim();
    if (LEAVE_WORDS.test(line)) {
      stop();
      return { ok: true, mode: 'chat', output: '', left: true, text: 'Kembali ke mode obrolan, Rover~' };
    }
    armIdle();
    try {
      const result = await session.run(line);
      if (result.ended && !result.timedOut) {
        stop();
        return { ok: true, mode: 'chat', output: result.output, left: true, text: 'Terminalnya berhenti, jadi aku kembali ke mode obrolan.' };
      }
      return { ok: true, mode: 'terminal', output: result.output, cwd: result.cwd, timedOut: result.timedOut };
    } catch (error) {
      return { ok: false, mode: 'terminal', error: MESSAGES[error.message] || 'Perintah tidak bisa dijalankan.' };
    }
  }

  return {
    changeMode: changeMode,
    run: run,
    stop: stop,
    get active() {
      return active;
    },
    get cwd() {
      return session ? session.cwd : null;
    },
  };
}

module.exports = { createTerminalController, IDLE_MS };
