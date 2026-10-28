'use strict';

(function () {
  const guideApi = window.aemeathGuide || {
    getEntries: async () => [],
    search: async () => [],
    getAtlas: async () => null,
    closeWindow: () => {},
  };

  const navList = document.getElementById('navCategoryList');
  const articleArea = document.getElementById('guideArticleArea');
  const searchInput = document.getElementById('guideSearchInput');
  const searchClearBtn = document.getElementById('searchClearBtn');
  const navCountBadge = document.getElementById('navCountBadge');
  const dialogueText = document.getElementById('dialogueText');
  const companionBubble = document.getElementById('companionBubble');
  const avatarWrapper = document.getElementById('avatarWrapper');
  const avatarCanvas = document.getElementById('avatarCanvas');
  const winCloseBtn = document.getElementById('winCloseBtn');
  const themeToggleBtn = document.getElementById('themeToggleBtn');

  const ICON_MAP = {
    'getting-started': '✨',
    'interactive-modes': '🛡️',
    'chat-ai': '💬',
    'web-search': '🌐',
    'productivity': '⏳',
    'memory-notes': '🧠',
    'developer-tools': '💻',
    'custom-commands': '⚡',
    'settings': '⚙️',
    'privacy-safety': '🔒',
    'troubleshooting-faq': '❓',
  };

  let allEntries = [];
  let currentFiltered = [];
  let activeEntryId = 'getting-started';
  let jumpCooldown = false;

  // Canvas and animation state
  let atlas = null;
  const spriteSheet = new Image();
  spriteSheet.src = '../assets/pet/spritesheet.webp';
  const ctx = avatarCanvas.getContext('2d');
  let currentAnim = 'idle';
  let frameIndex = 0;
  let lastFrameTime = performance.now();
  let jumpTimer = null;
  let currentSettings = {
    theme: 'default',
    glassPreset: 'violet',
    glassHue: 280,
    glassBlur: 20,
    glassOpacity: 0.18,
  };

  async function init() {
    setupWindowEvents();
    try {
      allEntries = await guideApi.getEntries();
      atlas = await guideApi.getAtlas();
      const loaded = await guideApi.getSettings();
      if (loaded) currentSettings = Object.assign({}, currentSettings, loaded);
    } catch {
      allEntries = [];
    }

    if (guideApi.onSettingsUpdated) {
      guideApi.onSettingsUpdated((updated) => {
        if (updated) {
          currentSettings = Object.assign({}, currentSettings, updated);
        }
      });
    }

    currentFiltered = allEntries.slice();
    renderNav();
    if (allEntries.length > 0) {
      selectEntry(allEntries[0].id, true);
    }

    startAnimationLoop();
  }

  function setupWindowEvents() {
    winCloseBtn.addEventListener('click', () => {
      guideApi.closeWindow();
    });

    if (themeToggleBtn) {
      const PRESETS_CYCLE = ['midnight-glass', 'soft-light', 'mono', 'aemeath', 'classic'];
      themeToggleBtn.addEventListener('click', async () => {
        let currentPreset = 'midnight-glass';
        if (window.__aemeathTheme && window.__aemeathTheme.theme) {
          currentPreset = window.__aemeathTheme.theme.preset || 'midnight-glass';
        } else if (guideApi.getTheme) {
          try {
            const p = await guideApi.getTheme();
            if (p && p.theme) currentPreset = p.theme.preset || 'midnight-glass';
          } catch {
            // ignore
          }
        }
        const currentIndex = PRESETS_CYCLE.indexOf(currentPreset);
        const nextPreset = PRESETS_CYCLE[(currentIndex + 1) % PRESETS_CYCLE.length];
        if (typeof guideApi.setThemePreset === 'function') {
          guideApi.setThemePreset(nextPreset);
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        guideApi.closeWindow();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        handleNavArrow(e.key === 'ArrowDown' ? 1 : -1);
      }
    });

    searchInput.addEventListener('input', async () => {
      const q = searchInput.value.trim();
      searchClearBtn.style.display = q ? 'block' : 'none';
      if (!q) {
        currentFiltered = allEntries.slice();
      } else {
        try {
          currentFiltered = await guideApi.search(q);
        } catch {
          const lower = q.toLowerCase();
          currentFiltered = allEntries.filter((en) =>
            en.title.toLowerCase().includes(lower) ||
            en.summary.toLowerCase().includes(lower) ||
            en.usage.toLowerCase().includes(lower)
          );
        }
      }
      renderNav();
      if (currentFiltered.length > 0 && !currentFiltered.some((en) => en.id === activeEntryId)) {
        selectEntry(currentFiltered[0].id);
      }
    });

    searchClearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchClearBtn.style.display = 'none';
      currentFiltered = allEntries.slice();
      renderNav();
      if (allEntries.length > 0) selectEntry(allEntries[0].id);
      searchInput.focus();
    });

    avatarWrapper.addEventListener('click', () => {
      triggerJump();
    });
    avatarWrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        triggerJump();
      }
    });
  }

  function handleNavArrow(direction) {
    if (currentFiltered.length === 0) return;
    const currentIndex = currentFiltered.findIndex((en) => en.id === activeEntryId);
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = currentFiltered.length - 1;
    if (nextIndex >= currentFiltered.length) nextIndex = 0;
    selectEntry(currentFiltered[nextIndex].id);
  }

  function renderNav() {
    navList.innerHTML = '';
    navCountBadge.textContent = currentFiltered.length + ' Topik';

    if (currentFiltered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'card-section';
      empty.style.textAlign = 'center';
      empty.style.fontSize = '12px';
      empty.style.color = '#94a3b8';
      empty.innerHTML = 'Tidak ada topik yang cocok.<br><button type="button" class="copy-btn" style="margin-top:8px;">Reset</button>';
      empty.querySelector('button').addEventListener('click', () => {
        searchInput.value = '';
        searchClearBtn.style.display = 'none';
        currentFiltered = allEntries.slice();
        renderNav();
        if (allEntries.length > 0) selectEntry(allEntries[0].id);
      });
      navList.appendChild(empty);
      return;
    }

    currentFiltered.forEach((entry) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-item' + (entry.id === activeEntryId ? ' active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', entry.id === activeEntryId ? 'true' : 'false');
      btn.setAttribute('tabindex', entry.id === activeEntryId ? '0' : '-1');

      const left = document.createElement('span');
      left.className = 'nav-item-left';
      const icon = document.createElement('span');
      icon.textContent = ICON_MAP[entry.id] || '📖';
      const title = document.createElement('span');
      title.textContent = entry.title;
      left.append(icon, title);

      const badge = document.createElement('span');
      badge.className = 'nav-badge';
      badge.textContent = entry.category;

      btn.append(left, badge);
      btn.addEventListener('click', () => {
        selectEntry(entry.id);
      });
      navList.appendChild(btn);
    });
  }

  function selectEntry(id, isInitial) {
    activeEntryId = id;
    const entry = allEntries.find((en) => en.id === id);
    if (!entry) return;

    // Update active class on nav
    const buttons = navList.querySelectorAll('.nav-item');
    buttons.forEach((btn, index) => {
      const cur = currentFiltered[index];
      const match = cur && cur.id === id;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-selected', match ? 'true' : 'false');
      btn.setAttribute('tabindex', match ? '0' : '-1');
    });

    renderArticle(entry);
    updateDialogue(entry.aemeathDialogue);

    if (!isInitial) {
      triggerJump();
    }
  }

  function renderArticle(entry) {
    articleArea.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'article-header';
    header.innerHTML = `
      <div class="breadcrumb">Aemeath Guidebook &gt; ${escapeHtml(entry.category)}</div>
      <div class="article-title-row">
        <span>${ICON_MAP[entry.id] || '📖'}</span>
        <h2>${escapeHtml(entry.title)}</h2>
      </div>
      <p class="article-summary">${escapeHtml(entry.summary)}</p>
    `;
    articleArea.appendChild(header);

    // Purpose card
    const purposeCard = document.createElement('div');
    purposeCard.className = 'card-section';
    purposeCard.innerHTML = `
      <div class="card-title">Tujuan / Fungsi Utama</div>
      <div class="card-text">${escapeHtml(entry.purpose)}</div>
    `;
    articleArea.appendChild(purposeCard);

    // Syntax & Examples card
    const syntaxCard = document.createElement('div');
    syntaxCard.className = 'card-section';

    const syntaxBox = document.createElement('div');
    syntaxBox.className = 'syntax-box';
    const codeSpan = document.createElement('code');
    codeSpan.textContent = entry.usage;
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Salin';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(entry.usage).then(() => {
        copyBtn.textContent = 'Tersalin!';
        setTimeout(() => {
          copyBtn.textContent = 'Salin';
        }, 1600);
      });
    });
    syntaxBox.append(codeSpan, copyBtn);

    const examplesWrap = document.createElement('div');
    examplesWrap.innerHTML = '<span style="font-size:11px;color:#94a3b8;font-weight:600;">Contoh Masukan:</span>';
    const tagList = document.createElement('div');
    tagList.className = 'examples-wrap';
    entry.examples.forEach((ex) => {
      const tag = document.createElement('span');
      tag.className = 'example-tag';
      tag.textContent = ex;
      tagList.appendChild(tag);
    });
    examplesWrap.appendChild(tagList);

    syntaxCard.innerHTML = '<div class="card-title pink">Cara Penggunaan &amp; Sintaks</div>';
    syntaxCard.append(syntaxBox, examplesWrap);
    articleArea.appendChild(syntaxCard);

    // Grid: Requirements & Mode Availability
    const grid = document.createElement('div');
    grid.className = 'grid-two';
    grid.innerHTML = `
      <div class="card-section" style="margin-bottom:0;">
        <div class="card-title" style="color:#94a3b8;">Persyaratan</div>
        <div class="card-text">${escapeHtml(entry.requirements)}</div>
      </div>
      <div class="card-section" style="margin-bottom:0;">
        <div class="card-title" style="color:#94a3b8;">Kesesuaian Mode</div>
        <div class="card-text">${escapeHtml(entry.modeAvailability)}</div>
      </div>
    `;
    articleArea.appendChild(grid);

    // Privacy & Safety card
    const privacyCard = document.createElement('div');
    privacyCard.className = 'privacy-card';
    privacyCard.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
      </svg>
      <div>
        <strong>Privasi &amp; Keamanan Terjamin</strong>
        <span>${escapeHtml(entry.privacyNotes)}</span>
      </div>
    `;
    articleArea.appendChild(privacyCard);
  }

  function updateDialogue(text) {
    companionBubble.style.opacity = '0';
    companionBubble.style.transform = 'translateY(4px)';

    setTimeout(() => {
      dialogueText.textContent = text || 'Rover~! Aku di sini menemanimu membaca panduan.';
      companionBubble.style.opacity = '1';
      companionBubble.style.transform = 'translateY(0)';
    }, 120);
  }

  function triggerJump() {
    if (jumpCooldown) return;
    jumpCooldown = true;

    currentAnim = 'jumping';
    frameIndex = 0;
    clearTimeout(jumpTimer);

    jumpTimer = setTimeout(() => {
      currentAnim = 'idle';
      frameIndex = 0;
    }, 850);

    setTimeout(() => {
      jumpCooldown = false;
    }, 1400); // 1.4s cooldown
  }

  function startAnimationLoop() {
    function tick(now) {
      drawFrame(now);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function drawFrame(now) {
    const animConfig = (atlas && atlas.animations && atlas.animations[currentAnim]) || {
      row: 0,
      frames: 6,
      fps: 8,
    };
    const fps = animConfig.fps || 8;
    const interval = 1000 / fps;

    if (now - lastFrameTime > interval) {
      frameIndex = (frameIndex + 1) % animConfig.frames;
      lastFrameTime = now;
    }

    ctx.clearRect(0, 0, avatarCanvas.width, avatarCanvas.height);

    if (spriteSheet.complete && spriteSheet.naturalWidth > 0 && atlas) {
      const rect = window.AemeathAtlas
        ? window.AemeathAtlas.frameRect(atlas, currentAnim, frameIndex)
        : {
            x: frameIndex * (atlas.cellWidth || 192),
            y: animConfig.row * (atlas.cellHeight || 208),
            width: atlas.cellWidth || 192,
            height: atlas.cellHeight || 208,
          };

      ctx.drawImage(
        spriteSheet,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        0,
        0,
        avatarCanvas.width,
        avatarCanvas.height
      );
    } else {
      // Fallback silhouette
      ctx.fillStyle = '#f472b6';
      ctx.beginPath();
      ctx.arc(48, 52, 26, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
