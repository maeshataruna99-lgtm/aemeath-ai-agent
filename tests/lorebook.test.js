'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createLorebook, validateLorebook, MAX_TEXT } = require('../src/lorebook');
const { loadLorebook } = require('../src/lorebook-loader');
const { createLorebookUpdater, parsePageQuery, extractChunks } = require('../src/lorebook-updater');

const loreDir = path.join(__dirname, '..', 'lorebook');
const data = loadLorebook(loreDir);

function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

test('the shipped lorebook is well formed and credits every entry', () => {
  assert.deepEqual(validateLorebook(data), []);
  assert.ok(data.entries.length >= 74);
  assert.ok(data.entries.some((e) => e.id === 'resonator-overclocking'));
  assert.ok(data.entries.some((e) => e.id === 'resonator-roster-rinascita'));
  assert.ok(data.entries.some((e) => e.id === 'solaris-3-nations-huanglong'));
  assert.ok(data.entries.some((e) => e.id === 'lore-black-shores-terms'));
  for (const entry of data.entries) {
    assert.ok(entry.text.length <= MAX_TEXT, entry.id);
    assert.match(data.sources[entry.source].url, /^https:\/\/wutheringwaves\.fandom\.com\/wiki\//);
    assert.equal(data.sources[entry.source].license, 'CC BY-SA');
  }
});

test('validateLorebook reports each kind of problem', () => {
  const bad = {
    sources: {
      a: { title: 'A', url: 'http://x', license: 'L', licenseUrl: 'https://l', accessed: '2026-01-01' },
      unused: { title: 'U', url: 'https://u', license: 'L', licenseUrl: 'https://l', accessed: '2026-01-01' },
    },
    entries: [
      { id: 'one', topic: 'T', source: 'a', text: 'ok' },
      { id: 'one', topic: 'T', source: 'a', text: 'dup' },
      { id: 'two', topic: 'T', source: 'missing', text: 'x' },
      { id: 'three', topic: 'T', source: 'a', text: 'y'.repeat(MAX_TEXT + 1) },
    ],
  };
  const problems = validateLorebook(bad).join('\n');
  assert.match(problems, /https url/);
  assert.match(problems, /duplicated/);
  assert.match(problems, /unknown source/);
  assert.match(problems, /longer than/);
  assert.match(problems, /"unused" is not used/);
});

test('every entry is told once before any repeats, and carries its credit', () => {
  const book = createLorebook(data, { rng: seededRng(4) });
  const seen = new Set();
  for (let i = 0; i < book.size; i++) {
    const item = book.next();
    assert.ok(!seen.has(item.id), 'repeated early: ' + item.id);
    seen.add(item.id);
    assert.ok(item.credit.title && item.credit.url && item.credit.license);
  }
  assert.equal(seen.size, data.entries.length);
  assert.ok(book.next(), 'refills after a full pass');
});

test('an empty lorebook yields no trivia instead of throwing', () => {
  assert.equal(createLorebook({ sources: {}, entries: [] }).next(), null);
  assert.equal(createLorebook(undefined).next(), null);
});

test('lorebook updater parses wiki URLs, extracts <= 260 char chunks, and merges into loadLorebook', async () => {
  assert.deepEqual(parsePageQuery('https://wutheringwaves.fandom.com/wiki/Solaris-3, Rinascita'), [
    'Solaris-3',
    'Rinascita',
  ]);
  const sampleChunks = extractChunks(
    'Rinascita is a maritime nation of city-states in Solaris-3. It is guided by the Sentinel Imperator and celebrates the Carnevale.',
    'Rinascita',
  );
  assert.ok(sampleChunks.length >= 1);
  assert.ok(sampleChunks[0].length <= MAX_TEXT);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aemeath-lore-test-'));
  const updater = createLorebookUpdater({
    dir,
    now: () => new Date('2026-10-27T12:00:00Z'),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        query: {
          pages: {
            101: {
              title: 'Rinascita',
              extract:
                'Rinascita is a nation of city-states across the archipelago of Solaris-3. Its people revere the Sentinel Imperator and live side by side with Common Echoes.',
            },
          },
        },
      }),
    }),
  });

  const res = await updater.update('https://wutheringwaves.fandom.com/wiki/Rinascita');
  assert.equal(res.ok, true);
  assert.equal(res.updatedPages, 1);
  assert.ok(res.addedEntries >= 1);

  const merged = loadLorebook(loreDir, updater.overlayPath);
  assert.deepEqual(validateLorebook(merged), []);
  assert.ok(merged.entries.length > data.entries.length);
  assert.ok(merged.sources['wiki-sync-rinascita']);
});
