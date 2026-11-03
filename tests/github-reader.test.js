'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const { createGithubReader, isValidRepo, resolveGh, githubReply, failureKey } = require('../src/integrations/github-reader');
const { createSettingsStore } = require('../src/settings');
const { createI18n } = require('../src/i18n');

const REPO = 'rover/aemeath';

// A stand-in for `gh api`: answers once, then closes. `hang` never answers.
function fakeSpawn(reply) {
  const r = reply || {};
  const calls = [];
  function spawn(bin, args, options) {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
      child.stdout.end();
      child.emit('close', null);
    };
    calls.push({ bin, args, options, child });
    if (!r.hang) {
      setImmediate(() => {
        for (const chunk of [].concat(r.stdout === undefined ? [] : r.stdout)) child.stdout.write(chunk);
        if (r.stderr) child.stderr.write(r.stderr);
        child.stdout.end();
        child.emit('close', r.code === undefined ? 0 : r.code);
      });
    }
    return child;
  }
  spawn.calls = calls;
  return spawn;
}

function readerWith(spawn, extra) {
  return createGithubReader(
    Object.assign({ spawn, getRepo: () => REPO, isEnabled: () => true, resolve: () => 'C:/gh/gh.exe', env: {} }, extra || {})
  );
}

const run = (n, over) => ({ name: 'CI' + n, head_branch: 'master', status: 'completed', conclusion: 'success', ...(over || {}) });

test('only a plain owner/name is accepted as the repository', () => {
  for (const ok of ['rover/aemeath', 'a-b/c.d_e', 'Rover1/Repo-2']) assert.equal(isValidRepo(ok), true, ok);
  for (const bad of ['', 'a', 'a/b/c', '../x', 'a/..', 'a/b c', 'a/b;rm', 'a/b?x=1', '-a/b', 'a/b\n', '/a', 'a/', 42, null, undefined]) {
    assert.equal(isValidRepo(bad), false, String(bad));
  }
});

test('gh is started from an argument list, with a fixed GET path and no shell', async () => {
  const spawn = fakeSpawn({ stdout: '{"workflow_runs":[]}' });
  await readerWith(spawn).fetch('runs');
  const { bin, args, options } = spawn.calls[0];
  assert.equal(bin, 'C:/gh/gh.exe');
  assert.deepEqual(args, ['api', '--method', 'GET', 'repos/rover/aemeath/actions/runs?per_page=5']);
  assert.equal(options.shell, undefined);
  assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
  assert.equal(options.env.GH_PROMPT_DISABLED, '1');
});

test('each kind asks for its own fixed path', async () => {
  const paths = {};
  for (const kind of ['runs', 'pulls', 'issues']) {
    const spawn = fakeSpawn({ stdout: kind === 'runs' ? '{}' : '[]' });
    await readerWith(spawn).fetch(kind);
    paths[kind] = spawn.calls[0].args[3];
  }
  assert.equal(paths.pulls, 'repos/rover/aemeath/pulls?state=open&per_page=5');
  assert.equal(paths.issues, 'repos/rover/aemeath/issues?state=open&per_page=15');
});

test('workflow runs: five at most, status folded into one state', async () => {
  const runs = [run(1), run(2, { conclusion: 'failure' }), run(3, { status: 'in_progress', conclusion: null }), run(4), run(5), run(6)];
  const res = await readerWith(fakeSpawn({ stdout: JSON.stringify({ workflow_runs: runs }) })).fetch('runs');
  assert.equal(res.ok, true);
  assert.equal(res.items.length, 5);
  assert.deepEqual(res.items.map((r) => r.state), ['success', 'failure', 'in_progress', 'success', 'success']);
});

test('pull requests: number, title, a valid author only, and the draft flag', async () => {
  const data = [
    { number: 7, title: 'Add parser', user: { login: 'rover' }, draft: false },
    { number: 9, title: 'WIP', user: { login: 'bad login!' }, draft: true },
  ];
  const res = await readerWith(fakeSpawn({ stdout: JSON.stringify(data) })).fetch('pulls');
  assert.deepEqual(res.items, [
    { number: 7, title: 'Add parser', author: 'rover', draft: false },
    { number: 9, title: 'WIP', author: '', draft: true },
  ]);
});

test('issues: pull requests that the endpoint also lists are left out', async () => {
  const data = [{ number: 3, title: 'Bug' }, { number: 4, title: 'A PR', pull_request: {} }, { number: 5, title: 'Idea' }];
  const res = await readerWith(fakeSpawn({ stdout: JSON.stringify(data) })).fetch('issues');
  assert.deepEqual(res.items.map((i) => i.number), [3, 5]);
});

test('titles are shown as one clean line: no control characters, capped, secrets hidden', async () => {
  const data = [{ number: 1, title: 'Line one\u0007\nline two\t' + 'x'.repeat(300) + ' sk-abcdefghijklmnopqrstuvwxyz123456', user: { login: 'a' } }];
  const res = await readerWith(fakeSpawn({ stdout: JSON.stringify(data) })).fetch('pulls');
  const title = res.items[0].title;
  assert.equal(/[\u0000-\u001f]/.test(title), false);
  assert.ok(title.length <= 100);
  assert.match(title, /^Line one line two/);
  const secret = await readerWith(fakeSpawn({ stdout: JSON.stringify([{ number: 2, title: 'fix sk-abcdefghijklmnopqrstuvwxyz123456 now' }]) })).fetch('issues');
  assert.equal(secret.items[0].title.includes('sk-abcdef'), false);
});

test('multi-byte characters split across chunks are read correctly', async () => {
  const bytes = Buffer.from(JSON.stringify([{ number: 1, title: 'perbaiki éé bug' }]));
  const cut = bytes.indexOf(Buffer.from('é')) + 1;
  const res = await readerWith(fakeSpawn({ stdout: [bytes.subarray(0, cut), bytes.subarray(cut)] })).fetch('issues');
  assert.equal(res.items[0].title, 'perbaiki éé bug');
});

test('nothing is started when the reader is off, has no repo, a bad repo, or no gh', async () => {
  const spawn = fakeSpawn({ stdout: '[]' });
  assert.deepEqual(await readerWith(spawn, { isEnabled: () => false }).fetch('pulls'), { ok: false, code: 'disabled' });
  assert.deepEqual(await readerWith(spawn, { getRepo: () => '' }).fetch('pulls'), { ok: false, code: 'no_repo' });
  assert.deepEqual(await readerWith(spawn, { getRepo: () => 'a/b; rm -rf /' }).fetch('pulls'), { ok: false, code: 'bad_repo' });
  assert.deepEqual(await readerWith(spawn, { getRepo: () => '../../etc' }).fetch('pulls'), { ok: false, code: 'bad_repo' });
  assert.deepEqual(await readerWith(spawn, { resolve: () => null }).fetch('pulls'), { ok: false, code: 'gh_missing' });
  assert.deepEqual(await readerWith(spawn).fetch('rate_limit'), { ok: false, code: 'bad_kind' });
  assert.deepEqual(await readerWith(spawn).fetch('constructor'), { ok: false, code: 'bad_kind' });
  assert.equal(spawn.calls.length, 0);
});

test('failures are told apart from gh exit and error text', async () => {
  const code = async (reply) => (await readerWith(fakeSpawn(reply)).fetch('pulls')).code;
  assert.equal(await code({ code: 1, stderr: 'gh: Not Found (HTTP 404)' }), 'not_found');
  assert.equal(await code({ code: 4, stderr: 'To get started with GitHub CLI, please run:  gh auth login' }), 'auth');
  assert.equal(await code({ code: 1, stderr: 'HTTP 403: Resource not accessible' }), 'auth');
  assert.equal(await code({ code: 1, stderr: 'dial tcp: lookup api.github.com' }), 'gh_failed');
  assert.equal(await code({ stdout: 'not json' }), 'bad_output');
});

test('a spawn that throws is a plain failure, not a crash', async () => {
  const reader = readerWith(() => {
    throw new Error('EACCES');
  });
  assert.deepEqual(await reader.fetch('pulls'), { ok: false, code: 'gh_failed' });
});

test('an answer over the size cap is refused', async () => {
  const big = Buffer.alloc(1024 * 1024 + 10, 'a');
  assert.deepEqual(await readerWith(fakeSpawn({ stdout: [big] })).fetch('pulls'), { ok: false, code: 'bad_output' });
});

test('a hung gh is stopped after the timeout', async () => {
  const spawn = fakeSpawn({ hang: true });
  const res = await readerWith(spawn, { timeoutMs: 20 }).fetch('runs');
  assert.deepEqual(res, { ok: false, code: 'timeout' });
  assert.equal(spawn.calls[0].child.killed, true);
});

test('resolveGh picks gh.exe on Windows and never the .cmd shim', () => {
  const found = new Set([path.join('C:\\Program Files', 'GitHub CLI', 'gh.exe'), path.join('C:\\npm', 'gh.cmd')]);
  const exists = (p) => found.has(p);
  assert.equal(resolveGh({ ProgramFiles: 'C:\\Program Files', PATH: 'C:\\npm' }, 'win32', exists), path.join('C:\\Program Files', 'GitHub CLI', 'gh.exe'));
  assert.equal(resolveGh({ PATH: 'C:\\npm' }, 'win32', exists), null);
});

test('the reply reads well in both languages and fills every placeholder', () => {
  const runs = [{ name: 'CI', branch: 'master', state: 'success' }, { name: 'Build', branch: 'dev', state: 'weird' }];
  const pulls = [{ number: 7, title: 'Add parser', author: 'rover', draft: false }, { number: 9, title: 'WIP', author: '', draft: true }];
  const issues = [{ number: 3, title: 'Bug' }];
  for (const locale of ['id-ID', 'en-US']) {
    const t = createI18n({ locale }).t;
    const texts = [githubReply(t, 'runs', runs), githubReply(t, 'pulls', pulls), githubReply(t, 'issues', issues)];
    for (const text of texts) assert.doesNotMatch(text, /\{\w+\}|github\./, locale + ': ' + text);
    assert.match(texts[0], /CI · master/);
    assert.match(texts[1], /#9 WIP \(\?\) \[draft\]/);
    assert.match(texts[2], /#3 Bug/);
    for (const kind of ['runs', 'pulls', 'issues']) {
      const empty = githubReply(t, kind, []);
      assert.doesNotMatch(empty, /github\./);
    }
  }
});

test('every failure code and state has text in both languages', () => {
  const codes = ['disabled', 'no_repo', 'bad_repo', 'gh_missing', 'not_found', 'auth', 'gh_failed', 'timeout', 'bad_output', 'whatever'];
  const extra = ['usage', 'state_success', 'state_failure', 'state_cancelled', 'state_in_progress', 'state_queued', 'state_skipped', 'state_timed_out', 'state_other'];
  const settingsKeys = ['title', 'toggle', 'repo_label', 'saved', 'invalid', 'hint'];
  for (const locale of ['id-ID', 'en-US']) {
    const t = createI18n({ locale }).t;
    for (const code of codes) assert.notEqual(t(failureKey(code)), failureKey(code), locale + ' ' + code);
    for (const key of extra) assert.notEqual(t('github.' + key), 'github.' + key, locale + ' ' + key);
    for (const key of settingsKeys) assert.notEqual(t('settings.github.' + key), 'settings.github.' + key, locale + ' ' + key);
  }
});

test('the settings keep the reader off by default and refuse a bad repository', () => {
  const store = createSettingsStore(fs.mkdtempSync(path.join(os.tmpdir(), 'aem-gh-')));
  const first = store.load();
  assert.equal(first.githubEnabled, false);
  assert.equal(first.githubRepo, '');
  assert.equal(store.save({ githubRepo: 'rover/aemeath' }).githubRepo, 'rover/aemeath');
  for (const bad of ['rover', 'a/b/c', 'a/b; rm', '..\\x', 42, null]) {
    assert.equal(store.save({ githubRepo: bad }).githubRepo, '', String(bad));
  }
  assert.equal(store.save({ githubEnabled: true }).githubEnabled, true);
  assert.equal(store.save({ githubEnabled: 'yes' }).githubEnabled, false);
});
