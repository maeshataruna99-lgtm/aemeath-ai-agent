'use strict';

// Built-in /change-mode-search: switches Aemeath between the Wuthering Waves
// wiki focus and a full companion that helps with any topic (coding, cooking,
// and so on). It only works with an AI model behind it, so turning it on needs
// a saved API key; without one the offline lorebook answers stay as they are.

const ON_WORDS = /^(on|nyala|nyalakan|aktif|aktifkan|hidup|ya)$/i;
const OFF_WORDS = /^(off|mati|matikan|nonaktif|nonaktifkan|wiki)$/i;
const STATUS_WORDS = /^(status|cek|info)$/i;

// options:
//   isOn() -> boolean          the saved choice
//   setOn(boolean)             saves the choice
//   hasKey() -> boolean        whether the current provider has a key
//   providerName() -> string   for the messages
function createCompanionMode(options) {
  const isOn = options.isOn;
  const setOn = options.setOn;
  const hasKey = options.hasKey;
  const providerName = options.providerName || (() => 'model AI');

  // The mode is only in effect while a key exists; the saved choice alone is not enough.
  function active() {
    return isOn() === true && hasKey() === true;
  }

  function noKeyText() {
    return (
      'Mode pendamping butuh model AI, Rover. Simpan dulu kunci API ' + providerName() +
      ' di Pengaturan, lalu ketik /change-mode-search lagi. Sementara ini aku tetap fokus di wiki Wuthering Waves.'
    );
  }

  function statusText() {
    if (!hasKey()) return noKeyText();
    return active()
      ? 'Mode pendamping sedang aktif: aku bantu topik apa saja, dari ngoding sampai masak. Ketik /change-mode-search off untuk kembali fokus ke wiki.'
      : 'Sekarang aku fokus ke wiki Wuthering Waves. Ketik /change-mode-search untuk mode pendamping penuh.';
  }

  // Resolves to { ok, text }. No `mode` field: the chat box stays a chat box.
  async function run(rawArg) {
    const arg = String(rawArg == null ? '' : rawArg).trim();
    if (STATUS_WORDS.test(arg)) return { ok: true, text: statusText() };

    let next;
    if (arg === '') next = !active();
    else if (ON_WORDS.test(arg)) next = true;
    else if (OFF_WORDS.test(arg)) next = false;
    else return { ok: false, text: 'Pakai /change-mode-search, /change-mode-search on, off, atau status ya.' };

    if (!next) {
      setOn(false);
      return { ok: true, text: 'Oke, aku kembali fokus jadi pemandu wiki Wuthering Waves, Rover~' };
    }
    if (!hasKey()) return { ok: false, text: noKeyText() };
    setOn(true);
    return {
      ok: true,
      text:
        'Mode pendamping aktif! Sekarang aku bukan cuma pemandu wiki: tanya soal ngoding, resep masakan, belajar, ' +
        'atau apa saja, aku bantu sebisaku, hehe. Ketik /change-mode-search lagi untuk kembali ke mode wiki.',
    };
  }

  return { run: run, active: active, status: statusText };
}

module.exports = { createCompanionMode };
