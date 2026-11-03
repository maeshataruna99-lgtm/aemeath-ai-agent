'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const id = require('../src/i18n/locales/id-ID.json');
const en = require('../src/i18n/locales/en-US.json');
const { defaultCatalogs } = require('../src/i18n');

const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'settings.html'), 'utf8');
const lookup = (catalog, key) => key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), catalog);

test('every data-i18n key in settings.html has text in both languages', () => {
  const keys = [...new Set([...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]))];
  assert.ok(keys.length > 50, 'found the keys');
  for (const [name, catalog] of [['id-ID.json', id], ['en-US.json', en], ['inline id-ID', defaultCatalogs['id-ID']], ['inline en-US', defaultCatalogs['en-US']]]) {
    const missing = keys.filter((key) => typeof lookup(catalog, key) !== 'string');
    assert.deepEqual(missing, [], name + ' is missing keys');
  }
});
