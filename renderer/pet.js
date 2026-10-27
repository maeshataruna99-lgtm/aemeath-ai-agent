'use strict';

(function () {
  const { AemeathAtlas, AemeathWalker, AemeathDialogue, AemeathLorebook, AemeathChatPanel } = window;
  const canvas = document.getElementById('pet');
  const bubble = document.getElementById('bubble');
  const musicBadge = document.getElementById('music');
  const ctx = canvas.getContext('2d');

  const MUSIC_ANIM = 'waving';
  // The sheet has one '?' row; it is published as `failed` and reused for a pending decision.
  const ANIM_ALIASES = { confused: 'failed' };
  const TRANSIENT_MS = 4000;
  const BUBBLE_MS = 7000;
  const FLOOR_GAP = 8;
  const BOB_PX = 4;
  const BOB_PERIOD_MS = 2400;
  const CHAT_FIRST_MS = 40000;
  // Aemeath always speaks random Wuthering Waves trivia from the available lorebook
  // during her spontaneous chatter (unless a pending decision needs Rover's attention).
  const TRIVIA_CHANCE = 1;
  const BUBBLE_MAX_MS = 16000;

  let atlas = null;
  let sprite = null;
  let settings = {
    scale: 1,
    speed: 120,
    musicEnabled: true,
    watcherEnabled: true,
    chatterEnabled: true,
    chatterIntervalMin: 3.5,
    interactiveMode: 'low',
    stayStill: false,
    transparentMode: false,
    opacity: 0.6,
    x: null,
    y: null,
  };
  let workArea = { width: 1920, height: 1080 };

  let walker = null;
  let animName = 'idle';
  let animStart = 0;
  let transientUntil = 0;
  let musicStatus = { playing: false, title: '', artist: '', app: '' };
  let aggregate = { running: 0, awaitingDecision: 0 };
  let demoState = null;
  let lastTick = 0;
  let hoverState = false;
  let dragState = null;
  const dialogue = AemeathDialogue.createDialogue();
  let lorebook = null;
  let chatThinking = false;
  let chatPanel = null;
  let nextChatAt = 0;

  const bubbleQueue = [];
  let bubbleUntil = 0;
  let currentBubbleSessionId = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function petWidth() {
    return (atlas ? atlas.cellWidth : 192) * settings.scale;
  }

  function petHeight() {
    return (atlas ? atlas.cellHeight : 208) * settings.scale;
  }

  function flightBounds() {
    return {
      minX: 0,
      maxX: Math.max(0, workArea.width - petWidth()),
      minY: 0,
      maxY: Math.max(0, workArea.height - petHeight() - FLOOR_GAP),
    };
  }

  function homeY() {
    return flightBounds().maxY;
  }

  async function boot() {
    const init = await window.aemeath.init();
    atlas = init.atlas;
    settings = Object.assign({}, settings, init.settings);
    workArea = init.workArea;
    AemeathAtlas.validateAtlas(atlas);
    lorebook = AemeathLorebook.createLorebook(init.lorebook);
    applyScale();
    applyTransparency();

    const bounds = flightBounds();
    const savedX = typeof settings.x === 'number' ? settings.x : workArea.width / 2;
    const savedY = typeof settings.y === 'number' ? settings.y : bounds.maxY;
    walker = AemeathWalker.createWalker({
      x: clamp(savedX, bounds.minX, bounds.maxX),
      y: clamp(savedY, bounds.minY, bounds.maxY),
      speed: typeof settings.speed === 'number' ? settings.speed : 120,
    });

    chatPanel = AemeathChatPanel.create({
      api: window.aemeath,
      anchor: () => ({
        left: walker.x,
        right: walker.x + petWidth(),
        top: walker.y,
        bottom: walker.y + petHeight(),
      }),
      bounds: () => workArea,
      onCommand: () => setTransient('jumping', 1200),
    });

    sprite = new Image();
    sprite.onload = () => requestAnimationFrame(tick);
    sprite.onerror = () => {
      showBubble('Sprite gagal dimuat: ' + init.spriteUrl);
      requestAnimationFrame(tick);
    };
    sprite.src = init.spriteUrl;

    setTransient('waving', 2200);
    showBubble('Aemeath hadir! Aku akan berjalan-jalan sambil menunggui sesi AI-mu.');

    nextChatAt = performance.now() + CHAT_FIRST_MS;
    wireEvents();
  }

  function musicEnabled() {
    return settings.musicEnabled !== false;
  }

  function currentBaseAnim() {
    if (walker.mode === 'fly') return walker.facing >= 0 ? 'running-right' : 'running-left';
    if (chatThinking) return 'waiting';
    if (decisionPending()) return 'confused';
    if (sessionRunning()) return 'running';
    if (musicEnabled() && musicStatus.playing) return MUSIC_ANIM;
    return 'idle';
  }

  function chatOpen() {
    return Boolean(chatPanel && chatPanel.isOpen());
  }

  function decisionPending() {
    return settings.watcherEnabled !== false && aggregate.awaitingDecision > 0;
  }

  function sessionRunning() {
    return settings.watcherEnabled !== false && aggregate.running > 0;
  }

  // Stop wandering so the sprite never slides while a non-walking animation plays.
  function haltWalker() {
    if (walker.mode === 'fly') {
      walker.mode = 'rest';
      walker.dirX = 0;
      walker.dirY = 0;
      walker.modeUntil = 0;
    }
  }

  function setTransient(name, ms) {
    animName = name;
    animStart = performance.now();
    transientUntil = performance.now() + ms;
  }

  function setAnim(name, now) {
    if (animName !== name) {
      animName = name;
      animStart = now;
    }
  }

  function chatContext() {
    return {
      hour: new Date().getHours(),
      decisionPending: decisionPending(),
      sessionRunning: sessionRunning(),
      musicPlaying: musicEnabled() && musicStatus.playing,
      flying: walker.mode === 'fly',
    };
  }

  function bubbleIdle() {
    return bubbleUntil === 0 && bubbleQueue.length === 0;
  }

  function scheduleChat(from) {
    const range = AemeathDialogue.chatIntervalRange(settings.chatterIntervalMin || 3.5);
    nextChatAt = from + range.minMs + Math.random() * (range.maxMs - range.minMs);
  }

  // Aemeath occasionally says something to Rover when nothing else is on screen.
  function maybeChat(now) {
    if (now < nextChatAt || settings.chatterEnabled === false) return;
    if (demoState || dragState || chatOpen() || now < transientUntil || !bubbleIdle()) return;
    const context = chatContext();
    const trivia = !context.decisionPending && Math.random() < TRIVIA_CHANCE ? lorebook.next() : null;
    if (trivia) showBubble(trivia.text, trivia.credit);
    else showBubble(dialogue.next(context));
    scheduleChat(now);
  }

  function tick(now) {
    const dt = lastTick ? Math.min(now - lastTick, 100) : 16;
    lastTick = now;

    if (!demoState && !dragState) {
      // She stays put while something else is going on, or when Rover asked her to stay still.
      if (
        settings.stayStill === true ||
        now < transientUntil ||
        sessionRunning() ||
        decisionPending() ||
        chatThinking ||
        chatOpen()
      ) {
        haltWalker();
      } else {
        AemeathWalker.stepWalker(walker, now, dt, flightBounds());
      }
    } else {
      haltWalker();
    }

    if (!demoState) {
      if (now < transientUntil) {
        // keep the transient animation (greeting, jump, review, failed)
      } else {
        transientUntil = 0;
        setAnim(currentBaseAnim(), now);
      }
    }

    maybeChat(now);
    positionPet(now);
    draw(now);
    updateBubble(now);
    if (!bubble.classList.contains('hidden')) positionBubble();
    if (chatOpen()) chatPanel.reposition();
    requestAnimationFrame(tick);
  }

  function draw(now) {
    if (!atlas) return;
    const wanted = ANIM_ALIASES[animName] || animName;
    const sheetAnim = atlas.animations[wanted] ? wanted : 'idle';
    const anim = atlas.animations[sheetAnim];
    const elapsed = now - animStart;
    const frame = Math.floor((elapsed / 1000) * anim.fps);
    const rect = AemeathAtlas.frameRect(atlas, sheetAnim, frame);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
      ctx.drawImage(
        sprite,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    }
  }

  function applyScale() {
    canvas.style.width = petWidth() + 'px';
    canvas.style.height = petHeight() + 'px';
  }

  function applyTransparency() {
    const isTransparent = settings.transparentMode === true;
    const alpha = isTransparent
      ? clamp(typeof settings.opacity === 'number' ? settings.opacity : 0.6, 0.15, 1)
      : 1;
    canvas.style.opacity = String(alpha);
    canvas.classList.toggle('click-through', isTransparent);
    bubble.classList.toggle('click-through', isTransparent);
    musicBadge.classList.toggle('click-through', isTransparent);
    if (isTransparent) {
      if (dragState) {
        canvas.classList.remove('dragging');
        dragState = null;
      }
      if (!chatOpen()) setHover(false);
    }
  }

  // Ghost hover: a slow vertical sway so a resting pet still floats.
  function bobOffset(now) {
    if (dragState) return 0;
    return Math.sin((now / BOB_PERIOD_MS) * Math.PI * 2) * BOB_PX;
  }

  function positionPet(now) {
    const bounds = flightBounds();
    walker.x = clamp(walker.x, bounds.minX, bounds.maxX);
    walker.y = clamp(walker.y, bounds.minY, bounds.maxY);
    canvas.style.left = Math.round(walker.x) + 'px';
    canvas.style.top = Math.round(walker.y + bobOffset(now || 0)) + 'px';
    positionMusicBadge();
  }

  // The bubble sits above the pet, or below it when there is no room above.
  function positionBubble() {
    const width = bubble.offsetWidth || 200;
    const height = bubble.offsetHeight || 60;
    const centerX = walker.x + petWidth() / 2;
    const left = clamp(centerX - width / 2, 8, Math.max(8, workArea.width - width - 8));
    const above = walker.y - height - 16;
    const below = bubble.classList.contains('below');
    const placeBelow = above < 8;
    if (placeBelow !== below) bubble.classList.toggle('below', placeBelow);
    bubble.style.left = left + 'px';
    bubble.style.top = (placeBelow ? walker.y + petHeight() + 16 : above) + 'px';
    bubble.style.setProperty('--arrow-x', clamp(centerX - left, 16, Math.max(16, width - 16)) + 'px');
  }

  function positionMusicBadge() {
    if (musicBadge.classList.contains('hidden')) return;
    musicBadge.style.left =
      clamp(walker.x + petWidth() + 10, 8, Math.max(8, workArea.width - 310)) + 'px';
    musicBadge.style.top = Math.max(8, walker.y + petHeight() - 40) + 'px';
  }

  function showBubble(text, credit, sessionId) {
    bubbleQueue.push({ text: text, credit: credit || null, sessionId: sessionId || null });
  }

  function renderBubble(item) {
    bubble.textContent = '';
    currentBubbleSessionId = item.sessionId || null;
    const body = document.createElement('div');
    body.textContent = item.text;
    bubble.appendChild(body);
    if (item.credit) {
      const credit = document.createElement('div');
      credit.className = 'credit';
      credit.textContent = 'Sumber: ' + item.credit.title + ' (' + item.credit.license + ')';
      bubble.appendChild(credit);
    }
  }

  // Longer remarks stay up longer so they can be read.
  function bubbleDuration(text) {
    return clamp(4000 + text.length * 55, BUBBLE_MS, BUBBLE_MAX_MS);
  }

  function hideBubble() {
    bubble.classList.add('hidden');
    bubbleUntil = 0;
    currentBubbleSessionId = null;
  }

  function updateBubble(now) {
    // The chat box takes the bubble's place; queued remarks wait until it closes.
    if (chatOpen()) {
      if (bubbleUntil) hideBubble();
      return;
    }
    if (bubbleUntil && now > bubbleUntil) hideBubble();
    if (bubbleUntil === 0 && bubbleQueue.length > 0) {
      const item = bubbleQueue.shift();
      renderBubble(item);
      bubble.classList.remove('hidden');
      positionBubble();
      bubbleUntil = now + bubbleDuration(item.text);
    }
  }

  function updateMusicBadge() {
    if (musicEnabled() && musicStatus.playing) {
      const track = musicStatus.title || musicStatus.app || 'media';
      const artist = musicStatus.artist ? ' — ' + musicStatus.artist : '';
      musicBadge.textContent = '\u266A ' + track + artist;
      musicBadge.classList.remove('hidden');
      positionMusicBadge();
    } else {
      musicBadge.classList.add('hidden');
    }
  }

  function persistPosition() {
    window.aemeath.saveSettings({
      x: walker.x,
      y: walker.y,
      scale: settings.scale,
      speed: walker.speed,
    });
  }

  function adjustScale(delta) {
    settings.scale = clamp(settings.scale + delta, 0.5, 3);
    applyScale();
    positionPet();
    window.aemeath.saveSettings({ scale: settings.scale });
  }

  function handleSessionEvent(event) {
    if (settings.watcherEnabled === false) return;
    if (event.type === 'turn-started') return; // the aggregate drives the animation
    if (event.type === 'decision-resolved') return;
    if (event.type === 'decision-requested') {
      showBubble(
        '[' + event.projectName + ']\nSesi AI butuh keputusanmu:\n' + (event.summary || '(tanpa detail)'),
        null,
        event.sessionId,
      );
      return;
    }
    if (event.type === 'turn-finished') {
      setTransient('review', TRANSIENT_MS);
      showBubble(
        '[' + event.projectName + ']\nSesi AI selesai.\n' + (event.summary || '(tanpa ringkasan teks)'),
        null,
        event.sessionId,
      );
    } else if (event.type === 'turn-failed') {
      setTransient('failed', TRANSIENT_MS);
      showBubble(
        '[' + event.projectName + ']\nSesi AI gagal: ' + (event.summary || 'error tidak diketahui'),
        null,
        event.sessionId,
      );
    }
  }

  function setDemoState(state) {
    // the verification run uses this to let her move again after the demo poses
    if (state === 'free') {
      demoState = null;
      return;
    }
    demoState = state;
    const now = performance.now();
    if (state === 'music') {
      musicStatus = { playing: true, title: 'Demo Song', artist: 'Demo Artist', app: 'demo.exe' };
      updateMusicBadge();
      setAnim(MUSIC_ANIM, now);
    } else if (state === 'trivia') {
      setAnim('idle', now);
      const trivia = lorebook.next();
      if (trivia) showBubble(trivia.text, trivia.credit);
      updateBubble(now);
    } else if (state === 'session-finished') {
      setAnim('review', now);
      showBubble('[aemeath-ai-agent]\nSesi AI selesai.\nContoh ringkasan: semua tes lulus.');
      updateBubble(now);
    } else if (state === 'session-failed') {
      setAnim('failed', now);
      showBubble('[aemeath-ai-agent]\nSesi AI gagal: contoh pesan error.');
      updateBubble(now);
    } else {
      musicStatus = { playing: false, title: '', artist: '', app: '' };
      updateMusicBadge();
      setAnim(state, now);
    }
  }

  // Clicking the pet (or the tray item) opens or closes the chat box beside her.
  function toggleChat() {
    chatPanel.toggle();
    if (chatPanel.isOpen()) setTransient('waving', 1200);
  }

  function setHover(next) {
    if (hoverState === next) return;
    hoverState = next;
    window.aemeath.setHover(next);
  }

  function wireEvents() {
    // The window is click-through except over the pet and its bubbles.
    // In transparent mode, the mouse passes right through the sprite and bubbles.
    document.addEventListener('mousemove', (e) => {
      if (dragState) return;
      const target = e.target;
      const petInteractive =
        settings.transparentMode !== true &&
        (target === canvas || bubble.contains(target) || musicBadge.contains(target));
      const hovering = petInteractive || chatPanel.contains(target);
      setHover(hovering);
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || settings.transparentMode === true) return;
      dragState = {
        startX: e.screenX,
        startY: e.screenY,
        walkerX: walker.x,
        walkerY: walker.y,
        moved: false,
      };
      canvas.classList.add('dragging');
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragState) return;
      const dx = e.screenX - dragState.startX;
      const dy = e.screenY - dragState.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragState.moved = true;
      const bounds = flightBounds();
      walker.x = clamp(dragState.walkerX + dx, bounds.minX, bounds.maxX);
      walker.y = clamp(dragState.walkerY + dy, bounds.minY, bounds.maxY);
    });

    window.addEventListener('mouseup', () => {
      if (!dragState) return;
      canvas.classList.remove('dragging');
      if (!dragState.moved) {
        toggleChat();
      } else {
        persistPosition();
      }
      dragState = null;
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey || settings.transparentMode === true) return;
        e.preventDefault();
        adjustScale(e.deltaY < 0 ? 0.1 : -0.1);
      },
      { passive: false },
    );

    canvas.addEventListener('contextmenu', (e) => {
      if (settings.transparentMode === true) return;
      e.preventDefault();
      window.aemeath.openContextMenu();
    });

    bubble.addEventListener('click', () => {
      const sid = currentBubbleSessionId;
      hideBubble();
      if (sid && typeof window.aemeath.openSession === 'function') {
        window.aemeath.openSession(sid);
      }
    });

    window.aemeath.onSessionEvent(handleSessionEvent);
    if (typeof window.aemeath.onTimerDone === 'function') {
      window.aemeath.onTimerDone((payload) => {
        if (!payload || !payload.text) return;
        setTransient('jumping', 2400);
        showBubble(payload.text);
      });
    }
    if (typeof window.aemeath.onLorebookUpdated === 'function') {
      window.aemeath.onLorebookUpdated((nextData) => {
        if (!nextData) return;
        lorebook = AemeathLorebook.createLorebook(nextData);
      });
    }
    window.aemeath.onMediaStatus((status) => {
      musicStatus = status;
      updateMusicBadge();
    });
    window.aemeath.onAggregate((agg) => {
      aggregate = agg;
    });
    window.aemeath.onSettingsUpdated((next) => {
      const scaleChanged = next.scale !== settings.scale;
      const intervalChanged = next.chatterIntervalMin !== settings.chatterIntervalMin;
      settings = Object.assign({}, settings, next);
      if (walker) walker.speed = settings.speed;
      if (scaleChanged) applyScale();
      applyTransparency();
      if (intervalChanged) scheduleChat(performance.now());
    });
    window.aemeath.onChatState((state) => {
      chatThinking = Boolean(state && state.thinking);
      if (state && state.replied) setTransient('waving', 1800);
    });
    window.aemeath.onChatToggle(toggleChat);
    // Medium and Full modes: a remark about what Rover is doing, only while the mode is on.
    window.aemeath.onActivityRemark((remark) => {
      if (
        (settings.interactiveMode !== 'medium' && settings.interactiveMode !== 'full') ||
        !remark ||
        !remark.text
      ) {
        return;
      }
      showBubble(remark.text);
      setTransient('waving', 1800);
    });
    window.aemeath.onDemo(setDemoState);
    window.aemeath.onReset(() => {
      walker.x = clamp(workArea.width / 2, 0, flightBounds().maxX);
      walker.y = homeY();
      haltWalker();
      persistPosition();
    });
  }

  boot();
})();
