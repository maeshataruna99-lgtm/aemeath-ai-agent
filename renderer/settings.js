'use strict';

(function () {
  const chatter = document.getElementById('chatter');
  const interval = document.getElementById('interval');
  const value = document.getElementById('value');
  const range = document.getElementById('range');
  const intervalRow = interval.closest('.row');

  const provider = document.getElementById('provider');
  const model = document.getElementById('model');
  const apiKey = document.getElementById('apikey');
  const saveKey = document.getElementById('save-key');
  const clearKey = document.getElementById('clear-key');
  const keyStatus = document.getElementById('key-status');
  const terminal = document.getElementById('terminal');
  const webSearch = document.getElementById('websearch');
  const offline = document.getElementById('offline');
  const providerNames = [
    document.getElementById('provider-name'),
    document.getElementById('provider-name-2'),
  ];

  let status = null;

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
    chatter.checked = settings.chatterEnabled !== false;
    terminal.checked = settings.terminalEnabled !== false;
    startupToggle.checked = settings.startAtLogin !== false;
    refreshStartup();
    stillToggle.checked = settings.stayStill === true;
    shortcutSelect.value = typeof settings.chatShortcut === 'string' ? settings.chatShortcut : 'Alt+Space';
    fullScreenToggle.checked = settings.fullScreenCapture !== false;
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
    renderChat(await window.aemeathSettings.chatStatus());
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

  terminal.addEventListener('change', () => {
    window.aemeathSettings.set({ terminalEnabled: terminal.checked });
  });

  webSearch.addEventListener('change', () => {
    window.aemeathSettings.set({ chatWebSearch: webSearch.checked });
  });

  offline.addEventListener('change', () => {
    window.aemeathSettings.set({ chatOfflineFallback: offline.checked });
  });

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
    let text = '';
    let kind = '';
    if (!state) text = '';
    else if (!state.wanted) text = 'Tidak dijalankan otomatis.';
    else if (state.registered && state.willLaunch) {
      text = 'Terdaftar di startup Windows.';
      kind = 'ok';
    } else if (state.registered) {
      text = 'Terdaftar, tetapi Windows menonaktifkannya. Aktifkan lagi di Pengelola Tugas, tab Startup.';
      kind = 'error';
    } else {
      text = 'Belum terdaftar di Windows. Entri dibuat saat Aemeath dijalankan.';
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

  const shortcutSelect = document.getElementById('shortcut');
  shortcutSelect.addEventListener('change', () => {
    window.aemeathSettings.set({ chatShortcut: shortcutSelect.value });
  });

  // ---- Custom slash commands -------------------------------------------------
  const commandList = document.getElementById('command-list');
  const addCommand = document.getElementById('add-command');
  const commandStatus = document.getElementById('command-status');
  const presetSelect = document.getElementById('preset');
  const addPreset = document.getElementById('add-preset');
  let saveTimer = null;

  // Ready-made PowerShell commands. Whatever can shut the computer down asks first.
  const PRESETS = [
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

    const type = document.createElement('select');
    type.className = 'type';
    for (const [value, label] of [
      ['open', 'Buka program, folder, atau tautan'],
      ['workflow', 'Buka paket kerja (beberapa tujuan sekaligus)'],
      ['powershell', 'Jalankan perintah PowerShell'],
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

    const target = field('grow target', 'C:\\... atau https://...', command && command.target, 500);
    const pickFile = button('Berkas...');
    const pickFolder = button('Folder...');
    const args = field('grow args', 'Argumen (opsional, khusus program .exe)', command && command.args, 300);
    const workflowTargets = document.createElement('textarea');
    workflowTargets.className = 'grow workflow-targets';
    workflowTargets.rows = 3;
    workflowTargets.placeholder = 'Satu jalur lengkap atau tautan https:// per baris (minimal 2, maksimal 6)';
    workflowTargets.value =
      command && Array.isArray(command.targets) ? command.targets.join('\n') : '';
    const pickWfFile = button('+ Berkas...');
    const pickWfFolder = button('+ Folder...');
    const script = field('grow script', 'Perintah PowerShell, satu baris (mis. shutdown /s /t 60)', command && command.script, 500);
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
    for (const command of await window.aemeathSettings.getCommands()) addRow(command);
    commandStatus.textContent = commandList.children.length ? '' : 'Belum ada perintah.';
  }

  addCommand.addEventListener('click', () => addRow().querySelector('.name').focus());

  presetSelect.appendChild(new Option('Pilih contoh...', ''));
  PRESETS.forEach((preset, index) => presetSelect.appendChild(new Option(preset.label, String(index))));
  addPreset.addEventListener('click', () => {
    if (presetSelect.value === '') return;
    const entry = Object.assign({ type: 'powershell' }, PRESETS[Number(presetSelect.value)].entry);
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
  const fullOptions = document.getElementById('full-options');
  const fullScreenToggle = document.getElementById('full-screen-toggle');
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
    fullOptions.classList.toggle('hidden', activeMode !== 'full');
    clearInterval(activityTimer);
    activityTimer = null;
    if (watching) {
      refreshActivity();
      activityTimer = setInterval(refreshActivity, 3000);
    }
  }

  modeLow.addEventListener('change', () => {
    renderMode('low');
    window.aemeathSettings.set({ interactiveMode: 'low', fullConsent: false, fullAiReview: false });
  });

  // Medium reads the window in front, so it only turns on after an explicit yes.
  modeMedium.addEventListener('change', () => {
    renderMode(activeMode);
    consent.classList.remove('hidden');
  });
  acceptMedium.addEventListener('click', () => {
    renderMode('medium');
    window.aemeathSettings.set({ interactiveMode: 'medium', fullConsent: false, fullAiReview: false });
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
      fullScreenCapture: fullScreenToggle.checked,
    });
  });
  cancelFull.addEventListener('click', () => fullConsent.classList.add('hidden'));

  fullScreenToggle.addEventListener('change', () => {
    window.aemeathSettings.set({ fullScreenCapture: fullScreenToggle.checked });
  });

  doom.addEventListener('input', () => {
    doomValue.textContent = 'setelah ' + doom.value + ' menit';
  });
  doom.addEventListener('change', () => {
    window.aemeathSettings.set({ doomscrollLimitMin: Number(doom.value) });
  });

  // ---- Tabs ------------------------------------------------------------------
  const tabs = Array.from(document.querySelectorAll('.tab'));

  function selectTab(tab) {
    for (const other of tabs) {
      const on = other === tab;
      other.setAttribute('aria-selected', String(on));
      other.tabIndex = on ? 0 : -1;
      document.getElementById(other.getAttribute('aria-controls')).classList.toggle('hidden', !on);
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
  loadCommands();
})();
