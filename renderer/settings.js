'use strict';

(function () {
  const chatter = document.getElementById('chatter');
  const interval = document.getElementById('interval');
  const value = document.getElementById('value');
  const range = document.getElementById('range');
  const intervalRow = interval.closest('.row');
  const proactivePause = document.getElementById('proactive-pause');
  const proactiveCap = document.getElementById('proactive-cap');
  const proactiveCapValue = document.getElementById('proactive-cap-value');
  const proactiveCooldown = document.getElementById('proactive-cooldown');
  const quietHoursToggle = document.getElementById('quiet-hours-toggle');
  const quietHoursStart = document.getElementById('quiet-hours-start');
  const quietHoursEnd = document.getElementById('quiet-hours-end');

  const provider = document.getElementById('provider');
  const model = document.getElementById('model');
  const apiKey = document.getElementById('apikey');
  const saveKey = document.getElementById('save-key');
  const clearKey = document.getElementById('clear-key');
  const keyStatus = document.getElementById('key-status');
  const terminal = document.getElementById('terminal');
  const webSearch = document.getElementById('websearch');
  const offline = document.getElementById('offline');
  const streaming = document.getElementById('streaming');
  const providerNames = [
    document.getElementById('provider-name'),
    document.getElementById('provider-name-2'),
  ];
  const languageSelect = document.getElementById('language-select');

  let i18n = null;
  let status = null;
  let currentPlatform = {
    id: 'win32',
    isWindows: true,
    isLinux: false,
    isLinuxMint: false,
    osLabel: 'Windows',
    shellName: 'PowerShell',
  };

  function applyPlatformUI(plat) {
    if (!plat || typeof plat !== 'object') return;
    currentPlatform = plat;
    const osBadge = document.getElementById('os-badge');
    const startupLabel = document.getElementById('startup-label-text');
    const changeModeDesc = document.getElementById('change-mode-desc');
    const terminalHint = document.getElementById('terminal-hint');
    const commandsIntro = document.getElementById('commands-intro-hint');
    const commandsTarget = document.getElementById('commands-target-hint');
    const commandsShell = document.getElementById('commands-shell-hint');

    const osName = plat.osLabel || (plat.isLinuxMint ? 'Linux Mint' : plat.isLinux ? 'Linux' : 'Windows');
    const shellName = plat.shellName || (plat.isLinux ? 'Bash' : 'PowerShell');
    const isEn = i18n && i18n.getLocale() === 'en-US';
    if (osBadge) {
      const shellDetail = plat.desktop ? ' (' + plat.desktop + ', shell: ' + shellName + ')' : ' (shell: ' + shellName + ')';
      osBadge.textContent = isEn
        ? 'System environment detected: ' + osName + shellDetail
        : 'Lingkungan sistem terdeteksi: ' + osName + shellDetail;
    }
    if (startupLabel) {
      startupLabel.textContent = isEn
        ? 'Launch Aemeath automatically on ' + osName + ' startup'
        : 'Jalankan Aemeath otomatis saat ' + osName + ' menyala';
    }
    if (changeModeDesc) {
      changeModeDesc.textContent = isEn
        ? 'Switch chat box between chat and ' + shellName + ' terminal mode.'
        : 'Ganti kotak chat antara mode obrolan dan terminal ' + shellName + '.';
    }
    if (plat.isLinux) {
      if (terminalHint) {
        terminalHint.innerHTML =
          'Saat <code>/change-mode</code> dipakai, ' +
          osName +
          ' meminta persetujuan admin (Polkit / <code>pkexec</code>) lebih dulu. ' +
          'Setelah disetujui, kotak chat menjadi terminal <strong>Bash</strong> yang berjalan sebagai kamu, bukan root, ' +
          'dan hanya perintah yang kamu ketik sendiri yang dijalankan. Chatbot tidak ikut campur, dan ' +
          'sesi berakhir saat kotak ditutup, saat kamu mengetik <code>exit</code>, atau setelah 15 menit diam.';
      }
      if (commandsIntro) {
        commandsIntro.innerHTML =
          'Ketik <code>/nama</code> di kotak chat untuk membuka program, folder, atau tautan, atau menjalankan perintah Shell (Bash) di ' +
          osName +
          ', misalnya <code>/invoice</code> untuk folder kerja, <code>/gimp</code> untuk aplikasi, ' +
          'atau <code>/matikan</code> untuk mematikan komputer. ' +
          'Ketik <code>/</code> saja untuk melihat daftarnya. Perintah dijalankan di komputer ini saja: ' +
          'tidak dikirim ke chatbot, dan hanya teks yang kamu ketik sendiri yang bisa memicunya.';
      }
      if (commandsTarget) {
        commandsTarget.innerHTML =
          'Tujuan bisa berupa jalur lengkap ke program, berkas, atau folder (mis. <code>/usr/bin/...</code>, ' +
          '<code>~/Documents</code>, atau <code>$HOME/...</code>), atau tautan <code>http://</code> / <code>https://</code>. ' +
          'Argumen berlaku untuk program eksekusi.';
      }
      if (commandsShell) {
        commandsShell.innerHTML =
          '<strong>Perintah Shell (Bash)</strong> dijalankan sebagai kamu (bukan root), satu baris, dan dihentikan ' +
          'setelah 30 detik. Aemeath selalu bertanya "ya" dulu untuk perintah yang bisa mematikan, menghapus, ' +
          'memformat, atau mengunduh sesuatu, dan kamu tidak bisa mematikan pertanyaan itu. ' +
          'Contoh <code>/matikan</code> memakai hitung mundur 60 detik yang bisa dibatalkan dengan <code>/batal</code>.';
      }
    }
    renderPresets();
  }

  function format(minutes) {
    return String(Math.round(minutes * 10) / 10).replace('.', ',');
  }

  function render() {
    const minutes = Number(interval.value);
    const span = window.AemeathDialogue.chatIntervalRange(minutes);
    value.textContent = 'rata-rata ' + format(minutes) + ' menit';
    range.textContent =
      'Acak antara ' + format(span.minMs / 60000) + ' dan ' + format(span.maxMs / 60000) + ' menit.';
    intervalRow.classList.toggle('dim', !chatter.checked);
    interval.disabled = !chatter.checked;
  }

  function renderProactive() {
    proactiveCapValue.textContent = proactiveCap.value + ' kali per jam';
  }

  function fillOptions(select, options, selected) {
    select.textContent = '';
    for (const option of options) {
      const element = document.createElement('option');
      element.value = option.id;
      element.textContent = option.label || option.name;
      select.appendChild(element);
    }
    select.value = selected;
  }

  function currentProvider() {
    return status.providers.find((p) => p.id === provider.value) || status.providers[0];
  }

  function setKeyStatus(text, kind) {
    keyStatus.textContent = text;
    keyStatus.className = 'status' + (kind ? ' ' + kind : '');
  }

  function renderChat(next) {
    status = next;
    fillOptions(provider, status.providers, status.provider);
    const active = currentProvider();
    fillOptions(model, active.models, status.model);
    for (const element of providerNames) element.textContent = active.name;
    webSearch.checked = status.webSearch;
    offline.checked = status.offlineFallback;
    if (streaming) streaming.checked = status.streaming !== false;
    clearKey.disabled = !active.hasKey;
    if (active.hasKey) {
      setKeyStatus(
        status.secure
          ? 'Kunci tersimpan (terenkripsi di komputer ini).'
          : 'Kunci aktif untuk sesi ini saja (enkripsi sistem tidak tersedia, jadi tidak disimpan ke disk).',
        'ok',
      );
    } else {
      setKeyStatus('Belum ada kunci. Buat kunci di platform ' + active.name + ', lalu tempel di atas.');
    }
  }

  async function boot() {
    const settings = await window.aemeathSettings.get();
    const catalogs = typeof window.aemeathSettings?.getCatalogs === 'function' ? window.aemeathSettings.getCatalogs() : null;
    if (window.AemeathI18n) {
      i18n = window.AemeathI18n.createI18n({
        locale: (settings && settings.locale) || 'id-ID',
        catalogs: catalogs || window.AemeathI18n.defaultCatalogs || {},
      });
      i18n.applyDom(document);
    }
    if (languageSelect && settings) {
      languageSelect.value = settings.locale || 'id-ID';
    }
    if (settings && settings.platform) {
      applyPlatformUI(settings.platform);
    } else if (typeof window.aemeathSettings.getPlatform === 'function') {
      applyPlatformUI(await window.aemeathSettings.getPlatform());
    } else {
      renderPresets();
    }
    chatter.checked = settings.chatterEnabled !== false;
    terminal.checked = settings.terminalEnabled !== false;
    startupToggle.checked = settings.startAtLogin !== false;
    refreshStartup();
    stillToggle.checked = settings.stayStill === true;
    transparentToggle.checked = settings.transparentMode === true;
    opacityInput.value = Math.round((typeof settings.opacity === 'number' ? settings.opacity : 0.6) * 100);
    renderTransparency();
    shortcutSelect.value = typeof settings.chatShortcut === 'string' ? settings.chatShortcut : 'Alt+Space';
    doom.value = settings.doomscrollLimitMin || 20;
    doomValue.textContent = 'setelah ' + doom.value + ' menit';
    renderMode(
      settings.interactiveMode === 'full'
        ? 'full'
        : settings.interactiveMode === 'medium'
          ? 'medium'
          : 'low',
    );
    interval.value = settings.chatterIntervalMin;
    render();
    proactivePause.checked = settings.proactivePaused === true;
    proactiveCap.value = settings.proactiveMaxPerHour || 6;
    proactiveCooldown.value = String(
      typeof settings.proactiveCooldownMin === 'number' ? settings.proactiveCooldownMin : 10,
    );
    if (!proactiveCooldown.value) proactiveCooldown.value = '10';
    const priorities = settings.notificationPriorities || {};
    for (const el of document.querySelectorAll('.prio-select')) {
      const cat = el.dataset.category;
      if (cat && priorities[cat]) {
        el.value = String(priorities[cat]);
      }
    }
    if (quietHoursToggle) quietHoursToggle.checked = settings.quietHoursEnabled === true;
    if (quietHoursStart) quietHoursStart.value = settings.quietHoursStart || '23:00';
    if (quietHoursEnd) quietHoursEnd.value = settings.quietHoursEnd || '07:00';
    renderProactive();
    refreshLorebook();
    await loadCommands();
    await refreshMemory();
    renderChat(await window.aemeathSettings.chatStatus());
  }

  if (languageSelect) {
    languageSelect.addEventListener('change', () => {
      const nextLocale = languageSelect.value;
      if (i18n) {
        i18n.setLocale(nextLocale);
        i18n.applyDom(document);
      }
      window.aemeathSettings.set({ locale: nextLocale });
    });
  }

  if (typeof window.aemeathSettings?.onSettingsUpdated === 'function') {
    window.aemeathSettings.onSettingsUpdated((updated) => {
      if (updated && updated.locale) {
        if (languageSelect && languageSelect.value !== updated.locale) {
          languageSelect.value = updated.locale;
        }
        if (i18n && i18n.getLocale() !== updated.locale) {
          i18n.setLocale(updated.locale);
          i18n.applyDom(document);
        }
      }
    });
  }

  chatter.addEventListener('change', () => {
    render();
    window.aemeathSettings.set({ chatterEnabled: chatter.checked });
  });

  interval.addEventListener('input', render);
  // Persist when the slider is released, not on every pixel of movement.
  interval.addEventListener('change', () => {
    window.aemeathSettings.set({ chatterIntervalMin: Number(interval.value) });
  });

  proactivePause.addEventListener('change', () => {
    window.aemeathSettings.set({ proactivePaused: proactivePause.checked });
  });

  proactiveCap.addEventListener('input', renderProactive);
  proactiveCap.addEventListener('change', () => {
    window.aemeathSettings.set({ proactiveMaxPerHour: Number(proactiveCap.value) });
  });

  proactiveCooldown.addEventListener('change', () => {
    window.aemeathSettings.set({ proactiveCooldownMin: Number(proactiveCooldown.value) });
  });

  for (const el of document.querySelectorAll('.prio-select')) {
    el.addEventListener('change', async () => {
      const cat = el.dataset.category;
      if (!cat) return;
      const settings = (await window.aemeathSettings.get()) || {};
      const priorities = Object.assign({}, settings.notificationPriorities || {});
      priorities[cat] = Number(el.value);
      window.aemeathSettings.set({ notificationPriorities: priorities });
    });
  }

  if (quietHoursToggle) {
    quietHoursToggle.addEventListener('change', () => {
      window.aemeathSettings.set({ quietHoursEnabled: quietHoursToggle.checked });
    });
  }
  if (quietHoursStart) {
    quietHoursStart.addEventListener('change', () => {
      window.aemeathSettings.set({ quietHoursStart: quietHoursStart.value });
    });
  }
  if (quietHoursEnd) {
    quietHoursEnd.addEventListener('change', () => {
      window.aemeathSettings.set({ quietHoursEnd: quietHoursEnd.value });
    });
  }

  terminal.addEventListener('change', () => {
    window.aemeathSettings.set({ terminalEnabled: terminal.checked });
  });

  webSearch.addEventListener('change', () => {
    window.aemeathSettings.set({ chatWebSearch: webSearch.checked });
  });

  offline.addEventListener('change', () => {
    window.aemeathSettings.set({ chatOfflineFallback: offline.checked });
  });

  if (streaming) {
    streaming.addEventListener('change', () => {
      window.aemeathSettings.set({ chatStreaming: streaming.checked });
    });
  }

  provider.addEventListener('change', async () => {
    const active = currentProvider();
    renderChat(
      await window.aemeathSettings.setChatConfig({ provider: active.id, model: active.models[0].id }),
    );
  });

  model.addEventListener('change', async () => {
    renderChat(
      await window.aemeathSettings.setChatConfig({ provider: provider.value, model: model.value }),
    );
  });

  saveKey.addEventListener('click', async () => {
    const key = apiKey.value;
    apiKey.value = ''; // the field never keeps the key
    if (!key.trim()) {
      setKeyStatus('Tempel kunci dulu.', 'error');
      return;
    }
    const result = await window.aemeathSettings.setApiKey(provider.value, key);
    if (!result.ok) {
      setKeyStatus(result.error || 'Kunci tidak bisa disimpan.', 'error');
      return;
    }
    renderChat(await window.aemeathSettings.chatStatus());
  });

  clearKey.addEventListener('click', async () => {
    await window.aemeathSettings.clearApiKey(provider.value);
    renderChat(await window.aemeathSettings.chatStatus());
  });

  // ---- Startup ----------------------------------------------------------------
  const startupToggle = document.getElementById('startup-toggle');
  const startupStatus = document.getElementById('startup-status');

  async function refreshStartup() {
    const state = await window.aemeathSettings.getStartup();
    const osName = currentPlatform.osLabel || (currentPlatform.isLinux ? 'Linux' : 'Windows');
    let text = '';
    let kind = '';
    if (!state) text = '';
    else if (!state.wanted) text = 'Tidak dijalankan otomatis.';
    else if (state.registered && state.willLaunch) {
      text = currentPlatform.isLinux
        ? 'Terdaftar di startup ' + osName + ' (~/.config/autostart/aemeath.desktop).'
        : 'Terdaftar di startup Windows.';
      kind = 'ok';
    } else if (state.registered) {
      text = currentPlatform.isLinux
        ? 'Terdaftar, tetapi entri autostart dinonaktifkan di Pengaturan Aplikasi Awal Mula ' + osName + '.'
        : 'Terdaftar, tetapi Windows menonaktifkannya. Aktifkan lagi di Pengelola Tugas, tab Startup.';
      kind = 'error';
    } else {
      text = 'Belum terdaftar di ' + osName + '. Entri dibuat saat Aemeath dijalankan.';
    }
    startupStatus.textContent = text;
    startupStatus.className = 'status' + (kind ? ' ' + kind : '');
  }

  startupToggle.addEventListener('change', () => {
    window.aemeathSettings.set({ startAtLogin: startupToggle.checked });
    setTimeout(refreshStartup, 500);
  });

  const stillToggle = document.getElementById('still-toggle');
  stillToggle.addEventListener('change', () => {
    window.aemeathSettings.set({ stayStill: stillToggle.checked });
  });

  const transparentToggle = document.getElementById('transparent-toggle');
  const opacityInput = document.getElementById('opacity');
  const opacityValue = document.getElementById('opacity-value');
  const opacityRow = document.getElementById('opacity-row');

  function renderTransparency() {
    const on = transparentToggle.checked;
    opacityValue.textContent = opacityInput.value + '%';
    opacityRow.classList.toggle('dim', !on);
    opacityInput.disabled = !on;
  }

  transparentToggle.addEventListener('change', () => {
    renderTransparency();
    window.aemeathSettings.set({ transparentMode: transparentToggle.checked });
  });
  opacityInput.addEventListener('input', renderTransparency);
  opacityInput.addEventListener('change', () => {
    window.aemeathSettings.set({ opacity: Number(opacityInput.value) / 100 });
  });

  const shortcutSelect = document.getElementById('shortcut');
  shortcutSelect.addEventListener('change', () => {
    window.aemeathSettings.set({ chatShortcut: shortcutSelect.value });
  });

  // ---- Lorebook & Wiki updater -----------------------------------------------
  const wikiPageInput = document.getElementById('wiki-page');
  const updateWikiBtn = document.getElementById('update-wiki');
  const lorebookStatus = document.getElementById('lorebook-status');

  function renderLorebookInfo(info, extraMsg, kind) {
    if (!info) return;
    const updatedNote = info.updatedAt ? ' (sinkron terakhir: ' + info.updatedAt + ')' : '';
    const base =
      'Tersedia ' +
      info.entryCount +
      ' entri trivia dari ' +
      info.sourceCount +
      ' sumber Wuthering Waves Wiki' +
      updatedNote +
      '.';
    lorebookStatus.textContent = extraMsg ? extraMsg + ' ' + base : base;
    lorebookStatus.className = 'status' + (kind ? ' ' + kind : '');
  }

  async function refreshLorebook() {
    if (typeof window.aemeathSettings.getLorebookStatus !== 'function') return;
    const info = await window.aemeathSettings.getLorebookStatus();
    renderLorebookInfo(info, '', '');
  }

  updateWikiBtn.addEventListener('click', async () => {
    if (typeof window.aemeathSettings.updateLorebook !== 'function') return;
    updateWikiBtn.disabled = true;
    lorebookStatus.textContent = 'Mengambil data terbaru dari Wuthering Waves Wiki...';
    lorebookStatus.className = 'status';
    try {
      const res = await window.aemeathSettings.updateLorebook(wikiPageInput.value);
      if (res && res.ok) {
        wikiPageInput.value = '';
        renderLorebookInfo(
          res,
          'Berhasil memperbarui ' + res.updatedPages + ' halaman wiki (+' + res.addedEntries + ' entri)!',
          'ok',
        );
      } else {
        lorebookStatus.textContent = (res && res.error) || 'Gagal memperbarui data wiki.';
        lorebookStatus.className = 'status error';
      }
    } catch {
      lorebookStatus.textContent = 'Gagal memperbarui data wiki.';
      lorebookStatus.className = 'status error';
    } finally {
      updateWikiBtn.disabled = false;
    }
  });

  // ---- Custom slash commands -------------------------------------------------
  const commandList = document.getElementById('command-list');
  const addCommand = document.getElementById('add-command');
  const commandStatus = document.getElementById('command-status');
  const presetSelect = document.getElementById('preset');
  const addPreset = document.getElementById('add-preset');
  let saveTimer = null;

  // Ready-made PowerShell (Windows) and Bash (Linux Mint / Linux) commands.
  // Whatever can shut the computer down asks first.
  const WINDOWS_PRESETS = [
    {
      label: 'Matikan komputer (60 detik, bisa dibatalkan)',
      entry: {
        name: 'matikan',
        description: 'matikan komputer dalam 60 detik',
        script: 'shutdown /s /t 60 /c "Aemeath: komputer akan mati dalam 60 detik. Ketik /batal untuk membatalkan."',
        confirm: true,
      },
    },
    {
      label: 'Restart komputer (60 detik, bisa dibatalkan)',
      entry: {
        name: 'restart',
        description: 'restart komputer dalam 60 detik',
        script: 'shutdown /r /t 60 /c "Aemeath: komputer akan restart dalam 60 detik. Ketik /batal untuk membatalkan."',
        confirm: true,
      },
    },
    {
      label: 'Batalkan matikan atau restart',
      entry: { name: 'batal', description: 'batalkan matikan atau restart', script: 'shutdown /a', confirm: false },
    },
    {
      label: 'Kunci layar',
      entry: { name: 'kunci', description: 'kunci layar', script: 'rundll32.exe user32.dll,LockWorkStation', confirm: false },
    },
    {
      label: 'Lima proses terberat',
      entry: {
        name: 'proses',
        description: 'lima proses terberat',
        script: 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 5 Name, CPU | Format-Table -AutoSize | Out-String',
        confirm: false,
      },
    },
  ];

  const LINUX_PRESETS = [
    {
      label: 'Matikan komputer (60 detik, bisa dibatalkan)',
      entry: {
        name: 'matikan',
        description: 'matikan komputer dalam 60 detik',
        script: 'shutdown -h +1 "Aemeath: komputer akan mati dalam 60 detik. Ketik /batal untuk membatalkan."',
        confirm: true,
      },
    },
    {
      label: 'Restart komputer (60 detik, bisa dibatalkan)',
      entry: {
        name: 'restart',
        description: 'restart komputer dalam 60 detik',
        script: 'shutdown -r +1 "Aemeath: komputer akan restart dalam 60 detik. Ketik /batal untuk membatalkan."',
        confirm: true,
      },
    },
    {
      label: 'Batalkan matikan atau restart',
      entry: { name: 'batal', description: 'batalkan matikan atau restart', script: 'shutdown -c', confirm: false },
    },
    {
      label: 'Kunci layar (Linux Mint Cinnamon / XDG)',
      entry: {
        name: 'kunci',
        description: 'kunci layar',
        script: 'cinnamon-screensaver-command -l || xdg-screensaver lock || loginctl lock-session',
        confirm: false,
      },
    },
    {
      label: 'Lima proses terberat (CPU & RAM)',
      entry: {
        name: 'proses',
        description: 'lima proses terberat',
        script: 'ps -eo comm,%cpu,%mem --sort=-%cpu | head -n 6',
        confirm: false,
      },
    },
    {
      label: 'Cek pembaruan paket APT (Linux Mint)',
      entry: {
        name: 'cek-update',
        description: 'cek paket yang bisa diperbarui',
        script: 'apt list --upgradable 2>/dev/null | head -n 15',
        confirm: false,
      },
    },
  ];

  function activePresets() {
    return currentPlatform.isLinux ? LINUX_PRESETS : WINDOWS_PRESETS;
  }

  function renderPresets() {
    presetSelect.textContent = '';
    presetSelect.appendChild(new Option('Pilih contoh...', ''));
    activePresets().forEach((preset, index) => presetSelect.appendChild(new Option(preset.label, String(index))));
  }

  function line(...children) {
    const element = document.createElement('div');
    element.className = 'line';
    element.append(...children);
    return element;
  }

  function field(className, placeholder, value, maxLength) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = className;
    input.placeholder = placeholder;
    input.value = value || '';
    input.maxLength = maxLength;
    input.spellcheck = false;
    return input;
  }

  function button(label, title) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    if (title) element.title = title;
    return element;
  }

  function checkLine(className, text, checked) {
    const label = document.createElement('label');
    label.className = 'check-line';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = className;
    input.checked = checked;
    const span = document.createElement('span');
    span.textContent = text;
    label.append(input, span);
    return { label: label, input: input };
  }

  function addRow(command) {
    const row = document.createElement('div');
    row.className = 'cmd';

    const slash = document.createElement('span');
    slash.className = 'slash';
    slash.textContent = '/';
    const name = field('name', 'invoice', command && command.name, 24);
    const description = field('grow desc', 'Keterangan (opsional)', command && command.description, 60);
    const remove = button('\u2715', 'Hapus perintah');

    const isLinux = Boolean(currentPlatform.isLinux);
    const shellTypeLabel = isLinux ? 'Jalankan perintah Shell (Bash)' : 'Jalankan perintah PowerShell';
    const type = document.createElement('select');
    type.className = 'type';
    for (const [value, label] of [
      ['open', 'Buka program, folder, atau tautan'],
      ['workflow', 'Buka paket kerja (beberapa tujuan sekaligus)'],
      ['powershell', shellTypeLabel],
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      type.appendChild(option);
    }
    type.value =
      command && (command.type === 'powershell' || command.type === 'workflow')
        ? command.type
        : 'open';

    const targetPlaceholder = isLinux
      ? '/usr/bin/... atau ~/... atau https://...'
      : 'C:\\... atau https://...';
    const argsPlaceholder = isLinux
      ? 'Argumen (opsional, khusus program eksekusi)'
      : 'Argumen (opsional, khusus program .exe)';
    const scriptPlaceholder = isLinux
      ? 'Perintah Bash, satu baris (mis. free -h atau shutdown -h +1)'
      : 'Perintah PowerShell, satu baris (mis. shutdown /s /t 60)';

    const target = field('grow target', targetPlaceholder, command && command.target, 500);
    const pickFile = button('Berkas...');
    const pickFolder = button('Folder...');
    const args = field('grow args', argsPlaceholder, command && command.args, 300);
    const workflowTargets = document.createElement('textarea');
    workflowTargets.className = 'grow workflow-targets';
    workflowTargets.rows = 3;
    workflowTargets.placeholder = 'Satu jalur lengkap atau tautan https:// per baris (minimal 2, maksimal 6)';
    workflowTargets.value =
      command && Array.isArray(command.targets) ? command.targets.join('\n') : '';
    const pickWfFile = button('+ Berkas...');
    const pickWfFolder = button('+ Folder...');
    const script = field('grow script', scriptPlaceholder, command && command.script, 500);
    const confirm = checkLine('confirm', 'Tanya dulu sebelum menjalankan', command ? command.confirm !== false : true);

    const note = document.createElement('p');
    note.className = 'row-note';
    const error = document.createElement('p');
    error.className = 'row-error';

    const openLines = [line(target, pickFile, pickFolder), line(args)];
    const workflowLines = [line(workflowTargets), line(pickWfFile, pickWfFolder)];
    const shellLines = [line(script), line(confirm.label)];
    row.append(
      line(slash, name, description, remove),
      line(type),
      ...openLines,
      ...workflowLines,
      ...shellLines,
      note,
      error,
    );

    function sync() {
      const mode = type.value;
      for (const element of openLines) element.classList.toggle('hidden', mode !== 'open');
      for (const element of workflowLines) element.classList.toggle('hidden', mode !== 'workflow');
      for (const element of shellLines) element.classList.toggle('hidden', mode !== 'powershell');
    }
    sync();

    for (const input of [name, description, target, args, workflowTargets, script]) {
      input.addEventListener('input', scheduleSave);
    }
    confirm.input.addEventListener('change', scheduleSave);
    type.addEventListener('change', () => {
      sync();
      scheduleSave();
    });
    remove.addEventListener('click', () => {
      row.remove();
      scheduleSave();
    });
    for (const [kind, trigger] of [['file', pickFile], ['folder', pickFolder]]) {
      trigger.addEventListener('click', async () => {
        const picked = await window.aemeathSettings.pickPath(kind);
        if (!picked) return;
        target.value = picked;
        scheduleSave();
      });
    }
    for (const [kind, trigger] of [['file', pickWfFile], ['folder', pickWfFolder]]) {
      trigger.addEventListener('click', async () => {
        const picked = await window.aemeathSettings.pickPath(kind);
        if (!picked) return;
        workflowTargets.value = (workflowTargets.value.trim() ? workflowTargets.value.trim() + '\n' : '') + picked;
        scheduleSave();
      });
    }
    commandList.appendChild(row);
    return row;
  }

  function collect() {
    return Array.from(commandList.children).map((row) => ({
      row: row,
      entry: {
        name: row.querySelector('.name').value,
        description: row.querySelector('.desc').value,
        type: row.querySelector('.type').value,
        target: row.querySelector('.target').value,
        args: row.querySelector('.args').value,
        targets: row
          .querySelector('.workflow-targets')
          .value.split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean),
        script: row.querySelector('.script').value,
        confirm: row.querySelector('.confirm').checked,
      },
    }));
  }

  function usedNames() {
    return collect().map(({ entry }) => entry.name.trim().replace(/^\/+/, '').toLowerCase());
  }

  async function saveCommands() {
    // A brand-new empty row is not an error yet.
    const rows = collect().filter(
      ({ entry }) =>
        entry.name.trim() ||
        entry.target.trim() ||
        entry.script.trim() ||
        (entry.targets && entry.targets.length > 0),
    );
    const result = await window.aemeathSettings.saveCommands(rows.map(({ entry }) => entry));
    for (const { row } of collect()) {
      row.querySelector('.row-error').textContent = '';
      row.querySelector('.row-note').textContent = '';
    }
    for (const problem of result.errors) {
      const owner = rows[problem.index];
      if (owner) owner.row.querySelector('.row-error').textContent = problem.message;
    }
    // A risky script cannot opt out of being asked: show what the saved command really does.
    for (const saved of result.saved) {
      const owner = rows.find(({ entry }) => entry.name.trim().replace(/^\/+/, '').toLowerCase() === saved.name);
      if (!owner || saved.type !== 'powershell') continue;
      const box = owner.row.querySelector('.confirm');
      if (saved.confirm && !box.checked) {
        box.checked = true;
        owner.row.querySelector('.row-note').textContent =
          'Perintah ini bisa mematikan, menghapus, atau mengunduh sesuatu, jadi selalu bertanya dulu.';
      }
    }
    const count = result.saved.length;
    commandStatus.className = 'status' + (result.errors.length ? ' error' : count ? ' ok' : '');
    commandStatus.textContent = result.errors.length
      ? count + ' perintah tersimpan, ' + result.errors.length + ' perlu diperbaiki.'
      : count
        ? count + ' perintah tersimpan.'
        : 'Belum ada perintah.';
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCommands, 500);
  }

  async function loadCommands() {
    commandList.textContent = '';
    for (const command of await window.aemeathSettings.getCommands()) addRow(command);
    commandStatus.textContent = commandList.children.length ? '' : 'Belum ada perintah.';
  }

  addCommand.addEventListener('click', () => addRow().querySelector('.name').focus());

  addPreset.addEventListener('click', () => {
    if (presetSelect.value === '') return;
    const presets = activePresets();
    const chosen = presets[Number(presetSelect.value)];
    if (!chosen) return;
    const entry = Object.assign({ type: 'powershell' }, chosen.entry);
    const taken = usedNames();
    const base = entry.name;
    for (let n = 2; taken.includes(entry.name); n += 1) entry.name = base + n;
    addRow(entry);
    presetSelect.value = '';
    scheduleSave();
  });

  // ---- Interactive mode --------------------------------------------------------
  const modeLow = document.getElementById('mode-low');
  const modeMedium = document.getElementById('mode-medium');
  const modeFull = document.getElementById('mode-full');
  const consent = document.getElementById('medium-consent');
  const acceptMedium = document.getElementById('medium-accept');
  const cancelMedium = document.getElementById('medium-cancel');
  const fullConsent = document.getElementById('full-consent');
  const acceptFull = document.getElementById('full-accept');
  const cancelFull = document.getElementById('full-cancel');
  const mediumOptions = document.getElementById('medium-options');
  const doom = document.getElementById('doom');
  const doomValue = document.getElementById('doom-value');
  const activityNow = document.getElementById('activity-now');
  let activityTimer = null;
  let activeMode = 'low';

  async function refreshActivity() {
    const now = await window.aemeathSettings.getActivity();
    if (!now || !now.label) {
      activityNow.textContent = 'Menunggu aktivitas pertama...';
      return;
    }
    const extra = now.summary ? ' | Rekap sesi: ' + now.summary + '.' : '';
    activityNow.textContent = 'Yang sedang terbaca: ' + now.label + '.' + extra;
  }

  function renderMode(mode) {
    activeMode = mode === 'full' ? 'full' : mode === 'medium' ? 'medium' : 'low';
    modeLow.checked = activeMode === 'low';
    modeMedium.checked = activeMode === 'medium';
    modeFull.checked = activeMode === 'full';
    consent.classList.add('hidden');
    fullConsent.classList.add('hidden');
    const watching = activeMode === 'medium' || activeMode === 'full';
    mediumOptions.classList.toggle('hidden', !watching);
    clearInterval(activityTimer);
    activityTimer = null;
    if (watching) {
      refreshActivity();
      activityTimer = setInterval(refreshActivity, 3000);
    }
  }

  modeLow.addEventListener('change', () => {
    renderMode('low');
    window.aemeathSettings.set({ interactiveMode: 'low', fullConsent: false });
  });

  // Medium reads the window in front, so it only turns on after an explicit yes.
  modeMedium.addEventListener('change', () => {
    renderMode(activeMode);
    consent.classList.remove('hidden');
  });
  acceptMedium.addEventListener('click', () => {
    renderMode('medium');
    window.aemeathSettings.set({ interactiveMode: 'medium', fullConsent: false });
  });
  cancelMedium.addEventListener('click', () => consent.classList.add('hidden'));

  // Full requires its own separate explicit consent.
  modeFull.addEventListener('change', () => {
    renderMode(activeMode);
    fullConsent.classList.remove('hidden');
  });
  acceptFull.addEventListener('click', () => {
    renderMode('full');
    window.aemeathSettings.set({
      interactiveMode: 'full',
      fullConsent: true,
    });
  });
  cancelFull.addEventListener('click', () => fullConsent.classList.add('hidden'));

  doom.addEventListener('input', () => {
    doomValue.textContent = 'setelah ' + doom.value + ' menit';
  });
  doom.addEventListener('change', () => {
    window.aemeathSettings.set({ doomscrollLimitMin: Number(doom.value) });
  });

  // ---- Companion memory ------------------------------------------------------
  // The manager reads and edits the same small JSON file the chat uses. Lore is
  // not shown here on purpose: canon lives in the lorebook, not in memory.
  const memoryEnabled = document.getElementById('memory-enabled');
  const memoryRetention = document.getElementById('memory-retention');
  const memoryStatusLine = document.getElementById('memory-status');
  const memoryList = document.getElementById('memory-list');
  const memoryNew = document.getElementById('memory-new');
  const memoryNewText = document.getElementById('memory-new-text');
  const memoryNewKind = document.getElementById('memory-new-kind');
  const memoryNewSave = document.getElementById('memory-new-save');
  const memoryNewCancel = document.getElementById('memory-new-cancel');
  const memoryNote = document.getElementById('memory-note');
  const addMemory = document.getElementById('add-memory');
  const clearMemory = document.getElementById('clear-memory');

  const RETENTION_CHOICES = ['30', '90', '180', '365', '0'];
  const MEMORY_KINDS = [
    ['project', 'Proyek'],
    ['task', 'Tugas'],
    ['decision', 'Keputusan'],
    ['preference', 'Preferensi'],
    ['next-step', 'Langkah berikutnya'],
    ['context', 'Konteks'],
  ];
  let memoryState = null;

  function memoryDate(ms) {
    if (typeof ms !== 'number' || !ms) return 'waktu tidak tercatat';
    try {
      return new Date(ms).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return new Date(ms).toLocaleString();
    }
  }

  function setMemoryNote(text, kind) {
    memoryNote.textContent = text || '';
    memoryNote.className = 'status' + (kind ? ' ' + kind : '');
  }

  function renderMemoryStatus() {
    const state = memoryState;
    if (!state) {
      memoryStatusLine.textContent = 'Memori belum bisa dibaca.';
      return;
    }
    memoryEnabled.checked = state.disabled !== true;
    const retention = String(state.retentionDays);
    memoryRetention.value = RETENTION_CHOICES.includes(retention) ? retention : '90';
    memoryRetention.disabled = state.disabled === true;

    const parts = [state.count + ' dari ' + state.maxEntries + ' tempat terpakai'];
    if (state.bySource && state.bySource.user) parts.push(state.bySource.user + ' kamu tulis sendiri');
    if (state.bySource && state.bySource.assistant) {
      parts.push(state.bySource.assistant + ' ringkasan dari AI');
    }
    if (state.prunedAtLoad > 0) {
      parts.push(state.prunedAtLoad + ' ringkasan lama dibersihkan sesuai retensi');
    }
    memoryStatusLine.textContent = parts.join(' · ');
    memoryStatusLine.className = 'status' + (state.disabled || state.readOnly ? ' error' : '');
    if (state.notice) setMemoryNote(state.notice, 'error');
  }

  function memoryCard(record) {
    const card = document.createElement('div');
    card.className = 'mem';

    const head = document.createElement('div');
    head.className = 'mem-head';
    const badge = document.createElement('span');
    badge.className = 'mem-kind';
    badge.textContent = record.kindLabel || 'konteks';
    const meta = document.createElement('span');
    meta.className = 'mem-meta';
    meta.textContent =
      (record.sourceLabel || record.source) +
      ' · dibuat ' +
      memoryDate(record.createdAt) +
      (record.usedAt ? ' · terakhir dipakai ' + memoryDate(record.usedAt) : '') +
      (record.project ? ' · ' + record.project : '');
    head.append(badge, meta);

    const text = document.createElement('textarea');
    text.rows = 2;
    text.maxLength = 280;
    text.value = record.text;
    text.addEventListener('change', async () => {
      const result = await window.aemeathSettings.updateMemory({ id: record.id, text: text.value });
      if (!result || !result.ok) {
        setMemoryNote((result && result.error) || 'Perubahan tidak tersimpan.', 'error');
        text.value = record.text;
        return;
      }
      setMemoryNote('Perubahan tersimpan.', 'ok');
      await refreshMemory();
    });

    const kind = document.createElement('select');
    for (const option of MEMORY_KINDS) {
      const element = document.createElement('option');
      element.value = option[0];
      element.textContent = option[1];
      kind.appendChild(element);
    }
    kind.value = record.kind;
    kind.addEventListener('change', async () => {
      const result = await window.aemeathSettings.updateMemory({ id: record.id, kind: kind.value });
      if (!result || !result.ok) {
        setMemoryNote((result && result.error) || 'Jenis memori tidak bisa diubah.', 'error');
        return;
      }
      await refreshMemory();
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'mem-delete';
    remove.textContent = 'Hapus';
    remove.addEventListener('click', async () => {
      const ok = await window.aemeathSettings.deleteMemory(record.id);
      setMemoryNote(ok ? 'Memori dihapus.' : 'Memori itu sudah tidak ada.', ok ? 'ok' : 'error');
      await refreshMemory();
    });

    const line = document.createElement('div');
    line.className = 'mem-line';
    line.append(kind, remove);
    card.append(head, text, line);
    return card;
  }

  function renderMemoryList(records) {
    memoryList.textContent = '';
    if (!records || records.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'hint tight';
      empty.textContent =
        'Belum ada memori. Aemeath menawarkan menyimpan ringkasan setelah sesi coding di mode Full, atau kamu bisa menambahkannya sendiri.';
      memoryList.appendChild(empty);
      return;
    }
    for (const record of records) memoryList.appendChild(memoryCard(record));
  }

  async function refreshMemory() {
    const [state, records] = await Promise.all([
      window.aemeathSettings.memoryStatus(),
      window.aemeathSettings.listMemory(),
    ]);
    memoryState = state;
    renderMemoryStatus();
    renderMemoryList(records);
  }

  addMemory.addEventListener('click', () => {
    memoryNew.classList.remove('hidden');
    memoryNewText.value = '';
    memoryNewKind.value = 'context';
    memoryNewText.focus();
  });

  memoryNewCancel.addEventListener('click', () => memoryNew.classList.add('hidden'));

  memoryNewSave.addEventListener('click', async () => {
    const text = memoryNewText.value.trim();
    if (!text) {
      setMemoryNote('Tulis isi memorinya dulu.', 'error');
      return;
    }
    const result = await window.aemeathSettings.saveMemory({ text: text, kind: memoryNewKind.value });
    if (!result || !result.ok) {
      setMemoryNote((result && result.error) || 'Memori tidak bisa disimpan.', 'error');
      return;
    }
    memoryNew.classList.add('hidden');
    setMemoryNote('Memori tersimpan.', 'ok');
    await refreshMemory();
  });

  memoryEnabled.addEventListener('change', () => {
    window.aemeathSettings.setMemoryPolicy({ disabled: !memoryEnabled.checked });
    memoryRetention.disabled = !memoryEnabled.checked;
    setMemoryNote(
      memoryEnabled.checked
        ? 'Memori aktif lagi.'
        : 'Penyimpanan memori dimatikan. Tidak ada yang disimpan atau dikirim ke model.',
      'ok',
    );
  });

  memoryRetention.addEventListener('change', () => {
    window.aemeathSettings.setMemoryPolicy({ retentionDays: Number(memoryRetention.value) });
    setMemoryNote('Aturan retensi diperbarui.', 'ok');
  });

  clearMemory.addEventListener('click', async () => {
    if (!window.confirm('Hapus semua memori companion? Tindakan ini tidak bisa dibatalkan.')) return;
    const removed = await window.aemeathSettings.clearMemory();
    setMemoryNote(removed > 0 ? removed + ' memori dihapus.' : 'Tidak ada memori untuk dihapus.', 'ok');
    await refreshMemory();
  });

  if (typeof window.aemeathSettings.onMemoryUpdated === 'function') {
    window.aemeathSettings.onMemoryUpdated(() => refreshMemory());
  }

  // ---- Tabs ------------------------------------------------------------------
  const tabs = Array.from(document.querySelectorAll('.tab'));

  function selectTab(tab) {
    if (tab && tab.id === 'tab-appearance') {
      const tabGeneral = document.getElementById('tab-general');
      const panelGeneral = document.getElementById('panel-general');
      for (const other of tabs) {
        const isCurrent = other === tab;
        other.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
        other.tabIndex = isCurrent ? 0 : -1;
        const targetId = other.getAttribute('aria-controls');
        if (targetId && targetId !== 'theme-section') {
          const el = document.getElementById(targetId);
          if (el) el.classList.toggle('hidden', other !== tabGeneral);
        }
      }
      if (panelGeneral) {
        panelGeneral.classList.remove('hidden');
        const themeSection = document.getElementById('theme-section');
        if (themeSection) {
          themeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      return;
    }

    for (const other of tabs) {
      const on = other === tab;
      other.setAttribute('aria-selected', String(on));
      other.tabIndex = on ? 0 : -1;
      const targetId = other.getAttribute('aria-controls');
      if (targetId && targetId !== 'theme-section') {
        const targetPanel = document.getElementById(targetId);
        if (targetPanel) {
          targetPanel.classList.toggle('hidden', !on);
        }
      }
    }
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      const next = tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length];
      selectTab(next);
      next.focus();
    });
  }

  boot();
})();
