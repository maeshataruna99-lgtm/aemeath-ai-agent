'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { createLorebook, validateLorebook, MAX_TEXT } = require('../src/lorebook');
const { loadLorebook } = require('../src/lorebook-loader');

const data = loadLorebook(path.join(__dirname, '..', 'lorebook'));

function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

test('the shipped lorebook is well formed and credits every entry', () => {
  assert.deepEqual(validateLorebook(data), []);
  assert.ok(data.entries.length >= 20);
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
