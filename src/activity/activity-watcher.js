'use strict';

// Spawns scripts/activity-watcher.ps1 and hands each foreground-window sample to
// onSample. Unlike a one-shot watcher it can be stopped and started again, so
// switching interactive mode off and on works. The child dies with the app: its
// stdout is a pipe, and PowerShell exits when the pipe closes.

const { spawn } = require('node:child_process');
const path = require('node:path');

const RESTART_MS = 10000;

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
      child = spawnImpl('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
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
