'use strict';

// Chat box that sits next to the pet, so Rover can talk to Aemeath right where
// she is instead of in a separate window. The overlay window is click-through
// and unfocused by default, so opening the box asks the main process for focus.
(function () {
  const GREETING = 'Hai, Rover! Mau ngobrol apa? Tanya soal Wuthering Waves juga boleh~';
  const MAX_MESSAGES = 14;
  const GAP = 16; // space between the pet and the box
  const EDGE = 8; // space kept to the screen edge
  const LOG_MAX = 340;
  const LOG_MAX_LARGE = 520;
  const LOG_MIN = 140; // the message list never gets smaller than this
  const WIDTH = 400;
  const WIDTH_LARGE = 560;
  const SIZE_KEY = 'aemeath.chatLarge';
  const IDLE_CLOSE_MS = 3 * 60 * 1000;
  const TERMINAL_IDLE_MS = 15 * 60 * 1000;
  const FORGET_AFTER_MS = 10 * 60 * 1000;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  // options: { api, anchor(): { centerX, top, bottom }, bounds(): { width, height },
  //            onCommand() called after a slash command opened something }
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
    const suggest = document.getElementById('chat-suggest');
    const modeBadge = document.getElementById('chat-mode');
    const sizeButton = document.getElementById('chat-size');

    let isOpen = false;
    let busy = false;
    let ready = false;
    let offlineMode = false;
    let noticeNeeded = false;
    let idleTimer = null;
    let forgetTimer = null;
    let commands = [];
    let mode = 'chat'; // 'chat' or 'terminal'
    let large = false;
    let confirming = false; // a command is waiting for Rover to answer "ya"
    let cwd = '';
    let requestCounter = 0;

    function isSafeHttpUrl(url) {
      if (typeof url !== 'string') return false;
      try {
        const parsed = new URL(url.trim());
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
      } catch {
        return false;
      }
    }

    function appendSources(container, sources) {
      if (!sources || sources.length === 0) return;
      const existing = container.querySelector('.credit');
      if (existing) existing.remove();
      const credit = document.createElement('div');
      credit.className = 'credit';
      credit.appendChild(document.createTextNode('Sumber: '));
      sources.forEach((s, index) => {
        if (index > 0) credit.appendChild(document.createTextNode(', '));
        const meta = s.provider && s.license ? s.provider + ', ' + s.license : s.license || s.provider || 'Web';
        const label = s.title + ' (' + meta + ')';
        if (isSafeHttpUrl(s.url)) {
          const link = document.createElement('a');
          link.className = 'credit-link';
          link.href = s.url.trim();
          link.title = s.url.trim();
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = label;
          link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (api.openExternal) api.openExternal(link.href);
          });
          credit.appendChild(link);
        } else {
          const span = document.createElement('span');
          span.textContent = label;
          credit.appendChild(span);
        }
      });
      container.appendChild(credit);
    }

    function updateMessageContent(message, text, isMarkdown) {
      const body = message.querySelector('.msg-body');
      if (!body) return;
      if (isMarkdown && window.AemeathMarkdown) {
        body.innerHTML = window.AemeathMarkdown.renderMarkdown(text);
        body.querySelectorAll('.chat-code-copy').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const pre = btn.closest('.chat-code-wrap').querySelector('pre code');
            if (pre) {
              navigator.clipboard.writeText(pre.textContent).then(() => {
                const orig = btn.textContent;
                btn.textContent = 'Tersalin!';
                setTimeout(() => { btn.textContent = orig; }, 1800);
              });
            }
          });
        });
        body.querySelectorAll('.chat-link').forEach((link) => {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const href = link.getAttribute('href');
            if (isSafeHttpUrl(href) && api.openExternal) {
              api.openExternal(href.trim());
            }
          });
        });
      } else {
        body.textContent = text;
      }
      log.scrollTop = log.scrollHeight;
    }

    // Says out loud when a stored note rode along with the request, so Rover never
    // has to guess what part of his memory the provider saw.
    function appendNote(container, text) {
      if (!text) return;
      const hint = document.createElement('div');
      hint.className = 'credit';
      hint.textContent = text;
      container.appendChild(hint);
    }

    function memoryNote(result) {
      const count = result && result.memoryUsed;
      if (!count) return '';
      return count + ' catatan memori ikut kupakai untuk jawaban ini';
    }

    function add(kind, text, sources, note) {
      const message = document.createElement('div');
      message.className = 'msg ' + kind;
      const body = document.createElement('div');
      body.className = 'msg-body';
      message.appendChild(body);

      updateMessageContent(message, text, kind.startsWith('bot') && !kind.includes('pending'));
      appendSources(message, sources);
      appendNote(message, note);

      log.appendChild(message);
      while (log.children.length > MAX_MESSAGES) log.removeChild(log.firstChild);
      log.scrollTop = log.scrollHeight;
      return message;
    }

    // Slash commands work without the chatbot, so the box stays usable even when
    // there is no key and offline answers are switched off.
    function controls() {
      input.disabled = false;
      send.disabled = busy;
    }

    async function refreshCommands() {
      try {
        commands = await api.listCommands();
      } catch {
        commands = [];
      }
      showSuggestions();
    }

    function hideSuggestions() {
      suggest.classList.add('hidden');
      suggest.textContent = '';
    }

    // While Rover types "/...", offer the saved commands that match.
    function showSuggestions() {
      const text = input.value;
      if (!isOpen || mode === 'terminal' || !text.startsWith('/') || /\s/.test(text)) return hideSuggestions();
      const prefix = text.slice(1).toLowerCase();
      const matches = commands.filter((c) => c.name.startsWith(prefix)).slice(0, 8);
      suggest.textContent = '';
      if (matches.length === 0) return hideSuggestions();
      for (const command of matches) {
        const button = document.createElement('button');
        button.type = 'button';
        const name = document.createElement('span');
        name.textContent = '/' + command.name;
        const note = document.createElement('span');
        note.className = 'hint';
        note.textContent = command.description;
        button.append(name, note);
        button.addEventListener('click', () => {
          input.value = '/' + command.name + (command.name === 'search' ? ' ' : '');
          hideSuggestions();
          input.focus();
        });
        suggest.appendChild(button);
      }
      suggest.classList.remove('hidden');
      reposition();
    }

    // Tab completes to the first suggestion.
    function completeFirst() {
      const first = suggest.querySelector('button');
      if (first) first.click();
    }

    function touch() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (isOpen && !busy) close();
      }, mode === 'terminal' ? TERMINAL_IDLE_MS : IDLE_CLOSE_MS);
    }

    // Chat and terminal share the box; only the look and where lines go differ.
    function setMode(next, nextCwd) {
      mode = next === 'terminal' ? 'terminal' : 'chat';
      if (nextCwd) cwd = nextCwd;
      el.classList.toggle('terminal', mode === 'terminal');
      modeBadge.classList.toggle('hidden', mode !== 'terminal');
      input.placeholder =
        mode === 'terminal'
          ? 'Ketik perintah PowerShell... (exit untuk keluar)'
          : 'Tulis pesan, atau / untuk perintah...';
      notice.classList.toggle('hidden', mode === 'terminal' || !noticeNeeded);
      hideSuggestions();
      reposition();
    }

    async function refreshStatus() {
      const status = await api.chatStatus();
      const provider = status && status.providers.find((p) => p.id === status.provider);
      const hasKey = Boolean(provider && provider.hasKey);
      offlineMode = !hasKey && Boolean(status && status.offlineFallback);
      ready = hasKey || offlineMode;
      noticeNeeded = !hasKey;
      notice.classList.toggle('hidden', hasKey || mode === 'terminal');
      if (!hasKey) {
        noticeText.textContent = offlineMode
          ? 'Mode offline: aku hanya menjawab dari ingatanku (lorebook). Isi API key di Pengaturan untuk jawaban lengkap.'
          : 'Belum ada kunci API' + (provider ? ' ' + provider.name : '') + '. Atur dulu di Pengaturan.';
      }
      controls();
      reposition();
    }

    // The box sits above Aemeath, below her, or beside her, whichever leaves room for a
    // comfortable message list (see src/chat-layout.js). It only covers her on a screen
    // too small for any of that.
    function reposition() {
      if (!isOpen) return;
      const placed = window.AemeathChatLayout.placeBox({
        anchor: options.anchor(),
        bounds: options.bounds(),
        width: el.offsetWidth || (large ? WIDTH_LARGE : WIDTH),
        chrome: el.offsetHeight - log.offsetHeight,
        content: log.scrollHeight,
        logMax: large ? LOG_MAX_LARGE : LOG_MAX,
        logMin: LOG_MIN,
        gap: GAP,
        edge: EDGE,
      });
      log.style.maxHeight = placed.logMax + 'px';
      el.classList.toggle('below', placed.arrow === 'up');
      el.classList.toggle('side', placed.arrow === 'none');
      el.style.left = placed.left + 'px';
      el.style.top = placed.top + 'px';
      el.style.setProperty('--arrow-x', placed.arrowX + 'px');
    }

    function setLarge(next) {
      large = next;
      el.classList.toggle('large', large);
      sizeButton.title = large ? 'Perkecil kotak' : 'Perbesar kotak';
      try {
        localStorage.setItem(SIZE_KEY, large ? '1' : '0');
      } catch {
        // storage can be blocked; the choice then lasts for this run only
      }
      reposition();
    }

    async function open() {
      clearTimeout(forgetTimer);
      isOpen = true;
      el.classList.remove('hidden');
      if (log.children.length === 0) add('bot', GREETING);
      reposition();
      api.focusWindow();
      await Promise.all([refreshStatus(), refreshCommands()]);
      input.focus();
      touch();
    }

    function resetConversation() {
      api.chatReset();
      log.textContent = '';
      if (isOpen && mode === 'chat') add('bot', GREETING);
    }

    function close() {
      isOpen = false;
      confirming = false;
      // Closing the box ends a terminal session; nothing keeps running behind it.
      if (mode === 'terminal') {
        api.terminalStop();
        setMode('chat');
      }
      el.classList.add('hidden');
      clearTimeout(idleTimer);
      api.blurWindow();
      // A closed box keeps the conversation for a while, then forgets it.
      clearTimeout(forgetTimer);
      forgetTimer = setTimeout(resetConversation, FORGET_AFTER_MS);
    }

    // Slash commands are answered on this machine: no model, no search, no history.
    // Returns false when the text turned out not to be a command, so the caller can chat instead.
    async function runCommand(text, alreadyShown) {
      if (!alreadyShown) add('user', text);
      // /change-mode waits for the Windows consent prompt, which can take a while.
      // (Not /change-mode-search: that one answers right away.)
      const pending = /^\/change-mode(?:\s|$)/i.test(text)
        ? add('bot pending', 'Menunggu persetujuan Windows (izin admin)...')
        : null;
      busy = true;
      controls();
      try {
        const result = await api.runCommand(text);
        if (pending) pending.remove();
        confirming = Boolean(result.awaitConfirm);
        if (!result.isCommand) return false;
        add(result.ok ? 'bot' : 'err', result.text, result.sources);
        if (result.output) add('cmd-out', result.output);
        if (result.mode) setMode(result.mode, result.cwd);
        if (result.launched && options.onCommand) options.onCommand();
      } catch {
        confirming = false;
        add('err', 'Perintahnya gagal dijalankan.');
      } finally {
        busy = false;
        controls();
        reposition();
        if (isOpen) input.focus();
        touch();
      }
    }

    // Terminal mode: the line goes to the PowerShell session, never to the chatbot.
    async function runTerminal(text) {
      add('term-in', 'PS ' + (cwd || '') + '> ' + text);
      busy = true;
      controls();
      try {
        const result = await api.terminalRun(text);
        if (!result.ok) {
          add('err', result.error || 'Perintah tidak bisa dijalankan.');
        } else {
          if (result.output) add('term-out', result.output);
          if (result.timedOut) add('err', 'Perintah dihentikan karena terlalu lama (lebih dari 30 detik).');
          if (result.left) add('bot', result.text);
        }
        setMode(result.mode, result.cwd);
      } catch {
        add('err', 'Terminalnya tidak merespons.');
      } finally {
        busy = false;
        controls();
        reposition();
        if (isOpen) input.focus();
        touch();
      }
    }

    // An ordinary chat message. `shown` means Rover's line is already in the log.
    async function sendChat(text, shown) {
      if (!shown) add('user', text);
      if (!ready) {
        add('err', 'Belum ada kunci API. Atur dulu di Pengaturan, atau pakai perintah seperti /help.');
        return;
      }
      const isExplicitSearch = /^\/search(?:\s|$)/i.test(text);
      const pending = add(
        'bot pending',
        isExplicitSearch ? 'Aemeath sedang mencari di web...' : 'Aemeath sedang berpikir...',
      );
      const requestId = 'req-' + Date.now() + '-' + (++requestCounter);
      let streamedText = '';
      let isStreaming = false;

      const unbindChunk = api.onChatChunk ? api.onChatChunk((chunk) => {
        if (!chunk || chunk.requestId !== requestId || !chunk.delta) return;
        if (!isStreaming) {
          isStreaming = true;
          pending.className = 'msg bot';
        }
        streamedText += chunk.delta;
        updateMessageContent(pending, streamedText, true);
        reposition();
      }) : null;

      busy = true;
      controls();
      touch();
      try {
        const result = await api.chatSend(text, requestId);
        if (result.ok) {
          if (isStreaming) {
            // Finalize with full text and clickable sources
            updateMessageContent(pending, result.text, true);
            appendSources(pending, result.sources);
            appendNote(pending, memoryNote(result));
          } else {
            pending.remove();
            add('bot', result.text, result.sources, memoryNote(result));
          }
        } else {
          pending.remove();
          add('err', result.error || 'Terjadi kesalahan.');
          if (result.code === 'no-key' || result.code === 'auth') await refreshStatus();
        }
      } catch {
        pending.remove();
        add('err', 'Terjadi kesalahan saat mengirim pesan.');
      } finally {
        if (typeof unbindChunk === 'function') unbindChunk();
        busy = false;
        controls();
        reposition();
        if (isOpen) input.focus();
        touch();
      }
    }

    async function submit() {
      const text = input.value.trim();
      if (!text || busy) return;
      input.value = '';
      hideSuggestions();
      if (mode === 'terminal') {
        return /^\/change-mode(?:\s|$)/i.test(text) ? runCommand(text) : runTerminal(text);
      }
      // Explicit manual web search (/search <query>) streams through chat with forced web lookup.
      if (!confirming && /^\/search\s+\S/i.test(text)) {
        return sendChat(text, false);
      }
      // While a command waits for a yes, the next line goes to it first. If it turns out
      // not to be a command at all, it is an ordinary chat message after all.
      if (confirming || text.startsWith('/')) {
        if ((await runCommand(text)) !== false) return;
        return sendChat(text, true);
      }
      return sendChat(text, false);
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    });
    input.addEventListener('input', showSuggestions);
    el.addEventListener('keydown', (event) => {
      touch();
      if (event.key === 'Escape') close();
      if (event.key === 'Tab' && !suggest.classList.contains('hidden')) {
        event.preventDefault();
        completeFirst();
      }
    });
    sizeButton.addEventListener('click', () => setLarge(!large));
    resetButton.addEventListener('click', resetConversation);
    closeButton.addEventListener('click', close);
    settingsButton.addEventListener('click', () => api.openSettings());
    // Coming back from Settings: pick up a newly saved or removed key.
    window.addEventListener('focus', () => {
      if (isOpen) {
        refreshStatus();
        refreshCommands();
      }
    });

    try {
      if (localStorage.getItem(SIZE_KEY) === '1') setLarge(true);
    } catch {
      // no stored choice
    }

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
