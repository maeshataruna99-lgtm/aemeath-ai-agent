// Picks lorebook trivia for Aemeath to say. Pure module: loading the JSON
// files is done by lorebook-loader.js in the main process, the renderer gets
// the resulting data object.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AemeathLorebook = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_TEXT = 260;

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
      if (typeof entry.topic !== 'string' || entry.topic === '') {
        problems.push(label + ' has no topic');
      }
      if (!sources[entry.source]) problems.push(label + ' cites an unknown source');
      else used.add(entry.source);
    }

    for (const id of Object.keys(sources)) {
      if (!used.has(id)) problems.push('source "' + id + '" is not used by any entry');
    }
    return problems;
  }

  // Shuffle bag: every entry is said once before any entry repeats.
  function createLorebook(data, options) {
    const rng = (options && options.rng) || Math.random;
    const sources = (data && data.sources) || {};
    const entries = ((data && data.entries) || []).filter((e) => sources[e.source]);
    let bag = [];

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
      return {
        id: entry.id,
        topic: entry.topic,
        text: entry.text,
        credit: { title: source.title, url: source.url, license: source.license },
      };
    }

    return { next: next, size: entries.length };
  }

  return { createLorebook: createLorebook, validateLorebook: validateLorebook, MAX_TEXT: MAX_TEXT };
});
