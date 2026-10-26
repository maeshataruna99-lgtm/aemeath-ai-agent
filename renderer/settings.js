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

  boot();
})();
