'use strict';

// Fetches public Wuthering Waves Wiki pages from Fandom's MediaWiki API and
// converts their plain-text extracts into CC BY-SA credited lorebook entries
// stored in the local userData overlay (`lorebook-updates.json`).
// Never sends any local user data; only requests public wiki page titles.

const fs = require('node:fs');
const path = require('node:path');
const { MAX_TEXT } = require('./lorebook');

const WIKI_API = 'https://wutheringwaves.fandom.com/api.php';
const WIKI_BASE = 'https://wutheringwaves.fandom.com/wiki/';
const LICENSE_URL = 'https://www.fandom.com/licensing';
const OVERLAY_FILE = 'lorebook-updates.json';
const DEFAULT_PAGES = ['Solaris-3', 'Lore', 'Resonator', 'Aemeath', 'The_Lament', 'Tacet_Discord', 'Threnodian', 'Lahai-Roi'];
const MAX_ENTRIES_PER_PAGE = 6;
const TIMEOUT_MS = 12000;

function slugify(title) {
  return (
    String(title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'page'
  );
}

// Accepts a page title ("Solaris-3", "Rinascita") or a full wutheringwaves.fandom.com/wiki/ URL.
function parsePageQuery(rawInput) {
  const raw = String(rawInput == null ? '' : rawInput).trim();
  if (!raw) return DEFAULT_PAGES.slice();

  const items = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const pages = [];
  for (const item of items) {
    const urlMatch = /^https?:\/\/wutheringwaves\.fandom\.com\/wiki\/([^\s?#]+)/i.exec(item);
    const name = urlMatch ? decodeURIComponent(urlMatch[1]) : item;
    const cleaned = name.replace(/[\u0000-\u001f<>"{}|\\^`]/g, '').trim();
    if (cleaned && cleaned.length <= 80 && !pages.includes(cleaned)) {
      pages.push(cleaned);
    }
  }
  return pages.length > 0 ? pages.slice(0, 10) : DEFAULT_PAGES.slice();
}

// Splits a MediaWiki plain-text extract into concise sentences <= MAX_TEXT chars.
function extractChunks(extractText, topic) {
  const raw = String(extractText || '')
    .replace(/\r/g, '')
    .replace(/==+[^=\n]+==+/g, '\n')
    .replace(/\[[^\]]*\]/g, '');
  const paragraphs = raw
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length >= 40 && !/^(see also|references|navigation|other languages|gallery)\b/i.test(p));

  const chunks = [];
  const prefix = '[' + topic + '] ';
  const maxBody = MAX_TEXT - prefix.length;

  for (const para of paragraphs) {
    if (chunks.length >= MAX_ENTRIES_PER_PAGE) break;
    const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
    let current = '';
    for (const rawSentence of sentences) {
      const sentence = rawSentence.trim();
      if (!sentence) continue;
      const candidate = current ? current + ' ' + sentence : sentence;
      if (candidate.length <= maxBody) {
        current = candidate;
      } else {
        if (current.length >= 35) {
          chunks.push(prefix + current);
          if (chunks.length >= MAX_ENTRIES_PER_PAGE) break;
        }
        current = sentence.length <= maxBody ? sentence : sentence.slice(0, maxBody - 1).trim() + '\u2026';
      }
    }
    if (current.length >= 35 && chunks.length < MAX_ENTRIES_PER_PAGE) {
      chunks.push(prefix + current);
    }
  }
  return chunks;
}

// options: { dir: string, fetchImpl?: typeof fetch, now?: () => Date }
function createLorebookUpdater(options) {
  const opts = options || {};
  const file = opts.dir ? path.join(opts.dir, OVERLAY_FILE) : null;
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const now = opts.now || (() => new Date());

  function readOverlay() {
    if (!file) return { updatedAt: null, sources: {}, entries: [] };
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return {
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
        sources: parsed.sources && typeof parsed.sources === 'object' ? parsed.sources : {},
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      };
    } catch {
      return { updatedAt: null, sources: {}, entries: [] };
    }
  }

  function writeOverlay(overlay) {
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(overlay, null, 2));
    } catch {
      // best effort
    }
  }

  async function fetchWikiPage(pageTitle) {
    if (typeof fetchImpl !== 'function') throw new Error('Fitur fetch tidak tersedia.');
    const params = new URLSearchParams({
      action: 'query',
      prop: 'extracts',
      explaintext: '1',
      redirects: '1',
      titles: pageTitle.replace(/_/g, ' '),
      format: 'json',
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetchImpl(WIKI_API + '?' + params.toString(), {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      const pages = (data && data.query && data.query.pages) || {};
      const firstKey = Object.keys(pages)[0];
      const page = firstKey ? pages[firstKey] : null;
      if (!page || page.missing !== undefined || !page.extract) return null;
      return {
        title: String(page.title || pageTitle).trim(),
        extract: String(page.extract || '').trim(),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function update(rawQuery) {
    const targets = parsePageQuery(rawQuery);
    const overlay = readOverlay();
    const today = now().toISOString().slice(0, 10);
    let updatedPages = 0;
    let addedEntries = 0;

    for (const target of targets) {
      let page = null;
      try {
        page = await fetchWikiPage(target);
      } catch {
        page = null;
      }
      if (!page || !page.extract) continue;

      const slug = slugify(page.title);
      const sourceId = 'wiki-sync-' + slug;
      const encodedTitle = encodeURIComponent(page.title.replace(/ /g, '_')).replace(/%2F/gi, '/');
      const chunks = extractChunks(page.extract, page.title);
      if (chunks.length === 0) continue;

      overlay.sources[sourceId] = {
        title: 'Wuthering Waves Wiki: ' + page.title,
        url: WIKI_BASE + encodedTitle,
        license: 'CC BY-SA',
        licenseUrl: LICENSE_URL,
        accessed: today,
      };
      // Replace any previous synced entries for this sourceId
      overlay.entries = overlay.entries.filter((e) => e && e.source !== sourceId);
      chunks.forEach((text, idx) => {
        overlay.entries.push(
          buildEntry(sourceId, page.title, text, {
            id: sourceId + '-' + (idx + 1),
            index: idx + 1,
            status: 'verified',
            kind: 'canon',
            checkedAt: today,
          })
        );
        addedEntries += 1;
      });
      updatedPages += 1;
    }

    if (updatedPages === 0) {
      return {
        ok: false,
        updatedPages: 0,
        addedEntries: 0,
        error: 'Halaman wiki tidak ditemukan atau gagal diambil. Pastikan nama halaman Wuthering Waves Wiki benar dan internet tersambung.',
      };
    }

    overlay.updatedAt = today;
    writeOverlay(overlay);
    return {
      ok: true,
      updatedPages: updatedPages,
      addedEntries: addedEntries,
      updatedAt: today,
      overlayPath: file,
    };
  }

  function buildEntry(sourceId, topic, text, options) {
    const opts = options || {};
    const today = now().toISOString().slice(0, 10);
    return {
      id: opts.id || (sourceId + '-' + (opts.index || 1)),
      topic: topic,
      source: sourceId,
      text: text.slice(0, MAX_TEXT),
      status: opts.status || 'verified',
      kind: opts.kind || 'canon',
      checkedAt: opts.checkedAt || today,
    };
  }

  return {
    update: update,
    readOverlay: readOverlay,
    buildEntry: buildEntry,
    get overlayPath() {
      return file;
    },
  };
}

module.exports = {
  createLorebookUpdater,
  parsePageQuery,
  extractChunks,
  OVERLAY_FILE,
  DEFAULT_PAGES,
};
