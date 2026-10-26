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

  // ---- Custom slash commands -------------------------------------------------
  const commandList = document.getElementById('command-list');
  const addCommand = document.getElementById('add-command');
  const commandStatus = document.getElementById('command-status');
  let saveTimer = null;

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

  function addRow(command) {
    const row = document.createElement('div');
    row.className = 'cmd';

    const slash = document.createElement('span');
    slash.className = 'slash';
    slash.textContent = '/';
    const name = field('name', 'invoice', command && command.name, 24);
    const description = field('grow desc', 'Keterangan (opsional)', command && command.description, 60);
    const remove = button('\u2715', 'Hapus perintah');

    const target = field('grow target', 'C:\\... atau https://...', command && command.target, 500);
    const pickFile = button('Berkas...');
    const pickFolder = button('Folder...');
    const args = field('grow args', 'Argumen (opsional, khusus program .exe)', command && command.args, 300);
    const error = document.createElement('p');
    error.className = 'row-error';

    row.append(line(slash, name, description, remove), line(target, pickFile, pickFolder), line(args), error);
    commandList.appendChild(row);

    for (const input of [name, description, target, args]) input.addEventListener('input', scheduleSave);
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
    return row;
  }

  function collect() {
    return Array.from(commandList.children).map((row) => ({
      row: row,
      entry: {
        name: row.querySelector('.name').value,
        description: row.querySelector('.desc').value,
        target: row.querySelector('.target').value,
        args: row.querySelector('.args').value,
      },
    }));
  }

  async function saveCommands() {
    // A brand-new empty row is not an error yet.
    const rows = collect().filter(({ entry }) => entry.name.trim() || entry.target.trim());
    const result = await window.aemeathSettings.saveCommands(rows.map(({ entry }) => entry));
    for (const { row } of collect()) row.querySelector('.row-error').textContent = '';
    for (const problem of result.errors) {
      const owner = rows[problem.index];
      if (owner) owner.row.querySelector('.row-error').textContent = problem.message;
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

  boot();
  loadCommands();
})();
