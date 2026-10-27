'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { renderMarkdown, renderInline, escapeHtml } = require('../renderer/chat-markdown');

test('escapes raw HTML to prevent injection', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('"hello" & \'world\''), '&quot;hello&quot; &amp; &#39;world&#39;');
});

test('renders inline styles correctly', () => {
  assert.equal(renderInline('**tebal**'), '<strong>tebal</strong>');
  assert.equal(renderInline('*miring*'), '<em>miring</em>');
  assert.equal(renderInline('`inline code`'), '<code class="chat-inline-code">inline code</code>');
  assert.equal(renderInline('~~coret~~'), '<del>coret</del>');
  assert.equal(
    renderInline('[Google](https://google.com)'),
    '<a href="https://google.com" target="_blank" rel="noopener noreferrer" class="chat-link">Google</a>'
  );
  // javascript: url is not converted to a link
  assert.doesNotMatch(renderInline('[Hack](javascript:alert(1))'), /<a /);
});

test('renders code blocks with language badge and escapes content', () => {
  const md = '```yaml\nname: Aemeath\nversion: 1.0\n```';
  const html = renderMarkdown(md);
  assert.match(html, /class="chat-code-wrap"/);
  assert.match(html, /<span class="chat-code-lang">yaml<\/span>/);
  assert.match(html, /<button class="chat-code-copy"/);
  assert.match(html, /name: Aemeath\nversion: 1.0/);
});

test('renders numbered lists and bullet points', () => {
  const sample = [
    '1. Langkah satu',
    '2. Langkah dua',
    '- Poin A',
    '- Poin B',
  ].join('\n');
  const html = renderMarkdown(sample);
  assert.match(html, /<ol class="chat-list"/);
  assert.match(html, /<li>Langkah satu<\/li>/);
  assert.match(html, /<ul class="chat-list">/);
  assert.match(html, /<li>Poin A<\/li>/);
});

test('renders user prompt example properly', () => {
  const text = [
    '2. **Lock timeout** — pakai `tryLock` dengan timeout.',
    '3. **Kurangi lock granularity** — jangan pegang banyak lock sekaligus.',
    '',
    '**Kalau game Deadlock:**',
    '- Fokus **farm souls** di lane awal.',
    '',
    'Nah, yang mana yang kamu maksud, Rover? Hehe~',
  ].join('\n');

  const html = renderMarkdown(text);
  assert.match(html, /<ol class="chat-list"/);
  assert.match(html, /<strong>Lock timeout<\/strong>/);
  assert.match(html, /<code class="chat-inline-code">tryLock<\/code>/);
  assert.match(html, /<strong>Kalau game Deadlock:<\/strong>/);
  assert.match(html, /<ul class="chat-list">/);
  assert.match(html, /<strong>farm souls<\/strong>/);
  assert.match(html, /<p class="chat-p">Nah, yang mana/);
});
