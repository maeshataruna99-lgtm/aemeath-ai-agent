'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createI18n,
  normalizeLocale,
  validateCatalogParity,
  defaultCatalogs,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
} = require('../src/i18n');

test('locale definitions and normalization', () => {
  assert.deepEqual(SUPPORTED_LOCALES, ['id-ID', 'en-US']);
  assert.equal(DEFAULT_LOCALE, 'id-ID');

  assert.equal(normalizeLocale('id-ID'), 'id-ID');
  assert.equal(normalizeLocale('en-US'), 'en-US');
  assert.equal(normalizeLocale(''), 'id-ID');
  assert.equal(normalizeLocale(null), 'id-ID');
  assert.equal(normalizeLocale(undefined), 'id-ID');
  assert.equal(normalizeLocale('ja-JP'), 'id-ID');
  assert.equal(normalizeLocale('fr-FR'), 'id-ID');
});

test('catalogs loaded and validateCatalogParity reports 100% symmetry', () => {
  assert.ok(defaultCatalogs, 'defaultCatalogs must be loaded');
  assert.ok(defaultCatalogs['id-ID'], 'id-ID catalog exists');
  assert.ok(defaultCatalogs['en-US'], 'en-US catalog exists');

  const parity = validateCatalogParity(defaultCatalogs['id-ID'], defaultCatalogs['en-US']);
  assert.deepEqual(parity.missingInB, [], 'No keys missing in en-US');
  assert.deepEqual(parity.missingInA, [], 'No keys missing in id-ID');
  assert.deepEqual(parity.tokenMismatches, [], 'No token interpolation mismatches');
  assert.equal(parity.isParity, true);
});

test('translation and interpolation behavior', () => {
  const i18n = createI18n({ locale: 'id-ID' });

  assert.equal(i18n.t('settings.title'), 'Pengaturan Aemeath');
  assert.equal(i18n.t('chat.send'), 'Kirim');
  assert.equal(
    i18n.t('errors.too_long', { max: 600 }),
    'Pesannya terlalu panjang (maksimal 600 karakter).'
  );

  // Switch to English
  i18n.setLocale('en-US');
  assert.equal(i18n.getLocale(), 'en-US');
  assert.equal(i18n.t('settings.title'), 'Aemeath Settings');
  assert.equal(i18n.t('chat.send'), 'Send');
  assert.equal(
    i18n.t('errors.too_long', { max: 600 }),
    'Message is too long (maximum 600 characters).'
  );
});

test('fallback behavior when key is missing or invalid', () => {
  const customCatalogs = {
    'id-ID': {
      greet: 'Halo {name}',
      only_in_id: 'Hanya ada di ID',
    },
    'en-US': {
      greet: 'Hello {name}',
    },
  };

  const i18n = createI18n({ locale: 'en-US', catalogs: customCatalogs });
  // Key present in en-US
  assert.equal(i18n.t('greet', { name: 'Rover' }), 'Hello Rover');
  // Key missing in en-US falls back to id-ID
  assert.equal(i18n.t('only_in_id'), 'Hanya ada di ID');
  // Key missing everywhere returns the key name
  assert.equal(i18n.t('totally.missing.key'), 'totally.missing.key');
});

test('applyDom updates mock DOM elements correctly', () => {
  const i18n = createI18n({ locale: 'id-ID' });

  // Mock DOM container
  const elements = [
    {
      attr: { 'data-i18n': 'settings.title' },
      textContent: '',
      getAttribute(k) { return this.attr[k]; },
      setAttribute(k, v) { this.attr[k] = v; },
    },
    {
      attr: { 'data-i18n-placeholder': 'chat.placeholder' },
      placeholder: '',
      getAttribute(k) { return this.attr[k]; },
      setAttribute(k, v) { this.attr[k] = v; },
    },
  ];

  const mockContainer = {
    querySelectorAll(selector) {
      if (selector === '[data-i18n]') return [elements[0]];
      if (selector === '[data-i18n-placeholder]') return [elements[1]];
      return [];
    },
  };

  i18n.applyDom(mockContainer);
  assert.equal(elements[0].textContent, 'Pengaturan Aemeath');
  assert.equal(elements[1].placeholder, 'Tulis pesan untuk Aemeath...');

  // Switch to English and re-apply
  i18n.setLocale('en-US');
  i18n.applyDom(mockContainer);
  assert.equal(elements[0].textContent, 'Aemeath Settings');
  assert.equal(elements[1].placeholder, 'Type a message for Aemeath...');
});
