// Journey Well Protocol & Phrase Detector
// Detects the signature phrase "Journey well" and conservative variants,
// distinguishes direct farewell utterances from quotes/discussion,
// and maps emotional states to valid sprite animations from the atlas.
//
// Pure and deterministic: works offline, without a model call, and without OS execution.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AemeathJourneyWell = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EMOTIONS = {
    EXCITED: 'excited',
    WARM_CONCERN: 'warm-concern',
    WISTFUL_CONCERN: 'wistful-concern',
    SERIOUS_SUPPORT: 'serious-support',
    NEUTRAL_HELPFUL: 'neutral-helpful',
  };

  // Valid animations defined in assets/pet/atlas.json:
  // 'idle', 'running-right', 'running-left', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review'
  const ATLAS_ANIMATIONS = {
    [EMOTIONS.WISTFUL_CONCERN]: 'waving',
    [EMOTIONS.WARM_CONCERN]: 'waving',
    [EMOTIONS.EXCITED]: 'jumping',
    [EMOTIONS.SERIOUS_SUPPORT]: 'waiting',
    [EMOTIONS.NEUTRAL_HELPFUL]: 'idle',
  };

  const SIGNATURE_REPLIES_ID = [
    'Journey well, Rover... Jaga dirimu baik-baik di luar sana ya. Ingat makan dan jangan memaksakan diri. Aku selalu menunggumu di sini!',
    'Perjalanan yang baik ya, Rover... Kamu sudah siap semuanya? Jangan sampai ada yang tertinggal. Bikin aku bangga, dan kembalilah dengan selamat!',
    'Journey well... Dunia di luar sana luas dan kadang dingin, tapi aku tahu kamu pasti bisa melewatinya. Jangan lupa pulang ke kabin kita ya, Rover?',
    'Kamu mau berangkat sekarang, Rover? ...Journey well. Hati-hati di jalan ya, aku akan menjaga tempat ini sampai kamu kembali!',
  ];

  const SIGNATURE_REPLIES_EN = [
    'Journey well, Rover... Please take good care of yourself out there. Make me proud, and come back safely, okay?',
    'Journey well... No matter how far you voyage, I will be right here waiting for your return. Do not push yourself too hard!',
    'Journey well, Rover. Stay warm, watch your step, and remember that I am always cheering for you from here!',
  ];

  const DISCUSSION_PATTERN =
    /\b(says?|said|quote[s]?|frasa|phrase|kata|bilang|arti|artinya|mean[s]?|meaning|maksud|wiki|baca|read|saw|lihat|kenapa|why|what|apa|tahu|tentang|soal|sebut)\b/i;

  const QUOTE_REGEX = /["'“‘«]([^"'”’»]+)["'”’»]/;
  const ALL_QUOTES_REGEX = /["'“‘«][^"'”’»]*["'”’»]/g;

  // Indonesian / English particles or direct address tokens that can accompany a direct farewell
  const ALLOWED_AFFIXES = new Set(['aemeath', 'rover', 'ya', 'yah', 'deh', 'dong', 'nih']);

  function cleanText(text) {
    return String(text == null ? '' : text)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isSignaturePhrase(cleaned) {
    if (!cleaned) return false;
    if (cleaned === 'journey well') return true;
    const words = cleaned.split(' ');
    // Must contain exactly "journey" followed by "well"
    const jIdx = words.indexOf('journey');
    if (jIdx === -1 || words[jIdx + 1] !== 'well') return false;

    // Remaining words must only be known affixes / addresses
    for (let i = 0; i < words.length; i++) {
      if (i === jIdx || i === jIdx + 1) continue;
      if (!ALLOWED_AFFIXES.has(words[i])) return false;
    }
    return true;
  }

  // Detects whether a message represents a Journey Well signature farewell,
  // a discussion/mention, or no match.
  function detectJourneyWell(rawText) {
    const text = typeof rawText === 'string' ? rawText.trim() : '';
    if (!text) {
      return {
        matched: false,
        isSignature: false,
        isQuotedOrDiscussed: false,
        isDirectFarewell: false,
        type: 'none',
        emotion: EMOTIONS.NEUTRAL_HELPFUL,
        animation: 'idle',
        animMs: null,
      };
    }

    const cleaned = cleanText(text);
    const hasDiscussionWords = DISCUSSION_PATTERN.test(text);

    // Check quotes
    const quoteMatch = QUOTE_REGEX.exec(text);
    const quotedContent = quoteMatch ? quoteMatch[1].trim() : '';
    const cleanedQuote = cleanText(quotedContent);
    const textWithoutQuotes = text.replace(ALL_QUOTES_REGEX, '').trim();
    const cleanedWithoutQuotes = cleanText(textWithoutQuotes);

    // Case 1: Pure quoted signature, e.g. '"Journey well"' or '“Journey well!”'
    if (quoteMatch && isSignaturePhrase(cleanedQuote)) {
      if (cleanedWithoutQuotes === '' && !hasDiscussionWords) {
        return {
          matched: true,
          isSignature: true,
          isQuotedOrDiscussed: false,
          isDirectFarewell: true,
          type: 'signature-farewell',
          emotion: EMOTIONS.WISTFUL_CONCERN,
          animation: ATLAS_ANIMATIONS[EMOTIONS.WISTFUL_CONCERN],
          animMs: 3000,
        };
      } else {
        return {
          matched: true,
          isSignature: false,
          isQuotedOrDiscussed: true,
          isDirectFarewell: false,
          type: 'discussion',
          emotion: EMOTIONS.NEUTRAL_HELPFUL,
          animation: ATLAS_ANIMATIONS[EMOTIONS.NEUTRAL_HELPFUL],
          animMs: null,
        };
      }
    }

    // Case 2: Exact signature match (possibly with addresses/particles like "Journey well, Aemeath!")
    if (isSignaturePhrase(cleaned)) {
      if (hasDiscussionWords) {
        return {
          matched: true,
          isSignature: false,
          isQuotedOrDiscussed: true,
          isDirectFarewell: false,
          type: 'discussion',
          emotion: EMOTIONS.NEUTRAL_HELPFUL,
          animation: ATLAS_ANIMATIONS[EMOTIONS.NEUTRAL_HELPFUL],
          animMs: null,
        };
      }
      return {
        matched: true,
        isSignature: true,
        isQuotedOrDiscussed: false,
        isDirectFarewell: true,
        type: 'signature-farewell',
        emotion: EMOTIONS.WISTFUL_CONCERN,
        animation: ATLAS_ANIMATIONS[EMOTIONS.WISTFUL_CONCERN],
        animMs: 3000,
      };
    }

    // Case 3: Message contains "journey well" in broader context
    if (cleaned.includes('journey well')) {
      const words = cleaned.split(' ');
      if (hasDiscussionWords || words.length > 5 || quoteMatch) {
        return {
          matched: true,
          isSignature: false,
          isQuotedOrDiscussed: true,
          isDirectFarewell: false,
          type: 'discussion',
          emotion: EMOTIONS.NEUTRAL_HELPFUL,
          animation: ATLAS_ANIMATIONS[EMOTIONS.NEUTRAL_HELPFUL],
          animMs: null,
        };
      }
      return {
        matched: true,
        isSignature: false,
        isQuotedOrDiscussed: false,
        isDirectFarewell: false,
        type: 'variant',
        emotion: EMOTIONS.WARM_CONCERN,
        animation: ATLAS_ANIMATIONS[EMOTIONS.WARM_CONCERN],
        animMs: 2500,
      };
    }

    return {
      matched: false,
      isSignature: false,
      isQuotedOrDiscussed: false,
      isDirectFarewell: false,
      type: 'none',
      emotion: EMOTIONS.NEUTRAL_HELPFUL,
      animation: ATLAS_ANIMATIONS[EMOTIONS.NEUTRAL_HELPFUL],
      animMs: null,
    };
  }

  // Pick a dialogue reply for Journey Well
  function getJourneyWellReply(options) {
    const opts = options || {};
    const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    const text = typeof opts.text === 'string' ? opts.text : '';

    const isEn =
      opts.language === 'en' ||
      /\b(the|you|safe|care|bye|see\s+you)\b/i.test(text) && !/\b(ya|di|ke|dan|aku|kamu|jalan|hati)\b/i.test(text);

    const pool = isEn ? SIGNATURE_REPLIES_EN : SIGNATURE_REPLIES_ID;
    const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    return pool[index];
  }

  // Create an event object ready for BehaviorDirector
  function createJourneyWellEvent(rawText, options) {
    const opts = options || {};
    const detection = detectJourneyWell(rawText);
    const replyText = opts.text || getJourneyWellReply({ text: rawText, rng: opts.rng, language: opts.language });

    return {
      kind: 'journey-well-farewell',
      category: 'direct',
      priority: 3, // PRIORITY.direct
      text: replyText,
      anim: detection.animation || 'waving',
      animMs: detection.animMs || 3000,
      emotion: detection.emotion || EMOTIONS.WISTFUL_CONCERN,
      isSignature: detection.isSignature,
    };
  }

  return {
    detectJourneyWell: detectJourneyWell,
    getJourneyWellReply: getJourneyWellReply,
    createJourneyWellEvent: createJourneyWellEvent,
    cleanText: cleanText,
    isSignaturePhrase: isSignaturePhrase,
    EMOTIONS: EMOTIONS,
    ATLAS_ANIMATIONS: ATLAS_ANIMATIONS,
    SIGNATURE_REPLIES_ID: SIGNATURE_REPLIES_ID,
    SIGNATURE_REPLIES_EN: SIGNATURE_REPLIES_EN,
  };
});
