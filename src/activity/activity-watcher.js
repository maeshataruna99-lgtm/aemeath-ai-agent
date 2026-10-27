'use strict';

// Spawns scripts/activity-watcher.ps1 and hands each foreground-window sample to
// onSample. Unlike a one-shot watcher it can be stopped and started again, so
// switching interactive mode off and on works. The child dies with the app: its
// stdout is a pipe, and PowerShell exits when the pipe closes.

const { spawn } = require('node:child_process');
const path = require('node:path');

const RESTART_MS = 10000;

const LINUX_WATCH_SCRIPT = [
  'while true; do',
  '  wid=""',
  '  if command -v xdotool >/dev/null 2>&1; then wid=$(xdotool getactivewindow 2>/dev/null); fi',
  '  if [ -z "$wid" ] && command -v xprop >/dev/null 2>&1; then',
  '    wid=$(xprop -root _NET_ACTIVE_WINDOW 2>/dev/null | awk \'{print $NF}\')',
  '    [ "$wid" = "0x0" ] && wid=""',
  '  fi',
  '  if [ -n "$wid" ]; then',
  '    pid=""',
  '    title=""',
  '    if command -v xdotool >/dev/null 2>&1; then',
  '      pid=$(xdotool getwindowpid "$wid" 2>/dev/null)',
  '      title=$(xdotool getwindowname "$wid" 2>/dev/null)',
  '    fi',
  '    if [ -z "$pid" ] && command -v xprop >/dev/null 2>&1; then',
  '      pid=$(xprop -id "$wid" _NET_WM_PID 2>/dev/null | awk -F" = " \'{print $2}\')',
  '    fi',
  '    if [ -z "$title" ] && command -v xprop >/dev/null 2>&1; then',
  '      title=$(xprop -id "$wid" _NET_WM_NAME 2>/dev/null | sed -n \'s/^.*= "\\(.*\\)"$/\\1/p\')',
  '    fi',
  '    proc=""',
  '    exe=""',
  '    if [ -n "$pid" ] && [ -r "/proc/$pid/comm" ]; then',
  '      IFS= read -r proc < "/proc/$pid/comm"',
  '      exe=$(readlink -f "/proc/$pid/exe" 2>/dev/null || true)',
  '    fi',
  '    esc() { printf "%s" "$1" | sed \'s/\\\\/\\\\\\\\/g; s/"/\\\\"/g\' | tr -d \'\\r\\n\'; }',
  '    printf \'{"process":"%s","path":"%s","title":"%s"}\\n\' "$(esc "$proc")" "$(esc "$exe")" "$(esc "$title")"',
  '  fi',
  '  sleep 3 || exit 0',
  'done',
].join('\n');

function parseSample(line) {
  if (!line.trim()) return null;
  let data;
  try {
    data = JSON.parse(line);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  return {
    process: String(data.process || ''),
    path: String(data.path || ''),
    title: String(data.title || ''),
  };
}

function createActivityWatcher(options) {
  const opts = options || {};
  const scriptPath = opts.scriptPath || path.join(__dirname, '..', '..', 'scripts', 'activity-watcher.ps1');
  const onSample = opts.onSample || function () {};
  const spawnImpl = opts.spawn || spawn;
  const platform = opts.platform || process.platform;
  const isLinux = platform === 'linux';

  let child = null;
  let buffer = '';
  let restartTimer = null;
  let stopped = true;

  function scheduleRestart() {
    if (stopped || restartTimer || child) return;
    restartTimer = setTimeout(() => {
      restartTimer = null;
      launch();
    }, RESTART_MS);
  }

  function launch() {
    if (stopped || child) return;
    try {
      if (isLinux) {
        child = spawnImpl('bash', ['--noprofile', '--norc', '-c', LINUX_WATCH_SCRIPT], {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
      } else {
        child = spawnImpl('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
      }
    } catch {
      child = null;
      scheduleRestart();
      return;
    }
    if (!child.stdout) {
      child = null;
      scheduleRestart();
      return;
    }
    const mine = child;
    mine.stdout.setEncoding('utf8');
    mine.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        const sample = parseSample(line);
        if (sample) onSample(sample);
      }
    });
    mine.on('error', () => {
      if (child === mine) child = null;
      scheduleRestart();
    });
    mine.on('exit', () => {
      if (child === mine) child = null;
      scheduleRestart();
    });
  }

  function start() {
    stopped = false;
    launch();
  }

  function stop() {
    stopped = true;
    buffer = '';
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = null;
    if (child) {
      const mine = child;
      child = null;
      mine.removeAllListeners('exit');
      mine.removeAllListeners('error');
      try {
        mine.kill();
      } catch {
        // already gone
      }
    }
  }

  return { start: start, stop: stop };
}

module.exports = { createActivityWatcher, parseSample };
