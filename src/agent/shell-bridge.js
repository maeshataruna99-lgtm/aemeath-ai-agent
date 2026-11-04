'use strict';

// The terminal inside Claude mode (decision D-018). A line the owner types with a leading "!" is run
// in the same PowerShell session as terminal mode. It never goes through Claude, and Claude never
// sees the line or what it printed. Nothing Claude writes can reach this module: the only way in is
// the owner's own typed line, passed from the chat box.
//
// Starting a shell takes two steps, in this order, and neither replaces the other:
//   1. confirm(line): a dialog from the main process shows the exact line and asks first.
//   2. terminal.begin(): the unchanged Windows consent gate (UAC), then a shell that runs as a
//      normal user.
// The shell is kept for the next lines. It ends on "exit", when Claude mode ends, when the chat box
// closes, when the module is turned off, after the idle time, or when Aemeath quits. Lines and their
// output are never stored or logged here.

const { checkLine } = require('../terminal/terminal-session');

const LEAVE = /^(exit|quit|keluar)$/i;

// options: { terminal, confirm(line) -> Promise<boolean>, isEnabled() -> boolean }
//   terminal  the terminal controller (begin, run, stop, active, enabled)
//   isEnabled whether the Claude module is on
function createShellBridge(options) {
  const { terminal, confirm, isEnabled } = options;
  let fromClaude = false; // this bridge started the running shell, so only it may end it
  let starting = false; // the dialog or the Windows prompt is open

  // -> { ok: true, started, output, cwd, timedOut, ended, left }
  //  | { ok: false, code } where code is one of: disabled, terminal_disabled, terminal_mode, not_active,
  //    cancelled, waiting, declined, timeout, unsupported, error, empty, multiline, too-long, control,
  //    busy, failed
  async function run(text) {
    if (!isEnabled()) return { ok: false, code: 'disabled' };
    const line = String(text == null ? '' : text).trim();
    if (!terminal.active) fromClaude = false;
    if (terminal.active && !fromClaude) return { ok: false, code: 'terminal_mode' };

    if (LEAVE.test(line)) {
      if (!terminal.active) return { ok: false, code: 'not_active' };
      terminal.stop();
      fromClaude = false;
      return { ok: true, left: true };
    }

    const bad = checkLine(line);
    if (bad) return { ok: false, code: bad };

    let started = false;
    if (!terminal.active) {
      if (starting) return { ok: false, code: 'waiting' };
      if (!terminal.enabled) return { ok: false, code: 'terminal_disabled' };
      starting = true;
      try {
        let agreed = false;
        try {
          agreed = (await confirm(line)) === true;
        } catch {
          agreed = false;
        }
        if (!agreed) return { ok: false, code: 'cancelled' };
        if (!isEnabled()) return { ok: false, code: 'disabled' };
        const began = await terminal.begin();
        if (!began.ok) return { ok: false, code: began.reason || 'error' };
        fromClaude = true;
        started = true;
      } finally {
        starting = false;
      }
    }

    const res = await terminal.run(line);
    if (res.mode === 'chat') fromClaude = false; // the shell ended or was switched off
    if (!res.ok) return { ok: false, code: res.code || 'failed' };
    return {
      ok: true,
      started: started,
      output: res.output || '',
      cwd: res.cwd || terminal.cwd || '',
      timedOut: Boolean(res.timedOut),
      ended: res.left === true,
    };
  }

  // Ends a shell this bridge started. A terminal-mode session of the owner's is left alone.
  function stop() {
    if (fromClaude && terminal.active) terminal.stop();
    fromClaude = false;
  }

  return {
    run: run,
    stop: stop,
    get active() {
      return terminal.active && fromClaude;
    },
  };
}

module.exports = { createShellBridge };
