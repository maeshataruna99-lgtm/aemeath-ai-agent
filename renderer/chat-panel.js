'use strict';

// Chat box that sits next to the pet, so Rover can talk to Aemeath right where
// she is instead of in a separate window. The overlay window is click-through
// and unfocused by default, so opening the box asks the main process for focus.
(function () {
  const GREETING = 'Hai, Rover! Mau ngobrol apa? Tanya soal Wuthering Waves juga boleh~';
  const MAX_MESSAGES = 14;
  const GAP = 16; // space between the pet and the box
  const EDGE = 8; // space kept to the screen edge
  const LOG_MAX = 240;
  const LOG_MIN = 70;
  const IDLE_CLOSE_MS = 3 * 60 * 1000;
  const FORGET_AFTER_MS = 10 * 60 * 1000;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  // options: { api, anchor(): { centerX, top, bottom }, bounds(): { width, height } }
  function create(options) {
    const api = options.api;
    const el = document.getElementById('chat');
    const log = document.getElementById('chat-log');
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');
    const send = document.getElementById('chat-send');
    const notice = document.getElementById('chat-notice');
    const noticeText = document.getElementById('chat-notice-text');
    const settingsButton = document.getElementById('chat-settings');
    const resetButton = document.getElementById('chat-reset');
    const closeButton = document.getElementById('chat-close');

    let isOpen = false;
    let busy = false;
    let ready = false;
    let offlineMode = false;
    let idleTimer = null;
    let forgetTimer = null;

    function add(kind, text, sources) {
      const message = document.createElement('div');
      message.className = 'msg ' + kind;
      const body = document.createElement('div');
      body.textContent = text;
      message.appendChild(body);
      if (sources && sources.length > 0) {
        const credit = document.createElement('div');
        credit.className = 'credit';
        credit.textContent = 'Sumber: ' + sources.map((s) => s.title + ' (' + s.license + ')').join(', ');
        message.appendChild(credit);
      }
      log.appendChild(message);
      while (log.children.length > MAX_MESSAGES) log.removeChild(log.firstChild);
      log.scrollTop = log.scrollHeight;
      return message;
    }

    function controls() {
      input.disabled = !ready;
      send.disabled = !ready || busy;
    }

    function touch() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (isOpen && !busy) close();
      }, IDLE_CLOSE_MS);
    }

    async function refreshStatus() {
      const status = await api.chatStatus();
      const provider = status && status.providers.find((p) => p.id === status.provider);
      const hasKey = Boolean(provider && provider.hasKey);
      offlineMode = !hasKey && Boolean(status && status.offlineFallback);
      ready = hasKey || offlineMode;
      notice.classList.toggle('hidden', hasKey);
      if (!hasKey) {
        noticeText.textContent = offlineMode
          ? 'Mode offline: aku hanya menjawab dari ingatanku (lorebook). Isi API key di Pengaturan untuk jawaban lengkap.'
          : 'Belum ada kunci API' + (provider ? ' ' + provider.name : '') + '. Atur dulu di Pengaturan.';
      }
      controls();
      reposition();
    }

    // The box sits above the pet, or below it when that side has more room. If
    // neither side fits the whole box, the message list shrinks to the room left
    // so the box never covers her.
    function reposition() {
      if (!isOpen) return;
      const anchor = options.anchor();
      const bounds = options.bounds();
      const width = el.offsetWidth || 340;
      const chrome = el.offsetHeight - log.offsetHeight;
      const natural = chrome + Math.min(log.scrollHeight, LOG_MAX);
      const roomAbove = anchor.top - GAP - EDGE;
      const roomBelow = bounds.height - (anchor.bottom + GAP) - EDGE;
      const placeBelow = natural > roomAbove && roomBelow > roomAbove;
      const room = placeBelow ? roomBelow : roomAbove;
      log.style.maxHeight = clamp(room - chrome, LOG_MIN, LOG_MAX) + 'px';

      const height = el.offsetHeight;
      const left = clamp(anchor.centerX - width / 2, EDGE, Math.max(EDGE, bounds.width - width - EDGE));
      const top = placeBelow ? anchor.bottom + GAP : anchor.top - GAP - height;
      el.classList.toggle('below', placeBelow);
      el.style.left = left + 'px';
      el.style.top = clamp(top, EDGE, Math.max(EDGE, bounds.height - height - EDGE)) + 'px';
      el.style.setProperty('--arrow-x', clamp(anchor.centerX - left, 16, Math.max(16, width - 16)) + 'px');
    }

    async function open() {
      clearTimeout(forgetTimer);
      isOpen = true;
      el.classList.remove('hidden');
      if (log.children.length === 0) add('bot', GREETING);
      reposition();
      api.focusWindow();
      await refreshStatus();
      input.focus();
      touch();
    }

    function resetConversation() {
      api.chatReset();
      log.textContent = '';
      if (isOpen) add('bot', GREETING);
    }

    function close() {
      isOpen = false;
      el.classList.add('hidden');
      clearTimeout(idleTimer);
      api.blurWindow();
      // A closed box keeps the conversation for a while, then forgets it.
      clearTimeout(forgetTimer);
      forgetTimer = setTimeout(resetConversation, FORGET_AFTER_MS);
    }

    async function submit() {
      const text = input.value.trim();
      if (!text || !ready || busy) return;
      input.value = '';
      add('user', text);
      const pending = add('bot pending', 'Aemeath sedang berpikir...');
      busy = true;
      controls();
      touch();
      try {
        const result = await api.chatSend(text);
        pending.remove();
        if (result.ok) {
          add('bot', result.text, result.sources);
        } else {
          add('err', result.error || 'Terjadi kesalahan.');
          if (result.code === 'no-key' || result.code === 'auth') await refreshStatus();
        }
      } catch {
        pending.remove();
        add('err', 'Terjadi kesalahan saat mengirim pesan.');
      } finally {
        busy = false;
        controls();
        reposition();
        if (isOpen) input.focus();
        touch();
      }
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    });
    el.addEventListener('keydown', (event) => {
      touch();
      if (event.key === 'Escape') close();
    });
    resetButton.addEventListener('click', resetConversation);
    closeButton.addEventListener('click', close);
    settingsButton.addEventListener('click', () => api.openSettings());
    // Coming back from Settings: pick up a newly saved or removed key.
    window.addEventListener('focus', () => {
      if (isOpen) refreshStatus();
    });

    return {
      toggle: () => (isOpen ? close() : open()),
      open: open,
      close: close,
      isOpen: () => isOpen,
      reposition: reposition,
      contains: (node) => el.contains(node),
    };
  }

  window.AemeathChatPanel = { create: create };
})();
