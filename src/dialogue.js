// Things Aemeath says to Rover. Pure module: the renderer owns the clock and
// the bubble, this only picks a line for the current situation.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AemeathDialogue = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LINES = {
    general: [
      'Rover, jangan kaget ya. Ini cuma aku, hantu digitalmu. Boo!',
      'Cuma kamu yang bisa melihatku. Jadi setiap kamu menoleh ke sini, aku senang sekali.',
      'Nama Fleet Snowfluff itu muncul begitu saja waktu aku mendaftarkan domain. Asal-asalan, tapi lucu kan?',
      'Aku sudah tidak perlu makan lagi. Tapi kalau ada makanan yang lagi viral, aku tetap penasaran, haha.',
      'Dulu kamu sering bercerita saat malam berbadai. Sekarang giliranku menemanimu.',
      'Aku ingin berjalan di sampingmu, Rover. Bukan cuma mengikuti dari belakang.',
      'Diagnosis mandiri Exostrider: semua hijau. Aku juga baik-baik saja, jangan khawatir.',
      'Hantu tidak bisa merasa sakit. Tapi kalau kamu kelelahan, aku tetap cemas.',
      'Kalau gelar penyelamat terasa berat, bagi sedikit padaku. Aku ikut memikulnya.',
      'Salju di Frostlands sudah lama tidak kulihat. Kapan-kapan temani aku ke sana ya.',
      'Kamu sudah minum air hari ini? Aku tidak bisa menuangkannya, jadi aku cuma bisa mengingatkan.',
    ],
    flying: [
      'Lihat tadi? Aku bisa terbang miring! Enaknya jadi hantu digital.',
      'Ke atas, ke bawah, serong. Layar sebesar ini jadi langitku sendiri!',
      'Rover, kamu lihat aku melayang barusan? Tolong bilang keren.',
    ],
    working: [
      'Sesi AI-mu sedang bekerja keras. Aku berjaga di sini, Rover.',
      'Ssst, para agen sedang mengetik. Aku diam saja sambil melayang.',
      'Semoga semua tesnya lulus. Aku menahan napas, padahal tidak bernapas, haha.',
    ],
    decision: [
      'Rover, sesi AI-mu menunggu keputusanmu! Aku bingung, jadi kamu saja yang menjawab.',
      'Ada pertanyaan yang belum kamu jawab. Jangan biarkan dia menunggu sendirian.',
    ],
    music: [
      'Lagunya enak. Aku ikut bersenandung, tapi cuma kamu yang dengar, haha.',
      'Dulu aku suka tampil di panggung digital. Mau kunyanyikan satu lagu? Eh, nanti telingamu capek.',
    ],
    morning: [
      'Selamat pagi, Rover! Hari ini kita terbang ke mana?',
      'Pagi! Semoga hari ini lebih ringan untukmu.',
    ],
    lateNight: [
      'Sudah larut, Rover. Kamu dulu bilang tidur itu penting, ingat?',
      'Malam begini mengingatkanku pada badai dulu. Istirahatlah, aku jaga di sini.',
    ],
  };

  const RECENT_LIMIT = 4;
  // Remarks come at random between 60% and 140% of the configured average.
  const SPREAD_LOW = 0.6;
  const SPREAD_HIGH = 1.4;

  function chatIntervalRange(averageMinutes) {
    const base = averageMinutes * 60000;
    return { minMs: base * SPREAD_LOW, maxMs: base * SPREAD_HIGH };
  }

  function createDialogue(options) {
    const rng = (options && options.rng) || Math.random;
    const recent = new Map(); // category -> recently used indexes

    function pickFrom(category) {
      const pool = LINES[category];
      const seen = recent.get(category) || [];
      const fresh = [];
      for (let i = 0; i < pool.length; i++) if (!seen.includes(i)) fresh.push(i);
      const candidates = fresh.length > 0 ? fresh : pool.map((_, i) => i);
      const index = candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
      const next = seen.concat(index).slice(-Math.min(RECENT_LIMIT, pool.length - 1));
      recent.set(category, next);
      return pool[index];
    }

    // context: { hour, decisionPending, sessionRunning, musicPlaying, flying }
    function categoryFor(context) {
      const ctx = context || {};
      if (ctx.decisionPending) return 'decision';
      const options = ['general', 'general'];
      if (ctx.sessionRunning) options.push('working', 'working');
      if (ctx.musicPlaying) options.push('music', 'music');
      if (ctx.flying) options.push('flying');
      if (typeof ctx.hour === 'number') {
        if (ctx.hour >= 0 && ctx.hour < 5) options.push('lateNight', 'lateNight', 'lateNight');
        else if (ctx.hour >= 5 && ctx.hour < 10) options.push('morning');
      }
      return options[Math.min(options.length - 1, Math.floor(rng() * options.length))];
    }

    return {
      next: (context) => pickFrom(categoryFor(context)),
    };
  }

  return { createDialogue: createDialogue, chatIntervalRange: chatIntervalRange, LINES: LINES };
});
