'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { validateLorebook, createLorebook } = require('../src/lorebook');
const { loadLorebook } = require('../src/lorebook-loader');
const { createLocalResponder } = require('../src/chat/local-responder');
const { createLorebookUpdater, extractChunks } = require('../src/lorebook-updater');

const loreDir = path.join(__dirname, '..', 'lorebook');

test('all shipped lorebook entries specify valid source, status, kind, and checkedAt date', () => {
  const data = loadLorebook(loreDir);
  assert.ok(data.entries.length >= 74);

  for (const entry of data.entries) {
    assert.ok(entry.source, `Entry ${entry.id} must have a source`);
    assert.ok(data.sources[entry.source], `Entry ${entry.id} source must exist in sources.json`);
    assert.ok(['verified', 'unverified'].includes(entry.status), `Entry ${entry.id} must have valid status`);
    assert.ok(['canon', 'interpretation', 'evolving'].includes(entry.kind), `Entry ${entry.id} must have valid kind`);
    assert.match(entry.checkedAt, /^\d{4}-\d{2}-\d{2}$/, `Entry ${entry.id} must have checkedAt YYYY-MM-DD`);
  }
});

test('validateLorebook flags invalid or missing status, kind, or checkedAt metadata', () => {
  const bad = {
    sources: {
      src1: { title: 'Source 1', url: 'https://example.com/1', license: 'CC BY-SA', licenseUrl: 'https://lic', accessed: '2026-10-27' },
    },
    entries: [
      { id: 'missing-status', topic: 'Topik', source: 'src1', text: 'Teks lore', kind: 'canon', checkedAt: '2026-10-27' },
      { id: 'bad-status', topic: 'Topik', source: 'src1', text: 'Teks lore', status: 'invalid-status', kind: 'canon', checkedAt: '2026-10-27' },
      { id: 'missing-kind', topic: 'Topik', source: 'src1', text: 'Teks lore', status: 'verified', checkedAt: '2026-10-27' },
      { id: 'bad-kind', topic: 'Topik', source: 'src1', text: 'Teks lore', status: 'verified', kind: 'fanfiction', checkedAt: '2026-10-27' },
      { id: 'bad-date', topic: 'Topik', source: 'src1', text: 'Teks lore', status: 'verified', kind: 'canon', checkedAt: 'not-a-date' },
    ],
  };

  const problems = validateLorebook(bad).join('; ');
  assert.match(problems, /missing-status.*status/i);
  assert.match(problems, /bad-status.*status/i);
  assert.match(problems, /missing-kind.*kind/i);
  assert.match(problems, /bad-kind.*kind/i);
  assert.match(problems, /bad-date.*checkedAt/i);
});

test('localResponder never uses unverified or unsourced entries as certain answers', () => {
  const shippedData = loadLorebook(loreDir);
  const testEntries = shippedData.entries.map((e) => ({
    id: e.id,
    topic: e.topic,
    source: e.source,
    text: e.text,
    status: e.status,
    kind: e.kind,
    checkedAt: e.checkedAt,
    credit: shippedData.sources[e.source],
  }));

  // Append unverified and unsourced entries
  testEntries.push({
    id: 'unverified-entry',
    topic: 'Threnodian Rahasia',
    source: 'wiki-lore',
    text: 'Threnodian konon bisa dijinakkan dengan permen karet rasa stroberi.',
    status: 'unverified',
    kind: 'interpretation',
    checkedAt: '2026-10-27',
    credit: shippedData.sources['wiki-lore'],
  });

  testEntries.push({
    id: 'unsourced-entry',
    topic: 'Kabar Angin Solaris',
    source: null,
    text: 'Kabar burung tanpa sumber yang valid tentang teknologi masa depan.',
    status: 'unverified',
    kind: 'evolving',
    checkedAt: '2026-10-27',
    credit: null,
  });

  const responder = createLocalResponder({
    getEntries: () => testEntries,
    rng: () => 0,
  });

  // Searching for query matching unverified entry should NOT return it as certain answer
  const unverifiedRes = responder.respond('permen karet rasa stroberi', 'offline');
  assert.equal(unverifiedRes.matched, false);
  assert.doesNotMatch(unverifiedRes.text, /permen karet/i);

  // Searching for unsourced entry should NOT match
  const unsourcedRes = responder.respond('Kabar burung tanpa sumber', 'offline');
  assert.equal(unsourcedRes.matched, false);

  // Searching for verified canon entry returns a valid sourced reply
  const canonRes = responder.respond('Apa itu Exostrider', 'offline');
  assert.equal(canonRes.matched, true);
  assert.match(canonRes.text, /Exostrider/i);
  assert.ok(canonRes.sources.length >= 1);
});

test('lorebook updater attaches verified status, canon kind, and checkedAt to new entries', () => {
  const chunks = extractChunks('Lahai-Roi is covered in permafrost and ancient technology.', 'Lahai-Roi');
  assert.ok(chunks.length > 0);

  // When updater extracts chunk into entry object, it carries the required metadata
  const updater = createLorebookUpdater({
    dir: 'fake-dir',
    now: () => new Date('2026-10-28T09:00:00Z'),
  });

  const entry = updater.buildEntry('wiki-sync-lahai-roi', 'Lahai-Roi', chunks[0]);
  assert.equal(entry.status, 'verified');
  assert.equal(entry.kind, 'canon');
  assert.equal(entry.checkedAt, '2026-10-28');
});
