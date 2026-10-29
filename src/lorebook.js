// Picks lorebook trivia for Aemeath to say. Pure module: loading the JSON
// files is done by lorebook-loader.js in the main process, the renderer gets
// the resulting data object.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AemeathLorebook = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_TEXT = 260;
  const VALID_STATUS = ['verified', 'unverified'];
  const VALID_KIND = ['canon', 'interpretation', 'evolving'];

  // data = { sources: { id: { title, url, license, licenseUrl, accessed } }, entries: [...] }
  // Returns a list of problems; empty means the lorebook is well formed.
  function validateLorebook(data) {
    const problems = [];
    const sources = (data && data.sources) || {};
    const entries = (data && data.entries) || [];
    const used = new Set();
    const ids = new Set();

    for (const [id, source] of Object.entries(sources)) {
      for (const key of ['title', 'url', 'license', 'licenseUrl', 'accessed']) {
        if (typeof source[key] !== 'string' || source[key] === '') {
          problems.push('source "' + id + '" is missing "' + key + '"');
        }
      }
      if (typeof source.url === 'string' && !/^https:\/\//.test(source.url)) {
        problems.push('source "' + id + '" needs an https url');
      }
    }

    for (const entry of entries) {
      const label = 'entry "' + (entry && entry.id) + '"';
      if (!entry || typeof entry.id !== 'string' || entry.id === '') {
        problems.push('an entry has no id');
        continue;
      }
      if (ids.has(entry.id)) problems.push(label + ' is duplicated');
      ids.add(entry.id);
      if (typeof entry.text !== 'string' || entry.text.trim() === '') {
        problems.push(label + ' has no text');
      } else if (entry.text.length > MAX_TEXT) {
        problems.push(label + ' is longer than ' + MAX_TEXT + ' characters');
      }
      if (entry.text_en !== undefined) {
        if (typeof entry.text_en !== 'string' || entry.text_en.trim() === '') {
          problems.push(label + ' has invalid text_en');
        } else if (entry.text_en.length > MAX_TEXT) {
          problems.push(label + ' text_en is longer than ' + MAX_TEXT + ' characters');
        }
      }
      if (typeof entry.topic !== 'string' || entry.topic === '') {
        problems.push(label + ' has no topic');
      }
      if (!sources[entry.source]) problems.push(label + ' cites an unknown source');
      else used.add(entry.source);

      if (!entry.status || !VALID_STATUS.includes(entry.status)) {
        problems.push(label + ' has invalid or missing status (must be "verified" or "unverified")');
      }
      if (!entry.kind || !VALID_KIND.includes(entry.kind)) {
        problems.push(label + ' has invalid or missing kind (must be "canon", "interpretation", or "evolving")');
      }
      if (typeof entry.checkedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.checkedAt)) {
        problems.push(label + ' has invalid or missing checkedAt date (must be YYYY-MM-DD)');
      }
    }

    for (const id of Object.keys(sources)) {
      if (!used.has(id)) problems.push('source "' + id + '" is not used by any entry');
    }
    return problems;
  }

  // Shuffle bag: every entry is said once before any entry repeats.
  function createLorebook(data, options) {
    const rng = (options && options.rng) || Math.random;
    let locale = (options && options.locale) || 'id-ID';
    const sources = (data && data.sources) || {};
    const entries = ((data && data.entries) || []).filter((e) => sources[e.source]);
    let bag = [];

    function setLocale(newLocale) {
      if (typeof newLocale === 'string') {
        locale = newLocale;
      }
    }

    function refill() {
      bag = entries.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.floor(rng() * (i + 1)));
        const tmp = bag[i];
        bag[i] = bag[j];
        bag[j] = tmp;
      }
    }

    // Returns { id, topic, text, credit: { title, url, license } } or null when empty.
    function next() {
      if (entries.length === 0) return null;
      if (bag.length === 0) refill();
      const entry = bag.pop();
      const source = sources[entry.source];
      const text = (locale === 'en-US' && entry.text_en) ? entry.text_en : entry.text;
      return {
        id: entry.id,
        topic: entry.topic,
        text: text,
        text_id: entry.text,
        text_en: entry.text_en || entry.text,
        status: entry.status || 'verified',
        kind: entry.kind || 'canon',
        checkedAt: entry.checkedAt || (source && source.accessed) || null,
        credit: { title: source.title, url: source.url, license: source.license },
      };
    }

    return { next: next, size: entries.length, setLocale: setLocale, getLocale: () => locale };
  }

  return { createLorebook: createLorebook, validateLorebook: validateLorebook, MAX_TEXT: MAX_TEXT };
});
