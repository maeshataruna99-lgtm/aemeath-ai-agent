// Travel & Adventure Context Intent Resolver
// Classifies user travel intents into travel-plan, adventure, departure, return, and travel-risk.
// Resolves short follow-up messages against recent conversation context,
// provides character-consistent dialogue with optional checklists when relevant,
// and maps emotional states to valid atlas animations without guilt-tripping or pretending live knowledge.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AemeathTravelIntent = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const INTENTS = {
    TRAVEL_PLAN: 'travel-plan',
    ADVENTURE: 'adventure',
    DEPARTURE: 'departure',
    RETURN: 'return',
    TRAVEL_RISK: 'travel-risk',
    NONE: 'none',
  };

  const SUB_INTENTS = {
    CASUAL_TRIP: 'casual-trip',
    COMMUTE: 'commute',
    VACATION: 'vacation',
    GENERAL_TRIP: 'general-trip',
    EXPEDITION: 'expedition',
    DEPARTURE: 'departure',
    RISKY_DEPARTURE: 'risky-departure',
    ARRIVAL: 'arrival',
    RISKY_TRAVEL: 'risky-travel',
    AMBIGUOUS: 'ambiguous',
    NONE: 'none',
  };

  const EMOTIONS = {
    EXCITED: 'excited',
    WARM_CONCERN: 'warm-concern',
    SERIOUS_SUPPORT: 'serious-support',
    NEUTRAL_HELPFUL: 'neutral-helpful',
  };

  // Valid animations defined in assets/pet/atlas.json:
  // 'idle', 'running-right', 'running-left', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review'
  const ATLAS_ANIMATIONS = {
    [EMOTIONS.WARM_CONCERN]: 'waving',
    [EMOTIONS.EXCITED]: 'jumping',
    [EMOTIONS.SERIOUS_SUPPORT]: 'waiting',
    [EMOTIONS.NEUTRAL_HELPFUL]: 'idle',
  };

  const TECHNICAL_EXCLUSIONS =
    /\b(react-router|router|routing|routes?|api|endpoint|express|ip|dns|packet|customer\s+journey|user\s+journey|journey\s+map|band|album|song|game|matrix|pathfinding)\b/i;

  const RISK_SIGNALS =
    /\b(sendirian|sendiri|alone|malam\s+buta|malam-malam|tengah\s+malam|midnight|gelap|badai|storm|blizzard|hujan\s+lebat|banjir|jurang|curam|ekstrem|extreme|berbahaya|danger|risky|hazard)\b/i;

  const ADVENTURE_SIGNALS =
    /\b(mendaki|daki|naik\s+gunung|camping|berkemah|kemah|jelajah|hutan|hiking|climbing|backpacking|ekspedisi|expedition|trekking|summit|survival)\b/i;

  const DEPARTURE_SIGNALS =
    /\b(berangkat\s+sekarang|aku\s+berangkat|pamit|cabut|heading\s+out|leaving\s+now|off\s+I\s+go|aku\s+jalan\s+dulu|otw|on\s+the\s+way|mau\s+otw|pamit\s+dulu|berangkat\s+dulu|pergi\s+dulu)\b/i;

  const RETURN_SIGNALS =
    /\b(sudah\s+sampai|udah\s+sampai|sampai\s+di\s+[a-z0-9_-]+|sampai\s+tujuan|arrived|back\s+home|just\s+(?:got\s+back|arrived)|pulang\s+ke\s+[a-z0-9_-]+|baru\s+(?:saja\s+|udah\s+)?sampai|selamat\s+sampai|sudah\s+pulang|udah\s+pulang|tiba\s+di|sudah\s+tiba)\b/i;

  const MOVEMENT_SIGNALS =
    /\b(jalan|berjalan|jalan\s+kaki|walking|walk|nyetir|mengemudi|driving|drive|lewat|pergi|going|heading|naik\s+motor|naik\s+mobil)\b/i;

  const TRAVEL_PLAN_SIGNALS =
    /\b((?:rencana|mau|ingin|jadwal|ada)\s+(?:liburan|wisata|pergi|jalan-jalan|trip|perjalanan|keberangkatan)|liburan\s+ke|perjalanan\s+dinas|ke\s+luar\s+kota|road\s+trip|traveling|jalan-jalan|wisata|naik\s+pesawat|naik\s+kereta|tiket\s+pesawat|planning\s+a\s+trip|vacation|going\s+to|visit)\b/i;

  const CASUAL_DESTINATIONS =
    /\b(kafe|cafe|minimarket|supermarket|warung|toko|mall|kampus|kantor|sekolah|gym|resto|restoran|kopi|coffee)\b/i;

  function cleanText(text) {
    return String(text == null ? '' : text)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function resolveTravelIntent(rawText, recentHistory) {
    const text = typeof rawText === 'string' ? rawText.trim() : '';
    if (!text) {
      return {
        intent: INTENTS.NONE,
        subIntent: SUB_INTENTS.NONE,
        confidence: 0.0,
        signals: [],
        needsClarification: false,
        emotion: EMOTIONS.NEUTRAL_HELPFUL,
        animation: ATLAS_ANIMATIONS[EMOTIONS.NEUTRAL_HELPFUL],
      };
    }

    // Technical exclusions
    if (
      TECHNICAL_EXCLUSIONS.test(text) &&
      !/(aku\s+mau|jalan-jalan|berangkat|liburan|pulang|mendaki|camping)/i.test(text)
    ) {
      return {
        intent: INTENTS.NONE,
        subIntent: SUB_INTENTS.NONE,
        confidence: 0.0,
        signals: ['technical_exclusion'],
        needsClarification: false,
        emotion: EMOTIONS.NEUTRAL_HELPFUL,
        animation: ATLAS_ANIMATIONS[EMOTIONS.NEUTRAL_HELPFUL],
      };
    }

    const cleaned = cleanText(text);
    const signals = [];

    const hasRisk = RISK_SIGNALS.test(text);
    const hasAdventure = ADVENTURE_SIGNALS.test(text);
    const hasDeparture = DEPARTURE_SIGNALS.test(text);
    const hasReturn = RETURN_SIGNALS.test(text);
    const hasMovement = MOVEMENT_SIGNALS.test(text);
    const hasPlan = TRAVEL_PLAN_SIGNALS.test(text);
    const hasCasual = CASUAL_DESTINATIONS.test(text);

    // Context resolution for short follow-ups
    const words = cleaned.split(' ');
    const isShortFollowup = words.length <= 5;
    let contextHasTravel = false;
    let contextType = null;

    if (Array.isArray(recentHistory) && isShortFollowup) {
      const recentUserTurns = recentHistory
        .filter((h) => h && h.role === 'user' && typeof h.content === 'string')
        .slice(-3)
        .map((h) => h.content)
        .join(' ');

      if (ADVENTURE_SIGNALS.test(recentUserTurns)) {
        contextHasTravel = true;
        contextType = INTENTS.ADVENTURE;
        signals.push('context_resolved_adventure');
      } else if (TRAVEL_PLAN_SIGNALS.test(recentUserTurns) || CASUAL_DESTINATIONS.test(recentUserTurns)) {
        contextHasTravel = true;
        contextType = INTENTS.TRAVEL_PLAN;
        signals.push('context_resolved_travel_plan');
      }
    }

    // 1. Return intent
    if (hasReturn) {
      signals.push('return');
      return {
        intent: INTENTS.RETURN,
        subIntent: SUB_INTENTS.ARRIVAL,
        confidence: 0.95,
        signals: signals,
        needsClarification: false,
        emotion: EMOTIONS.EXCITED,
        animation: ATLAS_ANIMATIONS[EMOTIONS.EXCITED],
      };
    }

    // 2. Departure intent
    if (hasDeparture) {
      signals.push('departure');
      if (hasRisk) {
        signals.push('risk');
        return {
          intent: INTENTS.TRAVEL_RISK,
          subIntent: SUB_INTENTS.RISKY_DEPARTURE,
          confidence: 0.95,
          signals: signals,
          needsClarification: false,
          emotion: EMOTIONS.SERIOUS_SUPPORT,
          animation: ATLAS_ANIMATIONS[EMOTIONS.SERIOUS_SUPPORT],
        };
      }
      return {
        intent: INTENTS.DEPARTURE,
        subIntent: SUB_INTENTS.DEPARTURE,
        confidence: 0.95,
        signals: signals,
        needsClarification: false,
        emotion: EMOTIONS.WARM_CONCERN,
        animation: ATLAS_ANIMATIONS[EMOTIONS.WARM_CONCERN],
      };
    }

    // 3. Travel with explicit risk
    if ((hasAdventure || hasPlan || hasMovement || contextHasTravel) && hasRisk) {
      signals.push('risk');
      return {
        intent: INTENTS.TRAVEL_RISK,
        subIntent: SUB_INTENTS.RISKY_TRAVEL,
        confidence: 0.9,
        signals: signals,
        needsClarification: false,
        emotion: EMOTIONS.SERIOUS_SUPPORT,
        animation: ATLAS_ANIMATIONS[EMOTIONS.SERIOUS_SUPPORT],
      };
    }

    // 4. Adventure / Expedition intent
    if (hasAdventure || (contextHasTravel && contextType === INTENTS.ADVENTURE)) {
      signals.push('adventure');
      return {
        intent: INTENTS.ADVENTURE,
        subIntent: SUB_INTENTS.EXPEDITION,
        confidence: 0.9,
        signals: signals,
        needsClarification: false,
        emotion: EMOTIONS.WARM_CONCERN,
        animation: ATLAS_ANIMATIONS[EMOTIONS.WARM_CONCERN],
      };
    }

    // 5. Travel Plan / Vacation / General trip
    if (hasPlan || (contextHasTravel && /(berangkat|jadi|pergi|siap)/i.test(cleaned))) {
      signals.push('travel-plan');
      const sub = /(liburan|wisata|vacation)/i.test(cleaned) ? SUB_INTENTS.VACATION : SUB_INTENTS.GENERAL_TRIP;
      return {
        intent: INTENTS.TRAVEL_PLAN,
        subIntent: sub,
        confidence: 0.85,
        signals: signals,
        needsClarification: false,
        emotion: EMOTIONS.WARM_CONCERN,
        animation: ATLAS_ANIMATIONS[EMOTIONS.WARM_CONCERN],
      };
    }

    // 6. Casual trip (cafe, grocery, store, etc.)
    if (hasCasual && /(ke|mau|pergi|jalan|beli|mampir)/i.test(cleaned)) {
      signals.push('casual-trip');
      return {
        intent: INTENTS.TRAVEL_PLAN,
        subIntent: SUB_INTENTS.CASUAL_TRIP,
        confidence: 0.8,
        signals: signals,
        needsClarification: false,
        emotion: EMOTIONS.WARM_CONCERN,
        animation: ATLAS_ANIMATIONS[EMOTIONS.WARM_CONCERN],
      };
    }

    // 7. Ambiguous travel mention
    if (/(mau\s+pergi|mau\s+jalan|traveling)/i.test(cleaned) && words.length <= 8) {
      signals.push('ambiguous');
      return {
        intent: INTENTS.TRAVEL_PLAN,
        subIntent: SUB_INTENTS.AMBIGUOUS,
        confidence: 0.5,
        signals: signals,
        needsClarification: true,
        emotion: EMOTIONS.NEUTRAL_HELPFUL,
        animation: ATLAS_ANIMATIONS[EMOTIONS.NEUTRAL_HELPFUL],
      };
    }

    return {
      intent: INTENTS.NONE,
      subIntent: SUB_INTENTS.NONE,
      confidence: 0.0,
      signals: signals,
      needsClarification: false,
      emotion: EMOTIONS.NEUTRAL_HELPFUL,
      animation: ATLAS_ANIMATIONS[EMOTIONS.NEUTRAL_HELPFUL],
    };
  }

  // Returns an optional checklist appropriate for high-activity / risky travel
  function getTravelChecklist(intentResult) {
    if (!intentResult) return null;
    if (intentResult.intent === INTENTS.ADVENTURE) {
      return [
        'Air minum & logistik secukupnya',
        'Pakaian hangat / pelindung cuaca',
        'Powerbank & alat komunikasi',
        'Peta rute / penunjuk arah',
      ];
    }
    if (intentResult.intent === INTENTS.TRAVEL_RISK) {
      return [
        'Pastikan daya baterai ponsel terisi penuh',
        'Kabari orang terdekat tentang rute dan estimasi waktu',
        'Pilih jalur yang cukup terang atau ramai jika memungkinkan',
        'Jangan ragu berbalik jika cuaca atau keadaan memburuk',
      ];
    }
    return null;
  }

  const DIALOGUES = {
    [INTENTS.RETURN]: [
      'Selamat datang kembali, Rover! Senang melihatmu sampai dengan selamat. Istirahat yang cukup dulu ya~',
      'Hore, kamu sudah pulang! Bagaimana perjalanannya? Lepas lelah dulu, nanti ceritakan padaku!',
    ],
    [INTENTS.DEPARTURE]: [
      'Perjalanan yang baik ya, Rover! Hati-hati di jalan, dan cepat kembali ke sini saat sudah selesai~',
      'Kamu mau berangkat sekarang? Jaga diri baik-baik di jalan ya, Rover. Aku akan menunggu di sini!',
    ],
    [INTENTS.ADVENTURE]: [
      'Wah, petualangan baru! Alam liar dan jalur pendakian itu menantang, Rover. Pastikan semua perlengkapanmu siap ya. Bikin aku bangga!',
      'Ekspedisi yang menarik! Jangan memaksakan diri kalau lelah, selalu perhatikan langkahmu, dan nikmati perjalanannya, Rover!',
    ],
    [INTENTS.TRAVEL_RISK]: [
      'Rover, jalur atau kondisimu terdengar berisiko... Tolong kabari orang terdekat, pastikan ponselmu aktif, dan utamakan keselamatanmu ya. Aku selalu mengkhawatirkanmu.',
      'Hati-hati sekali di luar sana ya, Rover. Kalau cuaca atau situasinya tidak aman, jangan ragu untuk berbalik atau berteduh. Keselamatanmu nomor satu!',
    ],
    [INTENTS.TRAVEL_PLAN]: [
      'Rencana perjalanan yang menyenangkan! Jangan lupa cek kembali barang-barang penting sebelum kamu berangkat nanti ya, Rover.',
      'Semoga rencanamu lancar ya, Rover! Nikmati waktumu dan luangkan waktu untuk rileks~',
    ],
  };

  function getTravelDialogue(intentResult, options) {
    const opts = options || {};
    const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    const intent = intentResult ? intentResult.intent : INTENTS.NONE;

    if (intentResult && intentResult.needsClarification) {
      return 'Kamu mau pergi ke suatu tempat, Rover? Kalau ada rencana perjalanan, ceritakan padaku ya~';
    }

    const pool = DIALOGUES[intent] || DIALOGUES[INTENTS.TRAVEL_PLAN];
    const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    let message = pool[index];

    if (opts.includeChecklist) {
      const checklist = getTravelChecklist(intentResult);
      if (checklist && checklist.length > 0) {
        message += '\n\nCatatan kecil dari Aemeath:\n' + checklist.map((item) => '- ' + item).join('\n');
      }
    }

    return message;
  }

  function createTravelEvent(rawText, options) {
    const opts = options || {};
    const intentResult = resolveTravelIntent(rawText, opts.recentHistory);
    const dialogue = opts.text || getTravelDialogue(intentResult, { rng: opts.rng, includeChecklist: opts.includeChecklist });

    return {
      kind: 'travel-farewell',
      category: 'direct',
      priority: 3, // PRIORITY.direct
      text: dialogue,
      anim: intentResult.animation || 'waving',
      animMs: 2500,
      emotion: intentResult.emotion || EMOTIONS.WARM_CONCERN,
      intent: intentResult.intent,
      subIntent: intentResult.subIntent,
      confidence: intentResult.confidence,
      signals: intentResult.signals,
    };
  }

  return {
    resolveTravelIntent: resolveTravelIntent,
    getTravelDialogue: getTravelDialogue,
    getTravelChecklist: getTravelChecklist,
    createTravelEvent: createTravelEvent,
    cleanText: cleanText,
    INTENTS: INTENTS,
    SUB_INTENTS: SUB_INTENTS,
    EMOTIONS: EMOTIONS,
    ATLAS_ANIMATIONS: ATLAS_ANIMATIONS,
  };
});
