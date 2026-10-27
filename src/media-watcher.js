'use strict';

// Spawns scripts/media-watcher.ps1 and turns its JSON lines into a single
// "what is playing right now" status. Restarts the child on exit.

const { spawn } = require('node:child_process');
const path = require('node:path');

const RESTART_MS = 10000;

const LINUX_MEDIA_SCRIPT = [
  'while true; do',
  '  if command -v playerctl >/dev/null 2>&1; then',
  '    st=$(playerctl status 2>/dev/null || true)',
  '    if [ "$st" = "Playing" ]; then',
  '      ti=$(playerctl metadata xesam:title 2>/dev/null || true)',
  '      ar=$(playerctl metadata xesam:artist 2>/dev/null || true)',
  '      ap=$(playerctl -l 2>/dev/null | head -n 1 || true)',
  '      esc() { printf "%s" "$1" | sed \'s/\\\\/\\\\\\\\/g; s/"/\\\\"/g\' | tr -d \'\\r\\n\'; }',
  '      printf \'[{"status":"Playing","title":"%s","artist":"%s","app":"%s"}]\\n\' "$(esc "$ti")" "$(esc "$ar")" "$(esc "$ap")"',
  '    else',
  '      printf "[]\\n"',
  '    fi',
  '  fi',
  '  sleep 4 || exit 0',
  'done',
].join('\n');

function createMediaWatcher(options) {
  const opts = options || {};
  const scriptPath = opts.scriptPath || path.join(__dirname, '..', 'scripts', 'media-watcher.ps1');
  const onStatus = opts.onStatus || function () {};
  const spawnImpl = opts.spawn || spawn;
  const platform = opts.platform || process.platform;
  const isLinux = platform === 'linux';

  let child = null;
  let buffer = '';
  let restartTimer = null;
  let stopped = false;
  let lastKey = '';
  let lastStatus = { available: false, playing: false, title: '', artist: '', app: '' };

  function publish(status) {
    const key = [status.available, status.playing, status.title, status.artist, status.app].join('|');
    if (key === lastKey) return;
    lastKey = key;
    lastStatus = status;
    onStatus(status);
  }

  function handleLine(line) {
    if (!line.trim()) return;
    let sessions;
    try {
      sessions = JSON.parse(line);
    } catch {
      return;
    }
    if (!Array.isArray(sessions)) return;
    const playing = sessions.find(
      (s) => s && s.status === 'Playing' && ((s.title || '').trim() || (s.artist || '').trim()),
    );
    publish({
      available: true,
      playing: Boolean(playing),
      title: playing ? String(playing.title || '') : '',
      artist: playing ? String(playing.artist || '') : '',
      app: playing ? String(playing.app || '') : '',
    });
  }

  function scheduleRestart() {
    if (stopped || restartTimer || child) return;
    restartTimer = setTimeout(() => {
      restartTimer = null;
      start();
    }, RESTART_MS);
  }

  function start() {
    stopped = false;
    if (child) return;
    try {
      if (isLinux) {
        child = spawnImpl(
          'bash',
          ['--noprofile', '--norc', '-c', LINUX_MEDIA_SCRIPT],
          { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
        );
      } else {
        child = spawnImpl(
          'powershell.exe',
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
          { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
        );
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
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) handleLine(line);
    });
    child.on('error', () => {
      child = null;
      scheduleRestart();
    });
    child.on('exit', () => {
      child = null;
      scheduleRestart();
    });
  }

  function stop() {
    stopped = true;
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = null;
    if (child) {
      child.removeAllListeners('exit');
      child.kill();
      child = null;
    }
  }

  return { start: start, stop: stop, status: () => lastStatus };
}

module.exports = { createMediaWatcher };
