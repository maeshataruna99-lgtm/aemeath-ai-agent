'use strict';

// Asks Windows for administrator consent before terminal mode opens. The point
// is the operating system's own UAC prompt: nothing inside this app, and no
// script that might have found its way into the overlay, can click it for you.
//
// The gate only proves consent. The terminal itself still runs as the normal
// user, so no long-lived elevated process exists.

const TIMEOUT_MS = 120000;

// A fixed script with no user input in it. Starting an elevated child shows the
// UAC dialog; declining it makes Start-Process throw.
const SCRIPT =
  "try { Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden " +
  "-ArgumentList '-NoProfile','-NonInteractive','-Command','exit 0' -Wait -ErrorAction Stop; exit 0 } " +
  'catch { exit 1 }';

// options: { spawn, platform?, timeoutMs?, polkit? }
function createUacGate(options) {
  const spawn = options.spawn;
  const platform = options.platform || process.platform;
  const timeoutMs = options.timeoutMs || TIMEOUT_MS;
  const polkit = options.polkit === true;

  // Resolves to { granted: true } or { granted: false, reason }, never rejects.
  function request() {
    const usePolkit = platform === 'linux' && polkit;
    if (platform !== 'win32' && !usePolkit) {
      return Promise.resolve({ granted: false, reason: 'unsupported' });
    }
    return new Promise((resolve) => {
      let settled = false;
      let child;
      const settle = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => {
        try {
          if (child && child.kill) child.kill();
        } catch {
          // already gone
        }
        settle({ granted: false, reason: 'timeout' });
      }, timeoutMs);

      try {
        if (usePolkit) {
          child = spawn('pkexec', ['/bin/true'], {
            stdio: 'ignore',
            windowsHide: true,
            shell: false,
          });
        } else {
          child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', SCRIPT], {
            stdio: 'ignore',
            windowsHide: true,
            shell: false,
          });
        }
      } catch {
        settle({ granted: false, reason: 'error' });
        return;
      }
      child.once('error', () => settle({ granted: false, reason: 'error' }));
      child.once('exit', (code) =>
        settle(
          code === 0
            ? { granted: true }
            : { granted: false, reason: code === 1 || code === 126 ? 'declined' : 'error' },
        ),
      );
    });
  }

  return { request: request };
}

module.exports = { createUacGate, SCRIPT };
