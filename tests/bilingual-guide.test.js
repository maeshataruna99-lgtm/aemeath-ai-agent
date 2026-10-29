'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getGuideEntries,
  getGuideEntryById,
  GUIDE_ENTRIES_ID,
  GUIDE_ENTRIES_EN,
} = require('../src/feature-guide/guide-data');
const { createSearchIndex } = require('../src/feature-guide/search-index');

test('guide entries count and ID parity', () => {
  assert.equal(GUIDE_ENTRIES_ID.length, 11, 'Should have 11 ID entries');
  assert.equal(GUIDE_ENTRIES_EN.length, 11, 'Should have 11 EN entries');

  const idKeys = GUIDE_ENTRIES_ID.map((e) => e.id);
  const enKeys = GUIDE_ENTRIES_EN.map((e) => e.id);
  assert.deepEqual(enKeys, idKeys, 'Both locales must have identical IDs in identical order');
});

test('getGuideEntries returns appropriate localized entries based on locale', () => {
  const idList = getGuideEntries('id-ID');
  const enList = getGuideEntries('en-US');
  const defaultList = getGuideEntries();

  assert.equal(defaultList[0].category, 'Dasar');
  assert.equal(idList[0].category, 'Dasar');
  assert.equal(enList[0].category, 'Basics');

  // Verify all fields are present and non-empty in EN
  for (const entry of enList) {
    assert.ok(entry.id, 'id is present');
    assert.ok(entry.title, 'title is present: ' + entry.id);
    assert.ok(entry.category, 'category is present: ' + entry.id);
    assert.ok(entry.summary, 'summary is present: ' + entry.id);
    assert.ok(entry.purpose, 'purpose is present: ' + entry.id);
    assert.ok(entry.usage, 'usage is present: ' + entry.id);
    assert.ok(Array.isArray(entry.examples) && entry.examples.length > 0, 'examples present: ' + entry.id);
    assert.ok(entry.requirements, 'requirements present: ' + entry.id);
    assert.ok(entry.modeAvailability, 'modeAvailability present: ' + entry.id);
    assert.ok(entry.privacyNotes, 'privacyNotes present: ' + entry.id);
    assert.ok(entry.aemeathDialogue, 'aemeathDialogue present: ' + entry.id);
  }
});

test('getGuideEntryById retrieves by ID and locale', () => {
  const idEntry = getGuideEntryById('interactive-modes', 'id-ID');
  const enEntry = getGuideEntryById('interactive-modes', 'en-US');

  assert.equal(idEntry.category, 'Sistem & Keamanan');
  assert.equal(enEntry.category, 'System & Security');
  assert.equal(getGuideEntryById('non-existent'), null);
});

test('search index handles both Indonesian and English datasets', () => {
  const indexID = createSearchIndex(getGuideEntries('id-ID'));
  const hitsID = indexID.search('koding');
  assert.ok(hitsID.length > 0, 'Should find entries for "koding" in Indonesian');
  assert.ok(hitsID.some((h) => h.id === 'developer-tools'));

  const indexEN = createSearchIndex(getGuideEntries('en-US'));
  const hitsEN = indexEN.search('coding');
  assert.ok(hitsEN.length > 0, 'Should find entries for "coding" in English');
  assert.ok(hitsEN.some((h) => h.id === 'developer-tools'));
});
