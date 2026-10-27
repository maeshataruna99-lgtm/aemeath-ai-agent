'use strict';

// Safe in-memory Markdown renderer for Aemeath chat.
// Generates styled HTML without any external libraries or script injection vulnerabilities.

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(text) {
  let escaped = escapeHtml(text);

  // Inline code: `code`
  escaped = escaped.replace(/`([^`\n]+)`/g, '<code class="chat-inline-code">$1</code>');

  // Bold + Italic: ***text*** or ___text___
  escaped = escaped.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  escaped = escaped.replace(/___([^_]+)___/g, '<strong><em>$1</em></strong>');

  // Bold: **text** or __text__
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_
  escaped = escaped.replace(/(^|[^\*])\*([^\*\n]+)\*([^\*]|$)/g, '$1<em>$2</em>$3');
  escaped = escaped.replace(/(^|[^_])_([^_\n]+)_([^_]|$)/g, '$1<em>$2</em>$3');

  // Strikethrough: ~~text~~
  escaped = escaped.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Links: [title](url) - safe scheme only (http, https)
  escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, (match, title, url) => {
    return '<a href="' + url + '" target="_blank" rel="noopener noreferrer" class="chat-link">' + title + '</a>';
  });

  return escaped;
}

function renderMarkdown(rawText) {
  if (!rawText) return '';
  const lines = String(rawText).split(/\r?\n/);
  const out = [];

  let inCodeBlock = false;
  let codeLang = '';
  let codeLines = [];
  let inList = false;
  let listType = null; // 'ul' or 'ol'

  function closeList() {
    if (inList) {
      out.push(listType === 'ol' ? '</ol>' : '</ul>');
      inList = false;
      listType = null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced Code Block: ```lang ... ```
    const codeMatch = line.match(/^```(\w+)?\s*$/);
    if (codeMatch) {
      if (inCodeBlock) {
        // Closing block
        const langClass = codeLang ? ' class="lang-' + escapeHtml(codeLang) + '"' : '';
        const langBadge = codeLang ? '<div class="chat-code-header"><span class="chat-code-lang">' + escapeHtml(codeLang) + '</span><button class="chat-code-copy" type="button" title="Salin kode">Salin</button></div>' : '';
        out.push(
          '<div class="chat-code-wrap">' +
            langBadge +
            '<pre class="chat-code-block"><code' + langClass + '>' +
            escapeHtml(codeLines.join('\n')) +
            '</code></pre>' +
          '</div>'
        );
        inCodeBlock = false;
        codeLang = '';
        codeLines = [];
      } else {
        closeList();
        inCodeBlock = true;
        codeLang = (codeMatch[1] || '').trim().toLowerCase();
        codeLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Empty line
    if (!line.trim()) {
      closeList();
      continue;
    }

    // Horizontal Rule: --- or ***
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) {
      closeList();
      out.push('<hr class="chat-hr">');
      continue;
    }

    // Headings: # H1 to #### H4
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      out.push('<h' + (level + 2) + ' class="chat-h' + level + '">' + renderInline(headingMatch[2]) + '</h' + (level + 2) + '>');
      continue;
    }

    // Blockquote: > text
    const quoteMatch = line.match(/^>\s*(.+)$/);
    if (quoteMatch) {
      closeList();
      out.push('<blockquote class="chat-quote">' + renderInline(quoteMatch[1]) + '</blockquote>');
      continue;
    }

    // Unordered List item: - text or * text
    const ulMatch = line.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        closeList();
        inList = true;
        listType = 'ul';
        out.push('<ul class="chat-list">');
      }
      out.push('<li>' + renderInline(ulMatch[1]) + '</li>');
      continue;
    }

    // Ordered List item: 1. text or 2) text
    const olMatch = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        closeList();
        inList = true;
        listType = 'ol';
        out.push('<ol class="chat-list" start="' + escapeHtml(olMatch[1]) + '">');
      }
      out.push('<li>' + renderInline(olMatch[2]) + '</li>');
      continue;
    }

    // Regular paragraph
    closeList();
    out.push('<p class="chat-p">' + renderInline(line) + '</p>');
  }

  // If code block was not closed
  if (inCodeBlock) {
    const langClass = codeLang ? ' class="lang-' + escapeHtml(codeLang) + '"' : '';
    const langBadge = codeLang ? '<div class="chat-code-header"><span class="chat-code-lang">' + escapeHtml(codeLang) + '</span><button class="chat-code-copy" type="button" title="Salin kode">Salin</button></div>' : '';
    out.push(
      '<div class="chat-code-wrap">' +
        langBadge +
        '<pre class="chat-code-block"><code' + langClass + '>' +
        escapeHtml(codeLines.join('\n')) +
        '</code></pre>' +
      '</div>'
    );
  }
  closeList();

  return out.join('');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderMarkdown, renderInline, escapeHtml };
}
if (typeof window !== 'undefined') {
  window.AemeathMarkdown = { renderMarkdown, renderInline, escapeHtml };
}
