'use strict';

// Offline answers for the chat: no key, no network, no model. Aemeath answers
// from the lorebook she carries, and when she does not know she says so and
// points Rover to the internet or to the API key setting.

const { normalize, keywords } = require('./text');
const { detectJourneyWell, getJourneyWellReply } = require('./journey-well');
const { resolveTravelIntent, getTravelDialogue } = require('./travel-intent');

const MIN_SCORE = 2;
const SECOND_RATIO = 0.6;
const MAX_REPLY = 460;
const TOPIC_WEIGHT = 2.5;

const INTROS = [
  'Dari ingatanku, Rover:',
  'Oh, yang itu aku ingat!',
  'Hmm, kalau soal itu begini:',
];

const NO_MATCH = {
  'no-key': [
    'Hmm, yang itu belum ada di ingatanku, Rover. Coba cari di internet, atau isi API key chatbot di Pengaturan supaya aku bisa menjawab lebih lengkap!',
    'Wah, aku belum tahu soal itu. Cari dulu di internet ya, atau isi API key di Pengaturan, nanti aku bisa bantu lebih banyak~',
  ],
  offline: [
    'Internetnya lagi putus dan yang itu belum ada di ingatanku, Rover. Coba cari di internet kalau sudah tersambung, atau isi API key di Pengaturan.',
  ],
};

const SMALL_TALK = [
  { test: /^(halo|hai|hi|hei|hey|hallo|pagi|siang|sore|malam|selamat)\b/, replies: [
    'Hai, Rover! Aku ada di sini. Mau tanya soal dunia Wuthering Waves?',
    'Halo, Rover! Kamu datang tepat waktu, aku lagi bosan melayang-layang, haha.',
  ] },
  { test: /\b(terima kasih|makasih|thanks|thank you|thx)\b/, replies: [
    'Sama-sama, Rover! Kalau butuh apa-apa, panggil aku saja.',
  ] },
  { test: /\b(apa kabar|kabarmu|lagi apa|sedang apa)\b/, replies: [
    'Aku baik! Kondisiku prima dan penuh energi, senang kamu mampir!',
  ] },
  { test: /\b(siapa (kamu|dirimu|namamu)|kenalan|perkenalkan)\b/, replies: [
    'Aku Aemeath, hantu digital yang dulu Synchronist di Startorch Academy. Cuma kamu yang bisa melihatku, Rover!',
  ] },
];

// getEntries() -> [{ id, topic, text, credit: { title, url, license } }]
function createLocalResponder(options) {
  const getEntries = options.getEntries;
  const rng = options.rng || Math.random;
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

  function index() {
    const rawList = typeof getEntries === 'function' ? getEntries() : [];
    // Only verified, sourced entries can be used as certain answers
    const validEntries = (Array.isArray(rawList) ? rawList : []).filter((entry) => {
      if (!entry) return false;
      const hasSource = Boolean(entry.source || (entry.credit && entry.credit.url));
      const isVerified = (entry.status || 'verified') === 'verified';
      return hasSource && isVerified;
    });

    const entries = validEntries.map((entry) => ({
      entry: entry,
      topic: new Set(keywords(entry.topic)),
      body: new Set(keywords(entry.topic + ' ' + entry.text)),
    }));
    const frequency = new Map();
    for (const item of entries) {
      for (const word of item.body) frequency.set(word, (frequency.get(word) || 0) + 1);
    }
    return { entries: entries, frequency: frequency };
  }

  function search(text) {
    const words = keywords(text);
    if (words.length === 0) return [];
    const { entries, frequency } = index();
    const scored = [];
    for (const item of entries) {
      let score = 0;
      let matched = 0;
      for (const word of words) {
        if (!item.body.has(word)) continue;
        const rarity = Math.log(1 + entries.length / (1 + (frequency.get(word) || 0)));
        score += (item.topic.has(word) ? TOPIC_WEIGHT : 1) * rarity;
        matched += 1;
      }
      const enough = words.length === 1 ? matched === 1 : matched >= Math.ceil(words.length / 2);
      if (score >= MIN_SCORE && enough) scored.push({ entry: item.entry, score: score });
    }
    return scored.sort((a, b) => b.score - a.score);
  }

  // reason: 'no-key' | 'offline'. Returns { text, sources, matched }.
  function respond(text, reason) {
    const jw = detectJourneyWell(text);
    if (jw.isDirectFarewell) {
      return {
        text: getJourneyWellReply({ text, rng: rng }),
        sources: [],
        matched: true,
        anim: jw.animation || 'waving',
        animMs: jw.animMs || 3000,
        event: 'journey-well-farewell',
        emotion: jw.emotion,
      };
    }

    const travel = resolveTravelIntent(text);
    if (travel.intent !== 'none' && travel.confidence >= 0.7) {
      const includeChecklist = travel.intent === 'adventure' || travel.intent === 'travel-risk';
      return {
        text: getTravelDialogue(travel, { rng: rng, includeChecklist: includeChecklist }),
        sources: [],
        matched: true,
        anim: travel.animation || 'waving',
        animMs: 2500,
        event: 'travel-farewell',
        emotion: travel.emotion,
        travelIntent: travel.intent,
      };
    }

    const message = normalize(text);
    for (const talk of SMALL_TALK) {
      if (talk.test.test(message)) return { text: pick(talk.replies), sources: [], matched: false };
    }

    const hits = search(text);
    if (hits.length === 0) {
      const lines = NO_MATCH[reason] || NO_MATCH['no-key'];
      return { text: pick(lines), sources: [], matched: false };
    }

    const chosen = [hits[0]];
    if (hits[1] && hits[1].score >= hits[0].score * SECOND_RATIO) {
      const combined = hits[0].entry.text.length + hits[1].entry.text.length;
      if (combined <= MAX_REPLY) chosen.push(hits[1]);
    }
    const lead = reason === 'offline'
      ? 'Internetnya lagi putus, jadi aku jawab dari ingatanku saja ya~'
      : pick(INTROS);
    const body = chosen.map((hit) => hit.entry.text).join('\n\n');
    const seen = new Set();
    const sources = [];
    for (const hit of chosen) {
      const credit = hit.entry.credit;
      if (credit && !seen.has(credit.url)) {
        seen.add(credit.url);
        sources.push(credit);
      }
    }
    return { text: lead + '\n\n' + body, sources: sources, matched: true };
  }

  return { respond: respond, search: search };
}

module.exports = { createLocalResponder };
