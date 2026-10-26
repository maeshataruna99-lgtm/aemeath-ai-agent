'use strict';

(function () {
  const { AemethAtlas, AemethWalker } = window;
  const canvas = document.getElementById('pet');
  const bubble = document.getElementById('bubble');
  const musicBadge = document.getElementById('music');
  const ctx = canvas.getContext('2d');

  const MUSIC_ANIM = 'waving';
  const TRANSIENT_MS = 4000;
  const BUBBLE_MS = 7000;
  const FLOOR_GAP = 8;
  const BOB_PX = 4;
  const BOB_PERIOD_MS = 2400;

  let atlas = null;
  let sprite = null;
  let settings = { scale: 1, speed: 120, musicEnabled: true, watcherEnabled: true, x: null, y: null };
  let workArea = { width: 1920, height: 1080 };

  let walker = null;
  let animName = 'idle';
  let animStart = 0;
  let transientUntil = 0;
  let musicStatus = { playing: false, title: '', artist: '', app: '' };
  let aggregate = { running: 0 };
  let demoState = null;
  let lastTick = 0;
  let hoverState = false;
  let dragState = null;

  const bubbleQueue = [];
  let bubbleUntil = 0;

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
    const init = await window.aemeth.init();
    atlas = init.atlas;
    settings = Object.assign({}, settings, init.settings);
    workArea = init.workArea;
    AemethAtlas.validateAtlas(atlas);
    applyScale();

    const bounds = flightBounds();
    const savedX = typeof settings.x === 'number' ? settings.x : workArea.width / 2;
    const savedY = typeof settings.y === 'number' ? settings.y : bounds.maxY;
    walker = AemethWalker.createWalker({
      x: clamp(savedX, bounds.minX, bounds.maxX),
      y: clamp(savedY, bounds.minY, bounds.maxY),
      speed: typeof settings.speed === 'number' ? settings.speed : 120,
    });

    sprite = new Image();
    sprite.onload = () => requestAnimationFrame(tick);
    sprite.onerror = () => {
      showBubble('Sprite gagal dimuat: ' + init.spriteUrl);
      requestAnimationFrame(tick);
    };
    sprite.src = init.spriteUrl;

    setTransient('waving', 2200);
    showBubble('Aemeth hadir! Aku akan berjalan-jalan sambil menunggui sesi AI-mu.');

    wireEvents();
  }

  function musicEnabled() {
    return settings.musicEnabled !== false;
  }

  function currentBaseAnim() {
    if (walker.mode === 'fly') return walker.facing >= 0 ? 'running-right' : 'running-left';
    if (sessionRunning()) return 'running';
    if (musicEnabled() && musicStatus.playing) return MUSIC_ANIM;
    return 'idle';
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

  function tick(now) {
    const dt = lastTick ? Math.min(now - lastTick, 100) : 16;
    lastTick = now;

    if (!demoState && !dragState) {
      if (now < transientUntil || sessionRunning()) {
        haltWalker();
      } else {
        AemethWalker.stepWalker(walker, now, dt, flightBounds());
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

    positionPet(now);
    draw(now);
    updateBubble(now);
    if (!bubble.classList.contains('hidden')) positionBubble();
    requestAnimationFrame(tick);
  }

  function draw(now) {
    if (!atlas) return;
    const anim = atlas.animations[animName] || atlas.animations.idle;
    const elapsed = now - animStart;
    const frame = Math.floor((elapsed / 1000) * anim.fps);
    const rect = AemethAtlas.frameRect(atlas, animName, frame);
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

  function showBubble(text) {
    bubbleQueue.push(text);
  }

  function hideBubble() {
    bubble.classList.add('hidden');
    bubbleUntil = 0;
  }

  function updateBubble(now) {
    if (bubbleUntil && now > bubbleUntil) hideBubble();
    if (bubbleUntil === 0 && bubbleQueue.length > 0) {
      bubble.textContent = bubbleQueue.shift();
      bubble.classList.remove('hidden');
      positionBubble();
      bubbleUntil = now + BUBBLE_MS;
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
    window.aemeth.saveSettings({
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
    window.aemeth.saveSettings({ scale: settings.scale });
  }

  function handleSessionEvent(event) {
    if (settings.watcherEnabled === false) return;
    if (event.type === 'turn-started') return; // the aggregate drives the animation
    if (event.type === 'turn-finished') {
      setTransient('review', TRANSIENT_MS);
      showBubble(
        '[' + event.projectName + ']\nSesi AI selesai.\n' + (event.summary || '(tanpa ringkasan teks)'),
      );
    } else if (event.type === 'turn-failed') {
      setTransient('failed', TRANSIENT_MS);
      showBubble(
        '[' + event.projectName + ']\nSesi AI gagal: ' + (event.summary || 'error tidak diketahui'),
      );
    }
  }

  function setDemoState(state) {
    demoState = state;
    const now = performance.now();
    if (state === 'music') {
      musicStatus = { playing: true, title: 'Demo Song', artist: 'Demo Artist', app: 'demo.exe' };
      updateMusicBadge();
      setAnim(MUSIC_ANIM, now);
    } else if (state === 'session-finished') {
      setAnim('review', now);
      showBubble('[aemeth-ai-agent]\nSesi AI selesai.\nContoh ringkasan: semua tes lulus.');
      updateBubble(now);
    } else if (state === 'session-failed') {
      setAnim('failed', now);
      showBubble('[aemeth-ai-agent]\nSesi AI gagal: contoh pesan error.');
      updateBubble(now);
    } else {
      musicStatus = { playing: false, title: '', artist: '', app: '' };
      updateMusicBadge();
      setAnim(state, now);
    }
  }

  function setHover(next) {
    if (hoverState === next) return;
    hoverState = next;
    window.aemeth.setHover(next);
  }

  function wireEvents() {
    // The window is click-through except over the pet and its bubbles.
    document.addEventListener('mousemove', (e) => {
      if (dragState) return;
      const target = e.target;
      const hovering =
        target === canvas || bubble.contains(target) || musicBadge.contains(target);
      setHover(hovering);
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
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
      if (!dragState.moved) setTransient('jumping', 1200);
      else persistPosition();
      dragState = null;
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        adjustScale(e.deltaY < 0 ? 0.1 : -0.1);
      },
      { passive: false },
    );

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      window.aemeth.openContextMenu();
    });

    bubble.addEventListener('click', () => hideBubble());

    window.aemeth.onSessionEvent(handleSessionEvent);
    window.aemeth.onMediaStatus((status) => {
      musicStatus = status;
      updateMusicBadge();
    });
    window.aemeth.onAggregate((agg) => {
      aggregate = agg;
    });
    window.aemeth.onSettingsUpdated((next) => {
      const scaleChanged = next.scale !== settings.scale;
      settings = Object.assign({}, settings, next);
      if (walker) walker.speed = settings.speed;
      if (scaleChanged) applyScale();
    });
    window.aemeth.onDemo(setDemoState);
    window.aemeth.onReset(() => {
      walker.x = clamp(workArea.width / 2, 0, flightBounds().maxX);
      walker.y = homeY();
      haltWalker();
      persistPosition();
    });
  }

  boot();
})();
