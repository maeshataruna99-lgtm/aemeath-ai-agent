'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { listSessions, sessionTitle, slugOf } = require('../src/agent/session-list');
const { sessionsReply } = require('../src/agent/agent-bridge');
const { createI18n } = require('../src/i18n');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const DIR = 'C:/proj/app';

const custom = (title) => JSON.stringify({ type: 'custom-title', customTitle: title, sessionId: A });
const generated = (title) => JSON.stringify({ type: 'ai-title', aiTitle: title, sessionId: A });
const message = (text) => JSON.stringify({ type: 'user', message: { role: 'user', content: text } });

function projects(files) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'aem-titles-'));
  const folder = path.join(base, slugOf(DIR));
  fs.mkdirSync(folder, { recursive: true });
  for (const [id, lines] of Object.entries(files)) fs.writeFileSync(path.join(folder, id + '.jsonl'), lines.join('\n') + '\n');
  return base;
}

const titleOf = (lines) => sessionTitle(DIR, A, { projectsDir: projects({ [A]: lines }) });

test('a name the owner set wins over one Claude made up, and the newest one wins', () => {
  assert.equal(titleOf([generated('Dibuat otomatis'), custom('Nama dari saya')]), 'Nama dari saya');
  assert.equal(titleOf([custom('Lama'), message('halo'), custom('Baru')]), 'Baru');
  assert.equal(titleOf([generated('Pertama'), message('halo'), generated('Terakhir')]), 'Terakhir');
});

test('a session without a title line has no name', () => {
  assert.equal(titleOf([message('halo'), message('apa kabar')]), '');
  assert.equal(titleOf([]), '');
});

test('a name is cleaned: no control characters, capped at 40, secrets hidden', () => {
  assert.equal(titleOf([custom('Baris satu\u0007\ndua\ttiga')]), 'Baris satu dua tiga');
  const long = titleOf([custom('x'.repeat(100))]);
  assert.equal(long.length, 40);
  assert.ok(long.endsWith('\u2026'));
  assert.equal(titleOf([custom('kunci sk-abcdefghijklmnopqrstuvwxyz123456')]).includes('sk-abcdef'), false);
});

test('only a line that starts with a title marker is parsed, so message text is never mistaken for a name', () => {
  const decoy = message('{"type":"custom-title","customTitle":"jebakan"}');
  assert.equal(titleOf([decoy, '{"type":"custom-title","customTitle":"jebakan bukan di awal"}'.replace('{', ' {')]), '');
  assert.equal(titleOf([decoy, custom('Asli')]), 'Asli');
});

test('a broken or half-written title line does not break anything', () => {
  assert.equal(titleOf(['{"type":"custom-title","customTitle":"terpotong', custom('Utuh')]), 'Utuh');
  assert.equal(titleOf(['{"type":"custom-title","customTitle":"terpotong']), '');
  assert.equal(titleOf(['{"type":"ai-title","aiTitle":42}']), '');
});

test('a name near the start of a huge transcript is still found', () => {
  const filler = message('x'.repeat(1000));
  const lines = [generated('Di awal')].concat(Array.from({ length: 1500 }, () => filler));
  assert.equal(titleOf(lines), 'Di awal');
});

test('a name near the end of a huge transcript is found without reading all of it', () => {
  const filler = message('x'.repeat(1000));
  const lines = Array.from({ length: 1500 }, () => filler).concat([custom('Di akhir')]);
  assert.equal(titleOf(lines), 'Di akhir');
});

test('a missing session, a bad id, and an unreadable file give no name instead of an error', () => {
  const base = projects({ [A]: [custom('Ada')] });
  assert.equal(sessionTitle(DIR, B, { projectsDir: base }), '');
  assert.equal(sessionTitle(DIR, '../../etc/passwd', { projectsDir: base }), '');
  fs.mkdirSync(path.join(base, slugOf(DIR), C + '.jsonl.d'));
  assert.equal(sessionTitle('C:/nowhere', A, { projectsDir: base }), '');
});

test('the session list carries each name and nothing from the messages', () => {
  const secretText = 'rahasia-kata-sandi-jangan-bocor';
  const base = projects({
    [A]: [message(secretText), custom('Perbaiki bug login')],
    [B]: [message(secretText)],
  });
  const old = Date.now() - 600000;
  fs.utimesSync(path.join(base, slugOf(DIR), B + '.jsonl'), new Date(old), new Date(old));
  const list = listSessions(DIR, { projectsDir: base });
  assert.deepEqual(list.map((s) => [s.id, s.title]), [[A, 'Perbaiki bug login'], [B, '']]);
  assert.equal(JSON.stringify(list).includes(secretText), false);
});

test('the session reply shows the name when there is one, in both languages', () => {
  const list = [
    { id: A, ageMs: 5 * 60000, title: 'Perbaiki bug login' },
    { id: B, ageMs: 3 * 3600000, title: '' },
  ];
  for (const locale of ['id-ID', 'en-US']) {
    const t = createI18n({ locale }).t;
    const text = sessionsReply(t, null, list);
    assert.match(text, new RegExp('1\\. Perbaiki bug login .* ' + A));
    assert.match(text, new RegExp('2\\. ' + B));
    assert.doesNotMatch(text, /\{\w+\}|agent\./);
  }
});
