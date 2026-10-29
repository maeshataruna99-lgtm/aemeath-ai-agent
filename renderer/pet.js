'use strict';

(function () {
  const { AemeathAtlas, AemeathWalker, AemeathDialogue, AemeathLorebook, AemeathChatPanel, AemeathBehavior } =
    window;
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
  // Every line for the bubble passes through this one controller: it knows the
  // priority order, the frequency limits and when to stay quiet.
  let director = null;

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
    if (typeof dialogue.setLocale === 'function' && settings.locale) {
      dialogue.setLocale(settings.locale);
    }
    director = createDirector();
    applyDirectorSettings();
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
      locale: settings.locale || 'id-ID',
      catalogs: typeof window.aemeath?.getCatalogs === 'function' ? window.aemeath.getCatalogs() : null,
      anchor: () => ({
        left: walker.x,
        right: walker.x + petWidth(),
        top: walker.y,
        bottom: walker.y + petHeight(),
      }),
      bounds: () => workArea,
      onCommand: () => setTransient('jumping', 1200),
      onReply: (result) => {
        if (result && result.anim) {
          setTransient(result.anim, result.animMs || 2500);
        }
      },
    });

    sprite = new Image();
    sprite.onload = () => requestAnimationFrame(tick);
    sprite.onerror = () => {
      showBubble('Sprite gagal dimuat: ' + init.spriteUrl);
      requestAnimationFrame(tick);
    };
    sprite.src = init.spriteUrl;

    setTransient('waving', 2200);
    say({ kind: 'greeting', text: 'Aemeath hadir! Aku akan berjalan-jalan sambil menunggui sesi AI-mu.' });

    nextChatAt = performance.now() + CHAT_FIRST_MS;
    wireEvents();
  }

  function createDirector() {
    return AemeathBehavior.createBehaviorDirector({
      mode: settings.interactiveMode,
      chatterEnabled: settings.chatterEnabled !== false,
      priorities: settings.notificationPriorities,
      quietHours: {
        enabled: settings.quietHoursEnabled === true,
        start: settings.quietHoursStart,
        end: settings.quietHoursEnd,
      },
    });
  }

  // Keeps the controller in step with the settings window and the tray menu.
  function applyDirectorSettings() {
    if (!director) return;
    director.setMode(settings.interactiveMode);
    director.setChatterEnabled(settings.chatterEnabled !== false);
    director.setPaused(settings.proactivePaused === true);
    if (settings.notificationPriorities) director.setPriorities(settings.notificationPriorities);
    director.setQuietHours({
      enabled: settings.quietHoursEnabled === true,
      start: settings.quietHoursStart,
      end: settings.quietHoursEnd,
    });
    const cooldownMin = typeof settings.proactiveCooldownMin === 'number' ? settings.proactiveCooldownMin : 10;
    const maxPerHour = typeof settings.proactiveMaxPerHour === 'number' ? settings.proactiveMaxPerHour : 6;
    director.setLimits({ maxPerHour: maxPerHour, cooldownMs: Math.max(0, cooldownMin) * 60000 });
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

  function scheduleChat(from) {
    const range = AemeathDialogue.chatIntervalRange(settings.chatterIntervalMin || 3.5);
    nextChatAt = from + range.minMs + Math.random() * (range.maxMs - range.minMs);
  }

  // Aemeath occasionally says something to Rover when nothing else is on screen.
  // The director decides whether this attempt is allowed to be said at all.
  function maybeChat(now) {
    if (now < nextChatAt || settings.chatterEnabled === false) return;
    if (demoState || dragState || chatOpen() || now < transientUntil) return;
    // A line already waiting gets said first; she does not talk over herself.
    if (director.busy) return;
    const context = chatContext();
    const trivia = !context.decisionPending && Math.random() < TRIVIA_CHANCE ? lorebook.next() : null;
    if (trivia) say({ kind: 'trivia', text: trivia.text, credit: trivia.credit }, now);
    else say({ kind: 'chatter', text: dialogue.next(context) }, now);
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

  // Queues one line and shows it right away if it is the most important thing to
  // say. `event` uses the behavior director's shape: kind, text, category, anim.
  function say(event, nowArg) {
    if (!director) return null;
    const now = typeof nowArg === 'number' ? nowArg : performance.now();
    const decision = director.submit(event, now);
    if (decision.action === 'show' || decision.action === 'preempt') {
      if (bubbleUntil) hideBubble();
      present(decision.item, now);
    }
    return decision;
  }

  // Renders one director item into the bubble.
  function present(item, now) {
    renderBubble(item);
    bubble.classList.remove('hidden');
    positionBubble();
    // An offer with buttons needs time to be read and answered.
    bubbleUntil = now + bubbleDuration(item.text) + (item.action ? 6000 : 0);
    if (item.anim) setTransient(item.anim, item.animMs || TRANSIENT_MS);
  }

  // Used by the sprite error and the visual verification poses, which must be
  // seen even when the director is quiet.
  function showBubble(text, credit, sessionId, nowArg) {
    const now = typeof nowArg === 'number' ? nowArg : performance.now();
    if (bubbleUntil) hideBubble();
    present({ text: text, credit: credit || null, sessionId: sessionId || null }, now);
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
    if (item.action) bubble.appendChild(bubbleActions(item.action));
  }

  // Only memory offers get buttons so far: nothing is ever stored without this
  // explicit yes, and "Nanti" throws the offer away instead of saving it later.
  function bubbleActions(action) {
    const actions = document.createElement('div');
    actions.className = 'bubble-actions';

    if (Array.isArray(action.actions) && action.actions.length > 0) {
      for (const act of action.actions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        if (act.id === 'dismiss' || act.id === 'later') btn.className = 'ghost';
        btn.textContent = act.label;
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          answerContinuationChoice(action.id, act.id);
        });
        actions.appendChild(btn);
      }
      return actions;
    }

    const accept = document.createElement('button');
    accept.type = 'button';
    accept.textContent = action.label || 'Simpan';
    accept.addEventListener('click', (event) => {
      event.stopPropagation();
      answerMemoryOffer(action, true);
    });
    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'ghost';
    later.textContent = 'Nanti';
    later.addEventListener('click', (event) => {
      event.stopPropagation();
      answerMemoryOffer(action, false);
    });
    actions.append(accept, later);
    return actions;
  }

  function answerContinuationChoice(offerId, choice) {
    for (const button of bubble.querySelectorAll('.bubble-actions button')) button.disabled = true;
    const clear = () => {
      hideBubble();
      if (director) director.clearActive();
    };
    if (typeof window.aemeath.answerContinuation === 'function') {
      window.aemeath
        .answerContinuation(offerId, choice)
        .then((result) => {
          clear();
          if (result && result.text) {
            say({
              kind: 'continuation-reply',
              text: result.text,
              anim: choice === 'resume' ? 'jumping' : 'waving',
              animMs: 1800,
            });
          }
        })
        .catch(() => {
          clear();
        });
    } else {
      clear();
    }
  }

  function answerMemoryOffer(action, accepted) {
    for (const button of bubble.querySelectorAll('.bubble-actions button')) button.disabled = true;
    const clear = () => {
      hideBubble();
      if (director) director.clearActive();
    };
    if (!accepted) {
      if (typeof window.aemeath.dismissMemory === 'function') window.aemeath.dismissMemory(action.id);
      clear();
      return;
    }
    window.aemeath
      .acceptMemory(action.id)
      .then((result) => {
        clear();
        if (result && result.ok) {
          say({ kind: 'memory-saved', text: result.text, anim: 'waving', animMs: 1800 });
        } else {
          say({
            kind: 'memory-refused',
            text: (result && result.error) || 'Memori itu tidak bisa Kusimpan, Rover.',
          });
        }
      })
      .catch(() => {
        clear();
        say({ kind: 'memory-refused', text: 'Memori itu tidak bisa Kusimpan, Rover.' });
      });
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
    // The chat box takes the bubble's place; a waiting line keeps its place until
    // the box closes, or until it is too old to be worth saying.
    if (chatOpen()) {
      if (bubbleUntil) {
        hideBubble();
        director.clearActive();
      }
      return;
    }
    if (bubbleUntil && now > bubbleUntil) {
      hideBubble();
      const next = director.finish(now);
      if (next && next.item) present(next.item, now);
      return;
    }
    if (bubbleUntil === 0) {
      const next = director.tick(now);
      if (next && next.item) present(next.item, now);
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
    // The director puts a pending decision ahead of everything else.
    if (event.type === 'decision-requested') {
      say({
        kind: 'decision-request',
        text:
          '[' + event.projectName + ']\nSesi AI butuh keputusanmu:\n' + (event.summary || '(tanpa detail)'),
        sessionId: event.sessionId,
        anim: 'waiting',
        animMs: 3000,
      });
      return;
    }
    if (event.type === 'turn-finished') {
      say({
        kind: 'session-finished',
        text:
          '[' + event.projectName + ']\nSesi AI selesai.\n' + (event.summary || '(tanpa ringkasan teks)'),
        sessionId: event.sessionId,
        anim: 'review',
        animMs: TRANSIENT_MS,
      });
    } else if (event.type === 'turn-failed') {
      say({
        kind: 'session-failed',
        text: '[' + event.projectName + ']\nSesi AI gagal: ' + (event.summary || 'error tidak diketahui'),
        sessionId: event.sessionId,
        anim: 'failed',
        animMs: TRANSIENT_MS,
      });
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
        say({ kind: 'timer-done', text: payload.text, anim: 'jumping', animMs: 2400 });
      });
    }
    if (typeof window.aemeath.onQuestDone === 'function') {
      window.aemeath.onQuestDone((quest) => {
        if (!quest) return;
        say({
          kind: 'quest-done',
          text: 'Hore! Daily quest "' + quest.text + '" selesai! Fokusmu mantap, Rover~',
          anim: 'jumping',
          animMs: 2200,
        });
      });
    }
    if (typeof window.aemeath.onWorkSessionFinished === 'function') {
      window.aemeath.onWorkSessionFinished((finished) => {
        if (!finished || !finished.summaryText) return;
        say({ kind: 'session-finished', text: finished.summaryText, anim: 'review', animMs: 3200 });
      });
    }
    if (typeof window.aemeath.onPresence === 'function') {
      window.aemeath.onPresence((state) => {
        if (!state || !director) return;
        director.setIdle(state.idle === true);
        director.setFocus(state.focus === true);
      });
    }
    // Memory offers: she asks first, and the bubble carries the two answers.
    if (typeof window.aemeath.onMemoryOffer === 'function') {
      window.aemeath.onMemoryOffer((offer) => {
        if (!offer || !offer.text) return;
        const isResume = offer.offerType === 'continuation';
        say({
          kind: 'memory-offer',
          category: offer.actionable ? 'memory:offer' : 'memory:continuation',
          text: offer.text,
          anim: isResume ? 'waving' : 'waiting',
          animMs: 2500,
          action: offer.actionable && offer.id ? {
            id: offer.id,
            label: offer.actionLabel || 'Simpan',
            actions: offer.actions || null,
            offerType: offer.offerType || null,
          } : null,
        });
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
      const localeChanged = next.locale && next.locale !== settings.locale;
      settings = Object.assign({}, settings, next);
      if (walker) walker.speed = settings.speed;
      if (scaleChanged) applyScale();
      applyTransparency();
      applyDirectorSettings();
      if (intervalChanged) scheduleChat(performance.now());
      if (localeChanged) {
        if (typeof dialogue.setLocale === 'function') dialogue.setLocale(settings.locale);
        if (chatPanel && typeof chatPanel.setLocale === 'function') chatPanel.setLocale(settings.locale);
      }
    });
    window.aemeath.onChatState((state) => {
      chatThinking = Boolean(state && state.thinking);
      if (state && state.replied) setTransient('waving', 1800);
    });
    window.aemeath.onChatToggle(toggleChat);
    // Medium and Full modes: a remark about what Rover is doing. The director
    // already knows the mode, the cooldown and the hourly cap.
    window.aemeath.onActivityRemark((remark) => {
      if (!remark || !remark.text) return;
      say({
        kind: 'activity-remark',
        category: remark.kind,
        text: remark.text,
        anim: 'waving',
        animMs: 1800,
      });
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
