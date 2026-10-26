'use strict';

// Runs one validated command. Nothing here goes through a shell: files and
// folders are handed to the OS shell's open verb, programs with arguments are
// started directly with an argument array, links must be http or https, and a
// PowerShell command is passed as an encoded script, never as a command line.

const path = require('node:path');
const { isUrl } = require('./command-store');

const POWERSHELL_TIMEOUT_MS = 30000;
const MAX_OUTPUT = 4000;
// Captured PowerShell wraps errors and progress in XML on stderr. To keep the reply readable the
// script runs inside a block whose every stream is merged into plain text, errors that escape it
// are caught and printed, and the exit code still says whether anything went wrong.
const WRAP_HEAD =
  "[Console]::OutputEncoding = [Text.Encoding]::UTF8; $ProgressPreference = 'SilentlyContinue'; " +
  '$Error.Clear(); $global:LASTEXITCODE = 0; try { & { ';
const WRAP_TAIL =
  ' } *>&1 | Out-String -Stream } catch { ($_ | Out-String).TrimEnd() }; ' +
  'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } elseif ($Error.Count -gt 0) { exit 1 }';

// Safety net for what still arrives as XML (for example a script that does not even parse):
// keep the messages, drop the framing and the progress records.
const CLIXML_HEADER = /#< CLIXML\r?\n/g;
const CLIXML_BLOCK = /<Objs\b[\s\S]*?<\/Objs>/g;
const CLIXML_TEXT = /<S S="[A-Za-z]*">([\s\S]*?)<\/S>/g;

function xmlText(block) {
  const parts = [];
  let match;
  CLIXML_TEXT.lastIndex = 0;
  while ((match = CLIXML_TEXT.exec(block)) !== null) parts.push(match[1]);
  return parts
    .join('')
    .replace(/_x([0-9A-Fa-f]{4})_/g, (whole, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// Expands %NAME% from the environment; unknown names are left as they are, so
// the existence check fails instead of opening something unintended.
function expandEnv(text, env) {
  return text.replace(/%([A-Za-z0-9_]+)%/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(env, name) ? env[name] : whole,
  );
}

// Splits an argument string on spaces, keeping "quoted parts" together.
function parseArgs(text) {
  const args = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) args.push(match[1] !== undefined ? match[1] : match[2]);
  return args;
}

// PowerShell's -EncodedCommand takes UTF-16LE base64, which sidesteps every quoting problem.
function encodeScript(script) {
  return Buffer.from(WRAP_HEAD + script + WRAP_TAIL, 'utf16le').toString('base64');
}

function cleanOutput(text) {
  let out = text
    .replace(CLIXML_HEADER, '')
    .replace(CLIXML_BLOCK, (block) => xmlText(block))
    .replace(/\r\n/g, '\n')
    .replace(/\s+$/, '')
    .replace(/^\n+/, '');
  if (out.length > MAX_OUTPUT) out = out.slice(0, MAX_OUTPUT) + '\n[keluaran dipotong]';
  return out;
}

// deps: { shell: { openPath, openExternal }, spawn, exists(path) -> boolean, env, timeoutMs? }
function createCommandRunner(deps) {
  const timeoutMs = deps.timeoutMs || POWERSHELL_TIMEOUT_MS;

  function startProgram(file, args) {
    return new Promise((resolve) => {
      let child;
      try {
        child = deps.spawn(file, args, {
          detached: true,
          stdio: 'ignore',
          shell: false,
          cwd: path.dirname(file),
        });
      } catch (error) {
        resolve({ ok: false, code: 'failed', error: error.message });
        return;
      }
      child.once('error', (error) => resolve({ ok: false, code: 'failed', error: error.message }));
      child.once('spawn', () => {
        if (typeof child.unref === 'function') child.unref();
        resolve({ ok: true });
      });
    });
  }

  // Runs a one-off PowerShell as the current user and returns what it printed.
  // Resolves to { ok, output, exitCode?, timedOut?, code?, error? }.
  function runPowerShell(command) {
    return new Promise((resolve) => {
      let child;
      try {
        child = deps.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-OutputFormat', 'Text', '-EncodedCommand', encodeScript(command.script)], {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          shell: false,
        });
      } catch (error) {
        resolve({ ok: false, code: 'failed', error: error.message, output: '' });
        return;
      }
      let text = '';
      let settled = false;
      const settle = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(Object.assign({ output: cleanOutput(text) }, result));
      };
      const timer = setTimeout(() => {
        if (child.pid) {
          try {
            deps.spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
          } catch {
            // already gone
          }
        }
        settle({ ok: false, code: 'timeout', timedOut: true });
      }, timeoutMs);
      for (const stream of [child.stdout, child.stderr]) {
        if (!stream) continue;
        if (stream.setEncoding) stream.setEncoding('utf8');
        stream.on('data', (chunk) => {
          if (text.length < MAX_OUTPUT * 2) text += chunk;
        });
      }
      child.once('error', (error) => settle({ ok: false, code: 'failed', error: error.message }));
      child.once('close', (exitCode) =>
        settle(exitCode === 0 ? { ok: true, exitCode: 0 } : { ok: false, code: 'exit', exitCode: exitCode }),
      );
    });
  }

  // Resolves to { ok: true } or { ok: false, code: 'missing' | 'failed' | 'exit' | 'timeout', error? }.
  async function run(command) {
    if (command.type === 'powershell') return runPowerShell(command);

    const target = command.target;
    if (isUrl(target)) {
      try {
        await deps.shell.openExternal(target);
        return { ok: true };
      } catch (error) {
        return { ok: false, code: 'failed', error: error.message };
      }
    }

    const resolved = expandEnv(target, deps.env);
    if (!deps.exists(resolved)) return { ok: false, code: 'missing' };
    if (command.args && /\.exe$/i.test(resolved)) return startProgram(resolved, parseArgs(command.args));

    const failure = await deps.shell.openPath(resolved);
    return failure ? { ok: false, code: 'failed', error: failure } : { ok: true };
  }

  return { run: run };
}

module.exports = { createCommandRunner, expandEnv, parseArgs, encodeScript, POWERSHELL_TIMEOUT_MS };
