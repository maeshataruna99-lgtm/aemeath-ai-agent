'use strict';

// Runs one Claude Code CLI turn: `claude -p --output-format stream-json`.
//
// The prompt goes in on stdin, so it never appears on a command line and text
// that looks like a flag stays text. The process is started from an argument
// list, without a shell and with the owner's normal rights (project rule §7).
// `--permission-prompts none` denies anything that would ask for approval, so
// this first version can read and answer but not edit files or run commands.

const fs = require('node:fs');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');
const { createStreamParser } = require('./claude-stream');

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PROMPT = 8000;
const MAX_PERSONA = 4000;
// The tools an approved turn may use. Not acceptEdits: that mode also lets some shell
// commands (a redirect like echo > file) through, which a typed "ya" must not cover.
const { EDIT_TOOLS, optionArgs } = require('./agent-options');

function coded(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

// Finds the real binary. Windows gets claude.exe only: claude.cmd needs a shell.
function resolveClaude(env, platform, exists) {
  const e = env || process.env;
  const win = (platform || process.platform) === 'win32';
  const has = exists || fs.existsSync;
  const name = win ? 'claude.exe' : 'claude';
  const dirs = [];
  if (e.USERPROFILE && win) dirs.push(path.join(e.USERPROFILE, '.local', 'bin'));
  if (e.HOME && !win) dirs.push(path.join(e.HOME, '.local', 'bin'));
  for (const dir of String(e.PATH || e.Path || '').split(win ? ';' : ':')) if (dir) dirs.push(dir);
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    if (has(candidate)) return candidate;
  }
  return null;
}

function buildArgs(sessionId, approveEdits, persona, options) {
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--setting-sources', 'project', '--permission-prompts', 'none'];
  if (sessionId) args.push('--resume', sessionId);
  // Aemeath's voice, as one extra system prompt argument (never part of the user's message).
  if (persona) args.push('--append-system-prompt', persona);
  // Model, effort and permission kind from the owner's choices, all checked against fixed lists. An
  // approved turn (a typed "ya") lets file edits through for that turn only. Commands stay denied.
  args.push(...optionArgs(options, approveEdits === true));
  return args;
}

// options: { spawn, cwd | cwd() -> path, env?, resolve?() -> path | null, isDir?(path) -> boolean }
function createClaudeAdapter(options) {
  const spawn = options.spawn;
  const cwdOf = typeof options.cwd === 'function' ? options.cwd : () => options.cwd;
  const isDir =
    options.isDir ||
    ((p) => {
      try {
        return fs.statSync(p).isDirectory();
      } catch {
        return false;
      }
    });
  const env = options.env || process.env;
  const resolve = options.resolve || (() => resolveClaude(env));

  // run({ prompt, sessionId?, signal?, onText?(delta), onStep?(step), approveEdits?, persona?, options? }) -> Promise<{ sessionId, text, denials }>
  // Rejects with an error whose `code` is one of: not_installed, invalid_session,
  // empty_prompt, bad_dir, spawn_failed, auth, max_turns, api, error, no_result.
  function run(input) {
    const prompt = String(input.prompt == null ? '' : input.prompt).trim().slice(0, MAX_PROMPT);
    if (!prompt) return Promise.reject(coded('empty_prompt'));
    if (input.sessionId && !SESSION_ID.test(input.sessionId)) return Promise.reject(coded('invalid_session'));
    const bin = resolve();
    if (!bin) return Promise.reject(coded('not_installed'));
    const cwd = cwdOf();
    if (!cwd || !isDir(cwd)) return Promise.reject(coded('bad_dir'));

    return new Promise((resolvePromise, reject) => {
      let child;
      try {
        child = spawn(bin, buildArgs(input.sessionId, input.approveEdits === true, typeof input.persona === 'string' ? input.persona.slice(0, MAX_PERSONA) : null, input.options), { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch {
        reject(coded('spawn_failed'));
        return;
      }
      const feed = createStreamParser();
      let buffer = '';
      let sessionId = input.sessionId || null;
      let model = '';
      let outcome = null; // { done } or { failed }
      let settled = false;

      const finish = (fn) => {
        if (settled) return;
        settled = true;
        fn();
      };

      function handle(line) {
        const event = feed(line);
        if (!event) return;
        if (event.sessionId) sessionId = event.sessionId;
        if (event.kind === 'session' && event.model) model = event.model;
        if (event.kind === 'delta' && input.onText) input.onText(event.text);
        if (input.onStep) {
          if (event.kind === 'session') input.onStep({ kind: 'start', model: event.model });
          else if (event.kind === 'thinking') input.onStep({ kind: 'thinking' });
          else if (event.kind === 'tool') for (const use of event.uses) input.onStep({ kind: 'tool', name: use.name, target: use.target });
        }
        if (event.kind === 'done') outcome = { done: event.text, denials: event.denials || [] };
        if (event.kind === 'failed') outcome = { failed: event.reason };
      }

      const decoder = new StringDecoder('utf8'); // a character can be split across chunks
      child.stdout.on('data', (chunk) => {
        buffer += decoder.write(chunk);
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          handle(buffer.slice(0, index));
          buffer = buffer.slice(index + 1);
        }
      });
      child.stderr.on('data', () => {}); // never kept: it can echo the prompt
      child.stdin.on('error', () => {});
      child.on('error', () => finish(() => reject(coded('spawn_failed'))));
      child.on('close', () => {
        if (buffer.trim()) handle(buffer);
        finish(() => {
          if (outcome && outcome.done !== undefined) resolvePromise({ sessionId, text: outcome.done, denials: outcome.denials, model });
          else if (outcome && outcome.failed) reject(coded(outcome.failed));
          else reject(coded('no_result'));
        });
      });

      if (input.signal) {
        const stop = () => {
          try {
            child.kill();
          } catch {
            // already gone
          }
        };
        if (input.signal.aborted) stop();
        else input.signal.addEventListener('abort', stop, { once: true });
      }

      child.stdin.end(prompt);
    });
  }

  return { run };
}

module.exports = { createClaudeAdapter, resolveClaude, buildArgs, EDIT_TOOLS, SESSION_ID };
