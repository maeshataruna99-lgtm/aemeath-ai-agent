'use strict';

// Runs one validated command. Nothing here goes through a shell: files and
// folders are handed to the OS shell's open verb, programs with arguments are
// started directly with an argument array, and links must be http or https.

const path = require('node:path');
const { isUrl } = require('./command-store');

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

// deps: { shell: { openPath, openExternal }, spawn, exists(path) -> boolean, env }
function createCommandRunner(deps) {
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

  // Resolves to { ok: true } or { ok: false, code: 'missing' | 'failed', error? }.
  async function run(command) {
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

module.exports = { createCommandRunner, expandEnv, parseArgs };
