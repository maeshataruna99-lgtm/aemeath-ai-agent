'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { GUIDE_ENTRIES, getGuideEntries, getGuideEntryById } = require('../src/feature-guide/guide-data');
const { createSearchIndex, tokenize } = require('../src/feature-guide/search-index');

test('guide-data: exports all 11 curated guide categories with complete schema', () => {
  const entries = getGuideEntries();
  assert.equal(entries.length, 11);

  const expectedIds = [
    'getting-started',
    'interactive-modes',
    'chat-ai',
    'web-search',
    'productivity',
    'memory-notes',
    'developer-tools',
    'custom-commands',
    'settings',
    'privacy-safety',
    'troubleshooting-faq',
  ];

  for (const id of expectedIds) {
    const entry = getGuideEntryById(id);
    assert.ok(entry, `Entry with id "${id}" should exist`);
    assert.equal(typeof entry.title, 'string');
    assert.ok(entry.title.length > 0);
    assert.equal(typeof entry.category, 'string');
    assert.ok(entry.category.length > 0);
    assert.equal(typeof entry.summary, 'string');
    assert.ok(entry.summary.length > 0);
    assert.equal(typeof entry.purpose, 'string');
    assert.ok(entry.purpose.length > 0);
    assert.equal(typeof entry.usage, 'string');
    assert.ok(entry.usage.length > 0);
    assert.ok(Array.isArray(entry.examples));
    assert.ok(entry.examples.length > 0);
    assert.equal(typeof entry.requirements, 'string');
    assert.equal(typeof entry.modeAvailability, 'string');
    assert.equal(typeof entry.privacyNotes, 'string');
    assert.ok(entry.privacyNotes.length > 0);
    assert.ok(Array.isArray(entry.relatedIds));
    assert.ok(Array.isArray(entry.searchTerms));
    assert.equal(typeof entry.aemeathDialogue, 'string');
    assert.ok(entry.aemeathDialogue.length > 0);
    assert.equal(typeof entry.verificationSource, 'string');

    // Rule: no mention of Startorch Academy
    assert.equal(/startorch academy/i.test(entry.title), false);
    assert.equal(/startorch academy/i.test(entry.aemeathDialogue), false);
  }
});

test('guide-data: getGuideEntryById returns null for missing or invalid id', () => {
  assert.equal(getGuideEntryById('non-existent'), null);
  assert.equal(getGuideEntryById(''), null);
  assert.equal(getGuideEntryById(null), null);
});

test('search-index: empty or whitespace query returns all entries', () => {
  const index = createSearchIndex(GUIDE_ENTRIES);
  assert.equal(index.count(), 11);
  assert.equal(index.search('').length, 11);
  assert.equal(index.search('   ').length, 11);
  assert.equal(index.search(null).length, 11);
});

test('search-index: returns relevant entries for exact title and command queries', () => {
  const index = createSearchIndex(GUIDE_ENTRIES);

  const timerResults = index.search('timer');
  assert.ok(timerResults.length > 0);
  assert.equal(timerResults[0].id, 'productivity');

  const reviewResults = index.search('review');
  assert.ok(reviewResults.length > 0);
  assert.equal(reviewResults[0].id, 'developer-tools');

  const searchResults = index.search('/search');
  assert.ok(searchResults.length > 0);
  assert.equal(searchResults[0].id, 'web-search');

  const modeResults = index.search('interactive modes');
  assert.ok(modeResults.length > 0);
  assert.equal(modeResults[0].id, 'interactive-modes');
});

test('search-index: case-insensitive and partial keyword matching', () => {
  const index = createSearchIndex(GUIDE_ENTRIES);

  const upper = index.search('TIMER');
  assert.ok(upper.length > 0);
  assert.equal(upper[0].id, 'productivity');

  const partial = index.search('privas');
  assert.ok(partial.length > 0);
  assert.equal(partial[0].id, 'privacy-safety');

  const git = index.search('git diff');
  assert.ok(git.length > 0);
  assert.equal(git[0].id, 'developer-tools');
});

test('search-index: handles completely unmatched query cleanly', () => {
  const index = createSearchIndex(GUIDE_ENTRIES);
  const results = index.search('xyz999foobarcompletelyunknown');
  assert.deepEqual(results, []);
});

test('search-index: tokenize splits words and symbols cleanly', () => {
  assert.deepEqual(tokenize('hello world /search,test'), ['hello', 'world', 'search', 'test']);
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
});
