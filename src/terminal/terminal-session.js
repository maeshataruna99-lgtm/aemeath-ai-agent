'use strict';

// A long-lived PowerShell session behind the chat box's terminal mode. Commands
// go in on stdin and the output is read back up to a one-off marker line, so the
// working directory and variables survive from one command to the next.
//
// The shell runs as the current user. Nothing is elevated, nothing is logged and
// no history is written anywhere.

const { randomUUID } = require('node:crypto');

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_OUTPUT = 20000;
const MAX_INPUT = 2000;
const TRAILING_STDERR_MS = 80;
const ESC = String.fromCharCode(27);
const ANSI = new RegExp(ESC + '\\[[0-9;?]*[ -/]*[@-~]', 'g');
const CONTROL = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]');

// Switches the host to UTF-8 and drops progress bars, which would flood stdout.
const PREAMBLE =
  "[Console]::OutputEncoding = [Text.Encoding]::UTF8; $OutputEncoding = [Text.Encoding]::UTF8; $ProgressPreference = 'SilentlyContinue'";

function defaultKillTree(spawn, pid, isPosix) {
  try {
    if (isPosix) {
      spawn('kill', ['-9', String(pid)], { stdio: 'ignore' });
    } else {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    }
  } catch {
    // the process may already be gone
  }
}

// options: { spawn, cwd, shell?, platform?, timeoutMs?, killTree? }
function createTerminalSession(options) {
  const spawn = options.spawn;
  const platform = options.platform || process.platform;
  const isPosix = platform === 'linux' || platform === 'darwin' || /(?:^|[\\/])(?:ba)?sh$/i.test(options.shell || '');
  const shell = options.shell || (isPosix ? 'bash' : 'powershell.exe');
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const killTree = options.killTree || ((pid) => defaultKillTree(spawn, pid, isPosix));

  let child = null;
  let workingDir = options.cwd;
  let waiting = null; // { token, text, resolve, timer }

  function launch() {
    const args = isPosix
      ? ['--noprofile', '--norc']
      : ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '-'];
    child = spawn(shell, args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });
    const mine = child;
    mine.stdout.setEncoding('utf8');
    mine.stderr.setEncoding('utf8');
    mine.stdout.on('data', (chunk) => onData(mine, chunk));
    mine.stderr.on('data', (chunk) => onData(mine, chunk));
    mine.on('error', () => finish(mine, { dead: true }));
    mine.on('exit', () => finish(mine, { dead: true }));
    mine.stdin.on('error', () => {});
    if (!isPosix) mine.stdin.write(PREAMBLE + '\n');
  }

  function onData(source, chunk) {
    if (source !== child || !waiting) return;
    waiting.text += chunk;
    const marker = waiting.text.indexOf(waiting.token + '|');
    if (marker === -1) return;
    const end = waiting.text.indexOf('\n', marker);
    if (end === -1) return;
    const dir = waiting.text.slice(marker + waiting.token.length + 1, end).replace(/\|?\r?$/, '');
    if (dir) workingDir = dir;
    // stderr can land a moment after the marker; give it a short grace period
    const current = waiting;
    current.body = current.text.slice(0, marker);
    clearTimeout(current.timer);
    setTimeout(() => {
      if (waiting !== current) return;
      finish(source, { body: current.body + current.text.slice(end + 1) });
    }, TRAILING_STDERR_MS);
  }

  function clean(text) {
    let out = text.replace(ANSI, '').replace(/\r\n/g, '\n').replace(/^\n+/, '').replace(/\s+$/, '');
    if (out.length > MAX_OUTPUT) out = out.slice(0, MAX_OUTPUT) + '\n[keluaran dipotong]';
    return out;
  }

  function finish(source, result) {
    if (source !== child || !waiting) {
      if (result.dead && source === child) child = null;
      return;
    }
    const current = waiting;
    waiting = null;
    clearTimeout(current.timer);
    if (result.dead) child = null;
    current.resolve({
      output: clean(result.body !== undefined ? result.body : current.text),
      cwd: workingDir,
      timedOut: Boolean(result.timedOut),
      ended: Boolean(result.dead),
    });
  }

  function start() {
    if (!child) launch();
  }

  // Resolves to { output, cwd, timedOut, ended } or rejects with a short reason.
  function run(command) {
    const line = String(command == null ? '' : command).trim();
    if (!line) return Promise.reject(new Error('empty'));
    if (/[\r\n]/.test(line)) return Promise.reject(new Error('multiline'));
    if (line.length > MAX_INPUT) return Promise.reject(new Error('too-long'));
    if (CONTROL.test(line)) return Promise.reject(new Error('control'));
    if (waiting) return Promise.reject(new Error('busy'));
    if (!child) launch();

    return new Promise((resolve) => {
      const token = 'AEM' + randomUUID().replace(/-/g, '');
      const mine = child;
      waiting = { token: token, text: '', resolve: resolve, timer: null };
      waiting.timer = setTimeout(() => {
        const pid = mine.pid;
        finish(mine, { timedOut: true, dead: true });
        if (pid) killTree(pid);
      }, timeoutMs);
      // The command travels as base64, so the shell never misreads its encoding and a stray
      // quote or brace can neither break the line nor swallow the marker that follows.
      // Dot-sourcing keeps variables in this session; `*>&1` merges every stream into the output.
      const encoded = Buffer.from(line, 'utf8').toString('base64');
      if (isPosix) {
        mine.stdin.write("eval \"$(printf '%s' '" + encoded + "' | base64 -d)\" 2>&1\n");
        mine.stdin.write('printf "' + token + '|%s|\\n" "$PWD"\n');
      } else {
        mine.stdin.write(
          ". ([scriptblock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" +
            encoded +
            "')))) *>&1 | Out-String -Stream\n",
        );
        mine.stdin.write('Write-Output ("' + token + '|" + (Get-Location).Path + "|")\n');
      }
    });
  }

  function stop() {
    const pid = child && child.pid;
    const wasWaiting = waiting;
    if (wasWaiting) finish(child, { dead: true });
    child = null;
    if (pid) killTree(pid);
  }

  return {
    start: start,
    run: run,
    stop: stop,
    get cwd() {
      return workingDir;
    },
  };
}

module.exports = { createTerminalSession, MAX_OUTPUT, MAX_INPUT, DEFAULT_TIMEOUT_MS };
