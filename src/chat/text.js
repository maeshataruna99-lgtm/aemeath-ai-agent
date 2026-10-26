'use strict';

// Small text helpers shared by the offline responder and web search: turn a
// chat message into searchable keywords (Indonesian and English).

const STOPWORDS = new Set([
  'yang', 'dan', 'di', 'ke', 'dari', 'itu', 'ini', 'apa', 'siapa', 'kenapa', 'mengapa', 'bagaimana',
  'gimana', 'kapan', 'dimana', 'berapa', 'adalah', 'ialah', 'dengan', 'untuk', 'pada', 'dalam', 'atau',
  'juga', 'ada', 'tidak', 'nggak', 'gak', 'bisa', 'saya', 'aku', 'kamu', 'kau', 'dia', 'mereka', 'kita',
  'kami', 'tolong', 'ceritakan', 'jelaskan', 'sebutkan', 'tentang', 'soal', 'mengenai', 'dong', 'deh',
  'sih', 'nih', 'ya', 'yah', 'kah', 'lah', 'nya', 'sudah', 'udah', 'belum', 'akan', 'mau', 'ingin',
  'tahu', 'tau', 'apakah', 'bukan', 'lagi', 'saja', 'aja', 'cuma', 'hanya', 'pernah', 'banyak',
  'sedikit', 'sangat', 'sekali', 'lebih', 'paling', 'seperti', 'karena', 'sebab', 'agar', 'supaya',
  'jadi', 'maka', 'namun', 'tetapi', 'tapi', 'kalau', 'jika', 'bila', 'saat', 'ketika', 'waktu',
  'setelah', 'sebelum', 'oleh', 'bagi', 'buat', 'sama', 'lalu', 'terus', 'sebuah', 'suatu', 'para',
  'the', 'what', 'who', 'why', 'how', 'about', 'tell', 'does', 'did', 'are', 'was', 'were', 'and', 'for',
  'with', 'that', 'this', 'from', 'info', 'informasi', 'arti', 'maksud',
]);

// Lowercase, drop accents and punctuation, split hyphens so "Lahai-Roi" and
// "lahai roi" compare equal.
function normalize(text) {
  return String(text == null ? '' : text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Cheap plural handling so "frostlands" and "frostland" match.
function stem(word) {
  return word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word;
}

function keywords(text) {
  const seen = new Set();
  for (const word of normalize(text).split(' ')) {
    if (word.length < 3 || STOPWORDS.has(word)) continue;
    seen.add(stem(word));
  }
  return Array.from(seen);
}

module.exports = { normalize, keywords, stem, STOPWORDS };
