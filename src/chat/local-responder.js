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

const INTROS_ID = [
  'Dari ingatanku, Rover:',
  'Oh, yang itu aku ingat!',
  'Hmm, kalau soal itu begini:',
];

const INTROS_EN = [
  'From what I remember, Rover:',
  'Oh, I remember that one!',
  "Hmm, regarding that, here's what I know:",
];

const NO_MATCH_ID = {
  'no-key': [
    'Hmm, yang itu belum ada di ingatanku, Rover. Coba cari di internet, atau isi API key chatbot di Pengaturan supaya aku bisa menjawab lebih lengkap!',
    'Wah, aku belum tahu soal itu. Cari dulu di internet ya, atau isi API key di Pengaturan, nanti aku bisa bantu lebih banyak~',
  ],
  offline: [
    'Internetnya lagi putus dan yang itu belum ada di ingatanku, Rover. Coba cari di internet kalau sudah tersambung, atau isi API key di Pengaturan.',
  ],
};

const NO_MATCH_EN = {
  'no-key': [
    "Hmm, that's not in my recollections yet, Rover. Try searching the web, or add a chatbot API key in Settings so I can answer more thoroughly!",
    "Whoa, I don't know about that one yet. Look it up online first, or add an API key in Settings, and I'll be able to help with much more~",
  ],
  offline: [
    "The internet is disconnected and that's not in my recollections yet, Rover. Try searching online once connected, or add an API key in Settings.",
  ],
};

const SMALL_TALK_ID = [
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

const SMALL_TALK_EN = [
  { test: /^(hello|hi|hey|hai|hallo|morning|afternoon|evening|good\s+(morning|afternoon|evening))\b/i, replies: [
    "Hi, Rover! I'm right here. Want to ask about the world of Wuthering Waves?",
    "Hello Rover! You arrived right on time, I was getting bored floating around, haha.",
  ] },
  { test: /\b(thank\s+you|thanks|thx|appreciate\s+it|terima kasih|makasih)\b/i, replies: [
    "You're welcome, Rover! If you need anything at all, just call me.",
  ] },
  { test: /\b(how\s+are\s+you|how\s+is\s+it\s+going|what\s+are\s+you\s+doing|doing\s+what|apa kabar|lagi apa)\b/i, replies: [
    "I'm doing great! In prime condition and full of energy, happy you dropped by!",
  ] },
  { test: /\b(who\s+are\s+you|what\s+is\s+your\s+name|introduce\s+yourself|siapa kamu)\b/i, replies: [
    "I'm Aemeath, the digital ghost who was once a Synchronist at Startorch Academy. Only you can see me, Rover!",
  ] },
];

const INTROS = INTROS_ID;
const NO_MATCH = NO_MATCH_ID;
const SMALL_TALK = SMALL_TALK_ID;

// getEntries() -> [{ id, topic, text, credit: { title, url, license } }]
function createLocalResponder(options) {
  const getEntries = options.getEntries;
  const rng = options.rng || Math.random;
  const getLocale = typeof options.getLocale === 'function' ? options.getLocale : () => (options.locale || 'id-ID');
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
      body: new Set(keywords(entry.topic + ' ' + entry.text + (entry.text_en ? ' ' + entry.text_en : ''))),
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
  function respond(text, reason, callOptions) {
    const loc = (callOptions && callOptions.locale) || getLocale();
    const isEn = loc === 'en-US';
    const activeIntros = isEn ? INTROS_EN : INTROS_ID;
    const activeNoMatch = isEn ? NO_MATCH_EN : NO_MATCH_ID;
    const activeSmallTalk = isEn ? SMALL_TALK_EN : SMALL_TALK_ID;

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
    for (const talk of activeSmallTalk) {
      if (talk.test.test(message)) return { text: pick(talk.replies), sources: [], matched: false };
    }

    const hits = search(text);
    if (hits.length === 0) {
      const lines = activeNoMatch[reason] || activeNoMatch['no-key'];
      return { text: pick(lines), sources: [], matched: false };
    }

    const getText = (e) => ((isEn && e.text_en) ? e.text_en : e.text);
    const chosen = [hits[0]];
    if (hits[1] && hits[1].score >= hits[0].score * SECOND_RATIO) {
      const combined = getText(hits[0].entry).length + getText(hits[1].entry).length;
      if (combined <= MAX_REPLY) chosen.push(hits[1]);
    }
    const lead = reason === 'offline'
      ? (isEn ? "The internet is down right now, so I'll answer from what I remember~" : 'Internetnya lagi putus, jadi aku jawab dari ingatanku saja ya~')
      : pick(activeIntros);
    const body = chosen.map((hit) => getText(hit.entry)).join('\n\n');
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
