'use strict';

// Read-only GitHub reader (decision D-015). It asks the owner's own `gh` CLI for
// three fixed things about one repository: recent workflow runs, open pull
// requests, open issues. There is no free-form endpoint and nothing is written.
//
// Aemeath never sees a token: the login lives in `gh`. `gh` is started from an
// argument list, without a shell. The only thing sent is the repository name.
// What comes back is only displayed (sanitized); it is never given to a model
// or run as a command.

const fs = require('node:fs');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');
const { redact } = require('../chat/chat-error');

const TIMEOUT_MS = 15000;
const MAX_OUTPUT = 1024 * 1024;
const LIMIT = 5;
const MAX_TITLE = 100;

// owner/name with the characters GitHub allows, nothing that could change the path.
const REPO = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9_.-]{1,100}$/;

function isValidRepo(value) {
  return typeof value === 'string' && REPO.test(value) && !value.includes('..');
}

const KINDS = {
  runs: (repo) => `repos/${repo}/actions/runs?per_page=${LIMIT}`,
  pulls: (repo) => `repos/${repo}/pulls?state=open&per_page=${LIMIT}`,
  // the issues endpoint also lists pull requests, so ask for more and filter
  issues: (repo) => `repos/${repo}/issues?state=open&per_page=${LIMIT * 3}`,
};

function coded(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

// Windows gets gh.exe only: a .cmd shim would need a shell.
function resolveGh(env, platform, exists) {
  const e = env || process.env;
  const win = (platform || process.platform) === 'win32';
  const has = exists || fs.existsSync;
  const name = win ? 'gh.exe' : 'gh';
  const dirs = [];
  if (win && e.ProgramFiles) dirs.push(path.join(e.ProgramFiles, 'GitHub CLI'));
  for (const dir of String(e.PATH || e.Path || '').split(win ? ';' : ':')) if (dir) dirs.push(dir);
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    if (has(candidate)) return candidate;
  }
  return null;
}

// One line of text that is safe to show: no control characters, no secret-looking text.
function cleanTitle(raw) {
  return redact(
    String(raw == null ? '' : raw)
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_TITLE)
  );
}

function login(raw) {
  return /^[A-Za-z0-9-]{1,39}$/.test(String(raw)) ? String(raw) : '';
}

function parseRuns(data) {
  const runs = data && Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
  return runs.slice(0, LIMIT).map((r) => ({
    name: cleanTitle(r.name),
    branch: cleanTitle(r.head_branch),
    state: r.status === 'completed' ? String(r.conclusion || 'other') : String(r.status || 'other'),
  }));
}

function parsePulls(data) {
  return (Array.isArray(data) ? data : []).slice(0, LIMIT).map((p) => ({
    number: Number(p.number) || 0,
    title: cleanTitle(p.title),
    author: login(p.user && p.user.login),
    draft: p.draft === true,
  }));
}

function parseIssues(data) {
  return (Array.isArray(data) ? data : [])
    .filter((i) => i && !i.pull_request)
    .slice(0, LIMIT)
    .map((i) => ({ number: Number(i.number) || 0, title: cleanTitle(i.title) }));
}

const PARSERS = { runs: parseRuns, pulls: parsePulls, issues: parseIssues };

// What went wrong, from gh's exit and a look at its error text (which is not kept).
function classify(stderr) {
  const text = String(stderr);
  if (/HTTP 404|Not Found/i.test(text)) return 'not_found';
  if (/gh auth login|authentication|HTTP 401|HTTP 403|bad credentials/i.test(text)) return 'auth';
  return 'gh_failed';
}

// options: { spawn, getRepo() -> string, isEnabled() -> boolean, resolve?() -> path | null, env?, timeoutMs? }
function createGithubReader(options) {
  const spawn = options.spawn;
  const env = options.env || process.env;
  const resolve = options.resolve || (() => resolveGh(env));
  const timeoutMs = options.timeoutMs || TIMEOUT_MS;

  function callGh(bin, endpoint) {
    return new Promise((resolvePromise, reject) => {
      let child;
      try {
        child = spawn(bin, ['api', '--method', 'GET', endpoint], {
          env: Object.assign({}, env, { GH_PROMPT_DISABLED: '1', NO_COLOR: '1' }),
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch {
        reject(coded('gh_failed'));
        return;
      }
      const decoder = new StringDecoder('utf8'); // a character can be split across chunks
      let out = '';
      let err = '';
      let size = 0;
      let settled = false;
      let timedOut = false;
      const finish = (fn) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill();
        } catch {
          // already gone
        }
      }, timeoutMs);
      child.stdout.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_OUTPUT) {
          try {
            child.kill();
          } catch {
            // already gone
          }
          return;
        }
        out += decoder.write(chunk);
      });
      child.stderr.on('data', (chunk) => {
        if (err.length < 2000) err += chunk;
      });
      child.on('error', () => finish(() => reject(coded('gh_failed'))));
      child.on('close', (code) =>
        finish(() => {
          if (timedOut) return reject(coded('timeout'));
          if (size > MAX_OUTPUT) return reject(coded('bad_output'));
          if (code !== 0) return reject(coded(classify(err)));
          resolvePromise(out);
        })
      );
    });
  }

  // kind: 'runs' | 'pulls' | 'issues'
  // -> { ok: true, kind, items } | { ok: false, code }
  async function fetchKind(kind) {
    if (!options.isEnabled()) return { ok: false, code: 'disabled' };
    if (!Object.prototype.hasOwnProperty.call(KINDS, kind)) return { ok: false, code: 'bad_kind' };
    const repo = String(options.getRepo() || '').trim();
    if (!repo) return { ok: false, code: 'no_repo' };
    if (!isValidRepo(repo)) return { ok: false, code: 'bad_repo' };
    const bin = resolve();
    if (!bin) return { ok: false, code: 'gh_missing' };
    try {
      const raw = await callGh(bin, KINDS[kind](repo));
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return { ok: false, code: 'bad_output' };
      }
      return { ok: true, kind, items: PARSERS[kind](data) };
    } catch (error) {
      return { ok: false, code: error.code || 'gh_failed' };
    }
  }

  return { fetch: fetchKind };
}

const FAILURE_CODES = new Set(['disabled', 'no_repo', 'bad_repo', 'gh_missing', 'not_found', 'auth', 'gh_failed', 'timeout', 'bad_output']);

// Catalog key for a failure code; anything unknown reads as a plain failure.
function failureKey(code) {
  return 'github.' + (FAILURE_CODES.has(code) ? code : 'gh_failed');
}

const STATES = new Set(['success', 'failure', 'cancelled', 'in_progress', 'queued', 'skipped', 'timed_out']);

// The reader's result as chat text, in the language of `tr`.
function githubReply(tr, kind, items) {
  if (kind === 'runs') {
    if (items.length === 0) return tr('github.runs_none');
    const rows = items.map((r) =>
      tr('github.run_row', { name: r.name, branch: r.branch, state: tr('github.state_' + (STATES.has(r.state) ? r.state : 'other')) })
    );
    return [tr('github.runs_header')].concat(rows).join('\n');
  }
  if (kind === 'pulls') {
    if (items.length === 0) return tr('github.pulls_none');
    const rows = items.map((p) =>
      tr('github.pull_row', { number: p.number, title: p.title, author: p.author || '?' }) + (p.draft ? ' ' + tr('github.draft_mark') : '')
    );
    return [tr('github.pulls_header')].concat(rows).join('\n');
  }
  if (items.length === 0) return tr('github.issues_none');
  const rows = items.map((i) => tr('github.issue_row', { number: i.number, title: i.title }));
  return [tr('github.issues_header')].concat(rows).join('\n');
}

module.exports = { createGithubReader, isValidRepo, resolveGh, githubReply, failureKey, KINDS, LIMIT };
